import { isNative } from '@/platform/index';
import { isTaskReminderId, planTaskReminders, type PlannedTaskReminder } from './taskReminderPlan';

const TASK_ACTION_TYPE = 'task-reminder';
const TASK_DONE_ACTION = 'task-done';
const DEVICE_TIMEOUT_MS = 8000;

interface TapEvent {
  actionId?: string;
  notification: { extra?: unknown };
}

interface ScheduledTaskNotification {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; allowWhileIdle?: boolean };
  actionTypeId?: string;
  extra?: Record<string, unknown>;
}

interface LocalNotificationsApi {
  schedule(options: { notifications: ScheduledTaskNotification[] }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<unknown>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
  addListener(
    event: 'localNotificationActionPerformed',
    handler: (event: TapEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  registerActionTypes?(options: {
    types: { id: string; actions: { id: string; title: string; foreground?: boolean }[] }[];
  }): Promise<unknown>;
}

class DeviceSilent extends Error {
  constructor() {
    super('Das Gerät hat nicht geantwortet.');
    this.name = 'DeviceSilent';
  }
}

function withDeadline<T>(work: Promise<T>, ms = DEVICE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeviceSilent()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function plugin(): LocalNotificationsApi | null {
  if (!isNative()) return null;
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.LocalNotifications as LocalNotificationsApi | undefined) ?? null;
}

async function registerActions(local: LocalNotificationsApi): Promise<void> {
  if (!local.registerActionTypes) return;
  await withDeadline(
    local.registerActionTypes({
      types: [
        {
          id: TASK_ACTION_TYPE,
          actions: [{ id: TASK_DONE_ACTION, title: 'Erledigt', foreground: true }],
        },
      ],
    }),
  );
}

export async function applyTaskReminderPlan(tasks: readonly PlannedTaskReminder[]): Promise<void> {
  try {
    const local = plugin();
    if (!local) return;
    await registerActions(local);

    const pending = await withDeadline(local.getPending());
    const ours = pending.notifications
      .filter((notification) => isTaskReminderId(notification.id))
      .map(({ id }) => ({ id }));
    if (ours.length > 0) await withDeadline(local.cancel({ notifications: ours }));

    if (tasks.length === 0) return;
    await withDeadline(
      local.schedule({
        notifications: tasks.map((task) => ({
          id: task.id,
          title: 'Aufgabe',
          body: task.title || 'Aufgabe erledigen',
          schedule: { at: task.at, allowWhileIdle: true },
          actionTypeId: TASK_ACTION_TYPE,
          extra: { taskId: task.taskId, route: `/aufgaben?aufgabe=${task.taskId}` },
        })),
      }),
    );
  } catch {
    // Settings can diagnose the base notification setup; task edits must not fail because of alarms.
  }
}

export async function watchTaskReminderActions(
  onDone: (taskId: string) => Promise<void>,
): Promise<() => void> {
  try {
    const local = plugin();
    if (!local) return () => undefined;
    const handle = await withDeadline(
      local.addListener('localNotificationActionPerformed', (event) => {
        const extra = event.notification.extra as { taskId?: string; route?: string } | undefined;
        if (!extra?.taskId) return;
        if (event.actionId === TASK_DONE_ACTION) {
          void onDone(extra.taskId);
          window.location.hash = '#/aufgaben';
          return;
        }
        window.location.hash = `#${extra.route ?? `/aufgaben?aufgabe=${extra.taskId}`}`;
      }),
    );
    return () => void handle.remove();
  } catch {
    return () => undefined;
  }
}

export function plannedTaskRemindersLabel(tasks: readonly PlannedTaskReminder[]): string {
  if (tasks.length === 0) return 'Keine Aufgaben-Erinnerungen gestellt.';
  return `${tasks.length} Aufgaben-Erinnerung${tasks.length === 1 ? '' : 'en'} gestellt.`;
}

export { planTaskReminders };
