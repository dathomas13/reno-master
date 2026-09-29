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

export const NAV_ENTRIES: readonly NavEntry[] = [
  { to: '/', label: 'Start' },
  { to: '/tagebuch', label: 'Tagebuch' },
  { to: '/3d', label: '3D' },
  { to: '/kosten', label: 'Kosten' },
  { to: '/suche', label: 'Suche' },
  { to: '/dateien', label: 'Dateien' },
  { to: '/aufgaben', label: 'Aufgaben' },
  { to: '/notizen', label: 'Notizen' },
  { to: '/kontakte', label: 'Kontakte' },
  { to: '/gespraeche', label: 'Gespräche' },
  { to: '/einstellungen', label: 'Einstellungen' },
];

/** four plus "Mehr" is what fits the S24 without the labels getting cut off */
export const MAX_BAR_ITEMS = 4;

export interface NavLayout {
  /** every entry, in the order the menu shows them; the bar follows the same order */
  order: string[];
  /** the entries in the bottom bar, at most MAX_BAR_ITEMS */
  bar: string[];
}

export const DEFAULT_NAV_LAYOUT: NavLayout = {
  order: NAV_ENTRIES.map((entry) => entry.to),
  bar: ['/', '/tagebuch', '/3d', '/kosten'],
};

const KNOWN = new Set(NAV_ENTRIES.map((entry) => entry.to));

function known(routes: unknown): string[] {
  if (!Array.isArray(routes)) return [];
  return [...new Set(routes.filter((route): route is string => typeof route === 'string' && KNOWN.has(route)))];
}

/** repairs whatever is stored: unknown routes out, missing ones appended, bar capped */
export function normalizeNavLayout(layout: Partial<NavLayout> | null | undefined): NavLayout {
  if (!layout || typeof layout !== 'object') return { order: [...DEFAULT_NAV_LAYOUT.order], bar: [...DEFAULT_NAV_LAYOUT.bar] };
  const stored = known(layout.order);
  const order = [...stored, ...DEFAULT_NAV_LAYOUT.order.filter((route) => !stored.includes(route))];
  const bar = Array.isArray(layout.bar) ? known(layout.bar).slice(0, MAX_BAR_ITEMS) : [...DEFAULT_NAV_LAYOUT.bar];
  return { order, bar };
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

/** moves one entry up (-1) or down (+1); at either end nothing changes */
export function moveNavEntry(layout: NavLayout, route: string, delta: -1 | 1): NavLayout {
  const index = layout.order.indexOf(route);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...layout, order };
}

/** puts an entry into the bar or takes it out; a full bar takes nothing more */
export function toggleNavBar(layout: NavLayout, route: string): NavLayout {
  if (layout.bar.includes(route)) return { ...layout, bar: layout.bar.filter((item) => item !== route) };
  if (layout.bar.length >= MAX_BAR_ITEMS || !KNOWN.has(route)) return layout;
  return { ...layout, bar: [...layout.bar, route] };
}
