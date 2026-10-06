/**
 * Sends the device's log to the file worker, so it can be read without the phone in hand.
 *
 * The log in `debugLog.ts` survives crashes, but it stays on the device - and the device is
 * exactly what nobody debugging this app can look at. So every now and then the whole log
 * goes to R2 as `diag/<device>.json`, one file per device, overwritten each time. A
 * development session reads it back over the worker's `/diag` route with a token of its
 * own (`tools/diag/read_log.py`); the app never reads it.
 *
 * It goes out when the app is put away, a short while after the start and every quarter of
 * an hour while it stays open - but only when something new was written, so an idle app
 * sends nothing. Offline it simply fails and tries again next time; nothing waits for it.
 */
import { APP_BUILD, APP_SHA, APP_VERSION } from '@/lib/buildInfo';
import { auth } from '@/firebase/app';
import { isNative } from '@/platform/index';
import { readDebugLog } from './debugLog';
import { fileStoreReady, putFile } from './fileStore';

const DEVICE_KEY = 'reno.diag.device';
const STATE_KEY = 'reno.diag.upload';
const UPLOAD_TIMEOUT_MS = 20_000;
const START_DELAY_MS = 15_000;
const PERIOD_MS = 15 * 60_000;
/** the app is put away often; one upload per few minutes is plenty */
const MIN_GAP_MS = 2 * 60_000;

export interface DiagUploadState {
  /** ISO time of the last successful upload */
  at?: string;
  /** the newest line that upload carried - unchanged means nothing new to send */
  lastLine?: string;
  /** the last failure, kept for the settings screen and never written to the log itself */
  error?: string;
}

function readState(): DiagUploadState {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as DiagUploadState;
  } catch {
    return {};
  }
}

function writeState(state: DiagUploadState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // best effort
  }
}

export function diagUploadState(): DiagUploadState {
  return readState();
}

/** a short name for this device that stays the same across restarts and updates */
export function diagDeviceId(): string {
  try {
    const known = localStorage.getItem(DEVICE_KEY);
    if (known) return known;
    const id = `${isNative() ? 'app' : 'web'}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return isNative() ? 'app-ohne-speicher' : 'web-ohne-speicher';
  }
}

/** whether there is anything to send; pure, so it can be tested */
export function uploadDue(
  state: DiagUploadState,
  lastLine: string | undefined,
  now: number,
  force = false,
): boolean {
  if (!lastLine) return false;
  if (force) return true;
  if (state.lastLine === lastLine) return false;
  const last = state.at ? Date.parse(state.at) : 0;
  return now - last >= MIN_GAP_MS;
}

export interface DiagReport {
  device: string;
  version: string;
  build: number;
  sha: string;
  platform: 'app' | 'web';
  userAgent: string;
  account: string | null;
  timeZone: string;
  uploadedAt: string;
  reason: string;
  lines: string[];
}

export function buildReport(reason: string, now = new Date()): DiagReport {
  return {
    device: diagDeviceId(),
    version: APP_VERSION,
    build: APP_BUILD,
    sha: APP_SHA,
    platform: isNative() ? 'app' : 'web',
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    account: auth.currentUser?.email ?? null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    uploadedAt: now.toISOString(),
    reason,
    lines: readDebugLog(),
  };
}

let running: Promise<boolean> | null = null;

/**
 * Sends the log if there is something new (or always, with `force`). Never throws: the
 * answer is whether it went out, and the reason for a failure lands in the upload state.
 */
export function uploadDiagnostics(reason: string, force = false): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    const state = readState();
    const lines = readDebugLog();
    const lastLine = lines.at(-1);
    if (!fileStoreReady() || !auth.currentUser) return false;
    if (!uploadDue(state, lastLine, Date.now(), force)) return false;
    try {
      const report = buildReport(reason);
      const blob = new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' });
      await putFile(`diag/${report.device}.json`, blob, 'application/json', UPLOAD_TIMEOUT_MS);
      writeState({ at: report.uploadedAt, lastLine });
      return true;
    } catch (error) {
      writeState({ ...state, error: `${new Date().toISOString()} ${error instanceof Error ? error.message : String(error)}` });
      return false;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** started once the account is known; returns the stop function */
export function startDiagUpload(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void uploadDiagnostics('App in den Hintergrund');
  };
  const first = window.setTimeout(() => void uploadDiagnostics('Start'), START_DELAY_MS);
  const period = window.setInterval(() => void uploadDiagnostics('regelmäßig'), PERIOD_MS);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(period);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
