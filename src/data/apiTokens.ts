/**
 * Creating and revoking API tokens (PLAN.md 5.14). The format and the pure helpers are in
 * apiTokenFormat.ts; this file only writes `meta/api-tokens`.
 */
import { useMemo } from 'react';
import { COL } from './types';
import { useDocument } from './hooks';
import { removeMapEntries, setMapEntries } from '@/firebase/db';
import { newId } from '@/lib/ids';
import {
  API_TOKEN_DOC,
  apiTokensOf,
  expiryAfter,
  generateApiToken,
  hashApiToken,
  tokenHint,
  type ApiScope,
  type ApiToken,
  type ApiTokenEntry,
} from './apiTokenFormat';

export function useApiTokens(): { tokens: ApiToken[]; loading: boolean } {
  const { data, loading } = useDocument<{ tokens?: unknown }>(COL.meta, API_TOKEN_DOC);
  const tokens = useMemo(() => apiTokensOf(data), [data]);
  return { tokens, loading };
}

/**
 * Makes a token and stores its hash. The secret itself is only in the return value.
 * `saved` settles once the server has the entry - offline that is later, so the caller
 * shows the token at once and only reports a failure.
 */
export async function createApiToken(options: {
  name: string;
  scopes: ApiScope[];
  days: number | null;
  owner: string;
}): Promise<{ token: string; id: string; saved: Promise<void> }> {
  const token = generateApiToken();
  const id = newId();
  const entry: ApiTokenEntry = {
    name: options.name.trim() || 'Token',
    hash: await hashApiToken(token),
    hint: tokenHint(token),
    scopes: options.scopes,
    createdAt: new Date().toISOString(),
    createdBy: options.owner.toLowerCase(),
  };
  const expiresAt = expiryAfter(options.days);
  if (expiresAt) entry.expiresAt = expiresAt;
  const saved = setMapEntries(COL.meta, API_TOKEN_DOC, [
    { field: 'tokens', key: id, value: entry as unknown as Record<string, unknown> },
  ]);
  return { token, id, saved };
}

export function revokeApiToken(id: string): Promise<void> {
  return removeMapEntries(COL.meta, API_TOKEN_DOC, [{ field: 'tokens', key: id }]);
}

/** "Rückgängig" after revoking: the same entry again, so the same secret works again */
export function restoreApiToken(token: ApiToken): Promise<void> {
  const { id, ...entry } = token;
  const value = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));
  return setMapEntries(COL.meta, API_TOKEN_DOC, [{ field: 'tokens', key: id, value }]);
}
