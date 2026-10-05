import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_SECTIONS, findPreset } from '@/data/presets';
import { OPTION_SET_KEYS } from '@/data/options';

describe('presets', () => {
  it('has the eighteen entries with unique keys', () => {
    expect(PRESETS).toHaveLength(18);
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(18);
  });

  it('every options preset names a set, and every set has exactly one preset', () => {
    for (const preset of PRESETS) {
      expect(Boolean(preset.setKey)).toBe(preset.kind === 'options');
    }
    const used = PRESETS.map((p) => p.setKey).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
    expect([...used].sort()).toEqual([...OPTION_SET_KEYS].sort());
  });

  it('keeps the route keys of the concept', () => {
    expect(PRESETS.map((p) => p.key).sort()).toEqual(
      [
        'raeume', 'raumzuordnung', 'personen', 'wetter', 'phasen', 'phasenstatus', 'gewerke', 'gewerkstatus',
        'kategorien', 'zahlungsarten', 'bezahlt-von', 'zahlungsstatus', 'bereiche', 'aufgabenstatus',
        'prioritaet', 'rollen', 'kontaktstatus', 'gespraechsarten',
      ].sort(),
    );
  });

  it('puts every entry into a known group', () => {
    for (const preset of PRESETS) expect(PRESET_SECTIONS).toContain(preset.section);
  });

  it('finds by route key', () => {
    expect(findPreset('personen')?.setKey).toBe('people');
    expect(findPreset('phasen')?.kind).toBe('phases');
    expect(findPreset('nope')).toBeUndefined();
    expect(findPreset(undefined)).toBeUndefined();
  });
});
