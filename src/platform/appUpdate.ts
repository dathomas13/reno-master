/**
 * Installing a new version from inside the app.
 *
 * Handing the user a link means leaving the app, and a browser download that stalls at
 * the last byte leaves them with nothing. So the app fetches the APK itself, shows its
 * own progress, and passes the finished file to Android's package installer.
 *
 * The last step is a system dialog ("Update this app?") and it cannot be skipped: only
 * the device owner may replace an app without asking. Everything before it is ours.
 */
import { isNative } from '@/platform/index';

export interface UpdateProgress {
  loaded: number;
  total: number;
}

interface AppUpdatePlugin {
  canInstall(): Promise<{ granted: boolean }>;
  openSourceSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<{ path: string }>;
  addListener(
    event: 'progress',
    handler: (progress: UpdateProgress) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

function plugin(): AppUpdatePlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins;
  return (plugins?.AppUpdate as AppUpdatePlugin | undefined) ?? null;
}

/** true when the running build can install the next one itself */
export function canSelfUpdate(): boolean {
  return isNative() && plugin() !== null;
}

/**
 * Percentage for the progress bar. Separate and pure because a wrong number here is the
 * one thing the user stares at while waiting.
 */
export function percentOf({ loaded, total }: UpdateProgress): number | null {
  if (!Number.isFinite(loaded) || loaded < 0) return null;
  if (!Number.isFinite(total) || total <= 0) return null; // server sent no length
  return Math.min(100, Math.round((loaded / total) * 100));
}

/** "3,2 von 7,2 MB" - what is actually on the device so far */
export function formatProgress({ loaded, total }: UpdateProgress): string {
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
  if (!Number.isFinite(total) || total <= 0) return `${mb(loaded)} MB`;
  return `${mb(loaded)} von ${mb(total)} MB`;
}

export class UpdateBlocked extends Error {
  constructor() {
    super('Diesem Gerät fehlt noch die Erlaubnis, Apps aus dieser Quelle zu installieren');
    this.name = 'UpdateBlocked';
  }
}

/** opens the system page where installing from this app is allowed */
export async function openSourceSettings(): Promise<void> {
  await plugin()?.openSourceSettings();
}

/**
 * Downloads the APK and hands it to the installer. Rejects with UpdateBlocked when the
 * permission is missing, so the caller can offer the settings page instead of an error.
 */
export async function installUpdate(
  url: string,
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  const native = plugin();
  if (!native) throw new Error('Diese Fassung kann sich nicht selbst aktualisieren');

  const { granted } = await native.canInstall();
  if (!granted) throw new UpdateBlocked();

  const listener = await native.addListener('progress', onProgress);
  try {
    await native.downloadAndInstall({ url });
  } finally {
    await listener.remove();
  }
}
