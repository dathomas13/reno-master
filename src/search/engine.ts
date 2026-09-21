/**
 * The search engine: a small inverted index over everything the app stores.
 *
 * Why an index at all - the data set is one house, not a library. The answer is the
 * phone: a linear scan means folding every diary text on every keystroke, and that is
 * exactly where a Galaxy S24 starts to stutter. So the text is folded **once** when the
 * index is built (`buildIndex`), and a query only touches the records that can possibly
 * match:
 *
 *   1. every two-character sequence of the folded text points at the records containing it
 *   2. a query word looks up its rarest pairs and intersects the lists - that is the
 *      candidate set, usually a handful of records
 *   3. only those candidates are checked properly and scored
 *
 * Matching is substring matching, on purpose: German compounds ('Innenputz', 'Fliesenkleber')
 * would be unreachable from the middle otherwise. A hit at the start of a word scores
 * higher than one inside it, a whole word higher still, and the title higher than the body.
 *
 * All words of the query have to match (AND), each of them anywhere in the record.
 */
import { fold, normalize, terms as splitTerms } from './normalize';

export type SearchKind =
  | 'diary'
  | 'cost'
  | 'task'
  | 'note'
  | 'contact'
  | 'trade'
  | 'room'
  | 'phase'
  | 'plan'
  | 'photo';

export interface SearchRecord {
  /** unique across kinds, e.g. 'cost:abc123' */
  id: string;
  kind: SearchKind;
  title: string;
  /** the grey line under the title; searched with the meta words */
  subtitle?: string;
  /** the long text: what the snippet is cut from */
  body?: string;
  /** searchable extras that are not shown as such: room names, status, dates, amounts */
  meta?: string[];
  /** ISO date, used to order equally good hits and shown on the right */
  date?: string;
  /** short label on the right of the row, e.g. an amount */
  badge?: string;
  /** where a tap leads */
  to: string;
}

interface IndexedRecord {
  record: SearchRecord;
  title: string;
  meta: string;
  body: string;
}

export interface SearchIndex {
  records: IndexedRecord[];
  /**
   * Two-character sequence -> ascending record positions. The key is the two character
   * codes in one number: building millions of two-letter strings costs more than the
   * whole rest of the index.
   */
  grams: Map<number, number[]>;
}

export interface SearchHit {
  record: SearchRecord;
  score: number;
  /** the folded query words, for highlighting */
  terms: string[];
}

export interface SearchOptions {
  kinds?: readonly SearchKind[];
  limit?: number;
}

const TITLE_WEIGHT = 8;
const META_WEIGHT = 3;
const BODY_WEIGHT = 1.5;

/** a tie between equally good hits goes to the kind that is more likely meant */
const KIND_ORDER: Record<SearchKind, number> = {
  diary: 0,
  task: 1,
  note: 2,
  cost: 3,
  contact: 4,
  room: 5,
  trade: 6,
  phase: 7,
  plan: 8,
  photo: 9,
};

const SPACE = 32;

function gramKey(first: number, second: number): number {
  return first * 65536 + second;
}

function addGrams(grams: Map<number, number[]>, text: string, position: number): void {
  let previous = text.charCodeAt(0);
  for (let i = 1; i < text.length; i += 1) {
    const current = text.charCodeAt(i);
    if (previous !== SPACE && current !== SPACE) {
      const key = gramKey(previous, current);
      const list = grams.get(key);
      if (!list) grams.set(key, [position]);
      else if (list[list.length - 1] !== position) list.push(position);
    }
    previous = current;
  }
}

export function buildIndex(records: SearchRecord[]): SearchIndex {
  const indexed: IndexedRecord[] = [];
  const grams = new Map<number, number[]>();

  records.forEach((record, position) => {
    const title = normalize(record.title);
    const meta = normalize([record.subtitle, ...(record.meta ?? [])].filter(Boolean).join(' '));
    const body = normalize(record.body ?? '');
    indexed.push({ record, title, meta, body });
    addGrams(grams, title, position);
    addGrams(grams, meta, position);
    addGrams(grams, body, position);
  });

  return { records: indexed, grams };
}

/** the positions both sorted lists have in common */
function intersect(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i];
    const right = b[j];
    if (left === right) {
      out.push(left);
      i += 1;
      j += 1;
    } else if (left < right) i += 1;
    else j += 1;
  }
  return out;
}

/**
 * The records that can contain `term`, via the index. `null` means "no idea, look at
 * everything" - that happens for a single character, which has no pair to look up.
 */
function candidates(index: SearchIndex, term: string): number[] | null {
  if (term.length < 2) return null;

  const lists: number[][] = [];
  for (let i = 0; i + 1 < term.length; i += 1) {
    const list = index.grams.get(gramKey(term.charCodeAt(i), term.charCodeAt(i + 1)));
    if (!list) return []; // a pair nobody has: the term cannot match anywhere
    lists.push(list);
  }
  if (!lists.length) return null;

  // the rarest pairs prune the most; three of them are enough, more only costs time
  lists.sort((a, b) => a.length - b.length);
  let result = lists[0];
  for (let i = 1; i < Math.min(lists.length, 3) && result.length; i += 1) {
    result = intersect(result, lists[i]);
  }
  return result;
}

