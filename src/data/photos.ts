/**
 * Adding a photo: shrink it, keep a thumbnail, write the document right away and hand
 * the bytes to the upload queue. Works with no network; the picture shows up in the
 * entry immediately because the local blob is displayed until the upload went through.
 */
import { COL, type Photo, type PhotoKind } from './types';
import { saveDoc, patchDoc, removeDoc } from '@/firebase/db';
import { enqueue, putLocalBlob, dropLocalBlob } from '@/offline/outbox';
import { resizeImage, makeThumbnail, readTakenAt, PHOTO_MAX_EDGE, RECEIPT_MAX_EDGE } from '@/lib/image';
import { newId, deviceId } from '@/lib/ids';
import { toIsoDateTime } from '@/lib/date';

export interface AddPhotoInput {
  file: Blob;
  kind: PhotoKind;
  entryId?: string;
  costId?: string;
  originalName?: string;
  sourceUri?: string;
  takenAt?: string;
  caption?: string;
  roomIds?: string[];
}

function storagePathFor(kind: PhotoKind, id: string, costId: string | undefined, extension: string): string {
  if (kind === 'receipt') return `receipts/${costId ?? 'lose'}/${id}.${extension}`;
  return `photos/${id}.${extension}`;
}

export async function addPhoto(input: AddPhotoInput): Promise<Photo> {
  const id = newId();
  const isPdf = input.file.type === 'application/pdf';
  const maxEdge = input.kind === 'receipt' ? RECEIPT_MAX_EDGE : PHOTO_MAX_EDGE;

  const main = isPdf
    ? { blob: input.file, width: 0, height: 0, contentType: 'application/pdf' }
    : await resizeImage(input.file, maxEdge);
  const extension = isPdf ? 'pdf' : 'jpg';
  const storagePath = storagePathFor(input.kind, id, input.costId, extension);

  const photo: Photo = {
    id,
    kind: input.kind,
    entryId: input.entryId,
    costId: input.costId,
    storagePath,
    contentType: main.contentType,
    width: main.width,
    height: main.height,
    bytes: main.blob.size,
    takenAt: input.takenAt ?? (await readTakenAt(input.file)) ?? toIsoDateTime(),
    originalName: input.originalName,
    originalBytes: input.file.size,
    sourceUri: input.sourceUri,
    deviceId: input.sourceUri ? deviceId() : undefined,
    caption: input.caption,
    roomIds: input.roomIds ?? [],
    uploadState: 'pending',
  };

  if (!isPdf) {
    const thumb = await makeThumbnail(input.file);
    photo.thumbPath = `photos/${id}_thumb.jpg`;
    await putLocalBlob(photo.thumbPath, thumb.blob);
    await enqueue({
      id: `${id}-thumb`,
      storagePath: photo.thumbPath,
      contentType: 'image/jpeg',
      blob: thumb.blob,
    });
  }

  // strip undefined, Firestore rejects it
  const clean = Object.fromEntries(Object.entries(photo).filter(([, value]) => value !== undefined));
  await saveDoc<Photo>(COL.photos, clean as unknown as Photo);

  await enqueue({
    id,
    storagePath,
    contentType: main.contentType,
    blob: main.blob,
    docCollection: COL.photos,
    docId: id,
    docField: 'uploadState',
  });

  return photo;
}

export async function updatePhoto(id: string, patch: Partial<Photo>): Promise<void> {
  await patchDoc(COL.photos, id, patch as Record<string, unknown>);
}

export async function deletePhoto(photo: Photo): Promise<void> {
  await dropLocalBlob(photo.storagePath);
  if (photo.thumbPath) await dropLocalBlob(photo.thumbPath);
  await removeDoc(COL.photos, photo.id);
  // the file in Cloud Storage is left in place on purpose: deleting it needs network,
  // and an orphaned 300 KB file is cheaper than a failed delete that loses the document
}
