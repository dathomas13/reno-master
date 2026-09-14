/**
 * Writes the planned archive.
 *
 * Kept apart from the plan so the slow part - fetching a few gigabytes of photos - has
 * one place, and so the sink can differ: on a laptop the bytes go straight into a file
 * the user picked, which is the only way an archive larger than memory can be written at
 * all. Everything else collects them into a blob.
 */
import { ZipWriter } from '@/lib/zip';
import type { ExportFile, ExportPlan } from './exportArchive';

export interface ExportProgress {
  done: number;
  total: number;
  doneBytes: number;
  totalBytes: number;
  current: string;
  /** files that could not be fetched, with the reason */
  skipped: { name: string; reason: string }[];
}

export type ProgressListener = (progress: ExportProgress) => void;

/**
 * Where the bytes of one file come from. Passed in rather than imported, which keeps
 * this module free of Firebase and IndexedDB - and therefore testable.
 */
export type FileReader = (storagePath: string) => Promise<Uint8Array>;

export interface ArchiveTarget {
  write(chunk: Uint8Array): Promise<void> | void;
  close(): Promise<void>;
  /** what the user gets at the end, if it was collected in memory */
  result(): Blob | null;
}

/** true when this browser can stream into a file the user picks */
export function canStreamToDisk(): boolean {
  return typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

interface SavePicker {
  showSaveFilePicker(options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{
    createWritable(): Promise<{
      write(chunk: Uint8Array): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

/**
 * Asks for a file and streams into it. Nothing is held in memory, so the size of the
 * archive is limited by the disk and not by the phone.
 */
export async function pickFileTarget(suggestedName: string): Promise<ArchiveTarget> {
  const picker = globalThis as unknown as SavePicker;
  const handle = await picker.showSaveFilePicker({
    suggestedName,
    types: [{ description: 'ZIP-Archiv', accept: { 'application/zip': ['.zip'] } }],
  });
  const stream = await handle.createWritable();
  return {
    write: (chunk) => stream.write(chunk),
    close: () => stream.close(),
    result: () => null,
  };
}

/** collects everything, for browsers without the file picker */
export function memoryTarget(): ArchiveTarget {
  const chunks: BlobPart[] = [];
  return {
    write(chunk) {
      // copy: the writer reuses nothing, but a view into a shared buffer would be a trap
      chunks.push(new Uint8Array(chunk));
    },
    close: async () => {},
    result: () => new Blob(chunks, { type: 'application/zip' }),
  };
}

/**
 * Runs the export. A file that cannot be fetched is noted and skipped rather than
 * aborting the whole archive - one missing photo must not cost the other 500.
 */
export async function writeArchive(
  plan: ExportPlan,
  target: ArchiveTarget,
  onProgress: ProgressListener,
  read: FileReader,
): Promise<ExportProgress> {
  const zip = new ZipWriter((chunk) => target.write(chunk));
  const progress: ExportProgress = {
    done: 0,
    total: plan.files.length,
    doneBytes: 0,
    totalBytes: plan.totalBytes,
    current: '',
    skipped: [],
  };

  for (const file of plan.files) {
    progress.current = file.name;
    onProgress({ ...progress });
    try {
      const data = await bytesOf(file, read);
      await zip.add(file.name, data, modifiedOf(file));
      progress.doneBytes += data.length;
    } catch (error) {
      progress.skipped.push({
        name: file.name,
        reason: error instanceof Error ? error.message : 'unbekannter Fehler',
      });
    }
    progress.done += 1;
    onProgress({ ...progress });
  }

  await zip.finish();
  await target.close();
  progress.current = '';
  onProgress({ ...progress });
  return progress;
}

async function bytesOf(file: ExportFile, read: FileReader): Promise<Uint8Array> {
  if (file.text !== undefined) return new TextEncoder().encode(file.text);
  if (!file.storagePath) throw new Error('Weder Text noch Datei');
  return read(file.storagePath);
}

/** the day the photo belongs to, so the file dates in the archive mean something */
function modifiedOf(file: ExportFile): Date {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(file.name);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}
