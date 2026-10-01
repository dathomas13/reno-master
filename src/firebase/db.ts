/**
 * Typed access to the Firestore collections. Components never call Firestore directly,
 * they go through the repositories in src/data, which build on these helpers.
 */
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  FieldPath,
  orderBy,
  where,
  limit,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import { db, auth } from './app';
import { newId } from '@/lib/ids';
import type { BaseDoc } from '@/data/types';

export { orderBy, where, limit, query };

export function col<T extends DocumentData>(name: string): CollectionReference<T> {
  return collection(db, name) as CollectionReference<T>;
}

function actor(): string {
  return auth.currentUser?.email ?? 'unbekannt';
}

/** creates or replaces a document and keeps the audit fields current */
export async function saveDoc<T extends BaseDoc>(
  collectionName: string,
  value: Omit<T, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> & { id?: string },
): Promise<string> {
  const id = value.id ?? newId();
  const ref = doc(db, collectionName, id);
  await setDoc(
    ref,
    {
      ...value,
      id,
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
      createdAt: serverTimestamp(),
      createdBy: actor(),
    },
    { merge: true },
  );
  return id;
}

/** partial update, never writes the whole document back */
export async function patchDoc(
  collectionName: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await updateDoc(doc(db, collectionName, id), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: actor(),
  });
}

/**
 * Writes entries of map fields (`items.<key>`), each replaced as a whole, and creates the
 * document when it does not exist yet. Everything else in the document stays as it is -
 * two devices changing different entries do not overwrite each other.
 */
export async function setMapEntries(
  collectionName: string,
  id: string,
  entries: { field: string; key: string; value: Record<string, unknown> }[],
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp(), updatedBy: actor() };
  const paths = [new FieldPath('updatedAt'), new FieldPath('updatedBy')];
  for (const entry of entries) {
    const map = (data[entry.field] ?? {}) as Record<string, unknown>;
    map[entry.key] = entry.value;
    data[entry.field] = map;
    paths.push(new FieldPath(entry.field, entry.key));
  }
  await setDoc(doc(db, collectionName, id), data, { mergeFields: paths });
}

/** removes entries of map fields written by setMapEntries */
export async function removeMapEntries(
  collectionName: string,
  id: string,
  entries: { field: string; key: string }[],
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp(), updatedBy: actor() };
  for (const entry of entries) {
    const map = (data[entry.field] ?? {}) as Record<string, unknown>;
    map[entry.key] = deleteField();
    data[entry.field] = map;
  }
  await setDoc(doc(db, collectionName, id), data, { merge: true });
}

export async function removeDoc(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

export function watchCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  onData: (rows: T[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(collection(db, collectionName), ...constraints) as Query<T>;
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id }))),
    (error) => onError?.(error),
  );
}

export function watchDoc<T>(
  collectionName: string,
  id: string,
  onData: (row: T | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, collectionName, id),
    (snapshot) => onData(snapshot.exists() ? ({ ...(snapshot.data() as T), id: snapshot.id }) : null),
    (error) => onError?.(error),
  );
}

export async function isEmpty(collectionName: string): Promise<boolean> {
  const snapshot = await getDocs(query(collection(db, collectionName), limit(1)));
  return snapshot.empty;
}
