import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { ProjectDocument } from '@/data/types';
import { readFileBytes, resolveFileUrl } from '@/offline/fileUrls';
import { handOverFile, type HandOver } from '@/platform/shareFile';

/** a name another app can do something with: the title, file system safe, with the right ending */
export function shareName(document: Pick<ProjectDocument, 'title' | 'contentType'>): string {
  const base = document.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Dokument';
  return `${base}.${document.contentType === 'application/pdf' ? 'pdf' : 'jpg'}`;
}

/**
 * Hands the file on: share sheet in the app (mail, messenger, Drive), a download in the
 * browser. Null when the file is neither on this device nor reachable.
 */
export async function shareDocument(document: ProjectDocument): Promise<HandOver | null> {
  const bytes = await readFileBytes(document.storagePath).catch(() => null);
  if (!bytes) return null;
  return handOverFile(shareName(document), bytes, document.contentType, 'Dokument weitergeben');
}

/** the small square in the list: the picture for an image, a sign for a PDF */
export function DocumentThumb({ document }: { document: ProjectDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  const path = document.thumbPath;
  useEffect(() => {
    if (!path) return;
    let active = true;
    void resolveFileUrl(path).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (url) {
    return <img src={url} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover shrink-0" />;
  }
  return (
    <span className="w-10 h-10 rounded-lg bg-panel2 grid place-items-center text-muted shrink-0 text-[10px] font-semibold">
      {document.contentType === 'application/pdf' ? 'PDF' : <Icon name="photo" className="w-5 h-5" />}
    </span>
  );
}
