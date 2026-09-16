import { describe, expect, it } from 'vitest';
import { buildIndex, countByKind, ranges, search, snippet, type SearchRecord } from '../engine';

const RECORDS: SearchRecord[] = [
  {
    id: 'diary:1',
    kind: 'diary',
    title: 'Innenputz im Obergeschoss',
    subtitle: 'Mi, 09.09.2026',
    body: 'Der Putzer hat die Wände im Bad verputzt. Morgen kommt der Estrich.',
    meta: ['09.09.2026', 'Bad', 'Putzarbeiten'],
    date: '2026-09-09',
    to: '/tagebuch/1',
  },
  {
    id: 'cost:1',
    kind: 'cost',
    title: 'Fliesen Müller GmbH',
    subtitle: '13.09.2026 · Material',
    body: 'Bodenfliesen Bad, 24 m²',
    meta: ['13.09.2026', 'Material', '1.234,56 €', 'Bad'],
    date: '2026-09-13',
    badge: '1.234,56 €',
    to: '/kosten/1',
  },
  {
    id: 'task:1',
    kind: 'task',
    title: 'Angebot Estrich einholen',
    subtitle: 'Offen · Hoch',
    body: '',
    meta: ['Offen', 'Hoch', 'Thomas'],
    to: '/aufgaben?aufgabe=1',
  },
  {
    id: 'contact:1',
    kind: 'contact',
    title: 'Sanitär Schröder',
    subtitle: 'Installateur',
    body: 'Telefonat am 10.09.: kommt nach dem Estrich, will 1.900 € für die Steigleitung.',
    meta: ['Installateur', '0171 2345678', 'Beauftragt'],
    to: '/kontakte?kontakt=1',
  },
];

const index = buildIndex(RECORDS);

describe('search', () => {
  it('finds a word inside a German compound', () => {
    const hits = search(index, 'putz');
    expect(hits.map((hit) => hit.record.id)).toContain('diary:1');
  });

  it('ranks the title above the body', () => {
    const hits = search(index, 'estrich');
    const ids = hits.map((hit) => hit.record.id);
    expect(ids[0]).toBe('task:1');
    expect(ids).toContain('diary:1');
    expect(ids).toContain('contact:1');
  });

  it('requires every word of the query to match', () => {
    expect(search(index, 'fliesen bad').map((hit) => hit.record.id)).toEqual(['cost:1']);
    expect(search(index, 'fliesen estrich')).toEqual([]);
  });

  it('finds an amount however it is typed', () => {
    expect(search(index, '1.234,56').map((hit) => hit.record.id)).toEqual(['cost:1']);
    expect(search(index, '1234,56').map((hit) => hit.record.id)).toEqual(['cost:1']);
  });

  it('finds a date by its German day and month', () => {
    expect(search(index, '13.09').map((hit) => hit.record.id)).toEqual(['cost:1']);
  });

  it('ignores case and umlaut spelling', () => {
    expect(search(index, 'MÜLLER').map((hit) => hit.record.id)).toEqual(['cost:1']);
    expect(search(index, 'mueller').map((hit) => hit.record.id)).toEqual(['cost:1']);
    expect(search(index, 'schroeder').map((hit) => hit.record.id)).toEqual(['contact:1']);
  });

  it('searches the extras that are not shown as text', () => {
    expect(search(index, 'thomas').map((hit) => hit.record.id)).toEqual(['task:1']);
    expect(search(index, '0171').map((hit) => hit.record.id)).toEqual(['contact:1']);
  });

  it('narrows to one kind and counts the others', () => {
    const all = search(index, 'bad');
    expect(countByKind(all).diary).toBe(1);
    expect(countByKind(all).cost).toBe(1);
    expect(search(index, 'bad', { kinds: ['cost'] }).map((hit) => hit.record.id)).toEqual(['cost:1']);
  });

  it('returns nothing for an empty query and for a miss', () => {
    expect(search(index, '   ')).toEqual([]);
    expect(search(index, 'dachfenster')).toEqual([]);
  });

  it('honours the limit', () => {
    expect(search(index, 'e', { limit: 2 })).toHaveLength(2);
  });
});

describe('highlighting', () => {
  it('points at the hit in the original text, not the folded one', () => {
    const text = 'Sanitär Schröder';
    const [range] = ranges(text, ['schroder']);
    expect(text.slice(range[0], range[1])).toBe('Schröder');
  });

  it('cuts a snippet around the hit', () => {
    const long = `${'Vorlauf '.repeat(40)}Estrich gegossen. ${'Nachlauf '.repeat(40)}`;
    const cut = snippet(long, ['estrich']);
    expect(cut.text).toContain('Estrich');
    expect(cut.text.length).toBeLessThan(200);
    expect(cut.text.slice(cut.ranges[0][0], cut.ranges[0][1])).toBe('Estrich');
  });

  it('survives a text without a hit', () => {
    expect(snippet('Kurzer Text', ['nichts']).ranges).toEqual([]);
    expect(snippet('', ['nichts']).text).toBe('');
  });
});
