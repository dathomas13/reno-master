import { useEffect, useState } from 'react';
import { subscribeOutbox, retryAll, type OutboxState } from '@/offline/outbox';
import { useOnline } from '@/offline/useOnline';

export function SyncBadge() {
  const online = useOnline();
  const [state, setState] = useState<OutboxState>({ pending: 0, failed: 0, uploading: false });

  useEffect(() => subscribeOutbox(setState), []);

  const color = !online ? 'bg-muted' : state.failed ? 'bg-bad' : state.pending ? 'bg-warn' : 'bg-good';
  const text = !online
    ? state.pending
      ? `Offline · ${state.pending} wartet`
      : 'Offline'
    : state.failed
      ? `${state.failed} fehlgeschlagen`
      : state.pending
        ? `${state.pending} wird geladen`
        : 'Synchron';

  return (
    <button
      type="button"
      onClick={() => void retryAll()}
      className="flex items-center gap-2 text-xs text-muted"
      title="Ausstehende Uploads erneut versuchen"
    >
      <span className={`inline-block w-2 h-2 rounded-full ${color} ${state.uploading ? 'animate-pulse' : ''}`} />
      {text}
    </button>
  );
}
