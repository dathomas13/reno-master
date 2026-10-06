import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelDiaryReminderForDate, reminderMode } from '@/platform/reminder';
import { reminderId } from '@/platform/reminderPlan';

const mocks = vi.hoisted(() => ({ native: true }));

vi.mock('@/platform/index', () => ({ isNative: () => mocks.native }));

function setLocalNotifications(api: unknown) {
  (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor = {
    isNativePlatform: () => mocks.native,
    Plugins: { LocalNotifications: api },
  } as { isNativePlatform: () => boolean; Plugins: { LocalNotifications: unknown } };
}

beforeEach(() => {
  mocks.native = true;
  vi.useRealTimers();
});

describe('diary reminder notifications', () => {
  it('cancels the scheduled reminder for the saved diary date directly', async () => {
    const api = { cancel: vi.fn().mockResolvedValue(undefined) };
    setLocalNotifications(api);

    expect(reminderMode()).toBe('native');
    await cancelDiaryReminderForDate('2026-09-18');

    expect(api.cancel).toHaveBeenCalledWith({ notifications: [{ id: reminderId('2026-09-18') }] });
  });

  it('does nothing outside the native app', async () => {
    const api = { cancel: vi.fn().mockResolvedValue(undefined) };
    setLocalNotifications(api);
    mocks.native = false;

    await cancelDiaryReminderForDate('2026-09-18');

    expect(api.cancel).not.toHaveBeenCalled();
  });
});
describe('applying the diary reminder plan', () => {
  it('runs one plan after the other, so an older plan cannot bring a written day back', async () => {
    const { applyReminderPlan } = await import('@/platform/reminder');
    const now = new Date(2026, 9, 6, 9, 0);
    const standing = new Set<number>();
    const calls: string[] = [];
    // the device answers in the order it was asked, a little later each time
    const later = <T,>(value: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(value()), 1));
    setLocalNotifications({
      getPending: vi.fn(() => {
        calls.push('getPending');
        return later(() => ({ notifications: [...standing].map((id) => ({ id })) }));
      }),
      cancel: vi.fn(({ notifications }: { notifications: { id: number }[] }) => {
        calls.push('cancel');
        return later(() => notifications.forEach(({ id }) => standing.delete(id)));
      }),
      schedule: vi.fn(({ notifications }: { notifications: { id: number }[] }) => {
        calls.push('schedule');
        return later(() => notifications.forEach(({ id }) => standing.add(id)));
      }),
    });

    const older = applyReminderPlan({ enabled: true, time: '20:00', datesWithEntry: [], now, days: 2 });
    const newer = applyReminderPlan({ enabled: true, time: '20:00', datesWithEntry: ['2026-10-06'], now, days: 2 });
    await Promise.all([older, newer]);

    expect(standing.has(reminderId('2026-10-06'))).toBe(false);
    expect(standing.has(reminderId('2026-10-07'))).toBe(true);
    expect(calls).toEqual(['getPending', 'schedule', 'getPending', 'cancel', 'schedule']);
  });
});
