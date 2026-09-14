import { useEffect, useRef, useState } from 'react';
import { PhotoImage } from '@/components/PhotoView';
import { addPhoto, deletePhoto } from '@/data/photos';
import {
  pickPhotos, pickFiles, galleryPickerAvailable, listGalleryPhotosForDay, readGalleryPhoto,
  readGalleryOriginal, galleryThumbnail, type GalleryPhoto,
} from '@/platform/photos';
import { loadSettings, saveSettings } from '@/lib/settings';
import { formatDate } from '@/lib/date';
import { Sheet } from '@/components/Sheet';
import type { Photo } from '@/data/types';

interface PhotoAttachProps {
  photos: Photo[];
  entryId?: string;
  costId?: string;
  kind?: 'photo' | 'receipt';
  /** the day the entry is about, used to suggest and to flag photos */
  forDate?: string;
  onAdded(photo: Photo): void;
  onRemoved(photo: Photo): void;
  /** the untouched file, handed over before it is shrunk - used to read a receipt */
  onFileChosen?(file: Blob, contentType: string): void;
  /** open the camera as soon as the screen is shown (app shortcut "Beleg erfassen") */
  autoCapture?: boolean;
}

/**
 * Attaches photos to a diary entry or a receipt.
 *
 * In the browser the gallery cannot be listed, so the day is used as a hint and photos
 * taken on another day get a visible warning. In the Android build the gallery of that
 * day is listed directly and only the downsized copy is stored, together with the URI of
 * the original.
 */
