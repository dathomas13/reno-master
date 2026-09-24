/// <reference lib="webworker" />
/**
 * Service worker: precaches the app shell, caches Firebase Storage
 * downloads so photos stay visible offline, and shows the evening reminder push.
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { hasDiaryReminderDate } from './platform/diaryReminderMarker';

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

// The 3D model and the generated plans are not files any more: the model comes from the
// database and is kept in IndexedDB (src/data/modelStore.ts), the plans are drawn from it.
// The old "reno-models" cache is cleared once, so it does not linger on the device.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('reno-models').then(() => undefined));
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string })?.type === 'SKIP_WAITING') void self.skipWaiting();
});

interface ReminderPushPayload {
  title?: string;
  body?: string;
  route?: string;
  date?: string;
  notification?: { title?: string; body?: string };
  data?: { title?: string; body?: string; route?: string; date?: string };
}

function readPushPayload(event: PushEvent): ReminderPushPayload {
  if (!event.data) return {};
  try {
    return event.data.json() as ReminderPushPayload;
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const payload = readPushPayload(event);
      const data = payload.data ?? payload;
      const date = data.date ?? payload.date;
      if (date && (await hasDiaryReminderDate(date))) return;

      const title = data.title ?? payload.notification?.title ?? payload.title ?? 'Bautagebuch';
      const body = data.body ?? payload.notification?.body ?? payload.body ?? 'Heute noch kein Eintrag - jetzt schreiben?';
      const route = data.route ?? payload.route ?? '/tagebuch/neu';
      await self.registration.showNotification(title, {
        body,
        icon: new URL('img/icon-192.png', self.registration.scope).toString(),
        tag: 'diary-reminder',
        data: { route },
      });
    })(),
  );
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
