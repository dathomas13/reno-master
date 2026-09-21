import { useEffect, useMemo, useState } from 'react';
import { SettingsField as Field, SettingsHeading } from './SettingsHelp';
import { isNative } from '@/platform/index';
import {
  fetchVersionHistory,
  newerVersions,
  notesParagraphs,
  releaseReady,
  runningVersion,
  type RemoteVersion,
} from '@/data/appVersion';
import { useVersionInstall } from '@/data/useVersionInstall';
import { APP_BUILD, APP_SHA, BUILD_DATE } from '@/lib/buildInfo';
import { formatProgress, openSourceSettings, percentOf } from '@/platform/appUpdate';
import { formatDate } from '@/lib/date';

/**
 * Installs a version by hand: the newest one, for when "Später" was tapped once too
 * often, or - in the app, where every published version stays downloadable as its own
 * APK - any other version from the list. The web build has no such archive of its own; a
 * browser always runs the one bundle that is currently published, so there the dropdown
 * would offer a choice with nothing behind it.
 */
export function AppUpdateSection() {
  const [history, setHistory] = useState<RemoteVersion[] | null>(null);
  const [selected, setSelected] = useState('');
  const [apkReady, setApkReady] = useState<boolean | null>(null);
  const { install, busy, progress, problem } = useVersionInstall();

  useEffect(() => {
    void fetchVersionHistory().then((all) => {
      setHistory(all);
      const running = all.find((entry) => entry.version === runningVersion());
      setSelected(running?.version ?? all[0]?.version ?? '');
    });
  }, []);

  const sorted = useMemo(
    () => (history ? [...history].sort((a, b) => b.build - a.build) : []),
    [history],
  );
  const newest = history ? (newerVersions(APP_BUILD, history)[0] ?? null) : null;
  const target = sorted.find((entry) => entry.version === selected) ?? null;
  const isRunning = target !== null && target.version === runningVersion();

  // The site is published a minute or two before the matching APK is built; offering
  // "Installieren" in that window would fetch the previous release and look successful.
  useEffect(() => {
    if (!isNative() || !target || isRunning) {
      setApkReady(null);
      return;
    }
    let active = true;
    void releaseReady(target.version).then((ready) => {
      if (active) setApkReady(ready);
    });
    return () => {
      active = false;
    };
  }, [target, isRunning]);

  const stillBuilding = isNative() && apkReady === false;
  const percent = progress ? percentOf(progress) : null;

  return (
    <section className="card p-4">
      <SettingsHeading title="App">
        Neue Fassungen bietet die App von selbst an. Hier lässt sich die neueste nachträglich
        holen, wenn „Später“ getippt wurde
        {isNative() ? ', oder gezielt eine andere Fassung installieren' : ''}.
      </SettingsHeading>
      <p className="text-sm text-muted">Version {runningVersion()}</p>
      <p className="text-xs text-muted mb-3">
        gebaut am {BUILD_DATE} · Stand {APP_SHA}
      </p>

      {newest && (
        <button
          type="button"
          className="btn"
          onClick={() => void install(newest)}
          disabled={busy}
        >
          Neueste Version installieren ({newest.version})
        </button>
      )}

      {isNative() && history && history.length > 0 && (
        <>
          <Field label="Andere Version">
            <select
              className="field"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {sorted.map((entry) => (
                <option key={entry.version} value={entry.version}>
                  {entry.version}
                  {entry.version === runningVersion() ? ' · installiert' : ''}
                  {entry.subject ? ` – ${entry.subject}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {target && (
            <div className="text-xs mb-3">
              <p className="text-ink">
                {target.version}
                {target.date ? ` · ${formatDate(target.date)}` : ''}
              </p>
              {target.subject && <p className="text-ink/90">{target.subject}</p>}
              {notesParagraphs(target.notes).map((paragraph, position) => (
                <p key={position} className="mt-1 whitespace-pre-line text-muted">
                  {paragraph}
                </p>
              ))}
              {!target.notes && !target.subject && (
                <p className="mt-1 text-muted">Keine Hinweise zu dieser Fassung.</p>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            onClick={() => target && void install(target)}
            disabled={busy || isRunning || stillBuilding || !target}
          >
            {busy ? 'Wird installiert…' : 'Installieren'}
          </button>
        </>
      )}

      {!isNative() && (
        <p className="text-xs text-muted mt-2">
          Eine andere Fassung wählen geht nur in der installierten App – im Browser läuft immer
          die zuletzt veröffentlichte.
        </p>
      )}

      {busy && (
        <>
          <div className="mt-2 h-1.5 rounded bg-black/30 overflow-hidden" aria-hidden="true">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: percent === null ? '100%' : `${percent}%` }}
            />
          </div>
          {progress && <p className="text-xs text-muted mt-1">{formatProgress(progress)}</p>}
        </>
      )}

      {stillBuilding && !busy && (
        <p className="text-xs text-muted mt-2">
          Die App-Datei zu dieser Fassung wird gerade noch gebaut – das dauert ein bis zwei
          Minuten.
        </p>
      )}

      {problem === 'notyet' && (
        <p className="text-xs text-muted mt-2">
          Die App-Datei war noch nicht fertig. In ein, zwei Minuten noch einmal auf
          „Installieren“ tippen.
        </p>
      )}
      {problem === 'blocked' && (
        <p className="text-xs text-muted mt-2">
          Android erlaubt der App das Installieren noch nicht.{' '}
          <button type="button" className="underline" onClick={() => void openSourceSettings()}>
            Erlaubnis erteilen
          </button>{' '}
          und danach erneut auf „Installieren“ tippen.
        </p>
      )}
      {problem === 'failed' && (
        <p className="text-xs text-muted mt-2">
          Das Laden hat nicht geklappt – im WLAN meist stabiler. Noch einmal auf
          „Installieren“ tippen.
        </p>
      )}
    </section>
  );
}
