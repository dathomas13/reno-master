import { useEffect, useRef, useState } from 'react';
import { Lightbox, PhotoImage } from '@/components/PhotoView';
import { CameraCapture } from '@/components/CameraCapture';
import { addPhoto, deletePhoto, ReceiptAlreadyLinkedError } from '@/data/photos';
import {
  pickPhotos, pickFiles, galleryPickerAvailable, listGalleryPhotosForDay, readGalleryPhoto,
  readGalleryOriginal, galleryThumbnail, type GalleryPhoto,
} from '@/platform/photos';
import { cameraOptionsFromSettings, customCameraSupported } from '@/platform/camera';
import { loadSettings, saveSettings } from '@/lib/settings';
import { formatDate, toIsoDateTime } from '@/lib/date';
import { Sheet } from '@/components/Sheet';
import type { Cost, Photo } from '@/data/types';
import { makeThumbnail } from '@/lib/image';
import { newId } from '@/lib/ids';

interface PhotoBlob {
  blob: Blob;
  name?: string;
  takenAt?: string;
  sourceUri?: string;
  original?: Blob;
}

interface PhotoSource {
  key: string;
  name: string;
  preview(): Promise<{ url: string; thumbnail?: Blob } | null>;
  read(): Promise<PhotoBlob>;
}

interface ImportTile {
  source: PhotoSource;
  preview?: string;
  error?: string;
}

async function importDeadline<Result>(work: Promise<Result>): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Das Foto konnte nicht rechtzeitig gelesen werden.')), 30_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

