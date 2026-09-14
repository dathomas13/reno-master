import { describe, expect, it } from 'vitest';
import {
  archiveName,
  diaryToMarkdown,
  formatSize,
  photoFileName,
  planExport,
  safeName,
  type ExportSource,
} from '@/data/exportArchive';
import type { DiaryEntry, Photo } from '@/data/types';

function entry(patch: Partial<DiaryEntry> & { id: string; date: string }): DiaryEntry {
  return {
    title: `Tagebuch ${patch.date.slice(8, 10)}.${patch.date.slice(5, 7)}.`,
    text: '',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
    source: 'app',
    ...patch,
  } as DiaryEntry;
}

function photo(patch: Partial<Photo> & { id: string }): Photo {
  return {
    kind: 'photo',
    storagePath: `photos/${patch.id}.jpg`,
    contentType: 'image/jpeg',
    width: 1600,
    height: 1200,
    bytes: 300_000,
    roomIds: [],
    uploadState: 'uploaded',
    ...patch,
  } as Photo;
}

const empty: ExportSource = {
  entries: [],
  photos: [],
  costs: [],
  tasks: [],
  contacts: [],
  trades: [],
};

describe('safeName', () => {
  it('drops the characters Windows refuses', () => {
    expect(safeName('Kabel: Küche/Bad *neu*?', 'x')).toBe('Kabel- Küche-Bad -neu--');
  });

  it('falls back when nothing usable is left', () => {
    expect(safeName('///', 'abc123')).toBe('abc123');
  });

  it('keeps names short enough for any file system', () => {
    expect(safeName('a'.repeat(200), 'x')).toHaveLength(60);
  });
});

describe('photoFileName', () => {
  it('sorts by day and keeps the order of the entry', () => {
    const name = photoFileName(
      photo({ id: 'p1', originalName: 'IMG_20260914_101500.jpg' }),
      0,
      entry({ id: 'e1', date: '2026-09-14' }),
    );
    expect(name).toBe('fotos/2026-09-14/01_IMG_20260914_101500.jpg');
  });

  it('puts receipts in their own folder', () => {
    const name = photoFileName(photo({ id: 'p2', kind: 'receipt' }), 2, entry({ id: 'e1', date: '2026-09-14' }));
    expect(name).toBe('belege/2026-09-14/03_p2.jpg');
  });

  it('uses the capture date when the photo hangs on no entry', () => {
    expect(photoFileName(photo({ id: 'p3', takenAt: '2026-08-22T18:00:00' }), 0)).toBe(
      'fotos/2026-08-22/01_p3.jpg',
    );
  });

  it('keeps the extension of a PDF receipt', () => {
    const name = photoFileName(photo({ id: 'p4', kind: 'receipt', contentType: 'application/pdf' }), 0);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('planExport', () => {
  it('takes the archived original where there is one', () => {
    const plan = planExport({
      ...empty,
      entries: [entry({ id: 'e1', date: '2026-09-14', photoIds: ['p1', 'p2'] })],
      photos: [
        photo({ id: 'p1', originalPath: 'photos/p1_original.jpg', originalBytes: 4_000_000 }),
        photo({ id: 'p2' }),
      ],
    });
    const first = plan.files.find((file) => file.name.includes('01_'));
    const second = plan.files.find((file) => file.name.includes('02_'));
    expect(first?.storagePath).toBe('photos/p1_original.jpg');
    expect(first?.bytes).toBe(4_000_000);
    expect(second?.storagePath).toBe('photos/p2.jpg');
    expect(plan.withoutOriginal).toBe(1);
  });

  it('counts only the files that have to be fetched', () => {
    const plan = planExport({
      ...empty,
      entries: [entry({ id: 'e1', date: '2026-09-14', photoIds: ['p1'] })],
      photos: [photo({ id: 'p1' })],
    });
    expect(plan.fileCount).toBe(1);
    expect(plan.files.some((file) => file.name === 'Bautagebuch.md')).toBe(true);
    expect(plan.totalBytes).toBeGreaterThan(300_000);
  });

  it('takes along a photo that belongs to no entry', () => {
    const plan = planExport({ ...empty, photos: [photo({ id: 'lose', takenAt: '2026-07-01T09:00:00' })] });
    expect(plan.files.some((file) => file.name === 'fotos/2026-07-01/01_lose.jpg')).toBe(true);
  });

  it('never lists a photo twice', () => {
    const plan = planExport({
      ...empty,
      entries: [entry({ id: 'e1', date: '2026-09-14', photoIds: ['p1'] })],
      photos: [photo({ id: 'p1', entryId: 'e1' })],
    });
    expect(plan.files.filter((file) => file.name.includes('p1') || file.name.includes('01_')).length).toBe(1);
  });

  it('works with nothing in it', () => {
    const plan = planExport(empty);
    expect(plan.fileCount).toBe(0);
    expect(plan.files.some((file) => file.name === 'LIESMICH.txt')).toBe(true);
  });
});

describe('diaryToMarkdown', () => {
  it('writes the days in the order they happened, with their photos', () => {
    const source: ExportSource = {
      ...empty,
      entries: [
        entry({ id: 'e2', date: '2026-09-14', text: 'Leerrohre gelegt.', photoIds: ['p1'] }),
        entry({ id: 'e1', date: '2026-08-22', text: 'Entkernung begonnen.', defects: true }),
      ],
    };
    const markdown = diaryToMarkdown(source, new Map([['p1', 'fotos/2026-09-14/01_kabel.jpg']]));
    expect(markdown.indexOf('22.08.2026')).toBeLessThan(markdown.indexOf('14.09.2026'));
    expect(markdown).toContain('Leerrohre gelegt.');
    expect(markdown).toContain('**Mängel festgehalten**');
    expect(markdown).toContain('- fotos/2026-09-14/01_kabel.jpg');
  });

  it('names the weekday, because that is how a site remembers a day', () => {
    const markdown = diaryToMarkdown({ ...empty, entries: [entry({ id: 'e1', date: '2026-09-14' })] }, new Map());
    expect(markdown).toContain('## Mo, 14.09.2026');
  });
});

describe('formatSize', () => {
  it('speaks in the unit that fits', () => {
    expect(formatSize(2_500_000_000)).toBe('2,3 GB');
    expect(formatSize(5_000_000)).toBe('5 MB');
    expect(formatSize(900)).toBe('1 KB');
  });
});

describe('archiveName', () => {
  it('carries the day it was made', () => {
    expect(archiveName(new Date('2026-09-14T22:00:00Z'))).toBe(
      'bautagebuch-schlesierstrasse-31-2026-09-14.zip',
    );
  });
});
