/**
 * Installs one version - in the app by downloading its APK, in the browser by activating
 * the service worker that is already waiting. Shared by the update banner and the version
 * section in Settings, so a chosen version behaves exactly like the banner's own offer.
 */
import { useCallback, useState } from 'react';
import { isNative } from '@/platform/index';
import { apkFor, type RemoteVersion } from '@/data/appVersion';
import {
  canSelfUpdate,
  installUpdate,
  UpdateBlocked,
  type UpdateProgress,
} from '@/platform/appUpdate';
import { applySwUpdate, swUpdateReady } from '@/platform/swUpdate';

type InstallProblem = 'blocked' | 'failed' | 'notyet';

export function useVersionInstall() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [problem, setProblem] = useState<InstallProblem | null>(null);

  const install = useCallback(async (target: RemoteVersion | null) => {
    if (isNative()) {
      if (!canSelfUpdate()) {
        // an older build without the update plugin: the browser has to do it
        window.open(apkFor(target), '_blank');
        return;
      }
      setBusy(true);
      setProblem(null);
      setProgress({ loaded: 0, total: 0 });
      try {
        await installUpdate(apkFor(target), setProgress);
        // from here Android's installer is on screen; the app is replaced and restarts
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        setProblem(
          error instanceof UpdateBlocked ? 'blocked' : /\b404\b/.test(message) ? 'notyet' : 'failed',
        );
        setProgress(null);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (swUpdateReady()) {
      applySwUpdate();
      return;
    }
    // the site has a newer version.json but the service worker has not caught up yet
    window.location.reload();
  }, []);

  return { install, busy, progress, problem, setProblem, setProgress };
}
