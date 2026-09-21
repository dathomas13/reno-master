/**
 * A log that survives the thing it was watching.
 *
 * Grew out of chasing a camera fault where the app died mid-operation and everything kept in
 * React state or in the console went with it. Anything written here lands in localStorage the
 * moment it is written, so it is still readable after a crash, a reload or a restart of the
 * app - which is the only reason that fault was ever found.
 *
 * Nothing about it is camera specific. Pick a scope, write sentences, read them back later:
 *
 *   debugLog('outbox', `Upload ${job.id} nach ${attempts} Versuchen aufgegeben`);
 *   readDebugLog('outbox')      // only that scope
 *   readDebugLog()              // everything, in order
 *
 * For an operation that can take the app down with it, bracket it: beginSession writes an
 * opening line and leaves a marker, endSession clears the marker, and the next beginSession
 * notes in the log that the previous one never finished. A crash therefore leaves a trace even
 * though nothing could run at the moment it happened.
 *
 * What it is not: a place for chatter. Every line costs a write and pushes an older line out
 * of the buffer, so log decisions and failures, not progress.
 */

const LOG_KEY = 'reno.debugLog';
const OPEN_PREFIX = 'reno.debugOpen.';
const MAX_LINES = 600;

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
    // storage full or blocked - the log is best effort and never worth an exception
  }
}

function stamp(now: Date): string {
  return now.toISOString().slice(11, 23);
}

export function debugLog(scope: string, line: string, now: Date = new Date()): void {
  write([...read(), `${stamp(now)} [${scope}] ${line}`]);
}

/** every line, or only one scope's, oldest first */
export function readDebugLog(scope?: string): string[] {
  const lines = read();
  return scope ? lines.filter((line) => line.includes(`[${scope}]`)) : lines;
}

export function clearDebugLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(OPEN_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // nothing to clear
  }
}

/**
 * Marks an operation as running. If the previous one never called endSession, the app died
 * while it was open - that is noted first, so the log says so plainly instead of just ending.
 */
export function beginSession(scope: string, label: string, now: Date = new Date()): void {
  noteUnfinishedSession(scope, now);
  try {
    localStorage.setItem(OPEN_PREFIX + scope, now.toISOString());
  } catch {
    // best effort
  }
  debugLog(scope, `──── begonnen: ${label}`, now);
}

export function endSession(scope: string, reason: string, now: Date = new Date()): void {
  debugLog(scope, `──── beendet: ${reason}`, now);
  try {
    localStorage.removeItem(OPEN_PREFIX + scope);
  } catch {
    // best effort
  }
}

/** true and a note in the log when the last session of this scope ended without closing */
export function noteUnfinishedSession(scope: string, now: Date = new Date()): boolean {
  let openedAt: string | null = null;
  try {
    openedAt = localStorage.getItem(OPEN_PREFIX + scope);
    if (openedAt) localStorage.removeItem(OPEN_PREFIX + scope);
  } catch {
    return false;
  }
  if (!openedAt) return false;
  debugLog(scope, `✖ Vorige Sitzung (begonnen ${openedAt.slice(11, 19)}) endete ohne Schließen – Absturz?`, now);
  return true;
}

/**
 * Sends anything that would otherwise only reach the console into the log as well.
 *
 * On a phone there is no console to look at, so an error that happens out in the field is
 * gone unless something wrote it down. Called once from main.tsx.
 */
export function captureGlobalErrors(): void {
  window.addEventListener('error', (event) => {
    debugLog('fehler', `${event.message} (${event.filename}:${event.lineno})`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { name?: string; message?: string } | undefined;
    debugLog('fehler', `unbehandelt: ${reason?.name ?? ''} ${reason?.message ?? String(event.reason)}`);
  });
}
