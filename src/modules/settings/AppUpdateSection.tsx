import { useEffect, useState } from 'react';
import { SettingsHeading } from './SettingsHelp';
import { isNative } from '@/platform/index';
import {
  fetchRemoteVersion,
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
 * Installs the newest published version by hand, for when "Später" was tapped once too
 * often. A picker for any other version was tried here and dropped again: Android refuses
 * to install an older versionCode over a newer one no matter what, so a "which version"
 * choice only ever has one usable answer - the newest - which this offers directly instead.
 */
export function AppUpdateSection() {
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [apkReady, setApkReady] = useState<boolean | null>(null);
  const { install, busy, progress, problem } = useVersionInstall();

  useEffect(() => {
    void fetchRemoteVersion().then(setRemote);
  }, []);

  const newest = remote && remote.build > APP_BUILD ? remote : null;

  // The site is published a minute or two before the matching APK is built; offering
  // "Installieren" in that window would fetch the previous release and look successful.
  useEffect(() => {
    if (!isNative() || !newest) {
      setApkReady(null);
      return;
    }
    let active = true;
    void releaseReady(newest.version).then((ready) => {
      if (active) setApkReady(ready);
    });
    return () => {
      active = false;
    };
  }, [newest]);

  const stillBuilding = isNative() && apkReady === false;
  const percent = progress ? percentOf(progress) : null;

  return (
    <section className="card p-4">
      <SettingsHeading title="App">
        Neue Fassungen bietet die App von selbst an. Hier lässt sich die neueste nachträglich
        holen, wenn „Später“ getippt wurde.
      </SettingsHeading>
      <p className="text-sm text-muted">Version {runningVersion()}</p>
      <p className="text-xs text-muted mb-3">
        gebaut am {BUILD_DATE} · Stand {APP_SHA}
      </p>

      {newest ? (
        <>
          <div className="text-xs mb-3">
            <p className="text-ink">
              {newest.version}
              {newest.date ? ` · ${formatDate(newest.date)}` : ''}
            </p>
            {newest.subject && <p className="text-ink/90">{newest.subject}</p>}
            {notesParagraphs(newest.notes).map((paragraph, position) => (
              <p key={position} className="mt-1 whitespace-pre-line text-muted">
                {paragraph}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            onClick={() => void install(newest)}
            disabled={busy || stillBuilding}
          >
            {busy ? 'Wird installiert…' : `Version ${newest.version} installieren`}
          </button>
        </>
      ) : (
        <p className="text-sm text-muted">Diese Fassung ist die neueste veröffentlichte.</p>
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
