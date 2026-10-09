import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** the button that goes ahead, e.g. 'Löschen' */
  confirmLabel: string;
  /** red button for something that cannot be taken back */
  danger?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * The app's own question in place of the browser's `confirm()`: a sheet in the app's
 * look, with a big button for each answer instead of the tiny system dialog.
 * Only for what cannot be undone - everything else goes through and offers "Rückgängig".
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((options) => {
    resolver.current?.(false);
    setQuestion(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setQuestion(null);
  }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Sheet open={!!question} onClose={() => answer(false)} title={question?.title} doneLabel="Abbrechen">
        <div className="p-4 flex flex-col gap-3">
          {question?.message && <p className="text-muted">{question.message}</p>}
          <button
            type="button"
            className={`btn ${question?.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => answer(true)}
          >
            {question?.confirmLabel}
          </button>
          <button type="button" className="btn" onClick={() => answer(false)}>
            Abbrechen
          </button>
        </div>
      </Sheet>
    </ConfirmContext.Provider>
  );
}

/** outside a provider (single component tests) it falls back to the browser dialog */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  return useCallback<Ask>(
    (options) =>
      ask
        ? ask(options)
        : Promise.resolve(window.confirm([options.title, options.message].filter(Boolean).join('\n\n'))),
    [ask],
  );
}
