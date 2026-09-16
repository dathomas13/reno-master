import { describe, expect, it } from 'vitest';
import {
  ImportFormatError,
  baseName,
  parseEntries,
  planImport,
  runImport,
  type ImportDeps,
  type NotionEntry,
  type RunInput,
} from '@/data/notionImport';
import type { DiaryEntry, Photo } from '@/data/types';

const PHASES = [
  { id: 'p2', name: 'Phase 2: Entkernung & Rückbau' },
  { id: 'p3', name: 'Phase 3: Rohbau & Keller' },
];
const TRADES = [{ id: 't1', name: 'Entkernung / Rückbau' }];

function entry(patch: Partial<NotionEntry> & { notionId: string; date: string }): NotionEntry {
  return { title: 'Tagebuch', text: '', present: [], defects: false, photos: [], ...patch };
}

function photoDoc(patch: Partial<Photo> & { id: string }): Photo {
  return {
    kind: 'photo',
    storagePath: `photos/${patch.id}.jpg`,
    contentType: 'image/jpeg',
    width: 1600,
    height: 1200,
    bytes: 1000,
    roomIds: [],
    uploadState: 'uploaded',
    ...patch,
  } as Photo;
}

/** records what the import would write, so the test can look at it */
function recorder() {
  const saved: DiaryEntry[] = [];
  const photos: { entryId: string; originalName: string; takenAt?: string; bytes: number }[] = [];
  const deletedEntries: string[] = [];
  const deletedPhotos: string[] = [];
  let counter = 0;
  const deps: ImportDeps = {
    saveEntry: async (value) => {
      saved.push(value);
      return value.id;
    },
    addPhoto: async (input) => {
      photos.push({
        entryId: input.entryId,
        originalName: input.originalName,
        takenAt: input.takenAt,
        bytes: input.file.size,
      });
      return `foto-${photos.length}`;
    },
    deleteEntry: async (id) => {
      deletedEntries.push(id);
    },
    deletePhoto: async (photo) => {
      deletedPhotos.push(photo.id);
    },
    newId: () => `id-${(counter += 1)}`,
  };
  return { deps, saved, photos, deletedEntries, deletedPhotos };
}

function runInput(patch: Partial<RunInput>): RunInput {
  return {
    entries: [],
    files: new Set(),
    blobs: new Map(),
    phases: PHASES,
    trades: TRADES,
    existing: 0,
    current: { entries: [], photos: [] },
    replace: false,
    ...patch,
  };
}

describe('parseEntries', () => {
  it('reads the fields of an export entry', () => {
    const [parsed] = parseEntries(
      JSON.stringify([
        {
          notionId: 'abc',
          date: '2026-09-04',
          title: 'Tagebuch 04.09',
          text: 'Zeile eins\nZeile zwei',
          weather: 'Bewölkt',
          present: ['Wolfgang'],
          defects: false,
          phaseName: 'Phase 2: Entkernung & Rückbau',
          photos: [{ file: 'files/20260904_181303.jpg', takenAt: '2026-09-04T18:13:03' }],
        },
      ]),
    );
    expect(parsed.date).toBe('2026-09-04');
    expect(parsed.text).toBe('Zeile eins\nZeile zwei');
    expect(parsed.present).toEqual(['Wolfgang']);
    expect(parsed.photos).toHaveLength(1);
  });

  it('names the entry that is broken instead of skipping it', () => {
    expect(() => parseEntries('[{"notionId":"a","date":"04.09.2026"}]')).toThrow(ImportFormatError);
    expect(() => parseEntries('[{"date":"2026-09-04"}]')).toThrow(/notionId/);
    expect(() => parseEntries('[{"notionId":"a","date":"2026-09-04","photos":[{}]}]')).toThrow(/Foto/);
  });

  it('refuses something that is not a list', () => {
    expect(() => parseEntries('{"date":"2026-09-04"}')).toThrow(ImportFormatError);
    expect(() => parseEntries('kein json')).toThrow(ImportFormatError);
  });
});

