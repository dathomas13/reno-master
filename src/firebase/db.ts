/**
 * Typed access to the Firestore collections. Components never call Firestore directly,
 * they go through the repositories in src/data, which build on these helpers.
 */
import {
  collection,
  doc,
  getDocs,
  getDocsFromCache,
  arrayUnion,
  arrayRemove,
  writeBatch,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
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

/**
 * Writes one field of a document, creating the document when it is not there yet.
 * `{ merge: true }` leaves every other field alone. The value may be `arrayUnion(...)`.
 */
export async function setField(
  collectionName: string,
  id: string,
  field: string,
  value: unknown,
): Promise<void> {
  await setDoc(
    doc(db, collectionName, id),
    { [field]: value, updatedAt: serverTimestamp(), updatedBy: actor() },
    { merge: true },
  );
}

/** adds a value to an array field without touching the other entries */
export function addToArrayField(collectionName: string, id: string, field: string, value: string): Promise<void> {
  return setField(collectionName, id, field, arrayUnion(value));
}

/** removes a value from an array field without touching the other entries */
export function removeFromArrayField(collectionName: string, id: string, field: string, value: string): Promise<void> {
  return setField(collectionName, id, field, arrayRemove(value));
}

/**
 * Rewrites a text field (or a value inside an array field) on every document that carries
 * `from`. Reads the local cache first so it works offline, falls back to the server query.
 * Commits in batches of at most 400 writes and does not wait for the server.
 * Resolves with the number of documents touched.
 */
export async function replaceFieldValue(
  collectionName: string,
  field: string,
  kind: 'value' | 'array',
  from: string,
  to: string,
  extra?: { legacyField?: string },
): Promise<number> {
  const queries = [
    query(collection(db, collectionName), kind === 'array' ? where(field, 'array-contains', from) : where(field, '==', from)),
  ];
  if (extra?.legacyField) {
    queries.push(query(collection(db, collectionName), where(extra.legacyField, '==', from)));
  }
  const found = new Map<string, DocumentData>();
  for (const q of queries) {
    let snapshot;
    try {
      snapshot = await getDocsFromCache(q);
    } catch {
      snapshot = await getDocs(q);
    }
    snapshot.docs.forEach((d) => found.set(d.id, d.data()));
  }

  const ids = [...found.keys()];
  const stamp = { updatedAt: serverTimestamp(), updatedBy: actor() };
  const commits: Promise<void>[] = [];
  for (let start = 0; start < ids.length; start += 400) {
    const batch = writeBatch(db);
    for (const id of ids.slice(start, start + 400)) {
      const data = found.get(id) ?? {};
      const patch: Record<string, unknown> = { ...stamp };
      if (kind === 'value') {
        patch[field] = to;
      } else {
        const current: string[] = Array.isArray(data[field]) ? (data[field] as string[]) : [];
        const base = current.length || !extra?.legacyField ? current : [String(data[extra.legacyField] ?? '')].filter(Boolean);
        const next: string[] = [];
        for (const item of base) {
          const value = item === from ? to : item;
          if (!next.includes(value)) next.push(value);
        }
        patch[field] = next;
      }
      batch.update(doc(db, collectionName, id), patch);
    }
    commits.push(batch.commit());
  }
  // queued locally at once; the promises settle when the server confirms
  void Promise.allSettled(commits);
  return ids.length;
}
