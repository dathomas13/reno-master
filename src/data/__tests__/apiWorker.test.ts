import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, normalizeSets, findOptionByName, slugify as appSlugify, type OptionSetKey } from '@/data/options';
import { API_SCOPES as APP_SCOPES } from '@/data/apiTokenFormat';
import { API_SCOPES, OPTION_LABELS, normalizeOptions, resolveOption, slugify } from '../../../worker/reno-files.js';

/**
 * The worker cannot import the app, so it carries its own copy of the start values and of
 * the option normalisation. These tests keep the copy in step: a renamed seed entry or a
 * changed rule fails here instead of turning into a wrong id in a record.
 */
describe('API worker and app agree', () => {
  const keys = Object.keys(OPTION_LABELS) as OptionSetKey[];

  it('on the start values of every option set the API uses', () => {
    for (const key of keys) {
      expect(normalizeOptions(null)[key], key).toEqual(DEFAULT_OPTIONS[key]);
    }
  });

  it('on how a stored meta/options document is read', () => {
    const stored = {
      taskStatus: [{ id: 'erledigt', label: '  Fertig ' }, { id: 'erfunden', label: 'X' }],
      costCategories: [{ id: 'a', label: 'Eins' }, { id: 'a', label: 'doppelt' }, { id: 'b', label: 'Zwei', archived: true }],
      people: 'kaputt',
    };
    const app = normalizeSets(stored);
    const worker = normalizeOptions(stored);
    for (const key of keys) expect(worker[key], key).toEqual(app[key]);
  });

  it('on slugs', () => {
    for (const label of ['Außendämmung/Fassade', 'PV-Anlage', '  Bäder ', 'Überweisung', '!!!']) {
      expect(slugify(label)).toBe(appSlugify(label));
    }
  });

  it('on turning a name into an id', () => {
    const entries = DEFAULT_OPTIONS.costCategories;
    for (const name of ['verpflegung helfer', 'Verpflegung Helfer', 'sanitaer', 'Sanitär']) {
      expect(resolveOption(entries, name, 'category')).toBe(findOptionByName(entries, name)?.id);
    }
  });

  it('on the scopes a token can carry', () => {
    expect([...API_SCOPES]).toEqual(APP_SCOPES.map((scope) => scope.id));
  });
});
