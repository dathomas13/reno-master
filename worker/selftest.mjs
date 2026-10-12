/**
 * Prüft die Teile des Workers, die sich ohne Cloudflare prüfen lassen: die Signatur der
 * Anzeige-Adressen und die Pfad-Prüfung. Node 22 bringt dieselbe Web-Crypto mit, die auch
 * im Worker läuft.
 *
 *   node worker/selftest.mjs
 */
import worker, { sign, validSignature, validPath, verifyFirebaseToken } from './reno-files.js';

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? '  ok  ' : '  FEHLER  '} ${name}`);
  if (!ok) failed += 1;
}

const secret = 'geheim-und-lang-genug-für-hmac';
const path = 'photos/abc123.jpg';
const soon = Date.now() + 60_000;

const signature = await sign(path, soon, secret);
check('eine frisch signierte Adresse gilt', await validSignature(path, soon, signature, secret));
check('abgelaufen gilt nicht', !(await validSignature(path, Date.now() - 1000, signature, secret)));
check('anderer Pfad gilt nicht', !(await validSignature('photos/anders.jpg', soon, signature, secret)));
check('anderes Geheimnis gilt nicht', !(await validSignature(path, soon, signature, 'falsch')));
check('verfälschte Signatur gilt nicht', !(await validSignature(path, soon, signature.slice(0, -1) + '0', secret)));
check('leere Signatur gilt nicht', !(await validSignature(path, soon, '', secret)));
check('gleiche Eingabe, gleiche Signatur', (await sign(path, soon, secret)) === signature);

check('normaler Pfad ist erlaubt', validPath('photos/abc.jpg'));
check('Unterordner sind erlaubt', validPath('receipts/kosten-1/beleg.pdf'));
check('".." wird abgelehnt', !validPath('photos/../../etc/passwd'));
check('führender Schrägstrich wird abgelehnt', !validPath('/photos/abc.jpg'));
check('doppelter Schrägstrich wird abgelehnt', !validPath('photos//abc.jpg'));
check('leerer Pfad wird abgelehnt', !validPath(''));
check('Leerzeichen werden abgelehnt', !validPath('photos/mein bild.jpg'));
check('sehr lange Pfade werden abgelehnt', !validPath('a/'.repeat(120) + 'x.jpg'));

check('Unsinn ist kein Anmeldeticket', (await verifyFirebaseToken('kein.token', 'projekt')) === null);
check('leeres Anmeldeticket', (await verifyFirebaseToken('', 'projekt')) === null);
// ein selbst gebautes Ticket mit alg:none darf nicht durchgehen
const none = [
  Buffer.from(JSON.stringify({ alg: 'none', kid: 'x' })).toString('base64url'),
  Buffer.from(JSON.stringify({ aud: 'projekt', email: 'wer@auch.immer' })).toString('base64url'),
  '',
].join('.');
check('"alg: none" wird abgelehnt', (await verifyFirebaseToken(none, 'projekt')) === null);

// Geräteprotokolle: nur mit DIAG_TOKEN, nur unter diag/
const stored = { 'diag/app-abc123.json': '{"lines":["x"]}', 'photos/geheim.jpg': 'bild' };
const bucket = {
  async list({ prefix }) {
    return {
      objects: Object.keys(stored)
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, size: stored[key].length, uploaded: new Date(0) })),
    };
  },
  async get(key) {
    return key in stored ? { body: stored[key] } : null;
  },
};
const diagEnv = { BUCKET: bucket, DIAG_TOKEN: 'diag-token-lang-genug-1234' };
const diag = (path, token, env = diagEnv) =>
  worker.fetch(
    new Request(`https://w.example${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }),
    env,
  );

check('Protokolle ohne Token: 401', (await diag('/diag', '')).status === 401);
check('Protokolle mit falschem Token: 401', (await diag('/diag', 'diag-token-lang-genug-1235')).status === 401);
check('ohne DIAG_TOKEN ist die Route zu', (await diag('/diag', 'x', { BUCKET: bucket })).status === 404);
const listing = await (await diag('/diag', diagEnv.DIAG_TOKEN)).json();
check('Liste nennt nur Geräte aus diag/', listing.devices.length === 1 && listing.devices[0].device === 'app-abc123');
check('ein Protokoll lässt sich lesen', (await (await diag('/diag/app-abc123', diagEnv.DIAG_TOKEN)).text()) === stored['diag/app-abc123.json']);
check('kein Ausbruch aus diag/', (await diag('/diag/..%2Fphotos%2Fgeheim', diagEnv.DIAG_TOKEN)).status === 400);


