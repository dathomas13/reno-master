import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/Fields';
import { Sheet } from '@/components/Sheet';
import { UndoBar } from '@/components/UndoBar';
import { findDuplicate, moveEntry, normalizeEntry, sortAlpha } from '@/data/presetLists';
import { OrderList } from '../OrderList';
import { PresetRow } from './PresetRow';
import { RenameSpreadSheet } from './RenameSpreadSheet';

export interface PresetListEditorProps {
  items: string[];
  /** records per value, when known */
  usage?: Map<string, number>;
  singular: string;
  placeholder: string;
  maxLength?: number;
  /** number of default values, named in the reset confirmation */
  seedCount?: number;
  onAdd(value: string): void;
  /** `everywhere`: carry the new name into the entries that use the old one */
  onRename(from: string, to: string, everywhere: boolean): void;
  /** resolves with the old index of the value (for undo), -1 when it was not there */
  onRemove(value: string): Promise<number>;
  onRestore?(value: string, index: number): void;
  onReorder(next: string[]): void;
  onReset?(): void;
  leading?(value: string): ReactNode;
  /** the ⋯ sheet is opened by the page's top bar */
  menuOpen?: boolean;
  onMenuClose?(): void;
}

interface Removed {
  value: string;
  index: number;
  message: string;
}

function usedBy(count: number): string {
  return count === 1 ? ' 1 Eintrag behält den Wert.' : ` ${count} Einträge behalten den Wert.`;
}

/** the generic editor of one pick list: add, rename in place, remove with undo, sort */
export function PresetListEditor({
  items,
  usage,
  singular,
  placeholder,
  maxLength = 60,
  seedCount,
  onAdd,
  onRename,
  onRemove,
  onRestore,
  onReorder,
  onReset,
  leading,
  menuOpen = false,
  onMenuClose,
}: PresetListEditorProps) {
  const [mode, setMode] = useState<'edit' | 'sort'>('edit');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function closeMenu() {
    onMenuClose?.();
  }

  function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    const clean = normalizeEntry(draft, maxLength);
    if (!clean) return;
    const duplicate = findDuplicate(items, clean);
    if (duplicate) {
      setError(`„${duplicate}“ steht schon in der Liste.`);
      return;
    }
    onAdd(clean);
    setDraft('');
    setError(null);
  }

  function validateRename(from: string, candidate: string): string | null {
    if (!normalizeEntry(candidate, maxLength)) return `Der Name darf nicht leer sein (höchstens ${maxLength} Zeichen).`;
    const duplicate = findDuplicate(items, candidate, from);
    return duplicate ? `„${duplicate}“ steht schon in der Liste.` : null;
  }

  function rename(from: string, to: string) {
    if ((usage?.get(from) ?? 0) > 0) setPending({ from, to });
    else onRename(from, to, false);
  }

  async function remove(value: string) {
    const count = usage?.get(value) ?? 0;
    const index = await onRemove(value);
    if (index < 0) return;
    setRemoved({ value, index, message: `„${value}“ entfernt.${count > 0 ? usedBy(count) : ''}` });
  }

  function move(value: string, delta: -1 | 1) {
    onReorder(moveEntry(items, items.indexOf(value), delta));
  }

  const hasItems = items.length > 0;

  return (
    <div>
      <form onSubmit={submit} className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 bg-bg px-3 pt-3 pb-2">
        <div className="flex gap-2">
          <input
            className="field flex-1 min-w-0"
            value={draft}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={`${singular} hinzufügen`}
            aria-invalid={error ? true : undefined}
            enterKeyHint="done"
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
          <button
            type="submit"
            className="btn btn-primary w-11 px-0 text-xl"
            aria-label={`${singular} hinzufügen`}
            disabled={!draft.trim()}
          >
            ＋
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad mt-1.5">
            {error}
          </p>
        )}
      </form>

      {hasItems && (
        <div className="px-3 pb-2">
          <div role="group" aria-label="Ansicht" className="grid grid-cols-2 rounded-xl border border-line overflow-hidden">
            {(['edit', 'sort'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                className={`min-h-11 text-sm ${mode === value ? 'bg-accent/15 text-accent font-semibold' : 'text-muted'}`}
                onClick={() => setMode(value)}
              >
                {value === 'edit' ? 'Bearbeiten' : 'Sortieren'}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasItems ? (
        <EmptyState
          title="Noch keine Einträge"
          hint="Oben einen Namen eintragen."
          action={
            onReset && (
              <button type="button" className="btn mt-2" onClick={onReset}>
                Standardwerte übernehmen
              </button>
            )
          }
        />
      ) : mode === 'edit' ? (
        <ul className="mx-3 card overflow-hidden">
          {items.map((value) => (
            <PresetRow
              key={value}
              value={value}
              singular={singular}
              count={usage?.get(value)}
              leading={leading?.(value)}
              maxLength={maxLength}
              validate={(candidate) => validateRename(value, candidate)}
              onRename={(next) => rename(value, next)}
              onRemove={() => void remove(value)}
            />
          ))}
        </ul>
      ) : (
        <div className="mx-3 flex flex-col gap-3">
          <div className="card px-4 py-1">
            <OrderList
              items={items.map((value) => ({ id: value, label: value }))}
              canMove={(id, delta) => {
                const target = items.indexOf(id) + delta;
                return target >= 0 && target < items.length;
              }}
              onMove={move}
            />
          </div>
          <button type="button" className="btn" onClick={() => onReorder(sortAlpha(items))}>
            Alphabetisch sortieren
          </button>
        </div>
      )}

      {pending && (
        <RenameSpreadSheet
          open
          from={pending.from}
          to={pending.to}
          count={usage?.get(pending.from) ?? 0}
          onClose={() => setPending(null)}
          onEverywhere={() => {
            onRename(pending.from, pending.to, true);
            setPending(null);
          }}
          onListOnly={() => {
            onRename(pending.from, pending.to, false);
            setPending(null);
          }}
        />
      )}

      <Sheet open={menuOpen && !confirmReset} onClose={closeMenu} title="Liste" doneLabel="Abbrechen">
        <div className="p-4 flex flex-col gap-3">
          <button
            type="button"
            className="btn"
            disabled={items.length < 2}
            onClick={() => {
              onReorder(sortAlpha(items));
              closeMenu();
            }}
          >
            Alphabetisch sortieren
          </button>
          {onReset && (
            <button type="button" className="btn" onClick={() => setConfirmReset(true)}>
              Auf Standard zurücksetzen …
            </button>
          )}
        </div>
      </Sheet>

      <Sheet
        open={menuOpen && confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Auf Standard zurücksetzen"
        doneLabel="Abbrechen"
      >
        <div className="p-4 flex flex-col gap-3">
          <p>
            {`Die Liste wird durch die ${seedCount === undefined ? '' : `${seedCount} `}Standardwerte ersetzt. Bestehende Einträge behalten ihre Werte.`}
          </p>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onReset?.();
              setConfirmReset(false);
              closeMenu();
            }}
          >
            Zurücksetzen
          </button>
          <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
            Abbrechen
          </button>
        </div>
      </Sheet>

      {removed && (
        <UndoBar
          message={removed.message}
          onAction={() => onRestore?.(removed.value, removed.index)}
          onClose={() => setRemoved(null)}
        />
      )}
    </div>
  );
}
