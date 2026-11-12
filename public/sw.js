const CACHE_NAME = "activity-board-v1";
const OFFLINE_URL = "/offline.html";

// Cache everything under /_next/ (Next.js JS/CSS chunks, images, fonts)
// plus the shell pages.
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/login",
  "/register",
  "/forgot-password",
  "/profile",
  "/admin",
  "/offline.html",
];

// Runtime cache for Supabase API responses (short-lived, network-first)
const API_CACHE_NAME = "activity-board-api-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  const pathname = url.pathname;

  // ---- 1. Next.js static assets (_next/*) ----
  // Cache-first: serve from cache, update in background
  if (pathname.startsWith("/_next/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // ---- 2. Shell pages ----
  // Network-first: always try the network, fall back to cache when offline.
  if (STATIC_ASSETS.includes(pathname) || pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      }).catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate") {
            return caches.match(OFFLINE_URL);
          }
          throw new Error("Offline and not cached");
        });
      })
    );
    return;
  }

  // ---- 3. Everything else (API, images, etc.) ----
  // Network-first with cache fallback
  event.respondWith(
    fetch(request).then((response) => {
      if (response.status === 200 && url.pathname.startsWith("/api/")) {
        const cloned = response.clone();
        caches.open(API_CACHE_NAME).then((cache) => cache.put(request, cloned));
      }
      return response;
    }).catch(() => {
      return caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate") {
          return caches.match(OFFLINE_URL);
        }
        throw new Error("Offline and not cached");
      });
    })
  );
});

// ---- Deadline notifications ----
// Focus an open tab (or open a new one) when a reminder is tapped.
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const target = typeof data.url === "string" ? data.url : "/dashboard";
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          if ("navigate" in client) {
            client.navigate(target).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
  );
});
