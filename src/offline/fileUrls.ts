/**
 * Macht aus einem Speicherpfad etwas, das ein <img> oder <iframe> anzeigen kann.
 *
 * Der Reihe nach: der Blob, der noch in der Warteschlange liegt; die Datei, die schon
 * einmal geholt wurde; sonst das Netz.
 *
 * Gespeichert werden die Bilddaten, nicht die Adresse. Die Adressen vom Worker gelten nur
 * eine Stunde – eine gemerkte Adresse wäre am nächsten Tag wertlos, und offline gäbe es
 * dann gar nichts zu sehen. Die Daten selbst altern nicht.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { getFile } from '@/platform/fileStore';
import { localBlob } from './outbox';

const DB_NAME = 'reno-files';
const STORE = 'files';

let dbPromise: Promise<IDBPDatabase> | null = null;
function database(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

/** Pfad → Objekt-Adresse, damit dasselbe Bild nicht zweimal im Speicher landet */
const memory = new Map<string, string>();

function objectUrlFor(storagePath: string, blob: Blob): string {
  const existing = memory.get(storagePath);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  memory.set(storagePath, url);
  return url;
}

export async function resolveFileUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  const cached = memory.get(storagePath);
  if (cached) return cached;

  // noch nicht hochgeladen: der Blob liegt in der Warteschlange
  const pending = await localBlob(storagePath);
  if (pending) return objectUrlFor(storagePath, pending);

  const database_ = await database();
  const stored = (await database_.get(STORE, storagePath)) as Blob | undefined;
  if (stored) return objectUrlFor(storagePath, stored);

  if (!navigator.onLine) return null;
  try {
    const blob = await getFile(storagePath);
    if (!blob) return null;
    await database_.put(STORE, blob, storagePath);
    return objectUrlFor(storagePath, blob);
  } catch {
    return null;
  }
}

/** die Datei ohne Umweg über eine Adresse, für den Export */
export async function readFileBytes(storagePath: string): Promise<Uint8Array | null> {
  const pending = await localBlob(storagePath);
  if (pending) return new Uint8Array(await pending.arrayBuffer());

  const database_ = await database();
  const stored = (await database_.get(STORE, storagePath)) as Blob | undefined;
  if (stored) return new Uint8Array(await stored.arrayBuffer());

  const blob = await getFile(storagePath);
  if (!blob) return null;
  await database_.put(STORE, blob, storagePath);
  return new Uint8Array(await blob.arrayBuffer());
}

/** gibt die Objekt-Adresse frei; die Daten bleiben gespeichert */
export function releaseFileUrl(storagePath: string): void {
  const url = memory.get(storagePath);
  if (url) {
    URL.revokeObjectURL(url);
    memory.delete(storagePath);
  }
}

/** wirft die gespeicherten Dateien weg, für "Cache leeren" in den Einstellungen */
export async function clearFileCache(): Promise<void> {
  for (const path of [...memory.keys()]) releaseFileUrl(path);
  const database_ = await database();
  await database_.clear(STORE);
}
