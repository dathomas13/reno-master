import { describe, expect, it } from 'vitest';
import { countTradeUsage } from '../tradeUsage';

describe('countTradeUsage', () => {
  it('is empty without sources', () => {
    expect(countTradeUsage({}).size).toBe(0);
  });

  it('counts every module once per record', () => {
    const counts = countTradeUsage({
      diary: [{ tradeIds: ['a', 'a', 'b'] }, { tradeIds: ['a'] }],
      costs: [{ tradeId: 'a' }, { tradeId: undefined }],
      tasks: [{ tradeId: 'b' }],
      contacts: [{ tradeIds: ['b', 'c'] }],
    });
    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(3);
    expect(counts.get('c')).toBe(1);
    expect(counts.get('d')).toBeUndefined();
  });
});
