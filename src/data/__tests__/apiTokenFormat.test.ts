import { describe, expect, it } from 'vitest';
import {
  API_SCOPES,
  apiAddresses,
  apiTokensOf,
  expiryAfter,
  generateApiToken,
  hashApiToken,
  isExpired,
  tokenHint,
} from '@/data/apiTokenFormat';

describe('API tokens', () => {
  it('have the format the worker accepts', () => {
    const token = generateApiToken();
    expect(token).toMatch(/^reno_[A-Za-z0-9_-]{43}$/);
    expect(generateApiToken()).not.toBe(token);
    expect(tokenHint(token)).toBe(`${token.slice(0, 9)}…`);
  });

  it('are stored as a SHA-256 hash', async () => {
    // known value: sha256("abc")
    expect(await hashApiToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('expire after the chosen days, or never', () => {
    const now = new Date('2026-10-12T10:00:00Z');
    expect(expiryAfter(30, now)).toBe('2026-11-11T10:00:00.000Z');
    expect(expiryAfter(null, now)).toBeUndefined();
    expect(isExpired({ expiresAt: '2026-10-12T09:59:59Z' }, now.getTime())).toBe(true);
    expect(isExpired({ expiresAt: '2026-10-12T10:00:01Z' }, now.getTime())).toBe(false);
    expect(isExpired({}, now.getTime())).toBe(false);
  });

  it('are read from meta/api-tokens, newest first, without broken rows', () => {
    const tokens = apiTokensOf({
      tokens: {
        a: { name: 'alt', hash: 'h1', createdAt: '2026-01-01T00:00:00Z', scopes: ['costs', 'unsinn'], createdBy: 't@x.de' },
        b: { name: 'neu', hash: 'h2', createdAt: '2026-10-01T00:00:00Z', scopes: ['read'], lastUsedAt: '2026-10-02T00:00:00Z' },
        // only lastUsedAt: the worker touched an entry that had just been revoked
        c: { lastUsedAt: '2026-10-02T00:00:00Z' },
        d: 'kaputt',
      },
    });
    expect(tokens.map((t) => t.id)).toEqual(['b', 'a']);
    expect(tokens[1].scopes).toEqual(['costs']);
    expect(tokens[0].lastUsedAt).toBe('2026-10-02T00:00:00Z');
    expect(apiTokensOf(null)).toEqual([]);
  });

  it('name every scope the worker knows', () => {
    expect(API_SCOPES.map((scope) => scope.id)).toEqual(['costs', 'tasks', 'diary', 'notes', 'contacts', 'read']);
  });

  it('give the client addresses', () => {
    expect(apiAddresses('https://w.example/', 'reno_x')).toEqual({
      rest: 'https://w.example/api/v1',
      mcp: 'https://w.example/mcp',
      mcpWithToken: 'https://w.example/mcp/reno_x',
    });
  });
});
