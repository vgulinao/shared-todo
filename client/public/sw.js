// Service worker: keeps the app shell (page, JS, CSS) available offline. Spec S10, decision D13.
// - Install: fetch the page and precache it together with every /assets/ file it references, so a
//   single online visit is enough for an offline reload.
// - Navigations: network first, so a deploy is picked up on the next online load; cached page as
//   the offline fallback. Every route serves the same SPA page, so one cached copy covers all.
// - Hashed assets under /assets/: cache first; their names change with their content.
// - /api, /ws, /healthz: never intercepted.
const CACHE = "shared-todo-shell-v2";
const SHELL_KEY = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
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

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const page = await fetch(SHELL_KEY, { cache: "no-cache" });
  if (!page.ok) throw new Error(`shell fetch failed: ${page.status}`);
  const html = await page.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await cache.put(SHELL_KEY, page);
  await cache.addAll(assets);
}

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
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    // Offline and never cached (e.g. an asset from a newer deploy): fail deliberately, not opaquely.
    return Response.error();
  }
}
