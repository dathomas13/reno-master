import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NAV_LAYOUT,
  MAX_BAR_ITEMS,
  NAV_ENTRIES,
  moveNavEntry,
  normalizeNavLayout,
  navRouteFor,
  splitNav,
} from '../navLayout';

describe('normalizeNavLayout', () => {
  it('falls back to the default without a stored value', () => {
    expect(normalizeNavLayout(undefined)).toEqual(DEFAULT_NAV_LAYOUT);
    expect(normalizeNavLayout(null)).toEqual(DEFAULT_NAV_LAYOUT);
  });

  it('drops unknown routes and duplicates, appends missing ones', () => {
    const layout = normalizeNavLayout({ order: ['/kosten', '/weg', '/kosten', '/'], bar: ['/weg', '/kosten'] });
    expect(layout.order.slice(0, 2)).toEqual(['/kosten', '/']);
    expect(layout.bar).toEqual(['/kosten']);
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

describe('areas instead of screens', () => {
  it('turns a stored Notizen or Gespräche entry into its area and drops Dateien', () => {
    const layout = normalizeNavLayout({
      order: ['/', '/tagebuch', '/notizen', '/dateien', '/gespraeche'],
      bar: ['/', '/tagebuch', '/3d', '/notizen'],
    });
    // Aufgaben takes the place Notizen had, in the stored order
    expect(layout.bar).toEqual(['/', '/tagebuch', '/aufgaben', '/3d']);
    expect(layout.order).not.toContain('/notizen');
    expect(layout.order).not.toContain('/dateien');
    expect(layout.order.indexOf('/kontakte')).toBeLessThan(layout.order.indexOf('/einstellungen'));
  });

  it('lights up the area of a screen that became a tab', () => {
    expect(navRouteFor('/fotos')).toBe('/tagebuch');
    expect(navRouteFor('/belege')).toBe('/kosten');
    expect(navRouteFor('/plaene/eg')).toBe('/3d');
    expect(navRouteFor('/notizen')).toBe('/aufgaben');
    expect(navRouteFor('/gespraeche')).toBe('/kontakte');
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

  it('crosses the line between bar and "Mehr"', () => {
    const full = normalizeNavLayout(undefined);
    const dropped = moveNavEntry(full, '/kosten', 1);
    expect(dropped.bar).toEqual(['/', '/tagebuch', '/3d']);
    expect(dropped.order).toEqual(full.order);
    const climbed = moveNavEntry(dropped, '/kosten', -1);
    expect(climbed.bar).toEqual(full.bar);
    // a full bar trades its last entry for the one climbing in
    const traded = moveNavEntry(full, '/suche', -1);
    expect(traded.bar).toEqual(['/', '/tagebuch', '/3d', '/suche']);
    expect(splitNav(traded).more[0]).toBe('/kosten');
  });

  it('keeps the bar on top when an old layout had it scattered', () => {
    const layout = normalizeNavLayout({ order: ['/suche', '/', '/kosten'], bar: ['/kosten', '/'] });
    expect(layout.order.slice(0, 3)).toEqual(['/', '/kosten', '/suche']);
    expect(layout.bar).toEqual(['/', '/kosten']);
  });
});