describe('baseName', () => {
  it('drops the folder a file picker does not keep', () => {
    expect(baseName('files/20260828_191245.jpg')).toBe('20260828_191245.jpg');
    expect(baseName('20260909_223745 1.jpg')).toBe('20260909_223745 1.jpg');
  });
});

describe('planImport', () => {
  it('says which pictures are missing and which were picked for nothing', () => {
    const plan = planImport({
      entries: [entry({ notionId: 'a', date: '2026-08-28', photos: [{ file: 'files/da.jpg' }, { file: 'files/weg.jpg' }] })],
      files: new Set(['da.jpg', 'uebrig.jpg']),
      phases: PHASES,
      trades: TRADES,
      existing: 0,
    });
    expect(plan.photos).toBe(2);
    expect(plan.missing).toEqual(['weg.jpg']);
    expect(plan.unused).toEqual(['uebrig.jpg']);
  });

  it('warns about values the app does not know', () => {
    const plan = planImport({
      entries: [
        entry({ notionId: 'a', date: '2026-08-28', weather: 'Nebel', phaseName: 'Phase 42' }),
        entry({ notionId: 'b', date: '2026-08-29', weather: 'Sonnig', phaseName: 'Phase 2: Entkernung & Rückbau' }),
      ],
      files: new Set(),
      phases: PHASES,
      trades: TRADES,
      existing: 3,
    });
    expect(plan.unknownWeather).toEqual(['Nebel']);
    expect(plan.unknownRelations).toEqual(['Phase 42']);
    expect(plan.replaces).toBe(3);
  });
});

