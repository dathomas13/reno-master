/**
 * A camera protocol that survives a crash.
 *
 * The in-app camera can take the whole WebView down with it (a broken lens crashes the
 * camera service, and Android kills the client along with it). Anything kept in React
 * state is gone then, so every line goes to localStorage the moment it is written, and
 * Einstellungen → Kamera → Diagnose reads it back after the restart.
 */

const LOG_KEY = 'reno.cameraLog';
const OPEN_KEY = 'reno.cameraOpen';
const MAX_LINES = 400;

function read(): string[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(lines: string[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(lines.slice(-MAX_LINES)));
  } catch {
    // storage full or blocked - the protocol is best effort
  }
}

function stamp(now: Date): string {
  return now.toISOString().slice(11, 23);
}

export function cameraLog(line: string, now: Date = new Date()): void {
  write([...read(), `${stamp(now)} ${line}`]);
}

export function readCameraLog(): string[] {
  return read();
}

export function clearCameraLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
    localStorage.removeItem(OPEN_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * Marks the camera as open. If the previous session never called `endCameraSession`, the
 * app died with the camera open - that is noted first, so the protocol says so plainly.
 */
export function beginCameraSession(label: string, now: Date = new Date()): void {
  noteUnfinishedCameraSession(now);
  try {
    localStorage.setItem(OPEN_KEY, now.toISOString());
  } catch {
    // best effort
  }
  cameraLog(`──── Kamera geöffnet: ${label}`, now);
}

export function endCameraSession(reason: string, now: Date = new Date()): void {
  cameraLog(`──── Kamera geschlossen: ${reason}`, now);
  try {
    localStorage.removeItem(OPEN_KEY);
  } catch {
    // best effort
  }
}

/** Returns true and logs a note when the last camera session ended without closing. */
export function noteUnfinishedCameraSession(now: Date = new Date()): boolean {
  let openedAt: string | null = null;
  try {
    openedAt = localStorage.getItem(OPEN_KEY);
    if (openedAt) localStorage.removeItem(OPEN_KEY);
  } catch {
    return false;
  }
  if (!openedAt) return false;
  cameraLog(`✖ Vorige Sitzung (geöffnet ${openedAt.slice(11, 19)}) endete ohne Schließen – Absturz?`, now);
  return true;
}
