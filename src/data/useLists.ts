import { useDocument } from './hooks';
import { COL, type ListKey, type Lists } from './types';
import { SEED_LISTS } from './seed/lists';
import { addToArrayField, removeFromArrayField, setField } from '@/firebase/db';
import { addEntry, findDuplicate, normalizeEntry, removeEntry, renameEntry, restoreEntry } from './presetLists';

const LIST_KEYS: ListKey[] = ['people', 'weather', 'costCategories', 'taskAreas', 'contactRoles'];

export interface UseLists {
  lists: Lists;
  add(key: ListKey, value: string): Promise<void>;
  rename(key: ListKey, from: string, to: string): Promise<void>;
  /** removes the value and returns its old index (for undo), -1 when it was not there */
  remove(key: ListKey, value: string): Promise<number>;
  restore(key: ListKey, value: string, index: number): Promise<void>;
  setOrder(key: ListKey, next: string[]): Promise<void>;
  reset(key: ListKey): Promise<void>;
  /** alias of add, kept for existing callers */
  addTo(key: ListKey, value: string): Promise<void>;
}

/**
 * The editable pick lists. A list falls back to the seed only when its field is missing,
 * an empty array is a deliberate empty list. Every write touches just the one field and is
 * queued locally; nothing here waits for the server.
 */
export function useLists(): UseLists {
  const { data } = useDocument<Partial<Lists>>(COL.meta, 'lists');
  const lists = {} as Lists;
  for (const key of LIST_KEYS) {
    const stored = data?.[key];
    lists[key] = Array.isArray(stored) ? stored : SEED_LISTS[key];
  }

  /** queue a write without waiting for the server; failures surface in the sync badge */
  function queue(write: Promise<void>): Promise<void> {
    write.catch(() => undefined);
    return Promise.resolve();
  }

  function add(key: ListKey, value: string): Promise<void> {
    const clean = normalizeEntry(value);
    if (!clean || findDuplicate(lists[key], clean)) return Promise.resolve();
    // a missing field would make arrayUnion start from nothing and lose the seed
    if (!Array.isArray(data?.[key])) return queue(setField(COL.meta, 'lists', key, addEntry(lists[key], clean)));
    return queue(addToArrayField(COL.meta, 'lists', key, clean));
  }

  function rename(key: ListKey, from: string, to: string): Promise<void> {
    const next = renameEntry(lists[key], from, to);
    return queue(setField(COL.meta, 'lists', key, next));
  }

  function remove(key: ListKey, value: string): Promise<number> {
    const { list, index } = removeEntry(lists[key], value);
    if (index < 0) return Promise.resolve(-1);
    // the seed is not in the document yet: write the whole remaining list instead
    void queue(
      Array.isArray(data?.[key])
        ? removeFromArrayField(COL.meta, 'lists', key, value)
        : setField(COL.meta, 'lists', key, list),
    );
    return Promise.resolve(index);
  }

  function restore(key: ListKey, value: string, index: number): Promise<void> {
    return queue(setField(COL.meta, 'lists', key, restoreEntry(lists[key], value, index)));
  }

  function setOrder(key: ListKey, next: string[]): Promise<void> {
    return queue(setField(COL.meta, 'lists', key, next));
  }

  function reset(key: ListKey): Promise<void> {
    return queue(setField(COL.meta, 'lists', key, [...SEED_LISTS[key]]));
  }

  return { lists, add, rename, remove, restore, setOrder, reset, addTo: add };
}
