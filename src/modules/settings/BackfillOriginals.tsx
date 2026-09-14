import { useMemo, useState } from 'react';
import { useCollection } from '@/data/hooks';
import { COL, type Photo } from '@/data/types';
import { archiveOriginal } from '@/data/photos';
import { readGalleryOriginal } from '@/platform/photos';
import { isNative } from '@/platform/index';
import { deviceId } from '@/lib/ids';
import { formatSize } from '@/data/exportArchive';

/**
 * Fetches the originals of photos that were added without one.
 *
 * The gallery link only resolves on the phone that took the picture, and only until that
 * phone is replaced or the photo is moved. So this is a race against time, and the app
 * says how many pictures are still within reach.
 */
export function BackfillOriginals() {
  const photos = useCollection<Photo>(COL.photos);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<{ archived: number; lost: number } | null>(null);
  const [at, setAt] = useState(0);

  const candidates = useMemo(
    () =>
      photos.data.filter(
        (photo) =>
          photo.kind === 'photo' &&
          !photo.originalPath &&
          Boolean(photo.sourceUri) &&
          photo.deviceId === deviceId(),
      ),
    [photos.data],
  );

  const estimated = candidates.reduce((sum, photo) => sum + (photo.originalBytes ?? photo.bytes), 0);

  if (!isNative()) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold mb-3">Originale nachladen</h2>
        <p className="text-sm text-muted">
          Geht nur in der App auf dem Handy, das die Fotos aufgenommen hat – nur dort führt die
          gespeicherte Galerie-Adresse noch zum Bild.
        </p>
      </section>
    );
  }

  async function run() {
    setRunning(true);
    setDone(null);
    let archived = 0;
    let lost = 0;
    try {
      for (const [index, photo] of candidates.entries()) {
        setAt(index + 1);
        // one at a time on purpose: a phone has no memory for parallel originals
        const original = photo.sourceUri ? await readGalleryOriginal(photo.sourceUri) : null;
        if (!original) {
          lost += 1;
          continue;
        }
        await archiveOriginal(photo, original);
        archived += 1;
      }
      setDone({ archived, lost });
    } finally {
      setRunning(false);
      setAt(0);
    }
  }

  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-3">Originale nachladen</h2>
      <p className="text-sm text-muted mb-3">
        Holt für Fotos, die ohne Original gespeichert wurden, die unveränderte Datei aus der Galerie
        nach – damit sie im Archiv landen und einen Handywechsel überstehen. Am besten im WLAN.
      </p>

      {photos.loading ? (
        <p className="text-sm text-muted">Fotos werden geladen…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted">
          Von diesem Gerät ist nichts offen – alle Fotos haben ihr Original gesichert.
        </p>
      ) : (
        <p className="text-sm mb-3">
          {candidates.length} Foto(s) ohne Original, geschätzt {formatSize(estimated)}.
        </p>
      )}

      {candidates.length > 0 && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? `Lädt… ${at} / ${candidates.length}` : 'Originale nachladen'}
        </button>
      )}

      {done && (
        <p className="text-sm mt-3">
          {done.archived} Original(e) in die Warteschlange gelegt.
          {done.lost > 0 && (
            <span className="block text-warn">
              Bei {done.lost} Foto(s) war das Bild in der Galerie nicht mehr auffindbar – gelöscht
              oder verschoben. Dafür bleibt es bei der verkleinerten Fassung.
            </span>
          )}
        </p>
      )}
    </section>
  );
}
