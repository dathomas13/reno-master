import { describe, expect, it } from 'vitest';
import { safeExtension } from '../storagePath';

describe('safeExtension', () => {
  it('takes a known extension from the name', () => {
    expect(safeExtension('Grundriss.PDF', 'application/pdf')).toBe('pdf');
    expect(safeExtension('foto.jpeg', 'image/jpeg')).toBe('jpeg');
  });

  it('falls back to the type when the name carries no extension', () => {
    expect(safeExtension('Grundriss (EG)', 'application/pdf')).toBe('pdf');
    expect(safeExtension('Scan', 'image/png')).toBe('png');
    expect(safeExtension('Scan', '')).toBe('jpg');
  });

  it('never returns something the file store would refuse', () => {
    const odd = ['Plan 1967', 'a.b c', 'x.tar.gz', '.gitignore', 'plan.', 'plan.pdf '];
    for (const name of odd) {
      expect(safeExtension(name, 'application/pdf')).toMatch(/^[a-z0-9]+$/);
    }
  });
});
