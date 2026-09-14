import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { isNative } from '@/platform/index';
import { checkForUpdate, dismissUpdate, APK_URL, type RemoteVersion } from '@/data/appVersion';
import { formatDate } from '@/lib/date';

/**
 * Tells the user when a newer build has been published.
 *
 * In the browser the service worker does the work: registerType is 'prompt', so a new
 * build never swaps itself in while a diary entry is half written. The version check on
 * top of it also catches the case where the service worker reports nothing.
 *
 * In the Android app there is no service worker and no way to install an APK over itself
 * without the system dialog, so the button opens the download and Android takes over.
 */
export function UpdateBanner() {
  const [swReady, setSwReady] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [remote, setRemote] = useState<RemoteVersion | null>(null);

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
    if (remote) dismissUpdate(remote.sha);
    setRemote(null);
    setSwReady(false);
  }

  function apply() {
    if (isNative()) {
      // Android shows its installer; a sideloaded app cannot install silently
      window.open(remote?.apk ?? APK_URL, '_blank');
      return;
    }
    if (update) {
      void update();
      return;
    }
    window.location.reload();
  }

  return (
    <div className="fixed top-[env(safe-area-inset-top)] inset-x-0 z-50 m-2 card p-3 flex items-center gap-3">
      <span className="flex-1 text-sm min-w-0">
        <span className="block">Neue Version verfügbar</span>
        {remote?.date && (
          <span className="block text-xs text-muted truncate">
            {formatDate(remote.date)}
            {remote.subject ? ` · ${remote.subject}` : ''}
          </span>
        )}
      </span>
      <button type="button" className="btn btn-ghost px-3 py-1 min-h-0" onClick={later}>
        Später
      </button>
      <button type="button" className="btn btn-primary px-3 py-1 min-h-0" onClick={apply}>
        {isNative() ? 'Laden' : 'Neu laden'}
      </button>
    </div>
  );
}
