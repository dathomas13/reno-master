import { useEffect, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose(): void;
  title?: string;
  children: ReactNode;
}

/** bottom sheet on the phone, centred dialog on a laptop */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
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
        className="relative w-full md:w-[520px] max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-2xl
                   bg-panel border border-line pb-[env(safe-area-inset-bottom)]"
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-line sticky top-0 bg-panel">
            <h2 className="font-semibold">{title}</h2>
            <button type="button" className="btn btn-ghost px-2 min-h-0 py-1" onClick={onClose}>
              Fertig
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
