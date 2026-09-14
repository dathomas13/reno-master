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

export async function seedIfEmpty(): Promise<void> {
  if (await isEmpty(COL.trades)) {
    for (const trade of SEED_TRADES) await saveDoc(COL.trades, { ...trade, id: newId() });
  }
  if (await isEmpty(COL.phases)) {
    for (const phase of SEED_PHASES) await saveDoc(COL.phases, { ...phase, id: newId() });
  }
  const listsRef = doc(db, COL.meta, 'lists');
  if (!(await getDoc(listsRef)).exists()) await setDoc(listsRef, SEED_LISTS);
}
