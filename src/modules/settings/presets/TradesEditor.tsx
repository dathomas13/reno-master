import { useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useCollection } from '@/data/hooks';
import { COL, type Trade } from '@/data/types';
import { createTrade } from '@/data/repos';
import { findDuplicate, normalizeEntry } from '@/data/presetLists';
import { useTradeUsage } from '@/data/tradeUsage';
import { useOptions } from '@/data/useOptions';
import { formatEuroShort } from '@/lib/money';
import TradeSheet from './TradeSheet';

function byName(a: Trade, b: Trade): number {
  return a.name.localeCompare(b.name, 'de');
}

export default function TradesEditor() {
  const { data: trades } = useCollection<Trade>(COL.trades);
  const usage = useTradeUsage();
  const { label } = useOptions();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const active = useMemo(() => trades.filter((t) => !t.archived).sort(byName), [trades]);
  const hidden = useMemo(() => trades.filter((t) => t.archived).sort(byName), [trades]);
  const editing = trades.find((t) => t.id === editId) ?? null;

  function add() {
    const name = normalizeEntry(draft);
    if (!name) return;
    if (findDuplicate(trades.map((t) => t.name), name)) {
      setError('Dieses Gewerk gibt es schon.');
      return;
    }
    createTrade(name);
    setDraft('');
    setError('');
  }

  function row(trade: Trade, muted: boolean) {
    const parts = [
      label('tradeStatus', trade.status),
      label('priority', trade.priority),
      typeof trade.budgetPlanned === 'number' ? formatEuroShort(trade.budgetPlanned) : null,
      `${usage.get(trade.id) ?? 0}×`,
    ].filter(Boolean);
    return (
      <button
        key={trade.id}
        type="button"
        className={`list-row w-full text-left min-h-14 ${muted ? 'text-muted' : ''}`}
        aria-label={`Gewerk ${trade.name} bearbeiten`}
        onClick={() => setEditId(trade.id)}
      >
        <span className="flex-1 min-w-0">
          <span className="block truncate">{trade.name}</span>
          <span className="block text-xs text-muted truncate">{parts.join(' · ')}</span>
        </span>
        <span className="text-muted">›</span>
      </button>
    );
  }

  return (
    <div>
      <TopBar
        title="Gewerke"
        subtitle={`${active.length} aktiv · ${hidden.length} ausgeblendet`}
        back="/einstellungen/voreinstellungen"
      />
      <form
        className="flex gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          className="field flex-1"
          aria-label="Neues Gewerk"
          placeholder="Neues Gewerk …"
          value={draft}
          maxLength={60}
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
          }}
        />
        <button type="submit" className="btn btn-primary min-h-11 min-w-11" aria-label="Gewerk hinzufügen">
          ＋
        </button>
      </form>
      {error && (
        <p role="alert" className="px-3 pb-2 text-sm text-bad">
          {error}
        </p>
      )}
      <div>{active.map((trade) => row(trade, false))}</div>
      {hidden.length > 0 && (
        <>
          <div className="section-title">AUSGEBLENDET</div>
          <div>{hidden.map((trade) => row(trade, true))}</div>
        </>
      )}
      <TradeSheet
        key={editing?.id ?? 'none'}
        trade={editing}
        trades={trades}
        usage={editing ? (usage.get(editing.id) ?? 0) : 0}
        onClose={() => setEditId(null)}
      />
    </div>
  );
}
