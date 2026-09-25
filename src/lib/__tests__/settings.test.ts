import { describe, it, expect } from 'vitest';
import { roomNamingOf } from '../settings';

describe('roomNamingOf', () => {
  it('follows the one Bestand/Plan switch', () => {
    expect(roomNamingOf({ defaultModelVariant: 'ist' })).toBe('bestand');
    expect(roomNamingOf({ defaultModelVariant: 'soll' })).toBe('planung');
  });
});
