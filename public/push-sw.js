/*
 * Miqat push worker.
 *
 * The browser keeps this small script alive after the app's tabs are closed, so
 * a notification can still be shown. It does two things only: show what the
 * server pushed, and open the right screen when the notification is clicked.
 *
 * It caches nothing and handles no fetches - it is not an offline worker.
 *
 * The server sends the same values the open app receives over its live channel:
 *   { id, title, message, type, linkedEntityId, linkedEntityType,
 *     linkedCommentId, triggeredByUserName }
 */

/** Where in the app a notification points. Mirrors the notifications page. */
function urlFor(data) {
  const id = data.linkedEntityId;

  switch (data.linkedEntityType) {
    case 'TaskItem':
      if (!id) return '/tasks';
      return data.linkedCommentId ? `/tasks/${id}?comment=${data.linkedCommentId}` : `/tasks/${id}`;
    case 'Group':
      return id ? `/projects/${id}` : '/projects';
    case 'Friendship':
      return '/friends?tab=requests';
    case 'Event':
      return id ? `/calendar?event=${id}` : '/calendar';
    default:
      return '/inbox';
  }
}

self.addEventListener('install', () => {
  // A new version takes over straight away; there is no cache to migrate.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: show the text as it is rather than nothing.
    data = { message: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Miqat';
  const options = {
    body: data.message || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    // The same notification pushed twice replaces itself instead of stacking.
    tag: data.id || undefined,
    data: { url: urlFor(data) }
  };

  // A push must always end in a visible notification, or the browser shows its
  // own "this site was updated in the background" message instead.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target = new URL((event.notification.data && event.notification.data.url) || '/inbox', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Reuse a tab that already has the app open, rather than opening another.
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      } catch {
        // That tab could not be used; fall through to opening a new one.
      }
    }

    await self.clients.openWindow(target);
  })());
});
