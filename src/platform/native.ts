/**
 * Everything the app does only when it runs as the Android app.
 *
 * The plugins are imported dynamically so they never end up in the web bundle and a
 * missing plugin can never break the browser build.
 */
import { isNative } from './index';

/** status bar, splash screen and back button, called once at start up */
export async function initNative(): Promise<void> {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1d2126' });
  } catch {
    // older devices without the plugin: the app looks the same, only the bar differs
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    // nothing to hide
  }

  try {
    const { App } = await import('@capacitor/app');
    // the hardware back button should walk the history, and only leave the app at the top
    await App.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  } catch {
    // default behaviour stays
  }
}
