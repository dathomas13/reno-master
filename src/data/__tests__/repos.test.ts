import { describe, expect, it, vi } from 'vitest';
import { deleteField } from 'firebase/firestore';
import { saveDiaryEntry, saveTask, toggleTaskDone } from '@/data/repos';
import type { DiaryEntry, Task } from '@/data/types';

const saveDoc = vi.hoisted(() => vi.fn());
const rememberDiaryReminderDate = vi.hoisted(() => vi.fn());
const cancelDiaryReminderForDate = vi.hoisted(() => vi.fn());
const applyTaskReminderForTask = vi.hoisted(() => vi.fn());
const cancelTaskReminderForTask = vi.hoisted(() => vi.fn());

vi.mock('@/firebase/db', () => ({
  saveDoc,
  patchDoc: vi.fn(),
  removeDoc: vi.fn(),
}));
vi.mock('@/platform/diaryReminderMarker', () => ({ rememberDiaryReminderDate }));
vi.mock('@/platform/reminder', () => ({ cancelDiaryReminderForDate }));
vi.mock('@/platform/taskReminder', () => ({ applyTaskReminderForTask, cancelTaskReminderForTask }));

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

const task: Task = {
  id: 'task-1',
  title: 'Fenster pruefen',
  status: 'offen',
  priority: 'mittel',
  assignees: [],
  roomIds: [],
  reminderAt: '2026-09-19T08:00:00',
};

describe('diary repository', () => {
  it('suppresses the daily reminder without waiting for the server write', () => {
    saveDoc.mockReturnValue(new Promise(() => undefined));

    void saveDiaryEntry(entry);

    expect(rememberDiaryReminderDate).toHaveBeenCalledWith('2026-09-18');
    expect(cancelDiaryReminderForDate).toHaveBeenCalledWith('2026-09-18');
  });

  it('removes a phase or weather taken away instead of keeping the stored one', () => {
    saveDoc.mockClear();
    saveDoc.mockReturnValue(new Promise(() => undefined));

    void saveDiaryEntry({ ...entry, weather: 'sonnig' });

    const written = saveDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.weather).toBe('sonnig');
    expect(written.phaseId).toEqual(deleteField());
  });
});

describe('task repository', () => {
  it('applies a task reminder without waiting for the server write', () => {
    saveDoc.mockReturnValue(new Promise(() => undefined));

    void saveTask(task);

    expect(applyTaskReminderForTask).toHaveBeenCalledWith(task);
  });

  it('cancels a task reminder immediately when the task is completed', async () => {
    const patchDoc = (await import('@/firebase/db')).patchDoc as unknown as ReturnType<typeof vi.fn>;
    patchDoc.mockResolvedValue(undefined);

    await toggleTaskDone(task);

    expect(cancelTaskReminderForTask).toHaveBeenCalledWith('task-1');
  });
});