/**
 * One-time hints for gestures nobody would guess (tap a room, swipe photos). Kept per
 * device: the person who has seen a hint once on this phone does not need it again.
 * Storage can be missing or full - then the hint simply shows again, nothing breaks.
 */
const KEY = 'reno.hints.seen';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function hintSeen(id: string): boolean {
  return read().includes(id);
}

export function markHintSeen(id: string): void {
  const seen = read();
  if (seen.includes(id)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen, id]));
  } catch {
    // no storage: the hint comes back next time, which is harmless
  }
}
