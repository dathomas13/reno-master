import { describe, expect, it } from 'vitest';
import { countPhaseUsage } from '../phaseUsage';

describe('countPhaseUsage', () => {
  it('is empty without sources', () => {
    expect(countPhaseUsage({}).size).toBe(0);
  });

  it('counts diary entries and tasks per phase, ignoring records without one', () => {
    const counts = countPhaseUsage({
      diary: [{ phaseId: 'p1' }, { phaseId: 'p1' }, { phaseId: undefined }],
      tasks: [{ phaseId: 'p1' }, { phaseId: 'p2' }, {}],
    });
    expect(counts.get('p1')).toBe(3);
    expect(counts.get('p2')).toBe(1);
    expect(counts.get('p3')).toBeUndefined();
  });
});
