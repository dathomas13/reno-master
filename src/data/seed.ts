/**
 * Writes the starting content once, when a collection is still empty. Safe to call on
 * every start: it checks first and does nothing when data is already there.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/app';
import { isEmpty, saveDoc } from '@/firebase/db';
import { COL } from './types';
import { SEED_TRADES } from './seed/trades';
import { SEED_PHASES } from './seed/phases';
import { SEED_LISTS } from './seed/lists';
import { newId } from '@/lib/ids';
import { DEFAULT_OPTIONS, OPTION_SET_KEYS } from './options';
import { MIGRATION_VERSION } from './migrationPlan';

export async function seedIfEmpty(): Promise<void> {
  // read before anything is seeded: only a project with no data at all starts with ids
  const fresh = await Promise.all([COL.trades, COL.phases, COL.tasks, COL.diary, COL.costs].map(isEmpty)).then((all) =>
    all.every(Boolean),
  );
  if (await isEmpty(COL.trades)) {
    for (const trade of SEED_TRADES) await saveDoc(COL.trades, { ...trade, id: newId() });
  }
  if (await isEmpty(COL.phases)) {
    for (const phase of SEED_PHASES) await saveDoc(COL.phases, { ...phase, id: newId() });
  }
  const listsRef = doc(db, COL.meta, 'lists');
  if (!(await getDoc(listsRef)).exists()) await setDoc(listsRef, SEED_LISTS);
  const optionsRef = doc(db, COL.meta, 'options');
  if (fresh && !(await getDoc(optionsRef)).exists()) {
    const sets: Record<string, unknown> = {};
    for (const key of OPTION_SET_KEYS) sets[key] = DEFAULT_OPTIONS[key].map((entry) => ({ ...entry }));
    await setDoc(optionsRef, { ...sets, migrated: MIGRATION_VERSION, migratedAt: new Date().toISOString() });
  }
}