// ---------------------------------------------------------------- API gegen ein nachgebautes Firestore
//
// Google und Firestore sind hier ein Speicher im Arbeitsspeicher hinter einem
// ausgetauschten fetch: so läuft der ganze Weg (Dienstkonto-Ticket, Token-Prüfung, Schreiben,
// Abfragen, MCP), ohne dass ein Netz da sein muss.
const { generateKeyPairSync } = await import('node:crypto');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const apiEnv = {
  FIREBASE_PROJECT: 'proj',
  ALLOWED_EMAILS: 'thomas@example.de, sarah@example.de',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
    client_email: 'sa@proj.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }),
};
const docs = new Map(); // 'costs/abc' → { fields, updateTime }
let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 12, 10, 0, clock++)).toISOString();
const PREFIX = '/v1/projects/proj/databases/(default)/documents';

function splitPath(path) {
  return path.match(/`[^`]*`|[^.]+/g).map((part) => part.replace(/^`|`$/g, ''));
}
function setPath(fields, parts, value) {
  const [head, ...rest] = parts;
  if (!rest.length) {
    if (value === undefined) delete fields[head];
    else fields[head] = value;
    return;
  }
  const next = fields[head]?.mapValue ?? { fields: {} };
  next.fields ??= {};
  fields[head] = { mapValue: next };
  setPath(next.fields, rest, value);
}
function getPath(fields, parts) {
  let value = { mapValue: { fields } };
  for (const part of parts) value = value?.mapValue?.fields?.[part];
  return value;
}
const failure = (status, code) => new Response(JSON.stringify({ error: { status: code, message: code } }), { status });
const plain = (value) => (value ? Object.values(value)[0] : undefined);

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.host === 'oauth2.googleapis.com') {
    const assertion = new URLSearchParams(String(init.body)).get('assertion') ?? '';
    return Response.json(assertion.split('.').length === 3 ? { access_token: 'ya29.test', expires_in: 3600 } : {}, { status: assertion ? 200 : 400 });
  }
  if (init.headers?.authorization !== 'Bearer ya29.test') return failure(401, 'UNAUTHENTICATED');
  const path = decodeURIComponent(url.pathname).slice(PREFIX.length);
  if (init.method === 'GET') {
    const doc = docs.get(path.slice(1));
    return doc ? Response.json({ name: `x${path}`, fields: doc.fields, updateTime: doc.updateTime }) : failure(404, 'NOT_FOUND');
  }
  const body = JSON.parse(init.body);
  if (path === ':commit') {
    for (const write of body.writes) {
      const key = (write.update?.name ?? write.delete).split('/documents/')[1];
      const current = docs.get(key);
      const pre = write.currentDocument ?? {};
      if (pre.exists === false && current) return failure(409, 'ALREADY_EXISTS');
      if (pre.exists === true && !current) return failure(404, 'NOT_FOUND');
      if (pre.updateTime && pre.updateTime !== current?.updateTime) return failure(400, 'FAILED_PRECONDITION');
      if (write.delete) {
        docs.delete(key);
        continue;
      }
      let fields = structuredClone(write.update.fields);
      if (write.updateMask) {
        fields = structuredClone(current?.fields ?? {});
        for (const p of write.updateMask.fieldPaths) setPath(fields, splitPath(p), getPath(write.update.fields, splitPath(p)));
      }
      const time = stamp();
      for (const t of write.updateTransforms ?? []) fields[t.fieldPath] = { timestampValue: time };
      docs.set(key, { fields, updateTime: time });
    }
    return Response.json({ writeResults: [] });
  }
  if (path === ':runQuery') {
    const q = body.structuredQuery;
    const col = q.from[0].collectionId;
    let rows = [...docs.entries()].filter(([key]) => key.split('/')[0] === col && key.split('/').length === 2);
    const filter = q.where?.fieldFilter;
    if (filter) {
      const want = plain(filter.value);
      rows = rows.filter(([, d]) => {
        const have = plain(d.fields[filter.field.fieldPath]);
        return filter.op === 'EQUAL' ? have === want : have >= want;
      });
    }
    for (const order of q.orderBy ?? []) {
      const f = order.field.fieldPath;
      rows.sort(([, a], [, b]) => String(plain(a.fields[f])).localeCompare(String(plain(b.fields[f]))) * (order.direction === 'DESCENDING' ? -1 : 1));
    }
    rows = rows.slice(0, q.limit ?? rows.length);
    return Response.json(rows.length ? rows.map(([key, d]) => ({ document: { name: `x/documents/${key}`, fields: d.fields, updateTime: d.updateTime } })) : [{ readTime: 'x' }]);
  }
  return failure(400, 'INVALID_ARGUMENT');
};

const { encodeFields, decodeFields, sha256Hex, buildRecord, normalizeOptions, parseAmount, berlinDate, mergeDiaryEntry, tokenProblem, fold, planningRooms } =
  await import('./reno-files.js');

const fullToken = `reno_${'A'.repeat(20)}${'b'.repeat(23)}`;
const readOnly = `reno_${'R'.repeat(43)}`;
const strangers = `reno_${'S'.repeat(43)}`;
const put = (key, value) => docs.set(key, { fields: encodeFields(value), updateTime: stamp() });
put('meta/api-tokens', {
  tokens: {
    t1: { name: 'Claude', hash: await sha256Hex(fullToken), scopes: ['costs', 'tasks', 'diary', 'notes', 'contacts', 'read'], createdBy: 'Thomas@example.de', createdAt: '2026-10-01T10:00:00Z' },
    t2: { name: 'nur lesen', hash: await sha256Hex(readOnly), scopes: ['read'], createdBy: 'sarah@example.de', createdAt: '2026-10-01T10:00:00Z' },
    t3: { name: 'fremd', hash: await sha256Hex(strangers), scopes: ['costs'], createdBy: 'wer@anders.de', createdAt: '2026-10-01T10:00:00Z' },
    t5: { name: 'nur Kosten', hash: await sha256Hex(`reno_${'K'.repeat(43)}`), scopes: ['costs'], createdBy: 'sarah@example.de' },
    t4: { name: 'alt', hash: await sha256Hex(`reno_${'E'.repeat(43)}`), scopes: ['costs'], createdBy: 'thomas@example.de', expiresAt: '2026-01-01T00:00:00Z' },
  },
});
put('meta/options', { costCategories: [{ id: 'verpflegung-helfer', label: 'Verpflegung' }, { id: 'werkzeug', label: 'Werkzeug' }, { id: 'alt', label: 'Alt', archived: true }] });
put('trades/tr1', { id: 'tr1', name: 'Elektrik komplett', status: 'noch-offen', priority: 'hoch' });
put('trades/tr2', { id: 'tr2', name: 'Sanitär / Wasser / Abwasser', status: 'noch-offen', priority: 'mittel' });
put('phases/ph1', { id: 'ph1', name: 'Phase 2: Entkernung & Rückbau', status: 'in-arbeit', order: 2 });
put('meta/model-soll', { version: '0.1', rooms: JSON.stringify({ rooms: [{ id: 'bad-og', name: 'Bad', floor: 'OG', rects: [] }, { id: 'flur-eg', name: 'Flur', floor: 'EG', rects: [] }, { id: 'flur-og', name: 'Flur', floor: 'OG', rects: [] }, { id: 'technik', name: 'Technikraum', floor: 'KG', rects: [] }] }) });
put('contacts/c1', { id: 'c1', name: 'Max Müller', company: 'Elektro Müller GmbH', roles: ['elektriker'], tradeIds: ['tr1'] });
put('contacts/c2', { id: 'c2', name: 'Petra Schmidt', company: 'Fliesen Schmidt', roles: ['fliesenleger'], tradeIds: [] });
put('costs/appcost1', { id: 'appcost1', date: '2026-09-01', vendor: 'Elektro Müller GmbH', description: 'Abschlag Elektrik', amountGross: 1000, category: 'werkzeug', tradeId: 'tr1', roomIds: [], paymentStatus: 'offen', receiptPhotoIds: ['foto1'] });
put('costs/appcost2', { id: 'appcost2', date: '2026-09-02', vendor: '', description: '', amountGross: 50, category: '', roomIds: [], paymentStatus: 'offen', receiptPhotoIds: [] });
put('notes/appnote1', { id: 'appnote1', text: 'Estrich braucht vier Wochen', at: '2026-09-20T10:00:00', roomIds: [], pinned: false });
put('tasks/old1', { id: 'old1', title: 'aus der App', status: 'offen', priority: 'mittel', assignees: [], roomIds: [], reminderAt: '2026-10-13T08:00:00' });

const call = async (method, path, token, body) => {
  const response = await worker.fetch(
    new Request(`https://w.example${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    apiEnv,
    { waitUntil: () => undefined },
  );
  const isJson = (response.headers.get('content-type') ?? '').includes('json');
  return { status: response.status, body: isJson ? await response.json() : await response.text() };
};

