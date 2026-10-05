import { describe, expect, it } from 'vitest';
import {
  addEntry, findDuplicate, moveEntry, normalizeEntry, removeEntry, renameEntry,
  restoreEntry, sortAlpha, withStored,
} from '@/data/presetLists';

describe('presetLists', () => {
  it('normalizes whitespace and rejects empty or too long values', () => {
    expect(normalizeEntry('  Dr.   Müller ')).toBe('Dr. Müller');
    expect(normalizeEntry('   ')).toBe('');
    expect(normalizeEntry('x'.repeat(61))).toBe('');
    expect(normalizeEntry('é')).toBe('é');
  });

  it('finds duplicates ignoring case but not accents', () => {
    expect(findDuplicate(['Sarah'], 'sarah')).toBe('Sarah');
    expect(findDuplicate(['Müller'], 'Muller')).toBeUndefined();
    expect(findDuplicate(['Sarah'], 'Sarah', 'Sarah')).toBeUndefined();
  });

  it('adds only new, valid entries', () => {
    expect(addEntry(['a'], ' b ')).toEqual(['a', 'b']);
    expect(addEntry(['a'], 'A')).toEqual(['a']);
    expect(addEntry(['a'], '')).toEqual(['a']);
  });

  it('renames in place and refuses a taken name', () => {
    expect(renameEntry(['a', 'b'], 'a', 'c')).toEqual(['c', 'b']);
    expect(renameEntry(['a', 'b'], 'a', 'B')).toEqual(['a', 'b']);
    expect(renameEntry(['a', 'b'], 'a', 'A')).toEqual(['A', 'b']);
  });

  it('removes and restores at the old index', () => {
    const { list, index } = removeEntry(['a', 'b', 'c'], 'b');
    expect(list).toEqual(['a', 'c']);
    expect(index).toBe(1);
    expect(restoreEntry(list, 'b', index)).toEqual(['a', 'b', 'c']);
    expect(restoreEntry(list, 'b', 99)).toEqual(['a', 'c', 'b']);
    expect(removeEntry(['a'], 'x').index).toBe(-1);
  });

  it('moves entries within bounds', () => {
    expect(moveEntry(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveEntry(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('sorts German aware', () => {
    expect(sortAlpha(['Zimmer', 'Äpfel', 'Berta'])).toEqual(['Äpfel', 'Berta', 'Zimmer']);
  });

  it('appends stored values missing from the options', () => {
    expect(withStored(['a'], 'b')).toEqual(['a', 'b']);
    expect(withStored(['a'], ['a', 'c', 'c'])).toEqual(['a', 'c']);
    expect(withStored(['a'], undefined)).toEqual(['a']);
    expect(withStored(['a'], '')).toEqual(['a']);
  });
});
