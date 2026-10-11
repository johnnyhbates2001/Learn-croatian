// Push notification handlers, imported into the generated service worker (see vite.config.ts).
self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || 'Riječi', {
      body: msg.body || 'Time for some Croatian!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'daily-reminder',
      data: { url: msg.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.length) return windows[0].focus();
      return self.clients.openWindow(event.notification.data?.url || '/');
    })(),
  );
});
