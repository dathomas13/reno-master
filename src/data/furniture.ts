/**
 * The furniture of the planned house.
 *
 * It lives in one document, meta/moebel-soll, next to the published models but not in
 * them: moving a chair is not a new model version, and the house file stays what it is.
 * Every piece and every loaded model file is one entry of a map in that document
 * (`items.<id>`, `models.<id>`), written as a whole - so the two phones can arrange
 * different rooms at the same time. Writes go into the Firestore queue like everything
 * else and work offline.
 *
 * Model files (glTF binary) go through the outbox to the file store, like photos, and are
 * read back through the same local cache - once seen, a model also shows offline.
 */
import { removeMapEntries, setMapEntries, watchDoc } from '@/firebase/db';
import { COL } from './types';
import { enqueue, removeJobsForPaths } from '@/offline/outbox';
import { readFileBytes } from '@/offline/fileUrls';
import { deleteFile } from '@/platform/fileStore';
import { debugLog } from '@/platform/debugLog';
import { newId } from '@/lib/ids';
import {
  modelPath,
  parseFurnitureDoc,
  type FurnitureItem,
  type FurnitureModel,
  type FurnitureState,
} from '@/modules/furniture/placement';

export const FURNITURE_DOC = 'moebel-soll';

export function watchFurniture(onData: (state: FurnitureState) => void, onError?: (error: Error) => void): () => void {
  return watchDoc<Record<string, unknown>>(COL.meta, FURNITURE_DOC, (raw) => onData(parseFurnitureDoc(raw)), onError);
}

/**
 * Firestore only answers a write once the server has it - offline that is never, but the
 * write is safe in its queue the moment it is made. So nobody waits for it; a refusal
 * (rules, quota) is logged, the screen already shows the new state from the local cache.
 */
function fireAndLog(write: Promise<unknown>, what: string): void {
  void write.catch((error: unknown) => {
    debugLog('moebel', `${what} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function stored(item: FurnitureItem): Record<string, unknown> {
  const value: Record<string, unknown> = { ...item };
  delete value.id;
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}

export function saveFurnitureItems(items: FurnitureItem[]): void {
  if (!items.length) return;
  fireAndLog(
    setMapEntries(
      COL.meta,
      FURNITURE_DOC,
      items.map((item) => ({ field: 'items', key: item.id, value: stored(item) })),
    ),
    'Möbel speichern',
  );
}

export function saveFurnitureItem(item: FurnitureItem): void {
  saveFurnitureItems([item]);
}

export function deleteFurnitureItem(id: string): void {
  fireAndLog(removeMapEntries(COL.meta, FURNITURE_DOC, [{ field: 'items', key: id }]), 'Möbel löschen');
}

/**
 * Stores a model file: the file goes into the upload queue, its entry into the document
 * right away - this device shows it from the local copy until the upload is through.
 */
export async function addFurnitureModel(
  file: Blob,
  info: { name: string; w: number; d: number; h: number; json: boolean },
): Promise<FurnitureModel> {
  const id = newId();
  const storagePath = modelPath(id, info.json ? 'gltf' : 'glb');
  const model: FurnitureModel = {
    id,
    name: info.name,
    storagePath,
    w: info.w,
    d: info.d,
    h: info.h,
    bytes: file.size,
    uploadState: 'pending',
  };
  const value: Record<string, unknown> = { ...model };
  delete value.id;
  await enqueue({
    id: `moebel-${id}`,
    storagePath,
    contentType: info.json ? 'model/gltf+json' : 'model/gltf-binary',
    blob: file,
    docCollection: COL.meta,
    docId: FURNITURE_DOC,
    docField: `models.${id}.uploadState`,
  });
  fireAndLog(setMapEntries(COL.meta, FURNITURE_DOC, [{ field: 'models', key: id, value }]), 'Modell speichern');
  return model;
}

/** removes a model file and its entry; the caller makes sure no piece uses it any more */
export function deleteFurnitureModel(model: FurnitureModel): void {
  fireAndLog(removeMapEntries(COL.meta, FURNITURE_DOC, [{ field: 'models', key: model.id }]), 'Modell löschen');
  void removeJobsForPaths([model.storagePath]);
  void deleteFile(model.storagePath).catch(() => undefined);
}

/** the bytes of a model file: from the queue, the local cache or the file store; null offline */
export async function readModelFile(model: FurnitureModel): Promise<ArrayBuffer | null> {
  try {
    const bytes = await readFileBytes(model.storagePath);
    if (!bytes) return null;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } catch (error) {
    debugLog('moebel', `Modell ${model.id} nicht lesbar: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
