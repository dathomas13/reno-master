/**
 * Fetching the bytes of one archived file.
 *
 * Its own module so runExport stays free of the storage layer: the part that walks a few
 * hundred files and builds the archive is worth testing, and a test cannot open a bucket.
 */
import { readFileBytes } from '@/offline/fileUrls';
import type { FileReader } from './runExport';

export const readFromStorage: FileReader = async (storagePath) => {
  const bytes = await readFileBytes(storagePath);
  if (!bytes) throw new Error('Datei nicht gefunden');
  return bytes;
};
