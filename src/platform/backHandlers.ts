import { useEffect, useRef } from 'react';

/**
 * What the Android back button closes before it walks the history: an open menu or
 * sheet, the topmost first. Without this, back left the page and the menu stayed open
 * over the next one.
 */
const stack: { close(): void }[] = [];

/** true when back closed something - the history stays where it is */
export function closeTopmost(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** while `active`, the back button calls `close` instead of going back */
export function useBackClose(active: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!active) return;
    const entry = { close: () => latest.current() };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [active]);
}
