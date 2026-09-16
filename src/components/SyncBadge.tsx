import { useCallback, useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import {
  isFailed,
  listJobs,
  removeJob,
  retryAll,
  subscribeOutbox,
  type OutboxJob,
  type OutboxState,
} from '@/offline/outbox';
import { useOnline } from '@/offline/useOnline';

/** 'vor 3 Minuten', 'vor 2 Tagen' - how long a file has been waiting */
function ago(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'vor einem Tag' : `vor ${days} Tagen`;
}

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** what the file is, read off its path - nobody wants to see 'photos/ab12_thumb.jpg' */
function describe(job: OutboxJob): string {
  if (job.storagePath.includes('_thumb')) return 'Vorschaubild';
  if (job.storagePath.includes('_original')) return 'Originalfoto';
  if (job.storagePath.startsWith('receipts/')) return 'Beleg';
  if (job.storagePath.startsWith('plans/')) return 'Plan';
  return 'Foto';
}

/**
 * The dot in the corner, and behind it the list of what is still on its way.
 *
 * The list matters: a number alone ("1 wird geladen") says nothing about *what* is stuck
 * and leaves no way out of it. Here every waiting file can be seen, retried or thrown
 * away - the file itself is long since in the entry either way.
 */
export function SyncBadge() {
  const online = useOnline();
  const [state, setState] = useState<OutboxState>({ pending: 0, failed: 0, uploading: false });
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<OutboxJob[] | null>(null);

  useEffect(() => subscribeOutbox(setState), []);

  const waiting = state.pending + state.failed;

  // the list is read when the sheet opens and after every action in it
  const refresh = useCallback(() => {
    void listJobs().then((rows) => setJobs([...rows].sort((a, b) => a.createdAt - b.createdAt)));
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh, state.pending, state.failed, state.uploading]);

  const color = !online ? 'bg-muted' : state.failed ? 'bg-bad' : waiting ? 'bg-warn' : 'bg-good';
  const text = !online
    ? waiting
      ? `Offline · ${waiting} wartet`
      : 'Offline'
    : state.failed
      ? `${state.failed} fehlgeschlagen`
      : state.pending
        ? state.uploading
          ? `${state.pending} wird geladen`
          : `${state.pending} wartet`
        : 'Synchron';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs text-muted"
        title="Ausstehende Uploads ansehen"
      >
        <span className={`inline-block w-2 h-2 rounded-full ${color} ${state.uploading ? 'animate-pulse' : ''}`} />
        {text}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Uploads">
        <div className="p-4 flex flex-col gap-3">
          <p className="text-sm text-muted">
            {!online
              ? 'Ohne Verbindung wartet alles, bis das Netz wieder da ist.'
              : waiting === 0
                ? 'Alles hochgeladen. Fotos und Belege liegen vollständig im Speicher.'
                : `${waiting} Datei${waiting === 1 ? '' : 'en'} noch nicht im Speicher. Die Bilder sind trotzdem in der App zu sehen – sie liegen bis dahin auf diesem Gerät.`}
          </p>

          {jobs && jobs.length > 0 && (
            <ul className="-mx-4">
              {jobs.map((job) => (
                <li key={job.id} className="list-row items-start">
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{describe(job)}</span>
                    <span className="block text-xs text-muted truncate">
                      {size(job.blob?.size ?? 0)} · {ago(job.createdAt)}
                      {job.attempts > 0 ? ` · ${job.attempts} Versuch${job.attempts === 1 ? '' : 'e'}` : ''}
                      {isFailed(job) ? ' · aufgegeben' : ''}
                    </span>
                    {job.lastError && (
                      <span className="block text-xs text-bad line-clamp-2 mt-0.5">{job.lastError}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 min-h-0 text-bad shrink-0"
                    onClick={() => void removeJob(job.id).then(refresh)}
                  >
                    Verwerfen
                  </button>
                </li>
              ))}
            </ul>
          )}

          {waiting > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!online}
              onClick={() => void retryAll().then(refresh)}
            >
              Jetzt versuchen
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}
