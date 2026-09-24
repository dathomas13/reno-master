/**
 * Hands out the model the app should show.
 *
 * The model is neither in the app build nor in the repository: it lives in Firestore
 * (meta/model-<variant>), and modelSync stores the newest published release on this
 * device (modelStore, IndexedDB). Everything here reads that stored release - so the
 * model works offline once it has been synced, and a device that never synced has none
 * and says so. A model imported but not yet published can be shown as a preview.
 */
import type { RoomDoc, SceneDoc, Room } from '@/modules/viewer3d/houseScene';
import { VARIANTS, type ReleaseInfo, type Variant } from './modelRelease';
import {
  buildPlanSvg,
  buildRooms,
  FLOOR_LABEL,
  parseSource,
  PLAN_FLOORS,
  VARIANT_LABEL,
  type HouseSource,
  type PlanFloor,
} from '@/modules/modelBuild';
import { readRelease } from './modelStore';

export type { Variant };

/** shown when a device has no model yet */
export const NO_MODEL_MESSAGE = 'Auf diesem Gerät ist noch kein Modell. Einmal angemeldet und online öffnen – '
  + 'es kommt aus der Datenbank und bleibt danach auch offline da.';

/** fired on window when the model of a variant changed, so open screens can reload it */
export const MODEL_EVENT = 'reno:model';

/**
 * A model built from an imported house file, shown before it is published.
 *
 * Held in memory only: it is a look before a decision, and a reload of the app is a
 * perfectly good way to get rid of it. loadScene and loadRooms hand it out instead of
 * the model in use while it is set.
 */
export interface PreviewModel {
  version: string;
  scene: SceneDoc;
  rooms: RoomDoc;
  /** the house file it was built from, so the 2D plans can show the preview as well */
  source?: HouseSource;
}

const previews = new Map<Variant, PreviewModel>();

function announce(variant: Variant): void {
  try {
    window.dispatchEvent(new CustomEvent(MODEL_EVENT, { detail: { variant } }));
  } catch {
    // no window (tests)
  }
}

export function setPreview(variant: Variant, preview: PreviewModel): void {
  previews.set(variant, preview);
  announce(variant);
}

export function clearPreview(variant: Variant): void {
  if (!previews.delete(variant)) return;
  announce(variant);
}

export function previewOf(variant: Variant): PreviewModel | null {
  return previews.get(variant) ?? null;
}
const sceneCache = new Map<Variant, Promise<SceneDoc>>();
const roomCache = new Map<Variant, Promise<RoomDoc>>();

/** The release in effect for a variant: the one stored on this device, if any. */
export async function activeRelease(variant: Variant): Promise<ReleaseInfo | null> {
  const cached = await readRelease(variant);
  if (!cached?.version) return null;
  return {
    variant,
    version: cached.version,
    updatedAt: cached.updatedAt,
    note: cached.note,
    source: 'cache',
    origin: cached.origin,
  };
}

/** forget what was loaded, so the next read picks up a release that just arrived */
export function invalidateModel(variant: Variant): void {
  sceneCache.delete(variant);
  roomCache.delete(variant);
}

export function loadScene(variant: Variant): Promise<SceneDoc> {
  const preview = previews.get(variant);
  if (preview) return Promise.resolve(preview.scene);
  let promise = sceneCache.get(variant);
  if (!promise) {
    promise = (async () => {
      const cached = await readRelease(variant);
      if (!cached?.scene?.prims?.length) throw new Error(NO_MODEL_MESSAGE);
      return cached.scene;
    })();
    // a failure must not stick: the model may arrive a second later
    promise.catch(() => sceneCache.delete(variant));
    sceneCache.set(variant, promise);
  }
  return promise;
}

export function loadRooms(variant: Variant): Promise<RoomDoc> {
  const preview = previews.get(variant);
  if (preview) return Promise.resolve(preview.rooms);
  let promise = roomCache.get(variant);
  if (!promise) {
    promise = (async () => {
      const cached = await readRelease(variant);
      if (cached?.rooms) return cached.rooms;
      // no room list yet - the ids are rebuilt from the house file when there is one
      if (cached?.source) {
        const parsed = parseSource(cached.source);
        if (parsed.ok) return buildRooms(parsed.source, cached.updatedAt) as RoomDoc;
      }
      return { variant, rooms: [] };
    })();
    roomCache.set(variant, promise);
  }
  return promise;
}

/**
 * The house file (reno-haus/1) of the model in use, as text, with its version. Null when
 * this device has no model, or the model was published without its house file.
 */
export async function loadSource(variant: Variant): Promise<{ text: string; version: string } | null> {
  const cached = await readRelease(variant);
  if (!cached?.source) return null;
  return { text: cached.source, version: cached.version };
}

/** A floor plan generated from the model - one per variant and storey. */
export interface ModelPlan {
  id: string;
  title: string;
  floor: PlanFloor;
  variant: Variant;
  kind: 'svg';
  source: 'bundled';
  path: string;
  order: number;
}

/** the generated plans; their content is drawn from the model by loadPlanSvg */
export function modelPlans(): ModelPlan[] {
  return VARIANTS.flatMap((variant, v) => PLAN_FLOORS.map((floor, f) => ({
    id: `${variant}-${floor}`,
    title: `${FLOOR_LABEL[floor]} – ${VARIANT_LABEL[variant]}`,
    floor,
    variant,
    kind: 'svg' as const,
    source: 'bundled' as const,
    path: '',
    order: v * 10 + f,
  })));
}

/**
 * The SVG of a generated floor plan, drawn on the device from the house file of the
 * model in use, or of the preview while one is set (plansSvg.ts, the same output as
 * build_plans_svg.py). Throws with a German message when there is nothing to draw from.
 */
export async function loadPlanSvg(plan: Pick<ModelPlan, 'variant' | 'floor'>): Promise<string> {
  const preview = previews.get(plan.variant);
  let source: HouseSource | null = preview?.source ?? null;
  let version = preview?.version ?? '';
  if (!preview) {
    const active = await loadSource(plan.variant);
    if (!active) throw new Error(NO_MODEL_MESSAGE);
    const parsed = parseSource(active.text);
    if (!parsed.ok) throw new Error('Die Hausdatei des Modells ist beschädigt.');
    source = parsed.source;
    version = active.version;
  }
  if (!source) throw new Error(NO_MODEL_MESSAGE);
  return buildPlanSvg(source, buildRooms(source, ''), plan.floor, version);
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
