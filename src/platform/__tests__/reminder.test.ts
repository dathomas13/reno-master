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