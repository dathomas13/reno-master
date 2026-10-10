import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '@/data/types';
import { entriesOfDay, previousEntryFor } from '../entriesOfDay';

function entry(id: string, date: string, createdAt?: number): DiaryEntry {
  return {
    id,
    date,
    title: id,
    text: '',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
    createdAt: createdAt === undefined ? null : { toMillis: () => createdAt },
  };
}

describe('entries of a day', () => {
  it('lists only that day, newest first; one still being saved counts as newest', () => {
    const list = [entry('a', '2026-10-08', 1000), entry('b', '2026-10-07', 5000), entry('c', '2026-10-08', 2000), entry('d', '2026-10-08')];
    expect(entriesOfDay(list, '2026-10-08').map((item) => item.id)).toEqual(['d', 'c', 'a']);
  });
});

describe('the entry "Wie beim letzten Mal" copies from', () => {
  it('takes the latest earlier day and of its entries the one with the most filled in', () => {
    const full = { ...entry('diary', '2026-10-08', 1000), present: ['thomas', 'sarah'], weather: 'sonnig' };
    const defect = { ...entry('defect', '2026-10-08', 2000), defects: true, roomIds: ['kueche'] };
    const older = { ...entry('older', '2026-10-01', 500), present: ['thomas', 'sarah', 'wolfgang'], tradeIds: ['t1'] };
    expect(previousEntryFor([older, defect, full], '2026-10-09')?.id).toBe('diary');
  });

  it('prefers the entry without defects on a tie and never offers the entry itself or a later day', () => {
    const plain = entry('plain', '2026-10-08', 1000);
    const defect = { ...entry('defect', '2026-10-08', 2000), defects: true };
    expect(previousEntryFor([defect, plain], '2026-10-09')?.id).toBe('plain');
    expect(previousEntryFor([plain, entry('today', '2026-10-09')], '2026-10-09', 'today')?.id).toBe('plain');
    expect(previousEntryFor([entry('today', '2026-10-09')], '2026-10-09')).toBeUndefined();
  });
});
