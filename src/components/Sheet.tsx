import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  open: boolean;
  onClose(): void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet on the phone, centred dialog on a laptop.
 *
 * It is rendered into `document.body`, not where it stands in the tree, and that is not
 * a detail: `backdrop-blur` (like `filter` and `transform`) makes an element the frame
 * that `position: fixed` children measure themselves against. The TopBar has it, so the
 * sheet of the sync badge inside it was laid out against a 56 pixel high header - on the
 * phone it ended up shifted and unreadable. From the body there is no such frame, and
 * every sheet in the app is safe from it, wherever it is opened.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // the page behind must not scroll away under the sheet while it is open
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full md:w-[520px] max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl
                   bg-panel border border-line pb-[env(safe-area-inset-bottom)]"
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-line sticky top-0 bg-panel z-10">
            <h2 className="font-semibold">{title}</h2>
            <button type="button" className="btn btn-ghost px-2 min-h-0 py-1" onClick={onClose}>
              Fertig
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
