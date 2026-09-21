import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginSession,
  clearDebugLog,
  debugLog,
  endSession,
  noteUnfinishedSession,
  readDebugLog,
} from '../debugLog';

const at = (seconds: number) => new Date(2026, 8, 19, 20, 0, seconds);

beforeEach(() => localStorage.clear());

describe('debug log', () => {
  it('keeps every line in localStorage with a time stamp', () => {
    debugLog('kamera', 'erste', at(1));
    debugLog('kamera', 'zweite', at(2));
    expect(readDebugLog()).toEqual([
      expect.stringMatching(/^\d\d:00:01\.000 \[kamera\] erste$/),
      expect.stringMatching(/zweite$/),
    ]);
    expect(JSON.parse(localStorage.getItem('reno.debugLog') ?? '[]')).toHaveLength(2);
  });

  it('caps the log so it never fills the storage', () => {
    for (let i = 0; i < 700; i += 1) debugLog('kamera', `zeile ${i}`);
    const lines = readDebugLog();
    expect(lines).toHaveLength(600);
    expect(lines[0]).toMatch(/zeile 100$/);
    expect(lines.at(-1)).toMatch(/zeile 699$/);
  });

  it('hands back one scope on its own, and everything in order without one', () => {
    debugLog('kamera', 'eins', at(1));
    debugLog('outbox', 'zwei', at(2));
    debugLog('kamera', 'drei', at(3));
    expect(readDebugLog('kamera')).toEqual([
      expect.stringContaining('eins'),
      expect.stringContaining('drei'),
    ]);
    expect(readDebugLog('outbox')).toEqual([expect.stringContaining('zwei')]);
    expect(readDebugLog()).toHaveLength(3);
  });

  it('keeps one scope\'s crash marker away from another\'s', () => {
    beginSession('kamera', 'Linse a', at(1));
    expect(noteUnfinishedSession('outbox', at(2))).toBe(false);
    expect(noteUnfinishedSession('kamera', at(3))).toBe(true);
  });

  it('notes nothing when a session was closed properly', () => {
    beginSession('kamera', 'Linse a', at(1));
    endSession('kamera', 'nach 3.0s', at(4));
    expect(noteUnfinishedSession('kamera', at(10))).toBe(false);
    expect(readDebugLog().filter((line) => line.includes('Absturz'))).toHaveLength(0);
  });

  it('notes a crash when the last session never closed', () => {
    beginSession('kamera', 'Linse a', at(1));
    // ...the app dies here; on the next start:
    expect(noteUnfinishedSession('kamera', at(30))).toBe(true);
    const lines = readDebugLog();
    expect(lines.at(-1)).toMatch(/endete ohne Schließen – Absturz\?$/);
    expect(lines.at(-1)).toContain('[kamera]');
    // noted only once
    expect(noteUnfinishedSession('kamera', at(31))).toBe(false);
  });

  it('opening again after a crash notes the crash before the new session', () => {
    beginSession('kamera', 'Linse a', at(1));
    beginSession('kamera', 'Linse b', at(20));
    const lines = readDebugLog();
    expect(lines[1]).toContain('Absturz');
    expect(lines[2]).toContain('begonnen: Linse b');
  });

  it('clears protocol and open marker together', () => {
    beginSession('kamera', 'Linse a', at(1));
    clearDebugLog();
    expect(readDebugLog()).toEqual([]);
    expect(noteUnfinishedSession('kamera')).toBe(false);
  });
});
