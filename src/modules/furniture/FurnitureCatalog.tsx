import { useRef, useState } from 'react';
import { useConfirm } from '@/components/Confirm';
import * as THREE from 'three';
import { Sheet } from '@/components/Sheet';
import { addFurnitureModel, deleteFurnitureModel } from '@/data/furniture';
import { fileStoreReady } from '@/platform/fileStore';
import { CATALOG, CATALOG_GROUPS, type CatalogEntry } from './catalog';
import { inspectModelFile, rememberModelObject, type InspectedModel } from './furnitureScene';
import { clampSize, MAX_MODEL_BYTES, modelSizeMm, type FurnitureItem, type FurnitureModel } from './placement';

/** millimetres as centimetres with at most one decimal, no thousands dot - it is read back */
export const cm = (mm: number) =>
  (Math.round(mm) / 10).toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 1 });

export function sizeLabel(size: { w: number; d: number; h: number }): string {
  return `${cm(size.w)} × ${cm(size.d)} × ${cm(size.h)} cm`;
}

interface Props {
  open: boolean;
  onClose(): void;
  models: FurnitureModel[];
  items: FurnitureItem[];
  /** a catalog type was chosen, or `model` with the model */
  onPick(type: string, model?: FurnitureModel): void;
}

interface Pending {
  file: File;
  inspected: InspectedModel;
  name: string;
  w: number;
  d: number;
  h: number;
}

/**
 * What can be put into the planned house: the built-in pieces, grouped by room, and the
 * models loaded from files. A glTF file is read and measured right here, before anything
 * is stored, so a broken or compressed file is refused with a reason and a model in
 * centimetres comes in at the right size.
 */
