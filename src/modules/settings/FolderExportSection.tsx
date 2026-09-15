import { useMemo, useState } from 'react';
import { useCollection } from '@/data/hooks';
import { COL, type Contact, type Cost, type DiaryEntry, type Photo, type Task, type Trade } from '@/data/types';
import { formatSize, planExport } from '@/data/exportArchive';
import {
  describeResult,
  runFolderExport,
  sourceFor,
  INDEX_PATH,
  type FolderIndex,
  type FolderProgress,
} from '@/data/exportFolder';
import {
  copyIntoFolder,
  folderExportAvailable,
  pickExportFolder,
  readFromFolder,
  writeIntoFolder,
} from '@/platform/fileExport';
import { readFromStorage } from '@/data/exportFiles';
import { deviceId } from '@/lib/ids';

/**
 * The export that carries the full resolution.
 *
 * The originals live in the gallery of this phone, so this is the only place they can be
 * had without uploading them first. Written as plain files into a folder the user picks:
 * no archive to hold, no second copy of anything, and whatever is written stays written
 * if the export is interrupted.
 */
export function FolderExportSection() {
  const entries = useCollection<DiaryEntry>(COL.diary);
  const photos = useCollection<Photo>(COL.photos);
  const costs = useCollection<Cost>(COL.costs);
  const tasks = useCollection<Task>(COL.tasks);
  const contacts = useCollection<Contact>(COL.contacts);
  const trades = useCollection<Trade>(COL.trades);

  const [progress, setProgress] = useState<FolderProgress | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

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

  const device = deviceId();
  const fromGallery = plan.files.filter((file) => sourceFor(file, device) === 'gallery').length;
  const fromCloud = plan.files.filter((file) => sourceFor(file, device) === 'cloud').length;

  if (!folderExportAvailable()) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold mb-3">Export in einen Ordner</h2>
        <p className="text-sm text-muted">
          Gibt es nur in der Android-App: nur dort liegen die Originale in der Galerie, und nur dort
          darf eine App dauerhaft in einen Ordner schreiben. Im Browser steht stattdessen der
          ZIP-Export bereit.
        </p>
      </section>
    );
  }

  async function run() {
    setError(null);
    setSummary(null);
    setFailures([]);

    const folder = await pickExportFolder();
    if (!folder) return; // der Nutzer hat abgebrochen

    setRunning(true);
    try {
      // what an earlier export already put there, so this run only fills the gaps
      let index: FolderIndex = {};
      const existing = await readFromFolder(folder.uri, INDEX_PATH);
      if (existing) {
        try {
          index = JSON.parse(new TextDecoder().decode(existing)) as FolderIndex;
        } catch {
          index = {};
        }
      }

      const { result, index: written } = await runFolderExport(
        plan,
        index,
        device,
        {
          copyFromGallery: (path, sourceUri, mime) => copyIntoFolder(folder.uri, path, sourceUri, mime),
          writeBytes: (path, data, mime) => writeIntoFolder(folder.uri, path, data, mime),
          readCloud: readFromStorage,
        },
        setProgress,
      );

      await writeIntoFolder(
        folder.uri,
        INDEX_PATH,
        new TextEncoder().encode(JSON.stringify(written)),
        'application/json',
      );

      setSummary(`${folder.label}: ${describeResult(result)} · ${formatSize(result.bytes)}`);
      setFailures(result.failed);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Der Export ist fehlgeschlagen.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const loading = entries.loading || photos.loading;

  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-3">Export in einen Ordner</h2>
      <p className="text-sm text-muted mb-3">
        Schreibt das ganze Tagebuch als einzelne Dateien in einen Ordner deiner Wahl – Fotos nach
        Tagen sortiert, dazu der Text und die Daten. Die Bilder dieses Handys kommen dabei in voller
        Auflösung direkt aus der Galerie.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Daten werden geladen…</p>
      ) : (
        <dl className="text-sm mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted">Einträge</dt>
          <dd>{entries.data.length}</dd>
          <dt className="text-muted">aus der Galerie</dt>
          <dd>{fromGallery} in voller Auflösung</dd>
          <dt className="text-muted">aus der Cloud</dt>
          <dd>{fromCloud} verkleinert</dd>
        </dl>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void run()}
        disabled={running || loading}
      >
        {running ? 'Läuft…' : 'Ordner wählen und exportieren'}
      </button>

      {progress && (
        <div className="mt-3">
          <div className="h-1.5 rounded bg-black/30 overflow-hidden">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted mt-1 truncate">
            {progress.done} / {progress.total} · {formatSize(progress.bytes)} ·{' '}
            {progress.current || 'wird abgeschlossen…'}
          </p>
        </div>
      )}

      {summary && <p className="text-sm mt-3">{summary}</p>}

      {failures.length > 0 && (
        <details className="text-xs text-warn mt-2">
          <summary>{failures.length} Datei(en) fehlten</summary>
          <ul className="mt-1 space-y-0.5">
            {failures.slice(0, 20).map((entry) => (
              <li key={entry.name}>
                {entry.name} – {entry.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && <p className="text-sm text-bad mt-3">{error}</p>}
    </section>
  );
}
