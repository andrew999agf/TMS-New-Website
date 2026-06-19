/*
 * Minimal, admin-scoped service worker for the installable Time Tracker app.
 * Registered with { scope: "/admin/" }, so it ONLY ever sees /admin/* requests
 * — the public marketing site is never intercepted or cached.
 *
 * Strategy: network-first. When online, every request goes to the network so
 * content is always fresh (no stale-page bug). Responses are cached only as an
 * offline fallback. Bump CACHE to invalidate everything.
 */
const CACHE = "tms-admin-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let sameOrigin = false;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch { return; }
  if (!sameOrigin) return; // let cross-origin (e.g. model CDN) use the normal HTTP cache

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw new Error("offline and not cached");
      }
    })(),
  );
});

// Allow the page to force-activate a new SW after an update.
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
