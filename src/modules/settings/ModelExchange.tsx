import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  buildExportArchive,
  pendingImports,
  setPendingImports,
  prepareModelImport,
  previewImport,
  publishImport,
  readImportFiles,
  type PreparedImport,
} from '@/data/modelExchange';
import { clearPreview } from '@/data/models';
import type { ImportResult } from '@/modules/modelBuild';
import { handOverFile } from '@/platform/shareFile';

const VARIANT_LABEL = { ist: 'Bestand', soll: 'Zielzustand' } as const;
const SHOWN_CHANGES = 12;

type Built = Extract<ImportResult, { ok: true }>;

/**
 * Export and import of the house model, for editing it outside the app.
 *
 * Export hands out a ZIP with instructions, house files and DXF plans. Import takes the
 * edited house file back, and this device checks it, builds the 3D model and shows what
 * changed. Nothing is published before the second tap - and never with an error in it.
 */
export function ModelExchange({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'publish' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // survives the trip to the 3D preview and back, see pendingImports
  const [imports, setImports] = useState<PreparedImport[]>(pendingImports);
  const location = useLocation();
  const section = useRef<HTMLDivElement>(null);

  useEffect(() => setPendingImports(imports), [imports]);

  // back from the preview: straight to the import that is waiting
  useEffect(() => {
    if (location.hash === '#import') section.current?.scrollIntoView({ block: 'start' });
  }, [location.hash]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  async function runExport() {
    setBusy('export');
    setMessage(null);
    setError(null);
    try {
      const archive = await buildExportArchive();
      const how = await handOverFile(archive.name, archive.data, 'application/zip');
      if (how !== 'cancelled') {
        setMessage([`${archive.name} erstellt.`, ...archive.notes].join(' '));
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Der Export ist fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  }

  async function runImport(files: File[]) {
    if (files.length === 0) return;
    setBusy('import');
    setMessage(null);
    setError(null);
    setImports([]);
    setConfirmed({});
    try {
      const found = await readImportFiles(files);
      if (found.length === 0) {
        setError('In der Auswahl ist keine Hausdatei (haus-ist.json oder haus-soll.json).');
        return;
      }
      // one frame for the "wird gebaut" state before the build blocks the thread
      await new Promise((resolve) => window.setTimeout(resolve, 30));
      const prepared: PreparedImport[] = [];
      for (const file of found) prepared.push(await prepareModelImport(file.name, file.text));
      setImports(prepared);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Die Datei ließ sich nicht lesen.');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  function preview(result: Built) {
    previewImport(result);
    navigate(`/3d?variant=${result.variant}`);
  }

  async function publish(item: PreparedImport, result: Built) {
    setBusy('publish');
    setMessage(null);
    setError(null);
    try {
      await publishImport(result);
      setImports((list) => list.filter((entry) => entry !== item));
      setMessage(`${VARIANT_LABEL[result.variant]} v${result.version} veröffentlicht. `
        + 'Die anderen Geräte holen es beim nächsten Sync.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Das Veröffentlichen ist fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  }

  function discard(item: PreparedImport) {
    if (item.result.ok) clearPreview(item.result.variant);
    setImports((list) => list.filter((entry) => entry !== item));
  }

  return (
    <div ref={section} id="import" className="mt-4 border-t border-line/60 pt-3">
      <h3 className="font-medium text-sm">Modell bearbeiten</h3>
      <p className="text-xs text-muted mt-1">
        „Exportieren“ gibt ein ZIP mit Anleitung, Hausdateien und Grundrissen (DXF). Damit lässt sich
        das Modell in einer anderen KI, einem Editor oder CAD ändern. Zurück kommt die geänderte
        <code> haus-ist.json</code> bzw. <code>haus-soll.json</code> oder das ganze ZIP. Die App prüft
        sie, baut das Modell und zeigt die Änderungen, bevor etwas veröffentlicht wird.
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" className="btn" onClick={() => void runExport()} disabled={busy !== null}>
          {busy === 'export' ? 'Wird gepackt…' : 'Modell exportieren'}
        </button>
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy !== null}>
          {busy === 'import' ? 'Wird geprüft und gebaut…' : 'Modell importieren'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".json,.zip,application/json,application/zip"
          className="hidden"
          onChange={(event) => void runImport([...(event.target.files ?? [])])}
        />
      </div>

      {imports.map((item) => {
        const { result } = item;
        const key = `${item.fileName}|${result.ok ? result.version : 'x'}`;
        return (
          <div key={key} className="card p-3 mt-3 text-sm">
            <div className="font-medium">
              {result.variant ? VARIANT_LABEL[result.variant] : 'Datei'}
              <span className="text-muted font-normal"> · {item.fileName}</span>
            </div>

            {!result.ok && (
              <>
                <p className="text-bad mt-1">Nicht übernommen – bitte in der Datei korrigieren:</p>
                <ul className="list-disc pl-5 text-bad text-xs mt-1 space-y-0.5">
                  {result.errors.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </>
            )}

            {result.ok && item.unchanged && (
              <p className="text-muted mt-1">Keine Änderung gegenüber dem Modell in Gebrauch (v{result.basedOn}).</p>
            )}

            {result.ok && !item.unchanged && (
              <>
                <p className="text-xs text-muted mt-1">
                  wird v{result.version} · beruht auf v{result.basedOn} · {result.scene.prims.length} Bauteile
                  {result.note && ` · „${result.note}“`}
                </p>
                <ul className="list-disc pl-5 text-xs mt-2 space-y-0.5">
                  {result.changes.slice(0, SHOWN_CHANGES).map((line) => <li key={line}>{line}</li>)}
                  {result.changes.length > SHOWN_CHANGES && (
                    <li className="text-muted">… und {result.changes.length - SHOWN_CHANGES} weitere</li>
                  )}
                </ul>
              </>
            )}

            {result.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-warn text-xs mt-2 space-y-0.5">
                {result.warnings.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}

            {result.ok && result.removedRoomIds.length > 0 && (
              <label className="flex gap-2 items-start text-xs mt-2">
                <input
                  type="checkbox"
                  checked={confirmed[key] ?? false}
                  onChange={(event) => setConfirmed((state) => ({ ...state, [key]: event.target.checked }))}
                />
                <span>
                  Räume entfallen ({result.removedRoomIds.join(', ')}). Tagebuch, Fotos, Kosten und Aufgaben,
                  die daran hängen, verlieren ihre Raum-Zuordnung.
                </span>
              </label>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              {result.ok && !item.unchanged && (
                <>
                  <button type="button" className="btn" onClick={() => preview(result)} disabled={busy !== null}>
                    Im 3D ansehen
                  </button>
                  {signedIn && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void publish(item, result)}
                      disabled={busy !== null || (result.removedRoomIds.length > 0 && !confirmed[key])}
                    >
                      {busy === 'publish' ? 'Wird veröffentlicht…' : `Als v${result.version} veröffentlichen`}
                    </button>
                  )}
                </>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => discard(item)} disabled={busy !== null}>
                Verwerfen
              </button>
            </div>
            {result.ok && !item.unchanged && !signedIn && (
              <p className="text-xs text-muted mt-2">Veröffentlichen geht nur angemeldet.</p>
            )}
          </div>
        );
      })}

      {message && <p className="text-sm mt-3">{message}</p>}
      {error && <p className="text-sm text-bad mt-3">{error}</p>}
    </div>
  );
}
