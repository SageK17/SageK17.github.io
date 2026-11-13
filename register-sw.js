// Registers the service worker on every event-day page so the offline cache
// (app shell + last-known tournament data) is available when the network drops.
// Kept as its own file because the CSP forbids inline scripts.
//
// Registration is idempotent — admin.js also registers /sw.js when enabling
// push, and calling register() twice for the same scope is a no-op.
// Ask the browser to keep our storage (the offline check-in / match queues live
// in localStorage). Best-effort — reduces the chance the OS evicts a queued
// score/check-in under storage pressure before it syncs.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] registration failed:', err && err.message);
    });
  });

  // When a new worker takes control, reload once so the page and its freshly
  // cached assets stay in sync. Guarded so it only ever fires a single reload.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    // Don't yank the page out from under the crew mid-action: only auto-reload
    // when the tab is hidden/backgrounded. Otherwise the new SW still serves
    // fresh content on the next manual navigation.
    if (document.visibilityState === 'hidden') location.reload();
  });
}
