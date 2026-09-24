/**
 * Keeps the newest 3D model on the device, independent of the app build.
 *
 * Three channels, described in modelRelease.ts. This module reaches them, picks the
 * highest version and stores its payload in IndexedDB, so the viewer reads the new model
 * on the next open and keeps it offline afterwards. Nothing here ever leaves the app
 * without a model: every step falls back to what is already there.
 *
 * Publishing works the other way round - publishModel writes a scene into the meta
 * collection, and the other device picks it up through its Firestore listener without any
 * deploy at all.
 */
import { saveDoc, watchDoc } from '@/firebase/db';
import type { RoomDoc, SceneDoc } from '@/modules/viewer3d/houseScene';
import { COL, type BaseDoc } from './types';
import { publishedFileUrl } from './appVersion';
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
import { bundledRelease, invalidateModel, MODEL_EVENT } from './models';

export { MODEL_EVENT } from './models';

/** the last release each variant was announced with over Firestore */
const announced = new Map<Variant, ReleaseInfo | null>();

function docId(variant: Variant): string {
  return `model-${variant}`;
}

/**
 * What the published site offers. Only this channel needs the network, and it is the one
 * that lets a git push reach an installed APK, whose bundled files never change.
 */
export async function siteRelease(variant: Variant): Promise<ReleaseInfo | null> {
  try {
    // the timestamp is what gets past the service worker's precache, see src/sw.ts
    const url = `${publishedFileUrl('models/manifest.json')}?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = (await response.json()) as Record<string, {
      file?: string; rooms?: string | null; source?: string | null; version?: string; updatedAt?: string;
      note?: string; bytes?: number;
    }>;
    const entry = manifest[variant];
    if (!entry?.version) return null;
    return {
      variant,
      version: entry.version,
      updatedAt: entry.updatedAt ?? '',
      note: entry.note ?? '',
      bytes: entry.bytes,
      source: 'site',
      // the version rides along in the query: the service worker caches per address, so a
      // new version can never be answered with the body of the old one
      sceneUrl: `${publishedFileUrl(`models/${entry.file ?? `${variant}.json`}`)}?v=${entry.version}`,
      roomsUrl: entry.rooms
        ? `${publishedFileUrl(`models/${entry.rooms}`)}?v=${entry.version}`
        : undefined,
      sourceUrl: entry.source
        ? `${publishedFileUrl(`models/${entry.source}`)}?v=${entry.version}`
        : undefined,
    };
  } catch {
    // offline, or the site is not reachable - then the device keeps what it has
    return null;
  }
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
 * Brings one variant up to date: picks the newest reachable release and, when it is not
 * already on the device, stores its payload.
 */
export async function syncModel(variant: Variant, checkSite = true): Promise<SyncResult | null> {
  const cached = await readRelease(variant);
  const candidates: (ReleaseInfo | null)[] = [
    cachedInfo(cached),
    announced.get(variant) ?? null,
    await bundledRelease(variant),
  ];
  if (checkSite && navigator.onLine !== false) candidates.push(await siteRelease(variant));

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
    const fallback = pickRelease([cachedInfo(cached), await bundledRelease(variant)]);
    const problem = error instanceof Error ? error.message : 'Das Modell konnte nicht geladen werden.';
    return fallback ? { variant, active: fallback, changed: false, problem } : null;
  }
}

/** Checks both variants once; used by the button in the settings screen. */
export async function syncAllModels(checkSite = true): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const variant of VARIANTS) {
    const result = await syncModel(variant, checkSite);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Starts the background sync: listens for a published release, and re-checks the site
 * when the device comes online or the app becomes visible again.
 */
export function startModelSync(options: {
  /** listen for published releases; needs an account, the other channels do not */
  watchPublished?: boolean;
  onResult?: (result: SyncResult) => void;
} = {}): () => void {
  const { watchPublished = false, onResult } = options;
  let stopped = false;

  const run = (checkSite: boolean) => {
    void syncAllModels(checkSite).then((results) => {
      if (stopped) return;
      for (const result of results) if (result.changed || result.problem) onResult?.(result);
    });
  };

  const unsubscribes = watchPublished
    ? VARIANTS.map((variant) => watchDoc<ReleaseDoc>(
      COL.meta,
      docId(variant),
      (row) => {
        announced.set(variant, releaseFromDoc(variant, row));
        run(false);          // the document is already here, no need to ask the site
      },
      () => undefined,       // nothing published yet - the other channels carry on
    ))
    : [];

  const onOnline = () => run(true);
  const onVisible = () => {
    if (document.visibilityState === 'visible') run(true);
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(onOnline, 30 * 60 * 1000);
  run(true);

  return () => {
    stopped = true;
    for (const unsubscribe of unsubscribes) unsubscribe();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
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
