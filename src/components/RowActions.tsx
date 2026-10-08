import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  /** where the row is on screen: it stays visible, the menu opens right at it */
  rect: { top: number; bottom: number; left: number; right: number };
}

const HOLD_MS = 500;
const SLOP_PX = 10;

/**
 * Long-pressing an entry of a list opens a small menu with what can be done to it
 * (Löschen, Erledigt, Anheften …), right at the entry like the system's own context
 * menus: the screen dims, the entry stays lit, the menu grows out of it. Not a swipe on the row: sideways swipes switch the
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
        const row = event.currentTarget as HTMLElement;
        const timer = window.setTimeout(() => {
          press.current = null;
          fired.current = true;
          navigator.vibrate?.(12);
          const { top, bottom, left, right } = row.getBoundingClientRect();
          setOpen({ title, actions, rect: { top, bottom, left, right } });
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

  const sheet: ReactNode = open ? <RowMenu open={open} onClose={() => setOpen(null)} /> : null;

  return { bind, sheet };
}

/** the bottom navigation and a little air: the menu must not open behind it */
const BOTTOM_RESERVE = 88;
const ITEM_HEIGHT = 48;

function RowMenu({ open, onClose }: { open: Open; onClose(): void }) {
  const { rect, actions, title } = open;
  // lifting the finger that held the entry must not land as a tap on the backdrop
  const openedAt = useRef(Date.now());

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const height = actions.length * ITEM_HEIGHT + 12;
  const below = rect.bottom + 8 + height <= window.innerHeight - BOTTOM_RESERVE;
  const right = Math.max(12, window.innerWidth - rect.right + 12);
  const place = below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 };

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title} data-no-swipe>
      <button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 w-full bg-black/45 backdrop-blur-[2px] animate-[fade-in_150ms_ease-out]"
        onClick={() => {
          if (Date.now() - openedAt.current > 400) onClose();
        }}
      />
      {/* the entry stays lit above the dimmed screen, so it is clear what the menu acts on */}
      <div
        aria-hidden="true"
        className="absolute rounded-xl ring-1 ring-accent/60 bg-accent/10 pointer-events-none"
        style={{ top: rect.top, left: rect.left + 4, width: rect.right - rect.left - 8, height: rect.bottom - rect.top }}
      />
      <div
        role="menu"
        aria-label={title}
        className={`absolute min-w-52 max-w-[80vw] py-1.5 rounded-2xl bg-panel border border-line shadow-2xl
                    animate-[menu-in_160ms_ease-out] ${below ? 'origin-top-right' : 'origin-bottom-right'}`}
        style={{ right, ...place }}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            className={`w-full h-12 px-4 flex items-center gap-3 text-left active:bg-panel2 ${
              action.danger ? 'text-bad' : 'text-ink'
            }`}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            <Icon name={action.icon} className="w-5 h-5 shrink-0" />
            <span className="flex-1">{action.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
