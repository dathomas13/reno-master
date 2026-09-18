import { useEffect, useState, type ReactNode } from 'react';
import { resolveFileUrl } from '@/offline/fileUrls';
import type { Photo } from '@/data/types';
import { PdfViewer } from './PdfViewer';

/** shows a photo from the upload queue, the URL cache or the network, in that order */
export function PhotoImage({
  photo,
  thumb = false,
  full = false,
  className = '',
  alt = '',
}: {
  photo: Photo;
  thumb?: boolean;
  /** show the archived original instead of the 1600 px copy, if there is one */
  full?: boolean;
  className?: string;
  alt?: string;
}) {
  const path =
    thumb && photo.thumbPath
      ? photo.thumbPath
      : (full && photo.originalPath) || photo.storagePath;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void resolveFileUrl(path).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (photo.contentType === 'application/pdf') {
    return (
      <div className={`flex items-center justify-center bg-panel2 text-muted text-xs ${className}`}>PDF</div>
    );
  }

  if (!url || failed) {
    return (
      <div className={`flex items-center justify-center bg-panel2 text-muted text-[10px] ${className}`}>
        {failed ? 'nicht geladen' : '…'}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt || photo.caption || photo.originalName || 'Baustellenfoto'}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

interface LightboxProps {
  photos: Photo[];
  index: number;
  onClose(): void;
  onIndexChange(index: number): void;
  footer?: (photo: Photo) => ReactNode;
}

/** full screen viewer with swipe, used from the diary and the cost detail */
export function Lightbox({ photos, index, onClose, onIndexChange, footer }: LightboxProps) {
  const photo = photos[index];
  const isPdf = photo?.contentType === 'application/pdf';
  // the original can be several megabytes, so it is only fetched when asked for
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    setShowOriginal(false);
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (isPdf) return;
      if (event.key === 'ArrowRight') onIndexChange(Math.min(index + 1, photos.length - 1));
      if (event.key === 'ArrowLeft') onIndexChange(Math.max(index - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndexChange, isPdf]);

  if (!photo) return null;

  let startX = 0;
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 min-h-14 shrink-0 pt-[env(safe-area-inset-top)] text-muted">
        <div className="flex items-center gap-1">
          {photos.length > 1 && <button type="button" className="btn btn-ghost w-11 h-11 p-0" aria-label="Vorherige Datei" title="Vorherige Datei"
            disabled={index === 0} onClick={() => onIndexChange(index - 1)}>&#8592;</button>}
          <span className="text-sm whitespace-nowrap">{index + 1} / {photos.length}</span>
          {photos.length > 1 && <button type="button" className="btn btn-ghost w-11 h-11 p-0" aria-label="Nächste Datei" title="Nächste Datei"
            disabled={index === photos.length - 1} onClick={() => onIndexChange(index + 1)}>&#8594;</button>}
        </div>
        <span className="flex items-center gap-2">
          {photo.originalPath &&
            (showOriginal ? (
              <span className="text-xs text-accent">Original</span>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowOriginal(true)}
              >
                Original laden
              </button>
            ))}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Schließen
          </button>
        </span>
      </div>
      <div
        className="flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-hidden"
        onTouchStart={(event) => {
          if (isPdf) return;
          startX = event.touches[0]?.clientX ?? 0;
        }}
        onTouchEnd={(event) => {
          if (isPdf) return;
          const delta = (event.changedTouches[0]?.clientX ?? 0) - startX;
          if (delta < -50) onIndexChange(Math.min(index + 1, photos.length - 1));
          if (delta > 50) onIndexChange(Math.max(index - 1, 0));
        }}
      >
        {isPdf ? <PdfViewer key={photo.storagePath} storagePath={photo.storagePath} /> : (
          <PhotoImage photo={photo} full={showOriginal} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      {footer && <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs text-muted shrink-0 max-h-[25dvh] overflow-auto break-words">{footer(photo)}</div>}
    </div>
  );
}
