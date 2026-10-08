import { describe, expect, it } from 'vitest';
import { parseQuickTask, type QuickContext } from '../quickParse';

// Thursday, 8 October 2026
const context: QuickContext = {
  today: '2026-10-08',
  rooms: [
    { id: 'eg-bad', name: 'Bad' },
    { id: 'eg-kueche', name: 'Küche' },
    { id: 'eg-flur', name: 'Flur' },
    { id: 'og-flur', name: 'Flur' },
  ],
  people: [{ id: 'tom', name: 'Tom' }],
  trades: [{ id: 'maler', name: 'Maler' }],
};

describe('quick task short-hand', () => {
  it('reads date, priority and a trailing room, and keeps the rest as title', () => {
    expect(parseQuickTask('Fliesenkleber bestellen morgen ! Bad', context)).toEqual({
      title: 'Fliesenkleber bestellen',
      hits: [
        { kind: 'due', value: '2026-10-09', text: 'morgen' },
        { kind: 'priority', value: 'hoch', text: '!' },
        { kind: 'room', value: 'eg-bad', text: 'Bad' },
      ],
    });
  });

  it('keeps a name inside the sentence in the title', () => {
    const task = parseQuickTask('Maler anrufen wegen Küche', context);
    expect(task.title).toBe('Maler anrufen wegen');
    expect(task.hits.map((hit) => [hit.kind, hit.value])).toEqual([
      ['trade', 'maler'],
      ['room', 'eg-kueche'],
    ]);
  });

  it('understands weekdays and dates, the next one to come', () => {
    expect(parseQuickTask('Abnahme Fr', context).hits[0]?.value).toBe('2026-10-09');
    expect(parseQuickTask('Abnahme Mittwoch', context).hits[0]?.value).toBe('2026-10-14');
    expect(parseQuickTask('Termin 12.10.', context).hits[0]?.value).toBe('2026-10-12');
    expect(parseQuickTask('Termin 3.1.', context).hits[0]?.value).toBe('2027-01-03');
    expect(parseQuickTask('Termin 31.2.', context).hits).toEqual([]);
  });

  it('leaves ambiguous names alone and honours what was switched off', () => {
    expect(parseQuickTask('Flur streichen', context).hits).toEqual([]);
    const task = parseQuickTask('Tom fragen morgen', context, ['due']);
    expect(task.title).toBe('Tom fragen morgen');
    expect(task.hits).toEqual([{ kind: 'person', value: 'tom', text: 'Tom' }]);
  });
});
