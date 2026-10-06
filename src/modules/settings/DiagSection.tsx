import { useState } from 'react';
import { clearDebugLog, readDebugLog } from '@/platform/debugLog';
import { diagDeviceId, diagUploadState, uploadDiagnostics } from '@/platform/diagUpload';

/**
 * The device log, folded away at the very end of the settings.
 *
 * Normally nobody opens this: the log goes to the file worker by itself and is read from
 * there. It is here for the case that does not work - no connection, worker not set up -
 * and to name the device, so a report can say which log to look at.
 */
export function DiagSection() {
  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState(diagUploadState);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    setLines(readDebugLog());
    setState(diagUploadState());
  }

  async function send() {
    setMessage('wird gesendet…');
    const sent = await uploadDiagnostics('von Hand', true);
    refresh();
    setMessage(sent ? 'Gesendet.' : `Nicht gesendet${diagUploadState().error ? `: ${diagUploadState().error}` : '.'}`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(readDebugLog().join('\n'));
      setMessage('In die Zwischenablage kopiert.');
    } catch {
      setMessage('Kopieren nicht möglich.');
    }
  }

  return (
    <details className="px-1" onToggle={(event) => (event.currentTarget.open ? refresh() : undefined)}>
      <summary className="text-xs text-muted cursor-pointer">Protokoll · {diagDeviceId()}</summary>
      <div className="mt-2 flex flex-col gap-2 text-xs text-muted">
        <p>
          {lines.length} Zeilen. Zuletzt gesendet:{' '}
          {state.at ? new Date(state.at).toLocaleString('de-DE') : 'noch nie'}
          {state.error ? ` · letzter Fehler: ${state.error}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => void send()}>
            Jetzt senden
          </button>
          <button type="button" className="btn" onClick={() => void copy()}>
            Kopieren
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearDebugLog();
              refresh();
            }}
          >
            Leeren
          </button>
        </div>
        {message && <p>{message}</p>}
        <pre className="whitespace-pre-wrap break-all max-h-80 overflow-y-auto text-[10px] leading-tight">
          {lines.slice(-200).join('\n')}
        </pre>
      </div>
    </details>
  );
}
