import { useCallback, useEffect, useState } from 'react';
import { SettingsField as Field, SettingsHeading } from './SettingsHelp';
import { activeRelease, MODEL_EVENT } from '@/data/models';
import { compareVersions, VARIANTS, type ReleaseInfo, type Variant } from '@/data/modelRelease';
import { readRelease } from '@/data/modelStore';
import { publishedState, type PublishedState } from '@/data/modelSync';
import { publishStartModel, resetSollToIst, startVersion } from '@/data/modelExchange';
import { loadSettings, saveSettings } from '@/lib/settings';
import { ModelExchange } from './ModelExchange';

const VARIANT_LABEL: Record<Variant, string> = { ist: 'Bestand', soll: 'Zielzustand' };

interface Row {
  variant: Variant;
  release: ReleaseInfo | null;
  cachedAt: string | null;
  /** what the database has for it: undefined while that is not known yet */
  published: PublishedState | undefined;
}

/**
 * The model, and where it stands.
 *
 * The model lives in the database only (meta/model-<variant>); every signed-in device
 * keeps the newest one and works offline with it. This section shows the version on this
 * device, and ModelExchange below exports the house file for editing elsewhere and builds
 * and publishes an edited one.
 */
export function ModelSection({ signedIn }: { signedIn: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<Variant | null>(null);
  const [resetting, setResetting] = useState(false);
  const [defaultVariant, setDefaultVariant] = useState<Variant>(() => loadSettings().defaultModelVariant);

  const refresh = useCallback(async () => {
    const next: Row[] = [];
    for (const item of VARIANTS) {
      const [release, cached] = await Promise.all([activeRelease(item), readRelease(item)]);
      next.push({ variant: item, release, cachedAt: cached?.cachedAt ?? null, published: publishedState(item) });
    }
    setRows(next);
  }, []);

  useEffect(() => {
    void refresh();
    const onModel = () => void refresh();
    window.addEventListener(MODEL_EVENT, onModel);
    return () => window.removeEventListener(MODEL_EVENT, onModel);
  }, [refresh]);

  async function moveIntoDatabase(variant: Variant) {
    setMoving(variant);
    setMessage(null);
    setError(null);
    try {
      const version = await publishStartModel(variant);
      setMessage(`${VARIANT_LABEL[variant]} v${version} liegt jetzt in der Datenbank.`);
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Das Übernehmen ist fehlgeschlagen.');
    } finally {
      setMoving(null);
    }
  }

  // offered while the database has nothing, or only an older model without its house
  // file (published the old way) - never over a model someone published from the app
  async function resetSoll() {
    const ist = rows.find((row) => row.variant === 'ist')?.release?.version ?? '?';
    const ok = window.confirm(
      `Den Zielzustand durch eine Kopie des Bestands v${ist} ersetzen, als Version 0.0?\n\n`
      + 'Die bisherige Planung (Wände und Räume im Zielzustand) wird dabei ersetzt. '
      + 'Wer sie behalten will, exportiert sie vorher.',
    );
    if (!ok) return;
    setResetting(true);
    setMessage(null);
    setError(null);
    try {
      await resetSollToIst();
      setMessage('Der Zielzustand ist jetzt eine Kopie des Bestands, Version 0.0. Die anderen Geräte übernehmen ihn beim nächsten Sync.');
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Das Zurücksetzen ist fehlgeschlagen.');
    } finally {
      setResetting(false);
    }
  }

  const missing = rows.filter(({ variant: item, published }) => published !== undefined
    && (!published.exists
      || (!published.hasSource && compareVersions(startVersion(item), published.version ?? '0') > 0)));

  return (
    <section className="card p-4">
      <SettingsHeading title="3D-Modelle">
        Das Modell liegt in der Datenbank. Jedes angemeldete Gerät holt die neueste Fassung
        von selbst und behält sie, auch offline.
      </SettingsHeading>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(({ variant: item, release, cachedAt }) => (
            <tr key={item} className="border-b border-line/60 last:border-0 align-top">
              <td className="py-2 pr-2">{VARIANT_LABEL[item]}</td>
              <td className="py-2 pr-2 text-muted">v{release?.version ?? '–'}</td>
              <td className="py-2 text-muted">
                {release ? release.updatedAt : 'noch nicht auf diesem Gerät'}
                {cachedAt && (
                  <span className="block text-xs">geladen {new Date(cachedAt).toLocaleDateString('de-DE')}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {signedIn && missing.length > 0 && (
        <div className="card p-3 mt-3 text-sm border-l-4 border-l-warn">
          <p>
            In der Datenbank fehlt noch das aktuelle Modell für {missing.map((row) => VARIANT_LABEL[row.variant]).join(' und ')}.
            Einmal übernehmen – danach ist die Datenbank die einzige Quelle.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {missing.map((row) => (
              <button
                key={row.variant}
                type="button"
                className="btn btn-primary"
                onClick={() => void moveIntoDatabase(row.variant)}
                disabled={moving !== null}
              >
                {moving === row.variant
                  ? 'Wird übernommen…'
                  : `${VARIANT_LABEL[row.variant]}: Startstand v${startVersion(row.variant)} übernehmen`}
              </button>
            ))}
          </div>
        </div>
      )}

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

      <ModelExchange signedIn={signedIn} />

      {signedIn && (
        <div className="mt-4 border-t border-line/60 pt-3">
          <h3 className="font-medium text-sm">Zielzustand neu beginnen</h3>
          <p className="text-xs text-muted mt-1">
            Setzt den Zielzustand auf eine Kopie des aktuellen Bestands zurück, als Version 0.0.
            Alle Geräte übernehmen das, obwohl die Nummer kleiner ist als vorher.
          </p>
          <button
            type="button"
            className="btn mt-2"
            onClick={() => void resetSoll()}
            disabled={resetting || moving !== null}
          >
            {resetting ? 'Wird zurückgesetzt…' : 'Zielzustand auf Bestand zurücksetzen (v0.0)'}
          </button>
        </div>
      )}

      {message && <p className="text-sm mt-3">{message}</p>}
      {error && <p className="text-sm text-bad mt-3">{error}</p>}
    </section>
  );
}
