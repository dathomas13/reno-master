/**
 * The pure half of the backup that the switch to ids takes first: which old values go into
 * which backup part, how the parts read back into a restore, and when the backup expires.
 * No Firebase in here, so it tests without it.
 *
 * A backup part holds, per changed record, only the old values of the fields the update
 * touches. A field that was not there is stored as `{ absent: true }`, so a restore can
 * remove it again instead of writing `undefined`.
 */
import { COL } from './types';
import { REMOVE_FIELD, type MigrationPlan, type MigrationRecord, type MigrationRecords } from './migrationPlan';

/** records per backup part: keeps every document far below the 1 MiB limit */
export const BACKUP_PART_SIZE = 300;

/** days the backup stays after the switch; then the next start deletes it */
export const BACKUP_RETENTION_DAYS = 14;

export interface AbsentField {
  absent: true;
}

export interface BackupRecord {
  col: string;
  id: string;
  /** old value per field the update changes */
  before: Record<string, unknown>;
}

export interface BackupPart {
  runId: string;
  /** 1-based */
  part: number;
  parts: number;
  records: BackupRecord[];
  /** part 1 only: `meta/lists` as it was */
  lists?: Record<string, unknown> | null;
  /** part 1 only: `meta/options` as it was, null when the document did not exist */
  options?: Record<string, unknown> | null;
}

export interface RestorePlan {
  lists: Record<string, unknown> | null;
  options: Record<string, unknown> | null;
  /** patches in the shape of the migration; the values are the old ones, REMOVE_FIELD where a field was absent */
  updates: { col: string; id: string; patch: Record<string, unknown> }[];
}

export function isAbsent(value: unknown): value is AbsentField {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { absent?: unknown }).absent === true &&
    Object.keys(value).length === 1
  );
}

/** compact UTC time stamp, e.g. 20261005T231500Z; sorts like the time */
export function makeRunId(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** id of a backup part document in `meta` */
export function backupPartId(runId: string, part: number): string {
  return `umstellung-sicherung-${runId}-${part}`;
}

function recordsByCol(records: Partial<MigrationRecords>): Map<string, Map<string, MigrationRecord>> {
  const byCol: [string, MigrationRecord[] | undefined][] = [
    [COL.diary, records.diary],
    [COL.costs, records.costs],
    [COL.tasks, records.tasks],
    [COL.contacts, records.contacts],
    [COL.contactLogs, records.contactLogs],
    [COL.trades, records.trades],
    [COL.phases, records.phases],
  ];
  const result = new Map<string, Map<string, MigrationRecord>>();
  for (const [col, rows] of byCol) result.set(col, new Map((rows ?? []).map((row) => [row.id, row])));
  return result;
}

/** the backup parts for one run, at least one (part 1 carries the lists and options) */
export function planBackup(
  runId: string,
  plan: Pick<MigrationPlan, 'updates'>,
  records: Partial<MigrationRecords>,
  lists: Record<string, unknown> | null,
  options: Record<string, unknown> | null,
): BackupPart[] {
  const lookup = recordsByCol(records);
  const entries: BackupRecord[] = plan.updates.map((update) => {
    const current = lookup.get(update.col)?.get(update.id);
    const before: Record<string, unknown> = {};
    for (const field of Object.keys(update.patch)) {
      const had = current !== undefined && Object.prototype.hasOwnProperty.call(current, field);
      before[field] = had && current[field] !== undefined ? current[field] : ({ absent: true } as AbsentField);
    }
    return { col: update.col, id: update.id, before };
  });
  const parts = Math.max(1, Math.ceil(entries.length / BACKUP_PART_SIZE));
  const result: BackupPart[] = [];
  for (let index = 0; index < parts; index += 1) {
    const part: BackupPart = {
      runId,
      part: index + 1,
      parts,
      records: entries.slice(index * BACKUP_PART_SIZE, (index + 1) * BACKUP_PART_SIZE),
    };
    if (index === 0) {
      part.lists = lists;
      part.options = options;
    }
    result.push(part);
  }
  return result;
}

function withoutAudit(data: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const copy = { ...data };
  delete copy.updatedAt;
  delete copy.updatedBy;
  return copy;
}

/**
 * The state before the first switch: per record the old values of the earliest run, and the
 * lists and options from the earliest run that kept them. Later runs (a second device, a
 * retry) saw partly converted data and must not win.
 */
export function planRestore(parts: readonly BackupPart[]): RestorePlan {
  const ordered = [...parts].sort((a, b) =>
    a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : a.part - b.part,
  );
  const updates: RestorePlan['updates'] = [];
  let lists: Record<string, unknown> | null = null;
  let options: Record<string, unknown> | null = null;
  let metaTaken = false;
  const firstRun = new Map<string, string>();
  for (const part of ordered) {
    if (part.lists !== undefined && !metaTaken) {
      lists = withoutAudit(part.lists);
      options = withoutAudit(part.options);
      metaTaken = true;
    }
    for (const record of part.records) {
      const key = `${record.col}/${record.id}`;
      // a record belongs to the first run that saved it; every later copy is partly converted
      const owner = firstRun.get(key);
      if (owner !== undefined) continue;
      firstRun.set(key, part.runId);
      const patch: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(record.before)) {
        patch[field] = isAbsent(value) ? REMOVE_FIELD : value;
      }
      updates.push({ col: record.col, id: record.id, patch });
    }
  }
  return { lists, options, updates };
}

/** true once the backup is older than the retention time; an unreadable date never expires it */
export function isBackupExpired(createdAt: unknown, now: Date | number, days: number = BACKUP_RETENTION_DAYS): boolean {
  if (typeof createdAt !== 'string') return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  const current = typeof now === 'number' ? now : now.getTime();
  return current - created > days * 24 * 60 * 60 * 1000;
}
