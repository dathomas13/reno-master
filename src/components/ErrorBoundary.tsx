import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * A white screen on a phone gives nothing to work with. This catches whatever escaped and
 * shows what happened plus a way out.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Reno Master ist abgestürzt', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-full flex flex-col justify-center gap-4 px-6 py-10 max-w-md mx-auto">
        <h1 className="text-xl font-semibold">Da ist etwas schiefgegangen</h1>
        <p className="text-muted text-sm">
          Die App konnte diesen Bildschirm nicht aufbauen. Gespeicherte Daten sind davon nicht betroffen.
        </p>
        <pre className="card p-3 text-xs text-muted whitespace-pre-wrap break-words">{error.message}</pre>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={() => window.location.reload()}>
            Neu laden
          </button>
          <button
            type="button"
            className="btn flex-1"
            onClick={() => {
              window.location.hash = '#/';
              window.location.reload();
            }}
          >
            Zum Start
          </button>
        </div>
      </div>
    );
  }
}
