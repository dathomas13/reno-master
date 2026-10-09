import { describe, expect, it } from 'vitest';
import {
  formatMetres,
  formatMillimetres,
  fromWorld,
  loupePlacement,
  measure,
  nearestWithin,
} from '@/modules/viewer3d/measure';

describe('fromWorld', () => {
  it('turns three metres (y up, north = -z) into model mm', () => {
    const point = fromWorld({ x: 1.5, y: 2.75, z: -3 });
    expect(point.x).toBeCloseTo(1500);
    expect(point.y).toBeCloseTo(3000);
    expect(point.z).toBeCloseTo(2750);
  });
});

describe('measure', () => {
  it('splits a diagonal into its parts', () => {
    const result = measure({ x: 0, y: 0, z: 0 }, { x: 3000, y: -4000, z: 1200 });
    expect(result.dx).toBe(3000);
    expect(result.dy).toBe(4000);
    expect(result.dz).toBe(1200);
    expect(result.horizontal).toBe(5000);
    expect(result.total).toBeCloseTo(Math.hypot(5000, 1200));
  });

  it('is zero for the same point', () => {
    expect(measure({ x: 5, y: 6, z: 7 }, { x: 5, y: 6, z: 7 }).total).toBe(0);
  });
});

describe('formatting', () => {
  it('reads like a tape measure, in metres to the centimetre', () => {
    expect(formatMetres(3418)).toBe('3,42 m');
    expect(formatMetres(845)).toBe('0,85 m');
    expect(formatMetres(0)).toBe('0,00 m');
    expect(formatMetres(12995)).toBe('13,00 m');
  });

  it('gives the millimetres with a thousands point', () => {
    expect(formatMillimetres(3418.4)).toBe('3.418 mm');
    expect(formatMillimetres(85)).toBe('85 mm');
  });
});

describe('nearestWithin', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 100, y: 100 },
  ];

  it('takes the closest point inside the radius', () => {
    expect(nearestWithin(points, { x: 7, y: 1 }, 20)).toBe(1);
  });

  it('finds nothing outside the radius', () => {
    expect(nearestWithin(points, { x: 50, y: 50 }, 20)).toBe(-1);
  });

  it('finds nothing when snapping is off', () => {
    expect(nearestWithin(points, { x: 0.5, y: 0 }, 0)).toBe(-1);
  });
});

describe('loupePlacement', () => {
  it('sits above the finger', () => {
    expect(loupePlacement({ x: 200, y: 400 }, 120, 400, 800, 40)).toEqual({ x: 140, y: 240 });
  });

  it('moves beside the finger near the top, away from the closer edge', () => {
    expect(loupePlacement({ x: 300, y: 60 }, 120, 400, 800, 40)).toEqual({ x: 140, y: 4 });
    expect(loupePlacement({ x: 80, y: 60 }, 120, 400, 800, 40)).toEqual({ x: 120, y: 4 });
  });

  it('stays on the canvas at the sides', () => {
    expect(loupePlacement({ x: 10, y: 400 }, 120, 400, 800, 40).x).toBe(4);
    expect(loupePlacement({ x: 395, y: 400 }, 120, 400, 800, 40).x).toBe(276);
  });
});
