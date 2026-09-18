import { useMemo, useState } from 'react';
import { useCollection } from '@/data/hooks';
import { COL, type Contact, type Cost, type DiaryEntry, type Photo, type Task, type Trade } from '@/data/types';
import { archiveName, formatSize, planExport } from '@/data/exportArchive';
import { canStreamToDisk, pickFileTarget, writeArchive, type ExportProgress } from '@/data/runExport';
import { readFromStorage } from '@/data/exportFiles';
import { SettingsHeading } from './SettingsHelp';

/**
 * The archive for the day this app is gone.
 *
 * Streaming into a file the user picks only exists in a desktop browser; a phone would
 * have to hold the whole archive in memory, which for an export with originals it cannot.
 * So the phone gets the honest hint instead of a button that dies at 1.5 GB.
 */
export function ExportSection() {
  const entries = useCollection<DiaryEntry>(COL.diary);
  const photos = useCollection<Photo>(COL.photos);
  const costs = useCollection<Cost>(COL.costs);
  const tasks = useCollection<Task>(COL.tasks);
  const contacts = useCollection<Contact>(COL.contacts);
  const trades = useCollection<Trade>(COL.trades);

  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading =
    entries.loading || photos.loading || costs.loading || tasks.loading || contacts.loading || trades.loading;

  const plan = useMemo(
    () =>
      planExport({
        entries: entries.data,
        photos: photos.data,
        costs: costs.data,
        tasks: tasks.data,
        contacts: contacts.data,
        trades: trades.data,
      }),
    [entries.data, photos.data, costs.data, tasks.data, contacts.data, trades.data],
  );

  const streams = canStreamToDisk();

  if (!streams) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold mb-3">Archiv exportieren</h2>
        <p className="text-sm text-muted">
          Dieser Browser unterstützt das direkte Schreiben in eine Datei nicht.
          Bitte den Archiv-Export am Laptop in Chrome oder Edge öffnen.
        </p>
      </section>
    );
  }

  async function run() {
    setError(null);
    setDone(null);
    setRunning(true);
    try {
      const name = archiveName();
      const target = await pickFileTarget(name);
      const result = await writeArchive(plan, target, setProgress, readFromStorage);
      setDone(result);
    } catch (problem) {
      // the user closing the file dialog is not an error worth shouting about
      const message = problem instanceof Error ? problem.message : 'Der Export ist fehlgeschlagen.';
      setError(/abort/i.test(message) ? null : message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const percent =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="card p-4">
      <SettingsHeading title="Archiv exportieren">
        Packt das ganze Tagebuch in eine ZIP-Datei: die Fotos nach Tagen sortiert, das Tagebuch als
        lesbaren Text und alle Daten als JSON. Gedacht für die Festplatte oder eine zweite Cloud, wenn
        die Baustelle fertig ist.
      </SettingsHeading>

      {loading ? (
        <p className="text-sm text-muted">Daten werden geladen…</p>
      ) : (
        <dl className="text-sm mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted">Einträge</dt>
          <dd>{entries.data.length}</dd>
          <dt className="text-muted">Dateien</dt>
          <dd>{plan.fileCount}</dd>
          <dt className="text-muted">Größe</dt>
          <dd>{formatSize(plan.totalBytes)}</dd>
          {plan.withoutOriginal > 0 && (
            <>
              <dt className="text-muted">nur 1600 px</dt>
              <dd>{plan.withoutOriginal} Fotos ohne gesichertes Original</dd>
            </>
          )}
        </dl>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void run()}
        disabled={running || loading || plan.files.length === 0}
      >
        {running ? 'Archiv wird geschrieben…' : 'Archiv erstellen'}
      </button>

      {progress && (
        <div className="mt-3">
          <div className="h-1.5 rounded bg-black/30 overflow-hidden">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted mt-1 truncate">
            {progress.done} / {progress.total} · {formatSize(progress.doneBytes)} ·{' '}
            {progress.current || 'wird abgeschlossen…'}
          </p>
        </div>
      )}

      {done && (
        <p className="text-sm mt-3">
          Fertig: {done.done} Dateien, {formatSize(done.doneBytes)}.
          {done.skipped.length > 0 && (
            <span className="block text-warn">
              {done.skipped.length} Datei(en) fehlten und wurden übersprungen – meist Fotos, deren
              Upload noch aussteht.
            </span>
          )}
        </p>
      )}

      {error && <p className="text-sm text-bad mt-3">{error}</p>}
    </section>
  );
}
