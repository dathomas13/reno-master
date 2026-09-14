import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { isNative } from '@/platform';

/**
 * The service worker is registered with registerType 'prompt', so a new build never
 * swaps itself in while a diary entry is half written. The user decides.
 */
export function UpdateBanner() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    // in the Android app the assets ship with the bundle, there is nothing to cache and
    // no new version to pick up - updates come through a new APK
    if (isNative()) return;
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdate(() => () => updateSW(true));
        setNeedsRefresh(true);
      },
    });
  }, []);

  if (!needsRefresh) return null;

  return (
    <div className="fixed top-[env(safe-area-inset-top)] inset-x-0 z-50 m-2 card p-3 flex items-center gap-3">
      <span className="flex-1 text-sm">Neue Version verfügbar.</span>
      <button type="button" className="btn btn-ghost" onClick={() => setNeedsRefresh(false)}>
        Später
      </button>
      <button type="button" className="btn btn-primary" onClick={() => void update?.()}>
        Neu laden
      </button>
    </div>
  );
}