check('API ohne Token: 401', (await call('GET', '/api/v1', '')).status === 401);
check('API mit unbekanntem Token: 401', (await call('GET', '/api/v1', `reno_${'x'.repeat(43)}`)).status === 401);
check('abgelaufenes Token: 401', (await call('GET', '/api/v1', `reno_${'E'.repeat(43)}`)).status === 401);
check('Token eines nicht freigeschalteten Besitzers: 401', (await call('GET', '/api/v1', strangers)).status === 401);
const me = await call('GET', '/api/v1', fullToken);
check('Selbstauskunft nennt Name und Besitzer', me.status === 200 && me.body.token.name === 'Claude' && me.body.token.owner === 'thomas@example.de');
check('lastUsedAt wird vermerkt', typeof decodeFields(docs.get('meta/api-tokens').fields).tokens.t1.lastUsedAt === 'string');
check('der Hash bleibt beim Vermerk erhalten', decodeFields(docs.get('meta/api-tokens').fields).tokens.t1.hash === (await sha256Hex(fullToken)));

const catalog = await call('GET', '/api/v1/catalog', readOnly);
check('Katalog: eigene Kategorien aus meta/options', catalog.body.options.costCategories.map((e) => e.label).join() === 'Verpflegung,Werkzeug');
check('Katalog: Startwerte, wo meta/options nichts sagt', catalog.body.options.people[0].id === 'thomas');
check('Katalog: Gewerke und Phasen', catalog.body.trades.length === 2 && catalog.body.phases[0].id === 'ph1');

