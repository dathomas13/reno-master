import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeTopmost, useBackClose } from '../backHandlers';

afterEach(cleanup);

describe('back button closes what is open', () => {
  it('closes the topmost first, then the one below, then lets back through', () => {
    const below = vi.fn();
    const top = vi.fn();
    const first = renderHook(() => useBackClose(true, below));
    const second = renderHook(() => useBackClose(true, top));

    expect(closeTopmost()).toBe(true);
    expect(top).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();

    second.unmount();
    expect(closeTopmost()).toBe(true);
    expect(below).toHaveBeenCalledTimes(1);

    first.unmount();
    expect(closeTopmost()).toBe(false);
  });

  it('ignores a handler that is not active', () => {
    const close = vi.fn();
    renderHook(() => useBackClose(false, close));
    expect(closeTopmost()).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});
