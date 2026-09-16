/**
 * The newest model per variant on this device.
 *
 * One record per variant in IndexedDB, holding the parsed scene and room list. The viewer
 * reads from here, which is what makes a model that arrived over the network available
 * offline afterwards. An older record is simply overwritten - the app never needs the
 * previous model, and the bundled files are always there as a floor.
 *
 * Every access is guarded: in a private window IndexedDB can be missing or throw, and a
 * model that cannot be cached must still be shown.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { RoomDoc, SceneDoc } from '@/modules/viewer3d/houseScene';
import type { ReleaseInfo, ReleaseSource, Variant } from './modelRelease';

const DB_NAME = 'reno-models';
const STORE = 'releases';

export interface CachedRelease {
  variant: Variant;
  version: string;
  updatedAt: string;
  note: string;
  /** the channel the payload came through, for the settings screen */
  origin: ReleaseSource;
  scene: SceneDoc;
  rooms: RoomDoc | null;
  /** when this device downloaded it, ISO */
  cachedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function database(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function readRelease(variant: Variant): Promise<CachedRelease | null> {
  try {
    const db = await database();
    return ((await db.get(STORE, variant)) as CachedRelease | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function writeRelease(entry: CachedRelease): Promise<boolean> {
  try {
    const db = await database();
    await db.put(STORE, entry, entry.variant);
    return true;
  } catch {
    // no storage available: the model still works this session, it is just not kept
    return false;
  }
}

export async function dropRelease(variant: Variant): Promise<void> {
  try {
    const db = await database();
    await db.delete(STORE, variant);
  } catch {
    // nothing cached, nothing to drop
  }
}

/** what is cached, as a release candidate - without the payload */
export function cachedInfo(entry: CachedRelease | null): ReleaseInfo | null {
  if (!entry?.version) return null;
  return {
    variant: entry.variant,
    version: entry.version,
    updatedAt: entry.updatedAt,
    note: entry.note,
    source: 'cache',
  };
}