const cost = await call('POST', '/api/v1/costs', fullToken, { amountGross: '23,50 €', vendor: 'Edeka', description: 'Brötchen für die Helfer', category: 'Verpflegung', paidBy: 'Thomas', trade: 'Elektrik' });
check('Kosten anlegen: 201', cost.status === 201 && cost.body.created === true);
const storedCost = decodeFields(docs.get(`costs/${cost.body.id}`).fields);
check('Kosten: Betrag als Zahl', storedCost.amountGross === 23.5);
check('Kosten: Kategorie als Kennung, nicht als Name', storedCost.category === 'verpflegung-helfer');
check('Kosten: bezahlt von als Kennung', storedCost.paidBy === 'thomas');
check('Kosten: Gewerk über eindeutigen Namensteil', storedCost.tradeId === 'tr1');
check('Kosten: Standard bezahlt', storedCost.paymentStatus === 'bezahlt');
check('Kosten: Besitzer als Bearbeiter, Herkunft vermerkt', storedCost.createdBy === 'thomas@example.de' && storedCost.createdVia === 'api:t1');
check('Kosten: Zeitstempel vom Server', typeof storedCost.createdAt === 'string' && typeof storedCost.updatedAt === 'string');
check('Kosten: Link in die App', cost.body.link === `https://dathomas13.github.io/reno-master/#/kosten/${cost.body.id}`);

const unknown = await call('POST', '/api/v1/costs', fullToken, { amountGross: 5, vendor: 'x', category: 'Luxus' });
check('unbekannte Kategorie: 400 mit den möglichen Werten', unknown.status === 400 && unknown.body.error.includes('Verpflegung, Werkzeug'));
check('ausgeblendete Kategorie wird nicht angeboten', !unknown.body.error.includes('Alt'));
check('ohne Betrag: 400', (await call('POST', '/api/v1/costs', fullToken, { vendor: 'x' })).status === 400);
check('Lese-Token darf nicht schreiben: 403', (await call('POST', '/api/v1/costs', readOnly, { amountGross: 5, vendor: 'x' })).status === 403);

const again = await call('POST', '/api/v1/costs', fullToken, { id: 'wiederholung1', amountGross: 5, vendor: 'Bauhaus' });
const twice = await call('POST', '/api/v1/costs', fullToken, { id: 'wiederholung1', amountGross: 5, vendor: 'Bauhaus' });
check('gleiche id zweimal: kein zweiter Datensatz', again.body.created === true && twice.body.created === false && twice.body.duplicate === true);

