/**
 * Reno Master – Dateispeicher auf Cloudflare R2.
 *
 * Eine einzige Datei, die sich im Cloudflare-Dashboard einfügen lässt (Workers & Pages →
 * Worker erstellen → Code bearbeiten). Es braucht keine Kommandozeile und keinen
 * Build-Schritt.
 *
 * Warum überhaupt ein Worker: R2 kennt die Firebase-Anmeldung nicht. Der Worker prüft das
 * Anmelde-Ticket, das die App von Firebase bekommt, und lässt nur die beiden erlaubten
 * Adressen durch. Der Bucket selbst bleibt zu; niemand kommt ohne Worker an die Dateien.
 *
 * Routen:
 *   PUT    /files/<pfad>   Datei ablegen        (Kopfzeile: Authorization: Bearer <Ticket>)
 *   DELETE /files/<pfad>   Datei löschen        (dito)
 *   POST   /link           { path } → { url }   (dito) – kurzlebige Adresse zum Anzeigen
 *   GET    /files/<pfad>?exp=…&sig=…            – die Adresse aus /link, ohne Anmeldung
 *   GET    /diag            Liste der Geräteprotokolle   (Kopfzeile: Authorization: Bearer <DIAG_TOKEN>)
 *   GET    /diag/<gerät>    ein Geräteprotokoll          (dito)
 *   …      /api/v1/…        Kosten, Aufgaben, Tagebuch, Notizen von außen (Authorization: Bearer <API-Token>)
 *   POST   /mcp, /mcp/<API-Token>   dasselbe als MCP-Server für Claude
 *
 * Die API ist weiter unten beschrieben (Abschnitt „API“) und in worker/README.md.
 *
 * Die Protokolle legt die App selbst über PUT /files/diag/<gerät>.json ab
 * (src/platform/diagUpload.ts). Gelesen werden sie nicht von der App, sondern aus einer
 * Entwicklungssitzung heraus (tools/diag/read_log.py) – deshalb ein eigenes Token statt
 * der Firebase-Anmeldung, die es dort nicht gibt. Ohne DIAG_TOKEN ist die Route zu.
 *
 * Die Anzeige-Adresse trägt eine Signatur und ein Ablaufdatum. Ein <img>-Element kann
 * keine Kopfzeilen mitschicken, deshalb dieser Umweg: die Adresse selbst ist der Nachweis,
 * und sie ist nach einer Stunde wertlos.
 *
 * Einrichtung im Dashboard:
 *   Einstellungen → Variablen
 *     ALLOWED_EMAILS   die beiden Adressen, mit Komma getrennt, klein geschrieben
 *     FIREBASE_PROJECT reno-master-307f7
 *     SIGNING_KEY      (als Secret!) eine lange Zufallszeichenkette
 *     DIAG_TOKEN       (als Secret!, freiwillig) eine zweite lange Zufallszeichenkette,
 *                      nur zum Lesen der Geräteprotokolle
 *     FIREBASE_SERVICE_ACCOUNT  (als Secret!, nur für die API) das Dienstkonto-JSON aus der
 *                      Firebase-Konsole; ohne ist /api und /mcp zu
 *     APP_URL          (freiwillig) Adresse der App für Links in API-Antworten
 *   Einstellungen → Bindings → R2-Bucket
 *     Variablenname BUCKET, der angelegte Bucket
 */

/** wie lange eine Anzeige-Adresse gilt */
const LINK_TTL_MS = 60 * 60 * 1000;
/** Googles öffentliche Schlüssel, im Format das WebCrypto direkt lesen kann */
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
/** keine Datei über 60 MB; ein Foto hat 4, ein Plan vielleicht 30 */
const MAX_BYTES = 60 * 1024 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    try {
      if (url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/')) {
        return cors(await handleApi(request, url, env, ctx));
      }
      if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
        return cors(await handleMcp(request, url, env, ctx));
      }
      if (url.pathname === '/link' && request.method === 'POST') {
        return cors(await handleLink(request, env));
      }
      if (request.method === 'GET' && (url.pathname === '/diag' || url.pathname.startsWith('/diag/'))) {
        return cors(await handleDiag(request, url, env));
      }
      if (url.pathname.startsWith('/files/')) {
        const path = decodeURIComponent(url.pathname.slice('/files/'.length));
        if (!validPath(path)) return cors(text(400, 'Ungültiger Pfad'));
        if (request.method === 'GET') return cors(await handleGet(path, url, env));
        if (request.method === 'PUT') return cors(await handlePut(request, path, env));
        if (request.method === 'DELETE') return cors(await handleDelete(request, path, env));
      }
      return cors(text(404, 'Unbekannte Route'));
    } catch (error) {
      // der Grund gehört ins Log, nicht in die Antwort
      console.error(error);
      return cors(text(500, 'Interner Fehler'));
    }
  },
};

// ---------------------------------------------------------------- Routen

async function handlePut(request, path, env) {
  const denied = await requireUser(request, env);
  if (denied) return denied;

  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BYTES) return text(413, 'Datei zu groß');

  await env.BUCKET.put(path, request.body, {
    httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' },
  });
  return json(200, { ok: true, path });
}

async function handleDelete(request, path, env) {
  const denied = await requireUser(request, env);
  if (denied) return denied;
  await env.BUCKET.delete(path);
  return json(200, { ok: true });
}

async function handleLink(request, env) {
  const denied = await requireUser(request, env);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const path = String(body.path ?? '');
  if (!validPath(path)) return text(400, 'Ungültiger Pfad');

  const expires = Date.now() + LINK_TTL_MS;
  const signature = await sign(path, expires, env.SIGNING_KEY);
  const base = new URL(request.url).origin;
  const url = `${base}/files/${encodePath(path)}?exp=${expires}&sig=${signature}`;
  return json(200, { url, expires });
}

async function handleGet(path, url, env) {
  const expires = Number(url.searchParams.get('exp') ?? '0');
  const signature = url.searchParams.get('sig') ?? '';
  if (!(await validSignature(path, expires, signature, env.SIGNING_KEY))) {
    return text(403, 'Adresse ungültig oder abgelaufen');
  }

  const object = await env.BUCKET.get(path);
  if (!object) return text(404, 'Datei nicht gefunden');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // so lange wie die Adresse gilt, darf der Browser sie behalten
  headers.set('cache-control', 'private, max-age=3600');
  return new Response(object.body, { headers });
}

/**
 * Geräteprotokolle lesen. Nur mit DIAG_TOKEN, und nur unter diag/ – an die übrigen Dateien
 * kommt dieses Token nicht heran.
 */
async function handleDiag(request, url, env) {
  const secret = String(env.DIAG_TOKEN ?? '');
  if (secret.length < 16) return text(404, 'Diagnose ist nicht eingerichtet');
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!timingSafeEqual(token, secret)) return text(401, 'Token ungültig');

  const name = decodeURIComponent(url.pathname.slice('/diag'.length).replace(/^\//, ''));
  if (!name) {
    const listed = await env.BUCKET.list({ prefix: 'diag/', limit: 100 });
    return json(200, {
      devices: listed.objects.map((object) => ({
        device: object.key.slice('diag/'.length).replace(/\.json$/, ''),
        size: object.size,
        uploaded: object.uploaded,
      })),
    });
  }
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(name)) return text(400, 'Ungültiger Gerätename');
  const object = await env.BUCKET.get(`diag/${name}.json`);
  if (!object) return text(404, 'Kein Protokoll für dieses Gerät');
  return new Response(object.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// ---------------------------------------------------------------- Signatur

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function sign(path, expires, secret) {
  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(`${path}:${expires}`);
  return toHex(await crypto.subtle.sign('HMAC', key, data));
}

export async function validSignature(path, expires, signature, secret) {
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = await sign(path, expires, secret);
  return timingSafeEqual(expected, signature);
}

/** vergleicht ohne zu verraten, an welcher Stelle es abweicht */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

// ---------------------------------------------------------------- Anmeldung

async function requireUser(request, env) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return text(401, 'Nicht angemeldet');

  const claims = await verifyFirebaseToken(token, env.FIREBASE_PROJECT);
  if (!claims) return text(401, 'Anmeldung ungültig');

  const allowed = String(env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const email = String(claims.email ?? '').toLowerCase();
  if (!allowed.includes(email)) return text(403, 'Dieses Konto ist nicht freigeschaltet');

  return null; // alles in Ordnung
}

let keyCache = { at: 0, keys: null };

async function googleKeys() {
  // die Schlüssel wechseln täglich; eine Stunde im Speicher ist reichlich
  if (keyCache.keys && Date.now() - keyCache.at < 60 * 60 * 1000) return keyCache.keys;
  const response = await fetch(JWK_URL);
  if (!response.ok) throw new Error('Googles Schlüssel sind nicht erreichbar');
  const { keys } = await response.json();
  keyCache = { at: Date.now(), keys };
  return keys;
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Prüft das Firebase-Anmeldeticket: Unterschrift gegen Googles öffentliche Schlüssel,
 * dazu Projekt, Aussteller und Ablauf. Ohne diese Prüfung könnte jeder eine beliebige
 * Mailadresse behaupten.
 */
export async function verifyFirebaseToken(token, project) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart)));
    claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;

  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== project) return null;
  if (claims.iss !== `https://securetoken.google.com/${project}`) return null;
  if (typeof claims.exp !== 'number' || claims.exp < now) return null;
  if (typeof claims.iat !== 'number' || claims.iat > now + 300) return null;
  if (!claims.sub) return null;

  const keys = await googleKeys();
  const jwk = keys.find((entry) => entry.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  return valid ? claims : null;
}

