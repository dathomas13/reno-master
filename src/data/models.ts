/**
 * Loads the generated model files that ship with the app.
 *
 * They live in public/models and are precached by the service worker, so they are
 * available offline from the first visit on. Swapping a model is a git push, see
 * tools/model/README-MODELL.md.
 */
import type { RoomDoc, SceneDoc, Room } from '@/modules/viewer3d/houseScene';

export type Variant = 'ist' | 'soll';

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

export function loadManifest(): Promise<ModelManifest> {
  manifestCache ??= fetchJson<ModelManifest>('models/manifest.json');
  return manifestCache;
}

export function loadScene(variant: Variant): Promise<SceneDoc> {
  let promise = sceneCache.get(variant);
  if (!promise) {
    promise = fetchJson<SceneDoc>(`models/${variant}.json`).then((doc) => {
      if (!Array.isArray(doc.prims) || doc.prims.length === 0) {
        throw new Error('Das Modell enthält keine Bauteile.');
      }
      return doc;
    });
    sceneCache.set(variant, promise);
  }
  return promise;
}

export function loadRooms(variant: Variant): Promise<RoomDoc> {
  let promise = roomCache.get(variant);
  if (!promise) {
    promise = fetchJson<RoomDoc>(`models/rooms-${variant}.json`).catch(() => ({ variant, rooms: [] }));
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
