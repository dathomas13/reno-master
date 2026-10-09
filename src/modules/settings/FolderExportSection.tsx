import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '@/data/hooks';
import { useOptions } from '@/data/useOptions';
import { COL, type Contact, type Cost, type DiaryEntry, type Photo, type Task, type Trade } from '@/data/types';
import { formatSize, planExport } from '@/data/exportArchive';
import {
  describeResult,
  runFolderExport,
  sourceFor,
  INDEX_PATH,
  matchGalleryOriginal,
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
import { listGalleryPhotosForDay } from '@/platform/photos';
import { readFromStorage } from '@/data/exportFiles';
import { deviceId } from '@/lib/ids';
import { SettingsHeading } from './SettingsHelp';

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

  const { sets } = useOptions();
  const device = deviceId();

  // Photos from the system picker or camera carry no gallery reference, yet their originals
  // are in this phone's gallery: look them up so the export does not fall back to 1600 px.
  const [found, setFound] = useState<Record<string, string>>({});
  useEffect(() => {
    if (photos.loading || !folderExportAvailable()) return;
    let active = true;
    void (async () => {
      const open = photos.data.filter(
        (photo) => photo.contentType !== 'application/pdf' && !(photo.sourceUri && photo.deviceId === device) && photo.takenAt,
      );
      const days = [...new Set(open.map((photo) => photo.takenAt!.slice(0, 10)))];
      const matches: Record<string, string> = {};
      for (const day of days) {
        const candidates = await listGalleryPhotosForDay(day, 1000);
        if (!active) return;
        for (const photo of open.filter((entry) => entry.takenAt!.slice(0, 10) === day)) {
          const hit = matchGalleryOriginal(photo, candidates);
          if (hit) matches[photo.id] = hit.uri;
        }
      }
      if (active) setFound(matches);
    })();
    return () => {
      active = false;
    };
  }, [photos.data, photos.loading, device]);

  const resolvedPhotos = useMemo(
    () =>
      photos.data.map((photo) =>
        found[photo.id] ? { ...photo, sourceUri: found[photo.id], deviceId: device } : photo,
      ),
    [photos.data, found, device],
  );

  const plan = useMemo(
    () =>
      planExport({
        entries: entries.data,
        photos: resolvedPhotos,
        costs: costs.data,
        tasks: tasks.data,
        contacts: contacts.data,
        trades: trades.data,
        sets,
      }),
    [entries.data, resolvedPhotos, costs.data, tasks.data, contacts.data, trades.data, sets],
  );

  const fromGallery = plan.files.filter((file) => sourceFor(file, device) === 'gallery').length;
  const cloudFull = plan.files.filter((file) => sourceFor(file, device) === 'cloud' && file.original).length;
  const shrunk = plan.files.filter((file) => sourceFor(file, device) === 'cloud' && !file.original);
  const fromCloud = shrunk.length;

  if (!folderExportAvailable()) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold mb-3">Export in einen Ordner</h2>
        <p className="text-sm text-muted">
          Der Ordnerexport ist in dieser App-Version nicht verfügbar. Bitte die Android-App aktualisieren.
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
      <SettingsHeading title="Export in einen Ordner">
        Schreibt das ganze Tagebuch als einzelne Dateien in einen Ordner deiner Wahl – Fotos nach
        Tagen sortiert, dazu der Text und die Daten. Die Bilder dieses Handys kommen dabei in voller
        Auflösung direkt aus der Galerie.
      </SettingsHeading>

      {loading ? (
        <p className="text-sm text-muted">Daten werden geladen…</p>
      ) : (
        <dl className="text-sm mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted">Einträge</dt>
          <dd>{entries.data.length}</dd>
          <dt className="text-muted">aus der Galerie</dt>
          <dd>{fromGallery} in voller Auflösung</dd>
          <dt className="text-muted">aus der Cloud (Original)</dt>
          <dd>{cloudFull} in voller Auflösung</dd>
          <dt className="text-muted">aus der Cloud</dt>
          <dd>{fromCloud} verkleinert</dd>
        </dl>
      )}

      {!loading && shrunk.length > 0 && (
        <details className="text-xs text-muted mb-3">
          <summary>Welche sind verkleinert?</summary>
          <ul className="mt-1 space-y-0.5">
            {shrunk.slice(0, 40).map((file) => (
              <li key={file.name}>{file.name}</li>
            ))}
          </ul>
        </details>
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
          <div className="h-1.5 rounded bg-bg overflow-hidden">
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