// ---------------------------------------------------------------- API (Zugang von außen)
//
// Legt Kosten, Aufgaben, Tagebucheinträge und Notizen an, ohne dass jemand in der App
// angemeldet ist – gedacht für Claude im Chat ("Schrauben für 12,40 bei Hornbach").
//
// Anmeldung: persönliche Zugangstokens (`reno_` + 43 Zeichen, 256 Bit Zufall). Die App
// erzeugt sie (Einstellungen → API-Zugang) und zeigt sie genau einmal; gespeichert wird
// in `meta/api-tokens` nur der SHA-256-Hash, dazu Name, Rechte, Ablauf und Besitzer. Bei
// 256 Bit Zufall braucht es kein langsames Passwort-Hashing. Widerrufen = Eintrag löschen,
// das greift bei der nächsten Anfrage.
//
// In Firestore schreibt der Worker mit einem Dienstkonto (Secret FIREBASE_SERVICE_ACCOUNT,
// das JSON aus der Firebase-Konsole). Das Dienstkonto umgeht die Regeln, deshalb prüft
// der Worker selbst: Token gültig, nicht abgelaufen, Besitzer steht in ALLOWED_EMAILS,
// Recht für genau diese Sammlung. Löschen darf die API nur, was sie selbst angelegt hat.

const TOKEN_DOC = 'meta/api-tokens';
const TOKEN_PATTERN = /^reno_[A-Za-z0-9_-]{43}$/;
/** lastUsedAt höchstens so oft schreiben – jede Änderung weckt alle offenen Apps */
const LAST_USED_EVERY_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_APP_URL = 'https://dathomas13.github.io/reno-master/';

/** Rechte eines Tokens: je Bereich schreiben (contacts: Kontakte und Gespräche), dazu lesen */
export const API_SCOPES = ['costs', 'tasks', 'diary', 'notes', 'contacts', 'read'];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------ Auswahlwerte (Kopie der Startwerte)

/**
 * Die Startnamen der Auswahllisten, die die API braucht – dieselben wie in
 * src/data/options.ts und src/data/seed/lists.ts. Der Worker kann die App nicht
 * importieren; dass beide gleich bleiben, prüft src/data/__tests__/apiWorker.test.ts.
 * Steht ein Set in meta/options, gilt das; diese Liste ist nur der Rückfall.
 */
export const OPTION_LABELS = {
  taskStatus: ['Offen', 'In Arbeit', 'Wartet auf', 'Erledigt'],
  priority: ['Hoch', 'Mittel', 'Niedrig'],
  paymentStatus: ['Offen', 'Bezahlt', 'Erstattet'],
  people: [
    'Thomas', 'Sarah', 'Wolfgang', 'Christine', 'Laura', 'Matze', 'Julia', 'Tom',
    'Jonas', 'Joni', 'Andre', 'Peter', 'Hannes', 'Robert', 'Sabi', 'Handwerker',
  ],
  weather: ['Sonnig', 'Bewölkt', 'Regen', 'Frost', 'Schnee'],
  costCategories: [
    'Material allgemein', 'Werkzeug', 'Baustellenequipment', 'Abriss/Entsorgung',
    'Keller', 'Dach', 'Außendämmung/Fassade', 'Fenster', 'Elektrik', 'Sanitär',
    'Wärmepumpe', 'Heizungsmontage', 'Fußbodenheizung', 'Lüftungsanlage', 'Estrich',
    'Innenausbau', 'Bäder', 'Küche', 'PV-Anlage', 'Energieberater/Baubegleitung',
    'Verpflegung Helfer', 'Gebühren/Abgaben', 'Sonstiges',
  ],
  taskAreas: [
    'Planung', 'Organisation', 'Rückbau', 'Keller', 'Gebäudehülle', 'Dach', 'Fenster',
    'Fassade', 'Heizung', 'Elektrik', 'Sanitär', 'PV', 'Innenausbau', 'Finanzen',
    'Förderung', 'Energieberatung', 'Versicherung', 'Behörden', 'Kauf',
  ],
  paymentMethods: ['Karte', 'Bar', 'Überweisung', 'PayPal'],
  payers: ['Thomas', 'Sarah', 'Gemeinsam'],
  contactRoles: [
    'Energieberater (iSFP)', 'Statiker', 'Dachdecker', 'Heizungsbauer', 'Elektriker',
    'Fensterbauer', 'Sanitär', 'Trockenbauer', 'Estrichleger', 'Fliesenleger', 'Maler',
    'PV-Installateur', 'Baustoffhandel', 'Notar', 'Bank/Finanzierung', 'Immobilienmaklerin',
  ],
  contactChannels: ['Anruf', 'Termin', 'E-Mail', 'Nachricht', 'Sonstiges'],
  contactStatus: ['Angefragt', 'Angebot erhalten', 'Beauftragt', 'Aktiv', 'Abgeschlossen', 'Abgelehnt'],
};
/** feste Sets: die Kennungen stehen im Code, das Dokument benennt und sortiert nur */
const FIXED_OPTION_SETS = ['taskStatus', 'priority', 'paymentStatus'];

const UMLAUTS = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

/** wie slugify in src/data/options.ts */
export function slugify(label) {
  const slug = String(label)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'x';
}

function cleanLabel(value) {
  return String(value).normalize('NFC').replace(/\s+/g, ' ').trim();
}

function storedEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.label !== 'string') continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item.archived === true ? { id: item.id, label: item.label, archived: true } : { id: item.id, label: item.label });
  }
  return result;
}

/** die Sets, wie die App sie benutzt (normalizeSets in options.ts), nur für die Sets oben */
export function normalizeOptions(stored) {
  const sets = {};
  for (const [key, labels] of Object.entries(OPTION_LABELS)) {
    const defaults = labels.map((label) => ({ id: slugify(label), label }));
    const raw = stored?.[key];
    if (FIXED_OPTION_SETS.includes(key)) {
      const known = new Map(defaults.map((entry) => [entry.id, entry]));
      const result = [];
      for (const entry of storedEntries(raw)) {
        if (!known.has(entry.id) || result.some((e) => e.id === entry.id)) continue;
        result.push({ id: entry.id, label: cleanLabel(entry.label) || known.get(entry.id).label });
      }
      for (const entry of defaults) if (!result.some((e) => e.id === entry.id)) result.push(entry);
      sets[key] = result;
    } else {
      sets[key] = Array.isArray(raw) ? storedEntries(raw) : defaults;
    }
  }
  return sets;
}

function sameName(a, b) {
  return a.localeCompare(b, 'de', { sensitivity: 'accent' }) === 0;
}

function choices(entries, key = 'label') {
  return entries.filter((entry) => !entry.archived).map((entry) => entry[key]).join(', ');
}

/**
 * Kennung zu einer Angabe aus einem Auswahl-Set: die Kennung selbst, der Name oder ein
 * Name, der zur Kennung slugt (wie findOptionByName). Unbekanntes ist ein Fehler mit
 * den möglichen Werten – nie wird ein Text gespeichert.
 */
export function resolveOption(entries, value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ApiError(400, `${field}: Text erwartet`);
  const text = value.trim();
  const hit =
    entries.find((entry) => entry.id === text) ??
    entries.find((entry) => sameName(entry.label, text)) ??
    entries.find((entry) => entry.id === slugify(text));
  if (!hit) throw new ApiError(400, `${field}: „${text}“ gibt es nicht. Möglich: ${choices(entries)}`);
  return hit.id;
}

/** wie resolveOption, für Gewerke, Phasen, Räume und Kontakte: id, Name, oder ein eindeutiger Namensteil */
export function resolveObject(objects, value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ApiError(400, `${field}: Text erwartet`);
  const text = value.trim();
  const exact = objects.find((o) => o.id === text) ?? objects.find((o) => sameName(o.name, text));
  if (exact) return exact.id;
  const needle = fold(text);
  const partial = needle ? objects.filter((o) => !o.archived && fold([o.name, o.company].filter(Boolean).join(' ')).includes(needle)) : [];
  if (partial.length === 1) return partial[0].id;
  if (partial.length > 1) {
    throw new ApiError(400, `${field}: „${text}“ ist nicht eindeutig: ${partial.map((o) => o.name).join(', ')}`);
  }
  throw new ApiError(400, `${field}: „${text}“ gibt es nicht. Möglich: ${choices(objects, 'name')}`);
}

function resolveMany(value, field, resolve) {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => resolve(item, field)))];
}

// ------------------------------------------------ Eingaben prüfen

function asObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'JSON-Objekt erwartet');
  return input;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ApiError(400, `${field}: Text erwartet`);
  const text = value.trim();
  if (text.length > max) throw new ApiError(400, `${field}: höchstens ${max} Zeichen`);
  return text || undefined;
}

function requiredText(value, field, max) {
  const text = optionalText(value, field, max);
  if (!text) throw new ApiError(400, `${field} fehlt`);
  return text;
}

/** Euro-Betrag: Zahl oder Text wie "12,40", "1.234,56 €" */
export function parseAmount(value, field) {
  let number = value;
  if (typeof value === 'string') {
    let text = value.replace(/[\s€]/g, '').replace(/EUR$/i, '');
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    number = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  }
  if (typeof number !== 'number' || !Number.isFinite(number)) throw new ApiError(400, `${field}: Betrag in Euro erwartet`);
  if (number <= 0 || number >= 10_000_000) throw new ApiError(400, `${field}: Betrag außerhalb des Bereichs`);
  return round2(number);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${field}: Datum als JJJJ-MM-TT erwartet`);
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${field}: ${value} ist kein Datum`);
  }
  return value;
}

