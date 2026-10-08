import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { UndoBar } from './UndoBar';

export interface ToastOptions {
  /** e.g. 'Rückgängig'; without it the notice only informs */
  actionLabel?: string;
  onAction?(): void;
  timeoutMs?: number;
}

type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);

interface ToastState extends ToastOptions {
  key: number;
  message: string;
}

/**
 * One notice for the whole app, above the routes: it survives the navigation that
 * usually follows a delete ("Gelöscht · Rückgängig" on the list the editor returned to).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const show = useCallback<ShowToast>((message, options = {}) => {
    counter.current += 1;
    setToast({ key: counter.current, message, ...options });
  }, []);

  const close = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <UndoBar
          key={toast.key}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onClose={close}
          timeoutMs={toast.timeoutMs ?? (toast.onAction ? 6000 : 3000)}
        />
      )}
    </ToastContext.Provider>
  );
}

/** outside a provider (single component tests) the notice simply does not show */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  return useMemo(() => show ?? (() => undefined), [show]);
}

/**
 * Deletes and offers the way back: the record is written again with the same id, so
 * every link to it (photos, rooms, contact logs) holds again.
 */
export function useUndoableDelete() {
  const toast = useToast();
  return useCallback(
    (message: string, remove: () => Promise<unknown>, restore: () => Promise<unknown>) => {
      // not awaited: offline a Firestore write only resolves once the server has it, and
      // the notice must show now - the local cache already reflects the delete
      void remove().catch(() => toast('Löschen hat nicht geklappt.'));
      toast(message, {
        actionLabel: 'Rückgängig',
        onAction: () => {
          void restore().catch(() => toast('Wiederherstellen hat nicht geklappt.'));
        },
      });
    },
    [toast],
  );
}