/**
 * How well `term` sits in `zone`: a whole word beats the start of a word, which beats a
 * hit somewhere inside one ('putz' in 'innenputz').
 */
function zoneScore(zone: string, term: string, weight: number): number {
  let position = zone.indexOf(term);
  if (position < 0) return 0;
  let best = weight;
  while (position >= 0) {
    const wordStart = position === 0 || zone[position - 1] === ' ';
    const end = position + term.length;
    const wordEnd = end === zone.length || zone[end] === ' ';
    if (wordStart && wordEnd) return weight * 4;
    if (wordStart) best = Math.max(best, weight * 2.5);
    position = zone.indexOf(term, position + 1);
  }
  return best;
}

export function search(index: SearchIndex, query: string, options: SearchOptions = {}): SearchHit[] {
  const words = splitTerms(query);
  if (!words.length) return [];
  const kinds = options.kinds?.length ? new Set(options.kinds) : null;
  const phrase = words.length > 1 ? words.join(' ') : '';

  // the candidate set: records that carry every word, before anything is scored
  let positions: number[] | null = null;
  for (const word of words) {
    const list = candidates(index, word);
    if (list === null) continue;
    positions = positions === null ? list : intersect(positions, list);
    if (!positions.length) return [];
  }
  let scan = positions;
  if (scan === null) {
    scan = [];
    for (let i = 0; i < index.records.length; i += 1) scan.push(i);
  }

  const hits: SearchHit[] = [];
  for (const position of scan) {
    const entry = index.records[position];
    if (kinds && !kinds.has(entry.record.kind)) continue;

    let score = 0;
    let missed = false;
    for (const word of words) {
      const best = Math.max(
        zoneScore(entry.title, word, TITLE_WEIGHT),
        zoneScore(entry.meta, word, META_WEIGHT),
        zoneScore(entry.body, word, BODY_WEIGHT),
      );
      if (!best) {
        missed = true;
        break;
      }
      score += best;
    }
    if (missed) continue;

    // words next to each other, the way they were typed, are worth more than scattered ones
    if (phrase) {
      score += Math.max(
        zoneScore(entry.title, phrase, TITLE_WEIGHT),
        zoneScore(entry.meta, phrase, META_WEIGHT),
        zoneScore(entry.body, phrase, BODY_WEIGHT),
      );
    }

    hits.push({ record: entry.record, score, terms: words });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const kind = KIND_ORDER[a.record.kind] - KIND_ORDER[b.record.kind];
    if (kind) return kind;
    if (a.record.date !== b.record.date) return (b.record.date ?? '').localeCompare(a.record.date ?? '');
    return a.record.title.localeCompare(b.record.title, 'de');
  });

  return options.limit ? hits.slice(0, options.limit) : hits;
}

/** how many hits each kind has, for the filter chips */
export function countByKind(hits: SearchHit[]): Record<SearchKind, number> {
  const counts = {} as Record<SearchKind, number>;
  for (const key of Object.keys(KIND_ORDER) as SearchKind[]) counts[key] = 0;
  for (const hit of hits) counts[hit.record.kind] += 1;
  return counts;
}

export type Range = [start: number, end: number];

/**
 * Where the query words sit in the *original* text - folding changes the length ('ß' to
 * 's', '1.234' to '1234'), so the positions come from the map the folder recorded.
 */
export function ranges(text: string, words: string[]): Range[] {
  if (!text || !words.length) return [];
  const folded = fold(text);
  const found: Range[] = [];

  for (const word of words) {
    let position = folded.text.indexOf(word);
    while (position >= 0) {
      const start = folded.map[position];
      const after = position + word.length;
      const end = after < folded.map.length ? folded.map[after] : text.length;
      if (start !== undefined && end > start) found.push([start, end]);
      position = folded.text.indexOf(word, position + 1);
    }
  }

  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Range[] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

export interface Snippet {
  text: string;
  ranges: Range[];
}

/**
 * A readable piece of the body around the first hit, with the highlight positions moved
 * to the cut text. Without a hit it is simply the beginning.
 */
export function snippet(text: string, words: string[], length = 150): Snippet {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { text: '', ranges: [] };
  const found = ranges(clean, words);
  const first = found[0]?.[0] ?? 0;

  let start = Math.max(0, first - Math.floor(length / 3));
  if (start > 0) {
    const space = clean.indexOf(' ', start);
    start = space >= 0 && space < start + 20 ? space + 1 : start;
  }
  let end = Math.min(clean.length, start + length);
  if (end < clean.length) {
    const space = clean.lastIndexOf(' ', end);
    if (space > start + length / 2) end = space;
  }

  const cut = clean.slice(start, end);
  const shifted = found
    .filter((range) => range[1] > start && range[0] < end)
    .map<Range>((range) => [Math.max(0, range[0] - start), Math.min(cut.length, range[1] - start)]);

  return {
    text: `${start > 0 ? '… ' : ''}${cut}${end < clean.length ? ' …' : ''}`,
    ranges: start > 0 ? shifted.map<Range>((range) => [range[0] + 2, range[1] + 2]) : shifted,
  };
}
