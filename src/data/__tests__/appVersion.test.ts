import { describe, it, expect } from 'vitest';
import {
  newerVersions,
  notesParagraphs,
  shouldOfferUpdate,
  type RemoteVersion,
} from '@/data/appVersion';

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

describe('newerVersions', () => {
  const history = [
    { version: '0.17.1', build: 17001, sha: '', date: '2026-09-15', subject: 'Behebung' },
    { version: '0.17.0', build: 17000, sha: '', date: '2026-09-15', subject: 'Ordner-Export' },
    { version: '0.9.36', build: 9036, sha: '', date: '2026-09-15', subject: 'Notizen' },
  ];

  it('brings along what was skipped in between', () => {
    // updating from 0.9.36 to 0.17.1 also installs what 0.17.0 changed
    expect(newerVersions(9036, history).map((entry) => entry.version)).toEqual(['0.17.1', '0.17.0']);
  });

  it('leaves out what is already running', () => {
    expect(newerVersions(17001, history)).toEqual([]);
  });

  it('sorts newest first, whatever order it arrives in', () => {
    const shuffled = [history[2]!, history[0]!, history[1]!];
    expect(newerVersions(0, shuffled).map((entry) => entry.build)).toEqual([17001, 17000, 9036]);
  });

  it('does not flood the banner with years of history', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      version: `0.1.${index}`,
      build: 1000 + index,
      sha: '',
      date: '',
      subject: '',
    }));
    expect(newerVersions(0, many)).toHaveLength(12);
  });
});

describe('notesParagraphs', () => {
  it('joins the hard wrapped lines of a paragraph back together', () => {
    const notes = 'Die Suche sortiert ihre Treffer jetzt\nnach Bereichen.\n\nZweiter Absatz.';
    expect(notesParagraphs(notes)).toEqual([
      'Die Suche sortiert ihre Treffer jetzt nach Bereichen.',
      'Zweiter Absatz.',
    ]);
  });

  it('keeps a list readable instead of running it into one line', () => {
    expect(notesParagraphs('Neu:\n- Suche\n- Uploads')).toEqual(['Neu:\n- Suche\n- Uploads']);
  });

  it('has nothing to show for nothing', () => {
    expect(notesParagraphs(undefined)).toEqual([]);
    expect(notesParagraphs('   \n\n  ')).toEqual([]);
  });
});
