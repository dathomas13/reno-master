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
      // no smallIcon on purpose: naming a drawable that the template does not ship makes
      // notifications fail silently at runtime. Add one with the icon, then set it here.
      iconColor: '#c9a86a',
    },
  },
};

export default config;
