/// <reference lib="webworker" />
/**
 * Service worker: precaches the app shell and the model files, caches Firebase Storage
 * downloads so photos stay visible offline, and shows the evening reminder push.
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
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

// The model channel asks the published site whether a newer model exists. That question
// must reach the network: the precache above answers the bundled address, and with
// registerType 'prompt' it keeps answering with the old model until an app update is
// accepted - which is exactly the coupling the channel is there to remove. The channel
// therefore appends a query parameter, which no precache entry matches, and this route
// takes it from the network only. Offline the fetch fails, the app keeps its model.
registerRoute(
  ({ url }: { url: URL }) => url.pathname.endsWith('/models/manifest.json') && url.search !== '',
  new NetworkOnly(),
);

// model and plan files: serve fast, refresh in the background. A model fetched over the
// network carries its version in the query, so a new version is a new address and can
// never be answered with the body of the old one. Capped, because those addresses would
// otherwise pile up with every release.
registerRoute(
  ({ url }: { url: URL }) => url.pathname.includes('/models/') || url.pathname.includes('/plans/'),
  new StaleWhileRevalidate({
    cacheName: 'reno-models',
    plugins: [new ExpirationPlugin({ maxEntries: 24, maxAgeSeconds: 60 * 24 * 60 * 60 })],
  }),
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