function optionalBoolean(value, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new ApiError(400, `${field}: true oder false erwartet`);
  return value;
}

/** Datum und Uhrzeit in Europe/Berlin – so speichert die App fachliche Daten */
export function berlinDateTime(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function berlinDate(now = new Date()) {
  return berlinDateTime(now).slice(0, 10);
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

// ------------------------------------------------ Datensätze (wie src/data/repos.ts)
//
// Jede Sammlung ist eine Liste von Feldregeln. Anlegen und Ändern laufen durch dieselben
// Regeln, so kann ein Ändern nie etwas speichern, was ein Anlegen abgelehnt hätte.
//   parse     Eingabe → gespeicherter Wert (Kennung statt Name); undefined = nichts angegeben
//   fallback  beim Anlegen, wenn nichts angegeben ist
//   empty     was "leer" gespeichert wird ('' oder []), statt das Feld zu entfernen
//   required  darf nie fehlen (Anlegen) und nie geleert werden (Ändern)

const textField = (field, max) => (value) => optionalText(value, field, max);
const option = (set, field) => (value, catalog) => resolveOption(catalog.options[set], value, field);
const options = (set, field) => (value, catalog) => resolveMany(value, field, (v, f) => resolveOption(catalog.options[set], v, f));
const trade = (field) => (value, catalog) => resolveObject(catalog.trades, value, field);
const trades = (field) => (value, catalog) => resolveMany(value, field, (v, f) => resolveObject(catalog.trades, v, f));
const phase = (field) => (value, catalog) => resolveObject(catalog.phases, value, field);
const rooms = (field) => (value, catalog) => resolveMany(value, field, (v, f) => resolveObject(catalog.rooms, v, f));

function parseVatRate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (![0, 7, 19].includes(value)) throw new ApiError(400, 'vatRate: 0, 7 oder 19');
  return value;
}

function optionalDateTime(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) {
    throw new ApiError(400, `${field}: Datum als JJJJ-MM-TT oder JJJJ-MM-TTThh:mm erwartet`);
  }
  optionalDate(value.slice(0, 10), field);
  if (value.length === 10) return `${value}T12:00:00`;
  return value.length === 16 ? `${value}:00` : value;
}

function contact(field) {
  return (value, catalog) => {
    if (value === undefined || value === null || value === '') return undefined;
    try {
      return resolveObject(catalog.contacts, value, field);
    } catch (error) {
      if (error instanceof ApiError && error.message.includes('gibt es nicht')) {
        throw new ApiError(400, `${field}: „${value}“ gibt es nicht als Kontakt. Erst mit create_contact anlegen oder ohne Kontakt speichern.`);
      }
      throw error;
    }
  };
}

function priceSplit(gross, rate) {
  if (!(rate > 0) || !(gross > 0)) return { amountNet: undefined, vatAmount: undefined };
  const net = round2(gross / (1 + rate / 100));
  return { amountNet: net, vatAmount: round2(gross - net) };
}

const SPECS = {
  costs: {
    scope: 'costs',
    dateField: 'date',
    link: (id) => `#/kosten/${id}`,
    fields: {
      date: { parse: (v) => optionalDate(v, 'date'), fallback: (now) => berlinDate(now), required: true },
      vendor: { parse: textField('vendor', 200), empty: '' },
      description: { parse: textField('description', 2000), empty: '' },
      amountGross: { parse: (v) => parseAmount(v, 'amountGross'), required: true },
      vatRate: { parse: parseVatRate },
      category: { parse: option('costCategories', 'category'), empty: '' },
      tradeId: { parse: trade('tradeId') },
      roomIds: { parse: rooms('rooms'), empty: [] },
      paymentStatus: { parse: option('paymentStatus', 'paymentStatus'), fallback: () => 'bezahlt', required: true },
      paidBy: { parse: option('payers', 'paidBy') },
      paymentMethod: { parse: option('paymentMethods', 'paymentMethod') },
      invoiceNumber: { parse: textField('invoiceNumber', 100) },
      notes: { parse: textField('notes', 5000) },
    },
    created: { receiptPhotoIds: [] },
    /** Netto und MwSt. folgen Brutto und Satz, wie im Kosten-Editor */
    derive(record, existing, touched) {
      if (!touched.has('amountGross') && !touched.has('vatRate')) return {};
      const gross = touched.has('amountGross') ? record.amountGross : existing.amountGross;
      const rate = touched.has('vatRate') ? record.vatRate : existing.vatRate;
      return priceSplit(gross, rate);
    },
    check(merged) {
      if (!merged.vendor && !merged.description) throw new ApiError(400, 'vendor oder description angeben');
    },
    foreign: ['paymentStatus', 'paidBy', 'paymentMethod'],
    appendTo: 'notes',
    search: ['vendor', 'description', 'notes', 'invoiceNumber'],
    title: (doc) => `${doc.vendor || doc.description || 'Kosten'} · ${doc.amountGross} €`,
  },
  tasks: {
    scope: 'tasks',
    dateField: null,
    link: (id) => `#/aufgaben?aufgabe=${id}`,
    fields: {
      title: { parse: textField('title', 300), required: true },
      notes: { parse: textField('notes', 5000) },
      status: { parse: option('taskStatus', 'status'), fallback: () => 'offen', required: true },
      priority: { parse: option('priority', 'priority'), fallback: () => 'mittel', required: true },
      due: { parse: (v) => optionalDate(v, 'due') },
      assignees: { parse: options('people', 'assignees'), empty: [] },
      area: { parse: option('taskAreas', 'area') },
      tradeId: { parse: trade('tradeId') },
      phaseId: { parse: phase('phaseId') },
      roomIds: { parse: rooms('rooms'), empty: [] },
    },
    created: {},
    /** wie toggleTaskDone: erledigt setzt doneAt und nimmt die Erinnerung weg, offen nimmt doneAt weg */
    derive(record, existing, touched, now) {
      if (!touched.has('status')) return {};
      const done = record.status === 'erledigt';
      const was = existing.status === 'erledigt';
      if (done && !was) return { doneAt: berlinDateTime(now), reminderAt: undefined };
      if (!done && was) return { doneAt: undefined };
      return {};
    },
    foreign: ['status', 'due', 'priority', 'assignees'],
    appendTo: 'notes',
    search: ['title', 'notes'],
    title: (doc) => doc.title,
  },
  diary: {
    scope: 'diary',
    dateField: 'date',
    link: (id) => `#/tagebuch/${id}`,
    fields: {
      date: { parse: (v) => optionalDate(v, 'date'), fallback: (now) => berlinDate(now), required: true },
      title: { parse: textField('title', 200), fallback: (now, record) => `Tagebuch ${record.date.slice(8, 10)}.${record.date.slice(5, 7)}.`, required: true },
      text: { parse: textField('text', 20000), required: true },
      weather: { parse: option('weather', 'weather') },
      present: { parse: options('people', 'present'), empty: [] },
      defects: { parse: (v) => optionalBoolean(v, 'defects'), fallback: () => false, required: true },
      phaseId: { parse: phase('phaseId') },
      tradeIds: { parse: trades('trades'), empty: [] },
      roomIds: { parse: rooms('rooms'), empty: [] },
    },
    created: { photoIds: [] },
    foreign: [],
    appendTo: 'text',
    search: ['title', 'text'],
    title: (doc) => doc.title,
  },
  notes: {
    scope: 'notes',
    dateField: 'at',
    link: () => '#/notizen',
    fields: {
      text: { parse: textField('text', 20000), required: true },
      at: { parse: (v) => optionalDateTime(v, 'at'), fallback: (now) => berlinDateTime(now), required: true },
      pinned: { parse: (v) => optionalBoolean(v, 'pinned'), fallback: () => false, required: true },
      roomIds: { parse: rooms('rooms'), empty: [] },
    },
    created: {},
    foreign: ['pinned'],
    appendTo: 'text',
    search: ['text'],
    title: (doc) => String(doc.text ?? '').split('\n')[0].slice(0, 80),
  },
  contacts: {
    scope: 'contacts',
    dateField: null,
    link: (id) => `#/kontakte?kontakt=${id}`,
    fields: {
      name: { parse: textField('name', 200), required: true },
      company: { parse: textField('company', 200) },
      roles: { parse: options('contactRoles', 'roles'), empty: [] },
      phone: { parse: textField('phone', 60) },
      email: { parse: textField('email', 200) },
      tradeIds: { parse: trades('trades'), empty: [] },
      status: { parse: option('contactStatus', 'status') },
      notes: { parse: textField('notes', 5000) },
    },
    created: {},
    foreign: ['phone', 'email', 'status'],
    appendTo: 'notes',
    search: ['name', 'company', 'phone', 'email', 'notes'],
    title: (doc) => (doc.company ? `${doc.name} (${doc.company})` : doc.name),
  },
  contactLogs: {
    scope: 'contacts',
    dateField: 'at',
    link: (id) => `#/gespraeche?eintrag=${id}`,
    fields: {
      contactId: { parse: contact('contact'), empty: '' },
      at: { parse: (v) => optionalDateTime(v, 'at'), fallback: (now) => berlinDateTime(now), required: true },
      channel: { parse: option('contactChannels', 'channel') },
      participants: { parse: options('people', 'participants'), empty: [] },
      text: { parse: textField('text', 20000), required: true },
    },
    created: {},
    foreign: [],
    appendTo: 'text',
    search: ['text'],
    title: (doc) => `Gespräch ${String(doc.at ?? '').slice(0, 10)}`,
  },
};

