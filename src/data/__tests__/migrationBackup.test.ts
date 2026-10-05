import { describe, expect, it } from 'vitest';
import { REMOVE_FIELD, planMigration, type MigrationRecord, type MigrationRecords } from '@/data/migrationPlan';
import {
  BACKUP_PART_SIZE,
  BACKUP_RETENTION_DAYS,
  backupPartId,
  isAbsent,
  isBackupExpired,
  makeRunId,
  planBackup,
  planRestore,
  type BackupPart,
} from '@/data/migrationBackup';

const DAY = 24 * 60 * 60 * 1000;

describe('planBackup', () => {
  it('keeps only the fields the update changes and encodes a missing field as absent', () => {
    const records: Partial<MigrationRecords> = {
      diary: [{ id: 'd1', title: 'Tag', present: ['Thomas'], weather: 'Regen' }],
      tasks: [{ id: 't1', status: 'Offen', title: 'x' }],
    };
    const plan = planMigration({ records });
    const [part] = planBackup('20261005T231500Z', plan, records, { people: ['Thomas'] }, null);
    const diary = part.records.find((r) => r.id === 'd1');
    expect(diary?.before).toEqual({ present: ['Thomas'], weather: 'Regen' });
    const task = part.records.find((r) => r.id === 't1');
    expect(task?.before).toEqual({ status: 'Offen' });
    expect(part.lists).toEqual({ people: ['Thomas'] });
    expect(part.options).toBeNull();
    const contacts: Partial<MigrationRecords> = { contacts: [{ id: 'k', role: 'Maler' }] };
    const [cpart] = planBackup('r', planMigration({ records: contacts }), contacts, {}, null);
    expect(cpart.records[0].before.roles).toEqual({ absent: true });
    expect(isAbsent(cpart.records[0].before.roles)).toBe(true);
    expect(cpart.records[0].before.role).toBe('Maler');
  });

  it('splits into parts of at most 300 and puts lists and options in part 1 only', () => {
    const rows: MigrationRecord[] = Array.from({ length: BACKUP_PART_SIZE * 2 + 1 }, (_, i) => ({
      id: 'p' + String(i).padStart(4, '0'),
      status: 'In Arbeit',
    }));
    const records: Partial<MigrationRecords> = { phases: rows };
    const parts = planBackup('r', planMigration({ records }), records, { a: 1 }, { b: 2 });
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.records.length)).toEqual([300, 300, 1]);
    expect(parts.map((p) => p.part)).toEqual([1, 2, 3]);
    expect(parts.every((p) => p.parts === 3 && p.runId === 'r')).toBe(true);
    expect(parts[0].lists).toEqual({ a: 1 });
    expect(parts[0].options).toEqual({ b: 2 });
    expect(parts[1].lists).toBeUndefined();
    expect(parts[2].options).toBeUndefined();
  });

  it('writes one part even when nothing changes', () => {
    const parts = planBackup('r', { updates: [] }, {}, { people: [] }, null);
    expect(parts).toHaveLength(1);
    expect(parts[0].records).toEqual([]);
    expect(parts[0].lists).toEqual({ people: [] });
  });
});

