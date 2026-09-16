import { useMemo, useState } from 'react';
import { useCollection } from '@/data/hooks';
import { COL, type DiaryEntry, type Phase, type Photo, type Trade } from '@/data/types';
import {
  ImportFormatError,
  baseName,
  parseEntries,
  planImport,
  runImport,
  type ImportProgress,
  type ImportResult,
  type NotionEntry,
} from '@/data/notionImport';
import { addPhoto, deletePhoto } from '@/data/photos';
import { saveDiaryEntry, deleteDiaryEntry } from '@/data/repos';
import { fileStoreReady } from '@/platform/fileStore';
import { newId } from '@/lib/ids';

/**
 * The one-off import of the Notion diary, from inside the app.
 *
 * The command line version in `tools/import` needs a service account and a machine that
 * reaches Firebase. Here the browser is already signed in and resizes the pictures
 * itself, so the whole thing is: pick the export, press the button.
 */
export function NotionImportSection() {
  const entries = useCollection<DiaryEntry>(COL.diary);
  const photos = useCollection<Photo>(COL.photos);
  const phases = useCollection<Phase>(COL.phases);
  const trades = useCollection<Trade>(COL.trades);

  const [picked, setPicked] = useState<NotionEntry[] | null>(null);
  const [blobs, setBlobs] = useState<Map<string, File>>(new Map());
  const [replace, setReplace] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [running, setRunning] = useState(false);

  const plan = useMemo(() => {
    if (!picked) return null;
    return planImport({
      entries: picked,
      files: new Set(blobs.keys()),
      phases: phases.data,
      trades: trades.data,
      existing: entries.data.length,
    });
  }, [picked, blobs, phases.data, trades.data, entries.data.length]);

  async function pick(list: FileList | null) {
    setError(null);
    setResult(null);
    if (!list || list.length === 0) return;

    const files = [...list];
    const json = files.find((file) => file.name.toLowerCase().endsWith('.json'));
    const pictures = new Map<string, File>();
    for (const file of files) {
      if (file !== json && !file.name.toLowerCase().endsWith('.json')) pictures.set(baseName(file.name), file);
    }
    setBlobs(pictures);

    if (!json) {
      // die Bilder allein ergeben keinen Eintrag, ohne diary.json fehlt der Text
      if (!picked) setError('In der Auswahl war keine diary.json. Bitte mit auswählen.');
      return;
    }
    try {
      setPicked(parseEntries(await json.text()));
    } catch (problem) {
      setPicked(null);
      setError(problem instanceof ImportFormatError ? problem.message : 'Die Datei ließ sich nicht lesen.');
    }
  }

  async function run() {
    if (!picked) return;
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const outcome = await runImport(
        {
          entries: picked,
          files: new Set(blobs.keys()),
          blobs,
          phases: phases.data,
          trades: trades.data,
          existing: entries.data.length,
          current: { entries: entries.data, photos: photos.data },
          replace,
        },
        {
          saveEntry: (entry) => saveDiaryEntry(entry),
          addPhoto: async (input) => {
            const photo = await addPhoto({
              file: input.file,
              kind: 'photo',
              entryId: input.entryId,
              originalName: input.originalName,
              takenAt: input.takenAt,
              // die unveränderte Datei bleibt erhalten, darum ging es beim Umzug
              keepOriginal: true,
            });
            return photo.id;
          },
          deleteEntry: deleteDiaryEntry,
          deletePhoto,
          newId,
          fetchPhoto: photoUrl
            ? async (name) => {
                const base = photoUrl.endsWith('/') ? photoUrl : `${photoUrl}/`;
                const response = await fetch(`${base}${encodeURIComponent(name)}`);
                return response.ok ? response.blob() : null;
              }
            : undefined,
        },
        setProgress,
      );
      setResult(outcome);
      setPicked(null);
      setBlobs(new Map());
      setPhotoUrl('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Der Import ist gescheitert.');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const loading = entries.loading || photos.loading || phases.loading || trades.loading;

  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-1">Tagebuch aus Notion</h2>
      <p className="text-sm text-muted mb-3">
        Einmalig: den Notion-Export einlesen. Auswählen musst du die <code>diary.json</code> und die Fotos
        zusammen – in einem Rutsch.
      </p>

      {!fileStoreReady() && (
        <p className="text-sm text-warn mb-3">
          Der Dateispeicher ist nicht eingerichtet. Die Einträge kämen an, die Fotos blieben in der Warteschlange
          hängen.
        </p>
      )}

      <input
        type="file"
        multiple
        accept=".json,image/*"
        className="text-sm mb-3 block"
        disabled={running || loading}
        onChange={(event) => void pick(event.target.files)}
      />

      {plan && (
        <div className="text-sm flex flex-col gap-1 mb-3">
          <p>
            <strong>{plan.entries.length}</strong> Einträge, <strong>{plan.photos - plan.missing.length}</strong> von{' '}
            {plan.photos} Fotos dabei.
          </p>
          {plan.missing.length > 0 && (
            <>
              <p className={photoUrl ? 'text-muted' : 'text-warn'}>
                {plan.missing.length} Fotos nicht ausgewählt
                {photoUrl ? ' – sie werden von der Adresse geholt.' : ': diese Einträge kämen ohne ihr Foto an.'}
              </p>
              <label className="flex flex-col gap-1 mt-1">
                <span className="text-muted">Fehlende Fotos von dieser Adresse holen:</span>
                <input
                  type="url"
                  className="field"
                  inputMode="url"
                  placeholder="https://raw.githubusercontent.com/<konto>/<repo>/main/diary/"
                  value={photoUrl}
                  disabled={running}
                  onChange={(event) => setPhotoUrl(event.target.value)}
                />
              </label>
            </>
          )}
          {plan.unused.length > 0 && (
            <p className="text-muted">{plan.unused.length} ausgewählte Dateien gehören zu keinem Eintrag.</p>
          )}
          {plan.unknownWeather.length > 0 && (
            <p className="text-warn">Unbekanntes Wetter, bleibt leer: {plan.unknownWeather.join(', ')}.</p>
          )}
          {plan.unknownRelations.length > 0 && (
            <p className="text-warn">
              Nicht zugeordnet, bleibt leer: {plan.unknownRelations.join(', ')}.
            </p>
          )}
          {plan.replaces > 0 && (
            <label className="flex items-start gap-3 mt-2">
              <input
                type="checkbox"
                className="w-5 h-5 accent-[#c9a86a] mt-0.5"
                checked={replace}
                disabled={running}
                onChange={(event) => setReplace(event.target.checked)}
              />
              <span>
                Die {plan.replaces} vorhandenen Einträge vorher löschen, mit ihren Fotos.
                <span className="text-muted"> Ohne Haken stehen sie danach daneben.</span>
              </span>
            </label>
          )}
        </div>
      )}

      {progress && (
        <p className="text-sm text-muted mb-3">
          {progress.done} von {progress.total}: {progress.label}
        </p>
      )}

      {result && (
        <p className="text-sm mb-3">
          {result.entries} Einträge und {result.photos} Fotos übernommen
          {result.deleted > 0 ? `, ${result.deleted} alte Datensätze entfernt` : ''}.
          {result.skipped.length > 0 ? ` ${result.skipped.length} Fotos fehlten.` : ''} Die Fotos laden im
          Hintergrund hoch.
        </p>
      )}

      {error && <p className="text-sm text-bad mb-3">{error}</p>}

      <button type="button" className="btn" disabled={!picked || running || loading} onClick={() => void run()}>
        {running ? 'Läuft…' : 'Einträge übernehmen'}
      </button>
    </section>
  );
}
