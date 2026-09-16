/** The last searches, on this device only - like the settings, they never leave it. */
const KEY = 'reno.search.recent';
const MAX = 8;

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return loadRecent();
  const others = loadRecent().filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...others].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode: the list simply does not survive the session
  }
  return next;
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
