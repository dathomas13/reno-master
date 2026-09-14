/**
 * Image helpers: shrink a gallery photo to something worth syncing, build a thumbnail
 * and read the time the picture was taken.
 *
 * A phone photo is 3-5 MB; at 1600 px long edge it is 200-400 KB and still good enough
 * to see what was built that day. The untouched original stays in the gallery.
 */
import exifr from 'exifr';
import { toIsoDateTime } from './date';

export const PHOTO_MAX_EDGE = 1600;
export const RECEIPT_MAX_EDGE = 2000; // receipts need to stay readable
export const THUMB_MAX_EDGE = 320;
export const JPEG_QUALITY = 0.82;

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  contentType: string;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  // imageOrientation 'from-image' applies the EXIF rotation, so portrait photos stay portrait
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function targetSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function draw(bitmap: ImageBitmap, size: { width: number; height: number }, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas nicht verfügbar');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('Bild konnte nicht umgewandelt werden');
  return blob;
}

export async function resizeImage(file: Blob, maxEdge = PHOTO_MAX_EDGE, quality = JPEG_QUALITY): Promise<ProcessedImage> {
  const bitmap = await loadBitmap(file);
  try {
    const size = targetSize(bitmap.width, bitmap.height, maxEdge);
    const blob = await draw(bitmap, size, quality);
    return { blob, width: size.width, height: size.height, contentType: 'image/jpeg' };
  } finally {
    bitmap.close?.();
  }
}

export async function makeThumbnail(file: Blob): Promise<ProcessedImage> {
  return resizeImage(file, THUMB_MAX_EDGE, 0.7);
}

/** when the picture was taken, from EXIF, falling back to the file date */
export async function readTakenAt(file: File | Blob): Promise<string | undefined> {
  try {
    const exif = (await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])) as
      | { DateTimeOriginal?: Date; CreateDate?: Date }
      | undefined;
    const date = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (date instanceof Date && !Number.isNaN(date.getTime())) return toIsoDateTime(date);
  } catch {
    // no EXIF (screenshot, WhatsApp image) - fall through
  }
  const lastModified = (file as File).lastModified;
  if (typeof lastModified === 'number' && lastModified > 0) return toIsoDateTime(new Date(lastModified));
  return undefined;
}

/** '2,4 MB' */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
