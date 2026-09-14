import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type Trade } from '@/data/types';
import { orderBy } from '@/firebase/db';
import { formatEuro, formatAmount } from '@/lib/money';
import { formatDate, monthKey, today } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';

type Tab = 'liste' | 'uebersicht';

export default function CostsPage() {
  const [params, setParams] = useSearchParams();
  const { data: costs, loading } = useCollection<Cost>(COL.costs, [orderBy('date', 'desc')]);
  const { data: trades } = useCollection<Trade>(COL.trades);
  const { name: roomName } = useRooms();
  const [tab, setTab] = useState<Tab>('liste');
  const [search, setSearch] = useState('');

  const roomFilter = params.get('raum');
  const categoryFilter = params.get('kategorie');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return costs.filter((cost) => {
      if (roomFilter && !cost.roomIds.includes(roomFilter)) return false;
      if (categoryFilter && cost.category !== categoryFilter) return false;
      if (!needle) return true;
      return [cost.vendor, cost.description, cost.category, cost.invoiceNumber]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [costs, search, roomFilter, categoryFilter]);

  const total = filtered.reduce((sum, cost) => sum + (cost.amountGross || 0), 0);
  const thisMonth = costs
    .filter((cost) => monthKey(cost.date) === monthKey(today()))
    .reduce((sum, cost) => sum + (cost.amountGross || 0), 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const cost of filtered) {
      map.set(cost.category || 'ohne Kategorie', (map.get(cost.category || 'ohne Kategorie') ?? 0) + cost.amountGross);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const cost of filtered) map.set(monthKey(cost.date), (map.get(monthKey(cost.date)) ?? 0) + cost.amountGross);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const byTrade = useMemo(() => {
    const map = new Map<string, number>();
    for (const cost of filtered) {
      if (!cost.tradeId) continue;
      map.set(cost.tradeId, (map.get(cost.tradeId) ?? 0) + cost.amountGross);
    }
    return trades
      .map((trade) => ({ trade, actual: map.get(trade.id) ?? 0 }))
      .filter((row) => row.actual > 0 || (row.trade.budgetPlanned ?? 0) > 0)
      .sort((a, b) => b.actual - a.actual);
  }, [filtered, trades]);

  function exportCsv() {
    const header = ['Datum', 'Händler', 'Beschreibung', 'Kategorie', 'Brutto', 'Netto', 'MwSt-Satz', 'Status', 'Rechnungsnr'];
    const rows = filtered.map((cost) => [
      cost.date,
      cost.vendor,
      cost.description,
      cost.category,
      formatAmount(cost.amountGross),
      cost.amountNet !== undefined ? formatAmount(cost.amountNet) : '',
      cost.vatRate ?? '',
      cost.paymentStatus,
      cost.invoiceNumber ?? '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
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
        <button type="button" className="chip" onClick={exportCsv}>
          CSV
        </button>
      </div>

      {(roomFilter || categoryFilter) && (
        <div className="px-3 pb-2">
          <button
            type="button"
            className="chip chip-on"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Filter: {roomFilter ? roomName(roomFilter) : categoryFilter} ×
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
                      {formatDate(cost.date)} · {cost.category || 'ohne Kategorie'}
                      {cost.description ? ` · ${cost.description}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div>{formatEuro(cost.amountGross)}</div>
                    {cost.paymentStatus !== 'bezahlt' && (
                      <div className="text-[11px] text-warn">{cost.paymentStatus}</div>
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

          <Bars title="Nach Kategorie" rows={byCategory} onPick={(key) => setParams({ kategorie: key })} />
          <Bars title="Nach Monat" rows={byMonth} />

          {byTrade.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm text-muted uppercase tracking-wide mb-3">Gewerke: Budget und Ist</h3>
              <ul className="flex flex-col gap-2">
                {byTrade.map(({ trade, actual }) => {
                  const budget = trade.budgetPlanned ?? 0;
                  const share = budget ? Math.min(actual / budget, 1) : 0;
                  return (
                    <li key={trade.id}>
                      <div className="flex justify-between text-sm">
                        <span className="truncate pr-2">{trade.name}</span>
                        <span className="text-muted shrink-0">
                          {formatEuro(actual)}
                          {budget ? ` / ${formatEuro(budget)}` : ''}
                        </span>
                      </div>
                      {budget > 0 && (
                        <div className="h-1.5 bg-panel2 rounded mt-1">
                          <div
                            className={`h-full rounded ${actual > budget ? 'bg-bad' : 'bg-accent'}`}
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
  rows: [string, number][];
  onPick?: (key: string) => void;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map(([, value]) => value));
  return (
    <div className="card p-4">
      <h3 className="text-sm text-muted uppercase tracking-wide mb-3">{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map(([key, value]) => (
          <li key={key}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onPick?.(key)}
              disabled={!onPick}
            >
              <div className="flex justify-between text-sm">
                <span className="truncate pr-2">{key}</span>
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
