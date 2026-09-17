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
 * The plugins are imported lazily so nothing of Capacitor ends up in the browser bundle.
 */
import { isNative } from '@/platform/index';
import {
  REMINDER_BODY,
  REMINDER_ROUTE,
  REMINDER_TITLE,
  TEST_REMINDER_ID,
  isReminderId,
  planReminders,
  type PlannedReminder,
  type ReminderInput,
} from './reminderPlan';

const LAST_SHOWN_KEY = 'reno.reminder.lastShown';

export type ReminderMode = 'native' | 'web' | 'none';

/** the part of the plugin's tap event this module reads */
interface TapEvent {
  notification: { extra?: unknown };
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

async function plugin() {
  if (!isNative()) return null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return LocalNotifications;
  } catch {
    // an older build without the plugin: the app stays usable, only the reminder is gone
    return null;
  }
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
    // private mode: the reminder may then show twice in a day, which is the harmless half
  }
}

/** 'granted' | 'denied' | 'prompt' - what the device says right now, without asking */
export async function reminderPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  const local = await plugin();
  if (local) {
    try {
      const { display } = await local.checkPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'prompt';
    }
  }
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

/**
 * Asks for the permission the running build actually needs.
 *
 * On the phone that is Android's notification permission - and nothing else, which is the
 * whole point: no Firebase project on a paid plan, no token, no server. The browser asks
 * for the same permission and, if the project happens to have push configured, registers
 * its token on top; that part may fail and the reminder still works while the app is open.
 */
export async function enableReminders(): Promise<ReminderResult> {
  const local = await plugin();
  if (local) {
    try {
      const { display } = await local.requestPermissions();
      if (display !== 'granted') {
        return {
          ok: false,
          message:
            'Android hat die Benachrichtigungen abgelehnt. Unter Einstellungen → Apps → Reno Master → Benachrichtigungen lässt sich das erlauben.',
        };
      }
      return { ok: true, message: 'Die App erinnert dich am Telefon, auch ohne Netz.' };
    } catch (error) {
      return { ok: false, message: messageOf(error) };
    }
  }

  if (typeof Notification === 'undefined') {
    return { ok: false, message: 'Dieses Gerät unterstützt keine Benachrichtigungen.' };
  }
  const permission = await Notification.requestPermission();
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Einrichtung fehlgeschlagen.';
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
  const local = await plugin();
  if (!local) return plan;

  try {
    const pending = await local.getPending();
    // annotated by hand: the plugin's types are only there once its package is installed
    const ours = pending.notifications
      .filter((notification: { id: number }) => isReminderId(notification.id) && notification.id !== TEST_REMINDER_ID)
      .map(({ id }: { id: number }) => ({ id }));
    if (ours.length > 0) await local.cancel({ notifications: ours });

    if (plan.length > 0) {
      await local.schedule({
        notifications: plan.map((reminder) => ({
          id: reminder.id,
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          // allowWhileIdle: the phone is in the pocket at eight in the evening, and doze
          // mode would otherwise hold the alarm back until it is next unlocked
          schedule: { at: reminder.at, allowWhileIdle: true },
          extra: { route: REMINDER_ROUTE, date: reminder.date },
        })),
      });
    }
  } catch {
    // no permission, or an Android version that refuses exact alarms: the app keeps
    // working, the reminder simply does not appear
  }
  return plan;
}

/** shows the reminder right now; used by the browser and by the test button */
export async function showReminderNow(date?: string): Promise<ReminderResult> {
  const local = await plugin();
  if (local) {
    try {
      await local.schedule({
        notifications: [
          {
            id: TEST_REMINDER_ID,
            title: REMINDER_TITLE,
            body: REMINDER_BODY,
            schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
            extra: { route: REMINDER_ROUTE },
          },
        ],
      });
      if (date) rememberShown(date);
      return { ok: true, message: 'Die Benachrichtigung kommt gleich.' };
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
 * A tap on the reminder opens the editor for today.
 *
 * The hash is set directly instead of going through the router: the tap usually starts the
 * app cold, and at that moment there is no router to talk to yet.
 */
export async function watchReminderTaps(): Promise<() => void> {
  const local = await plugin();
  if (!local) return () => undefined;
  try {
    const handle = await local.addListener('localNotificationActionPerformed', (event: TapEvent) => {
      const route = (event.notification.extra as { route?: string } | undefined)?.route;
      window.location.hash = `#${route ?? REMINDER_ROUTE}`;
    });
    return () => void handle.remove();
  } catch {
    return () => undefined;
  }
}
