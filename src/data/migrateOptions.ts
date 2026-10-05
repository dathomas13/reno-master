/**
 * Runs the one-off switch from display texts to ids (KENNUNGEN.md). The planning is in
 * migrationPlan.ts, the backup in migrationBackup.ts; this file reads from the server,
 * writes, and keeps the log.
 *
 * The trigger is the old document `meta/lists`: while it exists on the server, the switch
 * is due; it is deleted as the very last step, so afterwards nothing is left in the settings
 * and the switch never runs again. Before anything changes, the old values go into backup
 * documents (`meta/umstellung-sicherung-*`), which the next starts delete after
 * BACKUP_RETENTION_DAYS. An aborted run leaves `meta/lists` standing and the next start
 * tries again (idempotent; the retry adds a further backup part).
 *
 * Other devices and accounts are not waited for: ids come from the names, a value that is
 * an id stays, and the app reads old texts as well as ids.
 */
import { useEffect } from 'react';
import {
  commitPatches,
  mergeDocConfirmed,
  mergeDocWithArrayUnionConfirmed,
  readCollectionFromServer,
  readDocFromServer,
  removeDoc,
  replaceDocConfirmed,
} from '@/firebase/db';
import { COL } from './types';
import { OPTION_SET_KEYS } from './options';
import { REMOVE_FIELD, planMigration, type MigrationRecords } from './migrationPlan';
import {
  BACKUP_RETENTION_DAYS,
  backupPartId,
  isBackupExpired,
  makeRunId,
  planBackup,
  planRestore,
  type BackupPart,
} from './migrationBackup';
import { beginSession, debugLog, endSession } from '@/platform/debugLog';

const SCOPE = 'optionen';

/** the index document: `{ createdAt, parts: [ids of the backup part documents] }` */
const BACKUP_INDEX = 'umstellung-sicherung';

/** left over from the first version of the switch, which marked itself done on the device */
const OLD_DONE_KEY = 'reno-options-migrated';

export type MigrationOutcome = 'migrated' | 'current' | 'offline' | 'failed';
export type BackupCleanupOutcome = 'none' | 'kept' | 'deleted' | 'offline' | 'failed';

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function forgetOldMarker(): void {
  try {
    localStorage.removeItem(OLD_DONE_KEY);
  } catch {
    // storage may be blocked; the marker is not read any more anyway
  }
}

/** the part document ids an index lists */
function partIdsOf(index: { parts?: unknown } | null): string[] {
  const parts = index?.parts;
  return Array.isArray(parts) ? parts.filter((id): id is string => typeof id === 'string') : [];
}

let running: Promise<MigrationOutcome> | null = null;

/** converts everything if `meta/lists` still exists on the server: backup, options, records, then removes `meta/lists` */
export function runOptionsMigration(): Promise<MigrationOutcome> {
  if (!running) {
    running = migrate().finally(() => {
      running = null;
    });
  }
  return running;
}

async function migrate(): Promise<MigrationOutcome> {
  if (isOffline()) return 'offline';
  beginSession(SCOPE, 'Umstellung auf Kennungen');
  try {
    forgetOldMarker();
    const lists = await readDocFromServer(COL.meta, 'lists');
    if (!lists) {
      endSession(SCOPE, 'nichts zu tun');
      return 'current';
    }

    const options = await readDocFromServer(COL.meta, 'options');
    const records: MigrationRecords = {
      diary: await readCollectionFromServer(COL.diary),
      costs: await readCollectionFromServer(COL.costs),
      tasks: await readCollectionFromServer(COL.tasks),
      contacts: await readCollectionFromServer(COL.contacts),
      contactLogs: await readCollectionFromServer(COL.contactLogs),
      trades: await readCollectionFromServer(COL.trades),
      phases: await readCollectionFromServer(COL.phases),
    };
    debugLog(
      SCOPE,
      'gelesen: ' + Object.entries(records).map(([name, rows]) => `${name} ${rows.length}`).join(', '),
    );

    const plan = planMigration({ lists, options, records });
    debugLog(SCOPE, `Plan: ${plan.updates.length} Datensätze zu ändern`);

    // nothing changes before the old values are safe on the server
    const runId = makeRunId(new Date());
    const parts = planBackup(runId, plan, records, lists, options);
    const partIds: string[] = [];
    for (const part of parts) {
      const id = backupPartId(runId, part.part);
      await replaceDocConfirmed(COL.meta, id, { ...part });
      partIds.push(id);
    }
    await mergeDocWithArrayUnionConfirmed(
      COL.meta,
      BACKUP_INDEX,
      { createdAt: new Date().toISOString() },
      'parts',
      partIds,
    );
    debugLog(SCOPE, `Sicherung ${runId} geschrieben (${parts.length} Teile)`);

    // the sets first: a record must never point at an id that is not in the document yet
    const sets: Record<string, unknown> = {};
    for (const key of OPTION_SET_KEYS) {
      sets[key] = plan.options[key].map((entry) =>
        entry.archived ? { id: entry.id, label: entry.label, archived: true } : { id: entry.id, label: entry.label },
      );
    }
    const oldMarkers = ['migrated', 'migratedAt'].filter((field) => options !== null && field in options);
    await mergeDocConfirmed(COL.meta, 'options', sets, oldMarkers);
    debugLog(SCOPE, 'meta/options geschrieben');

    await commitPatches(plan.updates, REMOVE_FIELD, (done, total) => debugLog(SCOPE, `Datensätze ${done}/${total}`));

    // last: this is what says "done"
    await removeDoc(COL.meta, 'lists');
    endSession(SCOPE, `fertig, ${plan.updates.length} Datensätze`);
    return 'migrated';
  } catch (error) {
    debugLog(SCOPE, `Fehler: ${errorText(error)}`);
    endSession(SCOPE, 'abgebrochen, nächster Start versucht es erneut');
    return 'failed';
  }
}

