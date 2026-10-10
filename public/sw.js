// Service worker: la interfaz abre sin conexión y recibe los avisos push.
// Cambia VERSION en cada despliegue para que los clientes descarten la caché anterior.
const VERSION = "2026-10-10.1";
const CACHE = `marea-shell-${VERSION}`;
const SHELL = [
  "/",
  "/index.html",
  "/css/app.css",
  "/css/fonts.css",
  "/fonts/archivo-latin.woff2",
  "/fonts/figtree-latin.woff2",
  "/fonts/jetbrainsmono-latin.woff2",
  "/js/app.js",
  "/js/i18n.js",
  "/js/strings.js",
  "/js/api.js",
  "/js/alerts.js",
  "/js/rules.js",
  "/js/diary.js",
  "/js/tidechart.js",
  "/js/sharecard.js",
  "/js/surf.js",
  "/js/spots.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/offline.html",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Interfaz: red primero (así llegan las actualizaciones; el servidor pide revalidar con no-cache), caché si no hay red.
// La API la cachea la propia app.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(
        async () =>
          (await caches.match(e.request, { ignoreSearch: true })) ??
          (e.request.mode === "navigate" ? caches.match("/offline.html") : Response.error()),
      ),
  );
});

self.addEventListener("push", (e) => {
  let data;
  try {
    data = e.data?.json() ?? {};
  } catch {
    data = { title: "Marea", body: e.data?.text() };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "Marea", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let target = new URL(e.notification.data?.url || "/", location.origin);
  if (target.origin !== location.origin) target = new URL("/", location.origin); // nunca salir del sitio
  target = target.href;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === location.origin);
      if (win) {
        await win.navigate(target).catch(() => {});
        return win.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
