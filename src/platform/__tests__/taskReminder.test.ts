import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTaskReminderPlan, watchTaskReminderActions } from '../taskReminder';

const mocks = vi.hoisted(() => ({ native: true }));

vi.mock('@/platform/index', () => ({ isNative: () => mocks.native }));

function setLocalNotifications(api: unknown) {
  (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor = {
    Plugins: { LocalNotifications: api },
  };
}

beforeEach(() => {
  mocks.native = true;
  vi.useRealTimers();
});

describe('task reminder notifications', () => {
  it('registers the done action and schedules task reminders', async () => {
    const api = {
      registerActionTypes: vi.fn().mockResolvedValue(undefined),
      getPending: vi.fn().mockResolvedValue({ notifications: [{ id: 8_000_001 }, { id: 7_000_001 }] }),
      cancel: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
      addListener: vi.fn(),
    };
    setLocalNotifications(api);

    await applyTaskReminderPlan([
      { id: 8_000_123, taskId: 'task-1', title: 'Fenster pruefen', at: new Date('2026-09-19T08:00:00') },
    ]);

    expect(api.registerActionTypes).toHaveBeenCalledWith({
      types: [{ id: 'task-reminder', actions: [{ id: 'task-done', title: 'Erledigt', foreground: true }] }],
    });
    expect(api.cancel).toHaveBeenCalledWith({ notifications: [{ id: 8_000_001 }] });
    expect(api.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: 8_000_123,
          title: 'Aufgabe',
          body: 'Fenster pruefen',
          actionTypeId: 'task-reminder',
          extra: { taskId: 'task-1', route: '/aufgaben?aufgabe=task-1' },
        }),
      ],
    });
  });

  it('marks a task done from the notification action', async () => {
    const onDone = vi.fn().mockResolvedValue(undefined);
    let handler: ((event: { actionId?: string; notification: { extra?: unknown } }) => void) | undefined;
    const api = {
      getPending: vi.fn(),
      cancel: vi.fn(),
      schedule: vi.fn(),
      addListener: vi.fn().mockImplementation((_event, next) => {
        handler = next;
        return Promise.resolve({ remove: vi.fn() });
      }),
    };
    setLocalNotifications(api);

    await watchTaskReminderActions(onDone);
    handler?.({ actionId: 'task-done', notification: { extra: { taskId: 'task-1' } } });

    expect(onDone).toHaveBeenCalledWith('task-1');
  });
});
