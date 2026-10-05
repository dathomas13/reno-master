import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type Trade } from '@/data/types';
import { useOptions } from '@/data/useOptions';
import { isPaid } from '@/data/options';
import { orderBy } from '@/firebase/db';
import { formatEuro, formatAmount } from '@/lib/money';
import { formatDate, monthKey, today } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';
import {
  sumGross,
  byCategory,
  byMonth,
  totalForMonth,
  budgetPerTrade,
  toCsv,
  NO_CATEGORY,
  sortNewestFirst,
} from '@/data/costAggregation';
import { isNative } from '@/platform';

type Tab = 'liste' | 'uebersicht';
/** key, sum, text to show */
type BarRow = [string, number, string];

export default function CostsPage() {
  const [params, setParams] = useSearchParams();
  const { data: rawCosts, loading } = useCollection<Cost>(COL.costs, [orderBy('date', 'desc')]);
  const costs = useMemo(() => sortNewestFirst(rawCosts), [rawCosts]);
  const { data: trades } = useCollection<Trade>(COL.trades);
  const { shortLabel: roomLabel, matches } = useRooms();
  const { sets, label, resolve } = useOptions();
  const [tab, setTab] = useState<Tab>('liste');
  const [search, setSearch] = useState('');

  const roomFilter = params.get('raum');
  const categoryFilter = params.get('kategorie');
  const tradeFilter = params.get('gewerk');

  // the filter carries an id; an old text in the address or in a record resolves to the same one
  const categoryKey = categoryFilter ? (resolve('costCategories', categoryFilter)?.id ?? categoryFilter) : null;
  const categoryId = useCallback(
    (stored: string) => (stored.trim() ? (resolve('costCategories', stored)?.id ?? stored) : NO_CATEGORY),
    [resolve],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return costs.filter((cost) => {
      if (roomFilter && !matches(cost.roomIds, roomFilter)) return false;
      if (categoryKey && categoryId(cost.category) !== categoryKey) return false;
      if (tradeFilter && cost.tradeId !== tradeFilter) return false;
      if (!needle) return true;
      return [cost.vendor, cost.description, label('costCategories', cost.category), cost.invoiceNumber]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [costs, search, roomFilter, categoryKey, tradeFilter, matches, categoryId, label]);

  const total = sumGross(filtered);
  const thisMonth = totalForMonth(costs, monthKey(today()));
  const categories = useMemo(() => byCategory(filtered, sets), [filtered, sets]);
  const months = useMemo(() => byMonth(filtered), [filtered]);
  const tradeBudgets = useMemo(() => budgetPerTrade(filtered, trades), [filtered, trades]);
  const canDownloadCsv = !isNative();

  function exportCsv() {
    const blob = new Blob([toCsv(filtered, formatAmount, sets)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kosten-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <TopBar
        title="Kosten"
        subtitle={`${formatEuro(total)} gesamt · ${formatEuro(thisMonth)} diesen Monat`}
        action={
          <Link className="btn btn-primary px-3 min-h-0 py-2" to="/kosten/neu">
            Neu
          </Link>
        }
      />

      <div className="flex gap-2 p-3">
        {(['liste', 'uebersicht'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`chip ${tab === item ? 'chip-on' : ''}`}
            onClick={() => setTab(item)}
          >
            {item === 'liste' ? 'Liste' : 'Übersicht'}
          </button>
        ))}
        <div className="flex-1" />
        {canDownloadCsv && (
          <button type="button" className="chip" onClick={exportCsv}>
            CSV
          </button>
        )}
      </div>

      {(roomFilter || categoryFilter || tradeFilter) && (
        <div className="px-3 pb-2">
          <button
            type="button"
            className="chip chip-on"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Filter:{' '}
            {roomFilter
              ? roomLabel(roomFilter)
              : tradeFilter
                ? (trades.find((trade) => trade.id === tradeFilter)?.name ?? 'Gewerk')
                : label('costCategories', categoryFilter ?? '')}{' '}
            ×
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

          {loading && costs.length === 0 && <Spinner />}
          {!loading && filtered.length === 0 && (
            <EmptyState title="Keine Rechnungen" hint="Beleg fotografieren und die Felder prüfen." />
          )}

          <ul>
            {filtered.map((cost) => (
              <li key={cost.id}>
                <Link to={`/kosten/${cost.id}`} className="list-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{cost.vendor || 'ohne Händler'}</span>
                      {cost.receiptPhotoIds.length > 0 && <span className="text-muted text-xs">📎</span>}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {formatDate(cost.date)} · {cost.category ? label('costCategories', cost.category) : 'ohne Kategorie'}
                      {cost.description ? ` · ${cost.description}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div>{formatEuro(cost.amountGross)}</div>
                    {!isPaid(cost, sets) && (
                      <div className="text-[11px] text-warn">{label('paymentStatus', cost.paymentStatus)}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
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
            onPick={(key) => setParams({ kategorie: key })}
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
      <h3 className="text-sm text-muted uppercase tracking-wide mb-3">{title}</h3>
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
