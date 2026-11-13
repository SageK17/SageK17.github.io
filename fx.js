// JVO visual FX — ambient embers + celebration confetti.
// Vanilla, self-hosted (no CDN), CSP-safe, works offline. Canvas-based so it
// stays smooth, bounded, and off the layout. Fully honors prefers-reduced-motion:
// every effect is a no-op when the user asks for reduced motion.
(() => {
  const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = mq ? mq.matches : false;
  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => { reduce = e.matches; });

  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

  // ---------------------------------------------------------------- embers
  // A slow field of glowing embers drifting up over the dark background.
  function startEmbers(canvas) {
    if (reduce || !canvas || !canvas.getContext) return;
    if (canvas.dataset.fxInit) return;   // idempotent — never double-start a canvas
    canvas.dataset.fxInit = '1';
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, embers = [], raf = null, running = true;
    const COUNT = Math.max(8, Math.min(26, Math.round(window.innerWidth / 46)));

    function resize() {
      const dpr = DPR();
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn(initial) {
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 12,
        r: 0.8 + Math.random() * 2.0,
        vy: 0.18 + Math.random() * 0.55,
        vx: (Math.random() - 0.5) * 0.25,
        life: 0, max: 240 + Math.random() * 260,
        hue: 22 + Math.random() * 22, // ember orange → gold
      };
    }
    function tick() {
      if (!running) { raf = null; return; }
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        e.y -= e.vy; e.x += e.vx; e.vx += (Math.random() - 0.5) * 0.02; e.life++;
        if (e.y < -12 || e.life > e.max) Object.assign(e, spawn(false));
        const a = Math.sin(Math.min(1, e.life / e.max) * Math.PI) * 0.65;
        const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4.5);
        grd.addColorStop(0, `hsla(${e.hue}, 100%, 63%, ${a})`);
        grd.addColorStop(1, `hsla(${e.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 4.5, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(tick);
    }

    resize();
    embers = Array.from({ length: COUNT }, () => spawn(true));
    tick();
    let resizeRaf = null;
    window.addEventListener('resize', () => {
      if (resizeRaf) return;                 // coalesce bursts of resize events
      resizeRaf = requestAnimationFrame(() => { resizeRaf = null; resize(); });
    });
    document.addEventListener('visibilitychange', () => {
      running = document.visibilityState === 'visible';
      if (running && !raf) tick();
    });
  }

  // ---------------------------------------------------------------- confetti
  let cv = null, cx = null, parts = [], craf = null;
  function ensure() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60;';
    document.body.appendChild(cv);
    cx = cv.getContext('2d');
  }
  function sizeConf() {
    const dpr = DPR();
    cv.width = Math.round(window.innerWidth * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function confetti(opts = {}) {
    if (reduce) return;
    ensure(); sizeConf();
    const W = window.innerWidth, H = window.innerHeight;
    const colors = opts.colors || ['#FF6B1A', '#FFB347', '#FFCD7A', '#E8F4FF'];
    const n = opts.count || 50;
    const ox = (opts.x != null ? opts.x : 0.5) * W;
    const oy = (opts.y != null ? opts.y : 0.42) * H;
    const power = opts.power || 13;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.95);
      parts.push({
        x: ox, y: oy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - power * 0.55,
        g: 0.26 + Math.random() * 0.12,
        w: 5 + Math.random() * 6, h: 8 + Math.random() * 9,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
        drift: (Math.random() - 0.5) * 0.6,
        color: colors[i % colors.length],
        life: 0, max: 95 + Math.random() * 55,
      });
    }
    if (!craf) craf = requestAnimationFrame(confTick);
  }
  function confTick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    const H = window.innerHeight;
    parts = parts.filter(p => p.life < p.max && p.y < H + 50);
    for (const p of parts) {
      p.life++; p.vy += p.g; p.vx += p.drift * 0.05; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const fade = p.life > p.max - 26 ? (p.max - p.life) / 26 : 1;
      cx.save();
      cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.globalAlpha = Math.max(0, fade);
      cx.fillStyle = p.color;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
    }
    if (parts.length) craf = requestAnimationFrame(confTick);
    else { craf = null; cx.clearRect(0, 0, cv.width, cv.height); }
  }

  // ---------------------------------------------------------------- scroll reveal
  // [data-fx-reveal] elements fade/rise in as they enter the viewport. The hidden
  // pre-state is gated by the .fx-on class (added here only when JS runs and motion
  // is allowed), so without JS or with reduced motion the content is visible by
  // default — never gated behind a transition that could leave it blank.
  function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('fx-on');
    const els = document.querySelectorAll('[data-fx-reveal]');
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('fx-in'); io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const vh = window.innerHeight || document.documentElement.clientHeight;
    els.forEach((el) => {
      // Already in view at load → reveal synchronously so it never paints a
      // hidden frame (the async IO callback would flash it blank for a frame).
      // Below-fold elements get the scroll-reveal animation as normal.
      if (el.getBoundingClientRect().top < vh) el.classList.add('fx-in');
      else io.observe(el);
    });
  }

  // ---------------------------------------------------------------- count-up
  // Animate a number element from its current value to `to` (ease-out). Used for
  // the admin KPIs — first paint counts up from 0, later refreshes tween old→new,
  // an unchanged value snaps instantly (no distracting re-animation on poll).
  function countUp(el, to, ms) {
    if (!el) return;
    to = Number(to) || 0;
    const from = Number(String(el.textContent).replace(/[^\d-]/g, '')) || 0;
    if (reduce || from === to) { el.textContent = to; return; }
    ms = ms || 700;
    const start = performance.now();
    (function step(now) {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = to;
    })(performance.now());
  }

  // ---------------------------------------------------------------- init
  function init() {
    document.querySelectorAll('canvas[data-fx-embers]').forEach(startEmbers);
    reveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.JVOFX = { confetti, startEmbers, reveal, countUp, get reduce() { return reduce; } };
})();
