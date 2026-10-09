import { describe, expect, it } from 'vitest';
import { neighbourTab, swipeStep } from '../swipe';

const base = { x0: 250, y0: 400, x1: 120, y1: 410, ms: 250, width: 360 };

describe('tab swipe', () => {
  it('goes to the next tab when the finger moves left, to the previous when right', () => {
    expect(swipeStep(base)).toBe(1);
    expect(swipeStep({ ...base, x0: 100, x1: 230 })).toBe(-1);
  });

  it('ignores short, slow, steep and edge swipes', () => {
    expect(swipeStep({ ...base, x1: 200 })).toBe(0);
    expect(swipeStep({ ...base, ms: 900 })).toBe(0);
    expect(swipeStep({ ...base, y1: 500 })).toBe(0);
    expect(swipeStep({ ...base, x0: 345, x1: 200 })).toBe(0);
    expect(swipeStep({ ...base, x0: 10, x1: 150 })).toBe(0);
  });

  it('stops at the first and the last tab', () => {
    expect(neighbourTab(0, 2, 1)).toBe(1);
    expect(neighbourTab(1, 2, 1)).toBeNull();
    expect(neighbourTab(0, 2, -1)).toBeNull();
    expect(neighbourTab(1, 3, -1)).toBe(0);
    expect(neighbourTab(-1, 3, 1)).toBeNull();
  });
});
