import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsField as Field, SettingsHeading } from './SettingsHelp';
import { formatBytes } from '@/lib/image';
import { activeRelease } from '@/data/models';
import { SOURCE_LABEL, VARIANTS, type ReleaseInfo, type Variant } from '@/data/modelRelease';
import { readRelease } from '@/data/modelStore';
import { publishModel, syncAllModels } from '@/data/modelSync';
import { loadSettings, saveSettings } from '@/lib/settings';
import { ModelExchange } from './ModelExchange';

const VARIANT_LABEL: Record<Variant, string> = { ist: 'Bestand', soll: 'Zielzustand' };

interface Row {
  variant: Variant;
  release: ReleaseInfo | null;
  cachedAt: string | null;
}

/**
 * The model, and where it came from.
 *
 * A model is no longer part of the app build: the app uses the highest version it can
 * reach and keeps it on the device, so a new model needs neither a new bundle nor a new
 * APK. This section shows which version is in effect. ModelExchange below exports the
 * house file for editing elsewhere and builds and publishes an edited one - no deploy,
 * no Python. Uploading a finished scene is kept as an advanced fallback.
 */
export function ModelSection({ signedIn }: { signedIn: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>('ist');
  const [note, setNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const sceneInput = useRef<HTMLInputElement>(null);
  const roomsInput = useRef<HTMLInputElement>(null);
  const [defaultVariant, setDefaultVariant] = useState<Variant>(() => loadSettings().defaultModelVariant);

  const refresh = useCallback(async () => {
    const next: Row[] = [];
    for (const item of VARIANTS) {
      const [release, cached] = await Promise.all([activeRelease(item), readRelease(item)]);
      next.push({ variant: item, release, cachedAt: cached?.cachedAt ?? null });
    }
    setRows(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function check() {
    setChecking(true);
    setMessage(null);
    setError(null);
    try {
      const results = await syncAllModels(true);
      const changed = results.filter((result) => result.changed);
      const problem = results.find((result) => result.problem);
      if (problem?.problem) setError(problem.problem);
      setMessage(changed.length > 0
        ? `Neu geladen: ${changed.map((r) => `${VARIANT_LABEL[r.variant]} v${r.active.version}`).join(', ')}`
        : 'Kein neueres Modell gefunden.');
      await refresh();
    } catch {
      setError('Die Prüfung ist fehlgeschlagen.');
    } finally {
      setChecking(false);
    }
  }

  async function publish() {
    const sceneFile = sceneInput.current?.files?.[0];
    if (!sceneFile) {
      setError('Bitte zuerst die Szenendatei auswählen.');
      return;
    }
    setPublishing(true);
    setMessage(null);
    setError(null);
    try {
      const sceneJson = await sceneFile.text();
      const roomsFile = roomsInput.current?.files?.[0];
      const roomsJson = roomsFile ? await roomsFile.text() : null;
      const info = await publishModel({ variant, sceneJson, roomsJson, note });
      setMessage(`${VARIANT_LABEL[variant]} v${info.version} veröffentlicht `
        + `(${formatBytes(info.bytes ?? sceneJson.length)}). Die anderen Geräte holen es beim nächsten Sync.`);
      await syncAllModels(false);
      await refresh();
      if (sceneInput.current) sceneInput.current.value = '';
      if (roomsInput.current) roomsInput.current.value = '';
      setNote('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Das Veröffentlichen ist fehlgeschlagen.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="card p-4">
      <SettingsHeading title="3D-Modelle">
        Die App nimmt immer die höchste erreichbare Version. Das geladene Modell bleibt
        auf diesem Gerät gespeichert und ist auch offline verfügbar.
      </SettingsHeading>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(({ variant: item, release, cachedAt }) => (
            <tr key={item} className="border-b border-line/60 last:border-0 align-top">
              <td className="py-2 pr-2">{VARIANT_LABEL[item]}</td>
              <td className="py-2 pr-2 text-muted">v{release?.version ?? '–'}</td>
              <td className="py-2 text-muted">
                {release?.updatedAt ?? ''}
                {release && (
                  <span className="block text-xs">
                    {SOURCE_LABEL[release.origin ?? release.source]}
                    {cachedAt && release.source === 'cache'
                      && ` · geladen ${new Date(cachedAt).toLocaleDateString('de-DE')}`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Field label="Standardvariante">
        <select
          className="field"
          value={defaultVariant}
          onChange={(event) => {
            const next = event.target.value as Variant;
            setDefaultVariant(next);
            saveSettings({ defaultModelVariant: next });
          }}
        >
          {VARIANTS.map((item) => <option key={item} value={item}>{VARIANT_LABEL[item]}</option>)}
        </select>
      </Field>

      <button type="button" className="btn" onClick={() => void check()} disabled={checking}>
        {checking ? 'Wird geprüft…' : 'Nach neuem Modell suchen'}
      </button>

      <ModelExchange signedIn={signedIn} />

      {signedIn && (
        <details className="mt-3">
          <summary className="text-sm cursor-pointer">Fertige Szene hochladen (erweitert)</summary>
          <p className="text-xs text-muted mt-2">
            Nur für Szenen, die außerhalb gebaut wurden (<code>tools/model/build_scene_lite.py</code>).
            Der übliche Weg ist „Modell importieren“ oben. Version und Datum kommen aus der Datei selbst.
            Eine so hochgeladene Szene hat keine Hausdatei – der Export gibt dann die ältere heraus.
          </p>
          <Field label="Variante">
            <select className="field" value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
              {VARIANTS.map((item) => <option key={item} value={item}>{VARIANT_LABEL[item]}</option>)}
            </select>
          </Field>
          <Field label="Szene (ist.json / soll.json)">
            <input ref={sceneInput} type="file" accept="application/json,.json" className="field" />
          </Field>
          <Field label="Raumliste (rooms-…json, optional)">
            <input ref={roomsInput} type="file" accept="application/json,.json" className="field" />
          </Field>
          <Field label="Notiz (optional)">
            <input
              className="field"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="was sich geändert hat"
            />
          </Field>
          <button type="button" className="btn btn-primary" onClick={() => void publish()} disabled={publishing}>
            {publishing ? 'Wird veröffentlicht…' : 'Veröffentlichen'}
          </button>
        </details>
      )}

      {message && <p className="text-sm mt-3">{message}</p>}
      {error && <p className="text-sm text-bad mt-3">{error}</p>}
    </section>
  );
}
