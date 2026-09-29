import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_BLOCKS,
  moveHomeBlock,
  normalizeHomeLayout,
  toggleHomeBlock,
  visibleHomeBlocks,
} from '../homeLayout';

describe('homeLayout', () => {
  it('falls back to all blocks in the default order', () => {
    expect(normalizeHomeLayout(undefined)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(visibleHomeBlocks(normalizeHomeLayout(null))).toHaveLength(HOME_BLOCKS.length);
  });

  it('repairs a stored layout: unknown out, missing appended', () => {
    const layout = normalizeHomeLayout({ order: ['costs', 'weg', 'costs'], hidden: ['weg', 'search'] });
    expect(layout.order[0]).toBe('costs');
    expect(new Set(layout.order).size).toBe(HOME_BLOCKS.length);
    expect(layout.hidden).toEqual(['search']);
  });

  it('hides, shows and moves blocks', () => {
    const base = normalizeHomeLayout(undefined);
    const hidden = toggleHomeBlock(base, 'house');
    expect(visibleHomeBlocks(hidden)).not.toContain('house');
    expect(visibleHomeBlocks(toggleHomeBlock(hidden, 'house'))).toContain('house');
    expect(moveHomeBlock(base, 'house', -1).order.slice(0, 2)).toEqual(['house', 'search']);
    expect(moveHomeBlock(base, 'search', -1)).toBe(base);
  });
});
