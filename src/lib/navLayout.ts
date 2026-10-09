/**
 * Which screens sit in the bottom bar and in which order the menu lists them. Chosen in
 * the settings and kept per device like every other LocalSettings value. The layout is
 * stored as routes, so an entry that no longer exists simply drops out and a new screen
 * shows up at the end of the menu without anyone having to touch the setting.
 */
export interface NavEntry {
  to: string;
  label: string;
}

/**
 * Six areas instead of a dozen screens: what belongs together sits behind tabs inside its
 * area (Tagebuch: Einträge · Fotos, Haus: 3D · Pläne, Kosten: Liste · Übersicht · Belege,
 * Aufgaben: Aufgaben · Notizen, Kontakte: Kontakte · Gespräche).
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  { to: '/', label: 'Start' },
  { to: '/tagebuch', label: 'Tagebuch' },
  { to: '/3d', label: 'Haus' },
  { to: '/kosten', label: 'Kosten' },
  { to: '/suche', label: 'Suche' },
  { to: '/aufgaben', label: 'Aufgaben' },
  { to: '/kontakte', label: 'Kontakte' },
  { to: '/einstellungen', label: 'Einstellungen' },
];

/**
 * Menu entries that became tabs of an area. A stored layout that had them keeps its spot
 * for the area instead (Notizen in the bar becomes Aufgaben there); Dateien had no area
 * of its own and simply drops out.
 */
const MERGED: Record<string, string | null> = {
  '/notizen': '/aufgaben',
  '/gespraeche': '/kontakte',
  '/dateien': null,
};

/** four plus "Mehr" is what fits the S24 without the labels getting cut off */
export const MAX_BAR_ITEMS = 4;

export interface NavLayout {
  /** every entry in menu order; the bar entries always come first */
  order: string[];
  /** the entries in the bottom bar - the first bar.length entries of order, at most MAX_BAR_ITEMS */
  bar: string[];
}

export const DEFAULT_NAV_LAYOUT: NavLayout = {
  order: NAV_ENTRIES.map((entry) => entry.to),
  bar: ['/', '/tagebuch', '/3d', '/kosten'],
};

const KNOWN = new Set(NAV_ENTRIES.map((entry) => entry.to));

function known(routes: unknown): string[] {
  if (!Array.isArray(routes)) return [];
  const mapped = routes
    .filter((route): route is string => typeof route === 'string')
    .map((route) => (route in MERGED ? MERGED[route] : route))
    .filter((route): route is string => route !== null && KNOWN.has(route));
  return [...new Set(mapped)];
}

/** the bar is simply the top of the list: everything above the line in the settings */
function withBarCount(order: string[], count: number): NavLayout {
  return { order, bar: order.slice(0, count) };
}

/**
 * repairs whatever is stored: unknown routes out, missing ones appended, bar capped and
 * moved to the top of the order (older layouts kept bar and order independent)
 */
export function normalizeNavLayout(layout: Partial<NavLayout> | null | undefined): NavLayout {
  if (!layout || typeof layout !== 'object') return withBarCount([...DEFAULT_NAV_LAYOUT.order], DEFAULT_NAV_LAYOUT.bar.length);
  const stored = known(layout.order);
  const full = [...stored, ...DEFAULT_NAV_LAYOUT.order.filter((route) => !stored.includes(route))];
  const bar = Array.isArray(layout.bar) ? known(layout.bar).slice(0, MAX_BAR_ITEMS) : [...DEFAULT_NAV_LAYOUT.bar];
  const inBar = full.filter((route) => bar.includes(route));
  return withBarCount([...inBar, ...full.filter((route) => !bar.includes(route))], inBar.length);
}

export function entryOf(route: string): NavEntry | undefined {
  return NAV_ENTRIES.find((entry) => entry.to === route);
}

/** bar and "Mehr" sheet, both in the chosen order */
export function splitNav(layout: NavLayout): { bar: string[]; more: string[] } {
  const inBar = new Set(layout.bar);
  return {
    bar: layout.order.filter((route) => inBar.has(route)),
    more: layout.order.filter((route) => !inBar.has(route)),
  };
}

/**
 * moves one entry up (-1) or down (+1). Next to the line it crosses it instead: the last
 * bar entry drops into "Mehr", the first "Mehr" entry climbs into the bar - and if the
 * bar is full, it trades places with the last bar entry. At either end nothing changes,
 * so the caller can compare with the input to know whether a move is possible.
 */
export function moveNavEntry(layout: NavLayout, route: string, delta: -1 | 1): NavLayout {
  const count = layout.bar.length;
  const index = layout.order.indexOf(route);
  if (index < 0) return layout;
  if (delta === 1 && index === count - 1) return withBarCount(layout.order, count - 1);
  if (delta === -1 && index === count && count < MAX_BAR_ITEMS) return withBarCount(layout.order, count + 1);
  const target = index + delta;
  if (target < 0 || target >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[index], order[target]] = [order[target], order[index]];
  return withBarCount(order, count);
}

/** screens that are a tab of an area light up that area's entry */
const PARENT_ROUTES: Record<string, string> = {
  '/fotos': '/tagebuch',
  '/belege': '/kosten',
  '/plaene': '/3d',
  '/notizen': '/aufgaben',
  '/gespraeche': '/kontakte',
  '/dateien': '/tagebuch',
};

export function navRouteFor(pathname: string): string {
  const first = `/${pathname.split('/')[1] ?? ''}`;
  return PARENT_ROUTES[first] ?? first;
}
