/**
 * The option sets (KENNUNGEN.md): live from `meta/options`, with `meta/lists` as the
 * fallback for the five old lists until the migration has copied them over
 * (and deleted `meta/lists`).
 *
 * Every write replaces just the one set field and is queued locally; nothing here waits
 * for the server, so editing a list works offline.
 */
import { useMemo } from 'react';
import { useDocument } from './hooks';
import { COL, type Lists } from './types';
import {
  activeEntries,
  addOption,
  archiveOption,
  isFixedSet,
  labelOf,
  moveOption,
  normalizeSets,
  renameOption,
  resetOptions,
  resolveOption,
  sortOptionsAlpha,
  unarchiveOption,
  type OptionEntry,
  type OptionSetKey,
  type OptionSets,
} from './options';
import { setField } from '@/firebase/db';

export interface UseOptions {
  sets: OptionSets;
  /** the label to show for a stored value (id, old slug or old text); the raw text when unknown */
  label(key: OptionSetKey, stored: string | undefined | null): string;
  resolve(key: OptionSetKey, stored: string | undefined | null): OptionEntry | undefined;
  /** the entries that are not hidden, in order */
  active(key: OptionSetKey): OptionEntry[];
  /** adds an entry (or shows a hidden one with that name again) and returns its id, '' when refused */
  add(key: OptionSetKey, label: string): string;
  rename(key: OptionSetKey, id: string, label: string): void;
  /** hides an entry and returns its old position (for undo), -1 when refused; fixed sets cannot hide */
  archive(key: OptionSetKey, id: string): number;
  unarchive(key: OptionSetKey, id: string): void;
  move(key: OptionSetKey, id: string, delta: number): void;
  sortAlpha(key: OptionSetKey): void;
  reset(key: OptionSetKey): void;
}

/** what goes into the document: no `archived: undefined`, and fixed sets carry no archive flag at all */
function toStored(key: OptionSetKey, entries: readonly OptionEntry[]): OptionEntry[] {
  return entries.map((entry) =>
    entry.archived && !isFixedSet(key)
      ? { id: entry.id, label: entry.label, archived: true }
      : { id: entry.id, label: entry.label },
  );
}

export function useOptions(): UseOptions {
  const { data } = useDocument<Partial<Record<OptionSetKey, unknown>>>(COL.meta, 'options');
  const { data: legacy } = useDocument<Partial<Lists>>(COL.meta, 'lists');
  const sets = useMemo(() => normalizeSets(data, legacy), [data, legacy]);

  return useMemo<UseOptions>(() => {
    /** queue a write without waiting for the server; failures surface in the sync badge */
    function write(key: OptionSetKey, entries: readonly OptionEntry[]): void {
      setField(COL.meta, 'options', key, toStored(key, entries)).catch(() => undefined);
    }

    return {
      sets,
      label: (key, stored) => labelOf(sets[key], stored),
      resolve: (key, stored) => resolveOption(sets[key], stored),
      active: (key) => activeEntries(sets[key]),
      add(key, label) {
        if (isFixedSet(key)) return '';
        const result = addOption(sets[key], label);
        if (result.id) write(key, result.entries);
        return result.id;
      },
      rename(key, id, label) {
        write(key, renameOption(sets[key], id, label));
      },
      archive(key, id) {
        if (isFixedSet(key)) return -1;
        const result = archiveOption(sets[key], id);
        if (result.index >= 0) write(key, result.entries);
        return result.index;
      },
      unarchive(key, id) {
        write(key, unarchiveOption(sets[key], id));
      },
      move(key, id, delta) {
        write(key, moveOption(sets[key], id, delta));
      },
      sortAlpha(key) {
        write(key, sortOptionsAlpha(sets[key]));
      },
      reset(key) {
        write(key, resetOptions(key, sets[key]));
      },
    };
  }, [sets]);
}
