// Service Worker for Push Notifications

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push
self.addEventListener("push", (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "New Message", body: "You have a new message" };
    }
  }

  const title = data.title || "💬 New Message";

  const options = {
    body: data.body || "You have a new message",
    icon: data.icon || "/favicon.png",
    badge: data.badge || "/favicon.png",
    vibrate: [300, 120, 300],
    tag: data.tag || "chat-notification",
    renotify: true,
    requireInteraction: false,
    sound: "default",            // OS-level sound
    data: {
      url: data.url || "/"
    },
    actions: [
      { action: "open", title: "Open Chat" }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// handle skip waiting
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
