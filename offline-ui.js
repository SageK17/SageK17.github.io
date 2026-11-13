// Shared offline/online status UI + tiny connectivity API.
// Included on the event-day pages. Renders a fixed bar along the bottom of the
// screen when the device goes offline (or while queued changes are syncing), so
// crew always know the connection state instead of seeing silent failures.
//
// Other scripts use:
//   window.JVONet.online            → current boolean
//   window.JVONet.subscribe(fn)     → fn(online) on every change; returns unsub
//   window.JVONet.setQueued(msg)    → show "N changes waiting / syncing" text
//   window.JVONet.flash(msg, kind)  → brief toast ('ok' | 'warn')
//
// CSP note: scripts must be external (this file), but inline <style> is allowed
// (styleSrc includes 'unsafe-inline'), so we inject our own scoped styles.
(() => {
  let online = navigator.onLine;
  let queuedMsg = '';
  const subs = new Set();

  function injectStyles() {
    if (document.getElementById('jvo-net-style')) return;
    const s = document.createElement('style');
    s.id = 'jvo-net-style';
    s.textContent = `
      #jvo-net-bar{position:fixed;left:0;right:0;bottom:0;z-index:99999;
        display:none;align-items:center;justify-content:center;gap:10px;
        padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));
        font:600 13.5px/1.3 system-ui,-apple-system,sans-serif;
        color:#0A1628;text-align:center;
        box-shadow:0 -6px 24px rgba(0,0,0,.28);transition:transform .25s ease}
      #jvo-net-bar.off{background:#FFB347;color:#3a1d00}
      #jvo-net-bar.sync{background:#7FD1AE;color:#06301f}
      #jvo-net-bar .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;
        background:currentColor;opacity:.85}
      #jvo-net-bar.off .dot{animation:jvo-pulse 1.3s ease-in-out infinite}
      @keyframes jvo-pulse{0%,100%{opacity:.35}50%{opacity:1}}
      /* jvo-toast-look: donkere navy-toast met status-icoon + aftel-voortgangsbalk
         (uit het JVO Motion-pakket). Boodschap blijft via textContent (geen XSS). */
      #jvo-net-toast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%) translateY(16px) scale(.97);
        z-index:100000;opacity:0;pointer-events:none;max-width:90vw;min-width:190px;
        display:flex;align-items:center;gap:10px;overflow:hidden;
        padding:12px 15px;border-radius:12px;
        font:600 13px/1.35 'Geist',system-ui,-apple-system,sans-serif;
        color:#E8F4FF;background:#0e1f3a;border:1px solid rgba(232,244,255,.1);
        box-shadow:0 16px 40px rgba(0,0,0,.5);
        transition:opacity .3s cubic-bezier(.16,1,.3,1),transform .32s cubic-bezier(.16,1,.3,1)}
      #jvo-net-toast.show{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
      #jvo-net-toast .jt-ic{width:22px;height:22px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(108,227,160,.16)}
      #jvo-net-toast .jt-ic svg{width:13px;height:13px;display:block}
      #jvo-net-toast .jt-msg{flex:1;min-width:0}
      #jvo-net-toast .jt-pb{position:absolute;left:0;bottom:0;height:3px;width:100%;transform-origin:left;background:#6CE3A0}
      #jvo-net-toast.warn .jt-ic{background:rgba(255,179,71,.18)}
      #jvo-net-toast.warn .jt-pb{background:#FFB347}
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  let bar = null;
  function ensureBar() {
    if (bar) return bar;
    injectStyles();
    bar = document.createElement('div');
    bar.id = 'jvo-net-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }

  function render() {
    const b = ensureBar();
    if (online && !queuedMsg) { b.style.display = 'none'; return; }
    b.style.display = 'flex';
    if (!online) {
      b.className = 'off';
      b.innerHTML = `<span class="dot"></span><span>Offline — ${queuedMsg ? esc(queuedMsg) + ' · ' : ''}je kunt doorwerken, wijzigingen worden bewaard</span>`;
    } else {
      b.className = 'sync';
      b.innerHTML = `<span class="dot"></span><span>${esc(queuedMsg)}</span>`;
    }
  }

  let toast = null, toastTimer = null;
  // Iconen: ok/succes → vinkje (groen); warn → uitroepteken (amber). Kleur volgt de kind.
  const TOAST_ICON = {
    ok: '<path d="M20 6 L9 17 L4 12"/>',
    warn: '<path d="M12 8 v5"/><path d="M12 17 h.01"/>',
  };
  function flash(msg, kind) {
    injectStyles();
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'jvo-net-toast';
      (document.body || document.documentElement).appendChild(toast);
    }
    const warn = kind === 'warn';
    const col = warn ? '#FFB347' : '#6CE3A0';
    // Structuur via innerHTML (vaste SVG, geen input); de boodschap zelf via textContent.
    toast.className = (kind || '');
    toast.innerHTML = `<span class="jt-ic"><svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${warn ? TOAST_ICON.warn : TOAST_ICON.ok}</svg></span><span class="jt-msg"></span><span class="jt-pb"></span>`;
    toast.querySelector('.jt-msg').textContent = msg;
    const pb = toast.querySelector('.jt-pb');
    void toast.offsetWidth;                 // reflow zodat de show-transitie + balk-animatie starten
    toast.classList.add('show');
    if (!(window.JVOFX && window.JVOFX.reduce)) { pb.style.transition = 'transform 3200ms linear'; pb.style.transform = 'scaleX(0)'; }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3200);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setOnline(v) {
    if (online === v) return;
    online = v;
    render();
    subs.forEach(fn => { try { fn(online); } catch {} });
  }

  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));

  window.JVONet = {
    get online() { return online; },
    subscribe(fn) { subs.add(fn); try { fn(online); } catch {} return () => subs.delete(fn); },
    setQueued(msg) { queuedMsg = msg || ''; render(); },
    flash,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Offline fallback page: wire its retry button and auto-reload on reconnect.
  // Detect by the button's PRESENCE, not by pathname — the service worker serves
  // offline.html as a navigation fallback under the ORIGINAL request path (e.g.
  // /toernooi.html), so a pathname check leaves the retry button dead exactly
  // when the page is most needed.
  {
    const retry = () => location.reload();
    const wire = () => {
      const btn = document.getElementById('offline-retry');
      if (!btn) return;                      // not the offline page
      btn.addEventListener('click', retry);
      window.addEventListener('online', retry);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
  }
})();
