import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { SectionTabs } from '@/components/SectionTabs';
import { useRowActions } from '@/components/RowActions';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { deleteCost, saveCost } from '@/data/repos';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type Photo, type Trade } from '@/data/types';
import { useOptions } from '@/data/useOptions';
import { isPaid } from '@/data/options';
import { orderBy, where } from '@/firebase/db';
import { formatEuro } from '@/lib/money';
import { formatDate, monthKey, today } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';
import {
  sumGross,
  byCategory,
  byMonth,
  totalForMonth,
  budgetPerTrade,
  NO_CATEGORY,
  sortNewestFirst,
} from '@/data/costAggregation';
import { costExportBaseName, planCostExport } from '@/data/costExport';
import { memoryTarget, writeArchive } from '@/data/runExport';
import { readFromStorage } from '@/data/exportFiles';
import { handOverFile } from '@/platform/shareFile';

type Tab = 'liste' | 'uebersicht';
/** key, sum, text to show */
type BarRow = [string, number, string];

export default function CostsPage() {
  const [params, setParams] = useSearchParams();
  const rowActions = useRowActions();
  const undoableDelete = useUndoableDelete();
  const { data: rawCosts, loading } = useCollection<Cost>(COL.costs, [orderBy('date', 'desc')]);
  const costs = useMemo(() => sortNewestFirst(rawCosts), [rawCosts]);
  const { data: trades } = useCollection<Trade>(COL.trades);
  // only the receipts, for the export; the diary photos are none of this page's business
  const { data: receipts } = useCollection<Photo>(COL.photos, [where('kind', '==', 'receipt')]);
  const { shortLabel: roomLabel, matches } = useRooms();
  const { sets, label, active } = useOptions();
  const toast = useToast();
  // the view is part of the address, so Liste · Übersicht · Belege are tabs like elsewhere
  const tab: Tab = params.get('ansicht') === 'uebersicht' ? 'uebersicht' : 'liste';
  function tabTo(next: Tab): string {
    const query = new URLSearchParams(params);
    if (next === 'uebersicht') query.set('ansicht', 'uebersicht');
    else query.delete('ansicht');
    const text = query.toString();
    return text ? `/kosten?${text}` : '/kosten';
  }
  /** the filters go, the view stays - and so does a mark, which has its own switch */
  function clearFilters() {
    const query = new URLSearchParams();
    if (tab === 'uebersicht') query.set('ansicht', 'uebersicht');
    const mark = params.get('kennzeichen');
    if (mark) query.set('kennzeichen', mark);
    setParams(query, { replace: true });
  }
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);

  const roomFilter = params.get('raum');
  const categoryFilter = params.get('kategorie');
  const tradeFilter = params.get('gewerk');
  const markFilter = params.get('kennzeichen');

  /** KfW, Absetzbar …: offered as a filter only once some cost carries it, so nobody sees it who does not use it */
  const marksInUse = useMemo(() => {
    const used = new Set(costs.flatMap((cost) => cost.marks ?? []));
    if (markFilter) used.add(markFilter);
    const known = active('costMarks').filter((entry) => used.has(entry.id));
    const unknown = [...used].filter((id) => !known.some((entry) => entry.id === id));
    return [...known.map((entry) => entry.id), ...unknown];
  }, [costs, markFilter, active]);

  function toggleMark(mark: string) {
    const query = new URLSearchParams(params);
    if (markFilter === mark) query.delete('kennzeichen');
    else query.set('kennzeichen', mark);
    setParams(query, { replace: true });
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return costs.filter((cost) => {
      if (roomFilter && !matches(cost.roomIds, roomFilter)) return false;
      if (categoryFilter && (cost.category.trim() || NO_CATEGORY) !== categoryFilter) return false;
      if (tradeFilter && cost.tradeId !== tradeFilter) return false;
      if (markFilter && !(cost.marks ?? []).includes(markFilter)) return false;
      if (!needle) return true;
      return [
        cost.vendor,
        cost.description,
        label('costCategories', cost.category),
        cost.invoiceNumber,
        ...(cost.marks ?? []).map((mark) => label('costMarks', mark)),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [costs, search, roomFilter, categoryFilter, tradeFilter, markFilter, matches, label]);

  const total = sumGross(filtered);
  const thisMonth = totalForMonth(costs, monthKey(today()));
  const categories = useMemo(() => byCategory(filtered, sets), [filtered, sets]);
  const months = useMemo(() => byMonth(filtered), [filtered]);
  const tradeBudgets = useMemo(() => budgetPerTrade(filtered, trades), [filtered, trades]);

  /** what is on screen goes out: the table plus the receipts, numbered alike - for the bank or the tax adviser */
  async function exportList() {
    if (exporting || filtered.length === 0) return;
    const plan = planCostExport({ costs: filtered, photos: receipts, trades, sets });
    const base = costExportBaseName(today(), markFilter ? label('costMarks', markFilter) : undefined);
    setExporting('Export…');
    try {
      let skipped = 0;
      let name = `${base}.csv`;
      let data: Uint8Array;
      let mime = 'text/csv';
      if (plan.receiptCount === 0) {
        data = new TextEncoder().encode(plan.files[0]!.text ?? '');
      } else {
        const target = memoryTarget();
        const result = await writeArchive(
          plan,
          target,
          (progress) => setExporting(`Belege ${Math.max(progress.done - 1, 0)}/${plan.receiptCount}…`),
          readFromStorage,
        );
        skipped = result.skipped.length;
        data = new Uint8Array(await target.result()!.arrayBuffer());
        name = `${base}.zip`;
        mime = 'application/zip';
      }
      const how = await handOverFile(name, data, mime, 'Rechnungen weitergeben');
      if (how === 'cancelled') return;
      const notes = [
        plan.withoutReceipt > 0 ? `${plan.withoutReceipt} ohne Beleg` : '',
        skipped > 0 ? `${skipped} ${skipped === 1 ? 'Beleg' : 'Belege'} nicht geladen` : '',
      ].filter(Boolean);
      toast(
        `${filtered.length} ${filtered.length === 1 ? 'Rechnung' : 'Rechnungen'} exportiert` +
          (notes.length > 0 ? ` – ${notes.join(', ')}` : ''),
      );
    } catch (cause) {
      toast(`Export fehlgeschlagen: ${cause instanceof Error ? cause.message : 'unbekannter Fehler'}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <TopBar
        title="Kosten"
        subtitle={`${formatEuro(total)} gesamt · ${formatEuro(thisMonth)} diesen Monat`}
        action={
          <Link className="btn btn-primary px-3 min-h-11" to="/kosten/neu">
            <Icon name="plus" className="w-5 h-5" />
            Neu
          </Link>
        }
      />

      <SectionTabs
        label="Kosten"
        tabs={[
          { to: tabTo('liste'), label: 'Liste', active: tab === 'liste' },
          { to: tabTo('uebersicht'), label: 'Übersicht', active: tab === 'uebersicht' },
          { to: '/belege', label: 'Belege', active: false },
        ]}
      />

      <div className="flex items-center gap-2 px-3 pt-2 pb-3">
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          {marksInUse.map((mark) => (
            <button
              key={mark}
              type="button"
              aria-pressed={markFilter === mark}
              className={`chip ${markFilter === mark ? 'chip-on' : ''}`}
              onClick={() => toggleMark(mark)}
            >
              {label('costMarks', mark)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost px-3 min-h-10 text-sm shrink-0"
          onClick={() => void exportList()}
          disabled={Boolean(exporting) || filtered.length === 0}
        >
          {exporting ?? 'Export'}
        </button>
      </div>

      {(roomFilter || categoryFilter || tradeFilter) && (
        <div className="px-3 pb-2">
          <button
            type="button"
            className="chip chip-on"
            aria-label="Filter aufheben"
            onClick={clearFilters}
          >
            Filter:{' '}
            {[
              roomFilter ? roomLabel(roomFilter) : '',
              tradeFilter ? (trades.find((trade) => trade.id === tradeFilter)?.name ?? 'Gewerk') : '',
              categoryFilter ? label('costCategories', categoryFilter) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
      )}

      {tab === 'liste' && (
        <>
          <div className="px-3 pb-3">
            <input
              className="field"
              type="search"
              placeholder="Suchen…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {loading && costs.length === 0 && <Spinner label="Kosten werden geladen…" />}
          {!loading && filtered.length === 0 &&
            (costs.length > 0 ? (
              <EmptyState title="Nichts gefunden" hint="Keine Rechnung passt zu Suche oder Filter." />
            ) : (
              <EmptyState
                title="Noch keine Rechnungen"
                hint="Beleg fotografieren und die Felder prüfen."
                action={
                  <Link className="btn btn-primary mt-2" to="/kosten/neu?capture=1">
                    Beleg erfassen
                  </Link>
                }
              />
            ))}

          <ul>
            {filtered.map((cost) => (
              <li
                key={cost.id}
                {...rowActions.bind(cost.vendor || 'Rechnung', [
                  {
                    label: 'Löschen',
                    icon: 'trash',
                    danger: true,
                    // the receipts keep their costId, so writing the cost again links them again
                    onSelect: () => undoableDelete('Rechnung gelöscht', () => deleteCost(cost.id), () => saveCost(cost)),
                  },
                ])}
              >
                <Link to={`/kosten/${cost.id}`} className="list-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{cost.vendor || 'ohne Händler'}</span>
                      {(cost.marks ?? []).map((mark) => (
                        <span
                          key={mark}
                          className="shrink-0 rounded border border-accent/40 px-1 text-[10px] leading-4 font-semibold text-accent"
                        >
                          {label('costMarks', mark)}
                        </span>
                      ))}
                      {cost.receiptPhotoIds.length > 0 && (
                        <span className="text-muted shrink-0" title="Mit Beleg">
                          <Icon name="paperclip" className="w-4 h-4" />
                          <span className="sr-only">mit Beleg</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {formatDate(cost.date)} · {cost.category ? label('costCategories', cost.category) : 'ohne Kategorie'}
                      {cost.description ? ` · ${cost.description}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div>{formatEuro(cost.amountGross)}</div>
                    {!isPaid(cost) && (
                      <div className="text-xs text-warn">{label('paymentStatus', cost.paymentStatus)}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {rowActions.sheet}
        </>
      )}

      {tab === 'uebersicht' && (
        <div className="p-3 flex flex-col gap-4 max-w-3xl">
          <div className="card p-4">
            <div className="text-muted text-xs uppercase tracking-wide">Summe</div>
            <div className="text-3xl font-semibold">{formatEuro(total)}</div>
            <div className="text-muted text-sm">{filtered.length} Positionen</div>
          </div>

          <Bars
            title="Nach Kategorie"
            rows={categories.map((bucket) => [bucket.key, bucket.total, bucket.label ?? bucket.key] as BarRow)}
            onPick={(key) => setParams({ ansicht: 'uebersicht', kategorie: key, ...(markFilter ? { kennzeichen: markFilter } : {}) })}
          />
          <Bars title="Nach Monat" rows={months.map((bucket) => [bucket.key, bucket.total, bucket.key] as BarRow)} />

          {tradeBudgets.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm text-muted uppercase tracking-wide mb-3">Gewerke: Budget und Ist</h3>
              <ul className="flex flex-col gap-2">
                {tradeBudgets.map(({ trade, actual, planned, share, over }) => {
                  return (
                    <li key={trade.id}>
                      <div className="flex justify-between text-sm">
                        <span className="truncate pr-2">{trade.name}</span>
                        <span className="text-muted shrink-0">
                          {formatEuro(actual)}
                          {planned ? ` / ${formatEuro(planned)}` : ''}
                        </span>
                      </div>
                      {planned > 0 && (
                        <div className="h-1.5 bg-panel2 rounded mt-1">
                          <div
                            className={`h-full rounded ${over ? 'bg-bad' : 'bg-accent'}`}
                            style={{ width: `${Math.max(share, 0.02) * 100}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Bars({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: BarRow[];
  onPick?: (key: string) => void;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map(([, value]) => value));
  return (
    <div className="card p-4">
      <h3 className={`text-sm text-muted uppercase tracking-wide ${onPick ? '' : 'mb-3'}`}>{title}</h3>
      {onPick && <p className="text-xs text-muted mb-3">Antippen zeigt nur diese Rechnungen.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map(([key, value, text]) => (
          <li key={key}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onPick?.(key)}
              disabled={!onPick}
            >
              <div className="flex justify-between text-sm">
                <span className="truncate pr-2">{text}</span>
                <span className="text-muted shrink-0">{formatEuro(value)}</span>
              </div>
              <div className="h-1.5 bg-panel2 rounded mt-1">
                <div className="h-full rounded bg-accent" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
