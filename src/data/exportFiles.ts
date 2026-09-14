/**
 * Fetching the bytes of one archived file.
 *
 * Its own module so runExport stays free of Firebase and IndexedDB: the part that walks
 * a few hundred files and builds the archive is worth testing, and a test cannot open a
 * storage bucket.
 */
import { resolveFileUrl } from '@/offline/fileUrls';
import type { FileReader } from './runExport';

export const readFromStorage: FileReader = async (storagePath) => {
  const url = await resolveFileUrl(storagePath);
  if (!url) throw new Error('Datei nicht gefunden');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Abruf fehlgeschlagen (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
};
