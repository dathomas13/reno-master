import { describe, expect, it } from 'vitest';
import { PRESETS, findPreset } from '@/data/presets';

describe('presets', () => {
  it('has the eight entries with unique keys', () => {
    expect(PRESETS).toHaveLength(8);
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(8);
  });

  it('every string preset names a list key', () => {
    for (const preset of PRESETS) {
      expect(Boolean(preset.listKey)).toBe(preset.kind === 'strings');
    }
  });

  it('finds by route key', () => {
    expect(findPreset('personen')?.listKey).toBe('people');
    expect(findPreset('nope')).toBeUndefined();
    expect(findPreset(undefined)).toBeUndefined();
  });
});
