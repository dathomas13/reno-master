/**
 * Runs the switch from display texts to ids once per project (KENNUNGEN.md). The planning
 * is in migrationPlan.ts; this file reads from the server, writes, and keeps the log.
 *
 * Safe on two devices at once (ids come from the names, a value that is an id stays) and
 * safe to abort: `migrated` is written last, so an interrupted run starts again.
 */
import { useEffect } from 'react';
import {
  commitPatches,
  mergeDocConfirmed,
  readCollectionFromServer,
  readDocFromServer,
} from '@/firebase/db';
import { COL } from './types';
import { OPTION_SET_KEYS } from './options';
import { MIGRATION_VERSION, REMOVE_FIELD, planMigration, type MigrationRecords } from './migrationPlan';
import { beginSession, debugLog, endSession } from '@/platform/debugLog';

export { MIGRATION_VERSION } from './migrationPlan';

const SCOPE = 'optionen';

/**
 * Paused until the run keeps a backup of the old values and waits for both accounts to be
 * on a version that reads ids. The app reads old texts as well, so it works without it.
 */
export const AUTO_MIGRATION_ENABLED = false;
const DONE_KEY = 'reno-options-migrated';

export type MigrationOutcome = 'migrated' | 'current' | 'offline' | 'failed';

function rememberedVersion(): number {
  try {
    return Number(localStorage.getItem(DONE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function remember(version: number): void {
  try {
    localStorage.setItem(DONE_KEY, String(version));
  } catch {
    // only saves a server round trip on the next start
  }
}

let running: Promise<MigrationOutcome> | null = null;

/** reads everything from the server, writes `meta/options`, then the records, then the version */
export function runOptionsMigration(): Promise<MigrationOutcome> {
  if (!running) {
    running = migrate().finally(() => {
      running = null;
    });
  }
  return running;
}

async function migrate(): Promise<MigrationOutcome> {
  if (rememberedVersion() >= MIGRATION_VERSION) return 'current';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  beginSession(SCOPE, 'Umstellung auf Kennungen');
  try {
    const options = await readDocFromServer(COL.meta, 'options');
    const migrated = typeof options?.migrated === 'number' ? options.migrated : 0;
    if (migrated >= MIGRATION_VERSION) {
      debugLog(SCOPE, `schon umgestellt (Stand ${migrated})`);
      remember(migrated);
      endSession(SCOPE, 'nichts zu tun');
      return 'current';
    }

    const lists = await readDocFromServer(COL.meta, 'lists');
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

    // the sets first: a record must never point at an id that is not in the document yet
    const sets: Record<string, unknown> = {};
    for (const key of OPTION_SET_KEYS) {
      sets[key] = plan.options[key].map((entry) =>
        entry.archived ? { id: entry.id, label: entry.label, archived: true } : { id: entry.id, label: entry.label },
      );
    }
    await mergeDocConfirmed(COL.meta, 'options', sets);
    debugLog(SCOPE, 'meta/options geschrieben');

    await commitPatches(plan.updates, REMOVE_FIELD, (done, total) => debugLog(SCOPE, `Datensätze ${done}/${total}`));

    await mergeDocConfirmed(COL.meta, 'options', {
      migrated: MIGRATION_VERSION,
      migratedAt: new Date().toISOString(),
    });
    remember(MIGRATION_VERSION);
    endSession(SCOPE, `fertig, ${plan.updates.length} Datensätze`);
    return 'migrated';
  } catch (error) {
    debugLog(SCOPE, `Fehler: ${error instanceof Error ? error.message : String(error)}`);
    endSession(SCOPE, 'abgebrochen, nächster Start versucht es erneut');
    return 'failed';
  }
}

/**
 * Starts the migration once after login, as soon as the device is online. A failed run is
 * not retried until the next start.
 */
export function useOptionsMigration(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !AUTO_MIGRATION_ENABLED) return undefined;
    let cancelled = false;
    let waiting = false;
    const start = () => {
      void runOptionsMigration().then((outcome) => {
        if (!cancelled && outcome === 'offline') wait();
      });
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
