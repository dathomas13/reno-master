import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '@/data/types';
import { entriesOfDay } from '../entriesOfDay';

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
