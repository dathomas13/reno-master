/**
 * Which photos belong to a room.
 *
 * A photo carries no room of its own: `addPhoto` never sets `roomIds`, because when the
 * picture is taken nobody is picking rooms - the room is on the diary entry or on the
 * receipt it is attached to. So a photo counts for a room when its entry or its cost says
 * so, and the field on the photo is honoured as well for the day something sets it.
 *
 * Without this the "Fotos" tile of a room shows zero however full the diary is.
 */
import type { Cost, DiaryEntry, Photo } from './types';

export interface PhotoSource {
  photos: Photo[];
  entries: DiaryEntry[];
  costs: Cost[];
}

function hasAny(ids: string[] | undefined, wanted: string[]): boolean {
  return Boolean(ids?.some((id) => wanted.includes(id)));
}

/** the ids of the entries and receipts that are linked to any of these room ids */
function ownersOf(roomIds: string[], source: PhotoSource): { entries: Set<string>; costs: Set<string> } {
  return {
    entries: new Set(source.entries.filter((entry) => hasAny(entry.roomIds, roomIds)).map((entry) => entry.id)),
    costs: new Set(source.costs.filter((cost) => hasAny(cost.roomIds, roomIds)).map((cost) => cost.id)),
  };
}

/**
 * `roomIds` is the full set of stored ids a room stands for now - a merged room's own id
 * plus every id it absorbed (RoomsContext's `idsFor`), so a photo filed under either the
 * old or the new id still counts.
 */
export function belongsToRoom(photo: Photo, roomIds: string[], source: PhotoSource): boolean {
  if (hasAny(photo.roomIds, roomIds)) return true;
  const owners = ownersOf(roomIds, source);
  return Boolean(
    (photo.entryId && owners.entries.has(photo.entryId)) || (photo.costId && owners.costs.has(photo.costId)),
  );
}

/** every photo of a room (or the set of ids it absorbed), newest first */
export function photosForRoom(roomIds: string[], source: PhotoSource): Photo[] {
  const owners = ownersOf(roomIds, source);
  const found = source.photos.filter(
    (photo) =>
      hasAny(photo.roomIds, roomIds) ||
      (photo.entryId && owners.entries.has(photo.entryId)) ||
      (photo.costId && owners.costs.has(photo.costId)),
  );
  return sortByDate(found, source);
}

/**
 * The day a photo shows. `takenAt` is what the camera said; where it is missing - a
 * picture from the gallery, a scan - the entry or the receipt it hangs on knows the day.
 */
export function photoDate(photo: Photo, source: PhotoSource): string {
  if (photo.takenAt) return photo.takenAt.slice(0, 10);
  const entry = photo.entryId ? source.entries.find((item) => item.id === photo.entryId) : undefined;
  if (entry) return entry.date;
  const cost = photo.costId ? source.costs.find((item) => item.id === photo.costId) : undefined;
  return cost?.date ?? '';
}

/** newest first; photos without any date go last, in a stable order */
export function sortByDate(photos: Photo[], source: PhotoSource): Photo[] {
  return [...photos].sort((a, b) => {
    const left = photoDate(a, source);
    const right = photoDate(b, source);
    if (left !== right) return (right || '').localeCompare(left || '');
    return a.id.localeCompare(b.id);
  });
}