/** wie die Felder in Eingaben heißen dürfen, außer ihrem eigenen Namen */
const FIELD_ALIASES = { trade: 'tradeId', phase: 'phaseId', trades: 'tradeIds', rooms: 'roomIds', contact: 'contactId' };

/** die gespeicherten Feldnamen einer Eingabe; Unbekanntes ist ein Fehler, kein stilles Weglassen */
function storedKeys(spec, input, ignore) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (ignore.includes(key)) continue;
    const stored = FIELD_ALIASES[key] ?? key;
    if (!spec.fields[stored]) {
      throw new ApiError(400, `${key}: unbekanntes Feld. Möglich: ${Object.keys(spec.fields).join(', ')}`);
    }
    result[stored] = value;
  }
  return result;
}

/** ein neuer Datensatz aus einer Eingabe */
export function buildRecord(collection, input, catalog, now = new Date()) {
  const spec = SPECS[collection];
  const given = storedKeys(spec, asObject(input), ['id', 'newEntry']);
  const record = {};
  for (const [key, rule] of Object.entries(spec.fields)) {
    let value = rule.parse(given[key], catalog);
    if (value === undefined && rule.fallback) value = rule.fallback(now, record);
    if (value === undefined && 'empty' in rule) value = rule.empty;
    if (value === undefined && rule.required) throw new ApiError(400, `${key} fehlt`);
    if (value !== undefined) record[key] = value;
  }
  spec.check?.(record);
  const derived = spec.derive?.(record, {}, new Set(Object.keys(record)), now) ?? {};
  return withoutUndefined({ ...record, ...derived, ...structuredClone(spec.created) });
}

/**
 * Was ein Ändern schreibt: `set` die neuen Werte, `remove` die Felder, die wegfallen.
 * Nur die genannten Felder (und was aus ihnen folgt) werden angefasst – ein Foto, das
 * inzwischen in der App am Eintrag hängt, bleibt, wo es ist.
 */
export function buildPatch(collection, existing, input, catalog, now = new Date()) {
  const spec = SPECS[collection];
  const body = asObject(input);
  const given = storedKeys(spec, body, ['appendText']);
  const append = optionalText(body.appendText, 'appendText', 20000);
  if (append) {
    const before = typeof existing[spec.appendTo] === 'string' ? existing[spec.appendTo].trimEnd() : '';
    given[spec.appendTo] = before ? `${before}\n\n${append}` : append;
  }
  const touched = new Set(Object.keys(given));
  if (touched.size === 0) throw new ApiError(400, 'Nichts zu ändern');

  const record = {};
  const remove = [];
  for (const key of touched) {
    const rule = spec.fields[key];
    let value = rule.parse(given[key], catalog);
    if (value === undefined && rule.required) throw new ApiError(400, `${key} darf nicht leer sein`);
    if (value === undefined && 'empty' in rule) value = rule.empty;
    if (value === undefined) remove.push(key);
    else record[key] = value;
  }
  // nur prüfen, was diese Änderung berührt – eine alte Rechnung ohne Händler bleibt bezahlbar
  if (touched.has('vendor') || touched.has('description')) spec.check?.({ ...existing, ...record });
  for (const [key, value] of Object.entries(spec.derive?.(record, existing, touched, now) ?? {})) {
    if (value === undefined) remove.push(key);
    else record[key] = value;
  }
  return { set: record, remove: [...new Set(remove)], touched: [...touched], appended: !!append };
}

/** hängt einen neuen Text an einen bestehenden Tagebucheintrag desselben Tages an */
export function mergeDiaryEntry(existing, addition) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const union = (a, b) => [...new Set([...list(a), ...list(b)])];
  const before = typeof existing.text === 'string' ? existing.text.trimEnd() : '';
  return {
    text: before ? `${before}\n\n${addition.text}` : addition.text,
    present: union(existing.present, addition.present),
    tradeIds: union(existing.tradeIds, addition.tradeIds),
    roomIds: union(existing.roomIds, addition.roomIds),
    defects: existing.defects === true || addition.defects === true,
  };
}

// ------------------------------------------------ Tokens

const ID_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/** wie newId() in src/lib/ids.ts: 12 Zeichen ohne Verwechsler */
export function newDocId() {
  let id = '';
  while (id.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      // 224 = 4 × 56: darüber verworfen, sonst kämen die ersten Zeichen öfter vor
      if (byte < 224 && id.length < 12) id += ID_ALPHABET[byte % 56];
    }
  }
  return id;
}

/** eine id, die der Client für einen neuen Datensatz mitbringt */
function newDocIdFrom(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{8,40}$/.test(value)) throw new ApiError(400, 'id: 8 bis 40 Buchstaben und Ziffern');
  return value;
}

/** die id eines bestehenden Datensatzes (Startdaten haben auch kürzere) */
function existingDocId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(value)) throw new ApiError(400, 'id ungültig');
  return value;
}

export async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function allowedEmails(env) {
  return String(env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** warum ein gespeicherter Token-Eintrag nicht (mehr) gilt, oder null */
export function tokenProblem(entry, allowed, now = Date.now()) {
  if (!entry || typeof entry.hash !== 'string') return 'unbekannt';
  if (entry.expiresAt && !(Date.parse(entry.expiresAt) > now)) return 'abgelaufen';
  if (!allowed.includes(String(entry.createdBy ?? '').toLowerCase())) return 'Besitzer nicht freigeschaltet';
  return null;
}

/** sucht das Token in meta/api-tokens; gibt den Zugang oder wirft 401 */
async function authenticate(env, ctx, token) {
  if (!TOKEN_PATTERN.test(token)) throw new ApiError(401, 'Token fehlt oder hat das falsche Format');
  const hash = await sha256Hex(token);
  const doc = await firestoreGet(env, TOKEN_DOC);
  const tokens = doc?.tokens && typeof doc.tokens === 'object' ? doc.tokens : {};
  for (const [id, entry] of Object.entries(tokens)) {
    if (!entry || typeof entry.hash !== 'string' || !timingSafeEqual(entry.hash, hash)) continue;
    const problem = tokenProblem(entry, allowedEmails(env));
    if (problem) throw new ApiError(401, `Token ungültig: ${problem}`);
    const last = Date.parse(entry.lastUsedAt ?? '');
    if (!(last > Date.now() - LAST_USED_EVERY_MS)) {
      const touch = touchToken(env, id).catch((error) => console.error(error));
      if (ctx?.waitUntil) ctx.waitUntil(touch);
    }
    const scopes = Array.isArray(entry.scopes) ? entry.scopes.filter((s) => API_SCOPES.includes(s)) : [];
    return { id, name: String(entry.name ?? ''), scopes, owner: String(entry.createdBy).toLowerCase() };
  }
  throw new ApiError(401, 'Token ungültig oder widerrufen');
}

function requireScope(auth, scope) {
  if (scope && !auth.scopes.includes(scope)) {
    throw new ApiError(403, `Dieses Token darf das nicht (Recht „${scope}“ fehlt)`);
  }
}

async function touchToken(env, id) {
  const path = `tokens.\`${id}\`.lastUsedAt`;
  await firestoreCommit(env, [
    {
      update: {
        name: docName(env, TOKEN_DOC),
        fields: { tokens: encodeValue({ [id]: { lastUsedAt: new Date().toISOString() } }) },
      },
      updateMask: { fieldPaths: [path] },
      currentDocument: { exists: true },
    },
  ]);
}

// ------------------------------------------------ Firestore über REST, mit Dienstkonto

let accessCache = { token: null, until: 0 };

function serviceAccount(env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new ApiError(503, 'Die API ist nicht eingerichtet (FIREBASE_SERVICE_ACCOUNT fehlt im Worker)');
  try {
    const account = JSON.parse(raw);
    if (!account.client_email || !account.private_key) throw new Error('unvollständig');
    return account;
  } catch {
    throw new ApiError(503, 'FIREBASE_SERVICE_ACCOUNT ist kein gültiges Dienstkonto-JSON');
  }
}

function projectId(env) {
  return env.FIREBASE_PROJECT || serviceAccount(env).project_id;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

/** ein Zugriffsticket für Firestore, mit dem Schlüssel des Dienstkontos selbst signiert */
async function googleAccessToken(env) {
  if (accessCache.token && Date.now() < accessCache.until) return accessCache.token;
  const account = serviceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const head = textToBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = textToBase64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claims}.${bytesToBase64Url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`Google-Anmeldung des Dienstkontos: ${response.status} ${await response.text()}`);
  const { access_token: token, expires_in: seconds } = await response.json();
  accessCache = { token, until: Date.now() + (Number(seconds ?? 3600) - 300) * 1000 };
  return token;
}

function docName(env, path) {
  return `projects/${projectId(env)}/databases/(default)/documents/${path}`;
}

async function firestore(env, method, suffix, body) {
  const token = await googleAccessToken(env);
  const response = await fetch(`https://firestore.googleapis.com/v1/${docName(env, '').replace(/\/$/, '')}${suffix}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Firestore ${response.status}: ${data?.error?.message ?? ''}`);
    error.firestoreStatus = data?.error?.status ?? '';
    throw error;
  }
  return data;
}

/** ein Dokument als einfaches Objekt (mit `_updateTime`), oder null */
async function firestoreGet(env, path) {
  try {
    const doc = await firestore(env, 'GET', `/${path}`);
    return { ...decodeFields(doc.fields ?? {}), _updateTime: doc.updateTime };
  } catch (error) {
    if (error.firestoreStatus === 'NOT_FOUND') return null;
    throw error;
  }
}

async function firestoreCommit(env, writes) {
  return firestore(env, 'POST', ':commit', { writes });
}

async function firestoreQuery(env, structuredQuery) {
  const rows = await firestore(env, 'POST', ':runQuery', { structuredQuery });
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.document)
    .map((row) => ({
      ...decodeFields(row.document.fields ?? {}),
      id: row.document.name.split('/').pop(),
      _updateTime: row.document.updateTime,
    }));
}

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(value) } };
}

