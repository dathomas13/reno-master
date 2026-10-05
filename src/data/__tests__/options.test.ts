import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS, FIXED_SETS, PAYMENT_PAID, PHASE_ACTIVE, TASK_DONE, activeEntries, addOption, archiveOption,
  hasAssignee, isFixedSet, isHighPriority, isPaid, isPhaseActive, isTaskDone, labelOf, moveOption,
  normalizeSets, renameOption, resetOptions, findOptionByName, optionById, slugify, sortOptionsAlpha, uniqueId,
  unarchiveOption, type OptionEntry,
} from '@/data/options';

const abc: OptionEntry[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

describe('slugify and uniqueId', () => {
  it('spells out umlauts and folds everything else to dashes', () => {
    expect(slugify('Außendämmung/Fassade')).toBe('aussendaemmung-fassade');
    expect(slugify('Überweisung')).toBe('ueberweisung');
    expect(slugify('Energieberater (iSFP)')).toBe('energieberater-isfp');
    expect(slugify('  In   Arbeit ')).toBe('in-arbeit');
    expect(slugify('Löschen ö')).toBe('loeschen-oe');
  });

  it('never returns an empty id', () => {
    expect(slugify('')).toBe('x');
    expect(slugify('!!!')).toBe('x');
  });

  it('adds a suffix on collision, hidden entries included', () => {
    const set: OptionEntry[] = [{ id: 'regen', label: 'Regen' }, { id: 'regen-2', label: 'Re-gen', archived: true }];
    expect(uniqueId('Regen', set)).toBe('regen-3');
    expect(uniqueId('Sonne', set)).toBe('sonne');
  });
});

describe('defaults', () => {
  it('derive the ids the code relies on', () => {
    expect(DEFAULT_OPTIONS.taskStatus.map((e) => e.id)).toEqual(['offen', 'in-arbeit', 'wartet-auf', 'erledigt']);
    expect(DEFAULT_OPTIONS.paymentStatus.map((e) => e.label)).toEqual(['Offen', 'Bezahlt', 'Erstattet']);
    expect(DEFAULT_OPTIONS.priority.map((e) => e.id)).toEqual(['hoch', 'mittel', 'niedrig']);
    expect(DEFAULT_OPTIONS.tradeStatus[0].id).toBe('noch-offen');
    expect(DEFAULT_OPTIONS.people.some((e) => e.id === 'thomas')).toBe(true);
    expect(FIXED_SETS).toContain('priority');
    expect(isFixedSet('priority')).toBe(true);
    expect(isFixedSet('people')).toBe(false);
  });
});

describe('optionById, findOptionByName and labelOf', () => {
  const set = DEFAULT_OPTIONS.taskStatus;

  it('optionById only knows ids', () => {
    expect(optionById(set, 'in-arbeit')?.label).toBe('In Arbeit');
    expect(optionById(set, 'In Arbeit')).toBeUndefined();
    expect(optionById(set, undefined)).toBeUndefined();
  });

  it('findOptionByName finds by label or by the slug of a spelling', () => {
    expect(findOptionByName(set, 'Wartet auf')?.id).toBe('wartet-auf');
    expect(findOptionByName(set, 'wartet-auf')?.id).toBe('wartet-auf');
    const renamed = [{ id: 'erledigt', label: 'Fertig' }];
    expect(findOptionByName(renamed, 'FERTIG')?.id).toBe('erledigt');
    expect(findOptionByName(set, 'unbekannt')).toBeUndefined();
    expect(findOptionByName(set, undefined)).toBeUndefined();
    expect(findOptionByName(set, '  ')).toBeUndefined();
  });

  it('labelOf falls back to the id and never throws', () => {
    expect(labelOf(set, 'erledigt')).toBe('Erledigt');
    expect(labelOf(set, 'irgendwas')).toBe('irgendwas');
    expect(labelOf(set, undefined)).toBe('');
  });
});

describe('normalizeSets', () => {
  it('falls back to the start values for a missing set', () => {
    const sets = normalizeSets(null);
    expect(sets.people).toEqual(DEFAULT_OPTIONS.people);
    expect(sets.weather).toEqual(DEFAULT_OPTIONS.weather);
  });

  it('prefers the stored set and keeps an empty one empty', () => {
    const sets = normalizeSets({ weather: [], people: [{ id: 'x', label: 'X', archived: true }] });
    expect(sets.weather).toEqual([]);
    expect(sets.people).toEqual([{ id: 'x', label: 'X', archived: true }]);
  });

  it('merges fixed sets with the code: names and order from the document, nothing else', () => {
    const sets = normalizeSets({
      taskStatus: [
        { id: 'erledigt', label: 'Fertig', archived: true },
        { id: 'offen', label: 'Neu' },
        { id: 'gibt-es-nicht', label: 'Spuk' },
        { id: 'offen', label: 'Doppelt' },
      ],
    });
    expect(sets.taskStatus).toEqual([
      { id: 'erledigt', label: 'Fertig' },
      { id: 'offen', label: 'Neu' },
      { id: 'in-arbeit', label: 'In Arbeit' },
      { id: 'wartet-auf', label: 'Wartet auf' },
    ]);
  });

  it('ignores a malformed document', () => {
    const sets = normalizeSets({ priority: 'kaputt', people: [null, 5, { id: 1 }] });
    expect(sets.priority).toEqual(DEFAULT_OPTIONS.priority);
    expect(sets.people).toEqual([]);
  });
});

describe('logic helpers', () => {
  it('compare ids', () => {
    expect(isTaskDone({ status: TASK_DONE })).toBe(true);
    expect(isTaskDone({ status: 'offen' })).toBe(false);
    expect(isTaskDone({})).toBe(false);
    expect(isPhaseActive({ status: PHASE_ACTIVE })).toBe(true);
    expect(isPhaseActive({ status: 'geplant' })).toBe(false);
    expect(isHighPriority('hoch')).toBe(true);
    expect(isHighPriority('mittel')).toBe(false);
    expect(isPaid({ paymentStatus: PAYMENT_PAID })).toBe(true);
    expect(isPaid({ paymentStatus: 'offen' })).toBe(false);
  });

  it('hasAssignee compares ids', () => {
    expect(hasAssignee({ assignees: ['thomas'] }, 'thomas')).toBe(true);
    expect(hasAssignee({ assignees: ['sarah'] }, 'thomas')).toBe(false);
    expect(hasAssignee({}, 'thomas')).toBe(false);
  });
});

describe('editing', () => {
  it('adds with a fresh id, refuses empty names, reuses a taken name', () => {
    const added = addOption(abc, '  Delta ');
    expect(added.id).toBe('delta');
    expect(added.entries).toHaveLength(4);
    expect(addOption(abc, '  ').id).toBe('');
    expect(addOption(abc, 'beta').id).toBe('b');
    expect(addOption(abc, 'beta').entries).toEqual(abc);
  });

  it('shows a hidden entry again when its name is added', () => {
    const hidden = archiveOption(abc, 'b').entries;
    const again = addOption(hidden, 'Beta');
    expect(again.id).toBe('b');
    expect(activeEntries(again.entries)).toHaveLength(3);
  });

  it('renames without touching the id and refuses a taken name', () => {
    expect(renameOption(abc, 'a', 'Anton')[0]).toEqual({ id: 'a', label: 'Anton' });
    expect(renameOption(abc, 'a', 'beta')).toEqual(abc);
    expect(renameOption(abc, 'a', '')).toEqual(abc);
    expect(renameOption(abc, 'a', 'alpha')[0].label).toBe('alpha');
  });

  it('archives and unarchives in place and reports the index', () => {
    const { entries, index } = archiveOption(abc, 'b');
    expect(index).toBe(1);
    expect(entries[1]).toEqual({ id: 'b', label: 'Beta', archived: true });
    expect(unarchiveOption(entries, 'b')).toEqual(abc);
    expect(archiveOption(abc, 'zzz').index).toBe(-1);
  });

  it('moves past hidden neighbours and stays inside the list', () => {
    const hidden = archiveOption(abc, 'b').entries;
    expect(moveOption(hidden, 'c', -1).map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(moveOption(abc, 'a', -1)).toEqual(abc);
    expect(moveOption(abc, 'a', 1).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts German aware', () => {
    const set = [{ id: 'z', label: 'Zimmer' }, { id: 'a', label: 'Äpfel' }, { id: 'b', label: 'Berta' }];
    expect(sortOptionsAlpha(set).map((e) => e.id)).toEqual(['a', 'b', 'z']);
  });

  it('resets a free set: start entries shown with start names, own ones hidden', () => {
    const current: OptionEntry[] = [
      { id: 'sonnig', label: 'Heiter', archived: true },
      { id: 'hagel', label: 'Hagel' },
    ];
    const reset = resetOptions('weather', current);
    expect(reset.slice(0, 5)).toEqual(DEFAULT_OPTIONS.weather);
    expect(reset[5]).toEqual({ id: 'hagel', label: 'Hagel', archived: true });
    expect(reset).toHaveLength(6);
  });

  it('resets a fixed set to start names and order', () => {
    const current = [{ id: 'hoch', label: 'Dringend' }];
    expect(resetOptions('priority', current)).toEqual(DEFAULT_OPTIONS.priority);
  });
});
