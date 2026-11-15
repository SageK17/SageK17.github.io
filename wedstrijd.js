// JVO crew-bediening — crew-side live match control (sideline phone).
// Crew logs in with a scoped CREW_CODE (not the admin code) and can only
// start/stop matches and change scores. Every state change goes through an
// 8-second buffer with an undo, so a mis-tap is always recoverable.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const clamp = (n) => Math.max(0, Math.min(99, n));

  let token = localStorage.getItem('jvo_crew_token') || null;
  let crewName = localStorage.getItem('jvo_crew_name') || '';
  let DATA = null, offset = 0;
  let listFilter = 'all';         // all | live | scheduled | done
  let veldFilter = 'all';         // all | '1'..'N' — crew works one field
  const POULES = ['A', 'B', 'C', 'D'];

  // ---------- JVO Smart flags — welke verweven learnings staan aan ----------
  // Publiek + gecachet, zodat de crew-poka-yoke's ook offline werken. Standaard AAN
  // (beschermend); alleen een in de admin AFGEWEZEN learning zet zijn feature uit.
  let smartFlags = null;
  try { const c = localStorage.getItem('jvo_smart_flags'); if (c) smartFlags = JSON.parse(c); } catch {}
  function smartOn(id) { return !smartFlags || smartFlags[id] !== false; }
  async function loadSmartFlags() {
    try {
      const r = await fetch('/api/smart/flags');
      if (r.ok) { const d = await r.json(); if (d && d.flags) { smartFlags = d.flags; try { localStorage.setItem('jvo_smart_flags', JSON.stringify(d.flags)); } catch {} } }
    } catch { /* offline → val terug op cache/default AAN */ }
  }
  loadSmartFlags().then(() => { try { updateQueueUi(); } catch {} });

  // ---------- Evenement-profiel — gelden de ingebouwde spelregels? ----------
  // De wachttijd bij een no-show ("na 10 min wachten") staat alleen in de ingebouwde
  // spelregels. Schrijft de organisatie eigen regels, dan noemen we geen vaste minuten.
  // Uit /api/config (flags.builtinRules), gecachet voor offline; onbekend = niet tonen.
  let builtinRules = false;
  try { builtinRules = localStorage.getItem('jvo_builtin_rules') === '1'; } catch {}
  (async () => {
    try {
      const r = await fetch('/api/config');
      if (!r.ok) return;
      const d = await r.json();
      if (!d || !d.flags) return;
      builtinRules = !!d.flags.builtinRules;
      try { localStorage.setItem('jvo_builtin_rules', builtinRules ? '1' : '0'); } catch {}
    } catch { /* offline → cache */ }
  })();

  // ---------- Plek-naam van het hoofdtoernooi (Veld / Baan / Tafel / Court) ----------
  // Een competitie kiest zelf hoe een speelplek heet. Uit /api/competitions
  // (competitie 1 = dit scherm), gecachet voor offline. Standaard en bij een
  // onbekende waarde blijft het "Veld": één-sport-installaties zien geen verschil.
  const PLEK_VORMEN = {
    Veld:  { mv: 'velden', dit: 'dit veld',    jouw: 'jouw veld' },
    Baan:  { mv: 'banen',  dit: 'deze baan',   jouw: 'jouw baan' },
    Tafel: { mv: 'tafels', dit: 'deze tafel',  jouw: 'jouw tafel' },
    Court: { mv: 'courts', dit: 'dit court',   jouw: 'jouw court' },
  };
  let plekNaam = 'Veld';
  try { const c = localStorage.getItem('jvo_crew_plek'); if (c && PLEK_VORMEN[c]) plekNaam = c; } catch {}
  const plek = () => plekNaam;                              // "Veld"
  const plekKlein = () => plekNaam.toLowerCase();           // "veld"
  const plekVorm = (k) => PLEK_VORMEN[plekNaam][k];
  (async () => {
    try {
      const r = await fetch('/api/competitions');
      if (!r.ok) return;
      const d = await r.json();
      const c = d && Array.isArray(d.competitions) ? d.competitions.find(x => x.id === 1) : null;
      const n = c && PLEK_VORMEN[c.place_noun] ? c.place_noun : 'Veld';
      try { localStorage.setItem('jvo_crew_plek', n); } catch {}
      if (n !== plekNaam) { plekNaam = n; try { if (token && listTick && !current) renderList(); } catch {} }
    } catch { /* offline → cache */ }
  })();

  const KO_NAME = { VR1:'Play-off 1', VR2:'Play-off 2', A1:'Achtste finale 1', A2:'Achtste finale 2', A3:'Achtste finale 3', A4:'Achtste finale 4', A5:'Achtste finale 5', A6:'Achtste finale 6', A7:'Achtste finale 7', A8:'Achtste finale 8', KF1:'Kwartfinale 1', KF2:'Kwartfinale 2', KF3:'Kwartfinale 3', KF4:'Kwartfinale 4', HF1:'Halve finale 1', HF2:'Halve finale 2', Finale:'Finale', '3e/4e':'Troostfinale (3e/4e)' };
  const BUFFER_MS = 8000;

  // control state
  // net-crew-01: welke wedstrijden de crew deze sessie al bevestigd heeft ("juiste
  // wedstrijd?") — zodat de verificatiepoort maar één keer per wedstrijd verschijnt.
  const confirmedMatches = new Set();
  let current = null;             // flat match being controlled
  let liveScore = { a: 0, b: 0 }; // score committed on the server
  let pending = null;             // deferred op: {kind:'score',draft} | {kind:'start'} | {kind:'end',score,body}
  let bufferDeadline = 0, bufferTick = null;
  let gameTick = null;
  let listTick = null;
  let listClockTick = null;

  // ---------- api ----------
  // Hard timeout so a captive-portal / "online but unreachable" network fails
  // fast (into the offline queue) instead of hanging on a goal — the exact
  // moment the crew can least afford a frozen control panel.
  function fetchWithTimeout(path, opts = {}, ms = 7000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(path, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
  }
  async function api(path, opts = {}) {
    const res = await fetchWithTimeout(path, { ...opts, headers: { 'x-admin-token': token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    // A 401 is an EXPIRED SESSION, not a network fault. Tag the error so callers
    // (commitPending/flushQueue) don't mistake it for "offline" and queue the op
    // as if it'll send later — it can't, until the crew logs back in.
    if (res.status === 401) { logout(); const e = new Error('Sessie verlopen'); e.auth = true; throw e; }
    return res;
  }
  function parseTs(s) { return s ? new Date(s.replace(' ', 'T') + 'Z').getTime() : null; }
  function serverNow() { return Date.now() + offset; }
  // sqlite datetime('now') format in UTC — so optimistic offline timers match
  // what the server will eventually store.
  function serverNowStr() {
    const t = new Date(serverNow());
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
  }

  // ---------- offline write-queue ----------
  // When the network drops, committed match actions are stored locally and
  // replayed when it returns. Safe to replay because the server stores scores
  // as ABSOLUTE values (setscore) and start/end are idempotent — re-sending a
  // queued op that actually landed before the connection died is a no-op.
  const QUEUE_KEY = 'jvo_match_queue';
  let flushing = false;
  function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); updateQueueUi(); }
  function enqueue(op) { const q = loadQueue(); q.push(op); saveQueue(q); }
  function updateQueueUi() {
    const n = loadQueue().length;
    if (window.JVONet) window.JVONet.setQueued(n ? `${n} wedstrijd-wijziging${n > 1 ? 'en' : ''} in wachtrij` : '');
    renderSyncChip(n);
  }
  // net-crew-04: altijd-zichtbaar sync-statuschipje in de kop (groen verbonden /
  // geel versturen / grijs offline+wachtrij). Puur uit de lokale queue, geen netwerk.
  function renderSyncChip(n) {
    const el = $('wd-sync'); if (!el) return;
    if (!token || !smartOn('net-crew-04')) { el.className = 'wd-sync wd-hidden'; return; }
    let cls, txt;
    if (!navigator.onLine) { cls = 'off'; txt = n ? `Offline · ${n} in wachtrij` : 'Offline'; }
    else if (n) { cls = 'pending'; txt = `${n} ${n === 1 ? 'wijziging' : 'wijzigingen'} versturen…`; }
    else { cls = 'ok'; txt = 'Verbonden'; }
    el.className = `wd-sync ${cls}`;
    el.innerHTML = `<span class="d"></span>${txt}`;
  }
  function sendOp(op) {
    if (op.kind === 'setscore') {
      // A correction of a DONE knock-out tie needs the penalty result in the SAME
      // request (the server refuses a tied KO correction without pens), so the op
      // may carry pens_a/pens_b alongside the absolute score.
      const body = { score_a: op.score_a, score_b: op.score_b };
      if (Number.isInteger(op.pens_a) && Number.isInteger(op.pens_b)) { body.pens_a = op.pens_a; body.pens_b = op.pens_b; }
      return api(`/api/admin/tournament/match/${op.matchId}/setscore`, { method: 'POST', body: JSON.stringify(body) });
    }
    if (op.kind === 'start') return api(`/api/admin/tournament/match/${op.matchId}/start`, { method: 'POST', body: JSON.stringify(op.started_at ? { started_at: op.started_at } : {}) });
    if (op.kind === 'end') return api(`/api/admin/tournament/match/${op.matchId}/end`, { method: 'POST', body: JSON.stringify(op.body || {}) });
    return Promise.reject(new Error('unknown op'));
  }
  async function flushQueue() {
    if (flushing || !token || !navigator.onLine) return;
    let q = loadQueue();
    if (!q.length) return;
    flushing = true;
    const startedWith = q.length;
    try {
      while (q.length) {
        const op = q[0];
        let res;
        try { res = await sendOp(op); }
        catch { break; }                       // network/session error → stop, keep the rest
        if (res.ok) { q.shift(); saveQueue(q); continue; }
        // 423 = tournament paused: a TRANSIENT lock, not a verdict on the op.
        // Keep it queued and stop flushing — the periodic retry / next trigger
        // sends it after "Hervat". Dropping here would lose a genuinely played
        // match's start/score/end just because the org paused at that moment.
        if (res.status === 423) {
          if (window.JVONet) window.JVONet.flash('Toernooi gepauzeerd — je wijzigingen staan klaar en worden na het hervatten verstuurd', 'warn');
          break;
        }
        // Server reachable but rejected it (e.g. stale 400). Drop it so it can't
        // wedge the queue forever, but surface what happened.
        const j = await res.json().catch(() => ({}));
        console.warn('[match-queue] op rejected on replay:', op, j.error);
        // Don't drop it silently — a legitimately-intended action vanishing
        // without a trace is worse than a noisy warning.
        if (window.JVONet) {
          const label = op.kind === 'setscore' ? 'Een standwijziging' : (op.kind === 'start' ? 'Een start' : 'Een beëindiging');
          window.JVONet.flash(`${label} uit de wachtrij is afgewezen en overgeslagen${j.error ? ' — ' + j.error : ''}`, 'warn');
        }
        q.shift(); saveQueue(q);
      }
    } finally {
      flushing = false;
    }
    if (!loadQueue().length && startedWith > 0 && window.JVONet) {
      window.JVONet.flash('Wedstrijd-wijzigingen gesynchroniseerd', 'ok');
    }
    // Re-sync whatever view is open to the server's truth — but NEVER while the
    // crew has a buffered action open (openControl nulls `pending`, which would
    // silently discard their uncommitted +1/start/end mid-countdown).
    if (!$('wd-list').classList.contains('wd-hidden')) refresh().then(renderList).catch(() => {});
    else if (current && !pending && !$('wd-control').classList.contains('wd-hidden')) { try { await openControl(current.id); } catch {} }
  }
  window.addEventListener('online', flushQueue);
  // sync-chip meteen laten meebewegen met verbindingswissels (los van de flush)
  window.addEventListener('online', updateQueueUi);
  window.addEventListener('offline', updateQueueUi);
  // Periodic retry: the 'online' event never fires when navigator.onLine stayed
  // true through an outage (wifi up, uplink dead), so without this the queue
  // could sit unsent indefinitely while the crew keeps working.
  setInterval(flushQueue, 20000);

  // ---------- auth ----------
  function show(view) {
    $('wd-login').classList.toggle('wd-hidden', view !== 'login');
    $('wd-list').classList.toggle('wd-hidden', view !== 'list');
    $('wd-control').classList.toggle('wd-hidden', view !== 'control');
    $('wd-logout').classList.toggle('wd-hidden', view === 'login');
    // JVO Smart-tip hoort alleen bij de lijst; renderSmartCrew() beslist of hij zichtbaar wordt
    if (view !== 'list') { const sm = $('wd-smart'); if (sm) sm.hidden = true; }
    try { updateQueueUi(); } catch {}   // sync-chip volgt de view (token-gate regelt zichtbaarheid)
  }
  function logout() {
    token = null; localStorage.removeItem('jvo_crew_token');
    stopTimers(); clearBuffer(); pending = null; show('login');
  }
  $('wd-logout').addEventListener('click', logout);
  $('wd-login-btn').addEventListener('click', login);
  $('wd-code').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  async function login() {
    const name = $('wd-name').value.trim(), code = $('wd-code').value;
    $('wd-login-alert').innerHTML = '';
    if (name.length < 2 || !code) { $('wd-login-alert').innerHTML = '<div class="alert error">Vul je naam en de crew-code in.</div>'; return; }
    try {
      const res = await fetch('/api/crew/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code }) });
      const json = await res.json();
      if (!res.ok) { $('wd-login-alert').innerHTML = `<div class="alert error">${esc(json.error || 'Inloggen mislukt')}</div>`; return; }
      token = json.token; crewName = json.name;
      localStorage.setItem('jvo_crew_token', token); localStorage.setItem('jvo_crew_name', crewName);
      flushQueue();   // drain anything queued while logged out / offline
      enterList();
      maybeShowInstall();   // one-time "add to home screen" guide after login
    } catch { $('wd-login-alert').innerHTML = '<div class="alert error">Netwerkfout.</div>'; }
  }

  // ---------- data ----------
  async function refresh() {
    const res = await fetch('/api/tournament', { cache: 'no-store' });
    const json = await res.json();
    // When offline the service worker hands back a {offline:true} sentinel if it
    // has nothing cached — never let that clobber the last-known schedule.
    if (json && json.offline) return DATA;
    DATA = json;
    offset = (DATA.server_now || Date.now()) - Date.now();
    renderPaused();
    return DATA;
  }

  // Show/hide the "tournament paused" banner from the live data.
  function renderPaused() {
    const el = document.getElementById('wd-paused');
    if (el) el.hidden = !(DATA && DATA.paused);
  }
  // Block any crew action while paused (server enforces this too with a 423).
  function pausedBlock() {
    if (DATA && DATA.paused) {
      const msg = 'Het toernooi is gepauzeerd door de organisatie — je kunt nu niets aanpassen.';
      if (window.JVONet && window.JVONet.flash) window.JVONet.flash(msg, 'warn'); else alert(msg);
      return true;
    }
    return false;
  }

  // "15:30 · Veld 2" (with the live "verwacht" time when running late).
  function whenLabel(m) {
    if (!m.time) return '';
    const veld = m.field ? ` · ${plek()} ${m.field}` : '';
    const late = m.expected && m.expected !== m.time && (m.delay || 0) >= 3 && m.status !== 'done';
    return `${m.time}${late ? ` → ${m.expected}` : ''}${veld}`;
  }

  function flatMatches() {
    if (!DATA || !DATA.configured) return [];
    const out = [];
    for (const p of POULES) {
      const pl = DATA.poules[p];
      if (!pl) continue;
      for (const m of pl.matches) {
        out.push({ id: m.id, group: `Poule ${p}`, ctx: `Poule ${p} · R${m.round}`, a: m.a, b: m.b, score_a: m.score_a, score_b: m.score_b, status: m.status, started_at: m.started_at, controllable: true, slot: m.slot, time: m.time, field: m.field, expected: m.expected, delay: m.delay });
      }
    }
    for (const k of DATA.knockout) {
      const a = k.a.name || k.a.placeholder, b = k.b.name || k.b.placeholder;
      out.push({ id: k.id, group: 'Knock-out', ctx: KO_NAME[k.label] || k.label, a, b, score_a: k.score_a, score_b: k.score_b, pens_a: k.pens_a, pens_b: k.pens_b, status: k.status, started_at: k.started_at, controllable: !!(k.a.name && k.b.name), phase: 'ko', label: k.label, slot: k.slot, time: k.time, field: k.field, expected: k.expected, delay: k.delay });
    }
    return out;
  }

  // ---------- list ----------
  function enterList() {
    // A buffered action (an uncommitted +1/start/end inside its 8s window) must
    // not silently vanish because the crew tapped "← Terug" — commit it now.
    // commitPending() snapshots the match, so navigating on is safe.
    if (pending) commitPending();
    show('list'); stopTimers(); clearBuffer(); clearTimeout(pensLiveTimer); current = null; pending = null;
    renderList();
    refresh().then(renderList).catch(() => {});
    // Sport-hub: staat er een ándere sport open (body.hub-mode, gezet door
    // wedstrijd-hub.js — ook als competitie 1 uit staat), dan is deze lijst
    // verborgen en haalt het hub-paneel zijn eigen gegevens op. Dan hier niet
    // blijven pollen: anders heeft elk crew-toestel twee ophaalrondes lopen.
    listTick = setInterval(() => { if (hubOpen()) return; refresh().then(renderList).catch(() => {}); }, 8000);
    listClockTick = setInterval(() => { if (!hubOpen()) tickListClocks(); }, 1000);
  }
  const hubOpen = () => document.body.classList.contains('hub-mode');
  // Terug van een andere sport naar het hoofdtoernooi: meteen verversen (de
  // 8s-ronde stond stil). En een haak voor de stijl: het icoon van de gekozen
  // sport als CSS-variabele op het hub-paneel, voor het icoon-in-de-ring op de
  // wedstrijdkaartjes. Het pad komt uit een vaste lijst op de server; hier nog
  // eens streng gecontroleerd voordat het in een url() belandt.
  (function hubHooks() {
    if (typeof MutationObserver !== 'function') return;
    let was = hubOpen();
    new MutationObserver(() => {
      const now = hubOpen();
      if (was && !now && token && listTick) refresh().then(renderList).catch(() => {});
      was = now;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Op de schil (.wd-shell), niet alleen op het hub-paneel: ook de lijst van het
    // hoofdtoernooi toont dan het icoon van zíjn sport in plaats van het
    // evenement-icoon. Alleen als er echt iets te kiezen valt (meer dan één sport):
    // een installatie met één toernooi houdt het evenement-icoon.
    const chips = $('wd-sport-chips'), hub = $('wd-hub');
    const shell = document.querySelector('.wd-shell') || hub;
    if (!chips || !hub) return;
    const sync = () => {
      const img = chips.querySelectorAll('.wh-chip').length > 1 ? chips.querySelector('.wh-chip[aria-selected="true"] img') : null;
      const src = img ? img.getAttribute('src') || '' : '';
      if (/^\/sport\/[a-z0-9-]+\.webp$/.test(src)) shell.style.setProperty('--wh-icoon', `url('${src}')`);
      else shell.style.removeProperty('--wh-icoon');
    };
    new MutationObserver(sync).observe(chips, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    sync();
  })();

  const bySlot = (a, b) => (a.slot ?? 999) - (b.slot ?? 999) || (a.field ?? 0) - (b.field ?? 0) || a.id - b.id;

  // A live match shown big at the top — one tap opens the controls.
  function liveCard(m) {
    return `<div class="wd-now ${m.controllable ? '' : 'locked'}" data-id="${m.id}">
        <div class="wd-now-top">
          <span class="wd-now-field">${m.field ? plek() + ' ' + esc(String(m.field)) : 'Live'}</span>
          <span class="wd-now-ctx">${esc(m.ctx)}</span>
          <span class="wd-now-clk clk" data-start="${m.started_at || ''}">--:--</span>
        </div>
        <div class="wd-now-body">
          <span class="wd-now-team">${esc(m.a)}</span>
          <span class="wd-now-sc"><b>${m.score_a ?? 0}</b><i>:</i><b>${m.score_b ?? 0}</b></span>
          <span class="wd-now-team">${esc(m.b)}</span>
        </div>
        <div class="wd-now-cta">${m.controllable ? 'Bedienen →' : 'Wacht op vorige ronde'}</div>
      </div>`;
  }

  // A scheduled/done match in the list — kickoff time is the prominent anchor.
  function matchCard(m) {
    const live = m.status === 'live', done = m.status === 'done';
    const pill = live ? '<span class="wd-pill live">● live</span>' : (done ? '<span class="wd-pill done">klaar</span>' : '<span class="wd-pill sched">gepland</span>');
    const sc = (m.score_a != null) ? `<span class="sc">${m.score_a}–${m.score_b}</span>` : '';
    const dis = m.controllable ? '' : ' aria-disabled="true"';
    const late = m.time && m.expected && m.expected !== m.time && (m.delay || 0) >= 3 && m.status !== 'done';
    const time = `<div class="wd-m-time">${m.time ? esc(m.time) : '–'}${late ? `<span class="wd-exp">→ ${esc(m.expected)}</span>` : ''}</div>`;
    const veld = (veldFilter === 'all' && m.field) ? ` · ${plek()} ${esc(String(m.field))}` : '';
    // data-status: haak voor de stijl (thema's kleuren 'klaar' anders dan 'gepland')
    return `<div class="wd-match ${live ? 'live' : ''} ${m.controllable ? '' : 'locked'}" data-id="${m.id}" data-status="${live ? 'live' : (done ? 'done' : 'scheduled')}"${dis}>
        ${time}
        <div class="teams">${esc(m.a)}<span class="v">vs</span>${esc(m.b)}<div class="ctx">${esc(m.ctx)}${veld}</div></div>
        <div class="right">${pill}<div class="scwrap">${sc}</div></div>
      </div>`;
  }

  // ---------- JVO Smart (crew) — slanke, niet-blokkerende tip-regel ----------
  // De Duif — dezelfde getracede JVO-duif als het laadscherm (jvo-loader.js), viewBox 80×39
  const JVS_DOVE_CREW = '<svg viewBox="0 0 80 39" fill="currentColor" aria-hidden="true"><path d="M71.88 0.38 L75.13 0.63 L77.19 1.13 L78.06 1.88 L77.75 2.88 L76.25 4.13 L74.75 5.63 L73.25 7.38 L71.75 9.38 L70.25 11.63 L68.38 13.94 L66.13 16.31 L63.50 18.75 L60.50 21.25 L58.69 23.38 L58.06 25.13 L58.63 26.50 L60.38 27.50 L61.81 28.44 L62.94 29.31 L63.75 30.13 L64.25 30.88 L64.00 31.50 L63.00 32.00 L61.25 32.38 L58.75 32.63 L56.06 33.19 L53.19 34.06 L50.13 35.25 L46.88 36.75 L43.63 37.75 L40.38 38.25 L37.13 38.25 L33.88 37.75 L30.44 36.81 L26.81 35.44 L23.00 33.63 L19.00 31.38 L15.81 29.69 L13.44 28.56 L11.88 28.00 L11.13 28.00 L10.88 27.56 L11.13 26.69 L11.88 25.38 L13.13 23.63 L13.13 21.31 L11.88 18.44 L9.38 15.00 L5.63 11.00 L3.81 8.06 L3.94 6.19 L6.00 5.38 L10.00 5.63 L14.44 6.75 L19.31 8.75 L24.63 11.63 L30.38 15.38 L35.63 17.19 L40.38 17.06 L44.63 15.00 L48.38 11.00 L51.94 7.75 L55.31 5.25 L58.50 3.50 L61.50 2.50 L63.81 1.69 L65.44 1.06 L66.38 0.63 L66.63 0.38 L67.63 0.25 L69.38 0.25 Z"/></svg>';
  // Kiest deterministisch één relevante regel voor de crew op hun gepinde veld:
  // eerst de live-wedstrijd (score-controle vóór affluiten), anders de eerstvolgende
  // te bedienen wedstrijd. Geen fetch → offline-veilig. Alle namen ge-esc().
  function smartCrewTip(matches) {
    const onField = (m) => veldFilter === 'all' || String(m.field) === veldFilter;
    const vd = (m) => m.field ? ` op ${plekKlein()} ${esc(String(m.field))}` : '';
    // net-crew-10: voortgang op het gepinde veld — hoeveel poule nog, dan knock-out.
    // Alleen bij een gepind veld met zowel poule- als KO-wedstrijden erop.
    const progress = () => {
      if (!smartOn('net-crew-10') || veldFilter === 'all') return '';
      const onF = matches.filter(m => String(m.field) === veldFilter);
      const group = onF.filter(m => m.phase !== 'ko');
      const hasKo = onF.some(m => m.phase === 'ko');
      if (!hasKo || !group.length) return '';
      const gDone = group.filter(m => m.status === 'done').length;
      if (gDone >= group.length) return '';   // poule op dit veld klaar → geen nut meer
      return `<span class="wd-tip-sub">Op ${plekVorm('dit')}: <b>${gDone}/${group.length}</b> poule gespeeld, daarna knock-out.</span>`;
    };
    const live = matches.filter(m => m.status === 'live' && onField(m)).sort(bySlot)[0];
    if (live) {
      return { sev: 'warn', html: `<b>${esc(live.a)}</b> – <b>${esc(live.b)}</b> speelt nu${vd(live)}. Werk de score bij en controleer 'm vóór je affluit.${progress()}` };
    }
    const sched = matches.filter(m => m.status === 'scheduled' && onField(m)).sort(bySlot);
    const next = sched.find(m => m.controllable) || sched[0];
    if (next) {
      const when = next.expected || next.time;
      // net-crew-09: laat ook de wedstrijd dáárna zien, zodat de crew kan doorpakken.
      // Alleen een te-bedienen wedstrijd — een nog-gesloten KO-tie (wacht op feeder)
      // als "Daarna" tonen wekt de verkeerde verwachting.
      const after = smartOn('net-crew-09') ? sched.slice(sched.indexOf(next) + 1).find(m => m.controllable) : null;
      const afterWhen = after && (after.expected || after.time);
      const daarna = after ? `<span class="wd-tip-sub">Daarna: <b>${esc(after.a)}</b> vs <b>${esc(after.b)}</b>${afterWhen ? ` · ${esc(afterWhen)}` : ''}.</span>` : '';
      return { sev: 'info', html: `Volgende${vd(next)}: <b>${esc(next.a)}</b> vs <b>${esc(next.b)}</b>${when ? ` · ${esc(when)}` : ''}.${daarna}${progress()}` };
    }
    return null;
  }
  function renderSmartCrew(matches) {
    const el = $('wd-smart'); if (!el) return;
    const tip = (matches && matches.length) ? smartCrewTip(matches) : null;
    const html = tip ? `<span class="jvs-mark sm">${JVS_DOVE_CREW}</span><span class="jvs-tip-txt">${tip.html}</span>` : '';
    // net als renderList: DOM niet onder de vinger herbouwen als de tip niet veranderde
    if (renderSmartCrew.last === html) { el.hidden = !tip; return; }
    renderSmartCrew.last = html;
    el.className = tip ? `jvs jvs-crew jvs--${tip.sev}` : 'jvs jvs-crew';
    el.innerHTML = html;
    el.hidden = !tip;
  }

  function renderList() {
    const matches = flatMatches();
    renderSmartCrew(matches);
    if (!matches.length) {
      $('wd-list').innerHTML = `<jvo-empty title="Nog geen toernooischema" hint="Vraag de organisatie om het toernooi te genereren."></jvo-empty>`;
      return;
    }
    const counts = { live: 0, scheduled: 0, done: 0 };
    matches.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });
    const fields = [...new Set(matches.map(m => m.field).filter(Boolean))].sort((a, b) => a - b);
    if (veldFilter !== 'all' && !fields.includes(parseInt(veldFilter, 10))) veldFilter = 'all';

    const chip = (key, label, n) => `<button class="wd-chip ${listFilter === key ? 'on' : ''}" data-filter="${key}">${label}${n ? `<i>${n}</i>` : ''}</button>`;
    const statusChips = `<div class="wd-filter">
        ${chip('all', 'Alles', 0)}
        ${chip('live', '● Live', counts.live)}
        ${chip('scheduled', 'Te spelen', counts.scheduled)}
        ${chip('done', 'Klaar', counts.done)}
      </div>`;
    // Veld filter — a crew member can pin their own field.
    const vChip = (key, label) => `<button class="wd-vchip ${veldFilter === key ? 'on' : ''}" data-veld="${key}">${label}</button>`;
    const veldChips = fields.length > 1
      ? `<div class="wd-vfilter">${vChip('all', 'Alle ' + plekVorm('mv'))}${fields.map(f => vChip(String(f), plek() + ' ' + f)).join('')}</div>`
      : '';

    const statusVisible = matches.filter(m => listFilter === 'all' || m.status === listFilter);
    let visible = (veldFilter !== 'all') ? statusVisible.filter(m => String(m.field) === veldFilter) : statusVisible;

    // Live matches sit big at the top (only in the unfiltered view; when a status
    // filter is on, the list itself already focuses on what you asked for). They
    // are surfaced regardless of any pinned veld, so a crew never misses a kick-off
    // on a neighbouring field just because they pinned their own.
    let liveSection = '';
    const showNow = listFilter === 'all';
    if (showNow) {
      const liveMs = statusVisible.filter(m => m.status === 'live').sort(bySlot);
      if (liveMs.length) liveSection = `<div class="wd-now-h"><span class="wd-now-dot"></span>Nu live</div><div class="wd-now-grid">${liveMs.map(liveCard).join('')}</div>`;
    }
    // ...and are excluded from the schedule below to avoid showing them twice.
    const inBody = (m) => showNow ? m.status !== 'live' : true;

    let body;
    if (veldFilter !== 'all') {
      const ms = visible.filter(inBody).sort(bySlot);
      body = ms.length ? `<div class="wd-grid">${ms.map(matchCard).join('')}</div>` : '';
    } else {
      // Group by field — that's how the crew is physically organised.
      body = fields.map(f => {
        const ms = visible.filter(m => m.field === f && inBody(m)).sort(bySlot);
        if (!ms.length) return '';
        return `<div class="wd-group-h">${plek()} ${f}</div><div class="wd-grid">${ms.map(matchCard).join('')}</div>`;
      }).join('');
      const noField = visible.filter(m => !m.field && inBody(m)).sort(bySlot);
      if (noField.length) body += `<div class="wd-group-h">Nog niet ingepland</div><div class="wd-grid">${noField.map(matchCard).join('')}</div>`;
    }
    if (!liveSection && !body) body = `<jvo-empty title="Niets in deze weergave" hint="Kies een ander filter of ${plekKlein()}." state="neutral"></jvo-empty>`;

    // Skip the rebuild when NOTHING changed: the 8s refresh would otherwise
    // replace the DOM under the crew's finger (a tap landing mid-swap opens the
    // wrong match) and reset scroll momentum — for zero benefit.
    const html = statusChips + veldChips + liveSection + body;
    if (html === renderList.lastHtml) { tickListClocks(); return; }
    renderList.lastHtml = html;
    $('wd-list').innerHTML = html;

    $('wd-list').querySelectorAll('.wd-chip').forEach(b => b.addEventListener('click', () => { listFilter = b.dataset.filter; renderList(); }));
    $('wd-list').querySelectorAll('.wd-vchip').forEach(b => b.addEventListener('click', () => { veldFilter = b.dataset.veld; renderList(); }));
    $('wd-list').querySelectorAll('.wd-match, .wd-now').forEach(el => {
      const m = matches.find(x => x.id == el.dataset.id);
      if (m && m.controllable) el.addEventListener('click', () => openControl(m.id).catch(() => enterList()));
    });
    tickListClocks();
  }

  // Tick the elapsed-time clocks on the "Nu live" cards once a second.
  function tickListClocks() {
    const mins = (DATA && DATA.schedule && DATA.schedule.match_min) || (DATA && DATA.match_minutes) || 10;
    document.querySelectorAll('#wd-list .clk[data-start]').forEach(el => {
      const st = parseTs(el.dataset.start);
      if (!st) { el.textContent = '--:--'; return; }
      const ms = Math.max(0, serverNow() - st);
      el.textContent = `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
      el.classList.toggle('extra', ms >= mins * 60000);
    });
  }

  // ---------- control ----------
  async function openControl(id) {
    stopTimers(); clearBuffer(); pending = null;
    await refresh();
    const m = flatMatches().find(x => x.id === id);
    if (!m) { enterList(); return; }
    // net-crew-07: zachte one-phone-poka-yoke — waarschuw als er nog niet-verzonden
    // wijzigingen voor een ANDERE wedstrijd in de wachtrij staan (de offline-datarace
    // die de queue niet kan oplossen). Puur lokaal, blokkeert niet.
    if (smartOn('net-crew-07') && loadQueue().some(op => op.matchId && op.matchId !== id)) {
      if (window.JVONet && window.JVONet.flash) window.JVONet.flash('Let op: er staan nog niet-verzonden wijzigingen van een andere wedstrijd. Rond die eerst af — één telefoon per wedstrijd.', 'warn');
    }
    current = m;
    liveScore = { a: m.score_a ?? 0, b: m.score_b ?? 0 };
    show('control');
    renderControl();
    gameTick = setInterval(updateTimer, 250);
  }

  // score shown on the board (pending draft if mid-edit, else committed)
  function boardScore() { return (pending && pending.kind === 'score') ? pending.draft : liveScore; }
  function setBoardScore(s) {
    if ($('wd-num-a')) $('wd-num-a').textContent = s.a;
    if ($('wd-num-b')) $('wd-num-b').textContent = s.b;
    // net-crew-03: "− goal weghalen" visueel disabled bij 0 — je kunt geen goal
    // weghalen die er niet is (de handler was al een no-op; dit maakt het zichtbaar).
    if (smartOn('net-crew-03') && current && (current.status === 'live' || current.status === 'done')) {
      document.querySelectorAll('#wd-control .wd-minus').forEach(btn => {
        const zero = (s[btn.dataset.side] || 0) <= 0;
        btn.disabled = zero; btn.style.opacity = zero ? '.4' : '';
      });
    }
  }

  function renderControl() {
    const m = current;
    const live = m.status === 'live', done = m.status === 'done';
    const disp = boardScore();
    const canScore = live || done;   // corrections allowed on a finished match too
    // net-crew-01: vóór de EERSTE start van een geplande wedstrijd één keer "juiste
    // wedstrijd?" laten bevestigen (niet bij correcties op een lopende/afgeronde). Puur
    // een UI-poort vóór de bestaande start-flow — raakt score/queue niet.
    const needConfirm = !live && !done && m.controllable && smartOn('net-crew-01') && !confirmedMatches.has(m.id);
    const noshowHtml = m.controllable ? `
        <button class="wd-noshow-btn" id="wd-noshow-toggle">Team niet op komen dagen? → reglementair 3–0</button>
        <div class="wd-noshow" id="wd-noshow-panel" hidden>
          <div class="t">Welk team is er niet${builtinRules ? ' (na 10 min wachten)' : ''}?</div>
          <button class="wd-btn wd-noshow-pick" id="wd-noshow-a">${esc(m.a)} kwam niet → <b>0–3</b></button>
          <button class="wd-btn wd-noshow-pick" id="wd-noshow-b">${esc(m.b)} kwam niet → <b>3–0</b></button>
          <button class="wd-btn" id="wd-noshow-cancel">Annuleren</button>
        </div>` : '';
    const schedActions = needConfirm
      ? `<div class="wd-verify" id="wd-verify">
          <div class="wd-verify-h">Juiste wedstrijd?</div>
          <div class="wd-verify-m">${m.field ? `${plek()} ${esc(String(m.field))} · ` : ''}<b>${esc(m.a)}</b> tegen <b>${esc(m.b)}</b></div>
          <button class="wd-big" id="wd-verify-ok">Ja — dit is de juiste wedstrijd</button>
          <div class="wd-note">Check dit vóór je start: speelt déze wedstrijd nu op ${plekVorm('jouw')}?</div>
        </div>`
      : `<button class="wd-big start" id="wd-start">${HICON.play} Wedstrijd starten</button>
        <div class="wd-note">Start de wedstrijd om de timer te laten lopen en goals toe te voegen.</div>${noshowHtml}`;
    $('wd-control').innerHTML = `
      <button class="wd-back" id="wd-back">← Terug naar wedstrijden</button>
      <div class="wd-c-head ${live ? 'live' : ''}">
        ${m.field ? `<span class="wd-c-field">${plek()} ${esc(String(m.field))}</span>` : ''}
        <span class="wd-c-ctx">${esc(m.ctx)}${m.time ? ` · ${esc(whenLabel(m) || m.time)}` : ''}</span>
        ${live ? '<span class="wd-c-pill live">● live</span>' : (done ? '<span class="wd-c-pill done">klaar</span>' : '<span class="wd-c-pill sched">nog niet gestart</span>')}
      </div>
      <div class="wd-board ${live ? 'live' : ''}">
        <div class="wd-team">
          <div class="nm">${esc(m.a)}</div>
          <div class="num" id="wd-num-a">${disp.a}</div>
          <button class="wd-plus" data-side="a" ${canScore ? '' : 'disabled style="opacity:.4"'}>+1</button>
          <button class="wd-minus" data-side="a" ${canScore ? '' : 'disabled style="opacity:.4"'}>− goal weghalen</button>
        </div>
        <div class="wd-mid">
          <div class="wd-timer" id="wd-timer">--:--</div>
          <div class="wd-timer-lbl" id="wd-timer-lbl">tijd</div>
          <div class="wd-vs">–</div>
        </div>
        <div class="wd-team">
          <div class="nm">${esc(m.b)}</div>
          <div class="num" id="wd-num-b">${disp.b}</div>
          <button class="wd-plus" data-side="b" ${canScore ? '' : 'disabled style="opacity:.4"'}>+1</button>
          <button class="wd-minus" data-side="b" ${canScore ? '' : 'disabled style="opacity:.4"'}>− goal weghalen</button>
        </div>
      </div>

      <div class="wd-pending" id="wd-pending"></div>

      <div class="wd-pens" id="wd-pens">
        <div class="wd-pens-h">Gelijkspel — beslis met penalty's</div>
        <div class="wd-pens-grid">
          <div class="wd-pens-team">
            <div class="nm">${esc(m.a)}</div>
            <div class="wd-pens-step">
              <button class="wd-pens-btn" data-pside="a" data-d="-1">−</button>
              <div class="val" id="wd-pens-a">0</div>
              <button class="wd-pens-btn" data-pside="a" data-d="1">+</button>
            </div>
          </div>
          <div class="wd-pens-x">–</div>
          <div class="wd-pens-team">
            <div class="nm">${esc(m.b)}</div>
            <div class="wd-pens-step">
              <button class="wd-pens-btn" data-pside="b" data-d="-1">−</button>
              <div class="val" id="wd-pens-b">0</div>
              <button class="wd-pens-btn" data-pside="b" data-d="1">+</button>
            </div>
          </div>
        </div>
        <div class="wd-pens-warn" id="wd-pens-warn"></div>
        <div class="wd-pens-acts">
          <button class="wd-btn" id="wd-pens-cancel">Annuleren</button>
          <button class="wd-btn go end" id="wd-pens-ok">Penalty's vastleggen →</button>
        </div>
      </div>

      <div class="wd-actions">
        ${!live && !done ? schedActions : ''}
        ${live ? `<button class="wd-big end" id="wd-end">${HICON.stop} Wedstrijd beëindigen</button>` : ''}
        ${done ? `<div class="wd-note">Wedstrijd afgelopen. Klopt de stand niet? Gebruik “− goal weghalen” / “+1” om te corrigeren.</div>` : ''}
        ${done && m.phase === 'ko' ? `<button class="wd-big end" id="wd-pens-redo">${HICON.redo} Penalty's invoeren / wijzigen</button>` : ''}
      </div>`;

    $('wd-back').addEventListener('click', enterList);
    $('wd-control').querySelectorAll('.wd-plus').forEach(b => b.addEventListener('click', () => adjust(b.dataset.side, +1)));
    $('wd-control').querySelectorAll('.wd-minus').forEach(b => b.addEventListener('click', () => adjust(b.dataset.side, -1)));
    if ($('wd-start')) $('wd-start').addEventListener('click', startMatch);
    // net-crew-01: "juiste wedstrijd?" bevestigd → onthoud voor deze sessie en toon de start-flow
    if ($('wd-verify-ok')) $('wd-verify-ok').addEventListener('click', () => { confirmedMatches.add(current.id); renderControl(); });
    if ($('wd-end')) $('wd-end').addEventListener('click', endMatch);
    if ($('wd-pens-redo')) $('wd-pens-redo').addEventListener('click', redoPens);
    // Walkover (niet op komen dagen): reglementaire 3–0 voor het aanwezige team.
    // Gaat door de normale 8s-buffer (met Ongedaan maken) en dezelfde queue-ops
    // (absolute setscore + einde) — dus offline-veilig, en zonder valse
    // "begint nu"-push omdat de wedstrijd nooit gestart wordt.
    if ($('wd-noshow-toggle')) $('wd-noshow-toggle').addEventListener('click', () => {
      const p = $('wd-noshow-panel'); if (p) p.hidden = !p.hidden;
    });
    const noshow = (absent) => {
      if (pausedBlock()) return;
      if ($('wd-noshow-panel')) $('wd-noshow-panel').hidden = true;
      finalizeEnd({}, absent === 'a' ? { a: 0, b: 3 } : { a: 3, b: 0 });
    };
    if ($('wd-noshow-a')) $('wd-noshow-a').addEventListener('click', () => noshow('a'));
    if ($('wd-noshow-b')) $('wd-noshow-b').addEventListener('click', () => noshow('b'));
    if ($('wd-noshow-cancel')) $('wd-noshow-cancel').addEventListener('click', () => { $('wd-noshow-panel').hidden = true; });
    $('wd-control').querySelectorAll('.wd-pens-btn').forEach(b => b.addEventListener('click', () => adjustPens(b.dataset.pside, parseInt(b.dataset.d, 10))));
    if ($('wd-pens-cancel')) $('wd-pens-cancel').addEventListener('click', () => {
      $('wd-pens').classList.remove('show');
      // Afgebroken shoot-out: haal de live-tussenstand van het bord (het bord
      // toonde al "n.p. bezig" — zonder clear blijft dat de rest van de
      // wedstrijd staan). Fire-and-forget, net als de updates zelf.
      clearTimeout(pensLiveTimer);
      if (current && current.status === 'live' && current.phase !== 'group') {
        api(`/api/admin/tournament/match/${current.id}/pens-live`, { method: 'POST', body: JSON.stringify({ clear: true }) }).catch(() => {});
      }
    });
    if ($('wd-pens-ok')) $('wd-pens-ok').addEventListener('click', confirmPens);
    setBoardScore(disp);   // net-crew-03: begintoestand van de −-knoppen goedzetten
    renderPending();
    updateTimer();
  }

  function bump(side) {
    const el = $('wd-num-' + side);
    if (!el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  // ----- deferred-action buffer (goals, start, end all flow through this) -----
  function adjust(side, delta) {
    if (pausedBlock()) return;
    if (current.status !== 'live' && current.status !== 'done') return;
    if (pending && pending.kind !== 'score') return;   // mid start/end — ignore taps
    const base = (pending && pending.kind === 'score') ? pending.draft : { ...liveScore };
    const next = clamp(base[side] + delta);
    if (next === base[side]) return;
    base[side] = next;
    pending = { kind: 'score', draft: base };
    setBoardScore(base);
    bump(side);
    renderPending();
    startBuffer();
  }

  function startMatch() {
    if (pausedBlock()) return;
    if (pending && pending.kind !== 'start') cancelPending();
    // Capture the kickoff timestamp NOW (when the crew taps start), not at commit
    // time, so an offline start replayed minutes later still records the true
    // kickoff and the live clock isn't reset to 00:00 on reconnect.
    pending = { kind: 'start', startedAt: serverNowStr() };
    renderPending();
    startBuffer();
  }

  function endMatch() {
    if (pausedBlock()) return;
    const sc = boardScore();   // capture the (possibly uncommitted) board score now
    // Knock-out tie → first decide the penalty shoot-out, then end.
    if (current.phase === 'ko' && sc.a === sc.b) { openPens(sc); return; }
    finalizeEnd({}, sc);
  }

  // `score` is the final regular-time score to persist with the end. We pass it
  // explicitly because openPens() nulls `pending`, so boardScore() can no longer
  // be trusted to return the tie that triggered the shoot-out.
  function finalizeEnd(body, score) {
    if ($('wd-pens')) $('wd-pens').classList.remove('show');
    pending = { kind: 'end', score: { ...score }, body };
    renderPending();
    startBuffer();
  }

  // ----- penalty shoot-out entry (knockout ties) -----
  let pens = { a: 0, b: 0 };
  let pensScore = { a: 0, b: 0 };   // the tied regular-time score to persist
  function openPens(sc) {
    clearBuffer(); pending = null; renderPending();
    pens = { a: 0, b: 0 };
    pensScore = { ...sc };
    const panel = $('wd-pens');
    if (!panel) return;
    $('wd-pens-a').textContent = '0';
    $('wd-pens-b').textContent = '0';
    $('wd-pens-warn').textContent = '';
    panel.classList.add('show');
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // Re-open the penalty panel for an ALREADY-FINISHED knock-out match (e.g. the
  // score was corrected back to a tie). Only valid when the current board is a
  // tie; pre-fills any existing penalties so the crew can adjust them.
  function redoPens() {
    if (pausedBlock()) return;
    const sc = boardScore();
    if (sc.a !== sc.b) {
      if (window.JVONet) window.JVONet.flash("De stand is geen gelijkspel — penalty's zijn alleen nodig bij een gelijke stand.", 'warn');
      return;
    }
    openPens(sc);
    if (Number.isInteger(current.pens_a) && Number.isInteger(current.pens_b)) {
      pens = { a: current.pens_a, b: current.pens_b };
      $('wd-pens-a').textContent = pens.a;
      $('wd-pens-b').textContent = pens.b;
    }
  }
  let pensLiveTimer = null;
  function adjustPens(side, delta) {
    pens[side] = clamp(pens[side] + delta);
    $('wd-pens-' + side).textContent = pens[side];
    $('wd-pens-warn').textContent = '';
    // Tussenstand van de shoot-out live naar het bord (puur cosmetisch —
    // fire-and-forget met debounce; de definitieve uitslag gaat via het
    // gebufferde einde, dus een gemiste update hier kan niets breken).
    if (current && current.status === 'live' && current.phase !== 'group') {
      const mid = current.id;          // snapshot: 'current' kan wisselen vóór de timer vuurt
      clearTimeout(pensLiveTimer);
      pensLiveTimer = setTimeout(() => {
        if (!current || current.id !== mid || current.status !== 'live') return;
        api(`/api/admin/tournament/match/${mid}/pens-live`, {
          method: 'POST', body: JSON.stringify({ pens_a: pens.a, pens_b: pens.b }),
        }).catch(() => {});
      }, 700);
    }
  }
  function confirmPens() {
    if (pausedBlock()) return;
    if (pens.a === pens.b) {
      $('wd-pens-warn').textContent = "Penalty's kunnen niet gelijk zijn — er moet een winnaar uitkomen.";
      return;
    }
    finalizeEnd({ pens_a: pens.a, pens_b: pens.b }, pensScore);
  }

  function renderPending() {
    const panel = $('wd-pending');
    if (!panel) return;
    if (!pending) { panel.classList.remove('show'); panel.innerHTML = ''; return; }
    let msg, goLbl, goCls = 'go', warn = '';
    if (pending.kind === 'score') {
      msg = `Nieuwe stand: <b>${pending.draft.a}–${pending.draft.b}</b>`; goLbl = 'Nu vastzetten';
    } else if (pending.kind === 'start') {
      msg = `Wedstrijd wordt gestart…`; goLbl = 'Nu starten'; goCls = 'go start';
    } else {
      const s = pending.score;
      const pens = Number.isInteger(pending.body.pens_a) ? ` · n.p. ${pending.body.pens_a}–${pending.body.pens_b}` : '';
      msg = `Beëindigen — eindstand <b>${s.a}–${s.b}</b>${pens}`; goLbl = 'Nu beëindigen'; goCls = 'go end';
      // net-crew-08: zachte poka-yoke voor de klassieke misklik "beëindigen met de
      // score nog op 0-0" (score vergeten). Geen blokkade — de bevestiging + het
      // ongedaan-maken blijven; alleen een zichtbaar "klopt dat?" (een 0-0 in de
      // poule is een geldige uitslag). KO-gelijkspel gaat nooit hierlangs (dat loopt
      // via de penalty-flow), dus dit raakt alleen echte poule-0-0'en.
      if (smartOn('net-crew-08') && s.a === 0 && s.b === 0 && !Number.isInteger(pending.body.pens_a)) {
        warn = `<div class="wd-pending-warn">Eindstand <b>0–0</b> — heb je de score al ingevoerd? Zo niet: eerst de goals bijwerken. Klopt 0–0? Dan gewoon bevestigen.</div>`;
      }
    }
    panel.classList.add('show');
    panel.innerHTML = `
      <div class="row"><div class="msg">${msg}</div><div class="cnt" id="wd-cnt">${Math.ceil(BUFFER_MS / 1000)}</div></div>
      ${warn}
      <div class="bar"><i id="wd-bar"></i></div>
      <div class="acts">
        <button class="wd-btn" id="wd-undo">Ongedaan maken</button>
        <button class="wd-btn ${goCls}" id="wd-commit">${goLbl}</button>
      </div>`;
    $('wd-undo').addEventListener('click', cancelPending);
    $('wd-commit').addEventListener('click', commitPending);
  }

  // Time-based, not tick-count-based: the deadline is an absolute timestamp, so
  // the buffer still expires on schedule even when the browser throttles or
  // freezes setInterval in a backgrounded tab. The visibilitychange handler
  // below also commits the instant the crew returns if it already expired.
  function startBuffer() {
    clearInterval(bufferTick);
    bufferDeadline = Date.now() + BUFFER_MS;
    paintBuffer();
    bufferTick = setInterval(paintBuffer, 100);
  }
  function paintBuffer() {
    const left = Math.max(0, bufferDeadline - Date.now());
    if ($('wd-cnt')) $('wd-cnt').textContent = Math.ceil(left / 1000);
    if ($('wd-bar')) $('wd-bar').style.width = (left / BUFFER_MS) * 100 + '%';
    if (left <= 0) commitPending();
  }
  function clearBuffer() { clearInterval(bufferTick); bufferTick = null; bufferDeadline = 0; }

  // Optimistically apply a committed action to the local view so the crew can
  // keep working while offline; the queued op makes it real on reconnect.
  function applyOptimistic(p) {
    if (p.kind === 'score') {
      liveScore = { ...p.draft };
      current.score_a = liveScore.a; current.score_b = liveScore.b;
      renderPending(); setBoardScore(liveScore);
    } else if (p.kind === 'start') {
      current.status = 'live';
      current.started_at = p.startedAt || serverNowStr();
      if (liveScore.a == null) liveScore.a = 0;
      if (liveScore.b == null) liveScore.b = 0;
      renderControl();
      if (!gameTick) gameTick = setInterval(updateTimer, 250);
    } else if (p.kind === 'end') {
      if (p.score) { liveScore = { ...p.score }; current.score_a = liveScore.a; current.score_b = liveScore.b; }
      current.status = 'done';
      renderControl();
    }
  }

  function queuedNotice(p) {
    updateQueueUi();
    const label = p.kind === 'score' ? 'Stand' : (p.kind === 'start' ? 'Start' : 'Beëindiging');
    if (window.JVONet) window.JVONet.flash(`${label} opgeslagen — wordt verstuurd zodra er verbinding is`, 'warn');
  }

  async function commitPending() {
    const p = pending;
    clearBuffer();
    if (!p) return;
    pending = null;
    // Snapshot the match this action belongs to: the crew may navigate away
    // (Terug commits instead of discarding) while the requests are in flight,
    // so `current` can change or go null under the awaits below.
    const cur = current;
    if (!cur) return;

    // Translate the action into the ordered server ops it implies.
    const ops = [];
    if (p.kind === 'score') {
      ops.push({ kind: 'setscore', matchId: cur.id, score_a: p.draft.a, score_b: p.draft.b });
    } else if (p.kind === 'start') {
      ops.push({ kind: 'start', matchId: cur.id, started_at: p.startedAt });
    } else if (p.kind === 'end') {
      if (p.score && (p.score.a !== liveScore.a || p.score.b !== liveScore.b)) {
        // Correction + end in one action (e.g. pens-redo after a score change on
        // a done KO tie): the setscore must carry the pens too, or the server
        // rightly refuses to store a tied KO score without a shoot-out winner.
        const op = { kind: 'setscore', matchId: cur.id, score_a: p.score.a, score_b: p.score.b };
        if (p.body && Number.isInteger(p.body.pens_a) && Number.isInteger(p.body.pens_b)) { op.pens_a = p.body.pens_a; op.pens_b = p.body.pens_b; }
        ops.push(op);
      }
      ops.push({ kind: 'end', matchId: cur.id, body: p.body || {} });
    }

    // Offline OR older ops still queued → queue these too. Appending keeps the
    // strict send order; direct-sending around a non-empty queue would let a
    // STALE queued absolute setscore replay later over this newer state.
    if (!navigator.onLine || loadQueue().length) {
      ops.forEach(enqueue);
      if (current === cur) applyOptimistic(p);
      queuedNotice(p);
      flushQueue();   // no-op offline; drains immediately (in order) when online
      return;
    }

    // Online → send in order; a mid-flight connection loss queues the remainder.
    try {
      for (let i = 0; i < ops.length; i++) {
        let res;
        try {
          res = await sendOp(ops[i]);
        } catch (netErr) {
          if (netErr && netErr.auth) {
            // Session expired mid-commit — NOT offline. Still QUEUE the not-yet-sent
            // ops so they replay after re-login (a partial setscore→end must finalize,
            // otherwise the match is left scored-but-not-ended and progression stalls).
            // But don't claim "opgeslagen — wordt verstuurd" the way the offline path
            // does: logout() already moved us to the login screen, so be explicit.
            ops.slice(i).forEach(enqueue);
            if (window.JVONet) window.JVONet.flash('Sessie verlopen — log opnieuw in; je laatste actie wordt daarna verstuurd', 'warn');
            return;
          }
          ops.slice(i).forEach(enqueue);
          if (current === cur) applyOptimistic(p);
          queuedNotice(p);
          return;
        }
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          // Correcting a done knock-out score back to a tie: the server needs a
          // penalty result to keep the bracket decided. Open the shoot-out panel
          // right away so the crew can finish the correction in one flow.
          if (json.need_pens && p.kind === 'score' && current === cur) {
            if (window.JVONet) window.JVONet.flash("Gelijkspel in de knock-out — vul ook de penalty's in om de correctie af te ronden.", 'warn');
            openPens(p.draft);
            return;
          }
          // Non-blocking error surface (the project moved away from native
          // popups) + re-sync to the real server state.
          if (window.JVONet) window.JVONet.flash(json.error || 'Kon de wijziging niet opslaan — probeer opnieuw.', 'warn');
          if (current === cur) await openControl(cur.id);
          return;
        }
      }
      // All ops landed — adopt the new state (only if we're still on this match).
      if (current !== cur) return;
      if (p.kind === 'score') {
        liveScore = { ...p.draft };
        current.score_a = liveScore.a; current.score_b = liveScore.b;
        renderPending(); setBoardScore(liveScore);
      } else if (p.kind === 'start') {
        await openControl(cur.id);
      } else if (p.kind === 'end') {
        enterList();
      }
    } catch (e) {
      // Unexpected error — re-sync so nothing is left half-applied.
      if (current === cur) { try { await openControl(cur.id); } catch {} }
    }
  }

  function cancelPending() {
    const wasScore = pending && pending.kind === 'score';
    clearBuffer();
    pending = null;
    if (wasScore) setBoardScore(liveScore);
    renderPending();
  }

  function updateTimer() {
    const t = $('wd-timer'), lbl = $('wd-timer-lbl');
    if (!t || !current) return;
    if (current.status !== 'live' || !current.started_at) {
      t.textContent = current.status === 'done' ? 'KLAAR' : '--:--';
      t.classList.remove('extra'); if (lbl) lbl.textContent = current.status === 'done' ? 'afgelopen' : 'nog niet gestart';
      return;
    }
    const ms = Math.max(0, serverNow() - parseTs(current.started_at));
    const mm = String(Math.floor(ms / 60000)).padStart(2, '0');
    const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    t.textContent = `${mm}:${ss}`;
    const extra = ms >= ((DATA.schedule && DATA.schedule.match_min) || DATA.match_minutes || 10) * 60000;
    t.classList.toggle('extra', extra);
    if (lbl) lbl.textContent = extra ? 'extra tijd' : 'speeltijd';
  }

  function stopTimers() { clearInterval(gameTick); clearInterval(listTick); clearInterval(listClockTick); gameTick = listTick = listClockTick = null; }

  // If the crew left the tab and a buffer expired while it was frozen, commit
  // the instant they return (background setInterval may have been paused).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pending && bufferDeadline) paintBuffer();
  });

  // ---------- context-aware help + "add to home screen" ----------
  // One floating info button + an inline trigger open a bottom sheet whose
  // content depends on the screen the crew is looking at right now.
  const HICON = {
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none"/></svg>',
    install: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7.5v6.5m0 0l-2.6-2.6M12 14l2.6-2.6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="8 7 12 3 16 7"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  };

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function currentView() {
    if (!$('wd-login').classList.contains('wd-hidden')) return 'login';
    if (!$('wd-control').classList.contains('wd-hidden')) return 'control';
    return 'list';
  }

  // Voorbeeld "gepland → verwacht" voor de uitleg: de eerste aftrap uit het échte
  // schema (+8 min), zodat het voorbeeld bij dit toernooi past. Nog geen tijden
  // bekend → dezelfde uitleg zonder voorbeeldtijd.
  function delayExampleHtml() {
    const first = flatMatches().find(m => /^\d{2}:\d{2}$/.test(m.time || ''));
    if (!first) return 'Staan er <b>twee tijden met een pijl</b> (→)?';
    const [h, mi] = first.time.split(':').map(Number);
    const tot = (h * 60 + mi + 8) % 1440;
    const later = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
    return `Staat er <b>${esc(first.time)} → ${esc(later)}</b>?`;
  }

  // Help copy for the screen that's currently visible.
  function helpContent() {
    const v = currentView();
    if (v === 'login') return {
      title: 'Welkom bij de bediening', sub: 'Inloggen',
      body: `<p class="lead">Hiermee bedien je de wedstrijden vanaf de zijlijn: <b>starten</b>, de <b>stand</b> bijhouden en <b>beëindigen</b>.</p>
        <ul>
          <li>Vul je <b>naam</b> in en de <b class="hl">crew-code</b> die je van de organisatie krijgt <i>(niet de admincode)</i>.</li>
          <li>Tik op <b>Inloggen →</b>. Daarna verschijnt het wedstrijdschema.</li>
          <li>Je blijft op deze telefoon ingelogd — handig voor de hele dag.</li>
        </ul>`,
    };
    if (v === 'control') {
      const m = current || {};
      const pensOpen = $('wd-pens') && $('wd-pens').classList.contains('show');
      if (pensOpen) return {
        title: "Penalty's nemen", sub: 'Knock-out · gelijkspel',
        body: `<p class="lead">Het staat gelijk in de knock-out — er moet een winnaar uit komen.</p>
          <ul>
            <li>Tik <b>+</b> / <b>−</b> voor het aantal <b class="hl">benutte penalty's</b> per team.</li>
            <li>De stand mag <b>niet gelijk</b> zijn, anders is er geen winnaar.</li>
            <li>Tik <b class="hl">Penalty's vastleggen →</b>. Daarna heb je nog <b>8 seconden</b> bedenktijd.</li>
          </ul>`,
      };
      if (m.status === 'live') return {
        title: 'Stand bijhouden', sub: 'Wedstrijd loopt',
        body: `<p class="lead">De wedstrijd is bezig. De <b>timer</b> in het midden telt de speeltijd en wordt <b style="color:var(--danger)">rood</b> bij extra tijd.</p>
          <ul>
            <li><b class="hl">+1</b> bij een doelpunt. <b>− goal weghalen</b> om te corrigeren.</li>
            <li>Elke wijziging heeft <b class="hl">8 seconden bedenktijd</b>: <b>Ongedaan maken</b> of <b>Nu vastzetten</b>.</li>
            <li>Klaar? Tik <b class="hl">Wedstrijd beëindigen</b>. Gelijkspel in de knock-out? Dan volgen de penalty's.</li>
            <li><b>Houd één telefoon per wedstrijd aan</b> — anders overschrijven twee toestellen elkaars stand.</li>
          </ul>
          <p>Geen internet? Je acties worden lokaal bewaard en automatisch verstuurd zodra er weer verbinding is.</p>`,
      };
      if (m.status === 'done') return {
        title: 'Wedstrijd afgelopen', sub: 'Corrigeren kan nog',
        body: `<p class="lead">Deze wedstrijd is beëindigd en telt mee in de stand.</p>
          <ul>
            <li>Klopt de uitslag niet? Corrigeer met <b class="hl">+1</b> of <b>− goal weghalen</b> — ook met 8 seconden bedenktijd.</li>
            <li>Tik <b>← Terug naar wedstrijden</b> voor het schema.</li>
          </ul>`,
      };
      return {
        title: 'Wedstrijd starten', sub: 'Nog niet begonnen',
        body: `<p class="lead">Deze wedstrijd is nog niet gestart.</p>
          <ul>
            <li>Tik <b class="hl">Wedstrijd starten</b> om de klok te laten lopen.</li>
            <li>Pas <b>ná de start</b> kun je met <b>+1</b> goals toevoegen.</li>
            <li>Na het tikken heb je <b>8 seconden</b> bedenktijd voor het echt begint.</li>
          </ul>`,
      };
    }
    return {
      title: 'Het wedstrijdschema', sub: 'Overzicht',
      body: `<p class="lead">Hier staan alle wedstrijden. Tik er één aan om hem te bedienen.</p>
        <ul>
          <li>Filter bovenaan op status: <b>Alles · Live · Te spelen · Klaar</b>.</li>
          <li>Daaronder kun je op <b class="hl">${plekVorm('jouw')}</b> filteren (${plek()} 1, 2, …) — zo zie je alleen je eigen wedstrijden.</li>
          <li><b class="hl">Nu live</b> bovenaan zijn de wedstrijden die nú bezig zijn — tik om te bedienen.</li>
          <li>Een <b>grijze</b> wedstrijd is vergrendeld: die wacht nog op de winnaar van een eerdere ronde.</li>
          <li>${delayExampleHtml()} Dan loopt het iets uit; de tweede tijd is de verwachte aftrap.</li>
          <li>Geen internet? Wijzigingen worden lokaal bewaard en vanzelf verstuurd zodra er verbinding is.</li>
        </ul>`,
    };
  }

  // Platform-specific "add to home screen" steps.
  function installContent() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    let steps;
    if (isIOS) {
      steps = `
        <div class="wd-step"><div class="wd-step-n">1</div><div class="wd-step-t">Tik rechtsonder in Safari op de <b>3 puntjes</b> <span class="wd-kbd">•••</span> en dan op <b class="hl">Deel</b> <span class="wd-kbd">↑</span> <span class="muted">(of tik direct op de Deel-knop onderin).</span></div></div>
        <div class="wd-step"><div class="wd-step-n">2</div><div class="wd-step-t">Scroll naar beneden en kies <b class="hl">'Zet op beginscherm'</b>.</div></div>
        <div class="wd-step"><div class="wd-step-n">3</div><div class="wd-step-t">Tik <b>Voeg toe</b>. Het JVO-icoon staat nu op je beginscherm.</div></div>`;
    } else if (isAndroid) {
      steps = `
        <div class="wd-step"><div class="wd-step-n">1</div><div class="wd-step-t">Tik rechtsboven in Chrome op het <b>menu</b> <span class="wd-kbd">⋮</span>.</div></div>
        <div class="wd-step"><div class="wd-step-n">2</div><div class="wd-step-t">Kies <b class="hl">'App installeren'</b> of <b>'Toevoegen aan startscherm'</b>.</div></div>
        <div class="wd-step"><div class="wd-step-n">3</div><div class="wd-step-t">Bevestig met <b>Installeren</b>. Het icoon staat nu op je startscherm.</div></div>`;
    } else {
      steps = `
        <div class="wd-step"><div class="wd-step-n">1</div><div class="wd-step-t">Klik op het <b class="hl">installeer-icoon</b> in de adresbalk (een schermpje met pijl), of open het browsermenu.</div></div>
        <div class="wd-step"><div class="wd-step-n">2</div><div class="wd-step-t">Kies <b>'Installeren'</b> / <b>'Toevoegen aan startscherm'</b> en bevestig.</div></div>`;
    }
    return {
      title: 'Zet op je beginscherm', sub: 'Bediening als app', icon: 'install',
      body: `<p class="lead">Zet de bediening als <b>app</b> op je toestel — groot, snel en zonder browserbalk. Ideaal op een drukke wedstrijddag.</p>${steps}`,
    };
  }

  function openSheet({ title, sub, body, icon, footer }) {
    $('wd-sheet-ic').innerHTML = HICON[icon || 'info'];
    $('wd-sheet-title').textContent = title;
    $('wd-sheet-sub').textContent = sub || '';
    $('wd-sheet-body').innerHTML = body;
    $('wd-sheet-foot').innerHTML = footer || '';
    $('wd-sheet').classList.add('show');
  }
  function closeSheet() { $('wd-sheet').classList.remove('show'); }

  function openHelp() {
    const c = helpContent();
    const footer = isStandalone() ? '' : `<button class="wd-sheet-install" id="wd-foot-install" type="button">${HICON.share} Zet deze bediening op je beginscherm</button>`;
    openSheet({ ...c, icon: 'info', footer });
    const fi = $('wd-foot-install');
    if (fi) fi.addEventListener('click', openInstall);
  }
  function openInstall() {
    const c = installContent();
    let footer = '';
    if (deferredPrompt) footer += `<button class="wd-sheet-cta" id="wd-foot-prompt" type="button">Nu installeren →</button>`;
    footer += `<button class="wd-sheet-ghost" id="wd-foot-close" type="button">Sluiten</button>`;
    openSheet({ ...c, footer });
    const p = $('wd-foot-prompt');
    if (p) p.addEventListener('click', async () => {
      try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null; closeSheet();
    });
    const cl = $('wd-foot-close');
    if (cl) cl.addEventListener('click', closeSheet);
  }

  // Capture the install prompt so we can offer a one-tap "Nu installeren" button.
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; try { localStorage.setItem('jvo_crew_install_seen', '1'); } catch {} });

  // Show the "add to home screen" guide once, right after login.
  function maybeShowInstall() {
    if (isStandalone()) return;
    try { if (localStorage.getItem('jvo_crew_install_seen')) return; localStorage.setItem('jvo_crew_install_seen', '1'); } catch {}
    setTimeout(() => { if (currentView() === 'list') openInstall(); }, 800);
  }

  $('wd-help-fab') && $('wd-help-fab').addEventListener('click', openHelp);
  $('wd-help-inline') && $('wd-help-inline').addEventListener('click', openHelp);
  // Staat de balk "Hoe werkt dit?" in beeld, dan is de zwevende i-knop dubbel en ligt hij
  // alleen maar over de wedstrijdregels. De stijl mag hem dan verbergen (klasse op <body>);
  // scrol je de balk uit beeld, dan is de knop er weer.
  if ($('wd-help-inline') && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      document.body.classList.toggle('wd-help-in-beeld', es[es.length - 1].isIntersecting);
    }).observe($('wd-help-inline'));
  }
  $('wd-sheet-x') && $('wd-sheet-x').addEventListener('click', closeSheet);
  $('wd-sheet-bd') && $('wd-sheet-bd').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // ---------- boot ----------
  // Validate any stored token before showing the control UI, so a stale/expired
  // token falls back to the login screen instead of a dead "list" view.
  async function boot() {
    updateQueueUi();                 // reflect any leftover queue from last session
    flushQueue();                    // and try to drain it right away if we're online
    if (!token) { show('login'); return; }
    try {
      const res = await fetch('/api/crew/me', { headers: { 'x-admin-token': token } });
      if (res.status === 401) { logout(); return; }   // invalid/expired → login
      enterList();
      maybeShowInstall();
    } catch {
      enterList();   // network hiccup — let them in; control actions re-auth
      maybeShowInstall();
    }
  }
  boot();
})();
