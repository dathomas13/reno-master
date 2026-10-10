import { createdAtMillis, type DiaryEntry } from '@/data/types';

/**
 * The entries of one day, newest first. Several entries a day are allowed; every "today"
 * button opens the same one - the newest - instead of whichever the database happened to
 * list first, and a new one for the same day is always offered separately.
 */
export function entriesOfDay(entries: readonly DiaryEntry[], date: string): DiaryEntry[] {
  return entries
    .filter((entry) => entry.date === date)
    .sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt) || b.id.localeCompare(a.id));
}

/** how much of what "Wie beim letzten Mal" copies an entry carries */
function carried(entry: DiaryEntry): number {
  return entry.present.length + entry.roomIds.length + entry.tradeIds.length + (entry.weather ? 1 : 0);
}

/**
 * The entry "Wie beim letzten Mal" copies from: the latest day before `date`, and of that
 * day's entries the one with the most people, rooms, trades and weather filled in - a
 * second entry that only notes a defect usually leaves those empty. On a tie the one
 * without defects wins, then the newest.
 */
export function previousEntryFor(
  entries: readonly DiaryEntry[],
  date: string,
  excludeId?: string,
): DiaryEntry | undefined {
  const before = entries.filter((entry) => entry.id !== excludeId && entry.date < date);
  const day = before.reduce((latest, entry) => (entry.date > latest ? entry.date : latest), '');
  return entriesOfDay(before, day).sort(
    (a, b) => carried(b) - carried(a) || Number(a.defects) - Number(b.defects),
  )[0];
}
