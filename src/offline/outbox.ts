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
import { putFile } from '@/platform/fileStore';

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
const MAX_ATTEMPTS = 10;

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
  state = {
    pending: jobs.length,
    failed: jobs.filter((job) => job.attempts >= MAX_ATTEMPTS).length,
    uploading: state.uploading,
  };
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

let running = false;

/** uploads everything that is due; safe to call as often as you like */
export async function processOutbox(force = false): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  state = { ...state, uploading: true };
  for (const listener of listeners) listener(state);

  try {
    const database_ = await database();
    const jobs = ((await database_.getAll(STORE)) as OutboxJob[]).sort((a, b) => a.createdAt - b.createdAt);
    for (const job of jobs) {
      if (!force && job.nextAttemptAt > Date.now()) continue;
      if (!force && job.attempts >= MAX_ATTEMPTS) continue;
      try {
        await putFile(job.storagePath, job.blob, job.contentType);
        if (job.docCollection && job.docId) {
          await patchDoc(job.docCollection, job.docId, { [job.docField ?? 'uploadState']: 'uploaded' });
        }
        await database_.delete(STORE, job.id);
      } catch (error) {
        const attempts = job.attempts + 1;
        const backoff = Math.min(2 ** attempts * 1000, 10 * 60 * 1000);
        await database_.put(STORE, {
          ...job,
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: Date.now() + backoff,
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
