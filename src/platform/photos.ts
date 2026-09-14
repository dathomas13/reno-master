/**
 * Picking photos.
 *
 * Web (the PWA phase): the browser hands over copies through a file input. There is no
 * API that lets a web page reference a gallery item, so the app reads the EXIF date and
 * warns when a picked photo was not taken on the day of the entry.
 *
 * Native (the APK phase): MediaStore is queried for the photos of that day, and the
 * content:// URI of the original is stored alongside the downsized copy, so the full
 * resolution original can be opened in the gallery later.
 */
import { isNative } from './index';
import { readTakenAt } from '@/lib/image';
import { toIsoDate } from '@/lib/date';

export interface PickedPhoto {
  file: Blob;
  name?: string;
  bytes: number;
  takenAt?: string;
  /** content:// URI of the original (native only) */
  sourceUri?: string;
  /** true when the photo was not taken on the requested day */
  otherDay: boolean;
}

export interface PickOptions {
  /** the day the entry is about, used to flag photos from other days */
  forDate?: string;
  camera?: boolean;
  multiple?: boolean;
}

export interface GalleryPhoto {
  uri: string;
  name: string;
  takenAt: string;
  bytes: number;
  width?: number;
  height?: number;
}

interface MediaStorePlugin {
  listPhotos(options: { from: string; to: string; limit?: number }): Promise<{ photos: GalleryPhoto[] }>;
  getThumbnail(options: { uri: string; size?: number }): Promise<{ base64: string; mime: string }>;
  readImage(options: { uri: string; maxEdge: number }): Promise<{ base64: string; mime: string }>;
  openInGallery(options: { uri: string }): Promise<void>;
}

function mediaStore(): MediaStorePlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.MediaStore as MediaStorePlugin | undefined) ?? null;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** photos of one day straight from the gallery index, newest first (native only) */
export async function listGalleryPhotosForDay(date: string, limit = 200): Promise<GalleryPhoto[]> {
  const plugin = mediaStore();
  if (!plugin) return [];
  try {
    const { photos } = await plugin.listPhotos({ from: date, to: date, limit });
    return photos;
  } catch {
    // permission denied or no gallery access - the file picker stays as the way in
    return [];
  }
}

/** small preview for the day grid, as a data URL */
export async function galleryThumbnail(uri: string, size = 320): Promise<string | null> {
  const plugin = mediaStore();
  if (!plugin) return null;
  try {
    const { base64, mime } = await plugin.getThumbnail({ uri, size });
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function openOriginalInGallery(sourceUri: string): Promise<boolean> {
  const plugin = mediaStore();
  if (!plugin) return false;
  await plugin.openInGallery({ uri: sourceUri });
  return true;
}

/** loads a gallery original as a blob (native) */
export async function readGalleryPhoto(uri: string, maxEdge = 1600): Promise<Blob | null> {
  const plugin = mediaStore();
  if (!plugin) return null;
  const { base64, mime } = await plugin.readImage({ uri, maxEdge });
  return base64ToBlob(base64, mime);
}

/** browser file picker; resolves once the user picked something or cancelled */
function pickWithInput(options: PickOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (options.multiple !== false) input.multiple = true;
    if (options.camera) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => done([]));
    input.click();
  });
}

export async function pickPhotos(options: PickOptions = {}): Promise<PickedPhoto[]> {
  const files = await pickWithInput(options);
  const picked: PickedPhoto[] = [];
  for (const file of files) {
    const takenAt = await readTakenAt(file);
    picked.push({
      file,
      name: file.name,
      bytes: file.size,
      takenAt,
      otherDay: Boolean(options.forDate && takenAt && toIsoDate(new Date(takenAt)) !== options.forDate),
    });
  }
  return picked;
}

/** documents (PDF) for receipts and plans */
export function pickFiles(accept = 'application/pdf,image/*'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => done([]));
    input.click();
  });
}

export function galleryPickerAvailable(): boolean {
  return isNative() && mediaStore() !== null;
}
