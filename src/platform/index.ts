/**
 * Tells web from native. In the browser build the Capacitor globals are absent, so the
 * web implementations are used; the APK build sets them and the native paths kick in.
 */
export function isNative(): boolean {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

export function platformName(): 'web' | 'android' | 'ios' {
  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const name = capacitor?.getPlatform?.();
  return name === 'android' || name === 'ios' ? name : 'web';
}
