/**
 * Personal access tokens for the API in worker/reno-files.js (PLAN.md 5.14). Pure: no
 * Firebase, no React, so it tests without either.
 *
 * A token is `reno_` plus 32 random bytes in base64url. The app shows it exactly once;
 * `meta/api-tokens` only keeps its SHA-256 hash, so neither the database nor an export
 * gives a usable token away. Revoking removes the entry, which the worker notices on the
 * next request.
 */

export type ApiScope = 'costs' | 'tasks' | 'diary' | 'notes' | 'contacts' | 'read';

/** the rights a token can carry, in the order the settings list them */
export const API_SCOPES: readonly { id: ApiScope; label: string }[] = [
  { id: 'costs', label: 'Kosten anlegen und ändern' },
  { id: 'tasks', label: 'Aufgaben anlegen und ändern' },
  { id: 'diary', label: 'Ins Tagebuch schreiben' },
  { id: 'notes', label: 'Notizen anlegen' },
  { id: 'contacts', label: 'Kontakte und Gespräche festhalten' },
  { id: 'read', label: 'Einträge lesen' },
];

/** document id below `meta` */
export const API_TOKEN_DOC = 'api-tokens';

export interface ApiTokenEntry {
  name: string;
  /** SHA-256 of the token, hex */
  hash: string;
  /** the first characters of the token, so a list can tell two tokens apart */
  hint: string;
  scopes: ApiScope[];
  /** ISO timestamps in UTC; the worker compares them, so no local time here */
  createdAt: string;
  createdBy: string;
  expiresAt?: string;
  /** written by the worker, at most once an hour */
  lastUsedAt?: string;
}

export interface ApiToken extends ApiTokenEntry {
  id: string;
}

export const TOKEN_PREFIX = 'reno_';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** a new secret: `reno_` + 43 characters, 256 bits of randomness */
export function generateApiToken(): string {
  return TOKEN_PREFIX + base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashApiToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function tokenHint(token: string): string {
  return `${token.slice(0, TOKEN_PREFIX.length + 4)}…`;
}

/** end of validity `days` from now, or none */
export function expiryAfter(days: number | null, now = new Date()): string | undefined {
  if (!days) return undefined;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isExpired(token: Pick<ApiTokenEntry, 'expiresAt'>, now = Date.now()): boolean {
  return !!token.expiresAt && !(Date.parse(token.expiresAt) > now);
}

function isScope(value: unknown): value is ApiScope {
  return API_SCOPES.some((scope) => scope.id === value);
}

/** the entries of `meta/api-tokens`, newest first; half written or foreign rows are skipped */
export function apiTokensOf(doc: { tokens?: unknown } | null | undefined): ApiToken[] {
  const raw = doc?.tokens;
  if (!raw || typeof raw !== 'object') return [];
  const result: ApiToken[] = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    // the worker's lastUsedAt can land on an entry that was revoked a moment before
    if (typeof entry.hash !== 'string' || typeof entry.createdAt !== 'string') continue;
    result.push({
      id,
      name: typeof entry.name === 'string' ? entry.name : '',
      hash: entry.hash,
      hint: typeof entry.hint === 'string' ? entry.hint : TOKEN_PREFIX,
      scopes: Array.isArray(entry.scopes) ? entry.scopes.filter(isScope) : [],
      createdAt: entry.createdAt,
      createdBy: typeof entry.createdBy === 'string' ? entry.createdBy : '',
      expiresAt: typeof entry.expiresAt === 'string' ? entry.expiresAt : undefined,
      lastUsedAt: typeof entry.lastUsedAt === 'string' ? entry.lastUsedAt : undefined,
    });
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** the addresses a client needs, from the file worker's base address */
export function apiAddresses(base: string, token?: string): { rest: string; mcp: string; mcpWithToken?: string } {
  const root = base.replace(/\/+$/, '');
  return {
    rest: `${root}/api/v1`,
    mcp: `${root}/mcp`,
    mcpWithToken: token ? `${root}/mcp/${token}` : undefined,
  };
}

/** '12.10.2026' for an ISO timestamp, in the device's time zone */
export function formatTokenDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