export function FurnitureCatalog({ open, onClose, models, items, onPick }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepRatio, setKeepRatio] = useState(true);
  const confirm = useConfirm();

  const usage = (model: FurnitureModel) => items.filter((item) => item.modelId === model.id).length;

  async function readFile(file: File) {
    setError(null);
    setPending(null);
    if (file.size > MAX_MODEL_BYTES) {
      setError(`Die Datei ist ${Math.round(file.size / 1048576)} MB groß, erlaubt sind ${MAX_MODEL_BYTES / 1048576} MB.`);
      return;
    }
    setBusy(true);
    try {
      // the scene's colour handling has to be in place before a material is created
      if ('ColorManagement' in THREE) THREE.ColorManagement.enabled = false;
      const inspected = await inspectModelFile(THREE, await file.arrayBuffer());
      const size = modelSizeMm(inspected.size);
      setPending({ file, inspected, name: file.name.replace(/\.(glb|gltf)$/i, ''), ...size });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Die Datei ließ sich nicht lesen.');
    } finally {
      setBusy(false);
    }
  }

  function resize(key: 'w' | 'd' | 'h', cmValue: string) {
    if (!pending) return;
    const value = clampSize(Number(cmValue.replace(',', '.')) * 10);
    if (!keepRatio || !pending[key]) {
      setPending({ ...pending, [key]: value });
      return;
    }
    const factor = value / pending[key];
    setPending({
      ...pending,
      w: clampSize(pending.w * factor),
      d: clampSize(pending.d * factor),
      h: clampSize(pending.h * factor),
    });
  }

  async function addPending() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const model = await addFurnitureModel(pending.file, {
        name: pending.name.trim() || 'Eigenes Modell',
        w: pending.w,
        d: pending.d,
        h: pending.h,
        json: /\.gltf$/i.test(pending.file.name),
      });
      rememberModelObject(model.storagePath, pending.inspected.object);
      setPending(null);
      onPick('model', model);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Das Modell ließ sich nicht speichern.');
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setPending(null);
    setError(null);
    onClose();
  };

  const entryButton = (entry: CatalogEntry) => (
    <button
      key={entry.type}
      type="button"
      className="card px-3 py-2 text-left active:bg-panel2"
      onClick={() => onPick(entry.type)}
    >
      <div className="text-sm font-medium">{entry.label}</div>
      <div className="text-[11px] text-muted">{sizeLabel(entry.dims)}</div>
    </button>
  );

  return (
    <Sheet open={open} onClose={close} title="Möbel einfügen" doneLabel="Schließen">
      <div className="p-4 space-y-5">
        {CATALOG_GROUPS.map((group) => (
          <section key={group}>
            <h3 className="label">{group}</h3>
            <div className="grid grid-cols-2 gap-2">
              {CATALOG.filter((entry) => entry.group === group).map(entryButton)}
            </div>
          </section>
        ))}

        <section>
          <h3 className="label">Eigene Modelle</h3>
          {models.length > 0 && (
            <div className="space-y-2 mb-3">
              {models.map((model) => {
                const used = usage(model);
                return (
                  <div key={model.id} className="card px-3 py-2 flex items-center gap-2">
                    <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onPick('model', model)}>
                      <div className="text-sm font-medium truncate">{model.name}</div>
                      <div className="text-[11px] text-muted">
                        {sizeLabel(model)}
                        {used > 0 ? ` · ${used}× platziert` : ''}
                        {model.uploadState === 'pending' ? ' · wird hochgeladen' : ''}
                        {model.uploadState === 'failed' ? ' · Hochladen fehlgeschlagen' : ''}
                      </div>
                    </button>
                    {used === 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost px-3 text-bad"
                        onClick={() =>
                          void confirm({
                            title: `„${model.name}“ löschen?`,
                            message: 'Das eigene Modell wird mit seiner Datei entfernt.',
                            confirmLabel: 'Löschen',
                            danger: true,
                          }).then((go) => go && deleteFurnitureModel(model))
                        }
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!pending && (
            <>
              <input
                ref={input}
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void readFile(file);
                }}
              />
              <button
                type="button"
                className="btn w-full"
                disabled={busy || !fileStoreReady()}
                onClick={() => input.current?.click()}
              >
                {busy ? 'Datei wird gelesen…' : 'Modell aus Datei laden (.glb)'}
              </button>
              <p className="text-xs text-muted mt-2">
                {fileStoreReady()
                  ? 'glTF-Modelle, z. B. von Herstellern, Sketchfab oder aus Blender und SketchUp exportiert. ' +
                    'Am besten eine einzelne .glb-Datei, bis 30 MB.'
                  : 'Der Dateispeicher ist auf diesem Gerät nicht eingerichtet.'}
              </p>
            </>
          )}

          {pending && (
            <div className="card p-3 space-y-3">
              <div className="text-xs text-muted">
                {pending.file.name} · {Math.round(pending.file.size / 1024).toLocaleString('de-DE')} KB ·{' '}
                {pending.inspected.triangles.toLocaleString('de-DE')} Dreiecke
              </div>
              <label className="block">
                <span className="label">Name</span>
                <input
                  className="field"
                  value={pending.name}
                  onChange={(event) => setPending({ ...pending, name: event.target.value })}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['w', 'Breite'],
                    ['d', 'Tiefe'],
                    ['h', 'Höhe'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="label">{label} cm</span>
                    <CmInput value={pending[key]} onCommit={(text) => resize(key, text)} />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={keepRatio} onChange={(event) => setKeepRatio(event.target.checked)} />
                Seitenverhältnis beibehalten
              </label>
              <p className="text-xs text-muted">
                Die Maße sind aus der Datei geschätzt. Stimmt die Größe nicht, hier eine Seite richtig eintragen.
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={() => void addPending()}>
                  Hinzufügen und platzieren
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setPending(null)}>
                  Verwerfen
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-warn mt-2">{error}</p>}
        </section>
      </div>
    </Sheet>
  );
}

/**
 * A number in centimetres that is only taken when the field is left or Enter is pressed -
 * otherwise every keystroke would resize (and store) the piece.
 */
export function CmInput({ value, onCommit }: { value: number; onCommit(text: string): void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? cm(value);
  const commit = () => {
    if (text !== null && text.trim() !== '' && Number.isFinite(Number(text.replace(',', '.')))) onCommit(text);
    setText(null);
  };
  return (
    <input
      className="field"
      inputMode="decimal"
      value={shown}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}
