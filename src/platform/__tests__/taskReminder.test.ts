import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTaskReminderForTask, applyTaskReminderPlan, cancelTaskReminderForTask, watchTaskReminderActions } from '../taskReminder';

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

  it('applies overlapping plans one after the other, so the newer one stands', async () => {
    const standing = new Set<number>();
    let slow = true;
    const api = {
      // the first run stalls before it reads the pending alarms, like a busy bridge
      registerActionTypes: vi.fn(async () => {
        if (!slow) return;
        slow = false;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }),
      getPending: vi.fn(async () => ({ notifications: [...standing].map((id) => ({ id })) })),
      cancel: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        notifications.forEach(({ id }) => standing.delete(id));
      }),
      schedule: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
        notifications.forEach(({ id }) => standing.add(id));
      }),
      addListener: vi.fn(),
    };
    setLocalNotifications(api);
    standing.add(8_000_123);

    const first = applyTaskReminderPlan([]);
    const second = applyTaskReminderPlan([
      { id: 8_000_123, taskId: 'task-1', title: 'Mittag', at: new Date('2099-09-25T12:00:00') },
    ]);
    await Promise.all([first, second]);

    expect([...standing]).toEqual([8_000_123]);
  });

  it('still schedules reminders when registering the done action fails', async () => {
    const api = {
      registerActionTypes: vi.fn().mockRejectedValue(new Error('Aktion nicht verfügbar')),
      getPending: vi.fn().mockResolvedValue({ notifications: [] }),
      cancel: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
      addListener: vi.fn(),
    };
    setLocalNotifications(api);

    await applyTaskReminderPlan([
      { id: 8_000_123, taskId: 'task-1', title: 'Fenster pruefen', at: new Date('2026-09-19T08:00:00') },
    ]);

    expect(api.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({ id: 8_000_123 })] });
  });

  it('schedules one saved task directly', async () => {
    const api = {
      checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
      registerActionTypes: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
    };
    setLocalNotifications(api);

    await applyTaskReminderForTask({
      id: 'task-1', title: 'Fenster pruefen', status: 'Offen', priority: 'Mittel', assignees: [], roomIds: [],
      reminderAt: '2099-09-19T08:00:00',
    });

    expect(api.checkPermissions).toHaveBeenCalled();
    expect(api.cancel).toHaveBeenCalledWith({ notifications: [{ id: expect.any(Number) }] });
    expect(api.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({ title: 'Aufgabe', body: 'Fenster pruefen' })],
    });
  });

  it('asks for notification permission when a saved task needs a reminder', async () => {
    const api = {
      checkPermissions: vi.fn().mockResolvedValue({ display: 'prompt' }),
      requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
      cancel: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
    };
    setLocalNotifications(api);

    await applyTaskReminderForTask({
      id: 'task-1', title: 'Fenster pruefen', status: 'Offen', priority: 'Mittel', assignees: [], roomIds: [],
      reminderAt: '2099-09-19T08:00:00',
    });

    expect(api.requestPermissions).toHaveBeenCalled();
    expect(api.schedule).toHaveBeenCalled();
  });

  it('does not pop a permission prompt during the background list sync', async () => {
    const api = {
      checkPermissions: vi.fn().mockResolvedValue({ display: 'prompt' }),
      requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
      getPending: vi.fn(),
      cancel: vi.fn(),
      schedule: vi.fn(),
    };
    setLocalNotifications(api);

    await applyTaskReminderPlan([
      { id: 8_000_123, taskId: 'task-1', title: 'Fenster pruefen', at: new Date('2099-09-19T08:00:00') },
    ]);

    expect(api.requestPermissions).not.toHaveBeenCalled();
    expect(api.schedule).not.toHaveBeenCalled();
  });

  it('cancels one task reminder directly', async () => {
    const api = { cancel: vi.fn().mockResolvedValue(undefined) };
    setLocalNotifications(api);

    await cancelTaskReminderForTask('task-1');

    expect(api.cancel).toHaveBeenCalledWith({ notifications: [{ id: expect.any(Number) }] });
  });

  it('marks a task done from the notification action', async () => {
    const onDone = vi.fn().mockResolvedValue(undefined);
    let handler: ((event: { actionId?: string; notification: { extra?: unknown } }) => void) | undefined;
    const api = {
      getPending: vi.fn(),
      cancel: vi.fn(),
      schedule: vi.fn(),
      addListener: vi.fn().mockImplementation((_event: string, next: typeof handler) => {
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
