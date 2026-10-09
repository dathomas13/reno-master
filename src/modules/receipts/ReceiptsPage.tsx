import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { PhotoImage, Lightbox } from '@/components/PhotoView';
import { useCollection } from '@/data/hooks';
import { COL, createdAtMillis, type Cost, type Photo } from '@/data/types';
import { orderBy } from '@/firebase/db';
import { formatEuro } from '@/lib/money';
import { formatDate, formatMonth, monthKey } from '@/lib/date';
import { useOptions } from '@/data/useOptions';
import { Icon } from '@/components/Icon';
import { SectionTabs } from '@/components/SectionTabs';
import { useRowActions } from '@/components/RowActions';

interface Row {
  photo: Photo;
  cost?: Cost;
}

/** the day a receipt shows: the cost it belongs to, falling back to when the file was taken */
function rowDate(row: Row): string {
  return row.cost?.date ?? row.photo.takenAt?.slice(0, 10) ?? '';
}

/**
 * tie-breaker for receipts that share a day (a cost's date is day-only, so several receipts
 * from the same invoice date are common) - by when the record was created, so the newest
 * still lands on top instead of following Firestore's unrelated document-id order
 */
function rowCreatedMillis(row: Row): number {
  return createdAtMillis(row.cost?.createdAt ?? row.photo.createdAt);
}

/**
 * Every scanned receipt in one place, newest first, so the real file behind a cost entry
 * can be pulled up without opening that entry first. The amount comes from the cost the
 * receipt is filed under (see `Cost.receiptPhotoIds` / `Photo.costId` in `data/types.ts`) -
 * a receipt with no matching cost still shows up, just without a sum.
 */
export default function ReceiptsPage() {
  const { data: photos, loading } = useCollection<Photo>(COL.photos);
  const { data: costs } = useCollection<Cost>(COL.costs, [orderBy('date', 'desc')]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const rowActions = useRowActions();
  const [open, setOpen] = useState<number | null>(null);
  const { label } = useOptions();
  // the cost stores the category's key; people read and search for its name
  const categoryOf = (cost?: Cost) => (cost?.category ? label('costCategories', cost.category) : '');

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(costs.map((cost) => [cost.id, cost]));
    return photos
      .filter((photo) => photo.kind === 'receipt')
      .map((photo) => ({ photo, cost: photo.costId ? byId.get(photo.costId) : undefined }))
      .sort((a, b) => rowDate(b).localeCompare(rowDate(a)) || rowCreatedMillis(b) - rowCreatedMillis(a));
  }, [photos, costs]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.cost?.vendor, row.cost?.category ? label('costCategories', row.cost.category) : '', row.cost?.description, row.cost?.invoiceNumber, row.photo.originalName]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, search, label]);

  const sum = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    for (const row of visible) {
      if (!row.cost || seen.has(row.cost.id)) continue;
      seen.add(row.cost.id);
      total += row.cost.amountGross;
    }
    return total;
  }, [visible]);

  const months = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of visible) {
      const date = rowDate(row);
      const key = date ? monthKey(date) : '';
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <>
      <TopBar
        title="Belege"
        subtitle={`${visible.length} ${visible.length === 1 ? 'Beleg' : 'Belege'} · ${formatEuro(sum)}`}
        action={
          <Link to="/kosten/neu?capture=1" className="btn btn-primary px-3 min-h-11">
            <Icon name="plus" className="w-5 h-5" />
            Beleg
          </Link>
        }
      />
      <SectionTabs
        label="Kosten"
        tabs={[
          { to: '/kosten', label: 'Liste', active: false },
          { to: '/kosten?ansicht=uebersicht', label: 'Übersicht', active: false },
          { to: '/belege', label: 'Belege', active: true },
        ]}
      />

      <div className="p-3">
        <input
          className="field"
          type="search"
          placeholder="Suchen nach Händler, Kategorie, Rechnungsnummer…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading && photos.length === 0 && <Spinner label="Belege werden geladen…" />}

      {!loading && visible.length === 0 &&
        (search.trim() ? (
          <EmptyState
            title="Nichts gefunden"
            hint={`Kein Beleg passt zu „${search.trim()}“.`}
            action={
              <button type="button" className="btn mt-2" onClick={() => setSearch('')}>
                Suche leeren
              </button>
            }
          />
        ) : (
          <EmptyState
            title="Keine Belege"
            hint="Belege entstehen bei den Kosten, beim Fotografieren oder Hochladen einer Rechnung."
          />
        ))}

      {months.map(([key, list]) => (
        <section key={key || 'ohne'}>
          <div className="section-title">{key ? formatMonth(`${key}-01`) : 'Ohne Datum'}</div>
          <ul>
            {list.map((row) => (
              <li
                key={row.photo.id}
                {...(row.cost
                  ? rowActions.bind(row.cost.vendor || 'Beleg', [
                      { label: 'Rechnung öffnen', icon: 'euro', onSelect: () => navigate(`/kosten/${row.cost!.id}`) },
                    ])
                  : {})}
              >
                <button
                  type="button"
                  className="list-row w-full text-left"
                  onClick={() => setOpen(visible.indexOf(row))}
                >
                  <PhotoImage
                    photo={row.photo}
                    thumb
                    className="w-12 h-12 rounded-lg object-cover bg-panel2 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{row.cost?.vendor || row.photo.originalName || 'ohne Händler'}</div>
                    <div className="text-xs text-muted truncate">
                      {rowDate(row) ? formatDate(rowDate(row)) : 'ohne Datum'}
                      {row.cost?.category ? ` · ${categoryOf(row.cost)}` : ''}
                      {!row.cost ? ' · ohne Kosten-Eintrag' : ''}
                    </div>
                  </div>
                  {row.cost && <div className="text-right shrink-0">{formatEuro(row.cost.amountGross)}</div>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {rowActions.sheet}
      {open !== null && visible[open] && (
        <Lightbox
          photos={visible.map((row) => row.photo)}
          index={open}
          onClose={() => setOpen(null)}
          onIndexChange={setOpen}
          footer={(photo) => {
            const row = visible.find((item) => item.photo.id === photo.id);
            if (!row) return null;
            return (
              <div className="flex flex-col gap-1">
                <span className="text-ink">{row.cost?.vendor || row.photo.originalName || 'Beleg'}</span>
                <span>
                  {rowDate(row) ? formatDate(rowDate(row)) : 'ohne Datum'}
                  {row.cost ? ` · ${formatEuro(row.cost.amountGross)}` : ''}
                </span>
                {row.cost && (
                  <Link
                    to={`/kosten/${row.cost.id}`}
                    className="text-accent inline-flex items-center gap-1 min-h-11"
                    onClick={() => setOpen(null)}
                  >
                    Kosten-Eintrag öffnen
                    <Icon name="chevronRight" className="w-4 h-4" />
                  </Link>
                )}
              </div>
            );
          }}
        />
      )}
    </>
  );
}
