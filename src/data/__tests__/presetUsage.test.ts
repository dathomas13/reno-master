import { describe, expect, it } from 'vitest';
import { countUsage } from '@/data/presetUsage';

describe('countUsage', () => {
  it('counts people once per entry', () => {
    const usage = countUsage('people', { diary: [{ present: ['A', 'A', 'B'] }, { present: ['A'] }] });
    expect(usage.get('A')).toBe(2);
    expect(usage.get('B')).toBe(1);
  });

  it('counts weather, categories and areas', () => {
    expect(countUsage('weather', { diary: [{ present: [], weather: 'Regen' }, { present: [] }] }).get('Regen')).toBe(1);
    expect(countUsage('costCategories', { costs: [{ category: 'Dach' }, { category: 'Dach' }] }).get('Dach')).toBe(2);
    expect(countUsage('taskAreas', { tasks: [{ area: 'Keller' }, {}] }).get('Keller')).toBe(1);
  });

  it('reads the legacy role field of contacts', () => {
    const usage = countUsage('contactRoles', {
      contacts: [{ roles: ['Maler'] }, { roles: [], role: 'Maler' }, { roles: ['Notar'] }],
    } as never);
    expect(usage.get('Maler')).toBe(2);
    expect(usage.get('Notar')).toBe(1);
  });

  it('is empty without sources', () => {
    expect(countUsage('people', {}).size).toBe(0);
  });
});
