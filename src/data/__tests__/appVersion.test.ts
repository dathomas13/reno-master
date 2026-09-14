import { describe, it, expect } from 'vitest';
import { shouldOfferUpdate, type RemoteVersion } from '@/data/appVersion';

function remote(sha: string): RemoteVersion {
  return { sha, date: '2026-09-14', subject: 'irgendwas' };
}

describe('shouldOfferUpdate', () => {
  it('offers an update when the published commit differs', () => {
    expect(shouldOfferUpdate('aaa1111', remote('bbb2222'), null)).toBe(true);
  });

  it('stays quiet when the running build is the published one', () => {
    expect(shouldOfferUpdate('aaa1111', remote('aaa1111'), null)).toBe(false);
  });

  it('stays quiet once that version was waved away', () => {
    expect(shouldOfferUpdate('aaa1111', remote('bbb2222'), 'bbb2222')).toBe(false);
  });

  it('offers again when a further version arrives after one was waved away', () => {
    expect(shouldOfferUpdate('aaa1111', remote('ccc3333'), 'bbb2222')).toBe(true);
  });

  it('stays quiet without a usable answer', () => {
    expect(shouldOfferUpdate('aaa1111', null, null)).toBe(false);
    expect(shouldOfferUpdate('aaa1111', { sha: '', date: '', subject: '' }, null)).toBe(false);
  });

  it('stays quiet in a local development build', () => {
    expect(shouldOfferUpdate('dev', remote('bbb2222'), null)).toBe(false);
    expect(shouldOfferUpdate('', remote('bbb2222'), null)).toBe(false);
  });
});
