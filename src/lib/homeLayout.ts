/**
 * Which blocks the start page shows and in which order. Kept per device in LocalSettings,
 * like the menu layout. Stored as block ids, so a block added later shows up at the end
 * and a removed one simply drops out.
 */
export interface HomeBlock {
  id: string;
  label: string;
}

export const HOME_BLOCKS: readonly HomeBlock[] = [
  { id: 'search', label: 'Suchfeld' },
  { id: 'house', label: 'Hausbild mit Phase' },
  { id: 'today', label: 'Heutiger Tagebuch-Eintrag' },
  { id: 'pinned', label: 'Angepinnte Notizen' },
  { id: 'shortcuts', label: 'Schnellzugriff (Beleg, 3D, Aufgaben)' },
  { id: 'costs', label: 'Kosten' },
  { id: 'urgent', label: 'Dringende Aufgaben' },
  { id: 'recent', label: 'Zuletzt im Tagebuch' },
];

export interface HomeLayout {
  /** every block, in the order the start page shows them */
  order: string[];
  /** blocks switched off */
  hidden: string[];
}

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  order: HOME_BLOCKS.map((block) => block.id),
  hidden: [],
};

const KNOWN = new Set(HOME_BLOCKS.map((block) => block.id));

function known(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && KNOWN.has(id)))];
}

/** repairs whatever is stored: unknown ids out, missing ones appended */
export function normalizeHomeLayout(layout: Partial<HomeLayout> | null | undefined): HomeLayout {
  if (!layout || typeof layout !== 'object') return { order: [...DEFAULT_HOME_LAYOUT.order], hidden: [] };
  const stored = known(layout.order);
  const order = [...stored, ...DEFAULT_HOME_LAYOUT.order.filter((id) => !stored.includes(id))];
  return { order, hidden: known(layout.hidden) };
}

export function homeBlockOf(id: string): HomeBlock | undefined {
  return HOME_BLOCKS.find((block) => block.id === id);
}

/** the blocks the start page renders, in order */
export function visibleHomeBlocks(layout: HomeLayout): string[] {
  return layout.order.filter((id) => !layout.hidden.includes(id));
}

/** moves one block up (-1) or down (+1); at either end nothing changes */
export function moveHomeBlock(layout: HomeLayout, id: string, delta: -1 | 1): HomeLayout {
  const index = layout.order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...layout, order };
}

export function toggleHomeBlock(layout: HomeLayout, id: string): HomeLayout {
  if (layout.hidden.includes(id)) return { ...layout, hidden: layout.hidden.filter((item) => item !== id) };
  if (!KNOWN.has(id)) return layout;
  return { ...layout, hidden: [...layout.hidden, id] };
}
