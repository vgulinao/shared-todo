// Service worker: keeps the app shell (page, JS, CSS) available offline. Spec S10, decision D13.
// - Navigations: network first, so a deploy is picked up on the next online load; cached page as
//   the offline fallback. Every route serves the same SPA page, so one cached copy covers all.
// - Hashed assets under /assets/: cache first; their names change with their content.
// - /api, /ws, /healthz: never intercepted.
const CACHE = "shared-todo-shell-v1";
const SHELL_KEY = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL_KEY))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname === "/ws" || url.pathname === "/healthz")
    return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(SHELL_KEY, response.clone());
    return response;
  } catch {
    const cached = await cache.match(SHELL_KEY);
    return cached ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
