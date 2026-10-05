import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OptionEntry } from '@/data/options';

interface PresetRowProps {
  entry: OptionEntry;
  singular: string;
  /** how many records carry the entry; hidden while unknown or zero */
  count?: number;
  leading?: ReactNode;
  maxLength: number;
  /** fixed sets cannot hide an entry */
  canHide: boolean;
  /** an error text for a candidate name, or null when it is fine */
  validate(candidate: string): string | null;
  onRename(next: string): void;
  onHide(): void;
  onShow(): void;
}

/** one entry of a list: tap to rename in place (the label only), trash button to hide, or show again */
export function PresetRow({
  entry,
  singular,
  count,
  leading,
  maxLength,
  canHide,
  validate,
  onRename,
  onHide,
  onShow,
}: PresetRowProps) {
  const value = entry.label;
  const hidden = entry.archived === true;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // blur follows the tap on ✓/✕; the flag keeps it from saving a second time or after Esc
  const settled = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function start() {
    settled.current = false;
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    settled.current = true;
    setEditing(false);
    setError(null);
  }

  function save() {
    if (settled.current) return;
    const next = draft.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (next === value) {
      cancel();
      return;
    }
    const problem = validate(next);
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    settled.current = true;
    setEditing(false);
    onRename(next);
  }

  const iconButton = 'w-11 h-11 shrink-0 flex items-center justify-center rounded-xl';
  // keep the focus in the field so the tap on a button does not blur (and save) first
  const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();
  const countText = count !== undefined && count > 0 ? <span className="text-sm text-muted tabular-nums shrink-0">{count}×</span> : null;

  return (
    <li className="border-b border-line/60 last:border-0">
      <div className="flex items-center gap-2 pl-4 pr-1 min-h-12">
        {leading && <span className="w-6 shrink-0 text-center">{leading}</span>}
        {editing ? (
          <>
            <input
              ref={inputRef}
              className="field flex-1 min-w-0 !py-1.5"
              value={draft}
              maxLength={maxLength}
              aria-label={`${value} umbenennen`}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  save();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancel();
                }
              }}
              onBlur={save}
            />
            <button
              type="button"
              className={`${iconButton} text-accent`}
              aria-label={`${singular} speichern`}
              onMouseDown={keepFocus}
              onClick={save}
            >
              ✓
            </button>
            <button
              type="button"
              className={`${iconButton} text-muted`}
              aria-label="Umbenennen abbrechen"
              onMouseDown={keepFocus}
              onClick={cancel}
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`flex-1 min-w-0 min-h-12 text-left truncate ${hidden ? 'text-muted' : ''}`}
              aria-label={`${value} umbenennen`}
              onClick={start}
            >
              {value}
            </button>
            {countText}
            {hidden ? (
              <button
                type="button"
                className="btn btn-ghost min-h-11 shrink-0 px-3 text-accent"
                aria-label={`${value} wieder anzeigen`}
                onClick={onShow}
              >
                Wieder anzeigen
              </button>
            ) : (
              canHide && (
                <button
                  type="button"
                  className={`${iconButton} text-muted hover:text-bad`}
                  aria-label={`${value} ausblenden`}
                  onClick={onHide}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                </button>
              )
            )}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="px-4 pb-2 text-sm text-bad">
          {error}
        </p>
      )}
    </li>
  );
}
