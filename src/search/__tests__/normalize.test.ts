import { describe, expect, it } from 'vitest';
import { fold, normalize, terms } from '../normalize';

describe('normalize', () => {
  it('lowercases and drops punctuation', () => {
    expect(normalize('Fliesen, Bad (OG)!')).toBe('fliesen bad og');
  });

  it('folds umlauts the same way whether they are typed or written out', () => {
    expect(normalize('Gartentür')).toBe(normalize('Gartentuer'));
    expect(normalize('Wände')).toBe(normalize('Waende'));
    expect(normalize('Bäder')).toBe(normalize('Baeder'));
    expect(normalize('Straße')).toBe(normalize('Strasse'));
  });

  it('keeps amounts and dates as one token', () => {
    expect(normalize('1.234,56 €')).toBe('123456');
    expect(normalize('13.09.2026')).toBe('13092026');
    // a date query is a prefix of the stored one, which is what makes '13.09' find it
    expect(normalize('13092026').startsWith(normalize('13.09'))) .toBe(true);
  });

  it('does not glue two separate numbers together', () => {
    expect(normalize('3 Stück, 12 Meter')).toBe('3 stuck 12 meter');
  });

  it('collapses runs of separators and trims the ends', () => {
    expect(normalize('  Innen --- Putz  ')).toBe('innen putz');
  });

  it('splits a query into the words that have to match', () => {
    expect(terms(' Bad   Fliesen ')).toEqual(['bad', 'fliesen']);
    expect(terms('   ')).toEqual([]);
  });

  it('maps every folded character back to the original text', () => {
    const text = 'Türblatt';
    const folded = fold(text);
    expect(folded.text).toBe('turblatt');
    // the folded 'b' comes from the original 'b', not from a shifted position
    expect(text[folded.map[folded.text.indexOf('b')]]).toBe('b');
  });

  it('maps back across a two character fold', () => {
    const text = 'Tuerblatt';
    const folded = fold(text);
    expect(folded.text).toBe('turblatt');
    expect(text[folded.map[folded.text.indexOf('b')]]).toBe('b');
  });
});
