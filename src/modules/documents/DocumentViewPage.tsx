import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { ZoomPan } from '@/components/ZoomPan';
import { PdfViewer } from '@/components/PdfViewer';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { useCollection, useDocument } from '@/data/hooks';
import { useOptions } from '@/data/useOptions';
import { useRooms } from '@/data/RoomsContext';
import { COL, type ProjectDocument, type Trade } from '@/data/types';
import { deleteDocument, restoreDocument } from '@/data/documents';
import { resolveFileUrl } from '@/offline/fileUrls';
import { formatDate } from '@/lib/date';
import { formatEuro } from '@/lib/money';
import { DocumentSheet } from './DocumentSheet';
import { shareDocument } from './documentFile';

/** one document: what it is in a line or two, the file below, full height */
export default function DocumentViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const { data: document, loading } = useDocument<ProjectDocument>(COL.documents, id);
  const { data: trades } = useCollection<Trade>(COL.trades);
  const { label } = useOptions();
  const { shortLabels } = useRooms();
  const [url, setUrl] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [editing, setEditing] = useState(false);

  const path = document?.storagePath;
  useEffect(() => {
    if (!path) return;
    let active = true;
    setResolved(false);
    void resolveFileUrl(path).then((value) => {
      if (!active) return;
      setUrl(value);
      setResolved(true);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (!document) {
    return (
      <>
        <TopBar title="Dokument" back="/dokumente" />
        {loading ? (
          <Spinner label="Dokument wird geladen…" />
        ) : (
          <EmptyState title="Dieses Dokument gibt es nicht mehr." hint="Es wurde gelöscht." />
        )}
      </>
    );
  }

  const tradeName = trades.find((trade) => trade.id === document.tradeId)?.name;
  const facts = [
    label('documentTypes', document.docType),
    document.vendor,
    formatDate(document.date),
    document.amount !== undefined ? formatEuro(document.amount) : '',
  ].filter(Boolean);
  const links = [tradeName, ...shortLabels(document.roomIds ?? [])].filter(Boolean);
  const isPdf = document.contentType === 'application/pdf';

  async function share() {
    if (!document) return;
    const result = await shareDocument(document);
    if (!result) toast('Die Datei ist offline nicht verfügbar. Einmal mit Netz öffnen.');
  }

  function remove() {
    if (!document) return;
    const stored = document;
    undoableDelete(`„${stored.title}“ gelöscht`, () => deleteDocument(stored), () => restoreDocument(stored));
    navigate('/dokumente', { replace: true });
  }

  // the bottom navigation stays on the phone, so the file ends above it
  return (
    <div className="h-[calc(100dvh-64px-env(safe-area-inset-bottom))] md:h-screen flex flex-col">
      <TopBar
        title={document.title}
        back="/dokumente"
        action={
          <button type="button" className="btn px-3 min-h-11" onClick={() => setEditing(true)}>
            Bearbeiten
          </button>
        }
      />
      <div className="px-3 py-2 border-b border-line text-sm">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-muted">{facts.join(' · ')}</p>
            {links.length > 0 && <p className="text-muted text-xs mt-0.5">{links.join(' · ')}</p>}
            {document.notes && <p className="mt-1 whitespace-pre-line">{document.notes}</p>}
          </div>
          <button type="button" className="btn btn-ghost px-2 min-h-11" aria-label="Weitergeben" onClick={() => void share()}>
            <Icon name="files" className="w-5 h-5" />
          </button>
          <button type="button" className="btn btn-ghost px-2 min-h-11 text-bad" aria-label="Löschen" onClick={remove}>
            <Icon name="trash" className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative bg-bg">
        {url && isPdf && <PdfViewer key={document.storagePath} storagePath={document.storagePath} />}
        {url && !isPdf && (
          <ZoomPan className="w-full h-full">
            <div className="w-full h-full flex items-center justify-center">
              <img src={url} alt={document.title} draggable={false} className="max-w-full max-h-full object-contain" />
            </div>
          </ZoomPan>
        )}
        {!url && resolved && (
          <div className="grid place-items-center h-full p-8 text-center text-muted text-sm">
            Diese Datei ist offline nicht verfügbar. Einmal mit Netz öffnen, dann bleibt sie gespeichert.
          </div>
        )}
        {!url && !resolved && <Spinner label="Datei wird geladen…" />}
      </div>
      <DocumentSheet
        target={editing ? { mode: 'edit', document } : null}
        documents={[]}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}
