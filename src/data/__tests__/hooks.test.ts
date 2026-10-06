import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firebase restores the session a moment after the first render. These tests play that
// restart: no account at mount, then the account arrives.
const authState = vi.hoisted(() => ({
  uid: null as string | null,
  listeners: new Set<() => void>(),
}));
const db = vi.hoisted(() => ({
  collectionCalls: 0,
  docCalls: 0,
  emit: null as ((rows: unknown[]) => void) | null,
  emitDoc: null as ((row: unknown) => void) | null,
}));

vi.mock('@/firebase/auth', () => ({
  currentUid: () => authState.uid,
  watchUser: (callback: () => void) => {
    authState.listeners.add(callback);
    return () => authState.listeners.delete(callback);
  },
}));
vi.mock('@/firebase/db', () => ({
  watchCollection: (_name: string, _constraints: unknown, next: (rows: unknown[]) => void) => {
    db.collectionCalls += 1;
    db.emit = next;
    return () => undefined;
  },
  watchDoc: (_name: string, _id: string, next: (row: unknown) => void) => {
    db.docCalls += 1;
    db.emitDoc = next;
    return () => undefined;
  },
}));

import { useCollection, useDocument } from '../hooks';

function signIn(uid: string) {
  act(() => {
    authState.uid = uid;
    authState.listeners.forEach((listener) => listener());
  });
}

beforeEach(() => {
  authState.uid = null;
  authState.listeners.clear();
  db.collectionCalls = 0;
  db.docCalls = 0;
  db.emit = null;
  db.emitDoc = null;
});

describe('useCollection across a restored session', () => {
  it('subscribes once the account is back, and is loading until the first snapshot', () => {
    const { result } = renderHook(() => useCollection<{ date: string }>('diary'));
    // nobody signed in yet: empty, nothing asked
    expect(result.current.loading).toBe(false);
    expect(db.collectionCalls).toBe(0);

    signIn('u1');
    // the old answer "empty" must not pass for the account's diary
    expect(result.current.loading).toBe(true);
    expect(db.collectionCalls).toBe(1);

    act(() => db.emit?.([{ date: '2026-10-06' }]));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([{ date: '2026-10-06' }]);
  });

  it('subscribes right away when the account is already there', () => {
    authState.uid = 'u1';
    const { result } = renderHook(() => useCollection('diary'));
    expect(result.current.loading).toBe(true);
    expect(db.collectionCalls).toBe(1);
  });
});

describe('useDocument across a restored session', () => {
  it('subscribes once the account is back', () => {
    const { result } = renderHook(() => useDocument<{ id: string }>('diary', 'e1'));
    expect(db.docCalls).toBe(0);
    signIn('u1');
    expect(result.current.loading).toBe(true);
    act(() => db.emitDoc?.({ id: 'e1' }));
    expect(result.current).toMatchObject({ loading: false, data: { id: 'e1' } });
  });

  it('is not loading without an id', () => {
    authState.uid = 'u1';
    const { result } = renderHook(() => useDocument('diary', undefined));
    expect(result.current.loading).toBe(false);
  });
});