export function encodeFields(object) {
  const fields = {};
  for (const [key, value] of Object.entries(object)) if (value !== undefined) fields[key] = encodeValue(value);
  return fields;
}

export function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

const SERVER_TIME = (fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' });

// ------------------------------------------------ Vorgänge (gemeinsam für REST und MCP)

async function listObjects(env, collection) {
  const docs = await firestoreQuery(env, { from: [{ collectionId: collection }], limit: 1000 });
  return docs
    .filter((doc) => typeof doc.name === 'string')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'de'))
    .map((doc) =>
      withoutUndefined({
        id: doc.id,
        name: doc.name,
        status: doc.status,
        company: doc.company,
        budgetPlanned: typeof doc.budgetPlanned === 'number' ? doc.budgetPlanned : undefined,
        offer: typeof doc.offer === 'number' ? doc.offer : undefined,
        archived: doc.archived === true || undefined,
      }),
    );
}

/**
 * Die Räume der Planung (meta/model-soll, Feld `rooms` als JSON-Text). Nur die: die App
 * zeigt in der Planungs-Ansicht genau diese ids, und der Bestand ist hier nicht gefragt.
 * Ein gleicher Name in zwei Geschossen bekommt das Geschoss dazu ("Flur (EG)").
 */
export function planningRooms(roomsJson) {
  let rooms = [];
  try {
    const parsed = typeof roomsJson === 'string' ? JSON.parse(roomsJson) : null;
    rooms = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
  } catch {
    return [];
  }
  const valid = rooms.filter((room) => room && typeof room.id === 'string' && typeof room.name === 'string');
  const count = new Map();
  for (const room of valid) count.set(room.name, (count.get(room.name) ?? 0) + 1);
  return valid.map((room) => ({
    id: room.id,
    name: count.get(room.name) > 1 ? `${room.name} (${room.floor})` : room.name,
    floor: room.floor,
  }));
}

async function loadRooms(env) {
  try {
    const doc = await firestore(env, 'GET', '/meta/model-soll?mask.fieldPaths=rooms');
    return planningRooms(decodeFields(doc.fields ?? {}).rooms);
  } catch (error) {
    if (error.firestoreStatus === 'NOT_FOUND') return [];
    throw error;
  }
}

async function loadCatalog(env, { contacts = false } = {}) {
  const [stored, tradeList, phaseList, roomList, contactList] = await Promise.all([
    firestoreGet(env, 'meta/options'),
    listObjects(env, 'trades'),
    listObjects(env, 'phases'),
    loadRooms(env),
    contacts ? listObjects(env, 'contacts') : Promise.resolve([]),
  ]);
  return { options: normalizeOptions(stored), trades: tradeList, phases: phaseList, rooms: roomList, contacts: contactList };
}

/** was ein Client zum Ausfüllen braucht: nur sichtbare Einträge, Kennung und Name */
function publicCatalog(catalog) {
  const active = (list) => list.filter((entry) => !entry.archived);
  return {
    today: berlinDate(),
    options: Object.fromEntries(
      Object.entries(catalog.options).map(([key, entries]) => [key, active(entries).map(({ id, label }) => ({ id, label }))]),
    ),
    trades: active(catalog.trades).map(({ id, name, status }) => ({ id, name, status })),
    phases: active(catalog.phases).map(({ id, name, status }) => ({ id, name, status })),
    rooms: catalog.rooms.map(({ id, name, floor }) => ({ id, name, floor })),
  };
}

function specOf(collection) {
  const spec = SPECS[collection];
  if (!spec) throw new ApiError(404, `Unbekannte Sammlung. Möglich: ${Object.keys(SPECS).join(', ')}`);
  return spec;
}

function appLink(env, collection, id) {
  const base = String(env.APP_URL || DEFAULT_APP_URL).replace(/\/?$/, '/');
  return `${base}${SPECS[collection].link(id)}`;
}

function isOwn(doc) {
  return String(doc.createdVia ?? '').startsWith('api:');
}

async function createEntry(env, auth, collection, input) {
  const spec = specOf(collection);
  requireScope(auth, spec.scope);
  const body = asObject(input);
  const catalog = await loadCatalog(env, { contacts: collection === 'contactLogs' });
  const record = buildRecord(collection, body, catalog);

  if (collection === 'diary' && body.newEntry !== true) {
    // die App behandelt "Eintrag für heute" als einen: an den bestehenden anhängen
    const [existing] = await firestoreQuery(env, {
      from: [{ collectionId: 'diary' }],
      where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: encodeValue(record.date) } },
      limit: 1,
    });
    if (existing) {
      const merged = mergeDiaryEntry(existing, record);
      await firestoreCommit(env, [
        {
          update: { name: docName(env, `diary/${existing.id}`), fields: encodeFields({ ...merged, updatedBy: auth.owner }) },
          updateMask: { fieldPaths: [...Object.keys(merged), 'updatedBy'] },
          updateTransforms: [SERVER_TIME('updatedAt')],
          currentDocument: { updateTime: existing._updateTime },
        },
      ]);
      return { collection, id: existing.id, created: false, appended: true, link: appLink(env, collection, existing.id), record: { ...record, ...merged } };
    }
  }

  const id = body.id === undefined ? newDocId() : newDocIdFrom(body.id);
  const fields = encodeFields({ ...record, id, createdBy: auth.owner, updatedBy: auth.owner, createdVia: `api:${auth.id}` });
  try {
    await firestoreCommit(env, [
      {
        update: { name: docName(env, `${collection}/${id}`), fields },
        updateTransforms: [SERVER_TIME('createdAt'), SERVER_TIME('updatedAt')],
        currentDocument: { exists: false },
      },
    ]);
  } catch (error) {
    // dieselbe id ein zweites Mal: eine Wiederholung, kein zweiter Datensatz
    if (error.firestoreStatus === 'ALREADY_EXISTS') {
      return { collection, id, created: false, duplicate: true, link: appLink(env, collection, id) };
    }
    throw error;
  }
  return { collection, id, created: true, link: appLink(env, collection, id), record };
}

/**
 * Ändert einen Eintrag. Was über die API angelegt wurde, darf in allen Feldern geändert
 * werden; ein Eintrag aus der App nur in den wenigen Feldern unter `foreign` und per
 * `appendText` – so schreibt ein Missverständnis im Chat keine gepflegte Rechnung um.
 */
async function updateEntry(env, auth, collection, id, input) {
  const spec = specOf(collection);
  requireScope(auth, spec.scope);
  existingDocId(id);
  const body = asObject(input);
  const existing = await firestoreGet(env, `${collection}/${id}`);
  if (!existing) throw new ApiError(404, 'Diesen Eintrag gibt es nicht');

  if (!isOwn(existing)) {
    const keys = Object.keys(body)
      .filter((key) => key !== 'appendText')
      .map((key) => FIELD_ALIASES[key] ?? key);
    const forbidden = keys.filter((key) => !spec.foreign.includes(key));
    if (forbidden.length) {
      const allowed = [...spec.foreign, 'appendText'].join(', ');
      throw new ApiError(403, `Bei Einträgen aus der App darf die API nur ${allowed} ändern, nicht ${forbidden.join(', ')}`);
    }
  }

  const catalog = await loadCatalog(env, { contacts: collection === 'contactLogs' });
  const patch = buildPatch(collection, existing, body, catalog);
  const paths = [...Object.keys(patch.set), ...patch.remove, 'updatedBy'];
  await firestoreCommit(env, [
    {
      update: { name: docName(env, `${collection}/${id}`), fields: encodeFields({ ...patch.set, updatedBy: auth.owner }) },
      // ein Feld in der Maske, das in `fields` fehlt, löscht Firestore
      updateMask: { fieldPaths: paths },
      updateTransforms: [SERVER_TIME('updatedAt')],
      currentDocument: { updateTime: existing._updateTime },
    },
  ]);
  return { collection, id, updated: patch.touched, removed: patch.remove, link: appLink(env, collection, id), changes: patch.set };
}

/** Felder, die ein Client nicht braucht (Zeitstempel, Bearbeiter) */
function publicRecord(doc) {
  const record = { ...doc };
  for (const key of ['_updateTime', 'createdAt', 'updatedAt', 'updatedBy']) delete record[key];
  return record;
}

function flag(value, otherwise) {
  if (value === undefined || value === null || value === '') return otherwise;
  return !(value === false || value === 'false' || value === '0');
}

