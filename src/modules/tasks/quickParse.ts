/**
 * Short-hand in the quick task field: "Fliesenkleber bestellen morgen ! Bad" becomes the
 * task "Fliesenkleber bestellen", due tomorrow, high priority, room Bad.
 *
 * Understood: heute, morgen, übermorgen, weekdays (Mo/Montag … So/Sonntag, the next one
 * to come), dates like 12.10. or 12.10.2026, "!" for high priority, and names of rooms,
 * people and trades. Dates and "!" leave the title; a name only leaves it at the very
 * end ("… Bad"), inside the sentence it stays ("Maler anrufen" keeps its words).
 * Names are matched exactly (case-insensitive) and only when unambiguous.
 */
import { addDays, parseIsoDate, toIsoDate } from '@/lib/date';

export interface NamedItem {
  id: string;
  name: string;
}

export interface QuickContext {
  today: string;
  rooms: readonly NamedItem[];
  people: readonly NamedItem[];
  trades: readonly NamedItem[];
}

export type QuickKind = 'due' | 'priority' | 'room' | 'person' | 'trade';

export interface QuickHit {
  kind: QuickKind;
  /** iso date for due, the id for room/person/trade, 'hoch' for priority */
  value: string;
  /** the words in the text it came from */
  text: string;
}

export interface QuickTask {
  title: string;
  hits: QuickHit[];
}

const WEEKDAYS: Record<string, number> = {
  so: 0, sonntag: 0,
  mo: 1, montag: 1,
  di: 2, dienstag: 2,
  mi: 3, mittwoch: 3,
  do: 4, donnerstag: 4,
  fr: 5, freitag: 5,
  sa: 6, samstag: 6,
};

function normal(word: string): string {
  return word.toLocaleLowerCase('de-DE').replace(/[.,;:]+$/, '');
}

function dateOf(word: string, today: string): string | null {
  const lower = normal(word);
  if (lower === 'heute') return today;
  if (lower === 'morgen') return addDays(today, 1);
  if (lower === 'übermorgen' || lower === 'uebermorgen') return addDays(today, 2);
  if (lower in WEEKDAYS) {
    const now = parseIsoDate(today).getDay();
    const ahead = (WEEKDAYS[lower]! - now + 7) % 7 || 7;
    return addDays(today, ahead);
  }
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?$/.exec(word.trim());
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const thisYear = parseIsoDate(today).getFullYear();
    let year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : thisYear;
    const candidate = new Date(year, month - 1, day);
    if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
    // "3.1." in December means next January
    if (!match[3] && toIsoDate(candidate) < today) year += 1;
    return toIsoDate(new Date(year, month - 1, day));
  }
  return null;
}

/** the one item called exactly `words`, or nothing when there is none or more than one */
function unique(items: readonly NamedItem[], words: string): NamedItem | null {
  const wanted = normal(words);
  const found = items.filter((item) => normal(item.name) === wanted);
  return found.length === 1 ? found[0]! : null;
}

const NAMED: { kind: Exclude<QuickKind, 'due' | 'priority'>; key: keyof Omit<QuickContext, 'today'> }[] = [
  { kind: 'room', key: 'rooms' },
  { kind: 'person', key: 'people' },
  { kind: 'trade', key: 'trades' },
];

export function parseQuickTask(text: string, context: QuickContext, ignored: readonly QuickKind[] = []): QuickTask {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const hits: QuickHit[] = [];
  const keep: boolean[] = words.map(() => true);
  const taken = new Set<QuickKind>(ignored);

  words.forEach((typed, index) => {
    // "!" may stand alone or stick to a word: "heute!", "!Kamin"
    let word = typed;
    const bangs = /^(!*)(.*?)(!*)$/.exec(typed)!;
    if (!taken.has('priority') && (bangs[1] || bangs[3])) {
      hits.push({ kind: 'priority', value: 'hoch', text: '!' });
      taken.add('priority');
      word = bangs[2]!;
      words[index] = word;
      if (!word) {
        keep[index] = false;
        return;
      }
    }
    if (!taken.has('due')) {
      const due = dateOf(word, context.today);
      if (due) {
        hits.push({ kind: 'due', value: due, text: word });
        keep[index] = false;
        taken.add('due');
      }
    }
  });

  // names of up to three words; the longest match wins, at the end they leave the title
  for (let index = 0; index < words.length; index += 1) {
    if (!keep[index]) continue;
    for (let length = Math.min(3, words.length - index); length >= 1; length -= 1) {
      const span = words.slice(index, index + length);
      if (span.some((_, offset) => !keep[index + offset])) continue;
      const phrase = span.join(' ');
      const named = NAMED.find(({ kind, key }) => !taken.has(kind) && unique(context[key], phrase));
      if (!named) continue;
      const item = unique(context[named.key], phrase)!;
      hits.push({ kind: named.kind, value: item.id, text: phrase });
      taken.add(named.kind);
      const atEnd = words.slice(index + length).every((_, offset) => !keep[index + length + offset]);
      if (atEnd) for (let offset = 0; offset < length; offset += 1) keep[index + offset] = false;
      index += length - 1;
      break;
    }
  }

  const title = words.filter((_, index) => keep[index]).join(' ').trim();
  return { title, hits };
}