let cleaning: Promise<BackupCleanupOutcome> | null = null;

/**
 * Deletes the backup once it is older than BACKUP_RETENTION_DAYS and the switch is finished
 * (`meta/lists` is gone). Anything else leaves it alone. No screen, no message: log only.
 */
export function cleanupOptionsBackup(): Promise<BackupCleanupOutcome> {
  if (!cleaning) {
    cleaning = cleanup().finally(() => {
      cleaning = null;
    });
  }
  return cleaning;
}

async function cleanup(): Promise<BackupCleanupOutcome> {
  if (isOffline()) return 'offline';
  try {
    const index = await readDocFromServer(COL.meta, BACKUP_INDEX);
    if (!index) return 'none';
    if (!isBackupExpired(index.createdAt, new Date())) return 'kept';
    if (await readDocFromServer(COL.meta, 'lists')) {
      debugLog(SCOPE, 'Sicherung bleibt: Umstellung nicht abgeschlossen');
      return 'kept';
    }
    const ids = partIdsOf(index);
    for (const id of ids) await removeDoc(COL.meta, id);
    await removeDoc(COL.meta, BACKUP_INDEX);
    debugLog(SCOPE, `Sicherung gelöscht (älter als ${BACKUP_RETENTION_DAYS} Tage, ${ids.length} Teile)`);
    return 'deleted';
  } catch (error) {
    debugLog(SCOPE, `Aufräumen der Sicherung fehlgeschlagen: ${errorText(error)}`);
    return 'failed';
  }
}

/**
 * Emergency exit, no screen and never called by the app itself: put the old values back.
 * Needs a release of its own that calls this once (and, because `meta/lists` is back
 * afterwards, has the automatic switch off - otherwise the next start converts again).
 * Reads the index and the parts from the server, writes the records back (the earliest run
 * wins), restores `meta/lists` and sets `meta/options` to the saved state, or deletes it if
 * it did not exist then. The backup stays until it expires.
 */
export async function restoreOptionsBackup(): Promise<number> {
  beginSession(SCOPE, 'Wiederherstellen der Sicherung');
  try {
    const index = await readDocFromServer(COL.meta, BACKUP_INDEX);
    const ids = partIdsOf(index);
    if (!ids.length) throw new Error('keine Sicherung gefunden');
    const parts: BackupPart[] = [];
    for (const id of ids) {
      const data = await readDocFromServer(COL.meta, id);
      if (data) parts.push(data as unknown as BackupPart);
    }
    const plan = planRestore(parts);
    if (plan.lists) await replaceDocConfirmed(COL.meta, 'lists', plan.lists);
    const count = await commitPatches(plan.updates, REMOVE_FIELD, (done, total) => debugLog(SCOPE, `Wiederherstellen ${done}/${total}`));
    if (plan.options) await replaceDocConfirmed(COL.meta, 'options', plan.options);
    else await removeDoc(COL.meta, 'options');
    endSession(SCOPE, `wiederhergestellt, ${count} Datensätze`);
    return count;
  } catch (error) {
    debugLog(SCOPE, `Wiederherstellen fehlgeschlagen: ${errorText(error)}`);
    endSession(SCOPE, 'abgebrochen');
    throw error;
  }
}

/**
 * Runs the switch once after login, as soon as the device is online, and then looks after
 * the backup. A failed run is not retried until the next start.
 */
export function useOptionsMigration(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let waiting = false;
    const start = () => {
      void runOptionsMigration()
        .then((outcome) => {
          if (cancelled) return undefined;
          if (outcome === 'offline') {
            wait();
            return undefined;
          }
          return cleanupOptionsBackup();
        })
        .catch(() => undefined);
    };
    const onOnline = () => {
      window.removeEventListener('online', onOnline);
      waiting = false;
      if (!cancelled) start();
    };
    const wait = () => {
      if (waiting) return;
      waiting = true;
      window.addEventListener('online', onOnline);
    };
    start();
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [enabled]);
}
