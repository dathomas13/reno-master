/// <reference lib="webworker" />
/**
 * Service worker: precaches the app shell and the model files, caches Firebase Storage
 * downloads so photos stay visible offline, and shows the evening reminder push.
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// photos, receipts and uploaded plans - immutable, so keep them for good
registerRoute(
  ({ url }: { url: URL }) => url.hostname === 'firebasestorage.googleapis.com',
  new CacheFirst({
    cacheName: 'reno-files',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 3000, maxAgeSeconds: 180 * 24 * 60 * 60, purgeOnQuotaError: true }),
    ],
  }),
);

// model and plan files: serve fast, refresh in the background
registerRoute(
  ({ url }: { url: URL }) => url.pathname.includes('/models/') || url.pathname.includes('/plans/'),
  new StaleWhileRevalidate({ cacheName: 'reno-models' }),
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string })?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('notificationclick', (event) => {
  const route = (event.notification.data as { route?: string } | undefined)?.route ?? '/tagebuch/neu';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const target = `${self.registration.scope}#${route}`;
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await (client as WindowClient).navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    }),
  );
});
