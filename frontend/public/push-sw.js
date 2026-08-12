// Cargado dentro del service worker generado por vite-plugin-pwa (vía
// workbox.importScripts) — mismo scope global, así que puede agregar sus
// propios listeners sin chocar con las rutas de caché que registra Workbox.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "AquiAyudamosVE", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "AquiAyudamosVE", {
      body: data.body || "",
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
