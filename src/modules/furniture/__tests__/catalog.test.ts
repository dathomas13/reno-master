import { describe, expect, it } from 'vitest';
import { buildParts, CATALOG, CATALOG_GROUPS, catalogEntry, FINISH_COLOR, partBounds, type Part } from '@/modules/furniture/catalog';

const TOLERANCE = 0.5;

function numbers(part: Part): number[] {
  const values: number[] = [...part.c, part.z];
  if (part.shape === 'box') values.push(...part.s, part.r ?? 0);
  if (part.shape === 'cyl') values.push(part.r, part.h, part.r2 ?? 0, part.sx ?? 1, part.sy ?? 1);
  if (part.shape === 'lathe') values.push(...part.profile.flat(), part.sx ?? 1, part.sy ?? 1);
  if (part.shape === 'sphere') values.push(part.r, part.sz ?? 1);
  return values;
}

function checkFits(type: string, dims: { w: number; d: number; h: number }, over: number) {
  const parts = buildParts(type, dims);
  expect(parts.length, type).toBeGreaterThan(0);
  for (const part of parts) {
    for (const value of numbers(part)) expect(Number.isFinite(value), `${type}: ${JSON.stringify(part)}`).toBe(true);
    expect(FINISH_COLOR[part.f], `${type}: finish ${part.f}`).toBeDefined();
    const [x0, y0, z0, x1, y1, z1] = partBounds(part);
    const where = `${type} ${dims.w}×${dims.d}×${dims.h}: ${JSON.stringify(part)}`;
    expect(x0, where).toBeGreaterThanOrEqual(-dims.w / 2 - TOLERANCE);
    expect(x1, where).toBeLessThanOrEqual(dims.w / 2 + TOLERANCE);
    expect(y0, where).toBeGreaterThanOrEqual(-dims.d / 2 - TOLERANCE);
    expect(y1, where).toBeLessThanOrEqual(dims.d / 2 + TOLERANCE);
    expect(z0, where).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(z1, where).toBeLessThanOrEqual(dims.h + over + TOLERANCE);
    if (part.shape === 'box') for (const side of part.s) expect(side, where).toBeGreaterThan(0);
  }
}

describe('furniture catalog', () => {
  it('has unique types, known groups and the pieces asked for', () => {
    const types = CATALOG.map((entry) => entry.type);
    expect(new Set(types).size).toBe(types.length);
    for (const entry of CATALOG) expect(CATALOG_GROUPS).toContain(entry.group);
    for (const wanted of ['wc', 'dusche', 'badewanne', 'sofa', 'kuechenzeile', 'stuhl', 'esstisch']) {
      expect(catalogEntry(wanted), wanted).toBeDefined();
    }
  });

  it('builds every piece inside its outer size', () => {
    for (const entry of CATALOG) checkFits(entry.type, entry.dims, entry.over ?? 0);
  });

  it('stays inside its size when made larger or smaller', () => {
    for (const entry of CATALOG) {
      for (const factor of [0.7, 1.6]) {
        const dims = {
          w: Math.round(entry.dims.w * factor),
          d: Math.round(entry.dims.d * factor),
          h: Math.round(entry.dims.h * factor),
        };
        // a piece far smaller than built for may squeeze fittings; only the footprint is strict there
        const parts = buildParts(entry.type, dims);
        for (const part of parts) {
          const [x0, y0, , x1, y1] = partBounds(part);
          const where = `${entry.type} ×${factor}: ${JSON.stringify(part)}`;
          expect(x0, where).toBeGreaterThanOrEqual(-dims.w / 2 - TOLERANCE);
          expect(x1, where).toBeLessThanOrEqual(dims.w / 2 + TOLERANCE);
          expect(y0, where).toBeGreaterThanOrEqual(-dims.d / 2 - TOLERANCE);
          expect(y1, where).toBeLessThanOrEqual(dims.d / 2 + TOLERANCE);
        }
      }
    }
  });

  it('grows a kitchen by cabinets, not by stretching them', () => {
    const fronts = (w: number) =>
      buildParts('kuechenzeile', { w, d: 620, h: 910 }).filter((part) => part.f === 'front').length;
    expect(fronts(1200)).toBe(2);
    expect(fronts(3600)).toBe(6);
    // sink and hob are both there once the row has two cabinets
    const parts = buildParts('kuechenzeile', { w: 2400, d: 620, h: 910 });
    expect(parts.some((part) => part.f === 'steel')).toBe(true);
    expect(parts.some((part) => part.f === 'blackglass')).toBe(true);
  });

  it('gives a wider sofa more seats', () => {
    const seats = (w: number) => buildParts('sofa', { w, d: 950, h: 830 }).filter((part) => part.f === 'cushion').length;
    expect(seats(1600)).toBe(2);
    expect(seats(2600)).toBe(3);
  });

  it('falls back to a plain box for an unknown type', () => {
    const parts = buildParts('gibt-es-nicht', { w: 100, d: 200, h: 300 });
    expect(parts).toHaveLength(1);
    expect(partBounds(parts[0]!)).toEqual([-50, -100, 0, 50, 100, 300]);
  });
});
