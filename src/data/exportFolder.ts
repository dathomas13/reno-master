/**
 * The export into a folder on the phone.
 *
 * This is the one that carries the full resolution: the originals are in the gallery of
 * this device, so they are copied from there straight into the target folder. Nothing is
 * uploaded for it, nothing is packed, and the app never holds a photo in memory.
 *
 * What the gallery cannot supply - pictures taken on the other phone, imports, photos
 * that have since been deleted - is fetched from the cloud in the size that was uploaded,
 * so the folder has no holes. The report says which is which.
 *
 * The effects are passed in rather than imported: the decisions below are worth testing,
 * and a test has neither a gallery nor a storage bucket.
 */
import type { ExportFile, ExportPlan } from './exportArchive';

export type SourceKind = 'gallery' | 'cloud' | 'text';

export interface FolderExportResult {
  /** written in full resolution, straight from the gallery */
  fromGallery: number;
  /** written from the cloud, in the size that was uploaded there */
  fromCloud: number;
  /** already in the folder from an earlier run */
  skipped: number;
  failed: { name: string; reason: string }[];
  bytes: number;
}

/** what a finished export wrote, so a later run can skip it */
export type FolderIndex = Record<string, number>;

export const INDEX_PATH = 'daten/.export-index.json';

/**
 * Where the bytes for this file come from.
 *
 * A gallery entry only resolves on the device that made it, so the id of that device has
 * to match - otherwise the app would ask the gallery for a picture it never saw and get
 * a confusing error instead of the cloud copy.
 */
export function sourceFor(file: ExportFile, thisDevice: string): SourceKind {
  if (file.text !== undefined) return 'text';
  if (file.sourceUri && file.deviceId === thisDevice) return 'gallery';
  return 'cloud';
}

/**
 * True when the folder already holds this file.
 *
 * Compared by size, not just by name: a copy that was interrupted half way is shorter
 * than the plan says and has to be written again. Files from the gallery are the full
 * original, whose size the plan only knows as the size of the working copy, so for those
 * any existing file counts - a wrong size would otherwise rewrite them on every run.
 */
export function alreadyThere(file: ExportFile, index: FolderIndex, source: SourceKind): boolean {
  const written = index[file.name];
  if (written === undefined) return false;
  if (source === 'gallery') return written > 0;
  return written === file.bytes;
}

/** the texts change with every export, so they are always rewritten */
export function planOrder(plan: ExportPlan): ExportFile[] {
  const texts = plan.files.filter((file) => file.text !== undefined);
  const rest = plan.files.filter((file) => file.text === undefined);
  return [...rest, ...texts];
}

export interface FolderEffects {
  /** copies a gallery entry into the folder, returns the bytes written */
  copyFromGallery(path: string, sourceUri: string, mime: string): Promise<number>;
  /** writes bytes that came from the cloud or were generated here */
  writeBytes(path: string, data: Uint8Array, mime: string): Promise<number>;
  /** fetches a file from cloud storage */
  readCloud(storagePath: string): Promise<Uint8Array>;
}

export interface FolderProgress {
  done: number;
  total: number;
  bytes: number;
  current: string;
}

/**
 * Writes every planned file into the folder.
 *
 * One file at a time on purpose: that is what keeps the memory flat and lets the export
 * survive a phone that falls asleep half way - whatever is written stays written, and
 * the next run continues.
 */
export async function runFolderExport(
  plan: ExportPlan,
  index: FolderIndex,
  thisDevice: string,
  effects: FolderEffects,
  onProgress: (progress: FolderProgress) => void,
): Promise<{ result: FolderExportResult; index: FolderIndex }> {
  const files = planOrder(plan);
  const result: FolderExportResult = {
    fromGallery: 0,
    fromCloud: 0,
    skipped: 0,
    failed: [],
    bytes: 0,
  };
  const written: FolderIndex = { ...index };
  let done = 0;

  for (const file of files) {
    onProgress({ done, total: files.length, bytes: result.bytes, current: file.name });
    const source = sourceFor(file, thisDevice);

    if (source !== 'text' && alreadyThere(file, written, source)) {
      result.skipped += 1;
      done += 1;
      continue;
    }

    try {
      if (source === 'text') {
        const bytes = await effects.writeBytes(
          file.name,
          new TextEncoder().encode(file.text ?? ''),
          file.mime ?? 'text/plain',
        );
        written[file.name] = bytes;
        result.bytes += bytes;
      } else if (source === 'gallery') {
        const bytes = await effects.copyFromGallery(
          file.name,
          file.sourceUri!,
          file.mime ?? 'image/jpeg',
        );
        written[file.name] = bytes;
        result.bytes += bytes;
        result.fromGallery += 1;
      } else {
        if (!file.storagePath) throw new Error('Keine Quelle hinterlegt');
        const data = await effects.readCloud(file.storagePath);
        const bytes = await effects.writeBytes(
          file.name,
          data,
          file.mime ?? 'application/octet-stream',
        );
        written[file.name] = bytes;
        result.bytes += bytes;
        result.fromCloud += 1;
      }
    } catch (error) {
      result.failed.push({
        name: file.name,
        reason: error instanceof Error ? error.message : 'unbekannter Fehler',
      });
    }
    done += 1;
  }

  onProgress({ done, total: files.length, bytes: result.bytes, current: '' });
  return { result, index: written };
}

/** the sentence the user reads when it is over */
export function describeResult(result: FolderExportResult): string {
  const parts = [`${result.fromGallery} Foto(s) im Original`];
  if (result.fromCloud > 0) parts.push(`${result.fromCloud} aus der Cloud`);
  if (result.skipped > 0) parts.push(`${result.skipped} schon vorhanden`);
  if (result.failed.length > 0) parts.push(`${result.failed.length} nicht auffindbar`);
  return parts.join(', ');
}
