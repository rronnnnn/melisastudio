/* Studio Melisa service worker — push notifications only.
   No fetch handler and no caching: the site always loads from the network. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  // iOS revokes the subscription if a push arrives without a visible notification,
  // so always show one, even for a malformed payload.
  const title = data.title || 'Rezervim i ri 💅';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/?admin' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/?admin', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const admin = wins.find(w => new URL(w.url).searchParams.has('admin'));
    if (admin) {
      await admin.focus();
      admin.postMessage({ type: 'booking-push' });   // panel reloads its list
      return;
    }
    await self.clients.openWindow(url);
  })());
});
