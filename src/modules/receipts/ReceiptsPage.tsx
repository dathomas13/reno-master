import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { PhotoImage, Lightbox } from '@/components/PhotoView';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type Photo } from '@/data/types';
import { orderBy } from '@/firebase/db';
import { formatEuro } from '@/lib/money';
import { formatDate, formatMonth, monthKey } from '@/lib/date';

interface Row {
  photo: Photo;
  cost?: Cost;
}

/** the day a receipt shows: the cost it belongs to, falling back to when the file was taken */
function rowDate(row: Row): string {
  return row.cost?.date ?? row.photo.takenAt?.slice(0, 10) ?? '';
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
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(costs.map((cost) => [cost.id, cost]));
    return photos
      .filter((photo) => photo.kind === 'receipt')
      .map((photo) => ({ photo, cost: photo.costId ? byId.get(photo.costId) : undefined }))
      .sort((a, b) => rowDate(b).localeCompare(rowDate(a)));
  }, [photos, costs]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.cost?.vendor, row.cost?.category, row.cost?.description, row.cost?.invoiceNumber, row.photo.originalName]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, search]);

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
      />

      <div className="px-3 pb-3">
        <input
          className="field"
          type="search"
          placeholder="Suchen nach Händler, Kategorie, Rechnungsnummer…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading && photos.length === 0 && <Spinner label="Belege werden geladen…" />}

      {!loading && visible.length === 0 && (
        <EmptyState
          title="Keine Belege"
          hint="Belege entstehen bei den Kosten, beim Fotografieren oder Hochladen einer Rechnung."
        />
      )}

      {months.map(([key, list]) => (
        <section key={key || 'ohne'}>
          <div className="section-title">{key ? formatMonth(`${key}-01`) : 'Ohne Datum'}</div>
          <ul>
            {list.map((row) => (
              <li key={row.photo.id}>
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
                      {row.cost?.category ? ` · ${row.cost.category}` : ''}
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
                  <Link to={`/kosten/${row.cost.id}`} className="text-accent" onClick={() => setOpen(null)}>
                    Kosten-Eintrag öffnen ›
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