async function listEntries(env, auth, collection, params) {
  requireScope(auth, 'read');
  const spec = specOf(collection);
  const limit = Math.min(Math.max(Number(params.limit ?? 20) || 20, 1), 100);
  const query = optionalText(params.query, 'query', 200);

  if (!spec.dateField) {
    let all = await firestoreQuery(env, { from: [{ collectionId: collection }], limit: 1000 });
    if (collection === 'tasks') {
      const open = flag(params.open, true);
      all = all
        .filter((task) => !open || task.status !== 'erledigt')
        .sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')) || String(a.title).localeCompare(String(b.title), 'de'));
    } else {
      all = all.sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
    }
    if (query) all = all.filter((doc) => matchesQuery(spec, doc, query));
    return all.slice(0, limit).map(publicRecord);
  }

  const since = optionalDate(params.since, 'since');
  // ein Filter auf ein zweites Feld bräuchte einen eigenen Index; daher mehr holen und hier filtern
  const filtering = !!query || !!params.contact;
  const structured = {
    from: [{ collectionId: collection }],
    orderBy: [{ field: { fieldPath: spec.dateField }, direction: 'DESCENDING' }],
    limit: filtering ? 1000 : limit,
  };
  if (since) {
    structured.where = { fieldFilter: { field: { fieldPath: spec.dateField }, op: 'GREATER_THAN_OR_EQUAL', value: encodeValue(since) } };
  }
  let rows = await firestoreQuery(env, structured);
  if (collection === 'contactLogs' && params.contact) {
    const catalog = await loadCatalog(env, { contacts: true });
    const contactId = contact('contact')(params.contact, catalog);
    rows = rows.filter((row) => row.contactId === contactId);
  }
  if (query) rows = rows.filter((doc) => matchesQuery(spec, doc, query));
  return rows.slice(0, limit).map(publicRecord);
}

async function completeTask(env, auth, id) {
  requireScope(auth, 'tasks');
  existingDocId(id);
  try {
    await firestoreCommit(env, [
      {
        update: {
          name: docName(env, `tasks/${id}`),
          fields: encodeFields({ status: 'erledigt', doneAt: berlinDateTime(), updatedBy: auth.owner }),
        },
        // reminderAt steht in der Maske, aber nicht in den Feldern: Firestore löscht es
        updateMask: { fieldPaths: ['status', 'doneAt', 'reminderAt', 'updatedBy'] },
        updateTransforms: [SERVER_TIME('updatedAt')],
        currentDocument: { exists: true },
      },
    ]);
  } catch (error) {
    if (error.firestoreStatus === 'NOT_FOUND') throw new ApiError(404, 'Diese Aufgabe gibt es nicht');
    throw error;
  }
  return { collection: 'tasks', id, done: true, link: appLink(env, 'tasks', id) };
}

/** löscht nur, was über die API entstanden ist – ein verlorenes Token kann nichts Älteres zerstören */
async function deleteEntry(env, auth, collection, id) {
  const spec = specOf(collection);
  requireScope(auth, spec.scope);
  existingDocId(id);
  const doc = await firestoreGet(env, `${collection}/${id}`);
  if (!doc) throw new ApiError(404, 'Diesen Eintrag gibt es nicht');
  if (!isOwn(doc)) {
    throw new ApiError(403, 'Über die API lässt sich nur löschen, was über die API angelegt wurde');
  }
  await firestoreCommit(env, [{ delete: docName(env, `${collection}/${id}`), currentDocument: { updateTime: doc._updateTime } }]);
  return { collection, id, deleted: true };
}

// ------------------------------------------------ Kostenauswertung

const GROUPINGS = ['category', 'trade', 'month', 'paidBy', 'paymentStatus', 'room'];

/**
 * Summen über die Kosten, wie die Übersicht in der App (costAggregation.ts): Brutto, jeder
 * Eintrag zählt, gleich welcher Zahlungsstatus. Eine Rechnung an zwei Räumen zählt bei
 * beiden – die Summe über die Räume ist dann größer als die Gesamtsumme.
 */
export function summarize(costs, catalog, params = {}) {
  const groupBy = params.groupBy ?? 'category';
  if (!GROUPINGS.includes(groupBy)) throw new ApiError(400, `groupBy: ${GROUPINGS.join(', ')}`);
  const from = optionalDate(params.from, 'from');
  const to = optionalDate(params.to, 'to');
  const category = resolveOption(catalog.options.costCategories, params.category, 'category');
  const tradeId = resolveObject(catalog.trades, params.trade ?? params.tradeId, 'trade');
  const paidBy = resolveOption(catalog.options.payers, params.paidBy, 'paidBy');
  const paymentStatus = resolveOption(catalog.options.paymentStatus, params.paymentStatus, 'paymentStatus');
  const roomId = resolveObject(catalog.rooms, params.room, 'room');

  const amount = (cost) => (Number.isFinite(cost.amountGross) ? cost.amountGross : 0);
  const chosen = costs.filter(
    (cost) =>
      (!from || String(cost.date) >= from) &&
      (!to || String(cost.date) <= to) &&
      (!category || cost.category === category) &&
      (!tradeId || cost.tradeId === tradeId) &&
      (!paidBy || cost.paidBy === paidBy) &&
      (!paymentStatus || cost.paymentStatus === paymentStatus) &&
      (!roomId || (cost.roomIds ?? []).includes(roomId)),
  );

  const labelIn = (entries, id, none) => (id ? (entries.find((e) => e.id === id)?.label ?? id) : none);
  const keysOf = {
    category: (c) => [[c.category || '', labelIn(catalog.options.costCategories, c.category, 'ohne Kategorie')]],
    trade: (c) => [[c.tradeId || '', c.tradeId ? (catalog.trades.find((t) => t.id === c.tradeId)?.name ?? c.tradeId) : 'ohne Gewerk']],
    month: (c) => [[String(c.date).slice(0, 7), String(c.date).slice(0, 7)]],
    paidBy: (c) => [[c.paidBy || '', labelIn(catalog.options.payers, c.paidBy, 'nicht angegeben')]],
    paymentStatus: (c) => [[c.paymentStatus || '', labelIn(catalog.options.paymentStatus, c.paymentStatus, 'nicht angegeben')]],
    room: (c) =>
      (c.roomIds?.length ? c.roomIds : ['']).map((id) => [id, id ? (catalog.rooms.find((r) => r.id === id)?.name ?? id) : 'ohne Raum']),
  }[groupBy];

  const groups = new Map();
  for (const cost of chosen) {
    for (const [key, label] of keysOf(cost)) {
      const group = groups.get(key) ?? { key, label, total: 0, count: 0 };
      group.total += amount(cost);
      group.count += 1;
      groups.set(key, group);
    }
  }
  let list = [...groups.values()].map((group) => ({ ...group, total: round2(group.total) }));
  if (groupBy === 'month') list.sort((a, b) => a.key.localeCompare(b.key));
  else list.sort((a, b) => b.total - a.total);
  if (groupBy === 'trade') {
    list = list.map((group) => {
      const found = catalog.trades.find((t) => t.id === group.key);
      if (!found || found.budgetPlanned === undefined) return { ...group, offer: found?.offer };
      return withoutUndefined({ ...group, budgetPlanned: found.budgetPlanned, offer: found.offer, remaining: round2(found.budgetPlanned - group.total) });
    });
  }
  const open = chosen.filter((cost) => cost.paymentStatus === 'offen');
  return {
    from,
    to,
    groupBy,
    total: round2(chosen.reduce((sum, cost) => sum + amount(cost), 0)),
    count: chosen.length,
    unpaid: { total: round2(open.reduce((sum, cost) => sum + amount(cost), 0)), count: open.length },
    groups: list,
  };
}

async function summarizeCosts(env, auth, params) {
  requireScope(auth, 'read');
  const [costs, catalog] = await Promise.all([
    firestoreQuery(env, { from: [{ collectionId: 'costs' }], limit: 10000 }),
    loadCatalog(env),
  ]);
  return summarize(costs, catalog, params);
}

// ------------------------------------------------ Suche

/**
 * Faltet Text wie die Suche der App (src/search/normalize.ts), vereinfacht: klein, ohne
 * Akzente, ä/ae → a, ß/ss → s, Tausender- und Datumspunkte zwischen Ziffern weg.
 */
export function fold(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[.,](?=\d)/g, '$1')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/ss/g, 's')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function haystack(spec, doc, extra = '') {
  return fold([...spec.search.map((key) => doc[key]), extra].filter((v) => typeof v === 'string' || typeof v === 'number').join(' '));
}

function matchesQuery(spec, doc, query, extra = '') {
  const text = haystack(spec, doc, extra);
  return fold(query).split(' ').filter(Boolean).every((word) => text.includes(word));
}

function snippet(spec, doc, query) {
  const first = fold(query).split(' ')[0] ?? '';
  for (const key of spec.search) {
    const value = doc[key];
    if (typeof value !== 'string' || !fold(value).includes(first)) continue;
    const at = Math.max(0, Math.round((fold(value).indexOf(first) / Math.max(fold(value).length, 1)) * value.length) - 80);
    const cut = value.slice(at, at + 240).replace(/\s+/g, ' ').trim();
    return `${at > 0 ? '…' : ''}${cut}${at + 240 < value.length ? '…' : ''}`;
  }
  return '';
}