interface PhotoAttachProps {
  photos: Photo[];
  entryId?: string;
  costId?: string;
  kind?: 'photo' | 'receipt';
  /** the day the entry is about, used to suggest and to flag photos */
  forDate?: string;
  onAdded(photo: Photo): void;
  onRemoved(photo: Photo): void;
  onBusyChange?(busy: boolean): void;
  onDuplicate?(photo: Photo): void;
  existingPhotos?: Photo[];
  existingCosts?: Cost[];
  disabled?: boolean;
  /** the untouched file, handed over before it is shrunk - used to read a receipt */
  onFileChosen?(file: Blob, contentType: string): void | Promise<void>;
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
  onBusyChange,
  onDuplicate,
  existingPhotos = photos,
  existingCosts,
  disabled = false,
  onFileChosen,
  autoCapture = false,
}: PhotoAttachProps) {
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewIndex = photos.findIndex((photo) => photo.id === previewId);
  const processing = useRef(false);
  const captured = useRef(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [imports, setImports] = useState<ImportTile[]>([]);
  const previewUrls = useRef(new Set<string>());
  const [dayPhotos, setDayPhotos] = useState<GalleryPhoto[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState<string | null>(null);
  // remembered per device: whoever photographs cable runs wants it on for a whole day
  const [keepOriginals, setKeepOriginals] = useState(() => loadSettings().keepOriginals);
  // read once per mount, like keepOriginals above - Einstellungen is a separate screen
  const [cameraSettings] = useState(() => {
    const settings = loadSettings();
    return { useCustomCamera: settings.useCustomCamera, options: cameraOptionsFromSettings(settings) };
  });
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  async function importPhotos(sources: PhotoSource[]) {
    if (processing.current || disabled || sources.length === 0) return;
    processing.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setImports((current) => [
      ...current.filter((tile) => !sources.some((source) => source.key === tile.source.key)),
      ...sources.map((source) => ({ source })),
    ]);
    const previews = new Map<string, { url: string; thumbnail?: Blob }>();
    const failed = new Set<string>();
    const reportError = (source: PhotoSource, cause: unknown) => {
      failed.add(source.key);
      const error = cause instanceof Error ? cause.message : 'Foto konnte nicht hinzugefügt werden.';
      setImports((current) => current.map((tile) => tile.source.key === source.key ? { ...tile, error } : tile));
    };
    try {
      for (const source of sources) {
        try {
          const preview = await importDeadline(source.preview());
          if (preview) {
            previews.set(source.key, preview);
            setImports((current) => current.map((tile) => tile.source.key === source.key
              ? { ...tile, preview: preview.url } : tile));
          }
        } catch (cause) {
          reportError(source, cause);
        }
      }
      for (const source of sources) {
        if (failed.has(source.key)) continue;
        try {
          const item = await importDeadline(source.read());
          const photo = await addPhoto({
            file: item.blob, kind, entryId, costId, originalName: item.name,
            takenAt: item.takenAt, sourceUri: item.sourceUri,
            keepOriginal: keepOriginals, originalFile: item.original,
            thumbnail: previews.get(source.key)?.thumbnail,
          });
          onAdded(photo);
          if (forDate && photo.takenAt && photo.takenAt.slice(0, 10) !== forDate) {
            setWarning('Die Auswahl enthält Fotos von einem anderen Tag.');
          }
          setImports((current) => current.filter((tile) => tile.source.key !== source.key));
        } catch (cause) {
          reportError(source, cause);
        }
      }
    } finally {
      processing.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  function toggleOriginals() {
    const next = !keepOriginals;
    setKeepOriginals(next);
    saveSettings({ keepOriginals: next });
  }

  function openCamera() {
    if (cameraSettings.useCustomCamera && customCameraSupported()) {
      setCameraOpen(true);
      return;
    }
    void pickFromFiles(true);
  }

  async function handleCameraCapture(blob: Blob) {
    setCameraOpen(false);
    setWarning(null);
    await addFromBlobs([{ blob, name: `Kamera-${Date.now()}.jpg`, takenAt: toIsoDateTime() }]);
  }

  function pickForDate() {
    if (galleryPickerAvailable() && forDate) {
      openDayGallery();
      return;
    }
    void pickFromFiles(false);
  }

  async function addFromBlobs(
    items: PhotoBlob[],
  ) {
    if (kind === 'photo') {
      await importPhotos(items.map((item) => ({
        key: newId(),
        name: item.name ?? 'Foto',
        preview: async () => {
          const thumbnail = (await makeThumbnail(item.blob)).blob;
          const url = URL.createObjectURL(thumbnail);
          previewUrls.current.add(url);
          return { url, thumbnail };
        },
        read: async () => item,
      })));
      return;
    }
    if (processing.current || disabled) return;
    processing.current = true;
    setBusy(true);
    onBusyChange?.(true);
    const knownPhotos = [...existingPhotos];
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
          keepOriginal: false,
          originalFile: item.original,
          existingPhotos: knownPhotos,
          existingCosts,
        });
        const alreadyAttached = photos.some((current) => current.id === photo.id);
        if (knownPhotos.some((current) => current.id === photo.id)) {
          setWarning('Dieser Beleg ist bereits vorhanden und wird nicht erneut gespeichert.');
        }
        knownPhotos.push(photo);
        onAdded(photo);
        if (!alreadyAttached && item === items[0]) {
          await onFileChosen?.(item.blob, item.blob.type || 'image/jpeg');
        }
      }
    } catch (cause) {
      if (cause instanceof ReceiptAlreadyLinkedError) onDuplicate?.(cause.photo);
      setWarning(cause instanceof Error ? cause.message : 'Datei konnte nicht hinzugefügt werden.');
    } finally {
      processing.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function pickFromFiles(camera = false) {
    try {
      const picked = await pickPhotos({ forDate, camera, deferMetadata: kind === 'photo' });
      if (!picked.length) return;
      const otherDay = picked.filter((item) => item.otherDay);
      setWarning(
        otherDay.length
          ? `${otherDay.length} Foto(s) stammen von einem anderen Tag – falls das nicht passt, wieder entfernen.`
          : null,
      );
      await addFromBlobs(
        picked.map((item) => ({ blob: item.file, name: item.name, takenAt: item.takenAt, sourceUri: item.sourceUri })),
      );
    } catch (cause) {
      setWarning(cause instanceof Error ? cause.message : 'Fotos konnten nicht geöffnet werden.');
    }
  }

  async function pickPdf() {
    const files = await pickFiles('application/pdf,image/*');
    if (!files.length) return;
    setWarning(null);
    await addFromBlobs(files.map((file) => ({ blob: file, name: file.name })));
  }

  function openDayGallery() {
    setDayPhotos([]);
    setSelectedUris([]);
    setThumbs({});
    setDayLoading(true);
    setDayOpen(true);
  }

  useEffect(() => {
    if (!dayOpen || !forDate) return;
    let active = true;
    void (async () => {
      try {
        const items = await importDeadline(listGalleryPhotosForDay(forDate));
        if (!active) return;
        setDayPhotos(items);
        setDayLoading(false);
        let next = 0;
        await Promise.all(Array.from({ length: 3 }, async () => {
          while (active && next < items.length) {
            const item = items[next++];
            const url = await importDeadline(galleryThumbnail(item.uri)).catch(() => null);
            if (active && url) setThumbs((current) => ({ ...current, [item.uri]: url }));
          }
        }));
      } catch (cause) {
        if (active) {
          setDayLoading(false);
          setDayOpen(false);
          setWarning(cause instanceof Error ? cause.message : 'Galerie konnte nicht geladen werden.');
        }
      }
    })();
    return () => { active = false; };
  }, [dayOpen, forDate]);

  function uploadSelection() {
    if (processing.current || disabled) return;
    const selected = dayPhotos.filter((item) => selectedUris.includes(item.uri));
    setDayOpen(false);
    void importPhotos(selected.map((item) => ({
      key: item.uri,
      name: item.name,
      preview: async () => {
        const url = thumbs[item.uri] ?? await galleryThumbnail(item.uri);
        return url ? { url } : null;
      },
      read: async () => {
        const blob = await readGalleryPhoto(item.uri);
        if (!blob) throw new Error('Foto ist nicht mehr in der Galerie verfügbar.');
        const original = keepOriginals ? (await readGalleryOriginal(item.uri)) ?? undefined : undefined;
        return { blob, name: item.name, takenAt: item.takenAt, sourceUri: item.uri, original };
      },
    })));
  }

  async function remove(photo: Photo) {
    await deletePhoto(photo);
    onRemoved(photo);
  }

  useEffect(() => {
    if (!autoCapture || captured.current || disabled) return;
    captured.current = true;
    openCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture, disabled]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {kind === 'photo' && forDate && (
          <button type="button" className="btn" onClick={pickForDate} disabled={busy || disabled}>
            Fotos vom {formatDate(forDate).slice(0, 6)}
          </button>
        )}
        <button type="button" className="btn" onClick={() => void pickFromFiles(false)} disabled={busy || disabled}>
          Aus Galerie
        </button>
        <button type="button" className="btn" onClick={openCamera} disabled={busy || disabled}>
          Kamera
        </button>
        {kind === 'receipt' && (
          <button type="button" className="btn" onClick={() => void pickPdf()} disabled={busy || disabled}>
            PDF / Datei
          </button>
        )}
        {kind === 'photo' && (
          <label
            className={`inline-flex min-h-10 items-center gap-2 px-1 text-xs text-muted ${busy || disabled ? 'opacity-50' : ''}`}
            title="Zusätzlich die unveränderte Datei sichern – für Fotos, die später in voller Auflösung gebraucht werden"
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={keepOriginals}
              onChange={toggleOriginals}
              disabled={busy || disabled}
            />
            <span
              className="relative inline-flex h-5 w-9 items-center rounded-full bg-line transition peer-checked:bg-accent"
              aria-hidden="true"
            >
              <span className="inline-block h-4 w-4 translate-x-1 rounded-full bg-bg transition peer-checked:translate-x-4" />
            </span>
            Original sichern
          </label>
        )}
        {busy && <span role="status" className="text-muted text-sm self-center">
          {kind === 'photo' ? 'Fotos werden vorbereitet…' : 'wird verarbeitet…'}
        </span>}
      </div>

      {warning && <p className="text-warn text-sm mb-2">{warning}</p>}

      {(photos.length > 0 || imports.length > 0) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square">
              {kind === 'receipt' ? (
                <button type="button" className="w-full h-full" aria-label={`Beleg öffnen: ${photo.originalName || 'Beleg'}`}
                  onClick={() => setPreviewId(photo.id)}>
                  <PhotoImage photo={photo} thumb className="w-full h-full object-cover rounded-lg bg-panel2" />
                </button>
              ) : <PhotoImage photo={photo} thumb className="w-full h-full object-cover rounded-lg bg-panel2" />}
              {photo.uploadState === 'pending' && (
                <span role="status" aria-label={`Upload ausstehend: ${photo.originalName ?? 'Foto'}`}
                  className="absolute bottom-1 left-1 flex items-center gap-1 text-[10px] bg-bg/80 px-1.5 py-1 rounded">
                  <span className="w-3 h-3 rounded-full border-2 border-muted border-t-accent animate-spin" />
                  Upload ausstehend
                </span>
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
                disabled={busy || disabled}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-bg/80 text-ink text-sm leading-6"
                onClick={() => void remove(photo)}
              >
                ×
              </button>
            </div>
          ))}
          {imports.map((tile) => (
            <div key={tile.source.key} className="relative aspect-square rounded-lg overflow-hidden bg-panel2">
              {tile.preview && <img src={tile.preview} alt={tile.source.name} className="w-full h-full object-cover" />}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/40 p-2">
                {tile.error ? (
                  <>
                    <span role="alert" className="text-xs text-center text-warn line-clamp-3" title={tile.error}>{tile.error}</span>
                    <button type="button" className="btn px-2 text-xs" disabled={busy || disabled}
                      onClick={() => void importPhotos([tile.source])}>Erneut</button>
                    <button type="button" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-bg/80"
                      aria-label={`Import entfernen: ${tile.source.name}`}
                      onClick={() => setImports((current) => current.filter((item) => item.source.key !== tile.source.key))}>×</button>
                  </>
                ) : (
                  <span role="status" aria-label={`Foto wird vorbereitet: ${tile.source.name}`}
                    className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewIndex >= 0 && (
        <Lightbox photos={photos} index={previewIndex} onClose={() => setPreviewId(null)}
          onIndexChange={(index) => setPreviewId(photos[index]?.id ?? null)} />
      )}

      <Sheet open={dayOpen} onClose={() => setDayOpen(false)} title={`Galerie ${forDate ? formatDate(forDate) : ''}`}>
        {dayLoading ? (
          <p role="status" className="p-6 text-muted text-sm">Galerie wird geladen…</p>
        ) : dayPhotos.length === 0 ? (
          <p className="p-6 text-muted text-sm">Für diesen Tag sind keine Fotos in der Galerie.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {dayPhotos.map((item) => (
              <button
                key={item.uri}
                type="button"
                className="aspect-square bg-panel2 rounded-lg overflow-hidden relative"
                aria-label={item.name}
                aria-pressed={selectedUris.includes(item.uri)}
                onClick={() => setSelectedUris((current) => current.includes(item.uri)
                  ? current.filter((uri) => uri !== item.uri) : [...current, item.uri])}
                disabled={busy || disabled}
              >
                {thumbs[item.uri] ? (
                  <img src={thumbs[item.uri]} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-muted p-1 block truncate">{item.name}</span>
                )}
                <span className="absolute bottom-0 inset-x-0 text-[10px] bg-bg/70 truncate px-1">
                  {item.takenAt.slice(11, 16)}
                </span>
                <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-bg/90 border border-accent text-accent">
                  {selectedUris.includes(item.uri) ? '✓' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="sticky bottom-0 p-3 bg-panel border-t border-line">
          <button type="button" className="btn btn-primary w-full mb-3"
            disabled={selectedUris.length === 0 || busy || disabled}
            onClick={uploadSelection}>
            Hochladen ({selectedUris.length})
          </button>
          <button type="button" className="btn w-full" onClick={() => {
            setDayOpen(false);
            void pickFromFiles(false);
          }} disabled={busy || disabled}>
            Andere Tage…
          </button>
        </div>
      </Sheet>

      {cameraOpen && (
        <CameraCapture
          options={cameraSettings.options}
          onCapture={(blob) => void handleCameraCapture(blob)}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
