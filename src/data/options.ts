/**
 * Pick lists whose values are stored as ids, never as display texts (see KENNUNGEN.md).
 * Pure: no Firebase, no React, so it tests without either and the reminder planner can
 * use the helpers without a hook.
 *
 * A record carries the id of an entry ("erledigt"); the label ("Erledigt") is looked up
 * when it is shown, so renaming an entry never touches a record. Reading is tolerant:
 * records written before the switch still carry the old German text and resolve too.
 */
import type { Lists } from './types';
import { SEED_LISTS } from './seed/lists';
import { findDuplicate, normalizeEntry } from './presetLists';

export interface OptionEntry {
  id: string;
  label: string;
  /** hidden from the pickers, kept for records that still point at it */
  archived?: boolean;
}

export const FIXED_SET_KEYS = ['taskStatus', 'phaseStatus', 'priority', 'paymentStatus'] as const;
export type FixedSetKey = (typeof FIXED_SET_KEYS)[number];

export const FREE_SET_KEYS = [
  'people',
  'weather',
  'costCategories',
  'taskAreas',
  'contactRoles',
  'paymentMethods',
  'payers',
  'contactChannels',
  'tradeStatus',
  'contactStatus',
] as const;
export type FreeSetKey = (typeof FREE_SET_KEYS)[number];

export type OptionSetKey = FixedSetKey | FreeSetKey;
export type OptionSets = Record<OptionSetKey, OptionEntry[]>;

export const OPTION_SET_KEYS: readonly OptionSetKey[] = [...FIXED_SET_KEYS, ...FREE_SET_KEYS];
/** the sets the code relies on: they can be renamed and sorted, nothing else */
export const FIXED_SETS: readonly OptionSetKey[] = FIXED_SET_KEYS;

export function isFixedSet(key: OptionSetKey): key is FixedSetKey {
  return (FIXED_SET_KEYS as readonly string[]).includes(key);
}

// ------------------------------------------------------------------ ids

const UMLAUTS: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

/** deterministic id of a name: lower case, umlauts spelled out, everything else a dash */
export function slugify(label: string): string {
  const slug = label
    .normalize('NFC')
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'x';
}

