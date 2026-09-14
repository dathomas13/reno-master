import { describe, it, expect } from 'vitest';
import { sumGross, byCategory, byMonth, totalForMonth, budgetPerTrade, toCsv, NO_CATEGORY } from '@/data/costAggregation';
import { formatAmount } from '@/lib/money';
import type { Cost, Trade } from '@/data/types';

function cost(partial: Partial<Cost>): Cost {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    date: '2026-09-01',
    vendor: 'Bauhaus',
    description: '',
    amountGross: 100,
    category: 'Material allgemein',
    roomIds: [],
    paymentStatus: 'bezahlt',
    receiptPhotoIds: [],
    ...partial,
  };
}

const TRADE: Trade = { id: 't1', name: 'Dach', status: 'Noch offen', priority: 'Hoch', budgetPlanned: 1000 };

describe('sumGross', () => {
  it('adds up and rounds to cents', () => {
    expect(sumGross([cost({ amountGross: 10.1 }), cost({ amountGross: 20.2 })])).toBe(30.3);
    expect(sumGross([])).toBe(0);
  });

  it('ignores broken amounts instead of turning the sum into NaN', () => {
    expect(sumGross([cost({ amountGross: 10 }), cost({ amountGross: NaN })])).toBe(10);
  });
});

describe('byCategory', () => {
  it('groups, counts and sorts by size', () => {
    const rows = byCategory([
      cost({ category: 'Dach', amountGross: 50 }),
      cost({ category: 'Werkzeug', amountGross: 200 }),
      cost({ category: 'Dach', amountGross: 25 }),
    ]);
    expect(rows[0]).toEqual({ key: 'Werkzeug', total: 200, count: 1 });
    expect(rows[1]).toEqual({ key: 'Dach', total: 75, count: 2 });
  });

  it('collects entries without a category', () => {
    const rows = byCategory([cost({ category: '' }), cost({ category: '   ' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe(NO_CATEGORY);
    expect(rows[0]?.count).toBe(2);
  });
});

describe('byMonth', () => {
  it('groups by month in chronological order', () => {
    const rows = byMonth([
      cost({ date: '2026-09-14', amountGross: 10 }),
      cost({ date: '2026-08-01', amountGross: 20 }),
      cost({ date: '2026-09-01', amountGross: 5 }),
    ]);
    expect(rows.map((row) => row.key)).toEqual(['2026-08', '2026-09']);
    expect(rows[1]?.total).toBe(15);
  });
});

describe('totalForMonth', () => {
  it('only counts the given month', () => {
    const rows = [cost({ date: '2026-09-02', amountGross: 30 }), cost({ date: '2026-08-30', amountGross: 70 })];
    expect(totalForMonth(rows, '2026-09')).toBe(30);
  });
});

describe('budgetPerTrade', () => {
  it('compares actual against planned', () => {
    const rows = budgetPerTrade([cost({ tradeId: 't1', amountGross: 250 })], [TRADE]);
    expect(rows[0]?.actual).toBe(250);
    expect(rows[0]?.planned).toBe(1000);
    expect(rows[0]?.share).toBe(0.25);
    expect(rows[0]?.over).toBe(false);
  });

  it('flags an exceeded budget and caps the bar', () => {
    const rows = budgetPerTrade([cost({ tradeId: 't1', amountGross: 1500 })], [TRADE]);
    expect(rows[0]?.over).toBe(true);
    expect(rows[0]?.share).toBe(1);
  });

  it('drops trades without budget and without spending', () => {
    const empty: Trade = { id: 't2', name: 'Maler', status: 'Noch offen', priority: 'Niedrig' };
    expect(budgetPerTrade([], [empty])).toHaveLength(0);
  });
});

describe('toCsv', () => {
  it('writes a German CSV Excel can open', () => {
    const csv = toCsv([cost({ date: '2026-09-01', amountGross: 1234.5, vendor: 'Bau "Meier"' })], formatAmount);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"1.234,50"');
    expect(csv).toContain('"Bau ""Meier"""');
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
