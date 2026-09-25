/**
 * When the evening reminder is due - the whole decision, with no device in it.
 *
 * The reminder used to depend on a Cloud Function: a server looked at the clock, asked
 * Firestore whether today already had an entry, and sent a push. That needs a paid plan
 * and, more to the point, it needs the phone to be online at exactly that minute - on a
 * building site the one thing you cannot count on.
 *
 * So the decision moves to the device. The app knows the configured time and it knows,
 * from the offline cache, which days already have an entry. From that it builds a list
 * of moments and hands them to Android, which wakes the phone by itself. Nothing here
 * touches the network, and nothing here touches a notification API either - it is plain
 * arithmetic, which is why it can be tested.
 */
import { addDays, formatDate, formatRelativeDay, parseClock, parseIsoDate, toIsoDate } from '@/lib/date';

export const REMINDER_TITLE = 'Bautagebuch';
export const REMINDER_BODY = 'Heute noch kein Eintrag – jetzt schreiben?';
export const REMINDER_ROUTE = '/tagebuch/neu';

/** how many days are handed to the operating system at once */
export const REMINDER_DAYS = 14;

/**
 * Android identifies a scheduled notification by a 32 bit number, and we have to be able
 * to name the one for a given day again later - to cancel it the moment an entry for
 * that day is written. So the id is derived from the date instead of being counted up.
 */
const ID_BASE = 7_000_000;