/** the slug of `label`, with -2, -3 ... appended until no entry of the set has it (archived ones count) */
export function uniqueId(label: string, existing: readonly (OptionEntry | string)[]): string {
  const taken = new Set(existing.map((item) => (typeof item === 'string' ? item : item.id)));
  const base = slugify(label);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// ------------------------------------------------------------------ defaults

/** the old display texts, in the old order; the source of the ids */
const TASK_STATUS_LABELS = ['Offen', 'In Arbeit', 'Wartet auf', 'Erledigt'];
const PHASE_STATUS_LABELS = ['Geplant', 'In Arbeit', 'Abgeschlossen', 'Blockiert'];
const PRIORITY_LABELS = ['Hoch', 'Mittel', 'Niedrig'];
const PAYMENT_STATUS_LABELS = ['Offen', 'Bezahlt', 'Erstattet'];
const WEATHER_LABELS = ['Sonnig', 'Bewölkt', 'Regen', 'Frost', 'Schnee'];
const PAYMENT_METHOD_LABELS = ['Karte', 'Bar', 'Überweisung', 'PayPal'];
const PAYER_LABELS = ['Thomas', 'Sarah', 'Gemeinsam'];
const CONTACT_CHANNEL_LABELS = ['Anruf', 'Termin', 'E-Mail', 'Nachricht', 'Sonstiges'];
const TRADE_STATUS_LABELS = [
  'Noch offen',
  'Geplant',
  'Angebot einholen',
  'Angebote vergleichen',
  'Beauftragt',
  'In Arbeit',
  'Abnahme',
  'Fertig',
];
const CONTACT_STATUS_LABELS = [
  'Angefragt',
  'Angebot erhalten',
  'Beauftragt',
  'Aktiv',
  'Abgeschlossen',
  'Abgelehnt',
];

/** entries for a list of labels, ids from the slugs (collisions get a suffix) */
export function entriesFromLabels(labels: readonly string[]): OptionEntry[] {
  const entries: OptionEntry[] = [];
  for (const raw of labels) {
    const label = normalizeEntry(raw);
    if (!label || findDuplicate(entries.map((e) => e.label), label)) continue;
    entries.push({ id: uniqueId(label, entries), label });
  }
  return entries;
}

/** the old texts, for the deprecated constant arrays in types.ts */
export const LEGACY_LABELS = {
  taskStatus: TASK_STATUS_LABELS,
  phaseStatus: PHASE_STATUS_LABELS,
  priority: PRIORITY_LABELS,
  paymentStatus: ['offen', 'bezahlt', 'erstattet'],
  weather: WEATHER_LABELS,
  paymentMethods: PAYMENT_METHOD_LABELS,
  payers: PAYER_LABELS,
  contactChannels: CONTACT_CHANNEL_LABELS,
  tradeStatus: TRADE_STATUS_LABELS,
  contactStatus: CONTACT_STATUS_LABELS,
} as const;

/** the start values of every set; fixed sets are also their code definition */
export const DEFAULT_OPTIONS: OptionSets = {
  taskStatus: entriesFromLabels(TASK_STATUS_LABELS),
  phaseStatus: entriesFromLabels(PHASE_STATUS_LABELS),
  priority: entriesFromLabels(PRIORITY_LABELS),
  paymentStatus: entriesFromLabels(PAYMENT_STATUS_LABELS),
  people: entriesFromLabels(SEED_LISTS.people),
  weather: entriesFromLabels(WEATHER_LABELS),
  costCategories: entriesFromLabels(SEED_LISTS.costCategories),
  taskAreas: entriesFromLabels(SEED_LISTS.taskAreas),
  contactRoles: entriesFromLabels(SEED_LISTS.contactRoles),
  paymentMethods: entriesFromLabels(PAYMENT_METHOD_LABELS),
  payers: entriesFromLabels(PAYER_LABELS),
  contactChannels: entriesFromLabels(CONTACT_CHANNEL_LABELS),
  tradeStatus: entriesFromLabels(TRADE_STATUS_LABELS),
  contactStatus: entriesFromLabels(CONTACT_STATUS_LABELS),
};

/** ids the code compares against */
export const TASK_OPEN = 'offen';
export const TASK_DONE = 'erledigt';
export const PHASE_ACTIVE = 'in-arbeit';
export const PHASE_DONE = 'abgeschlossen';
export const PRIORITY_HIGH = 'hoch';
export const PRIORITY_MEDIUM = 'mittel';
export const PAYMENT_OPEN = 'offen';
export const PAYMENT_PAID = 'bezahlt';
/** default status of a new trade */
export const TRADE_STATUS_DEFAULT = 'noch-offen';

/** the sets that used to live in `meta/lists` as plain strings */
export const LEGACY_LIST_KEYS = ['people', 'weather', 'costCategories', 'taskAreas', 'contactRoles'] as const;

function cloneEntries(entries: readonly OptionEntry[]): OptionEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

// ------------------------------------------------------------------ reading

function same(a: string, b: string): boolean {
  return a.localeCompare(b, 'de', { sensitivity: 'accent' }) === 0;
}

function isEntry(value: unknown): value is OptionEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && entry.id !== '' && typeof entry.label === 'string';
}

/** entries as stored: bad rows and repeated ids dropped, `archived` only when true */
function cleanStored(raw: unknown): OptionEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: OptionEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      // a plain list, e.g. `meta/lists`
      const label = normalizeEntry(item);
      if (!label || result.some((e) => same(e.label, label))) continue;
      const id = uniqueId(label, result);
      seen.add(id);
      result.push({ id, label });
      continue;
    }
    if (!isEntry(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item.archived === true ? { id: item.id, label: item.label, archived: true } : { id: item.id, label: item.label });
  }
  return result;
}

