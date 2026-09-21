import type { DiaryEntry } from '@/data/types';
import { formatDate } from '@/lib/date';

const KEY = 'reno.diary.draft.v1';

function defaultTitle(date: string): string {
  return `Tagebuch ${formatDate(date).slice(0, 6)}`;
}

function isDiaryEntry(value: unknown): value is DiaryEntry {
  const entry = value as Partial<DiaryEntry> | null;
  return Boolean(
    entry &&
      typeof entry.id === 'string' &&
      typeof entry.date === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.text === 'string' &&
      Array.isArray(entry.present) &&
      typeof entry.defects === 'boolean' &&
      Array.isArray(entry.tradeIds) &&
      Array.isArray(entry.roomIds) &&
      Array.isArray(entry.photoIds),
  );
}

export function hasDiaryDraftContent(entry: DiaryEntry, initialDate: string): boolean {
  return Boolean(
    entry.date !== initialDate ||
      (entry.title.trim() !== '' && entry.title.trim() !== defaultTitle(entry.date)) ||
      entry.text.trim() ||
      entry.weather ||
      entry.present.length > 0 ||
      entry.defects ||
      entry.tradeIds.length > 0 ||
      entry.roomIds.length > 0 ||
      entry.photoIds.length > 0,
  );
}

export function loadDiaryDraft(requestedDate?: string): DiaryEntry | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as unknown;
    if (!isDiaryEntry(entry)) return null;
    if (requestedDate && entry.date !== requestedDate) return null;
    return entry;
  } catch {
    return null;
  }
}

export function saveDiaryDraft(entry: DiaryEntry, initialDate: string): void {
  try {
    if (!hasDiaryDraftContent(entry, initialDate)) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Losing a draft is annoying; crashing the editor would be worse.
  }
}

export function clearDiaryDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore storage failures
  }
}