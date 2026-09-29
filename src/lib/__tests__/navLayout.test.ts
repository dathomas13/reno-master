import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NAV_LAYOUT,
  MAX_BAR_ITEMS,
  NAV_ENTRIES,
  moveNavEntry,
  normalizeNavLayout,
  splitNav,
  toggleNavBar,
} from '../navLayout';

describe('normalizeNavLayout', () => {
  it('falls back to the default without a stored value', () => {
    expect(normalizeNavLayout(undefined)).toEqual(DEFAULT_NAV_LAYOUT);
    expect(normalizeNavLayout(null)).toEqual(DEFAULT_NAV_LAYOUT);
  });

  it('drops unknown routes and duplicates, appends missing ones', () => {
    const layout = normalizeNavLayout({ order: ['/kosten', '/weg', '/kosten', '/'], bar: ['/weg', '/kosten'] });
    expect(layout.order.slice(0, 2)).toEqual(['/kosten', '/']);
    expect(layout.order).toHaveLength(NAV_ENTRIES.length);
    expect(new Set(layout.order).size).toBe(NAV_ENTRIES.length);
    expect(layout.bar).toEqual(['/kosten']);
  });

  it('caps the bar and keeps an empty one empty', () => {
    const all = NAV_ENTRIES.map((entry) => entry.to);
    expect(normalizeNavLayout({ order: all, bar: all }).bar).toHaveLength(MAX_BAR_ITEMS);
    expect(normalizeNavLayout({ order: all, bar: [] }).bar).toEqual([]);
  });
});

describe('splitNav', () => {
  it('shows the bar in menu order and the rest under "Mehr"', () => {
    const layout = normalizeNavLayout({
      order: ['/einstellungen', '/kosten', '/', '/tagebuch'],
      bar: ['/', '/einstellungen'],
    });
    const { bar, more } = splitNav(layout);
    expect(bar).toEqual(['/einstellungen', '/']);
    expect(more[0]).toBe('/kosten');
    expect([...bar, ...more].sort()).toEqual([...layout.order].sort());
  });
});

describe('moveNavEntry', () => {
  it('swaps with the neighbour and stops at the ends', () => {
    const layout = normalizeNavLayout(undefined);
    expect(moveNavEntry(layout, '/tagebuch', -1).order.slice(0, 2)).toEqual(['/tagebuch', '/']);
    expect(moveNavEntry(layout, '/', -1)).toBe(layout);
    expect(moveNavEntry(layout, '/einstellungen', 1)).toBe(layout);
  });
});

describe('toggleNavBar', () => {
  it('adds up to the limit and removes again', () => {
    const full = normalizeNavLayout(undefined);
    expect(full.bar).toHaveLength(MAX_BAR_ITEMS);
    expect(toggleNavBar(full, '/suche')).toBe(full);
    const freed = toggleNavBar(full, '/3d');
    expect(freed.bar).not.toContain('/3d');
    expect(toggleNavBar(freed, '/suche').bar).toContain('/suche');
  });
});
