import { describe, it, expect } from 'vitest';
import { parseAmount, formatEuro, formatAmount, splitGross, round2 } from '@/lib/money';

describe('parseAmount', () => {
  it('reads German notation', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('12,34')).toBe(12.34);
    expect(parseAmount('0,99')).toBe(0.99);
    expect(parseAmount('1.234.567,89')).toBe(1234567.89);
  });

  it('reads English notation', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1234.56')).toBe(1234.56);
  });

  it('handles currency symbols and spacing', () => {
    expect(parseAmount('12,34 €')).toBe(12.34);
    expect(parseAmount('€ 1.912,76')).toBe(1912.76);
    expect(parseAmount('EUR 45,00')).toBe(45);
  });

  it('handles plain integers and negatives', () => {
    expect(parseAmount('1234')).toBe(1234);
    expect(parseAmount('-12,34')).toBe(-12.34);
  });

  it('rejects text without digits', () => {
    expect(parseAmount('Summe')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('€')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats euro amounts in German', () => {
    // Intl separates the amount from the sign with a non breaking space
    expect(formatEuro(1234.5).replace(/[\u00a0\u202f]/g, ' ')).toBe('1.234,50 €');
    expect(formatAmount(0.5)).toBe('0,50');
  });
});

describe('splitGross', () => {
  it('splits a gross amount into net and VAT', () => {
    expect(splitGross(119, 19)).toEqual({ net: 100, vat: 19 });
    expect(splitGross(107, 7)).toEqual({ net: 100, vat: 7 });
    const { net, vat } = splitGross(1912.76, 19);
    expect(round2(net + vat)).toBe(1912.76);
  });
});
