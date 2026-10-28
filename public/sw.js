/* Stash service worker: offline shell, static caching, Web Share Target, notifications. */
const VERSION = "stash-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const PRECACHE = ["/offline", "/icons/192", "/icons/512", "/manifest.webmanifest"];

const SHARE_DB = "stash-share";
const SHARE_STORE = "pending";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SHARE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function handleShareTarget(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f) => f && typeof f === "object" && f.size > 0);
    const payload = {
      title: form.get("title") || "",
      text: form.get("text") || "",
      url: form.get("url") || "",
      files,
      at: Date.now(),
    };
    const db = await openShareDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).put(payload, "latest");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Share target failed", err);
  }
  return Response.redirect("/share?from=share-target", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  // Let Next.js handle client-side navigation payloads (RSC) directly.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  // Immutable build assets and icons: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: network first, fall back to the last cached copy, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok && res.type === "basic" && !res.redirected) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(url.pathname, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(PAGES_CACHE);
          return (await cache.match(url.pathname)) || (await caches.match("/offline")) || Response.error();
        }
      })(),
    );
  }
});

// Ready for Web Push (server-side sender not included yet — see README).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Stash", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Stash reminder", {
      body: data.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      tag: data.tag,
      data: { url: data.url || "/calendar" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
