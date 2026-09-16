import { describe, expect, it } from 'vitest';
import { belongsToRoom, photoDate, photosForRoom, sortByDate, type PhotoSource } from '@/data/photoRooms';
import type { Cost, DiaryEntry, Photo } from '@/data/types';

function photo(patch: Partial<Photo> & { id: string }): Photo {
  return {
    kind: 'photo',
    storagePath: `photos/${patch.id}.jpg`,
    contentType: 'image/jpeg',
    width: 1600,
    height: 1200,
    bytes: 400_000,
    roomIds: [],
    uploadState: 'uploaded',
    ...patch,
  };
}

function entry(patch: Partial<DiaryEntry> & { id: string; date: string }): DiaryEntry {
  return {
    title: 'Tagebuch',
    text: '',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
    ...patch,
  };
}

function cost(patch: Partial<Cost> & { id: string; date: string }): Cost {
  return {
    vendor: '',
    description: '',
    amountGross: 0,
    category: '',
    roomIds: [],
    paymentStatus: 'bezahlt',
    receiptPhotoIds: [],
    ...patch,
  };
}

const source: PhotoSource = {
  photos: [
    photo({ id: 'p1', entryId: 'd1', takenAt: '2026-09-13T10:00:00' }),
    photo({ id: 'p2', entryId: 'd2', takenAt: '2026-09-09T08:00:00' }),
    photo({ id: 'p3', costId: 'c1', kind: 'receipt' }),
    photo({ id: 'p4', roomIds: ['og.bad'] }),
    photo({ id: 'p5' }),
  ],
  entries: [
    entry({ id: 'd1', date: '2026-09-13', roomIds: ['og.bad'] }),
    entry({ id: 'd2', date: '2026-09-09', roomIds: ['eg.kueche'] }),
  ],
  costs: [cost({ id: 'c1', date: '2026-09-11', roomIds: ['og.bad'] })],
};

describe('photosForRoom', () => {
  it('finds the photos of the entries and receipts linked to the room', () => {
    expect(photosForRoom('og.bad', source).map((item) => item.id)).toEqual(['p1', 'p3', 'p4']);
  });

  it('keeps the rooms apart', () => {
    expect(photosForRoom('eg.kueche', source).map((item) => item.id)).toEqual(['p2']);
  });

  it('is empty for a room nothing points at', () => {
    expect(photosForRoom('kg.heizung', source)).toEqual([]);
  });

  it('answers the same question for a single photo', () => {
    expect(belongsToRoom(source.photos[0]!, 'og.bad', source)).toBe(true);
    expect(belongsToRoom(source.photos[1]!, 'og.bad', source)).toBe(false);
    // a photo that carries the room itself counts, whatever it hangs on
    expect(belongsToRoom(source.photos[3]!, 'og.bad', source)).toBe(true);
  });
});

describe('photoDate', () => {
  it('takes what the camera recorded', () => {
    expect(photoDate(source.photos[0]!, source)).toBe('2026-09-13');
  });

  it('falls back to the day of the entry, then of the receipt', () => {
    const noTime = photo({ id: 'x', entryId: 'd1' });
    expect(photoDate(noTime, source)).toBe('2026-09-13');
    expect(photoDate(source.photos[2]!, source)).toBe('2026-09-11');
  });

  it('has no date for a photo that hangs on nothing', () => {
    expect(photoDate(source.photos[4]!, source)).toBe('');
  });
});

describe('sortByDate', () => {
  it('puts the newest first and the dateless last', () => {
    const order = sortByDate(source.photos, source).map((item) => item.id);
    expect(order).toEqual(['p1', 'p3', 'p2', 'p4', 'p5']);
  });

  it('leaves the given array alone', () => {
    const rows = [...source.photos];
    sortByDate(rows, source);
    expect(rows.map((item) => item.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
});