const task = await call('POST', '/api/v1/tasks', fullToken, { title: 'Steckdosen bestellen', assignees: ['Thomas', 'sarah'], priority: 'Hoch', due: '2026-10-20' });
const storedTask = decodeFields(docs.get(`tasks/${task.body.id}`).fields);
check('Aufgabe: Personen und Priorität als Kennung', storedTask.assignees.join() === 'thomas,sarah' && storedTask.priority === 'hoch' && storedTask.status === 'offen');
check('Aufgabe: falsches Datum: 400', (await call('POST', '/api/v1/tasks', fullToken, { title: 'x', due: '2026-02-30' })).status === 400);
const open = await call('GET', '/api/v1/tasks', readOnly);
check('offene Aufgaben lesen', open.body.entries.length === 2 && open.body.entries[0].id === task.body.id);
check('Katalog: Räume der Planung', catalog.body.rooms.map((r) => r.name).join() === 'Bad,Flur (EG),Flur (OG),Technikraum');
const done = await call('POST', '/api/v1/tasks/old1/done', fullToken);
const storedDone = decodeFields(docs.get('tasks/old1').fields);
check('Aufgabe abhaken: Status, doneAt, Erinnerung entfernt', done.status === 200 && storedDone.status === 'erledigt' && storedDone.doneAt && !('reminderAt' in storedDone));
check('unbekannte Aufgabe abhaken: 404', (await call('POST', '/api/v1/tasks/gibtesnicht1/done', fullToken)).status === 404);

const first = await call('POST', '/api/v1/diary', fullToken, { date: '2026-10-12', text: 'Schlitze gestemmt.', present: ['Thomas'], trades: ['Elektrik'] });
check('Tagebuch: neuer Eintrag mit Standardtitel', first.body.created === true && decodeFields(docs.get(`diary/${first.body.id}`).fields).title === 'Tagebuch 12.10.');
const second = await call('POST', '/api/v1/diary', fullToken, { date: '2026-10-12', text: 'Leitungen gezogen.', present: ['Wolfgang'], defects: true });
const merged = decodeFields(docs.get(`diary/${first.body.id}`).fields);
check('Tagebuch: zweiter Text am selben Tag wird angehängt', second.body.appended === true && second.body.id === first.body.id);
check('Tagebuch: Text, Anwesende und Mängel zusammengeführt', merged.text === 'Schlitze gestemmt.\n\nLeitungen gezogen.' && merged.present.join() === 'thomas,wolfgang' && merged.defects === true && merged.tradeIds.join() === 'tr1');
const separate = await call('POST', '/api/v1/diary', fullToken, { date: '2026-10-12', text: 'Extra.', newEntry: true });
check('Tagebuch: newEntry legt einen eigenen an', separate.body.created === true && separate.body.id !== first.body.id);

const note = await call('POST', '/api/v1/notes', fullToken, { text: 'Fliesenkleber reicht nicht' });
check('Notiz anlegen', note.status === 201 && decodeFields(docs.get(`notes/${note.body.id}`).fields).pinned === false);

const recent = await call('GET', '/api/v1/costs?since=2026-01-01', readOnly);
check('Kosten lesen', recent.status === 200 && recent.body.entries.length === 4 && !('updatedAt' in recent.body.entries[0]));
check('lesen ohne Leserecht: 403', (await call('GET', '/api/v1/costs', `reno_${'K'.repeat(43)}`)).status === 403);

check('API-Eintrag löschen', (await call('DELETE', `/api/v1/costs/${cost.body.id}`, fullToken)).status === 200 && !docs.has(`costs/${cost.body.id}`));
check('Eintrag aus der App lässt sich nicht löschen: 403', (await call('DELETE', '/api/v1/tasks/old1', fullToken)).status === 403 && docs.has('tasks/old1'));

