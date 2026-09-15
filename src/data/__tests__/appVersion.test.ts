import { describe, it, expect } from 'vitest';
import { shouldOfferUpdate, type RemoteVersion } from '@/data/appVersion';

function remote(build: number): RemoteVersion {
  return {
    version: `0.9.${build}`,
    build,
    sha: 'abc1234',
    date: '2026-09-15',
    subject: 'irgendwas',
  };
}

describe('shouldOfferUpdate', () => {
  it('offers an update when the published build is newer', () => {
    expect(shouldOfferUpdate(34, remote(35), null)).toBe(true);
  });

  it('stays quiet when the running build is the published one', () => {
    expect(shouldOfferUpdate(34, remote(34), null)).toBe(false);
  });

  it('never offers a step backwards', () => {
    // this is what made the banner reappear after every update: the site lagged behind
    // and any difference counted as an update
    expect(shouldOfferUpdate(34, remote(33), null)).toBe(false);
  });

  it('stays quiet once that build was waved away', () => {
    expect(shouldOfferUpdate(34, remote(35), '35')).toBe(false);
  });

  it('offers again when a further build arrives after one was waved away', () => {
    expect(shouldOfferUpdate(34, remote(36), '35')).toBe(true);
  });

  it('stays quiet without a usable answer', () => {
    expect(shouldOfferUpdate(34, null, null)).toBe(false);
    expect(shouldOfferUpdate(34, { ...remote(35), build: Number.NaN }, null)).toBe(false);
  });

  it('offers the update to a build that predates the numbering', () => {
    // the installed app has no build number yet, so anything published is newer
    expect(shouldOfferUpdate(0, remote(35), null)).toBe(true);
  });
});
