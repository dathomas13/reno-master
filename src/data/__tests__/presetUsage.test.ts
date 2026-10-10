import { describe, expect, it } from 'vitest';
import { countUsage } from '@/data/presetUsage';

describe('countUsage', () => {
  it('counts people once per record, by id', () => {
    const usage = countUsage('people', {
      diary: [{ present: ['thomas', 'thomas', 'sarah'] }, { present: ['thomas'] }],
    });
    expect(usage.get('thomas')).toBe(2);
    expect(usage.get('sarah')).toBe(1);
  });

  it('counts task assignees too', () => {
    const usage = countUsage('people', {
      diary: [{ present: ['thomas'] }],
      tasks: [
        { status: 'offen', priority: 'hoch', area: 'keller', assignees: ['thomas', 'sarah'] },
        { status: 'offen', priority: 'hoch', area: 'keller', assignees: ['thomas', 'handwerker'] },
      ],
    } as never);
    expect(usage.get('thomas')).toBe(3);
    expect(usage.get('sarah')).toBe(1);
    expect(usage.get('handwerker')).toBe(1);
  });

  it('counts the people who took part in a conversation', () => {
    const usage = countUsage('people', {
      contactLogs: [{ participants: ['wolfgang', 'wolfgang'] }, { channel: 'anruf' }],
    });
    expect(usage.get('wolfgang')).toBe(1);
  });

  it('counts weather, categories and areas', () => {
    expect(countUsage('weather', { diary: [{ present: [], weather: 'regen' }, { present: [] }] }).get('regen')).toBe(1);
    expect(countUsage('costCategories', { costs: [{ category: 'dach' }, { category: 'dach' }] } as never).get('dach')).toBe(2);
    expect(countUsage('taskAreas', { tasks: [{ area: 'keller' }, {}] } as never).get('keller')).toBe(1);
  });

  it('counts the cost fields', () => {
    const costs = [
      { category: 'x', paymentStatus: 'bezahlt', paidBy: 'thomas', paymentMethod: 'karte' },
      { category: 'x', paymentStatus: 'offen', paidBy: 'thomas', paymentMethod: 'bar' },
    ];
    expect(countUsage('paymentStatus', { costs }).get('bezahlt')).toBe(1);
    expect(countUsage('payers', { costs }).get('thomas')).toBe(2);
    expect(countUsage('paymentMethods', { costs }).get('bar')).toBe(1);
  });

  it('counts priority over tasks and trades', () => {
    const usage = countUsage('priority', {
      tasks: [{ status: 'offen', priority: 'hoch', area: 'x', assignees: [] }],
      trades: [{ status: 'noch-offen', priority: 'hoch' }, { status: 'noch-offen', priority: 'mittel' }],
    } as never);
    expect(usage.get('hoch')).toBe(2);
    expect(usage.get('mittel')).toBe(1);
  });

  it('counts the states of tasks, trades, phases, contacts and logs', () => {
    expect(countUsage('taskStatus', { tasks: [{ status: 'in-arbeit', priority: 'x', assignees: [] }] } as never).get('in-arbeit')).toBe(1);
    expect(countUsage('tradeStatus', { trades: [{ status: 'noch-offen', priority: 'x' }] } as never).get('noch-offen')).toBe(1);
    expect(countUsage('phaseStatus', { phases: [{ status: 'in-arbeit' }, { status: 'geplant' }] } as never).get('in-arbeit')).toBe(1);
    expect(countUsage('contactStatus', { contacts: [{ roles: [], status: 'aktiv' }] }).get('aktiv')).toBe(1);
    expect(countUsage('contactChannels', { contactLogs: [{ channel: 'e-mail' }, { channel: 'e-mail' }] }).get('e-mail')).toBe(2);
  });

  it('counts contact roles', () => {
    const usage = countUsage('contactRoles', { contacts: [{ roles: ['maler'] }, { roles: ['maler', 'notar'] }] });
    expect(usage.get('maler')).toBe(2);
    expect(usage.get('notar')).toBe(1);
  });

  it('keeps an unknown value under its raw id', () => {
    expect(countUsage('weather', { diary: [{ present: [], weather: 'hagel' }] }).get('hagel')).toBe(1);
  });

  it('is empty without sources', () => {
    expect(countUsage('people', {}).size).toBe(0);
  });
});
