import { useCallback, useEffect, useState } from 'react';
import { SettingsField as Field, SettingsHeading } from './SettingsHelp';
import { activeRelease, MODEL_EVENT } from '@/data/models';
import { VARIANTS, type ReleaseInfo, type Variant } from '@/data/modelRelease';
import { readRelease } from '@/data/modelStore';
import { loadSettings, saveSettings } from '@/lib/settings';
import { ModelExchange } from './ModelExchange';

const VARIANT_LABEL: Record<Variant, string> = { ist: 'Bestand', soll: 'Zielzustand' };

interface Row {
  variant: Variant;
  release: ReleaseInfo | null;
  cachedAt: string | null;
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
    const onModel = () => void refresh();
    window.addEventListener(MODEL_EVENT, onModel);
    return () => window.removeEventListener(MODEL_EVENT, onModel);
  }, [refresh]);

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

      <Field label="Bestand oder Zielzustand">
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
      <p className="text-xs text-muted -mt-1 mb-3">
        Gilt für die ganze App: welches 3D-Modell sich öffnet und welche Räume Tagebuch, Kosten,
        Aufgaben, Notizen und Fotos anbieten – im Bestand z. B. Heizung und Öllager, im
        Zielzustand den Technikraum. Alte Einträge bleiben dabei auffindbar; die Suche findet
        Räume unter allen Namen.
      </p>

      <ModelExchange signedIn={signedIn} />

    </section>
  );
}
