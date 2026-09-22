/**
 * The waiting service worker, in one place.
 *
 * `registerSW` may only run once per tab - a second call re-registers and attaches a
 * second `onNeedRefresh` handler, which is how the banner and the settings screen used to
 * fight over the same update. Both now read this instead.
 */
import { registerSW } from 'virtual:pwa-register';
import { isNative } from '@/platform/index';

type Listener = () => void;

let apply: (() => Promise<void>) | null = null;
let ready = false;
let registered = false;
const listeners = new Set<Listener>();

function ensureRegistered(): void {
  if (registered || isNative()) return;
  registered = true;
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true;
      listeners.forEach((listener) => listener());
    },
  });
}

/** Whether a new build is already waiting to take over this tab. */
export function swUpdateReady(): boolean {
  ensureRegistered();
  return ready;
}

/** Calls `listener` again each time a new build starts waiting. Returns the unsubscribe. */
export function onSwUpdateReady(listener: Listener): () => void {
  ensureRegistered();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Activates the waiting service worker; the page reloads under the new build. */
export function applySwUpdate(): void {
  void apply?.();
}
