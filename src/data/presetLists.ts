/** Pure helpers for the editable pick lists. No Firebase in here, so they test without it. */

export const ENTRY_MAX = 60;

/** trim, collapse whitespace, NFC; empty or too long yields an empty string */
export function normalizeEntry(value: string, maxLength = ENTRY_MAX): string {
  const clean = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  return clean.length >= 1 && clean.length <= maxLength ? clean : '';
}

function same(a: string, b: string): boolean {
  return a.localeCompare(b, 'de', { sensitivity: 'accent' }) === 0;
}

/** the entry of the list that equals `value` (case-insensitive), or undefined */
export function findDuplicate(list: readonly string[], value: string, ignore?: string): string | undefined {
  return list.find((item) => item !== ignore && same(item, value));
}

export function addEntry(list: readonly string[], value: string, maxLength = ENTRY_MAX): string[] {
  const clean = normalizeEntry(value, maxLength);
  if (!clean || findDuplicate(list, clean)) return [...list];
  return [...list, clean];
}

/** replaces `from` by `to` in place; unchanged when `to` is invalid or taken by another entry */
export function renameEntry(list: readonly string[], from: string, to: string, maxLength = ENTRY_MAX): string[] {
  const clean = normalizeEntry(to, maxLength);
  if (!clean || findDuplicate(list, clean, from)) return [...list];
  return list.map((item) => (item === from ? clean : item));
}

export function removeEntry(list: readonly string[], value: string): { list: string[]; index: number } {
  const index = list.indexOf(value);
  if (index < 0) return { list: [...list], index: -1 };
  return { list: list.filter((_, i) => i !== index), index };
}

/** puts a removed value back at its old position (clamped); no-op when it is already there */
export function restoreEntry(list: readonly string[], value: string, index: number): string[] {
  if (list.includes(value)) return [...list];
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, value);
  return next;
}

/** moves the entry at `index` by `delta` positions (-1 up, +1 down) */
export function moveEntry(list: readonly string[], index: number, delta: number): string[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function sortAlpha(list: readonly string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * The options of a picker plus the values an entry already carries but the list no longer
 * has (deleted or renamed). Those are appended so the editor keeps showing them.
 */
export function withStored(options: readonly string[], stored: string | readonly string[] | undefined): string[] {
  const values = stored === undefined ? [] : typeof stored === 'string' ? [stored] : stored;
  const result = [...options];
  for (const value of values) {
    if (value && !result.includes(value)) result.push(value);
  }
  return result;
}
