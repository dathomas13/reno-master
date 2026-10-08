import { createdAtMillis, type DiaryEntry } from '@/data/types';

/**
 * The entries of one day, newest first. Usually there is one; when there are two (a
 * second one started by accident, or on purpose), every "today" button has to open the
 * same one - the newest - instead of whichever the database happened to list first.
 */
export function entriesOfDay(entries: readonly DiaryEntry[], date: string): DiaryEntry[] {
  return entries
    .filter((entry) => entry.date === date)
    .sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt) || b.id.localeCompare(a.id));
}
