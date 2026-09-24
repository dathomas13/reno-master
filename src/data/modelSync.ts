/**
 * Keeps the newest 3D model on the device.
 *
 * The one place a model comes from is the Firestore document meta/model-<variant>
 * (modelRelease.ts). This module listens to it, and when it carries a newer version than
 * the device has, checks the payload and stores it in IndexedDB - so the viewer reads the
 * new model at once and keeps it offline afterwards. A broken or truncated document never
 * replaces a working model.
 *
 * Publishing works the other way round: publishModel writes a model into the document and
 * every other signed-in device picks it up through its listener, without any deploy.
 */
import { saveDoc, watchDoc } from '@/firebase/db';
import type { RoomDoc, SceneDoc } from '@/modules/viewer3d/houseScene';
import { COL, type BaseDoc } from './types';
import {
  fitsInDocument,
  pickRelease,
  planSync,
  releaseFromDoc,
  releaseToDoc,
  validateRooms,
  validateScene,
  VARIANTS,
  type ReleaseDoc,
  type ReleaseInfo,
  type Variant,
} from './modelRelease';
import { cachedInfo, readRelease, writeRelease, type CachedRelease } from './modelStore';
import { invalidateModel, MODEL_EVENT } from './models';

export { MODEL_EVENT } from './models';

/** the last release each variant was announced with over Firestore */
const announced = new Map<Variant, ReleaseInfo | null>();

