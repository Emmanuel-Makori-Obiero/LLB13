// Minimal service worker so browsers treat Group 13 as an installable app.
// It does not cache anything, so users always get the latest version.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:sans-serif;padding:2rem"><h1>You are offline</h1><p>Group 13 needs an internet connection. Reconnect and reload.</p></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )),
  )
})
