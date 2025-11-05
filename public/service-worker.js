// public/service-worker.js
self.addEventListener("install", () => {
  // Nur Platzhalter – kein aggressives Caching
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
