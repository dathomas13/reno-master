/** Date helpers. Everything is Europe/Berlin local time and German formatting. */

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** 'YYYY-MM-DD' for a Date in local time (never UTC, which would shift the day) */
export function toIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DDTHH:mm:ss' in local time */
export function toIsoDateTime(date: Date = new Date()): string {
  const t = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
    date.getSeconds(),
  ).padStart(2, '0')}`;
  return `${toIsoDate(date)}T${t}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function today(): string {
  return toIsoDate();
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** '13.09.2026' */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** 'Sa, 13.09.2026' */
export function formatDateWithWeekday(iso: string): string {
  return `${WEEKDAYS[parseIsoDate(iso).getDay()]}, ${formatDate(iso)}`;
}

/** '13. September 2026' */
export function formatDateLong(iso: string): string {
  const date = parseIsoDate(iso);
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** 'September 2026', used as the month separator in lists */
export function formatMonth(iso: string): string {
  const date = parseIsoDate(iso);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** '2026-09' */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** 'heute' / 'gestern' / 'Sa, 13.09.2026' */
export function formatRelativeDay(iso: string, reference = today()): string {
  if (iso === reference) return 'heute';
  if (iso === addDays(reference, -1)) return 'gestern';
  if (iso === addDays(reference, 1)) return 'morgen';
  return formatDateWithWeekday(iso);
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

/** grouping used by the task list */
export function dueBucket(due: string | undefined, reference = today()): DueBucket {
  if (!due) return 'none';
  if (due < reference) return 'overdue';
  if (due === reference) return 'today';
  if (due <= addDays(reference, 7)) return 'week';
  return 'later';
}

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  week: 'Diese Woche',
  later: 'Später',
  none: 'Ohne Datum',
};

/** 'HH:mm' -> minutes since midnight, or null when malformed */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