/** id of the reminder that asks about `date` ('YYYY-MM-DD') */
export function reminderId(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return ID_BASE + Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** the day an id was made for, or null when it is not one of ours */
export function dateOfReminderId(id: number): string | null {
  if (id < ID_BASE) return null;
  const at = new Date((id - ID_BASE) * 86_400_000);
  if (Number.isNaN(at.getTime())) return null;
  return at.toISOString().slice(0, 10);
}

/** the id used for the test notification from the settings screen */
export const TEST_REMINDER_ID = ID_BASE - 1;

/** true for every id this module hands out - everything else on the phone stays alone */
export function isReminderId(id: number): boolean {
  return id >= TEST_REMINDER_ID && id < ID_BASE + 1_000_000;
}

export interface PlannedReminder {
  id: number;
  /** the day the reminder asks about */
  date: string;
  /** local time it should fire */
  at: Date;
}

export interface ReminderInput {
  enabled: boolean;
  /** 'HH:mm' in local time */
  time: string;
  /** every day that already has a diary entry */
  datesWithEntry: readonly string[];
  now?: Date;
  /** how far ahead to plan; the default is a fortnight */
  days?: number;
}

/** 'YYYY-MM-DD' plus minutes since midnight as a local Date */
function atClock(date: string, minutes: number): Date {
  const at = parseIsoDate(date);
  at.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return at;
}

/**
 * The moments to hand to the operating system, earliest first.
 *
 * A day that already has an entry is left out - a reminder for something that is done is
 * the fastest way to get notifications switched off for good. So is a moment that has
 * already passed today: it is not announced again, it fires in the app (see `dueReminder`)
 * or not at all.
 */
export function planReminders({
  enabled,
  time,
  datesWithEntry,
  now = new Date(),
  days = REMINDER_DAYS,
}: ReminderInput): PlannedReminder[] {
  if (!enabled) return [];
  const minutes = parseClock(time);
  if (minutes === null) return [];

  const written = new Set(datesWithEntry.map((date) => date.slice(0, 10)));
  const start = toIsoDate(now);
  const plan: PlannedReminder[] = [];

  for (let offset = 0; offset < Math.max(0, days); offset += 1) {
    const date = addDays(start, offset);
    if (written.has(date)) continue;
    const at = atClock(date, minutes);
    if (at.getTime() <= now.getTime()) continue;
    plan.push({ id: reminderId(date), date, at });
  }
  return plan;
}

export interface DueInput extends ReminderInput {
  /** the day the app last showed the reminder itself */
  lastShown?: string;
}

/**
 * The reminder that is overdue right now, for the browser.
 *
 * A web page cannot wake itself: the service worker sleeps until a push arrives, and a
 * push is exactly what this is supposed to do without. What is left is honest and small -
 * while the app is open, it notices that the time has passed and says so. On the phone
 * the scheduled notification above does the real work.
 */
export function dueReminder({
  enabled,
  time,
  datesWithEntry,
  now = new Date(),
  lastShown,
}: DueInput): PlannedReminder | null {
  if (!enabled) return null;
  const minutes = parseClock(time);
  if (minutes === null) return null;

  const date = toIsoDate(now);
  if (lastShown === date) return null;
  if (datesWithEntry.some((entry) => entry.slice(0, 10) === date)) return null;

  const at = atClock(date, minutes);
  if (now.getTime() < at.getTime()) return null;
  return { id: reminderId(date), date, at };
}

/** 'HH:mm' of a moment, for the status line in the settings */
export function formatClock(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** 'heute um 20:00', 'morgen um 20:00', 'Do, 24.09.2026 um 20:00' */
export function describeReminder(reminder: PlannedReminder, now = new Date()): string {
  return `${formatRelativeDay(reminder.date, toIsoDate(now))} um ${formatClock(reminder.at)}`;
}

/**
 * What the device says about itself.
 *
 * The reminder lives on a phone nobody here can look at, and "nothing happens" is the
 * least useful bug report there is - it fits a missing permission, a plugin that never
 * loaded and a notification Android threw away, and those need opposite fixes. So the
 * settings screen asks the device these questions and shows the answers.
 */
export interface ReminderDiagnosis {
  /** who would show the reminder */
  mode: 'native' | 'web' | 'none';
  /** false when the app cannot reach the notification plugin at all */
  pluginReady: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'unbekannt';
  /** whether the phone lets the app set alarms to the minute */
  exactAlarms: 'erlaubt' | 'ungenau' | 'unbekannt';
  /** how many reminders really stand in the system right now */
  pending: number;
  /** the day of the earliest of them */
  nextPending: string | null;
  /** how many task reminders stand in the system */
  taskPending?: number;
  /** what went wrong, if anything did */
  error?: string;
}

/** the diagnosis in plain German, one line per fact */
export function describeDiagnosis(diagnosis: ReminderDiagnosis): string[] {
  const lines: string[] = [];

  if (diagnosis.mode === 'native') {
    lines.push(
      diagnosis.pluginReady
        ? 'App-Version: das Telefon stellt die Erinnerung selbst.'
        : 'App-Version, aber der Benachrichtigungsteil lässt sich nicht ansprechen.',
    );
  } else if (diagnosis.mode === 'web') {
    lines.push('Browser: erinnert nur, solange diese Seite offen ist.');
  } else {
    lines.push('Dieses Gerät kann keine Benachrichtigungen anzeigen.');
  }

  lines.push(
    `Erlaubnis: ${
      {
        granted: 'erteilt',
        denied: 'verweigert – in den Android-Einstellungen unter Apps → Reno Master → Benachrichtigungen freigeben',
        prompt: 'noch nicht erteilt',
        unbekannt: 'unbekannt',
      }[diagnosis.permission]
    }`,
  );

  if (diagnosis.mode === 'native') {
    if (diagnosis.exactAlarms === 'ungenau') {
      lines.push('Weckzeit: nur ungefähr – eine Erinnerung kann um Stunden später kommen.');
    } else if (diagnosis.exactAlarms === 'erlaubt') {
      lines.push('Weckzeit: auf die Minute genau.');
    }
    lines.push(
      diagnosis.pending === 0
        ? 'Gestellte Wecker: keine.'
        : `Gestellte Wecker: ${diagnosis.pending}${
            diagnosis.nextPending ? `, der nächste für den ${formatDate(diagnosis.nextPending)}` : ''
          }.`,
    );
    if (diagnosis.taskPending !== undefined) {
      lines.push(`Aufgaben-Wecker: ${diagnosis.taskPending === 0 ? 'keine' : diagnosis.taskPending}.`);
    }
  }

  if (diagnosis.error) lines.push(`Fehler: ${diagnosis.error}`);
  return lines;
}