async function searchEntries(env, auth, params) {
  requireScope(auth, 'read');
  const query = requiredText(params.query ?? params.q, 'query', 200);
  if (!fold(query)) throw new ApiError(400, 'query: keine Buchstaben oder Ziffern');
  const wanted = params.collections
    ? (Array.isArray(params.collections) ? params.collections : String(params.collections).split(','))
    : Object.keys(SPECS);
  for (const collection of wanted) specOf(collection);
  const limit = Math.min(Math.max(Number(params.limit ?? 20) || 20, 1), 50);

  const loaded = await Promise.all(
    wanted.map((collection) => firestoreQuery(env, { from: [{ collectionId: collection }], limit: 2000 }).then((docs) => [collection, docs])),
  );
  const contactNames = new Map();
  if (wanted.includes('contactLogs')) {
    const contacts = loaded.find(([c]) => c === 'contacts')?.[1] ?? (await firestoreQuery(env, { from: [{ collectionId: 'contacts' }], limit: 1000 }));
    for (const doc of contacts) contactNames.set(doc.id, [doc.name, doc.company].filter(Boolean).join(' '));
  }

  const hits = [];
  for (const [collection, docs] of loaded) {
    const spec = SPECS[collection];
    for (const doc of docs) {
      const extra = collection === 'contactLogs' ? (contactNames.get(doc.contactId) ?? '') : '';
      if (!matchesQuery(spec, doc, query, extra)) continue;
      hits.push(
        withoutUndefined({
          collection,
          id: doc.id,
          date: spec.dateField ? String(doc[spec.dateField] ?? '').slice(0, 10) : (doc.due ?? undefined),
          title: collection === 'contactLogs' && extra ? `Gespräch mit ${extra}` : spec.title(doc),
          snippet: snippet(spec, doc, query),
          link: appLink(env, collection, doc.id),
        }),
      );
    }
  }
  hits.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  return { query, count: hits.length, hits: hits.slice(0, limit) };
}

// ------------------------------------------------ REST: /api/v1/…

async function readBody(request) {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) throw new ApiError(413, 'Anfrage zu groß');
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new ApiError(413, 'Anfrage zu groß');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, 'Kein gültiges JSON');
  }
}

function bearer(request) {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function handleApi(request, url, env, ctx) {
  try {
    const auth = await authenticate(env, ctx, bearer(request));
    let parts;
    try {
      parts = url.pathname.slice('/api/v1'.length).split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      throw new ApiError(400, 'Ungültiger Pfad');
    }
    const [collection, id, action] = parts;
    const method = request.method;
    const params = Object.fromEntries(url.searchParams);

    if (parts.length === 0 && method === 'GET') {
      return json(200, { ok: true, token: { name: auth.name, scopes: auth.scopes, owner: auth.owner } });
    }
    if (collection === 'catalog' && parts.length === 1 && method === 'GET') {
      return json(200, publicCatalog(await loadCatalog(env)));
    }
    if (collection === 'search' && parts.length === 1 && method === 'GET') {
      return json(200, await searchEntries(env, auth, params));
    }
    if (collection === 'costs' && id === 'summary' && parts.length === 2 && method === 'GET') {
      return json(200, await summarizeCosts(env, auth, params));
    }
    if (SPECS[collection]) {
      if (parts.length === 1 && method === 'POST') return json(201, await createEntry(env, auth, collection, await readBody(request)));
      if (parts.length === 1 && method === 'GET') return json(200, { entries: await listEntries(env, auth, collection, params) });
      if (parts.length === 2 && method === 'PATCH') return json(200, await updateEntry(env, auth, collection, id, await readBody(request)));
      if (parts.length === 2 && method === 'DELETE') return json(200, await deleteEntry(env, auth, collection, id));
      if (collection === 'tasks' && action === 'done' && parts.length === 3 && method === 'POST') {
        return json(200, await completeTask(env, auth, id));
      }
    }
    throw new ApiError(404, 'Unbekannte Route');
  } catch (error) {
    return apiFailure(error);
  }
}

function apiFailure(error) {
  if (error instanceof ApiError) {
    const response = json(error.status, { error: error.message });
    if (error.status === 401) response.headers.set('www-authenticate', 'Bearer realm="reno-master"');
    return response;
  }
  console.error(error);
  return json(502, { error: 'Die Datenbank hat die Anfrage abgelehnt oder ist nicht erreichbar' });
}

// ------------------------------------------------ MCP: /mcp (Streamable HTTP, zustandslos)

const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const MCP_INSTRUCTIONS = [
  'Reno Master ist die Renovierungs-App für das Haus Schlesierstraße 31.',
  'Vor dem ersten Anlegen get_catalog aufrufen: dort stehen das heutige Datum, Kostenkategorien, Personen, Gewerke, Phasen und Räume.',
  'Auswahlwerte (category, paidBy, assignees, trade, rooms …) als Kennung oder genauen Namen aus dem Katalog angeben; unbekannte Werte lehnt der Server mit der Liste der möglichen ab.',
  'Beträge sind Brutto in Euro. Ohne Datumsangabe gilt heute (Europe/Berlin).',
  'Nach dem Anlegen oder Ändern kurz bestätigen, was eingetragen wurde, mit dem Link aus der Antwort.',
  'Ein Tagebucheintrag für einen Tag, an dem es schon einen gibt, wird an diesen angehängt.',
  'Korrekturen mit update_entry statt löschen und neu anlegen. Selbst angelegte Einträge lassen sich ganz ändern, Einträge aus der App nur in wenigen Feldern und per appendText.',
  'Für ein Telefonat oder Treffen mit einem Handwerker create_contact_log; den Kontakt vorher mit list_entries (collection contacts, query) suchen.',
  'Fragen nach Ausgaben mit summarize_costs beantworten, nicht durch eigenes Zusammenzählen; Fragen nach früheren Ereignissen mit search.',
].join(' ');

const ref = (description) => ({ type: 'string', description });
const refs = (description) => ({ type: 'array', items: { type: 'string' }, description });
const ROOMS = refs('Räume der Planung (rooms im Katalog), ids oder Namen');
const COLLECTION_NAMES = Object.keys(SPECS);
const COLLECTION_HELP = 'costs Kosten, tasks Aufgaben, diary Tagebuch, notes Notizen, contacts Kontakte, contactLogs Gespräche';

const MCP_TOOLS = [
  {
    name: 'get_catalog',
    scope: null,
    description: 'Heutiges Datum und alle Auswahlwerte: Kostenkategorien, Zahlungsarten, Bezahlt von, Personen, Aufgabenbereiche, Status, Prioritäten, Wetter, Kontaktrollen, Gesprächsarten, Gewerke, Phasen und Räume.',
    inputSchema: { type: 'object', properties: {} },
    run: (env) => loadCatalog(env).then(publicCatalog),
  },
  {
    name: 'create_cost',
    scope: 'costs',
    description: 'Trägt eine Ausgabe (Einkauf, Rechnung) in die Kosten ein.',
    inputSchema: {
      type: 'object',
      properties: {
        amountGross: { type: 'number', description: 'Bruttobetrag in Euro' },
        vendor: ref('Händler oder Firma, z. B. Hornbach'),
        description: ref('was gekauft wurde'),
        category: ref('Kostenkategorie aus dem Katalog (options.costCategories)'),
        date: ref('JJJJ-MM-TT, ohne Angabe heute'),
        paidBy: ref('wer bezahlt hat (options.payers)'),
        paymentMethod: ref('Zahlungsart (options.paymentMethods)'),
        paymentStatus: ref('options.paymentStatus, ohne Angabe bezahlt'),
        trade: ref('Gewerk (trades), id oder Name'),
        rooms: ROOMS,
        vatRate: { type: 'number', enum: [0, 7, 19], description: 'MwSt.-Satz, nur wenn bekannt' },
        invoiceNumber: ref('Rechnungsnummer'),
        notes: ref('Anmerkungen'),
        id: ref('freiwillig: eigene id (8–40 Zeichen), macht eine Wiederholung unschädlich'),
      },
      required: ['amountGross'],
    },
    run: (env, auth, input) => createEntry(env, auth, 'costs', input),
  },
  {
    name: 'create_task',
    scope: 'tasks',
    description: 'Legt eine Aufgabe an.',
    inputSchema: {
      type: 'object',
      properties: {
        title: ref('Aufgabe in wenigen Worten'),
        notes: ref('Details'),
        due: ref('fällig am, JJJJ-MM-TT'),
        priority: ref('options.priority, ohne Angabe mittel'),
        status: ref('options.taskStatus, ohne Angabe offen'),
        assignees: refs('zuständige Personen (options.people)'),
        area: ref('Bereich (options.taskAreas)'),
        trade: ref('Gewerk (trades), id oder Name'),
        phase: ref('Phase (phases), id oder Name'),
        rooms: ROOMS,
        id: ref('freiwillig: eigene id, macht eine Wiederholung unschädlich'),
      },
      required: ['title'],
    },
    run: (env, auth, input) => createEntry(env, auth, 'tasks', input),
  },
  {
    name: 'create_diary_entry',
    scope: 'diary',
    description: 'Schreibt ins Bautagebuch. Gibt es für den Tag schon einen Eintrag, wird der Text dort angehängt.',
    inputSchema: {
      type: 'object',
      properties: {
        text: ref('was gemacht wurde, in ganzen Sätzen'),
        date: ref('JJJJ-MM-TT, ohne Angabe heute'),
        title: ref('Überschrift, ohne Angabe "Tagebuch TT.MM."'),
        present: refs('wer da war (options.people)'),
        weather: ref('options.weather'),
        defects: { type: 'boolean', description: 'Mängel festgestellt' },
        phase: ref('Phase (phases), id oder Name'),
        trades: refs('Gewerke (trades), ids oder Namen'),
        rooms: ROOMS,
        newEntry: { type: 'boolean', description: 'true: immer einen eigenen Eintrag anlegen statt anzuhängen' },
      },
      required: ['text'],
    },
    run: (env, auth, input) => createEntry(env, auth, 'diary', input),
  },
  {
    name: 'create_note',
    scope: 'notes',
    description: 'Legt eine kurze Notiz an.',
    inputSchema: {
      type: 'object',
      properties: { text: ref('Inhalt der Notiz'), pinned: { type: 'boolean', description: 'oben anheften' }, rooms: ROOMS },
      required: ['text'],
    },
    run: (env, auth, input) => createEntry(env, auth, 'notes', input),
  },
  {
    name: 'create_contact',
    scope: 'contacts',
    description: 'Legt einen Kontakt an (Handwerker, Firma, Berater). Vorher mit list_entries prüfen, ob es ihn schon gibt.',
    inputSchema: {
      type: 'object',
      properties: {
        name: ref('Name der Person, sonst der Firma'),
        company: ref('Firma'),
        roles: refs('Rollen (options.contactRoles)'),
        phone: ref('Telefon'),
        email: ref('E-Mail'),
        trades: refs('Gewerke (trades), ids oder Namen'),
        status: ref('options.contactStatus'),
        notes: ref('Anmerkungen'),
      },
      required: ['name'],
    },
    run: (env, auth, input) => createEntry(env, auth, 'contacts', input),
  },
  {
    name: 'create_contact_log',
    scope: 'contacts',
    description: 'Hält ein Gespräch fest (Anruf, Termin, Nachricht) – im Gesprächsprotokoll, beim Kontakt.',
    inputSchema: {
      type: 'object',
      properties: {
        contact: ref('Kontakt: id, Name oder Firma (list_entries collection contacts); leer = ohne Kontakt'),
        text: ref('was besprochen wurde, mit Absprachen und Terminen'),
        at: ref('JJJJ-MM-TT oder JJJJ-MM-TTThh:mm, ohne Angabe jetzt'),
        channel: ref('Gesprächsart (options.contactChannels)'),
        participants: refs('wer von uns dabei war (options.people)'),
      },
      required: ['text'],
    },
    run: (env, auth, input) => createEntry(env, auth, 'contactLogs', input),
  },
  {
    name: 'update_entry',
    scope: 'write',
    description:
      'Ändert einen Eintrag. Über diese Schnittstelle angelegte Einträge: alle Felder wie beim Anlegen (null leert ein Feld). ' +
      'Einträge aus der App nur: Kosten paymentStatus, paidBy, paymentMethod; Aufgaben status, due, priority, assignees; ' +
      'Notizen pinned; Kontakte phone, email, status – und überall appendText (hängt einen Absatz an Text oder Notizen an).',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', enum: COLLECTION_NAMES, description: COLLECTION_HELP },
        id: ref('id des Eintrags'),
        changes: { type: 'object', description: 'die zu ändernden Felder, Namen wie beim Anlegen' },
        appendText: ref('Absatz, der an den Text (Tagebuch, Notiz, Gespräch) oder die Notizen (Kosten, Aufgabe, Kontakt) angehängt wird'),
      },
      required: ['collection', 'id'],
    },
    run: (env, auth, input) =>
      updateEntry(env, auth, String(input.collection ?? ''), input.id, {
        ...(input.changes && typeof input.changes === 'object' ? input.changes : {}),
        ...(input.appendText !== undefined ? { appendText: input.appendText } : {}),
      }),
  },
  {
    name: 'complete_task',
    scope: 'tasks',
    description: 'Hakt eine Aufgabe als erledigt ab (id aus list_entries oder search).',
    inputSchema: { type: 'object', properties: { id: ref('id der Aufgabe') }, required: ['id'] },
    run: (env, auth, input) => completeTask(env, auth, input.id),
  },
  {
    name: 'list_entries',
    scope: 'read',
    description: 'Liest die letzten Einträge einer Sammlung, neueste zuerst. Aufgaben: die offenen, nach Fälligkeit. Kontakte: alphabetisch.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', enum: COLLECTION_NAMES, description: COLLECTION_HELP },
        since: ref('JJJJ-MM-TT: nur ab diesem Datum (nicht bei Aufgaben und Kontakten)'),
        query: ref('nur Einträge, die diese Wörter enthalten'),
        contact: ref('nur bei contactLogs: Gespräche mit diesem Kontakt'),
        limit: { type: 'number', description: 'höchstens so viele, Standard 20, maximal 100' },
        open: { type: 'boolean', description: 'nur bei Aufgaben: false zeigt auch erledigte' },
      },
      required: ['collection'],
    },
    run: (env, auth, input) => listEntries(env, auth, String(input.collection ?? ''), input).then((entries) => ({ entries })),
  },
  {
    name: 'search',
    scope: 'read',
    description: 'Sucht Wörter in allen Einträgen (Tagebuch, Kosten, Aufgaben, Notizen, Kontakte, Gespräche), z. B. "Estrich" oder "Müller Angebot". Neueste zuerst.',
    inputSchema: {
      type: 'object',
      properties: {
        query: ref('Suchwörter; alle müssen vorkommen, Wortteile zählen'),
        collections: { type: 'array', items: { type: 'string', enum: COLLECTION_NAMES }, description: 'nur in diesen suchen' },
        limit: { type: 'number', description: 'höchstens so viele Treffer, Standard 20' },
      },
      required: ['query'],
    },
    run: (env, auth, input) => searchEntries(env, auth, input),
  },
  {
    name: 'summarize_costs',
    scope: 'read',
    description: 'Summen der Kosten (brutto), gruppiert und gefiltert – für Fragen wie "Was hat die Elektrik bisher gekostet?". Bei groupBy trade mit Budget und Rest.',
    inputSchema: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: GROUPINGS, description: 'Standard category' },
        from: ref('JJJJ-MM-TT, ab einschließlich'),
        to: ref('JJJJ-MM-TT, bis einschließlich'),
        category: ref('nur diese Kategorie'),
        trade: ref('nur dieses Gewerk'),
        paidBy: ref('nur von dieser Person bezahlt'),
        paymentStatus: ref('nur dieser Zahlungsstatus'),
        room: ref('nur dieser Raum'),
      },
    },
    run: (env, auth, input) => summarizeCosts(env, auth, input),
  },
  {
    name: 'delete_entry',
    scope: 'write',
    description: 'Löscht einen Eintrag, der über diese Schnittstelle angelegt wurde. Einträge aus der App bleiben unberührt. Für Korrekturen besser update_entry.',
    inputSchema: {
      type: 'object',
      properties: { collection: { type: 'string', enum: COLLECTION_NAMES, description: COLLECTION_HELP }, id: ref('id des Eintrags') },
      required: ['collection', 'id'],
    },
    run: (env, auth, input) => deleteEntry(env, auth, String(input.collection ?? ''), input.id),
  },
];

