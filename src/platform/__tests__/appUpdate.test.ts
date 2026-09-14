import { describe, expect, it } from 'vitest';
import { formatProgress, percentOf } from '@/platform/appUpdate';

describe('percentOf', () => {
  it('counts the share that has arrived', () => {
    expect(percentOf({ loaded: 0, total: 200 })).toBe(0);
    expect(percentOf({ loaded: 50, total: 200 })).toBe(25);
    expect(percentOf({ loaded: 200, total: 200 })).toBe(100);
  });

  it('has no answer when the server sent no length', () => {
    // the bar then runs full width instead of pretending to know
    expect(percentOf({ loaded: 1000, total: 0 })).toBeNull();
    expect(percentOf({ loaded: 1000, total: -1 })).toBeNull();
  });

  it('never goes above 100, whatever the server claims', () => {
    expect(percentOf({ loaded: 300, total: 200 })).toBe(100);
  });

  it('refuses nonsense instead of showing NaN', () => {
    expect(percentOf({ loaded: Number.NaN, total: 200 })).toBeNull();
    expect(percentOf({ loaded: -5, total: 200 })).toBeNull();
    expect(percentOf({ loaded: 5, total: Number.NaN })).toBeNull();
  });
});

describe('formatProgress', () => {
  it('reads like the download notification, with a German comma', () => {
    expect(formatProgress({ loaded: 3.2 * 1024 * 1024, total: 7.16 * 1024 * 1024 })).toBe(
      '3,2 von 7,2 MB',
    );
  });

  it('shows what arrived when the total is unknown', () => {
    expect(formatProgress({ loaded: 1024 * 1024, total: 0 })).toBe('1,0 MB');
  });
});
