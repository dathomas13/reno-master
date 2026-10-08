/**
 * The quick access tiles on the start page: which ones, in which order. Kept per device
 * like the menu, and edited the same way - sorted with arrows, a line splits what shows
 * from what does not. A tile can lead deeper than the menu does: "Notizen" opens the
 * notes, while the menu entry "Aufgaben" opens the tasks of the same area.
 */
import type { IconName } from '@/components/Icon';

export interface Shortcut {
  id: string;
  label: string;
  icon: IconName;
  to: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'beleg', label: 'Beleg', icon: 'receipt', to: '/kosten/neu?capture=1' },
  { id: 'notizen', label: 'Notizen', icon: 'note', to: '/notizen' },
  { id: 'aufgaben', label: 'Aufgaben', icon: 'task', to: '/aufgaben' },
  { id: 'haus', label: '3D-Modell', icon: 'cube', to: '/3d' },
  { id: 'plaene', label: 'Pläne', icon: 'plan', to: '/plaene' },
  { id: 'fotos', label: 'Fotos', icon: 'photo', to: '/fotos' },
  { id: 'belege', label: 'Belege', icon: 'receipt', to: '/belege' },
  { id: 'kosten', label: 'Kosten', icon: 'euro', to: '/kosten' },
  { id: 'tagebuch', label: 'Tagebuch', icon: 'diary', to: '/tagebuch' },
  { id: 'kontakte', label: 'Kontakte', icon: 'contact', to: '/kontakte' },
  { id: 'gespraeche', label: 'Gespräche', icon: 'chat', to: '/gespraeche' },
  { id: 'suche', label: 'Suche', icon: 'search', to: '/suche' },
];

/** two rows of three on the S24 */
export const MAX_SHORTCUTS = 6;

export interface ShortcutLayout {
  /** every tile, the shown ones first */
  order: string[];
  /** how many of the first ones are shown */
  shown: number;
}

export const DEFAULT_SHORTCUTS: ShortcutLayout = {
  order: SHORTCUTS.map((item) => item.id),
  shown: 3,
};

const KNOWN = new Set(SHORTCUTS.map((item) => item.id));

export function shortcutOf(id: string): Shortcut | undefined {
  return SHORTCUTS.find((item) => item.id === id);
}

/** repairs whatever is stored: unknown ids out, new tiles appended below the line */
export function normalizeShortcuts(layout: Partial<ShortcutLayout> | null | undefined): ShortcutLayout {
  if (!layout || typeof layout !== 'object' || !Array.isArray(layout.order)) {
    return { order: [...DEFAULT_SHORTCUTS.order], shown: DEFAULT_SHORTCUTS.shown };
  }
  const stored = [
    ...new Set(layout.order.filter((id): id is string => typeof id === 'string' && KNOWN.has(id))),
  ];
  const shownBefore = typeof layout.shown === 'number' ? layout.shown : DEFAULT_SHORTCUTS.shown;
  const shown = Math.max(0, Math.min(MAX_SHORTCUTS, shownBefore, stored.length));
  return { order: [...stored, ...DEFAULT_SHORTCUTS.order.filter((id) => !stored.includes(id))], shown };
}

export function visibleShortcuts(layout: ShortcutLayout): Shortcut[] {
  return layout.order.slice(0, layout.shown).flatMap((id) => {
    const item = shortcutOf(id);
    return item ? [item] : [];
  });
}

/**
 * Moves one tile up (-1) or down (+1). Next to the line it crosses it: the last shown tile
 * drops below, the first hidden one comes up - trading places with the last shown tile
 * when there are already MAX_SHORTCUTS. At either end nothing changes.
 */
export function moveShortcut(layout: ShortcutLayout, id: string, delta: -1 | 1): ShortcutLayout {
  const index = layout.order.indexOf(id);
  if (index < 0) return layout;
  if (delta === 1 && index === layout.shown - 1) return { ...layout, shown: layout.shown - 1 };
  if (delta === -1 && index === layout.shown && layout.shown < MAX_SHORTCUTS) return { ...layout, shown: layout.shown + 1 };
  const target = index + delta;
  if (target < 0 || target >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...layout, order };
}
