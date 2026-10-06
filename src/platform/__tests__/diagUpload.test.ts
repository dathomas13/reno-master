import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReport, diagDeviceId, uploadDue } from '../diagUpload';
import { debugLog } from '../debugLog';

vi.mock('@/firebase/app', () => ({ auth: { currentUser: { email: 'a@b.de' } } }));
vi.mock('@/platform/index', () => ({ isNative: () => true }));
vi.mock('@/lib/buildInfo', () => ({ APP_VERSION: '9.9.9', APP_BUILD: 42, APP_SHA: 'abc' }));

beforeEach(() => localStorage.clear());

describe('diagnostics upload', () => {
  const now = Date.parse('2026-10-06T20:00:00Z');

  it('sends nothing when the log is empty or unchanged', () => {
    expect(uploadDue({}, undefined, now)).toBe(false);
    expect(uploadDue({ lastLine: 'x', at: '2026-10-01T00:00:00Z' }, 'x', now)).toBe(false);
  });

  it('sends something new, but not again within two minutes', () => {
    expect(uploadDue({}, 'neu', now)).toBe(true);
    expect(uploadDue({ lastLine: 'alt', at: new Date(now - 60_000).toISOString() }, 'neu', now)).toBe(false);
    expect(uploadDue({ lastLine: 'alt', at: new Date(now - 180_000).toISOString() }, 'neu', now)).toBe(true);
  });

  it('sends by hand whenever there is a log at all', () => {
    expect(uploadDue({ lastLine: 'x', at: new Date(now).toISOString() }, 'x', now, true)).toBe(true);
  });

  it('keeps one device name across calls', () => {
    const id = diagDeviceId();
    expect(id).toMatch(/^app-[a-z0-9]+$/);
    expect(diagDeviceId()).toBe(id);
  });

  it('carries the log and what is needed to read it', () => {
    debugLog('erinnerung', 'Plan: …');
    const report = buildReport('Test', new Date(now));
    expect(report).toMatchObject({ version: '9.9.9', build: 42, platform: 'app', account: 'a@b.de', reason: 'Test' });
    expect(report.lines).toEqual([expect.stringContaining('[erinnerung] Plan: …')]);
  });
});
