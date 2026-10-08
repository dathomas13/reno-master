import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, MAX_SHORTCUTS, moveShortcut, normalizeShortcuts, visibleShortcuts } from '../shortcuts';

describe('quick access tiles', () => {
  it('starts with Beleg, Notizen, Aufgaben', () => {
    expect(visibleShortcuts(normalizeShortcuts(undefined)).map((item) => item.label)).toEqual([
      'Beleg',
      'Notizen',
      'Aufgaben',
    ]);
  });

  it('repairs a stored layout and never shows more than the maximum', () => {
    const layout = normalizeShortcuts({ order: ['haus', 'weg', 'haus', 'beleg'], shown: 99 });
    expect(layout.order.slice(0, 2)).toEqual(['haus', 'beleg']);
    expect(layout.order).toHaveLength(DEFAULT_SHORTCUTS.order.length);
    expect(layout.shown).toBe(2);
    expect(normalizeShortcuts({ order: DEFAULT_SHORTCUTS.order, shown: 99 }).shown).toBe(MAX_SHORTCUTS);
  });

  it('crosses the line with the arrows', () => {
    const layout = normalizeShortcuts(undefined);
    const hidden = moveShortcut(layout, 'aufgaben', 1);
    expect(hidden.shown).toBe(2);
    expect(hidden.order).toEqual(layout.order);
    const shown = moveShortcut(layout, 'haus', -1);
    expect(shown.shown).toBe(4);
    expect(visibleShortcuts(shown).map((item) => item.id)).toEqual(['beleg', 'notizen', 'aufgaben', 'haus']);
    expect(moveShortcut(layout, 'beleg', -1)).toBe(layout);
  });
});