/** fixed sets: the code definition decides which ids exist, the document only names and orders them */
function mergeFixed(key: FixedSetKey, raw: unknown): OptionEntry[] {
  const definition = DEFAULT_OPTIONS[key];
  const known = new Map(definition.map((entry) => [entry.id, entry]));
  const result: OptionEntry[] = [];
  for (const entry of cleanStored(raw)) {
    const base = known.get(entry.id);
    if (!base || result.some((e) => e.id === entry.id)) continue;
    result.push({ id: entry.id, label: normalizeEntry(entry.label) || base.label });
  }
  for (const entry of definition) {
    if (!result.some((e) => e.id === entry.id)) result.push({ ...entry });
  }
  return result;
}

/**
 * The sets as the app uses them. A set missing from `stored` falls back to the old
 * `meta/lists` (the five legacy ones) and then to the start values; fixed sets are
 * merged with their code definition.
 */
export function normalizeSets(
  stored?: Partial<Record<OptionSetKey, unknown>> | null,
  legacyLists?: Partial<Lists> | null,
): OptionSets {
  const sets = {} as OptionSets;
  for (const key of OPTION_SET_KEYS) {
    const raw = stored?.[key];
    if (isFixedSet(key)) {
      sets[key] = mergeFixed(key, raw);
      continue;
    }
    if (Array.isArray(raw)) {
      sets[key] = cleanStored(raw);
      continue;
    }
    const legacy = (legacyLists as Record<string, unknown> | null | undefined)?.[key];
    sets[key] = Array.isArray(legacy) ? cleanStored(legacy) : cloneEntries(DEFAULT_OPTIONS[key]);
  }
  return sets;
}

/** the entry a stored value points at: by id, by the slug of an old text, by label */
export function resolveOption(entries: readonly OptionEntry[], stored: string | undefined | null): OptionEntry | undefined {
  if (typeof stored !== 'string') return undefined;
  const text = stored.trim();
  if (!text) return undefined;
  const byId = entries.find((entry) => entry.id === text);
  if (byId) return byId;
  const slug = slugify(text);
  const bySlug = entries.find((entry) => entry.id === slug);
  if (bySlug) return bySlug;
  return entries.find((entry) => same(entry.label, text));
}

/** what to show for a stored value: the label, else the raw text; never throws, never empty for a value */
export function labelOf(entries: readonly OptionEntry[], stored: string | undefined | null): string {
  if (typeof stored !== 'string') return '';
  return resolveOption(entries, stored)?.label ?? stored;
}

export function activeEntries(entries: readonly OptionEntry[]): OptionEntry[] {
  return entries.filter((entry) => !entry.archived);
}

// ------------------------------------------------------------------ logic helpers

function idOf(key: OptionSetKey, stored: string | undefined | null, sets?: OptionSets): string | undefined {
  return resolveOption(sets?.[key] ?? DEFAULT_OPTIONS[key], stored)?.id;
}

/** `sets` is optional: without it the check runs against the start values, which is what a plain function needs */
export function isTaskDone(task: { status?: string }, sets?: OptionSets): boolean {
  return idOf('taskStatus', task.status, sets) === TASK_DONE;
}

export function isPhaseActive(phase: { status?: string }, sets?: OptionSets): boolean {
  return idOf('phaseStatus', phase.status, sets) === PHASE_ACTIVE;
}

export function isHighPriority(value: string | undefined | null, sets?: OptionSets): boolean {
  return idOf('priority', value, sets) === PRIORITY_HIGH;
}

export function isPaid(cost: { paymentStatus?: string }, sets?: OptionSets): boolean {
  return idOf('paymentStatus', cost.paymentStatus, sets) === PAYMENT_PAID;
}

