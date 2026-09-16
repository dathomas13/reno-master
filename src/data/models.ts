/**
 * Loads the model the app should show.
 *
 * Two layers: the files in public/models that shipped with this build, and the newest
 * release this device downloaded (src/modelStore). The higher version wins, so a model
 * published after the build is used without an app update, and the bundled files remain
 * the floor that always works - also on a fresh install with no network.
 *
 * Fetching a newer release is the job of modelSync; this module only decides what is
 * currently in effect and hands it out.
 */
import type { RoomDoc, SceneDoc, Room } from '@/modules/viewer3d/houseScene';
import { isNewer, type ReleaseInfo, type Variant } from './modelRelease';
import { readRelease } from './modelStore';

export type { Variant };

export interface ModelInfo {
  file: string;
  rooms: string | null;
  version: string;
  updatedAt: string;
  note: string;
  bytes?: number;
}

export type ModelManifest = Record<Variant, ModelInfo>;

const base = import.meta.env.BASE_URL || '/';
const sceneCache = new Map<Variant, Promise<SceneDoc>>();
const roomCache = new Map<Variant, Promise<RoomDoc>>();
let manifestCache: Promise<ModelManifest> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

/** the manifest of the bundled files - what this build was published with */
export function loadManifest(): Promise<ModelManifest> {
  manifestCache ??= fetchJson<ModelManifest>('models/manifest.json');
  return manifestCache;
}

/** the bundled files as a release candidate */
export async function bundledRelease(variant: Variant): Promise<ReleaseInfo | null> {
  try {
    const entry = (await loadManifest())[variant];
    if (!entry?.version) return null;
    return {
      variant,
      version: entry.version,
      updatedAt: entry.updatedAt ?? '',
      note: entry.note ?? '',
      bytes: entry.bytes,
      source: 'bundled',
      sceneUrl: `${base}models/${entry.file}`,
      roomsUrl: entry.rooms ? `${base}models/${entry.rooms}` : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * The release in effect for a variant: the downloaded one when it is newer than the
 * bundled files, otherwise the bundled one.
 */
export async function activeRelease(variant: Variant): Promise<ReleaseInfo | null> {
  const [cached, bundled] = await Promise.all([readRelease(variant), bundledRelease(variant)]);
  if (cached?.version && (!bundled || !isNewer(bundled.version, cached.version))) {
    return {
      variant,
      version: cached.version,
      updatedAt: cached.updatedAt,
      note: cached.note,
      source: 'cache',
      origin: cached.origin,
    };
  }
  return bundled;
}

/** forget what was loaded, so the next read picks up a release that just arrived */
export function invalidateModel(variant: Variant): void {
  sceneCache.delete(variant);
  roomCache.delete(variant);
}

export function loadScene(variant: Variant): Promise<SceneDoc> {
  let promise = sceneCache.get(variant);
  if (!promise) {
    promise = (async () => {
      const [cached, bundled] = await Promise.all([readRelease(variant), bundledRelease(variant)]);
      if (cached?.scene && (!bundled || !isNewer(bundled.version, cached.version))) return cached.scene;
      const doc = await fetchJson<SceneDoc>(`models/${variant}.json`);
      if (!Array.isArray(doc.prims) || doc.prims.length === 0) {
        throw new Error('Das Modell enthält keine Bauteile.');
      }
      return doc;
    })();
    sceneCache.set(variant, promise);
  }
  return promise;
}

export function loadRooms(variant: Variant): Promise<RoomDoc> {
  let promise = roomCache.get(variant);
  if (!promise) {
    promise = (async () => {
      const [cached, bundled] = await Promise.all([readRelease(variant), bundledRelease(variant)]);
      if (cached?.rooms && (!bundled || !isNewer(bundled.version, cached.version))) return cached.rooms;
      // a release published without its room list falls back to the bundled rooms: the ids
      // are what diary, photos and costs hang on, and losing them costs more than a rect
      // that has moved by a few centimetres
      return fetchJson<RoomDoc>(`models/rooms-${variant}.json`).catch(() => ({ variant, rooms: [] }));
    })();
    roomCache.set(variant, promise);
  }
  return promise;
}

export interface BundledPlan {
  id: string;
  title: string;
  floor: string;
  variant: Variant;
  kind: 'svg';
  source: 'bundled';
  path: string;
  order: number;
}

export function loadBundledPlans(): Promise<{ plans: BundledPlan[] }> {
  return fetchJson<{ plans: BundledPlan[] }>('plans/index.json').catch(() => ({ plans: [] }));
}

/** flat room list of both variants, for pickers and for showing a name by id */
export async function loadAllRooms(): Promise<Room[]> {
  const [ist, soll] = await Promise.all([loadRooms('ist'), loadRooms('soll')]);
  const byId = new Map<string, Room>();
  for (const room of [...ist.rooms, ...soll.rooms]) if (!byId.has(room.id)) byId.set(room.id, room);
  return [...byId.values()];
}

export const FLOOR_ORDER = ['KG', 'EG', 'OG', 'DACH', 'GAR'];

export function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => {
    const floor = FLOOR_ORDER.indexOf(a.floor) - FLOOR_ORDER.indexOf(b.floor);
    return floor !== 0 ? floor : a.name.localeCompare(b.name, 'de');
  });
}
