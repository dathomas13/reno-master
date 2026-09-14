/**
 * Checks whether a newer build of the app has been published.
 *
 * Both the web version and the Android app are built from the same commit, so the commit
 * is the identity: the build writes its short SHA into the bundle, the deployment writes
 * the same SHA into version.json. Differ means there is something newer.
 *
 * In the browser a reload is enough, the service worker swaps the assets. The Android app
 * cannot install an APK over itself without the system dialog, so it opens the download
 * and Android takes over from there.
 */
import { isNative } from '@/platform/index';
import { APP_VERSION } from '@/lib/buildInfo';

/** the published site is the source of truth, also for the app, which has no server */
const PUBLIC_URL = 'https://dathomas13.github.io/reno-master/';

export interface RemoteVersion {
  sha: string;
  date: string;
  subject: string;
  apk?: string;
}

const DISMISSED_KEY = 'reno.update.dismissed';

export function versionUrl(): string {
  return isNative() ? `${PUBLIC_URL}version.json` : `${import.meta.env.BASE_URL}version.json`;
}

/**
 * True when the published build differs from the running one and was not waved away.
 * Kept free of side effects so it can be tested directly.
 */
export function shouldOfferUpdate(
  local: string,
  remote: RemoteVersion | null,
  dismissed: string | null,
): boolean {
  if (!remote?.sha) return false;
  if (!local || local === 'dev') return false; // a local dev build is always "different"
  if (remote.sha === local) return false;
  return remote.sha !== dismissed;
}

export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  try {
    const response = await fetch(versionUrl(), { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<RemoteVersion>;
    return data.sha ? { sha: data.sha, date: data.date ?? '', subject: data.subject ?? '', apk: data.apk } : null;
  } catch {
    // offline, or the site is not reachable - simply no update today
    return null;
  }
}

export function dismissedSha(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function dismissUpdate(sha: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, sha);
  } catch {
    // private mode: the banner comes back next time, which is fine
  }
}

/** looks for a newer build; returns it only when it is worth showing */
export async function checkForUpdate(): Promise<RemoteVersion | null> {
  const remote = await fetchRemoteVersion();
  return shouldOfferUpdate(APP_VERSION, remote, dismissedSha()) ? remote : null;
}

/** where the newest APK lives; the release tracks the latest build */
export const APK_URL = 'https://github.com/dathomas13/reno-master/releases/latest/download/app-debug.apk';
