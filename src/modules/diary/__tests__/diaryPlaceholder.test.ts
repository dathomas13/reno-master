import { describe, expect, it } from 'vitest';
import { diaryTextPlaceholder } from '../diaryPlaceholder';

describe('diary text placeholder', () => {
  it('does not pretend a specific person or trade did something', () => {
    const text = diaryTextPlaceholder('2026-09-19');

    expect(text).not.toContain('Wolfgang');
    expect(text).not.toContain('Perimeterdämmung');
  });

  it('changes across diary days', () => {
    const prompts = new Set(
      Array.from({ length: 7 }, (_, offset) => diaryTextPlaceholder(`2026-09-${String(19 + offset).padStart(2, '0')}`)),
    );

    expect(prompts.size).toBeGreaterThan(1);
  });
});