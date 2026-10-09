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