// MCP
const rpc = (token, message, path = '/mcp') => call('POST', path, token, message);
const init = await rpc(fullToken, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
check('MCP initialize', init.body.result.protocolVersion === '2025-06-18' && init.body.result.capabilities.tools);
check('MCP Benachrichtigung: 202 ohne Antwort', (await rpc(fullToken, { jsonrpc: '2.0', method: 'notifications/initialized' })).status === 202);
const tools = await rpc(fullToken, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
check('MCP: alle Werkzeuge für das volle Token', tools.body.result.tools.length === 13);
const readTools = await rpc(readOnly, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
check('MCP: Lese-Token sieht nur Katalog und Lesen', readTools.body.result.tools.map((t) => t.name).join() === 'get_catalog,list_entries,search,summarize_costs');
const viaPath = await rpc('', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_cost', arguments: { amountGross: 12.4, vendor: 'Hornbach', description: 'Schrauben', category: 'werkzeug' } } }, `/mcp/${fullToken}`);
const created = JSON.parse(viaPath.body.result.content[0].text);
check('MCP mit Token im Pfad: Kosten angelegt', !viaPath.body.result.isError && decodeFields(docs.get(`costs/${created.id}`).fields).amountGross === 12.4);
const bad = await rpc(fullToken, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'create_task', arguments: {} } });
check('MCP: Prüffehler als isError mit Grund', bad.body.result.isError === true && bad.body.result.content[0].text.includes('title'));
check('MCP ohne Token: 401', (await rpc('', { jsonrpc: '2.0', id: 6, method: 'ping' })).status === 401);
check('MCP GET: 405', (await call('GET', `/mcp/${fullToken}`, '')).status === 405);


// Ändern, Räume, Kontakte, Gespräche, Auswertung, Suche
const own = await call('POST', '/api/v1/costs', fullToken, { amountGross: 12, vendor: 'Hornbach', description: 'Schrauben', category: 'Werkzeug', rooms: ['Bad'], vatRate: 19 });
const ownDoc = () => decodeFields(docs.get(`costs/${own.body.id}`).fields);
check('Raum über den Planungsnamen', ownDoc().roomIds.join() === 'bad-og');
check('mehrdeutiger Raumname: 400 mit beiden', await call('POST', '/api/v1/notes', fullToken, { text: 'x', rooms: ['Flur'] }).then((r) => r.status === 400 && r.body.error.includes('Flur (EG)') && r.body.error.includes('Flur (OG)')));
check('Raum mit Geschoss', await call('POST', '/api/v1/notes', fullToken, { text: 'x', rooms: ['Flur OG'] }).then((r) => decodeFields(docs.get(`notes/${r.body.id}`).fields).roomIds.join() === 'flur-og'));
const fixed = await call('PATCH', `/api/v1/costs/${own.body.id}`, fullToken, { amountGross: 15, paidBy: 'Sarah' });
check('eigene Kosten ändern: Betrag, Netto folgt', fixed.status === 200 && ownDoc().amountGross === 15 && ownDoc().amountNet === 12.61 && ownDoc().vatAmount === 2.39 && ownDoc().paidBy === 'sarah');
check('Ändern lässt die übrigen Felder stehen', ownDoc().vendor === 'Hornbach' && ownDoc().roomIds.join() === 'bad-og' && ownDoc().createdVia === 'api:t1');
check('null leert ein Feld', (await call('PATCH', `/api/v1/costs/${own.body.id}`, fullToken, { paidBy: null, rooms: null })).status === 200 && !('paidBy' in ownDoc()) && ownDoc().roomIds.length === 0);
check('Pflichtfeld lässt sich nicht leeren', (await call('PATCH', `/api/v1/costs/${own.body.id}`, fullToken, { amountGross: null })).status === 400);
check('ohne Satz fallen Netto und MwSt. weg', (await call('PATCH', `/api/v1/costs/${own.body.id}`, fullToken, { vatRate: null })).status === 200 && !('amountNet' in ownDoc()) && !('vatAmount' in ownDoc()));
const appDoc = () => decodeFields(docs.get('costs/appcost1').fields);
check('Rechnung aus der App als bezahlt markieren', (await call('PATCH', '/api/v1/costs/appcost1', fullToken, { paymentStatus: 'Bezahlt' })).status === 200 && appDoc().paymentStatus === 'bezahlt');
const denied = await call('PATCH', '/api/v1/costs/appcost1', fullToken, { amountGross: 1 });
check('Betrag einer App-Rechnung: 403 mit den erlaubten Feldern', denied.status === 403 && denied.body.error.includes('paymentStatus') && appDoc().amountGross === 1000);
check('appendText an App-Rechnung hängt an die Notizen', (await call('PATCH', '/api/v1/costs/appcost1', fullToken, { appendText: 'Restbetrag nach Abnahme' })).status === 200 && appDoc().notes === 'Restbetrag nach Abnahme');
check('alte Rechnung ohne Händler lässt sich trotzdem bezahlen', (await call('PATCH', '/api/v1/costs/appcost2', fullToken, { paymentStatus: 'bezahlt' })).status === 200);
check('eigene Kosten: Händler und Beschreibung nicht beide leeren', (await call('PATCH', `/api/v1/costs/${own.body.id}`, fullToken, { vendor: null, description: null })).status === 400);
check('Belegfotos bleiben beim Ändern', appDoc().receiptPhotoIds.join() === 'foto1');
check('appendText an eine App-Notiz', (await call('PATCH', '/api/v1/notes/appnote1', fullToken, { appendText: 'Heizen erst danach.' })).status === 200 && decodeFields(docs.get('notes/appnote1').fields).text === 'Estrich braucht vier Wochen\n\nHeizen erst danach.');
check('Text einer App-Notiz ersetzen: 403', (await call('PATCH', '/api/v1/notes/appnote1', fullToken, { text: 'weg' })).status === 403);
const moved = await call('PATCH', `/api/v1/tasks/${task.body.id}`, fullToken, { due: '2026-11-01', assignees: ['Sarah'], status: 'Erledigt' });
const movedDoc = decodeFields(docs.get(`tasks/${task.body.id}`).fields);
check('Aufgabe ändern: Fälligkeit, Zuständige, erledigt mit doneAt', moved.status === 200 && movedDoc.due === '2026-11-01' && movedDoc.assignees.join() === 'sarah' && typeof movedDoc.doneAt === 'string');
check('wieder offen nimmt doneAt weg', (await call('PATCH', `/api/v1/tasks/${task.body.id}`, fullToken, { status: 'offen' })).status === 200 && !('doneAt' in decodeFields(docs.get(`tasks/${task.body.id}`).fields)));
check('Aufgabe aus der App verschieben', (await call('PATCH', '/api/v1/tasks/old1', fullToken, { due: '2026-12-24' })).status === 200 && decodeFields(docs.get('tasks/old1').fields).due === '2026-12-24');
check('Titel einer App-Aufgabe: 403', (await call('PATCH', '/api/v1/tasks/old1', fullToken, { title: 'neu' })).status === 403);
check('unbekanntes Feld beim Ändern: 400', (await call('PATCH', `/api/v1/tasks/${task.body.id}`, fullToken, { farbe: 'rot' })).status === 400);
check('nichts zu ändern: 400', (await call('PATCH', `/api/v1/tasks/${task.body.id}`, fullToken, {})).status === 400);
check('Ändern ohne Schreibrecht: 403', (await call('PATCH', '/api/v1/costs/appcost1', readOnly, { paymentStatus: 'offen' })).status === 403);

const person = await call('POST', '/api/v1/contacts', fullToken, { name: 'Jan Dach', company: 'Dachbau Jan', roles: ['Dachdecker'], phone: '0171 123' });
check('Kontakt anlegen mit Rolle als Kennung', person.status === 201 && decodeFields(docs.get(`contacts/${person.body.id}`).fields).roles.join() === 'dachdecker');
const call1 = await call('POST', '/api/v1/contactLogs', fullToken, { contact: 'Müller', text: 'Kommt Donnerstag zum Aufmaß.', channel: 'Anruf', participants: ['Thomas'], at: '2026-10-12T09:30' });
const callDoc = decodeFields(docs.get(`contactLogs/${call1.body.id}`).fields);
check('Gespräch über Firmenteil dem Kontakt zugeordnet', call1.status === 201 && callDoc.contactId === 'c1' && callDoc.channel === 'anruf' && callDoc.at === '2026-10-12T09:30:00');
check('Gespräch: Link ins Protokoll', call1.body.link.endsWith(`#/gespraeche?eintrag=${call1.body.id}`));
const nobody = await call('POST', '/api/v1/contactLogs', fullToken, { contact: 'Unbekannt', text: 'x' });
check('unbekannter Kontakt: Hinweis auf create_contact', nobody.status === 400 && nobody.body.error.includes('create_contact'));
check('Gespräch ohne Kontakt', await call('POST', '/api/v1/contactLogs', fullToken, { text: 'Nachbar gefragt' }).then((r) => decodeFields(docs.get(`contactLogs/${r.body.id}`).fields).contactId === ''));
check('Kontakte suchen', (await call('GET', '/api/v1/contacts?query=fliesen', readOnly)).body.entries.map((c) => c.id).join() === 'c2');
check('Gespräche eines Kontakts', (await call('GET', '/api/v1/contactLogs?contact=c1', readOnly)).body.entries.length === 1);
check('Kontakt aus der App: Telefon ja, Name nein', (await call('PATCH', '/api/v1/contacts/c2', fullToken, { phone: '0160 9' })).status === 200 && (await call('PATCH', '/api/v1/contacts/c2', fullToken, { name: 'x' })).status === 403);
check('ohne Kontaktrecht kein Gespräch: 403', (await call('POST', '/api/v1/contactLogs', `reno_${'K'.repeat(43)}`, { text: 'x' })).status === 403);

const summary = await call('GET', '/api/v1/costs/summary?groupBy=trade', readOnly);
const elektrik = summary.body.groups?.find((g) => g.key === 'tr1');
check('Auswertung nach Gewerk', summary.status === 200 && elektrik?.total === 1000 && elektrik.label === 'Elektrik komplett');
check('Auswertung: offene Summe', summary.body.unpaid.count === 0 && summary.body.count === docs.size - [...docs.keys()].filter((k) => !k.startsWith('costs/')).length);
const october = await call('GET', '/api/v1/costs/summary?groupBy=category&from=2026-10-01', readOnly);
check('Auswertung ab Datum ohne die Septemberrechnung', october.body.count > 0 && !october.body.groups.some((g) => g.total >= 1000));
check('Auswertung nach Monat chronologisch', (await call('GET', '/api/v1/costs/summary?groupBy=month', readOnly)).body.groups.map((g) => g.key).join() === '2026-09,2026-10');
check('unbekannte Gruppierung: 400', (await call('GET', '/api/v1/costs/summary?groupBy=farbe', readOnly)).status === 400);

const found = await call('GET', '/api/v1/search?q=estrich', readOnly);
check('Suche findet die App-Notiz', found.status === 200 && found.body.hits.some((h) => h.id === 'appnote1' && h.snippet.includes('Estrich')));
const byName = await call('GET', '/api/v1/search?q=mueller%20aufmass', readOnly);
check('Suche findet ein Gespräch über den Kontaktnamen', byName.body.hits.length === 1 && byName.body.hits[0].collection === 'contactLogs');
check('Suche ohne Leserecht: 403', (await call('GET', '/api/v1/search?q=x', `reno_${'K'.repeat(43)}`)).status === 403);
const mcpUpdate = await rpc(fullToken, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'update_entry', arguments: { collection: 'notes', id: 'appnote1', appendText: 'Und lüften.' } } });
check('MCP update_entry mit appendText', !mcpUpdate.body.result.isError && decodeFields(docs.get('notes/appnote1').fields).text.endsWith('Und lüften.'));
const mcpSum = await rpc(readOnly, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'summarize_costs', arguments: { groupBy: 'paidBy' } } });
check('MCP summarize_costs', !mcpSum.body.result.isError && JSON.parse(mcpSum.body.result.content[0].text).groups.length > 0);

