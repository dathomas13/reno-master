import { beforeEach, describe, expect, it } from 'vitest';
import { hintSeen, markHintSeen } from '../hints';

beforeEach(() => localStorage.clear());

describe('one-time hints', () => {
  it('remembers a hint once it was seen, per id', () => {
    expect(hintSeen('raum-antippen')).toBe(false);
    markHintSeen('raum-antippen');
    expect(hintSeen('raum-antippen')).toBe(true);
    expect(hintSeen('lightbox-wischen')).toBe(false);
  });

  it('survives broken stored data', () => {
    localStorage.setItem('reno.hints.seen', '{kaputt');
    expect(hintSeen('raum-antippen')).toBe(false);
    markHintSeen('raum-antippen');
    expect(hintSeen('raum-antippen')).toBe(true);
  });
});
