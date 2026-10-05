import { describe, expect, it } from 'vitest';
import { REMOVE_FIELD, planMigration, type MigrationRecords } from '@/data/migrationPlan';
import { DEFAULT_OPTIONS } from '@/data/options';

function records(extra: Partial<MigrationRecords>): Partial<MigrationRecords> {
  return extra;
}

describe('planMigration', () => {
  it('turns the old texts into ids', () => {
    const plan = planMigration({
      records: records({
        diary: [{ id: 'd1', present: ['Thomas', 'Sarah'], weather: 'Bewölkt' }],
        costs: [{ id: 'c1', category: 'Außendämmung/Fassade', paymentStatus: 'bezahlt', paidBy: 'Gemeinsam', paymentMethod: 'Überweisung' }],
        tasks: [{ id: 't1', status: 'In Arbeit', priority: 'Hoch', area: 'Dach', assignees: ['Handwerker'] }],
        contactLogs: [{ id: 'l1', channel: 'E-Mail' }],
        trades: [{ id: 'g1', status: 'Angebot einholen', priority: 'Niedrig' }],
        phases: [{ id: 'p1', status: 'Abgeschlossen' }],
      }),
    });
    const byId = Object.fromEntries(plan.updates.map((u) => [u.id, u.patch]));
    expect(byId.d1).toEqual({ present: ['thomas', 'sarah'], weather: 'bewoelkt' });
    expect(byId.c1).toEqual({ category: 'aussendaemmung-fassade', paidBy: 'gemeinsam', paymentMethod: 'ueberweisung' });
    expect(byId.t1).toEqual({ status: 'in-arbeit', priority: 'hoch', area: 'dach', assignees: ['handwerker'] });
    expect(byId.l1).toEqual({ channel: 'e-mail' });
    expect(byId.g1).toEqual({ status: 'angebot-einholen', priority: 'niedrig' });
    expect(byId.p1).toEqual({ status: 'abgeschlossen' });
  });

  it('makes Beide Thomas and Sarah', () => {
    const plan = planMigration({
      records: records({ tasks: [{ id: 't', assignees: ['Beide', 'Thomas', 'Handwerker'] }] }),
    });
    expect(plan.updates[0].patch.assignees).toEqual(['thomas', 'sarah', 'handwerker']);
  });

  it('keeps an unknown text as a hidden entry', () => {
    const plan = planMigration({
      records: records({
        tasks: [{ id: 't1', area: 'Gartenhaus' }, { id: 't2', area: 'gartenhaus' }],
        diary: [{ id: 'd1', present: ['Onkel Franz'] }],
      }),
    });
    const hidden = plan.options.taskAreas.find((e) => e.id === 'gartenhaus');
    expect(hidden).toEqual({ id: 'gartenhaus', label: 'Gartenhaus', archived: true });
    expect(plan.options.taskAreas.filter((e) => e.id === 'gartenhaus')).toHaveLength(1);
    expect(plan.options.people.find((e) => e.id === 'onkel-franz')?.archived).toBe(true);
    expect(plan.updates.find((u) => u.id === 't1')?.patch).toEqual({ area: 'gartenhaus' });
  });

  it('starts from the old lists and the stored options', () => {
    const plan = planMigration({
      lists: { people: ['Anna'] },
      options: { weather: [{ id: 'sonnig', label: 'Heiter' }] },
      records: records({ diary: [{ id: 'd', present: ['Anna'], weather: 'Heiter' }] }),
    });
    expect(plan.updates[0].patch).toEqual({ present: ['anna'], weather: 'sonnig' });
    expect(plan.options.people).toEqual([{ id: 'anna', label: 'Anna' }]);
  });

  it('moves the old contact role into roles and removes it', () => {
    const plan = planMigration({
      records: records({
        contacts: [
          { id: 'k1', role: 'Dachdecker', roles: [], status: 'Aktiv' },
          { id: 'k2', role: 'Maler', roles: ['Dachdecker'] },
          { id: 'k3', roles: ['Statiker'] },
        ],
      }),
    });
    const byId = Object.fromEntries(plan.updates.map((u) => [u.id, u.patch]));
    expect(byId.k1.roles).toEqual(['dachdecker']);
    expect(byId.k1.role).toBe(REMOVE_FIELD);
    expect(byId.k1.status).toBe('aktiv');
    expect(byId.k2.roles).toEqual(['dachdecker', 'maler']);
    expect(byId.k3.roles).toEqual(['statiker']);
    expect(byId.k3.role).toBeUndefined();
  });

  it('leaves unknown values of fixed sets alone', () => {
    const plan = planMigration({ records: records({ tasks: [{ id: 't', status: 'Merkwürdig' }] }) });
    expect(plan.updates).toEqual([]);
    expect(plan.options.taskStatus).toEqual(DEFAULT_OPTIONS.taskStatus);
  });

  it('is idempotent: a second run over the migrated records plans nothing', () => {
    const first = planMigration({
      lists: { people: ['Thomas', 'Sarah'] },
      records: records({
        diary: [{ id: 'd1', present: ['Thomas', 'Fremder'], weather: 'Regen' }],
        tasks: [{ id: 't1', status: 'Erledigt', priority: 'Mittel', area: 'Sonstwas', assignees: ['Beide'] }],
        contacts: [{ id: 'k1', role: 'Notar', roles: [] }],
      }),
    });
    const apply = (rows: Record<string, unknown>[], col: string) =>
      rows.map((row) => {
        const patch = first.updates.find((u) => u.col === col && u.id === row.id)?.patch ?? {};
        const next: Record<string, unknown> = { ...row };
        for (const [field, value] of Object.entries(patch)) {
          if (value === REMOVE_FIELD) delete next[field];
          else next[field] = value;
        }
        return next as { id: string } & Record<string, unknown>;
      });
    const second = planMigration({
      lists: { people: ['Thomas', 'Sarah'] },
      options: first.options,
      records: {
        diary: apply([{ id: 'd1', present: ['Thomas', 'Fremder'], weather: 'Regen' }], 'diary'),
        tasks: apply([{ id: 't1', status: 'Erledigt', priority: 'Mittel', area: 'Sonstwas', assignees: ['Beide'] }], 'tasks'),
        contacts: apply([{ id: 'k1', role: 'Notar', roles: [] }], 'contacts'),
      },
    });
    expect(first.updates).toHaveLength(3);
    expect(second.updates).toEqual([]);
    expect(second.options).toEqual(first.options);
  });

  it('plans in the same order whatever order the records arrive in', () => {
    const rows = [{ id: 'b', area: 'Zwei' }, { id: 'a', area: 'Eins' }];
    const forward = planMigration({ records: { tasks: rows } });
    const backward = planMigration({ records: { tasks: [...rows].reverse() } });
    expect(forward).toEqual(backward);
  });
});
