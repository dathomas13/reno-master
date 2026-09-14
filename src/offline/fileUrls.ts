/**
 * Resolves a Cloud Storage path to something an <img> or <iframe> can display, in this
 * order: a blob still sitting in the outbox, a cached download URL, the network.
 * Download URLs are stable, so they are remembered in IndexedDB and keep working offline
 * together with the service worker cache.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '@/firebase/app';
import { localBlob } from './outbox';

const DB_NAME = 'reno-urls';
const STORE = 'urls';

let dbPromise: Promise<IDBPDatabase> | null = null;
function database(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

const memory = new Map<string, string>();
const objectUrls = new Map<string, string>();

export async function resolveFileUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  const cached = memory.get(storagePath);
  if (cached) return cached;

  const blob = await localBlob(storagePath);
  if (blob) {
    const url = URL.createObjectURL(blob);
    objectUrls.set(storagePath, url);
    memory.set(storagePath, url);
    return url;
  }

  const database_ = await database();
  const stored = (await database_.get(STORE, storagePath)) as string | undefined;
  if (stored) {
    memory.set(storagePath, stored);
    return stored;
  }

  if (!navigator.onLine) return null;
  try {
    const url = await getDownloadURL(ref(storage, storagePath));
    memory.set(storagePath, url);
    await database_.put(STORE, url, storagePath);
    return url;
  } catch {
    return null;
  }
}

/** release object URLs created for local blobs */
export function releaseFileUrl(storagePath: string): void {
  const url = objectUrls.get(storagePath);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(storagePath);
    memory.delete(storagePath);
  }
}
