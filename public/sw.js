// Minimal service worker so the app is installable. Data is never cached: the mailbox must always be live.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
