import { useEffect, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { ChipSelect, Field } from '@/components/Fields';
import { PRIORITY, TRADE_STATUS, type Priority, type Trade, type TradeStatus } from '@/data/types';
import { deleteTrade, saveTrade, setTradeArchived } from '@/data/repos';
import { findDuplicate, normalizeEntry } from '@/data/presetLists';
import { formatAmount, parseAmount, round2 } from '@/lib/money';

interface TradeSheetProps {
  trade: Trade | null;
  /** all trades, for the duplicate check */
  trades: Trade[];
  usage: number;
  onClose(): void;
}

function amountText(value: number | undefined): string {
  return typeof value === 'number' ? formatAmount(value) : '';
}

/** edit one trade; "Fertig" saves, hiding and deleting act at once */
export default function TradeSheet({ trade, trades, usage, onClose }: TradeSheetProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<TradeStatus>('Noch offen');
  const [priority, setPriority] = useState<Priority>('Mittel');
  const [budget, setBudget] = useState('');
  const [offer, setOffer] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trade) return;
    setName(trade.name);
    setStatus(trade.status);
    setPriority(trade.priority);
    setBudget(amountText(trade.budgetPlanned));
    setOffer(amountText(trade.offer));
    setNotes(trade.notes ?? '');
    setError('');
    // only when another trade is opened, not on every snapshot of the same one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id]);

  if (!trade) return null;

  function save() {
    if (!trade) return;
    const clean = normalizeEntry(name);
    if (!clean) {
      setError('Der Name darf nicht leer sein.');
      return;
    }
    const others = trades.filter((other) => other.id !== trade.id).map((other) => other.name);
    if (findDuplicate(others, clean)) {
      setError('Dieses Gewerk gibt es schon.');
      return;
    }
    const budgetValue = budget.trim() ? parseAmount(budget) : undefined;
    const offerValue = offer.trim() ? parseAmount(offer) : undefined;
    if ((budget.trim() && budgetValue === null) || (offer.trim() && offerValue === null)) {
      setError('Betrag nicht lesbar.');
      return;
    }
    saveTrade(trade.id, {
      name: clean,
      status,
      priority,
      budgetPlanned: budgetValue == null ? undefined : round2(budgetValue),
      offer: offerValue == null ? undefined : round2(offerValue),
      notes: notes.trim() || undefined,
    });
    onClose();
  }

  function toggleArchived() {
    if (!trade) return;
    setTradeArchived(trade.id, !trade.archived);
    onClose();
  }

  function remove() {
    if (!trade || usage > 0) return;
    if (!window.confirm(`„${trade.name}“ endgültig löschen?`)) return;
    deleteTrade(trade.id);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} onDone={save} title="Gewerk">
      <div className="space-y-4 pb-4">
        <Field label="Name">
          <input
            className="field"
            aria-label="Name des Gewerks"
            value={name}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <Field label="Status">
          <ChipSelect
            options={[...TRADE_STATUS]}
            value={[status]}
            multiple={false}
            allowEmpty={false}
            onChange={(value) => value[0] && setStatus(value[0])}
          />
        </Field>
        <Field label="Priorität">
          <ChipSelect
            options={[...PRIORITY]}
            value={[priority]}
            multiple={false}
            allowEmpty={false}
            onChange={(value) => value[0] && setPriority(value[0])}
          />
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Budget geplant">
              <input
                className="field text-right"
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Budget geplant in Euro"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Angebot">
              <input
                className="field text-right"
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Angebot in Euro"
                value={offer}
                onChange={(event) => setOffer(event.target.value)}
              />
            </Field>
          </div>
        </div>
        <Field label="Notizen">
          <textarea
            className="field min-h-24"
            aria-label="Notizen"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <div className="pt-2 space-y-2">
          <button type="button" className="btn w-full min-h-11" onClick={toggleArchived}>
            {trade.archived ? 'Wieder anzeigen' : 'Ausblenden'}
          </button>
          {usage === 0 ? (
            <button type="button" className="btn btn-danger w-full min-h-11" onClick={remove}>
              Löschen
            </button>
          ) : (
            <p className="text-xs text-muted">Wird {usage}× verwendet und kann nur ausgeblendet werden.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