/** the old "Beide" counts for Thomas and Sarah */
export function hasAssignee(task: { assignees?: readonly string[] }, personId: string, sets?: OptionSets): boolean {
  const people = sets?.people ?? DEFAULT_OPTIONS.people;
  const wanted = resolveOption(people, personId)?.id ?? personId;
  for (const assignee of task.assignees ?? []) {
    if (typeof assignee !== 'string') continue;
    if (slugify(assignee) === 'beide' && !resolveOption(people, assignee)) {
      if (wanted === 'thomas' || wanted === 'sarah') return true;
      continue;
    }
    const id = resolveOption(people, assignee)?.id ?? assignee;
    if (id === wanted) return true;
  }
  return false;
}

// ------------------------------------------------------------------ editing (pure)

export interface AddResult {
  entries: OptionEntry[];
  /** id of the new entry, of the one the name already belongs to, or '' when the name is invalid */
  id: string;
}

/** appends an entry; a name that exists already returns that entry (shown again when it was archived) */
export function addOption(set: readonly OptionEntry[], label: string): AddResult {
  const clean = normalizeEntry(label);
  if (!clean) return { entries: cloneEntries(set), id: '' };
  const duplicate = set.find((entry) => same(entry.label, clean));
  if (duplicate) {
    return { entries: duplicate.archived ? unarchiveOption(set, duplicate.id) : cloneEntries(set), id: duplicate.id };
  }
  const id = uniqueId(clean, set);
  return { entries: [...cloneEntries(set), { id, label: clean }], id };
}

/** new name for an entry; unchanged when the name is invalid or belongs to another entry */
export function renameOption(set: readonly OptionEntry[], id: string, label: string): OptionEntry[] {
  const clean = normalizeEntry(label);
  if (!clean) return cloneEntries(set);
  const others = set.filter((entry) => entry.id !== id).map((entry) => entry.label);
  if (findDuplicate(others, clean)) return cloneEntries(set);
  return set.map((entry) => (entry.id === id ? { ...entry, label: clean } : { ...entry }));
}

/** hides an entry and says where it was; index -1 when it is not in the set */
export function archiveOption(set: readonly OptionEntry[], id: string): { entries: OptionEntry[]; index: number } {
  const index = set.findIndex((entry) => entry.id === id);
  if (index < 0) return { entries: cloneEntries(set), index: -1 };
  return {
    entries: set.map((entry) => (entry.id === id ? { id: entry.id, label: entry.label, archived: true } : { ...entry })),
    index,
  };
}

export function unarchiveOption(set: readonly OptionEntry[], id: string): OptionEntry[] {
  return set.map((entry) => (entry.id === id ? { id: entry.id, label: entry.label } : { ...entry }));
}

/** moves an entry one step past the next visible neighbour (delta -1 up, +1 down) */
export function moveOption(set: readonly OptionEntry[], id: string, delta: number): OptionEntry[] {
  const from = set.findIndex((entry) => entry.id === id);
  if (from < 0 || delta === 0) return cloneEntries(set);
  const step = delta < 0 ? -1 : 1;
  let to = from;
  for (let moved = 0; moved < Math.abs(delta); moved += 1) {
    let next = to + step;
    while (next >= 0 && next < set.length && set[next].archived) next += step;
    if (next < 0 || next >= set.length) break;
    to = next;
  }
  if (to === from) return cloneEntries(set);
  const next = cloneEntries(set);
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function sortOptionsAlpha(set: readonly OptionEntry[]): OptionEntry[] {
  return cloneEntries(set).sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

/**
 * Back to the start values. Free sets: every start entry shown again with its start name
 * and order, the entries the user added hidden after them. Fixed sets: start names and order.
 */
export function resetOptions(key: OptionSetKey, current: readonly OptionEntry[]): OptionEntry[] {
  const defaults = cloneEntries(DEFAULT_OPTIONS[key]);
  if (isFixedSet(key)) return defaults;
  const known = new Set(defaults.map((entry) => entry.id));
  const own = current
    .filter((entry) => !known.has(entry.id))
    .map((entry) => ({ id: entry.id, label: entry.label, archived: true as const }));
  return [...defaults, ...own];
}
