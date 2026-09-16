import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { isNative } from '@/platform/index';
import {
  APK_URL,
  checkForUpdate,
  dismissUpdate,
  fetchVersionHistory,
  newerVersions,
  notesParagraphs,
  runningVersion,
  type RemoteVersion,
} from '@/data/appVersion';
import { APP_BUILD } from '@/lib/buildInfo';
import {
  canSelfUpdate,
  formatProgress,
  installUpdate,
  openSourceSettings,
  percentOf,
  UpdateBlocked,
  type UpdateProgress,
} from '@/platform/appUpdate';
import { formatDate } from '@/lib/date';

/**
 * Tells the user when a newer build has been published, and installs it.
 *
 * In the browser the service worker does the work: registerType is 'prompt', so a new
 * build never swaps itself in while a diary entry is half written. The version check on
 * top of it also catches the case where the service worker reports nothing.
 *
 * In the Android app the download runs here, with its own progress, and the finished file
 * goes to Android's installer. The confirmation dialog at the end belongs to the system
 * and stays - a side loaded app may not replace itself unasked.
 */
export function UpdateBanner() {
  const [swReady, setSwReady] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'blocked' | 'failed' | null>(null);
  const [open, setOpen] = useState(false);
  /** what changed since the installed version; fetched when the notes are unfolded */
  const [history, setHistory] = useState<RemoteVersion[] | null>(null);

  const look = useCallback(() => {
    void checkForUpdate().then(setRemote);
  }, []);

  useEffect(() => {
    if (!isNative()) {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setUpdate(() => () => updateSW(true));
          setSwReady(true);
        },
      });
    }

    look();
    // check again whenever the app comes back to the foreground
    const onVisible = () => {
      if (document.visibilityState === 'visible') look();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [look]);

  const visible = swReady || remote !== null;
  if (!visible) return null;

  function later() {
    if (remote) dismissUpdate(remote.build);
    setRemote(null);
    setSwReady(false);
    setProblem(null);
    setProgress(null);
  }

  async function installNative() {
    setBusy(true);
    setProblem(null);
    setProgress({ loaded: 0, total: 0 });
    try {
      await installUpdate(remote?.apk ?? APK_URL, setProgress);
      // from here Android's installer is on screen; the app is replaced and restarts
    } catch (error) {
      setProblem(error instanceof UpdateBlocked ? 'blocked' : 'failed');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (isNative()) {
      if (canSelfUpdate()) {
        void installNative();
        return;
      }
      // an older build without the update plugin: the browser has to do it
      window.open(remote?.apk ?? APK_URL, '_blank');
      return;
    }
    if (update) {
      void update();
      return;
    }
    window.location.reload();
  }

  const percent = progress ? percentOf(progress) : null;

  return (
    <div className="fixed top-[env(safe-area-inset-top)] inset-x-0 z-50 m-2 card p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex-1 text-sm min-w-0 text-left"
          onClick={() => {
            setOpen((shown) => !shown);
            if (history === null) {
              void fetchVersionHistory().then((all) => setHistory(newerVersions(APP_BUILD, all)));
            }
          }}
          aria-expanded={open}
        >
          <span className="block">
            {busy
              ? 'Neue Version wird geladen…'
              : remote
                ? `Version ${remote.version} verfügbar`
                : 'Neue Version verfügbar'}
          </span>
          {busy && progress ? (
            <span className="block text-xs text-muted truncate">{formatProgress(progress)}</span>
          ) : (
            <span className="block text-xs text-muted truncate">
              {remote ? `du hast ${runningVersion()}` : ''}
              {remote?.date ? ` · ${formatDate(remote.date)}` : ''}
              {remote ? ' · tippen für Details' : ''}
            </span>
          )}
        </button>
        {!busy && (
          <>
            <button type="button" className="btn btn-ghost px-3 py-1 min-h-0" onClick={later}>
              Später
            </button>
            <button type="button" className="btn btn-primary px-3 py-1 min-h-0" onClick={apply}>
              {isNative() ? 'Installieren' : 'Neu laden'}
            </button>
          </>
        )}
      </div>

      {open && remote && !busy && (
        <div className="mt-2 text-xs border-t border-line pt-2 max-h-56 overflow-y-auto">
          {(history && history.length > 0 ? history : [remote]).map((entry) => (
            <div key={entry.build} className="mb-3 last:mb-0">
              <p className="text-ink">
                {entry.version}
                {entry.date ? ` · ${formatDate(entry.date)}` : ''}
              </p>
              {entry.subject && <p className="text-ink/90">{entry.subject}</p>}
              {notesParagraphs(entry.notes).map((paragraph, position) => (
                <p key={position} className="mt-1 whitespace-pre-line text-muted">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
          {history === null && <p className="text-muted">Änderungen werden geladen…</p>}
        </div>
      )}

      {busy && (
        <div className="mt-2 h-1.5 rounded bg-black/30 overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: percent === null ? '100%' : `${percent}%` }}
          />
        </div>
      )}

      {problem === 'blocked' && (
        <div className="mt-2 text-xs text-muted">
          Android erlaubt der App das Installieren noch nicht.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void openSourceSettings();
            }}
          >
            Erlaubnis erteilen
          </button>{' '}
          und danach erneut auf „Installieren“ tippen.
        </div>
      )}

      {problem === 'failed' && (
        <div className="mt-2 text-xs text-muted">
          Das Laden hat nicht geklappt – im WLAN meist stabiler. Noch einmal auf
          „Installieren“ tippen.
        </div>
      )}
    </div>
  );
}