function docId(variant: Variant): string {
  return `model-${variant}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as unknown;
}

/**
 * Loads and checks the payload of a release.
 *
 * Throws with a German message when the model is unusable, so a truncated download or a
 * half written document is refused before it replaces a working model.
 */
/**
 * The house file of a release, when it has one that fits: it has to be a reno-haus/1
 * file of the same version, or it would describe a different model than the scene.
 * Anything else counts as missing - the scene is what matters, the source is a bonus.
 */
async function sourceOf(info: ReleaseInfo): Promise<string | null> {
  try {
    let text = info.sourceJson ?? null;
    if (text === null && info.sourceUrl) {
      const response = await fetch(info.sourceUrl, { cache: 'no-store' });
      text = response.ok ? await response.text() : null;
    }
    if (text === null) return null;
    const doc = JSON.parse(text) as { format?: unknown; version?: unknown };
    return doc.format === 'reno-haus/1' && doc.version === info.version ? text : null;
  } catch {
    return null;
  }
}

async function payloadOf(info: ReleaseInfo): Promise<{ scene: SceneDoc; rooms: RoomDoc | null; source: string | null }> {
  const sceneRaw = info.sceneJson
    ? (JSON.parse(info.sceneJson) as unknown)
    : await fetchJson(info.sceneUrl ?? '');
  const sceneProblem = validateScene(sceneRaw);
  if (sceneProblem) throw new Error(sceneProblem);

  let rooms: RoomDoc | null = null;
  const roomsRaw = info.roomsJson
    ? (JSON.parse(info.roomsJson) as unknown)
    : info.roomsUrl ? await fetchJson(info.roomsUrl).catch(() => null) : null;
  if (roomsRaw) {
    const roomProblem = validateRooms(roomsRaw);
    // a broken room list must not cost us the model - the scene is the important part
    if (!roomProblem) rooms = roomsRaw as RoomDoc;
  }
  return { scene: sceneRaw as SceneDoc, rooms, source: await sourceOf(info) };
}

export interface SyncResult {
  variant: Variant;
  /** the release the app uses from now on */
  active: ReleaseInfo;
  /** true when this run downloaded and stored something new */
  changed: boolean;
  /** why a newer release was refused, for the settings screen */
  problem?: string;
}

/**
 * Brings one variant up to date: when the published document carries a newer version
 * than the device, stores its payload.
 */
export async function syncModel(variant: Variant): Promise<SyncResult | null> {
  const cached = await readRelease(variant);
  const candidates: (ReleaseInfo | null)[] = [cachedInfo(cached), announced.get(variant) ?? null];

  const plan = planSync(candidates);
  if (!plan) return null;
  const best = plan.release;
  if (plan.action === 'keep') return { variant, active: best, changed: false };

  try {
    const { scene, rooms, source } = await payloadOf(best);
    const entry: CachedRelease = {
      variant,
      version: best.version,
      updatedAt: best.updatedAt,
      note: best.note,
      origin: best.source,
      scene,
      rooms,
      source,
      cachedAt: new Date().toISOString(),
    };
    await writeRelease(entry);
    invalidateModel(variant);
    const result: SyncResult = {
      variant, active: { ...best, source: 'cache', origin: best.source }, changed: true,
    };
    // tell an open viewer to rebuild, instead of waiting for the next navigation
    try {
      window.dispatchEvent(new CustomEvent<SyncResult>(MODEL_EVENT, { detail: result }));
    } catch {
      // no window (tests): the next read picks the model up anyway
    }
    return result;
  } catch (error) {
    // keep serving the model we have and say why the new one was refused
    const fallback = pickRelease([cachedInfo(cached)]);
    const problem = error instanceof Error ? error.message : 'Das Modell konnte nicht geladen werden.';
    return fallback ? { variant, active: fallback, changed: false, problem } : null;
  }
}

/** Checks both variants once against the last published documents. */
export async function syncAllModels(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const variant of VARIANTS) {
    const result = await syncModel(variant);
    if (result) results.push(result);
  }
  return results;
}

/** true once the listener has heard from the database, per variant: null = nothing published */
const heard = new Map<Variant, boolean>();

export interface PublishedState {
  /** the database has a model document for the variant */
  exists: boolean;
  version?: string;
  /** the document carries its house file - one published before 0.49 does not */
  hasSource: boolean;
}

/**
 * What the database has for the variant, once the listener has answered from the server;
 * undefined before that (offline, or not signed in yet).
 */
export function publishedState(variant: Variant): PublishedState | undefined {
  if (!heard.get(variant)) return undefined;
  const release = announced.get(variant) ?? null;
  if (!release) return { exists: false, hasSource: false };
  return { exists: true, version: release.version, hasSource: Boolean(release.sourceJson || release.sourceUrl) };
}

/**
 * Starts the sync for a signed-in user: listens to the published documents and stores
 * every newer model the moment it arrives.
 */
export function startModelSync(onResult?: (result: SyncResult) => void): () => void {
  let stopped = false;

  const run = () => {
    void syncAllModels().then((results) => {
      if (stopped) return;
      for (const result of results) if (result.changed || result.problem) onResult?.(result);
    });
  };

  const unsubscribes = VARIANTS.map((variant) => watchDoc<ReleaseDoc>(
    COL.meta,
    docId(variant),
    (row, fromServer) => {
      announced.set(variant, releaseFromDoc(variant, row));
      if (fromServer && !heard.get(variant)) {
        heard.set(variant, true);
        // the settings screen offers the start model once it knows the database has none
        try {
          window.dispatchEvent(new CustomEvent(MODEL_EVENT, { detail: { variant } }));
        } catch {
          // no window (tests)
        }
      }
      run();
    },
    () => undefined, // offline or not allowed: the device keeps what it has
    { serverState: true },
  ));
  run(); // whatever is already stored, announce nothing but settle the state

  return () => {
    stopped = true;
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

export interface PublishInput {
  variant: Variant;
  sceneJson: string;
  roomsJson: string | null;
  /** the house file the scene was built from; published along so every device can export it */
  sourceJson?: string | null;
  note?: string;
}

/**
 * Publishes a generated model to the other devices, without a deploy.
 *
 * Version and date are taken from the scene's own meta block, so the number the generator
 * wrote is the number the app shows - there is no second place to keep in step.
 */
export async function publishModel(input: PublishInput): Promise<ReleaseInfo> {
  const parsed = JSON.parse(input.sceneJson) as unknown;
  const problem = validateScene(parsed);
  if (problem) throw new Error(problem);

  const meta = (parsed as { meta?: { version?: string; generatedAt?: string; note?: string; variant?: string } }).meta;
  const version = meta?.version;
  if (!version) throw new Error('Die Szene hat keine Version in meta.version.');
  if (meta?.variant && meta.variant !== input.variant) {
    throw new Error(`Diese Datei ist das ${meta.variant}-Modell, ausgewählt ist ${input.variant}.`);
  }
  if (input.roomsJson) {
    const roomProblem = validateRooms(JSON.parse(input.roomsJson) as unknown);
    if (roomProblem) throw new Error(roomProblem);
  }
  const sourceJson = input.sourceJson ?? null;
  if (!fitsInDocument(input.sceneJson, input.roomsJson, sourceJson)) {
    throw new Error('Das Modell ist zu groß für ein Firestore-Dokument. Bitte über eine Adresse veröffentlichen.');
  }

  const generatedAt = meta?.generatedAt ?? new Date().toISOString().slice(0, 10);
  const note = input.note?.trim() || meta?.note || '';
  const doc = releaseToDoc(input.variant, version, note, generatedAt, input.sceneJson, input.roomsJson, sourceJson);
  await saveDoc<BaseDoc & ReleaseDoc>(COL.meta, {
    id: docId(input.variant),
    ...doc,
    // defeat the merge: a release published inline must not keep an address from before
    sceneUrl: null,
    roomsUrl: null,
  });

  const info: ReleaseInfo = {
    variant: input.variant, version, updatedAt: generatedAt, note, bytes: input.sceneJson.length,
    source: 'firestore',
  };
  announced.set(input.variant, {
    ...info,
    sceneJson: input.sceneJson,
    roomsJson: input.roomsJson ?? undefined,
    sourceJson: sourceJson ?? undefined,
  });
  return info;
}