describe('planRestore', () => {
  const part = (runId: string, n: number, extra: Partial<BackupPart>): BackupPart => ({
    runId,
    part: n,
    parts: 1,
    records: [],
    ...extra,
  });

  it('takes the values of the earliest run', () => {
    const later = part('20261006T100000Z', 1, {
      records: [{ col: 'tasks', id: 't1', before: { status: 'erledigt' } }],
      lists: { people: ['spaeter'] },
      options: { x: 2 },
    });
    const earlier = part('20261005T100000Z', 1, {
      records: [{ col: 'tasks', id: 't1', before: { status: 'Erledigt' } }],
      lists: { people: ['frueh'] },
      options: null,
    });
    const plan = planRestore([later, earlier]);
    expect(plan.updates).toEqual([{ col: 'tasks', id: 't1', patch: { status: 'Erledigt' } }]);
    expect(plan.lists).toEqual({ people: ['frueh'] });
    expect(plan.options).toBeNull();
  });

  it('keeps records that only a later run saved and turns absent into a removal', () => {
    const first = part('1', 1, { records: [{ col: 'a', id: '1', before: { f: 'x' } }], lists: {}, options: null });
    const second = part('2', 1, { records: [{ col: 'a', id: '2', before: { f: { absent: true } } }] });
    const plan = planRestore([second, first]);
    expect(plan.updates).toHaveLength(2);
    expect(plan.updates.find((u) => u.id === '2')?.patch.f).toBe(REMOVE_FIELD);
  });

  it('drops the audit fields of the saved documents', () => {
    const plan = planRestore([part('1', 1, { lists: { people: [], updatedAt: 'T', updatedBy: 'x' }, options: { migrated: 1, updatedBy: 'x' } })]);
    expect(plan.lists).toEqual({ people: [] });
    expect(plan.options).toEqual({ migrated: 1 });
  });

  it('round trip: restoring a plan gives exactly the starting values back', () => {
    const start: MigrationRecords = {
      diary: [
        { id: 'd1', present: ['Thomas', 'Fremder'], weather: 'Bewölkt', note: 'bleibt' },
        { id: 'd2', present: ['Sarah'] },
      ],
      costs: [{ id: 'c1', category: 'Dach', paymentStatus: 'bezahlt', paidBy: 'Gemeinsam', amount: 12 }],
      tasks: [
        { id: 't1', status: 'In Arbeit', priority: 'Hoch', area: 'Gartenhaus', assignees: ['Beide', 'Handwerker'] },
        { id: 't2', status: 'offen' },
      ],
      contacts: [
        { id: 'k1', role: 'Dachdecker', roles: [], status: 'Aktiv' },
        { id: 'k2', role: 'Maler', roles: ['Statiker'] },
        { id: 'k3', roles: ['Notar'] },
      ],
      contactLogs: [{ id: 'l1', channel: 'E-Mail' }],
      trades: [{ id: 'g1', status: 'Angebot einholen', priority: 'Niedrig' }],
      phases: [{ id: 'p1', status: 'Abgeschlossen' }],
    };
    const snapshot = structuredClone(start);
    const lists = { people: ['Thomas', 'Sarah', 'Handwerker'] };
    const plan = planMigration({ lists, records: start });
    expect(plan.updates.length).toBeGreaterThan(5);
    const parts = planBackup('r', plan, start, lists, { weather: [{ id: 'x', label: 'X' }] });

    // apply the migration to a copy of the data
    const data = new Map<string, Record<string, unknown>>();
    for (const [name, rows] of Object.entries(snapshot)) {
      for (const row of rows as MigrationRecord[]) data.set(`${name}/${row.id}`, { ...row });
    }
    const apply = (updates: { col: string; id: string; patch: Record<string, unknown> }[]) => {
      for (const u of updates) {
        const row = data.get(`${u.col}/${u.id}`);
        if (!row) throw new Error('missing ' + u.id);
        for (const [field, value] of Object.entries(u.patch)) {
          if (value === REMOVE_FIELD) delete row[field];
          else row[field] = value;
        }
      }
    };
    apply(plan.updates);
    expect('role' in (data.get('contacts/k1') ?? {})).toBe(false);
    expect(data.get('tasks/t1')?.assignees).toEqual(['thomas', 'sarah', 'handwerker']);

    const restore = planRestore(parts);
    apply(restore.updates);
    for (const [name, rows] of Object.entries(snapshot)) {
      for (const row of rows as MigrationRecord[]) expect(data.get(`${name}/${row.id}`)).toEqual(row);
    }
    expect(restore.lists).toEqual(lists);
    expect(restore.options).toEqual({ weather: [{ id: 'x', label: 'X' }] });
  });
});

describe('backup helpers', () => {
  it('expires after 14 days, not before, and never on an unreadable date', () => {
    const created = '2026-10-05T10:00:00.000Z';
    const at = Date.parse(created);
    expect(BACKUP_RETENTION_DAYS).toBe(14);
    expect(isBackupExpired(created, at + 14 * DAY)).toBe(false);
    expect(isBackupExpired(created, new Date(at + 14 * DAY + 1))).toBe(true);
    expect(isBackupExpired(created, at + 2 * DAY)).toBe(false);
    expect(isBackupExpired('kaputt', at + 99 * DAY)).toBe(false);
    expect(isBackupExpired(undefined, at + 99 * DAY)).toBe(false);
  });

  it('builds a compact UTC run id and the part ids', () => {
    expect(makeRunId(new Date('2026-10-05T23:15:00.123Z'))).toBe('20261005T231500Z');
    expect(backupPartId('20261005T231500Z', 2)).toBe('umstellung-sicherung-20261005T231500Z-2');
  });
});
