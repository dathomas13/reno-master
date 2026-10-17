import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { useRowActions } from '@/components/RowActions';
import { useCollection } from '@/data/hooks';
import { useOptions } from '@/data/useOptions';
import { useRooms } from '@/data/RoomsContext';
import { COL, type ProjectDocument } from '@/data/types';
import { deleteDocument, restoreDocument } from '@/data/documents';
import { formatDate } from '@/lib/date';
import { formatEuro } from '@/lib/money';
import { countByType, filterDocuments } from './documentList';
import { DocumentSheet, type DocumentSheetTarget } from './DocumentSheet';
import { DocumentThumb, shareDocument } from './documentFile';

/** Firestore says "permission-denied" for a collection the rules do not list yet */
function isMissingRule(error: Error | null): boolean {
  return Boolean(error && /permission|insufficient/i.test(`${(error as { code?: string }).code ?? ''} ${error.message}`));
}

function MissingRuleNotice() {
  return (
    <div className="card m-3 p-4 text-sm border-warn/40">
      <p className="font-medium mb-2">Die Datenbank kennt die Dokumente noch nicht.</p>
      <p className="text-muted mb-2">
        In der Firebase-Konsole unter Firestore → Regeln einmal diese Zeile neben den anderen eintragen und
        veröffentlichen:
      </p>
      <code className="block bg-panel2 rounded p-2 text-xs break-all">
        {'match /documents/{doc} { allow read, write: if allowed(); }'}
      </code>
    </div>
  );
}

export default function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const { data: documents, loading, error } = useCollection<ProjectDocument>(COL.documents);
  const { label, active } = useOptions();
  const { shortLabel: roomLabel, matches, writeId } = useRooms();
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const rowActions = useRowActions();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [sheet, setSheet] = useState<DocumentSheetTarget | null>(null);

  const roomFilter = params.get('raum');

  // the capture button opens the upload straight away (?neu=1, with ?raum= when a room is open)
  useEffect(() => {
    if (params.get('neu') !== '1') return;
    setSheet({ mode: 'new', roomIds: roomFilter ? [writeId(roomFilter)] : [] });
    const next = new URLSearchParams(params);
    next.delete('neu');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const typeLabel = (id: string) => label('documentTypes', id);
  const visible = useMemo(
    () => filterDocuments(documents, { type, room: roomFilter, text: search }, typeLabel, matches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, type, roomFilter, search, matches, label],
  );

  // the chips follow the order of the set; a type nobody uses gets no chip
  const counts = useMemo(() => countByType(documents), [documents]);
  const chips = useMemo(() => {
    const ordered = active('documentTypes').map((entry) => entry.id);
    const extra = [...counts.keys()].filter((id) => !ordered.includes(id));
    return [...ordered, ...extra].filter((id) => counts.has(id));
  }, [active, counts]);

  function remove(document: ProjectDocument) {
    undoableDelete(
      `„${document.title}“ gelöscht`,
      () => deleteDocument(document),
      () => restoreDocument(document),
    );
  }

  async function share(document: ProjectDocument) {
    const result = await shareDocument(document);
    if (!result) toast('Die Datei ist offline nicht verfügbar. Einmal mit Netz öffnen.');
  }

  return (
    <>
      <TopBar
        title="Dokumente"
        subtitle={`${visible.length} ${visible.length === 1 ? 'Dokument' : 'Dokumente'}`}
        action={
          <button
            type="button"
            className="btn btn-primary px-3 min-h-11"
            onClick={() => setSheet({ mode: 'new', roomIds: roomFilter ? [writeId(roomFilter)] : [] })}
          >
            <Icon name="plus" className="w-5 h-5" />
            Neu
          </button>
        }
      />

      {isMissingRule(error) && <MissingRuleNotice />}

      <div className="p-3 pb-1">
        <input
          className="field"
          type="search"
          placeholder="Suchen nach Titel, Firma, Notiz…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {(chips.length > 1 || roomFilter) && (
        <div className="px-3 py-2 flex gap-2 overflow-x-auto">
          {roomFilter && (
            <button
              type="button"
              className="chip chip-on shrink-0"
              aria-label={`Raumfilter ${roomLabel(roomFilter)} aufheben`}
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              {roomLabel(roomFilter)}
              <Icon name="close" className="w-4 h-4" />
            </button>
          )}
          {chips.length > 1 &&
            chips.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip shrink-0 ${type === id ? 'chip-on' : ''}`}
                onClick={() => setType(type === id ? null : id)}
              >
                {typeLabel(id)} {counts.get(id)}
              </button>
            ))}
        </div>
      )}

      {loading && documents.length === 0 && <Spinner label="Dokumente werden geladen…" />}

      {!loading && !error && visible.length === 0 &&
        (documents.length > 0 ? (
          <EmptyState
            title="Nichts gefunden"
            hint="Kein Dokument passt zu Suche und Filter."
            action={
              <button
                type="button"
                className="btn mt-2"
                onClick={() => {
                  setSearch('');
                  setType(null);
                }}
              >
                Filter aufheben
              </button>
            }
          />
        ) : (
          <EmptyState
            title="Noch keine Dokumente"
            hint="Angebote, Berechnungen, Verträge, Datenblätter – als PDF oder Bild über „Neu“ ablegen."
          />
        ))}

      <ul>
        {visible.map((document) => (
          <li
            key={document.id}
            {...rowActions.bind(document.title, [
              { label: 'Bearbeiten', icon: 'note', onSelect: () => setSheet({ mode: 'edit', document }) },
              { label: 'Weitergeben', icon: 'files', onSelect: () => void share(document) },
              { label: 'Löschen', icon: 'trash', danger: true, onSelect: () => remove(document) },
            ])}
          >
            <Link to={`/dokumente/${document.id}`} className="list-row">
              <DocumentThumb document={document} />
              <span className="flex-1 min-w-0">
                <span className="block truncate">{document.title}</span>
                <span className="block text-xs text-muted truncate">
                  {[typeLabel(document.docType), document.vendor, formatDate(document.date)].filter(Boolean).join(' · ')}
                  {document.uploadState === 'pending' && ' · wird hochgeladen'}
                  {document.uploadState === 'failed' && ' · Hochladen gescheitert'}
                </span>
              </span>
              {document.amount !== undefined && (
                <span className="text-sm tabular-nums shrink-0">{formatEuro(document.amount)}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {rowActions.sheet}
      <DocumentSheet target={sheet} documents={documents} onClose={() => setSheet(null)} />
    </>
  );
}
