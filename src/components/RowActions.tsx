import { useCallback, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Icon, type IconName } from './Icon';

export interface RowAction {
  label: string;
  icon: IconName;
  onSelect(): void;
  /** red, for what removes something (it still comes with "Rückgängig") */
  danger?: boolean;
}

interface Open {
  title: string;
  actions: RowAction[];
}

const HOLD_MS = 500;
const SLOP_PX = 10;

/**
 * Long-pressing an entry of a list opens a small menu with what can be done to it
 * (Löschen, Erledigt, Anheften …). Not a swipe on the row: sideways swipes switch the
 * tabs of the area, and the two would fight over every touch.
 *
 * `bind(title, actions)` goes onto the row, `sheet` once into the page.
 */
export function useRowActions() {
  const [open, setOpen] = useState<Open | null>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  const bind = useCallback(
    (title: string, actions: RowAction[]) => ({
      onPointerDown(event: PointerEvent) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        cancel();
        fired.current = false;
        const timer = window.setTimeout(() => {
          press.current = null;
          fired.current = true;
          navigator.vibrate?.(12);
          setOpen({ title, actions });
        }, HOLD_MS);
        press.current = { x: event.clientX, y: event.clientY, timer };
      },
      onPointerMove(event: PointerEvent) {
        const start = press.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // the tap that ends a long press must not also open the entry
      onClickCapture(event: MouseEvent) {
        if (!fired.current) return;
        fired.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      // no link preview or text selection from the WebView - the menu is ours
      onContextMenu(event: MouseEvent) {
        event.preventDefault();
      },
      style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as const,
    }),
    [cancel],
  );

  const sheet: ReactNode = (
    <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title} doneLabel="Abbrechen">
      <div className="pb-4">
        {open?.actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`list-row w-full text-left ${action.danger ? 'text-bad' : ''}`}
            onClick={() => {
              setOpen(null);
              action.onSelect();
            }}
          >
            <Icon name={action.icon} className="w-5 h-5 shrink-0" />
            <span className="flex-1">{action.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );

  return { bind, sheet };
}
