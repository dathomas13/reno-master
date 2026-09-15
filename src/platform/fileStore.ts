/**
 * Dateien liegen auf Cloudflare R2, erreichbar über einen kleinen Worker.
 *
 * Nicht bei Firebase, weil dessen kostenloses Kontingent nur für Buckets in den USA gilt
 * und der Bucket dieses Projekts in Frankfurt steht. R2 kostet bis 10 GB nichts und
 * berechnet keinen Datenverkehr.
 *
 * Der Bucket selbst ist zu. Die App weist sich mit dem Anmeldeticket von Firebase aus,
 * das der Worker gegen Googles öffentliche Schlüssel prüft; zum Anzeigen gibt er eine
 * Adresse heraus, die eine Stunde gilt. Deshalb werden hier nie Adressen gespeichert,
 * sondern die Bilddaten selbst – sonst wäre offline nach einer Stunde Schluss.
 */
import { auth } from '@/firebase/app';

const BASE = String(import.meta.env.VITE_FILES_URL ?? '').replace(/\/$/, '');

export class NotConfigured extends Error {
  constructor() {
    super('Der Dateispeicher ist noch nicht eingerichtet (VITE_FILES_URL fehlt).');
    this.name = 'NotConfigured';
  }
}

export function fileStoreReady(): boolean {
  return BASE.length > 0;
}

async function ticket(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Nicht angemeldet');
  return user.getIdToken();
}

function pathUrl(storagePath: string): string {
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${BASE}/files/${encoded}`;
}

/** legt eine Datei ab; wirft, wenn es nicht geklappt hat, damit die Outbox es erneut versucht */
export async function putFile(storagePath: string, blob: Blob, contentType: string): Promise<void> {
  if (!fileStoreReady()) throw new NotConfigured();
  const response = await fetch(pathUrl(storagePath), {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${await ticket()}`,
      'content-type': contentType || 'application/octet-stream',
    },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Hochladen fehlgeschlagen (${response.status}): ${await response.text()}`);
  }
}

export async function deleteFile(storagePath: string): Promise<void> {
  if (!fileStoreReady()) return;
  await fetch(pathUrl(storagePath), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${await ticket()}` },
  });
}

/** eine Adresse, die eine Stunde lang zum Anzeigen taugt */
export async function signedUrl(storagePath: string): Promise<string | null> {
  if (!fileStoreReady()) return null;
  const response = await fetch(`${BASE}/link`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await ticket()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ path: storagePath }),
  });
  if (!response.ok) return null;
  const { url } = (await response.json()) as { url?: string };
  return url ?? null;
}

/** holt die Datei selbst, für die Anzeige und für den Export */
export async function getFile(storagePath: string): Promise<Blob | null> {
  const url = await signedUrl(storagePath);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.blob();
}
