/**
 * Checks whether a newer build of the app has been published.
 *
 * Every build carries the number of commits it was made from, in the web bundle and in
 * the published version.json alike. That number is the only thing compared: it counts
 * up, so "newer" means larger. Comparing the commit hash instead - which is what this
 * did first - has no direction, and a version.json that lagged behind made the app offer
 * yesterday's build as an update, over and over, because installing it never made the
 * two hashes equal.
 */
import { isNative } from '@/platform/index';
import { APP_BUILD, APP_VERSION } from '@/lib/buildInfo';

/** the published site is the source of truth, also for the app, which has no server */
const PUBLIC_URL = 'https://dathomas13.github.io/reno-master/';

export interface RemoteVersion {
  /** "0.9.34" */
  version: string;
  /** commits behind that version; larger is newer */
  build: number;
  sha: string;
  date: string;
  /** headline of what changed */
  subject: string;
  /** the rest of the commit message, if there was one */
  notes?: string;
  apk?: string;
}

const DISMISSED_KEY = 'reno.update.dismissed';

/**
 * A file on the published site.
 *
 * The web app reads it from its own origin; the APK has no server of its own, so it asks
 * the published site. Also how the model channel reaches a new model without a new APK.
 */
export function publishedFileUrl(file: string): string {
  return isNative() ? `${PUBLIC_URL}${file}` : `${import.meta.env.BASE_URL}${file}`;
}

export function versionUrl(): string {
  return publishedFileUrl('version.json');
}

/** every published version, newest first */
export function historyUrl(): string {
  return publishedFileUrl('versions.json');
}

/**
 * True when the published build is newer than the running one and was not waved away.
 * Kept free of side effects so it can be tested directly.
 */
export function shouldOfferUpdate(
  localBuild: number,
  remote: RemoteVersion | null,
  dismissed: string | null,
): boolean {
  if (!remote || !Number.isFinite(remote.build)) return false;
  if (remote.build <= localBuild) return false;
  return String(remote.build) !== dismissed;
}

export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  try {
    const response = await fetch(versionUrl(), { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<RemoteVersion>;
    const build = Number(data.build);
    if (!Number.isFinite(build)) return null;
    return {
      version: data.version ?? `Build ${build}`,
      build,
      sha: data.sha ?? '',
      date: data.date ?? '',
      subject: data.subject ?? '',
      notes: data.notes,
      apk: data.apk,
    };
  } catch {
    // offline, or the site is not reachable - simply no update today
    return null;
  }
}

/**
 * The versions between the one running and the newest.
 *
 * Someone who skips two updates should still read what the skipped one brought: those
 * changes are in the app they are installing, whether that version was ever on the phone
 * or not.
 */
export function newerVersions(localBuild: number, history: RemoteVersion[]): RemoteVersion[] {
  return history
    .filter((entry) => Number.isFinite(entry.build) && entry.build > localBuild)
    .sort((a, b) => b.build - a.build)
    .slice(0, 12);
}

/** the published history; empty when the site does not carry one (yet) */
export async function fetchVersionHistory(): Promise<RemoteVersion[]> {
  try {
    const response = await fetch(historyUrl(), { cache: 'no-store' });
    if (!response.ok) return [];
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((entry) => entry as Partial<RemoteVersion>)
      .filter((entry) => Number.isFinite(Number(entry.build)))
      .map((entry) => ({
        version: entry.version ?? '',
        build: Number(entry.build),
        sha: entry.sha ?? '',
        date: entry.date ?? '',
        subject: entry.subject ?? '',
        notes: entry.notes,
      }));
  } catch {
    return [];
  }
}

/**
 * The notes as the banner should show them.
 *
 * What is stored is a text file, hard wrapped at some width that has nothing to do with
 * a phone screen. Printing it as it is would break every line twice. So the lines of a
 * paragraph are joined again and only the blank lines survive - except in a list, where
 * every item keeps its own line.
 */
export function notesParagraphs(notes: string | undefined): string[] {
  if (!notes?.trim()) return [];
  return notes
    .split(/\n\s*\n/)
    .map((block) => {
      const out: string[] = [];
      for (const line of block.split('\n').map((item) => item.trim()).filter(Boolean)) {
        if (!out.length || /^([-*•]|\d+[.)])\s/.test(line)) out.push(line);
        else out[out.length - 1] += ` ${line}`;
      }
      return out.join('\n');
    })
    .filter(Boolean);
}

export function dismissedBuild(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function dismissUpdate(build: number): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(build));
  } catch {
    // private mode: the banner comes back next time, which is fine
  }
}

/** looks for a newer build; returns it only when it is worth showing */
export async function checkForUpdate(): Promise<RemoteVersion | null> {
  const remote = await fetchRemoteVersion();
  return shouldOfferUpdate(APP_BUILD, remote, dismissedBuild()) ? remote : null;
}

/** what the running build calls itself, for the settings screen and the banner */
export function runningVersion(): string {
  return APP_VERSION;
}

/** where the newest APK lives; the release tracks the latest build */
export const APK_URL = 'https://github.com/dathomas13/reno-master/releases/latest/download/reno-master.apk';
