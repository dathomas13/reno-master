/**
 * Upload queue for binary files.
 *
 * Firestore queues document writes by itself when offline, Cloud Storage does not.
 * So every photo, receipt and plan first lands in IndexedDB with its blob, the
 * document is written immediately with uploadState 'pending', and the queue is drained
 * whenever the device is online. Nothing is ever lost because a photo was taken in the
 * cellar with no reception.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { patchDoc } from '@/firebase/db';
import { putFile, deleteFile } from '@/platform/fileStore';
import { backoffFor, documentGone, dueJobs, MAX_ATTEMPTS, queueState } from './outboxRules';

export { isFailed, MAX_ATTEMPTS } from './outboxRules';

export interface OutboxJob {
  id: string;
  storagePath: string;
  contentType: string;
  blob: Blob;
  /** document to flag once the upload succeeded */
  docCollection?: string;
  docId?: string;
  docField?: string;
  attempts: number;
  lastError?: string;
  createdAt: number;
  nextAttemptAt: number;
}

const DB_NAME = 'reno-offline';
const DB_VERSION = 1;
const STORE = 'outbox';
const BLOBS = 'blobs';

/**
 * Nothing in here may wait forever. A mobile connection can leave a request hanging
 * without ever failing, and a single hanging request used to freeze the whole queue:
 * the badge kept saying "1 wird geladen" although the file had long since arrived, and
 * even the manual retry did nothing because the run that was stuck never ended.
 */
const UPLOAD_TIMEOUT_MS = 90_000;
/** how long a Firestore write gets to report a problem before we move on, see below */
const ACK_TIMEOUT_MS = 10_000;
/** a run that has not finished by then is considered lost, and the next tick may start */
const RUN_STUCK_MS = 5 * 60_000;

let dbPromise: Promise<IDBPDatabase> | null = null;

function database(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(BLOBS)) {
        database.createObjectStore(BLOBS);
      }
    },
  });
  return dbPromise;
}

type Listener = (state: OutboxState) => void;

export interface OutboxState {
  pending: number;
  failed: number;
  uploading: boolean;
}

const listeners = new Set<Listener>();
let state: OutboxState = { pending: 0, failed: 0, uploading: false };

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

async function publish(): Promise<void> {
  const jobs = await listJobs();
  state = { ...queueState(jobs), uploading: state.uploading };
  for (const listener of listeners) listener(state);
}

export async function listJobs(): Promise<OutboxJob[]> {
  const database_ = await database();
  return (await database_.getAll(STORE)) as OutboxJob[];
}

/** queues a file and keeps a local copy so the UI can show it right away */
export async function enqueue(job: Omit<OutboxJob, 'attempts' | 'createdAt' | 'nextAttemptAt'>): Promise<void> {
  const database_ = await database();
  await database_.put(STORE, {
    ...job,
    attempts: 0,
    createdAt: Date.now(),
    nextAttemptAt: 0,
  } satisfies OutboxJob);
  await database_.put(BLOBS, job.blob, job.storagePath);
  await publish();
  void processOutbox();
}

/** local copy of a file that has not been uploaded yet, or was uploaded from this device */
export async function localBlob(storagePath: string): Promise<Blob | undefined> {
  const database_ = await database();
  return (await database_.get(BLOBS, storagePath)) as Blob | undefined;
}

export async function putLocalBlob(storagePath: string, blob: Blob): Promise<void> {
  const database_ = await database();
  await database_.put(BLOBS, blob, storagePath);
}

export async function dropLocalBlob(storagePath: string): Promise<void> {
  const database_ = await database();
  await database_.delete(BLOBS, storagePath);
}

/**
 * Flags the document as uploaded and reports a problem, but never waits for the server.
 *
 * Firestore keeps its own durable queue: the promise of a write resolves when the server
 * has acknowledged it, and with no reception that is simply never. Waiting for it inside
 * the upload loop was what left a file uploaded, its job undeleted and the queue frozen.
 * So the write gets a moment to say that it *cannot* work - a deleted document, a rule
 * that says no - and otherwise we carry on and leave it to Firestore.
 */
async function flagDocument(job: OutboxJob): Promise<unknown> {
  if (!job.docCollection || !job.docId) return undefined;
  const write = patchDoc(job.docCollection, job.docId, {
    [job.docField ?? 'uploadState']: 'uploaded',
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const moveOn = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ACK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([write, moveOn]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let running = false;
let runningSince = 0;

/** uploads everything that is due; safe to call as often as you like */
export async function processOutbox(force = false): Promise<void> {
  if (running && Date.now() - runningSince < RUN_STUCK_MS) return;
  if (!navigator.onLine) return;
  running = true;
  runningSince = Date.now();
  state = { ...state, uploading: true };
  for (const listener of listeners) listener(state);

  try {
    const database_ = await database();
    const jobs = dueJobs((await database_.getAll(STORE)) as OutboxJob[], Date.now(), force);
    for (const job of jobs) {
      try {
        await putFile(job.storagePath, job.blob, job.contentType, UPLOAD_TIMEOUT_MS);
        const problem = await flagDocument(job);
        if (problem && documentGone(problem)) {
          // the photo was deleted while its file was still in the queue: the upload we
          // just did resurrected an orphan, so it goes again and the job with it
          await deleteFile(job.storagePath).catch(() => undefined);
          await database_.delete(STORE, job.id);
          await dropLocalBlob(job.storagePath);
          continue;
        }
        if (problem) throw problem;
        await database_.delete(STORE, job.id);
      } catch (error) {
        const attempts = job.attempts + 1;
        await database_.put(STORE, {
          ...job,
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: Date.now() + backoffFor(attempts),
        } satisfies OutboxJob);
        if (attempts >= MAX_ATTEMPTS && job.docCollection && job.docId) {
          await patchDoc(job.docCollection, job.docId, { uploadState: 'failed' }).catch(() => undefined);
        }
      }
    }
  } finally {
    running = false;
    state = { ...state, uploading: false };
    await publish();
  }
}

export async function retryAll(): Promise<void> {
  const database_ = await database();
  for (const job of (await database_.getAll(STORE)) as OutboxJob[]) {
    await database_.put(STORE, { ...job, attempts: 0, nextAttemptAt: 0 } satisfies OutboxJob);
  }
  await processOutbox(true);
}

/** drops everything queued for these files, e.g. because the photo was deleted */
export async function removeJobsForPaths(paths: (string | undefined)[]): Promise<void> {
  const wanted = new Set(paths.filter((path): path is string => Boolean(path)));
  if (!wanted.size) return;
  const database_ = await database();
  for (const job of (await database_.getAll(STORE)) as OutboxJob[]) {
    if (wanted.has(job.storagePath)) await database_.delete(STORE, job.id);
  }
  await publish();
}

export async function removeJob(id: string): Promise<void> {
  const database_ = await database();
  const job = (await database_.get(STORE, id)) as OutboxJob | undefined;
  await database_.delete(STORE, id);
  if (job) await dropLocalBlob(job.storagePath);
  await publish();
}

/** wire the queue to the events that mean "we might have network again" */
export function startOutboxWorker(): () => void {
  const tick = () => void processOutbox();
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  const timer = window.setInterval(tick, 60_000);
  tick();
  void publish();
  return () => {
    window.removeEventListener('online', tick);
    window.clearInterval(timer);
  };
}
