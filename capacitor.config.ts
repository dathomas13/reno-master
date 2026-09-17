import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android wrapper around the same web app that runs on GitHub Pages.
 *
 * The web build is served from the app bundle, so everything works with no network.
 * `androidScheme: 'https'` keeps the origin a proper https origin, which IndexedDB,
 * Firebase Auth persistence and the camera all expect.
 */
const config: CapacitorConfig = {
  appId: 'de.friedl.renomaster',
  appName: 'Reno Master',
  webDir: 'dist',
  android: {
    // a raw WebView, the app draws its own dark UI
    backgroundColor: '#1d2126',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#1d2126',
      showSpinner: false,
      androidSplashResourceName: 'splash',
    },
    LocalNotifications: {
      // Android draws only the alpha channel of this one, white on transparent. Without a
      // valid drawable it drops the notification without a word - no error, no log. The
      // file is tools/icon/android/ic_stat_reno.xml, copied in by tools/android/patch-android.mjs
      // and checked by the APK workflow, so the name here can never point at nothing.
      smallIcon: 'ic_stat_reno',
      iconColor: '#c9a86a',
    },
  },
};

export default config;
