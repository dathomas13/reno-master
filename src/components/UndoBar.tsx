import { useEffect, useRef } from 'react';

interface UndoBarProps {
  message: string;
  actionLabel?: string;
  onAction(): void;
  onClose(): void;
  timeoutMs?: number;
}

/** a short-lived notice above the bottom navigation, for actions that went through without asking */
export function UndoBar({ message, actionLabel = 'Rückgängig', onAction, onClose, timeoutMs = 6000 }: UndoBarProps) {
  // the latest callback without restarting the timer on every render of the parent
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [message, timeoutMs]);

  return (
    <div
      role="status"
      className="fixed inset-x-3 z-40 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] md:bottom-4 md:left-auto
                 md:right-4 md:w-[420px] flex items-center gap-2 rounded-xl border border-line bg-panel2 pl-4 pr-1
                 shadow-lg"
    >
      <span className="flex-1 min-w-0 py-3 text-sm">{message}</span>
      <button
        type="button"
        className="btn btn-ghost text-accent font-semibold px-3"
        onClick={() => {
          onAction();
          onClose();
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
