/**
 * Typed access to the Firestore collections. Components never call Firestore directly,
 * they go through the repositories in src/data, which build on these helpers.
 */
import {
  collection,
  doc,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  arrayUnion,
  arrayRemove,
  writeBatch,
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

/** every document of a collection, read from the server (rejects offline, never answers from the cache) */
export async function readCollectionFromServer(collectionName: string): Promise<(DocumentData & { id: string })[]> {
  const snapshot = await getDocsFromServer(collection(db, collectionName));
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
}

/** one document read from the server, null when it does not exist */
export async function readDocFromServer(collectionName: string, id: string): Promise<DocumentData | null> {
  const snapshot = await getDocFromServer(doc(db, collectionName, id));
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * Merges fields into a document and waits for the server; for one-off jobs that must know it
 * arrived. `removeFields` are deleted from the document.
 */
export async function mergeDocConfirmed(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  removeFields: readonly string[] = [],
): Promise<void> {
  const removals: Record<string, unknown> = {};
  for (const field of removeFields) removals[field] = deleteField();
  await setDoc(
    doc(db, collectionName, id),
    { ...data, ...removals, updatedAt: serverTimestamp(), updatedBy: actor() },
    { merge: true },
  );
}

/** replaces a whole document and waits for the server */
export async function replaceDocConfirmed(collectionName: string, id: string, data: Record<string, unknown>): Promise<void> {
  await setDoc(doc(db, collectionName, id), { ...data, updatedAt: serverTimestamp(), updatedBy: actor() });
}

/**
 * Merges fields into a document and adds values to one array field without touching the
 * entries other devices put there; waits for the server.
 */
export async function mergeDocWithArrayUnionConfirmed(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  arrayField: string,
  values: readonly string[],
): Promise<void> {
  await setDoc(
    doc(db, collectionName, id),
    { ...data, [arrayField]: arrayUnion(...values), updatedAt: serverTimestamp(), updatedBy: actor() },
    { merge: true },
  );
}

export interface PatchOp {
  col: string;
  id: string;
  patch: Record<string, unknown>;
}

/**
 * Applies patches in batches of at most 400 and waits for each batch to be confirmed.
 * `removeMarker` values in a patch become deleteField(). The audit fields stay as they are:
 * a data migration is not an edit by anybody. Resolves with the number of documents written.
 */
export async function commitPatches(
  ops: readonly PatchOp[],
  removeMarker: unknown,
  onBatch?: (done: number, total: number) => void,
): Promise<number> {
  let done = 0;
  for (let start = 0; start < ops.length; start += 400) {
    const slice = ops.slice(start, start + 400);
    const batch = writeBatch(db);
    for (const op of slice) {
      const patch: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(op.patch)) {
        patch[field] = value === removeMarker ? deleteField() : value;
      }
      batch.update(doc(db, op.col, op.id), patch);
    }
    await batch.commit();
    done += slice.length;
    onBatch?.(done, ops.length);
  }
  return done;
}
