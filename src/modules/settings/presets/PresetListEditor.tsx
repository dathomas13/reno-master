import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/Fields';
import { Sheet } from '@/components/Sheet';
import { UndoBar } from '@/components/UndoBar';
import { findDuplicate, normalizeEntry } from '@/data/presetLists';
import { isFixedSet, type OptionEntry, type OptionSetKey } from '@/data/options';
import { OrderList } from '../OrderList';
import { PresetRow } from './PresetRow';
import { Icon } from '@/components/Icon';

export interface PresetListEditorProps {
  setKey: OptionSetKey;
  /** every entry of the set in order, hidden ones included */
  entries: OptionEntry[];
  /** records per entry id, when known */
  usage?: Map<string, number>;
  singular: string;
  placeholder: string;
  maxLength?: number;
  /** returns the id of the new (or shown again) entry, '' when refused */
  onAdd(label: string): string;
  onRename(id: string, label: string): void;
  /** returns the old position (for undo), -1 when refused */
  onArchive(id: string): number;
  onUnarchive(id: string): void;
  onMove(id: string, delta: -1 | 1): void;
  onSortAlpha(): void;
  onReset(): void;
  leading?(entry: OptionEntry): ReactNode;
  /** the ⋯ sheet is opened by the page's top bar */
  menuOpen?: boolean;
  onMenuClose?(): void;
}

interface Hidden {
  id: string;
  message: string;
}

function usedBy(count: number): string {
  return count === 1 ? ' 1 Eintrag zeigt ihn weiter.' : ` ${count} Einträge zeigen ihn weiter.`;
}

/**
 * The editor of one option set: add, rename in place (the label only), hide with undo,
 * sort. Fixed sets (the app's logic depends on their ids) can only be renamed and sorted.
 */
export function PresetListEditor({
  setKey,
  entries,
  usage,
  singular,
  placeholder,
  maxLength = 60,
  onAdd,
  onRename,
  onArchive,
  onUnarchive,
  onMove,
  onSortAlpha,
  onReset,
  leading,
  menuOpen = false,
  onMenuClose,
}: PresetListEditorProps) {
  const fixed = isFixedSet(setKey);
  const [mode, setMode] = useState<'edit' | 'sort'>('edit');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hiddenNote, setHiddenNote] = useState<Hidden | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const visible = entries.filter((entry) => !entry.archived);
  const hidden = entries.filter((entry) => entry.archived);

  function closeMenu() {
    onMenuClose?.();
  }

  function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    const clean = normalizeEntry(draft, maxLength);
    if (!clean) return;
    const duplicate = findDuplicate(
      visible.map((entry) => entry.label),
      clean,
    );
    if (duplicate) {
      setError(`„${duplicate}“ steht schon in der Liste.`);
      return;
    }
    if (!onAdd(clean)) {
      setError('Der Name ist nicht möglich.');
      return;
    }
    setDraft('');
    setError(null);
  }

  function validateRename(entry: OptionEntry, candidate: string): string | null {
    if (!normalizeEntry(candidate, maxLength)) return `Der Name darf nicht leer sein (höchstens ${maxLength} Zeichen).`;
    const duplicate = findDuplicate(
      entries.filter((other) => other.id !== entry.id).map((other) => other.label),
      candidate,
    );
    return duplicate ? `„${duplicate}“ steht schon in der Liste.` : null;
  }

  function hide(entry: OptionEntry) {
    const count = usage?.get(entry.id) ?? 0;
    if (onArchive(entry.id) < 0) return;
    setHiddenNote({ id: entry.id, message: `„${entry.label}“ ausgeblendet.${count > 0 ? usedBy(count) : ''}` });
  }

  function row(entry: OptionEntry) {
    return (
      <PresetRow
        key={entry.id}
        entry={entry}
        singular={singular}
        count={usage?.get(entry.id)}
        leading={leading?.(entry)}
        maxLength={maxLength}
        canHide={!fixed}
        validate={(candidate) => validateRename(entry, candidate)}
        onRename={(next) => onRename(entry.id, next)}
        onHide={() => hide(entry)}
        onShow={() => onUnarchive(entry.id)}
      />
    );
  }

  const indexOfVisible = (id: string) => visible.findIndex((entry) => entry.id === id);

  return (
    <div>
      {fixed ? (
        <p className="px-4 pt-3 pb-1 text-sm text-muted">
          Die App braucht diese Zustände – sie lassen sich umbenennen, aber nicht löschen.
        </p>
      ) : (
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
              className="btn btn-primary w-11 px-0"
              aria-label={`${singular} hinzufügen`}
              disabled={!draft.trim()}
            >
              <Icon name="plus" />
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-bad mt-1.5">
              {error}
            </p>
          )}
        </form>
      )}

      {visible.length > 1 && (
        <div className="px-3 py-2">
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

      {visible.length === 0 ? (
        <EmptyState
          title={hidden.length > 0 ? 'Alles ausgeblendet' : 'Noch keine Einträge'}
          hint={hidden.length > 0 ? 'Unten wieder anzeigen.' : 'Oben einen Namen eintragen.'}
          action={
            hidden.length === 0 && (
              <button type="button" className="btn mt-2" onClick={onReset}>
                Standardwerte übernehmen
              </button>
            )
          }
        />
      ) : mode === 'edit' || visible.length < 2 ? (
        <ul className="mx-3 card overflow-hidden">{visible.map(row)}</ul>
      ) : (
        <div className="mx-3 card px-4 py-1">
          <OrderList
            items={visible.map((entry) => ({ id: entry.id, label: entry.label }))}
            canMove={(id, delta) => {
              const target = indexOfVisible(id) + delta;
              return target >= 0 && target < visible.length;
            }}
            onMove={onMove}
          />
        </div>
      )}

      {hidden.length > 0 && (
        <>
          <h2 className="section-title">AUSGEBLENDET</h2>
          <ul className="mx-3 card overflow-hidden">{hidden.map(row)}</ul>
        </>
      )}

      <Sheet open={menuOpen && !confirmReset} onClose={closeMenu} title="Liste" doneLabel="Abbrechen">
        <div className="p-4 flex flex-col gap-3">
          {fixed ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onReset();
                closeMenu();
              }}
            >
              Standardnamen wiederherstellen
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={visible.length < 2}
                onClick={() => {
                  onSortAlpha();
                  closeMenu();
                }}
              >
                Alphabetisch sortieren
              </button>
              <button type="button" className="btn" onClick={() => setConfirmReset(true)}>
                Auf Standard zurücksetzen …
              </button>
            </>
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
            Die Startwerte erscheinen wieder mit ihren Startnamen und in der Startreihenfolge. Eigene Einträge
            werden ausgeblendet. Bestehende Einträge in der App behalten ihren Wert.
          </p>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onReset();
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

      {hiddenNote && (
        <UndoBar
          message={hiddenNote.message}
          onAction={() => onUnarchive(hiddenNote.id)}
          onClose={() => setHiddenNote(null)}
        />
      )}
    </div>
  );
}
