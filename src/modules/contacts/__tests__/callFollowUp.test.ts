import { describe, expect, it } from 'vitest';
import { followUpPath, rememberCall, takeCallFollowUp, type PendingCall } from '../callFollowUp';

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const call: PendingCall = { contactId: 'c1', name: 'Elektro Maier', channel: 'anruf', at: 1_000_000 };

describe('note after a call', () => {
  it('offers the call once when the user is back within the window', () => {
    const storage = memory();
    rememberCall(call, storage);
    expect(takeCallFollowUp(call.at + 3 * 60_000, storage)).toEqual(call);
    expect(takeCallFollowUp(call.at + 4 * 60_000, storage)).toBeNull();
  });

  it('keeps a call that is too fresh for the next return', () => {
    const storage = memory();
    rememberCall(call, storage);
    expect(takeCallFollowUp(call.at + 1_000, storage)).toBeNull();
    expect(takeCallFollowUp(call.at + 60_000, storage)).toEqual(call);
  });

  it('drops a call that is too old without offering it', () => {
    const storage = memory();
    rememberCall(call, storage);
    expect(takeCallFollowUp(call.at + 31 * 60_000, storage)).toBeNull();
    expect(takeCallFollowUp(call.at + 32 * 60_000, storage)).toBeNull();
  });

  it('survives broken stored data', () => {
    const storage = memory();
    storage.setItem('reno.call.pending', '{kaputt');
    expect(takeCallFollowUp(call.at, storage)).toBeNull();
  });

  it('leads to the log editor with contact and channel', () => {
    expect(followUpPath(call)).toBe('/gespraeche?neu=1&kontakt=c1&kanal=anruf');
  });
});
