/**
 * The evening reminder as the device sees it.
 *
 * On the phone the plan from `reminderPlan.ts` is handed to Android: the operating system
 * keeps the alarms, wakes itself at the right minute and shows the notification. No server,
 * no Cloud Function, no network - it works in the cellar and in flight mode.
 *
 * In the browser none of that exists. A page cannot wake itself, so the web build does the
 * only honest thing: while the app is open it notices that the time has passed and says so.
 * The settings screen spells out that difference instead of pretending both are the same.
 *
 * Three rules hold everywhere in here, each of them written after a button that did
 * nothing at all on the phone:
 *   1. In the app, never fall back to the browser's Notification API. It exists in the
 *      Android WebView and looks usable, but its permission prompt can simply never
 *      answer - and a promise that never settles is a button that does nothing, forever.
 *   2. Every call to the device gets a deadline. A device that stays silent must produce
 *      a sentence, not a dead button.
 *   3. The test notification is posted immediately, never scheduled. An alarm one second
 *      out goes through Android's idle throttling and may arrive minutes later or not at
 *      all, which makes a working setup look broken.
 *
 * The plugin is reached through `Capacitor.Plugins`, the bridge the native side fills in,
 * and not with `import('@capacitor/local-notifications')`. The import was the first
 * attempt and it never resolved on the phone: fetching a chunk at runtime goes through
 * the service worker, and in the WebView that request does not come back - the app's own
 * diagnosis reported an eight second deadline hit before any permission was ever asked
 * for. `photos.ts` and `ocr/mlkit.ts` have always used the bridge, so this file now does
 * what already works here. The npm package stays in package.json: it carries the Android
 * side that `npx cap sync` puts into the APK.
 */
import { isNative } from '@/platform/index';
import {
  REMINDER_BODY,
  REMINDER_ROUTE,
  REMINDER_TITLE,
  TEST_REMINDER_ID,
  dateOfReminderId,
  isReminderId,
  planReminders,
  reminderId,
  type PlannedReminder,
  type ReminderDiagnosis,
  type ReminderInput,
} from './reminderPlan';
import { isTaskReminderId } from './taskReminderPlan';

const LAST_SHOWN_KEY = 'reno.reminder.lastShown';

/** how long the device may take before we say so instead of waiting on */
const DEVICE_TIMEOUT_MS = 8000;

export type ReminderMode = 'native' | 'web' | 'none';

/** the part of the plugin's tap event this module reads */
interface TapEvent {
  notification: { extra?: unknown };
}

interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  /** left out on purpose for the test notification, which must go out at once */
  schedule?: { at: Date; allowWhileIdle?: boolean };
  extra?: Record<string, unknown>;
}

/**
 * The slice of `@capacitor/local-notifications` this module uses, written out by hand.
 *
 * Naming it here instead of leaning on the package's own types keeps the file checkable
 * in a sandbox with no node_modules - the check that runs when the npm registry is out of
 * reach - and it states plainly which calls the reminder depends on.
 */
