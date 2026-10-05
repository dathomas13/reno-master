import { replaceFieldValue } from '@/firebase/db';
import { COL, type ListKey } from './types';

/**
 * Carries a renamed list value into every record that stores it as text. Does not wait for
 * the server (offline writes queue). Resolves with the number of records changed.
 * Contacts with only the legacy `role` field get it moved into `roles`.
 */
export async function renameEverywhere(listKey: ListKey, from: string, to: string): Promise<number> {
  if (!from || !to || from === to) return 0;
  switch (listKey) {
    case 'people':
      return replaceFieldValue(COL.diary, 'present', 'array', from, to);
    case 'weather':
      return replaceFieldValue(COL.diary, 'weather', 'value', from, to);
    case 'costCategories':
      return replaceFieldValue(COL.costs, 'category', 'value', from, to);
    case 'taskAreas':
      return replaceFieldValue(COL.tasks, 'area', 'value', from, to);
    case 'contactRoles':
      return replaceFieldValue(COL.contacts, 'roles', 'array', from, to, { legacyField: 'role' });
  }
}
