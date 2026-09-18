import { describe, expect, it, vi } from 'vitest';
import { saveDiaryEntry } from '@/data/repos';
import type { DiaryEntry } from '@/data/types';

const saveDoc = vi.hoisted(() => vi.fn());
const rememberDiaryReminderDate = vi.hoisted(() => vi.fn());
const cancelDiaryReminderForDate = vi.hoisted(() => vi.fn());

vi.mock('@/firebase/db', () => ({
  saveDoc,
  patchDoc: vi.fn(),
  removeDoc: vi.fn(),
}));
vi.mock('@/platform/diaryReminderMarker', () => ({ rememberDiaryReminderDate }));
vi.mock('@/platform/reminder', () => ({ cancelDiaryReminderForDate }));

const entry: DiaryEntry = {
  id: 'entry-1',
  date: '2026-09-18',
  title: 'Tagebuch',
  text: 'geschrieben',
  present: [],
  defects: false,
  tradeIds: [],
  roomIds: [],
  photoIds: [],
};

describe('diary repository', () => {
  it('suppresses the daily reminder without waiting for the server write', () => {
    saveDoc.mockReturnValue(new Promise(() => undefined));

    void saveDiaryEntry(entry);

    expect(rememberDiaryReminderDate).toHaveBeenCalledWith('2026-09-18');
    expect(cancelDiaryReminderForDate).toHaveBeenCalledWith('2026-09-18');
  });
});