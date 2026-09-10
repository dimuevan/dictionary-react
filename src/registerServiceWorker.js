/**
 * Registers the app-shell worker so the page opens offline and can be installed
 * to a home screen. Scoped to the build's base path, which matters because the
 * app is deployed under a subdirectory.
 *
 * Development is left alone: a stale worker there costs more debugging time
 * than the offline support is worth.
 */
const registerServiceWorker = () => {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}service-worker.js`;
    navigator.serviceWorker.register(url).catch(() => {
      // registration fails on http:// and in private windows; the app still runs
    });
  });
};

export default registerServiceWorker;
