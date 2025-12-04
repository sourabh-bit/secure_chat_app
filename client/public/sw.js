// Service Worker for PWA and Push Notifications
const CACHE_NAME = 'secure-chat-v4';
const OFFLINE_URL = '/';

// Assets to cache for offline
const CACHE_ASSETS = [
  '/',
  '/favicon.png',
  '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  event.waitUntil(clients.claim());
});

// Fetch event - network first for HTML/JS/CSS, cache first for static assets
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API and WebSocket requests
  if (event.request.url.includes('/api/') || event.request.url.includes('/ws')) return;
  
  const url = new URL(event.request.url);
  const isNavigate = event.request.mode === 'navigate';
  const isAsset = url.pathname.match(/\.(js|css|html)$/) || isNavigate;
  
  if (isAsset) {
    // Network first for HTML/JS/CSS - always get fresh content
    event.respondWith(
      fetch(event.request).then((fetchResponse) => {
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return fetchResponse;
      }).catch(() => {
        return caches.match(event.request) || caches.match(OFFLINE_URL);
      })
    );
  } else {
    // Cache first for static assets (images, fonts, etc.)
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          if (fetchResponse.status === 200) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return fetchResponse;
        });
      }).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
  }
});

// Handle push notifications (ADMIN ONLY - server controls who gets push)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New message',
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: data.tag || 'chat-notification',
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Secure Chat', options)
    );
  } catch (e) {
    console.error('Push notification error:', e);
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: tag || 'chat-notification',
      renotify: true,
      vibrate: [200, 100, 200]
    });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
