import { describe, expect, it } from 'vitest';
import { countUsage } from '@/data/presetUsage';
import { DEFAULT_OPTIONS } from '@/data/options';

const D = DEFAULT_OPTIONS;

describe('countUsage', () => {
  it('counts people once per record, by id, old texts included', () => {
    const usage = countUsage('people', D.people, {
      diary: [{ present: ['thomas', 'Thomas', 'sarah'] }, { present: ['Thomas'] }],
    });
    expect(usage.get('thomas')).toBe(2);
    expect(usage.get('sarah')).toBe(1);
  });

  it('counts task assignees too, the old "Beide" for Thomas and Sarah', () => {
    const usage = countUsage('people', D.people, {
      diary: [{ present: ['thomas'] }],
      tasks: [
        { status: 'offen', priority: 'hoch', assignees: ['Beide'] },
        { status: 'offen', priority: 'hoch', assignees: ['thomas', 'handwerker'] },
      ],
    });
    expect(usage.get('thomas')).toBe(3);
    expect(usage.get('sarah')).toBe(1);
    expect(usage.get('handwerker')).toBe(1);
  });

  it('counts weather, categories and areas', () => {
    expect(countUsage('weather', D.weather, { diary: [{ present: [], weather: 'Regen' }, { present: [] }] }).get('regen')).toBe(1);
    expect(countUsage('costCategories', D.costCategories, { costs: [{ category: 'Dach' }, { category: 'Dach' }] } as never).get('dach')).toBe(2);
    expect(countUsage('taskAreas', D.taskAreas, { tasks: [{ area: 'Keller' }, {}] } as never).get('keller')).toBe(1);
  });

  it('counts the cost fields', () => {
    const costs = [
      { category: 'x', paymentStatus: 'bezahlt', paidBy: 'Thomas', paymentMethod: 'Karte' },
      { category: 'x', paymentStatus: 'offen', paidBy: 'thomas', paymentMethod: 'bar' },
    ];
    expect(countUsage('paymentStatus', D.paymentStatus, { costs }).get('bezahlt')).toBe(1);
    expect(countUsage('payers', D.payers, { costs }).get('thomas')).toBe(2);
    expect(countUsage('paymentMethods', D.paymentMethods, { costs }).get('bar')).toBe(1);
  });

  it('counts priority over tasks and trades', () => {
    const usage = countUsage('priority', D.priority, {
      tasks: [{ status: 'offen', priority: 'Hoch', assignees: [] }],
      trades: [{ status: 'noch-offen', priority: 'hoch' }, { status: 'noch-offen', priority: 'mittel' }],
    });
    expect(usage.get('hoch')).toBe(2);
    expect(usage.get('mittel')).toBe(1);
  });

  it('counts the states of tasks, trades, phases, contacts and logs', () => {
    expect(countUsage('taskStatus', D.taskStatus, { tasks: [{ status: 'In Arbeit', priority: 'x', assignees: [] }] }).get('in-arbeit')).toBe(1);
    expect(countUsage('tradeStatus', D.tradeStatus, { trades: [{ status: 'Noch offen', priority: 'x' }] }).get('noch-offen')).toBe(1);
    expect(countUsage('phaseStatus', D.phaseStatus, { phases: [{ status: 'in-arbeit' }, { status: 'geplant' }] }).get('in-arbeit')).toBe(1);
    expect(countUsage('contactStatus', D.contactStatus, { contacts: [{ roles: [], status: 'Aktiv' }] }).get('aktiv')).toBe(1);
    expect(countUsage('contactChannels', D.contactChannels, { contactLogs: [{ channel: 'E-Mail' }, { channel: 'e-mail' }] }).get('e-mail')).toBe(2);
  });

  it('reads the legacy role field of contacts', () => {
    const usage = countUsage('contactRoles', D.contactRoles, {
      contacts: [{ roles: ['Maler'] }, { roles: [], role: 'Maler' }, { roles: ['Notar'] }],
    } as never);
    expect(usage.get('maler')).toBe(2);
    expect(usage.get('notar')).toBe(1);
  });

  it('keeps an unknown value under its raw text', () => {
    expect(countUsage('weather', D.weather, { diary: [{ present: [], weather: 'Hagel' }] }).get('Hagel')).toBe(1);
  });

  it('is empty without sources', () => {
    expect(countUsage('people', D.people, {}).size).toBe(0);
  });
});