// reine Helfer
check('Betrag "1.234,56" wird 1234.56', parseAmount('1.234,56', 'x') === 1234.56);
check('Betrag 0 wird abgelehnt', (() => { try { parseAmount(0, 'x'); return false; } catch { return true; } })());
check('heute in Berlin, auch kurz nach Mitternacht', berlinDate(new Date('2026-10-11T22:30:00Z')) === '2026-10-12');
const bare = { options: normalizeOptions(null), trades: [], phases: [], rooms: [], contacts: [] };
check('MwSt. wird aufgeteilt', (() => { const c = buildRecord('costs', { amountGross: 119, vendor: 'x', vatRate: 19 }, bare); return c.amountNet === 100 && c.vatAmount === 19; })());
check('unbekanntes Feld wird abgelehnt', (() => { try { buildRecord('tasks', { title: 'x', farbe: 'rot' }, bare); return false; } catch (e) { return e.message.includes('farbe'); } })());
check('Suche faltet Umlaute und Schreibweisen', fold('Gartentür Straße 1.234,56') === fold('gartentuer strasse 123456'));
check('gleiche Raumnamen bekommen das Geschoss', planningRooms(JSON.stringify({ rooms: [{ id: 'a', name: 'Flur', floor: 'EG' }, { id: 'b', name: 'Flur', floor: 'OG' }, { id: 'c', name: 'Bad', floor: 'OG' }] })).map((r) => r.name).join() === 'Flur (EG),Flur (OG),Bad');
check('kaputte Raumliste ergibt keine Räume', planningRooms('{kaputt').length === 0);
check('Anhängen an leeren Eintrag', mergeDiaryEntry({ text: '' }, { text: 'a', present: [], tradeIds: [], defects: false }).text === 'a');
check('Token ohne Ablauf und mit Besitzer gilt', tokenProblem({ hash: 'x', createdBy: 'a@b.de' }, ['a@b.de']) === null);

console.log(failed === 0 ? '\nalles in Ordnung' : `\n${failed} Fehler`);
process.exit(failed ? 1 : 0);
