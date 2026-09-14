import { defineConfig, devices } from '@playwright/test';

/**
 * The app is used on a Galaxy S24 almost exclusively, so the phone project is the one
 * that matters; the desktop project only guards the laptop layout.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Galaxy S9+'],
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/reno-master/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