interface LocalNotificationsApi {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  schedule(options: { notifications: ScheduledNotification[] }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<unknown>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
  addListener(
    event: 'localNotificationActionPerformed',
    handler: (event: TapEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  /** only some plugin versions have it, so it stays optional */
  checkExactNotificationSetting?: () => Promise<{ exact_alarm?: string }>;
}

export interface ReminderResult {
  ok: boolean;
  message: string;
}

/** 'native' schedules with the operating system, 'web' only while the app is open */
export function reminderMode(): ReminderMode {
  if (isNative()) return 'native';
  if (typeof window !== 'undefined' && 'Notification' in window) return 'web';
  return 'none';
}

class DeviceSilent extends Error {
  constructor() {
    super('Das Gerät hat nicht geantwortet.');
    this.name = 'DeviceSilent';
  }
}

/** rejects with DeviceSilent instead of waiting for an answer that may never come */
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler.';
}

/** the day the browser last showed the reminder by itself */
export function lastShownDate(): string | undefined {
  try {
    return localStorage.getItem(LAST_SHOWN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberShown(date: string): void {
  try {
    localStorage.setItem(LAST_SHOWN_KEY, date);
  } catch {
    // private mode: the reminder may then show twice in a day, the harmless half
  }
}

/** 'granted' | 'denied' | 'prompt' - what the device says right now, without asking */
export async function reminderPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const local = plugin();
    if (local) {
      const { display } = await withDeadline(local.checkPermissions());
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    }
  } catch {
    return 'prompt';
  }
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

/**
 * Asks for the permission the running build actually needs.
 *
 * On the phone that is Android's notification permission - and nothing else, which is the
 * whole point: no Firebase project on a paid plan, no token, no server.
 */
export async function enableReminders(): Promise<ReminderResult> {
  if (isNative()) {
    try {
      const local = plugin();
      // rule 1: in the app there is no second way to ask, and pretending otherwise is
      // what made this button do nothing at all
      if (!local) return { ok: false, message: 'Der Benachrichtigungsteil der App fehlt in dieser Fassung.' };

      const { display } = await withDeadline(local.requestPermissions());
      if (display !== 'granted') {
        return {
          ok: false,
          message:
            'Android hat die Benachrichtigungen abgelehnt. Unter Einstellungen → Apps → Reno Master → Benachrichtigungen lässt sich das erlauben.',
        };
      }
      return { ok: true, message: 'Erlaubt. Die App erinnert dich jetzt auch ohne Netz.' };
    } catch (error) {
      return { ok: false, message: messageOf(error) };
    }
  }

  if (typeof Notification === 'undefined') {
    return { ok: false, message: 'Dieses Gerät unterstützt keine Benachrichtigungen.' };
  }
  let permission: NotificationPermission;
  try {
    permission = await withDeadline(Promise.resolve(Notification.requestPermission()));
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
  if (permission !== 'granted') {
    return { ok: false, message: 'Benachrichtigungen wurden abgelehnt.' };
  }
  // best effort: with a push project behind it the reminder can also arrive when the
  // browser is closed. Without one it stays the in-app reminder, which is the normal case.
  const { registerPushToken } = await import('./notifications');
  const pushed = await registerPushToken();
  return {
    ok: true,
    message: pushed
      ? 'Benachrichtigungen sind eingerichtet.'
      : 'Benachrichtigungen sind erlaubt. Im Browser erinnert die App, solange sie offen ist – am Telefon auch ohne Netz.',
  };
}

/**
 * Hands the next fortnight to the operating system.
 *
 * Everything this module scheduled before is withdrawn first: the configured time may have
 * moved, and an entry written for today has to take today's reminder with it. Returns the
 * plan it applied, so the caller can say what will happen next.
 */
export async function applyReminderPlan(input: ReminderInput): Promise<PlannedReminder[]> {
  const plan = planReminders(input);
  try {
    const local = plugin();
    if (!local) return plan;

    const pending = await withDeadline(local.getPending());
    const ours = pending.notifications
      .filter((notification) => isReminderId(notification.id) && notification.id !== TEST_REMINDER_ID)
      .map(({ id }) => ({ id }));
    if (ours.length > 0) await withDeadline(local.cancel({ notifications: ours }));

    if (plan.length > 0) {
      await withDeadline(
        local.schedule({
          notifications: plan.map((reminder) => ({
            id: reminder.id,
            title: REMINDER_TITLE,
            body: REMINDER_BODY,
            // allowWhileIdle: the phone is in the pocket at eight in the evening, and doze
            // mode would otherwise hold the alarm back until it is next unlocked
            schedule: { at: reminder.at, allowWhileIdle: true },
            extra: { route: REMINDER_ROUTE, date: reminder.date },
          })),
        }),
      );
    }
  } catch {
    // no permission yet, or a device that refuses alarms: the app keeps working and the
    // settings screen reports what really stands, instead of this guessing
  }
  return plan;
}

export async function cancelDiaryReminderForDate(date: string): Promise<void> {
  try {
    const local = plugin();
    if (!local) return;
    await withDeadline(local.cancel({ notifications: [{ id: reminderId(date) }] }));
  } catch {
    // Saving the diary entry must not fail because Android refused to touch alarms.
  }
}

/** shows the reminder right now; used by the browser and by the test button */
export async function showReminderNow(date?: string): Promise<ReminderResult> {
  if (isNative()) {
    try {
      const local = plugin();
      if (!local) return { ok: false, message: 'Der Benachrichtigungsteil der App fehlt in dieser Fassung.' };

      const { display } = await withDeadline(local.checkPermissions());
      if (display !== 'granted') {
        return {
          ok: false,
          message: 'Das Telefon lässt noch keine Benachrichtigungen zu – erst auf „Benachrichtigungen erlauben“ tippen.',
        };
      }

      // rule 3: no `schedule` at all, so Android posts it straight away. A one second
      // alarm would go through the idle throttling and can arrive minutes late.
      await withDeadline(
        local.schedule({
          notifications: [
            { id: TEST_REMINDER_ID, title: REMINDER_TITLE, body: REMINDER_BODY, extra: { route: REMINDER_ROUTE } },
          ],
        }),
      );
      if (date) rememberShown(date);
      return { ok: true, message: 'Die Benachrichtigung ist rausgegangen.' };
    } catch (error) {
      return { ok: false, message: messageOf(error) };
    }
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return { ok: false, message: 'Benachrichtigungen sind für diese Seite nicht erlaubt.' };
  }
  try {
    // through the service worker, so a tap lands in the diary instead of only focusing
    // the tab; without a registration the plain notification is still better than none
    const registration = await navigator.serviceWorker?.getRegistration();
    const options: NotificationOptions = {
      body: REMINDER_BODY,
      tag: 'reno-reminder',
      data: { route: REMINDER_ROUTE },
    };
    if (registration) await registration.showNotification(REMINDER_TITLE, options);
    else new Notification(REMINDER_TITLE, options);
    if (date) rememberShown(date);
    return { ok: true, message: 'Benachrichtigung gesendet.' };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/**
 * Asks the device what it will actually do, for the settings screen.
 *
 * Nobody here can look at the phone, so this is what turns "nothing happens" into
 * something that names the cause. It never throws: a failure is one of the answers.
 */
export async function reminderDiagnosis(): Promise<ReminderDiagnosis> {
  const mode = reminderMode();
  const diagnosis: ReminderDiagnosis = {
    mode,
    pluginReady: mode === 'web',
    permission: 'unbekannt',
    exactAlarms: 'unbekannt',
    pending: 0,
    nextPending: null,
  };

  if (mode !== 'native') {
    if (typeof Notification !== 'undefined') {
      diagnosis.permission = Notification.permission === 'default' ? 'prompt' : Notification.permission;
    }
    return diagnosis;
  }

  const local = plugin();
  if (!local) return diagnosis;
  diagnosis.pluginReady = true;

  try {
    const { display } = await withDeadline(local.checkPermissions());
    diagnosis.permission = display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  } catch (error) {
    diagnosis.error = messageOf(error);
  }

  try {
    const pending = await withDeadline(local.getPending());
    const days = pending.notifications
      .filter(({ id }) => isReminderId(id) && id !== TEST_REMINDER_ID)
      .map(({ id }) => dateOfReminderId(id))
      .filter((day): day is string => day !== null)
      .sort();
    diagnosis.pending = days.length;
    diagnosis.nextPending = days[0] ?? null;
    diagnosis.taskPending = pending.notifications.filter(({ id }) => isTaskReminderId(id)).length;
  } catch (error) {
    diagnosis.error ??= messageOf(error);
  }

  // only some plugin versions know this question; not knowing is an answer too
  try {
    const exact = local.checkExactNotificationSetting;
    if (exact) {
      const { exact_alarm: setting } = await withDeadline(exact.call(local));
      diagnosis.exactAlarms = setting === 'granted' ? 'erlaubt' : setting ? 'ungenau' : 'unbekannt';
    }
  } catch {
    // stays 'unbekannt', which is what the settings screen then says
  }

  return diagnosis;
}

/**
 * A tap on the reminder opens the editor for today.
 *
 * The hash is set directly instead of going through the router: the tap usually starts the
 * app cold, and at that moment there is no router to talk to yet.
 */
export async function watchReminderTaps(): Promise<() => void> {
  try {
    const local = plugin();
    if (!local) return () => undefined;
    const handle = await withDeadline(
      local.addListener('localNotificationActionPerformed', (event: TapEvent) => {
        const route = (event.notification.extra as { route?: string } | undefined)?.route;
        window.location.hash = `#${route ?? REMINDER_ROUTE}`;
      }),
    );
    return () => void handle.remove();
  } catch {
    return () => undefined;
  }
}
