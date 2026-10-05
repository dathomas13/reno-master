/**
 * The pure half of the switch from display texts to ids (KENNUNGEN.md): given the old lists,
 * the current `meta/options` and every affected record, it says what `meta/options` becomes
 * and which records get which patch. No Firebase in here, so it tests without it.
 *
 * Idempotent: a value that already is an id of its set stays, so a second run over the
 * migrated records plans nothing.
 */
import { COL, type Lists } from './types';
import {
  addOption,
  normalizeSets,
  resolveOption,
  slugify,
  type OptionSetKey,
  type OptionSets,
  isFixedSet,
} from './options';
import { normalizeEntry } from './presetLists';

/** patch value that means "delete this field"; the executor turns it into deleteField() */
export const REMOVE_FIELD: { readonly remove: true } = Object.freeze({ remove: true as const });

export type MigrationRecord = { id: string } & Record<string, unknown>;

export interface MigrationRecords {
  diary: MigrationRecord[];
  costs: MigrationRecord[];
  tasks: MigrationRecord[];
  contacts: MigrationRecord[];
  contactLogs: MigrationRecord[];
  trades: MigrationRecord[];
  phases: MigrationRecord[];
}

export interface MigrationInput {
  /** `meta/lists` as stored, if it exists */
  lists?: Partial<Lists> | null;
  /** `meta/options` as stored, if it exists */
  options?: Partial<Record<OptionSetKey, unknown>> | null;
  records: Partial<MigrationRecords>;
}

export interface MigrationUpdate {
  col: string;
  id: string;
  patch: Record<string, unknown>;
}

export interface MigrationPlan {
  options: OptionSets;
  updates: MigrationUpdate[];
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function planMigration(input: MigrationInput): MigrationPlan {
  const sets = normalizeSets(input.options, input.lists);

  /** the id for a stored value; an unknown text of a free set becomes a hidden entry of its own */
  function toId(key: OptionSetKey, raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const found = resolveOption(sets[key], raw);
    if (found) return found.id;
    if (isFixedSet(key)) return undefined;
    const label = normalizeEntry(raw);
    if (!label) return undefined;
    const added = addOption(sets[key], label);
    if (!added.id) return undefined;
    sets[key] = added.entries.map((entry) => (entry.id === added.id ? { ...entry, archived: true } : entry));
    return added.id;
  }

  function toIds(key: OptionSetKey, raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const ids: string[] = [];
    for (const item of raw) {
      const id = toId(key, item);
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  const updates: MigrationUpdate[] = [];

  function scalar(patch: Record<string, unknown>, record: MigrationRecord, field: string, key: OptionSetKey): void {
    const id = toId(key, record[field]);
    if (id !== undefined && id !== record[field]) patch[field] = id;
  }

  function list(patch: Record<string, unknown>, record: MigrationRecord, field: string, key: OptionSetKey): void {
    if (!Array.isArray(record[field])) return;
    const ids = toIds(key, record[field]);
    if (!sameList(ids, record[field] as unknown[])) patch[field] = ids;
  }

  function each(
    rows: MigrationRecord[] | undefined,
    col: string,
    fill: (patch: Record<string, unknown>, record: MigrationRecord) => void,
  ): void {
    // ids ascending: every device must meet the unknown texts in the same order
    const sorted = [...(rows ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const record of sorted) {
      const patch: Record<string, unknown> = {};
      fill(patch, record);
      if (Object.keys(patch).length) updates.push({ col, id: record.id, patch });
    }
  }

  const { records } = input;

  each(records.diary, COL.diary, (patch, record) => {
    list(patch, record, 'present', 'people');
    scalar(patch, record, 'weather', 'weather');
  });

  each(records.costs, COL.costs, (patch, record) => {
    scalar(patch, record, 'category', 'costCategories');
    scalar(patch, record, 'paymentStatus', 'paymentStatus');
    scalar(patch, record, 'paidBy', 'payers');
    scalar(patch, record, 'paymentMethod', 'paymentMethods');
  });

  each(records.tasks, COL.tasks, (patch, record) => {
    scalar(patch, record, 'status', 'taskStatus');
    scalar(patch, record, 'priority', 'priority');
    scalar(patch, record, 'area', 'taskAreas');
    if (Array.isArray(record.assignees)) {
      const ids: string[] = [];
      for (const item of record.assignees) {
        // the old "Beide" is both of them, unless somebody made it a person of its own
        const both = typeof item === 'string' && slugify(item) === 'beide' && !resolveOption(sets.people, item);
        for (const id of both ? ['thomas', 'sarah'] : [toId('people', item)]) {
          if (id && !ids.includes(id)) ids.push(id);
        }
      }
      if (!sameList(ids, record.assignees)) patch.assignees = ids;
    }
  });

  each(records.contacts, COL.contacts, (patch, record) => {
    const hasLegacy = record.role !== undefined;
    if (Array.isArray(record.roles) || hasLegacy) {
      // same rule as contactRoleNames: the old single role only counts while `roles` is empty
      const current: unknown[] = Array.isArray(record.roles) ? record.roles : [];
      const raw: unknown[] = current.length ? current : hasLegacy ? [record.role] : [];
      const ids = toIds('contactRoles', raw);
      if (hasLegacy || !sameList(ids, Array.isArray(record.roles) ? record.roles : [])) patch.roles = ids;
    }
    if (hasLegacy) patch.role = REMOVE_FIELD;
    scalar(patch, record, 'status', 'contactStatus');
  });

  each(records.contactLogs, COL.contactLogs, (patch, record) => {
    scalar(patch, record, 'channel', 'contactChannels');
  });

  each(records.trades, COL.trades, (patch, record) => {
    scalar(patch, record, 'status', 'tradeStatus');
    scalar(patch, record, 'priority', 'priority');
  });

  each(records.phases, COL.phases, (patch, record) => {
    scalar(patch, record, 'status', 'phaseStatus');
  });

  return { options: sets, updates };
}