describe('runImport', () => {
  it('writes entries with their photos and matches the phase by name', async () => {
    const { deps, saved, photos } = recorder();
    const result = await runImport(
      runInput({
        entries: [
          entry({
            notionId: 'n1',
            date: '2026-09-10',
            title: 'Tagebuch 10.09',
            text: 'Decke raus',
            weather: 'Bewölkt',
            present: ['Thomas', 'Peter'],
            phaseName: 'Phase 2: Entkernung & Rückbau',
            tradeNames: ['Entkernung / Rückbau'],
            photos: [{ file: 'files/bild.jpg', takenAt: '2026-09-09T22:37:45' }],
          }),
        ],
        files: new Set(['bild.jpg']),
        blobs: new Map([['bild.jpg', new Blob(['x'.repeat(20)])]]),
      }),
      deps,
    );

    expect(result).toEqual({ entries: 1, photos: 1, deleted: 0, skipped: [] });
    expect(saved[0].date).toBe('2026-09-10');
    expect(saved[0].title).toBe('Tagebuch 10.09');
    expect(saved[0].text).toBe('Decke raus');
    expect(saved[0].weather).toBe('Bewölkt');
    expect(saved[0].present).toEqual(['Thomas', 'Peter']);
    expect(saved[0].phaseId).toBe('p2');
    expect(saved[0].tradeIds).toEqual(['t1']);
    expect(saved[0].source).toBe('notion');
    expect(saved[0].notionId).toBe('n1');
    // die Fotos hängen am selben Eintrag, den sie tragen
    expect(saved[0].photoIds).toEqual(['foto-1']);
    expect(photos[0].entryId).toBe(saved[0].id);
    expect(photos[0].originalName).toBe('bild.jpg');
    expect(photos[0].takenAt).toBe('2026-09-09T22:37:45');
  });

  it('leaves out a weather the app does not know instead of storing it', async () => {
    const { deps, saved } = recorder();
    await runImport(
      runInput({ entries: [entry({ notionId: 'n', date: '2026-08-28', weather: 'Nebel', phaseName: 'gibt es nicht' })] }),
      deps,
    );
    expect(saved[0].weather).toBeUndefined();
    expect(saved[0].phaseId).toBeUndefined();
  });

  it('goes on when a picture was not picked and reports it', async () => {
    const { deps, saved } = recorder();
    const result = await runImport(
      runInput({
        entries: [entry({ notionId: 'n', date: '2026-08-28', photos: [{ file: 'files/fehlt.jpg' }] })],
      }),
      deps,
    );
    expect(result.skipped).toEqual(['fehlt.jpg']);
    expect(result.entries).toBe(1);
    expect(saved[0].photoIds).toEqual([]);
  });

  it('removes the old entries and their photos when replacing', async () => {
    const { deps, deletedEntries, deletedPhotos } = recorder();
    const result = await runImport(
      runInput({
        entries: [entry({ notionId: 'n', date: '2026-08-28' })],
        replace: true,
        current: {
          entries: [{ id: 'alt', date: '2026-08-28' } as DiaryEntry],
          photos: [
            photoDoc({ id: 'altFoto', entryId: 'alt' }),
            photoDoc({ id: 'beleg', kind: 'receipt', costId: 'k1' }),
            photoDoc({ id: 'fremd', entryId: 'anderer' }),
          ],
        },
      }),
      deps,
    );
    expect(deletedEntries).toEqual(['alt']);
    // der Beleg und das Foto eines fremden Eintrags bleiben unangetastet
    expect(deletedPhotos).toEqual(['altFoto']);
    expect(result.deleted).toBe(2);
  });

  it('touches nothing of the old data when not replacing', async () => {
    const { deps, deletedEntries, deletedPhotos } = recorder();
    await runImport(
      runInput({
        entries: [entry({ notionId: 'n', date: '2026-08-28' })],
        current: { entries: [{ id: 'alt' } as DiaryEntry], photos: [photoDoc({ id: 'altFoto', entryId: 'alt' })] },
      }),
      deps,
    );
    expect(deletedEntries).toEqual([]);
    expect(deletedPhotos).toEqual([]);
  });

  it('fetches a picture that was not picked, when an address is given', async () => {
    const { deps, saved, photos } = recorder();
    const geholt: string[] = [];
    const result = await runImport(
      runInput({
        entries: [entry({ notionId: 'n', date: '2026-09-09', photos: [{ file: 'files/20260909_223745 1.jpg' }] })],
      }),
      {
        ...deps,
        fetchPhoto: async (name) => {
          geholt.push(name);
          return new Blob(['bild']);
        },
      },
    );
    expect(geholt).toEqual(['20260909_223745 1.jpg']);
    expect(result.photos).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(saved[0].photoIds).toEqual(['foto-1']);
    expect(photos[0].originalName).toBe('20260909_223745 1.jpg');
  });

  it('takes the picked file and does not fetch when both would do', async () => {
    const { deps } = recorder();
    let geholt = 0;
    await runImport(
      runInput({
        entries: [entry({ notionId: 'n', date: '2026-08-28', photos: [{ file: 'files/da.jpg' }] })],
        blobs: new Map([['da.jpg', new Blob(['lokal'])]]),
      }),
      { ...deps, fetchPhoto: async () => { geholt += 1; return new Blob(['fern']); } },
    );
    expect(geholt).toBe(0);
  });

  it('goes on when the address does not have the picture either', async () => {
    const { deps } = recorder();
    const result = await runImport(
      runInput({ entries: [entry({ notionId: 'n', date: '2026-08-28', photos: [{ file: 'weg.jpg' }] })] }),
      { ...deps, fetchPhoto: async () => { throw new Error('404'); } },
    );
    expect(result.skipped).toEqual(['weg.jpg']);
    expect(result.entries).toBe(1);
  });

  it('counts every step for the progress bar', async () => {
    const { deps } = recorder();
    const steps: number[] = [];
    await runImport(
      runInput({
        entries: [
          entry({ notionId: 'a', date: '2026-08-28', photos: [{ file: 'a.jpg' }, { file: 'b.jpg' }] }),
          entry({ notionId: 'b', date: '2026-08-29' }),
        ],
        blobs: new Map([
          ['a.jpg', new Blob(['a'])],
          ['b.jpg', new Blob(['b'])],
        ]),
      }),
      deps,
      (progress) => steps.push(progress.done),
    );
    // zwei Einträge, zwei Fotos
    expect(steps).toEqual([1, 2, 3, 4]);
  });
});
