import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';

/**
 * GitHub Pages serves the app from /reno-master/, the Capacitor WebView from /.
 * Set CAP=1 when building the Android bundle.
 */
const base = process.env.CAP ? '/' : '/reno-master/';

function git(command: string, fallback: string): string {
  try {
    return execSync(command).toString().trim();
  } catch {
    return fallback;
  }
}

/**
 * The build number is the number of commits on this branch.
 *
 * It has to be the same number in the web build and in the Android build - they run as
 * separate workflows, so a CI run number would count differently in each and the app
 * could not tell a newer build from an older one. The commit count is the same
 * everywhere and only ever grows.
 */
function buildNumber(): number {
  const counted = Number(git('git rev-list --count HEAD', '0'));
  return Number.isFinite(counted) && counted > 0 ? counted : 0;
}

/** "0.9.34" - the series from package.json, the build number as the last part */
function versionName(build: number): string {
  const series = String(process.env.npm_package_version ?? '0.9.0').split('.').slice(0, 2).join('.');
  return `${series}.${build}`;
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(versionName(buildNumber())),
    __APP_BUILD__: JSON.stringify(buildNumber()),
    __APP_SHA__: JSON.stringify(git('git rev-parse --short HEAD', 'dev')),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          pdf: ['pdfjs-dist'],
          charts: ['recharts'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,json,png,jpg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
      manifest: {
        name: 'Reno Master',
        short_name: 'Reno',
        description: 'Renovierung Schlesierstraße 31',
        lang: 'de',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1d2126',
        theme_color: '#1d2126',
        icons: [
          { src: 'img/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'img/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'img/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Neuer Tagebuch-Eintrag', short_name: 'Tagebuch', url: '#/tagebuch/neu' },
          { name: 'Beleg erfassen', short_name: 'Beleg', url: '#/kosten/neu?capture=1' },
          { name: '3D-Modell', short_name: '3D', url: '#/3d' },
        ],
      },
    }),
  ]
});