export function PhotoAttach({
  photos,
  entryId,
  costId,
  kind = 'photo',
  forDate,
  onAdded,
  onRemoved,
  onFileChosen,
  autoCapture = false,
}: PhotoAttachProps) {
  const [busy, setBusy] = useState(false);
  const captured = useRef(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [dayPhotos, setDayPhotos] = useState<GalleryPhoto[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState<string | null>(null);
  // remembered per device: whoever photographs cable runs wants it on for a whole day
  const [keepOriginals, setKeepOriginals] = useState(() => loadSettings().keepOriginals);

  function toggleOriginals() {
    const next = !keepOriginals;
    setKeepOriginals(next);
    saveSettings({ keepOriginals: next });
  }

  async function addFromBlobs(
    items: { blob: Blob; name?: string; takenAt?: string; sourceUri?: string; original?: Blob }[],
  ) {
    setBusy(true);
    try {
      for (const item of items) {
        const photo = await addPhoto({
          file: item.blob,
          kind,
          entryId,
          costId,
          originalName: item.name,
          takenAt: item.takenAt,
          sourceUri: item.sourceUri,
          keepOriginal: keepOriginals && kind === 'photo',
          originalFile: item.original,
        });
        onAdded(photo);
      }
    } finally {
      setBusy(false);
    }
  }

  async function pickFromFiles(camera = false) {
    const picked = await pickPhotos({ forDate, camera });
    if (!picked.length) return;
    const first = picked[0];
    if (first) onFileChosen?.(first.file, first.file.type || 'image/jpeg');
    const otherDay = picked.filter((item) => item.otherDay);
    setWarning(
      otherDay.length
        ? `${otherDay.length} Foto(s) stammen von einem anderen Tag – falls das nicht passt, wieder entfernen.`
        : null,
    );
    await addFromBlobs(
      picked.map((item) => ({ blob: item.file, name: item.name, takenAt: item.takenAt })),
    );
  }

  async function pickPdf() {
    const files = await pickFiles('application/pdf,image/*');
    if (!files.length) return;
    const first = files[0];
    if (first) onFileChosen?.(first, first.type || 'application/pdf');
    await addFromBlobs(files.map((file) => ({ blob: file, name: file.name })));
  }

  async function openDayGallery() {
    if (!forDate) return;
    const photos = await listGalleryPhotosForDay(forDate);
    setDayPhotos(photos);
    setThumbs({});
    setDayOpen(true);
    // load the previews one by one so the sheet appears immediately
    for (const photo of photos.slice(0, 60)) {
      const url = await galleryThumbnail(photo.uri);
      if (url) setThumbs((current) => ({ ...current, [photo.uri]: url }));
    }
  }

  async function addFromGallery(item: GalleryPhoto) {
    const blob = await readGalleryPhoto(item.uri);
    if (!blob) return;
    onFileChosen?.(blob, blob.type || 'image/jpeg');
    // the picker only ever hands over a downsized copy, so the untouched file has to be
    // read separately - and only when it is actually going to be kept
    const original =
      keepOriginals && kind === 'photo' ? ((await readGalleryOriginal(item.uri)) ?? undefined) : undefined;
    await addFromBlobs([
      { blob, name: item.name, takenAt: item.takenAt, sourceUri: item.uri, original },
    ]);
  }

  async function remove(photo: Photo) {
    await deletePhoto(photo);
    onRemoved(photo);
  }

  useEffect(() => {
    if (!autoCapture || captured.current) return;
    captured.current = true;
    void pickFromFiles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {galleryPickerAvailable() && forDate && (
          <button type="button" className="btn" onClick={() => void openDayGallery()} disabled={busy}>
            Fotos vom {formatDate(forDate).slice(0, 6)}
          </button>
        )}
        <button type="button" className="btn" onClick={() => void pickFromFiles(false)} disabled={busy}>
          Aus Galerie
        </button>
        <button type="button" className="btn" onClick={() => void pickFromFiles(true)} disabled={busy}>
          Kamera
        </button>
        {kind === 'receipt' && (
          <button type="button" className="btn" onClick={() => void pickPdf()} disabled={busy}>
            PDF / Datei
          </button>
        )}
        {kind === 'photo' && (
          <button
            type="button"
            className={`btn ${keepOriginals ? 'btn-primary' : ''}`}
            aria-pressed={keepOriginals}
            onClick={toggleOriginals}
            disabled={busy}
            title="Zusätzlich die unveränderte Datei sichern – für Fotos, die später in voller Auflösung gebraucht werden"
          >
            Original sichern
          </button>
        )}
        {busy && <span className="text-muted text-sm self-center">wird verarbeitet…</span>}
      </div>

      {warning && <p className="text-warn text-sm mb-2">{warning}</p>}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square">
              <PhotoImage photo={photo} thumb className="w-full h-full object-cover rounded-lg bg-panel2" />
              {photo.uploadState === 'pending' && (
                <span className="absolute bottom-1 left-1 text-[10px] bg-bg/80 px-1 rounded">wartet</span>
              )}
              {photo.uploadState === 'failed' && (
                <span className="absolute bottom-1 left-1 text-[10px] bg-bad/90 text-bg px-1 rounded">Fehler</span>
              )}
              {photo.originalPath && photo.uploadState === 'uploaded' && (
                <span
                  className="absolute bottom-1 right-1 text-[10px] bg-accent/90 text-bg px-1 rounded"
                  title="Das Original liegt gesichert in der Cloud"
                >
                  Original
                </span>
              )}
              <button
                type="button"
                aria-label="Foto entfernen"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-bg/80 text-ink text-sm leading-6"
                onClick={() => void remove(photo)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={dayOpen} onClose={() => setDayOpen(false)} title={`Galerie ${forDate ? formatDate(forDate) : ''}`}>
        {dayPhotos.length === 0 ? (
          <p className="p-6 text-muted text-sm">Für diesen Tag sind keine Fotos in der Galerie.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {dayPhotos.map((item) => (
              <button
                key={item.uri}
                type="button"
                className="aspect-square bg-panel2 rounded-lg overflow-hidden relative"
                onClick={() => void addFromGallery(item).then(() => setDayOpen(false))}
              >
                {thumbs[item.uri] ? (
                  <img src={thumbs[item.uri]} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-muted p-1 block truncate">{item.name}</span>
                )}
                <span className="absolute bottom-0 inset-x-0 text-[10px] bg-bg/70 truncate px-1">
                  {item.takenAt.slice(11, 16)}
                </span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn w-full mb-3" onClick={() => void pickFromFiles(false)}>
          Andere Tage…
        </button>
      </Sheet>
    </div>
  );
}
