import { describe, expect, it } from 'vitest';
import { roomOutline, type Segment } from '@/modules/viewer3d/houseScene';

const length = (segments: Segment[]) =>
  segments.reduce((sum, [x0, y0, x1, y1]) => sum + Math.abs(x1 - x0) + Math.abs(y1 - y0), 0);

describe('roomOutline', () => {
  it('draws a single rectangle as its four sides', () => {
    expect(roomOutline([[0, 0, 100, 50]])).toEqual([
      [0, 0, 100, 0],
      [0, 50, 100, 50],
      [0, 0, 0, 50],
      [100, 0, 100, 50],
    ]);
  });

  it('leaves out the edge where two rectangles of the room meet', () => {
    // two halves of one 200 x 50 rectangle: the seam at x = 100 must not appear
    const segments = roomOutline([[0, 0, 100, 50], [100, 0, 200, 50]]);
    expect(segments.some(([x0, , x1]) => x0 === 100 && x1 === 100)).toBe(false);
    expect(length(segments)).toBe(2 * 200 + 2 * 50);
  });

  it('follows an L shape', () => {
    const segments = roomOutline([[0, 0, 100, 100], [0, 100, 50, 200]]);
    expect(length(segments)).toBe(100 + 200 + 50 + 100 + 50 + 100);
    expect(segments.some(([, y0, , y1]) => y0 === 100 && y1 === 100)).toBe(true); // the step
  });

  it('keeps the side where a room only partly touches itself', () => {
    // a notch: the narrow rectangle meets the wide one along part of its edge only
    const segments = roomOutline([[0, 0, 400, 100], [100, 100, 200, 120]]);
    const top = segments.filter(([, y0, , y1]) => y0 === 100 && y1 === 100);
    expect(top).toEqual([[0, 100, 100, 100], [200, 100, 400, 100]]);
  });
});
