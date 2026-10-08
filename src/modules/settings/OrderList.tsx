import { Fragment } from 'react';
import { Icon } from '@/components/Icon';

export interface OrderListItem {
  id: string;
  label: string;
  /** only read when the list has checkboxes */
  checked?: boolean;
}

/**
 * A sortable list: arrows for the order, optionally a checkbox per row for on/off, and
 * optionally a line after the first `divider.after` rows that splits the list in two.
 */
export function OrderList({
  items,
  canMove,
  onMove,
  check,
  divider,
}: {
  items: OrderListItem[];
  canMove: (id: string, delta: -1 | 1) => boolean;
  onMove: (id: string, delta: -1 | 1) => void;
  /** checkbox per row; `label` completes its accessible name, e.g. "auf der Startseite" */
  check?: { label: string; onToggle: (id: string) => void };
  divider?: { after: number; above: string; below: string };
}) {
  const arrow = 'w-11 h-11 flex items-center justify-center text-muted hover:text-ink disabled:opacity-30';
  const line = divider && (
    <li role="separator" className="flex items-center gap-2 py-2 text-xs text-muted">
      <span className="flex-1 border-t-2 border-accent" />
      <span className="shrink-0">
        ↑ {divider.above} · {divider.below} ↓
      </span>
      <span className="flex-1 border-t-2 border-accent" />
    </li>
  );
  return (
    <ul className="flex flex-col">
      {divider?.after === 0 && line}
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <li className="flex items-center gap-2 py-1 border-b border-line last:border-0">
            {check ? (
              <label className="flex items-center gap-3 flex-1 min-w-0 py-2">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-accent"
                  checked={item.checked ?? false}
                  aria-label={`${item.label} ${check.label}`}
                  onChange={() => check.onToggle(item.id)}
                />
                <span className="truncate">{item.label}</span>
              </label>
            ) : (
              <span className="flex-1 min-w-0 py-2 truncate">{item.label}</span>
            )}
            <button
              type="button"
              className={arrow}
              aria-label={`${item.label} nach oben`}
              disabled={!canMove(item.id, -1)}
              onClick={() => onMove(item.id, -1)}
            >
              <Icon name="chevronLeft" className="w-5 h-5 rotate-90" />
            </button>
            <button
              type="button"
              className={arrow}
              aria-label={`${item.label} nach unten`}
              disabled={!canMove(item.id, 1)}
              onClick={() => onMove(item.id, 1)}
            >
              <Icon name="chevronDown" className="w-5 h-5" />
            </button>
          </li>
          {divider && divider.after > 0 && index === divider.after - 1 && line}
        </Fragment>
      ))}
    </ul>
  );
}
