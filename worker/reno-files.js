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
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    try {
      if (url.pathname === '/link' && request.method === 'POST') {
        return cors(await handleLink(request, env));
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
  headers.set('access-control-allow-headers', 'authorization,content-type');
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
