import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginCameraSession,
  cameraLog,
  clearCameraLog,
  endCameraSession,
  noteUnfinishedCameraSession,
  readCameraLog,
} from '../cameraLog';

const at = (seconds: number) => new Date(2026, 8, 19, 20, 0, seconds);

beforeEach(() => localStorage.clear());

describe('camera protocol', () => {
  it('keeps every line in localStorage with a time stamp', () => {
    cameraLog('erste', at(1));
    cameraLog('zweite', at(2));
    expect(readCameraLog()).toEqual([expect.stringMatching(/^\d\d:00:01\.000 erste$/), expect.stringMatching(/zweite$/)]);
    expect(JSON.parse(localStorage.getItem('reno.cameraLog') ?? '[]')).toHaveLength(2);
  });

  it('caps the protocol so it never fills the storage', () => {
    for (let i = 0; i < 450; i += 1) cameraLog(`zeile ${i}`);
    const lines = readCameraLog();
    expect(lines).toHaveLength(400);
    expect(lines[0]).toMatch(/zeile 50$/);
    expect(lines.at(-1)).toMatch(/zeile 449$/);
  });

  it('notes nothing when a session was closed properly', () => {
    beginCameraSession('Linse a', at(1));
    endCameraSession('nach 3.0s', at(4));
    expect(noteUnfinishedCameraSession(at(10))).toBe(false);
    expect(readCameraLog().filter((line) => line.includes('Absturz'))).toHaveLength(0);
  });

  it('notes a crash when the last session never closed', () => {
    beginCameraSession('Linse a', at(1));
    // ...the app dies here; on the next start:
    expect(noteUnfinishedCameraSession(at(30))).toBe(true);
    const lines = readCameraLog();
    expect(lines.at(-1)).toMatch(/endete ohne Schließen – Absturz\?$/);
    expect(lines.at(-1)).toContain('geöffnet');
    // noted only once
    expect(noteUnfinishedCameraSession(at(31))).toBe(false);
  });

  it('opening again after a crash notes the crash before the new session', () => {
    beginCameraSession('Linse a', at(1));
    beginCameraSession('Linse b', at(20));
    const lines = readCameraLog();
    expect(lines[1]).toContain('Absturz');
    expect(lines[2]).toContain('Kamera geöffnet: Linse b');
  });

  it('clears protocol and open marker together', () => {
    beginCameraSession('Linse a', at(1));
    clearCameraLog();
    expect(readCameraLog()).toEqual([]);
    expect(noteUnfinishedCameraSession()).toBe(false);
  });
});