const WRITE_SCOPES = ['costs', 'tasks', 'diary', 'notes', 'contacts'];

function toolAllowed(tool, auth) {
  if (tool.scope === 'write') return WRITE_SCOPES.some((scope) => auth.scopes.includes(scope));
  return !tool.scope || auth.scopes.includes(tool.scope);
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function mcpMessage(message, auth, env) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message?.id ?? null, -32600, 'Invalid Request');
  }
  const { id, method, params = {} } = message;
  if (id === undefined || id === null) return null; // Benachrichtigung: keine Antwort

  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'reno-master', title: 'Reno Master', version: '1.1.0' },
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, {
        tools: MCP_TOOLS.filter((tool) => toolAllowed(tool, auth)).map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case 'tools/call': {
      const tool = MCP_TOOLS.find((entry) => entry.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unbekanntes Werkzeug: ${params.name}`);
      try {
        if (!toolAllowed(tool, auth)) throw new ApiError(403, 'Dieses Token darf das nicht');
        const input = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
        const result = await tool.run(env, auth, input);
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        if (!(error instanceof ApiError)) console.error(error);
        const text = error instanceof ApiError ? error.message : 'Die Datenbank hat die Anfrage abgelehnt oder ist nicht erreichbar';
        return rpcResult(id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Unbekannte Methode: ${method}`);
  }
}

/**
 * MCP für Claude. Das Token kommt als Bearer-Kopfzeile (Claude Code, eigene Clients)
 * oder als letzter Pfadteil `/mcp/<token>` – die Connector-Maske in claude.ai kann keine
 * Kopfzeilen setzen. Die Adresse ist dann selbst das Geheimnis.
 */
async function handleMcp(request, url, env, ctx) {
  if (request.method !== 'POST') {
    return new Response('Nur POST (Streamable HTTP ohne Ereignisstrom)', { status: 405, headers: { allow: 'POST' } });
  }
  try {
    const fromPath = url.pathname.startsWith('/mcp/') ? decodeURIComponent(url.pathname.slice('/mcp/'.length)) : '';
    const auth = await authenticate(env, ctx, fromPath || bearer(request));
    const body = await readBody(request).catch(() => undefined);
    if (body === undefined) return json(400, rpcError(null, -32700, 'Parse error'));
    const messages = Array.isArray(body) ? body : [body];
    const replies = [];
    for (const message of messages) {
      const reply = await mcpMessage(message, auth, env);
      if (reply) replies.push(reply);
    }
    if (replies.length === 0) return new Response(null, { status: 202 });
    return json(200, Array.isArray(body) ? replies : replies[0]);
  } catch (error) {
    return apiFailure(error);
  }
}

// ---------------------------------------------------------------- Werkzeug

/**
 * Nur die Pfade, die die App selbst vergibt. Ohne diese Prüfung könnte ein Pfad mit ".."
 * oder führendem Schrägstrich anderswo landen, als er soll.
 */
export function validPath(path) {
  if (!path || path.length > 200) return false;
  if (path.startsWith('/') || path.includes('..') || path.includes('//')) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(path);
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,PUT,POST,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type,mcp-protocol-version,mcp-session-id');
  headers.set('access-control-max-age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

function text(status, message) {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
