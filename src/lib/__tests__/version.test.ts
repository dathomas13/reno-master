import { describe, expect, it } from 'vitest';
import { versionCode } from '@/lib/version';

describe('versionCode', () => {
  it('grows with every position', () => {
    expect(versionCode('0.17.0')).toBeGreaterThan(versionCode('0.9.3'));
    expect(versionCode('0.17.1')).toBeGreaterThan(versionCode('0.17.0'));
    expect(versionCode('1.0.0')).toBeGreaterThan(versionCode('0.999.999'));
  });

  it('leaves room for the positions not to collide', () => {
    expect(versionCode('0.17.0')).toBe(17_000);
    expect(versionCode('0.0.999')).toBeLessThan(versionCode('0.1.0'));
  });

  it('survives a version that is not a version', () => {
    expect(versionCode('')).toBe(0);
    expect(versionCode('0.17')).toBe(17_000);
    expect(versionCode('kaputt')).toBe(0);
  });
});
