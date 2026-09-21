import { describe, expect, it } from 'vitest';
import {
  hasDiaryReminderDate,
  rememberDiaryReminderDate,
  rememberDiaryReminderDates,
} from '@/platform/diaryReminderMarker';

describe('diary reminder marker', () => {
  it('remembers the diary days a service worker can suppress', async () => {
    await rememberDiaryReminderDates(['2026-09-18', '2026-09-19T10:30:00', 'nonsense']);

    await expect(hasDiaryReminderDate('2026-09-18')).resolves.toBe(true);
    await expect(hasDiaryReminderDate('2026-09-19')).resolves.toBe(true);
    await expect(hasDiaryReminderDate('2026-09-20')).resolves.toBe(false);
  });

  it('replaces stale days when the diary query changes', async () => {
    await rememberDiaryReminderDates(['2026-09-18']);
    await rememberDiaryReminderDates(['2026-09-20']);

    await expect(hasDiaryReminderDate('2026-09-18')).resolves.toBe(false);
    await expect(hasDiaryReminderDate('2026-09-20')).resolves.toBe(true);
  });

  it('adds one freshly saved day without waiting for the diary query', async () => {
    await rememberDiaryReminderDates(['2026-09-18']);
    await rememberDiaryReminderDate('2026-09-21');

    await expect(hasDiaryReminderDate('2026-09-18')).resolves.toBe(true);
    await expect(hasDiaryReminderDate('2026-09-21')).resolves.toBe(true);
  });
});