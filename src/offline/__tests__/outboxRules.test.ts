import { describe, expect, it } from 'vitest';
import {
  backoffFor,
  documentGone,
  dueJobs,
  isFailed,
  MAX_ATTEMPTS,
  queueState,
} from '@/offline/outboxRules';

function job(patch: Partial<{ attempts: number; nextAttemptAt: number; createdAt: number }> = {}) {
  return { attempts: 0, nextAttemptAt: 0, createdAt: 0, ...patch };
}

describe('queueState', () => {
  it('counts what is on its way and what has given up, never both', () => {
    const jobs = [job(), job({ attempts: 3 }), job({ attempts: MAX_ATTEMPTS })];
    expect(queueState(jobs)).toEqual({ pending: 2, failed: 1 });
  });

  it('is empty for an empty queue', () => {
    expect(queueState([])).toEqual({ pending: 0, failed: 0 });
  });

  it('agrees with isFailed', () => {
    expect(isFailed(job({ attempts: MAX_ATTEMPTS - 1 }))).toBe(false);
    expect(isFailed(job({ attempts: MAX_ATTEMPTS }))).toBe(true);
  });
});

describe('dueJobs', () => {
  it('takes the oldest first', () => {
    const rows = dueJobs([job({ createdAt: 20 }), job({ createdAt: 10 })], 100);
    expect(rows.map((row) => row.createdAt)).toEqual([10, 20]);
  });

  it('leaves a file alone while it is waiting out its backoff', () => {
    expect(dueJobs([job({ attempts: 2, nextAttemptAt: 500 })], 100)).toEqual([]);
    expect(dueJobs([job({ attempts: 2, nextAttemptAt: 500 })], 600)).toHaveLength(1);
  });

  it('skips what has given up, until the user asks for it', () => {
    const given = [job({ attempts: MAX_ATTEMPTS, nextAttemptAt: 9_000 })];
    expect(dueJobs(given, 100)).toEqual([]);
    expect(dueJobs(given, 100, true)).toHaveLength(1);
  });

  it('does not reorder the array it was given', () => {
    const rows = [job({ createdAt: 20 }), job({ createdAt: 10 })];
    dueJobs(rows, 100);
    expect(rows[0].createdAt).toBe(20);
  });
});

describe('backoffFor', () => {
  it('doubles and then stops at ten minutes', () => {
    expect(backoffFor(1)).toBe(2000);
    expect(backoffFor(3)).toBe(8000);
    expect(backoffFor(20)).toBe(600_000);
  });
});

describe('documentGone', () => {
  it('recognises a deleted document, whichever way Firestore says it', () => {
    expect(documentGone(Object.assign(new Error('boom'), { code: 'not-found' }))).toBe(true);
    expect(documentGone(new Error('No document to update: projects/x/photos/y'))).toBe(true);
  });

  it('does not mistake a normal failure for it', () => {
    expect(documentGone(new Error('Hochladen fehlgeschlagen (500)'))).toBe(false);
    expect(documentGone(Object.assign(new Error('nope'), { code: 'permission-denied' }))).toBe(false);
    expect(documentGone(undefined)).toBe(false);
    expect(documentGone(null)).toBe(false);
  });
});
