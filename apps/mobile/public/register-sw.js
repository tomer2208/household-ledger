// The service worker caches the app shell (offline read-only) and receives Web Push.
// Not on the dev server: it would serve stale bundles over hot reload.
// A file rather than an inline <script>, so the Content-Security-Policy needs no exception.
if ('serviceWorker' in navigator && (location.port !== '8081' || location.search.includes('sw=1'))) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (e) {
      console.warn('Service worker registration failed', e);
    });
  });
}
