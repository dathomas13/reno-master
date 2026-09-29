export interface OrderListItem {
  id: string;
  label: string;
  checked: boolean;
  /** the checkbox cannot be ticked, e.g. because the bottom bar is full */
  locked?: boolean;
}

/** a sortable list with one checkbox per row: arrows for the order, the box for on/off */
export function OrderList({
  items,
  checkLabel,
  onToggle,
  onMove,
}: {
  items: OrderListItem[];
  /** accessible name of the checkbox, e.g. "in der Leiste" */
  checkLabel: string;
  onToggle: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
}) {
  const arrow =
    'w-11 h-11 flex items-center justify-center text-muted hover:text-ink disabled:opacity-30';
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((item, index) => (
        <li key={item.id} className="flex items-center gap-2 py-1">
          <label className="flex items-center gap-3 flex-1 min-w-0 py-2">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[#c9a86a]"
              checked={item.checked}
              disabled={!item.checked && item.locked}
              aria-label={`${item.label} ${checkLabel}`}
              onChange={() => onToggle(item.id)}
            />
            <span className="truncate">{item.label}</span>
          </label>
          <button
            type="button"
            className={arrow}
            aria-label={`${item.label} nach oben`}
            disabled={index === 0}
            onClick={() => onMove(item.id, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className={arrow}
            aria-label={`${item.label} nach unten`}
            disabled={index === items.length - 1}
            onClick={() => onMove(item.id, 1)}
          >
            ↓
          </button>
        </li>
      ))}
    </ul>
  );
}
