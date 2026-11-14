// Sport-hub — crew-bediening van de ANDERE sporten (branch sport-hub).
// Het hoofdtoernooi (competitie 1) blijft volledig in wedstrijd.js. Dit script voegt toe:
//   • een sportkeuze bovenaan (bij meer dan één actieve sport, na inloggen);
//   • voor elke andere sport een bedienpaneel: start, +/− of sets, einde, correctie;
//   • een eigen OFFLINE-WACHTRIJ (localStorage 'jvo_hub_queue'). Veilig om opnieuw te
//     versturen: start is idempotent (started_at gaat mee), setscore is absoluut en
//     end geeft already_done. Netwerkfout = in de rij + zichtbare teller; 4xx = uit de
//     rij + melding; 401 = NIET in de rij, token weg en terug naar het loginscherm;
//   • concept-invoer per wedstrijd in sessionStorage ('jvo_hub_draft'), zodat herladen
//     of opnieuw inloggen midden in een set niets wist.
// Zelfde token (jvo_crew_token) en zelfde routes als de crew-pagina; de server
// schakelt per wedstrijd door naar de juiste competitie. Alle namen via esc(),
// alle meldingen via textContent.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
  const bar = $('wd-sport'), chips = $('wd-sport-chips'), hubEl = $('wd-hub'), login = $('wd-login');
  if (!bar || !chips || !hubEl) return;

  const DEFAULT_COMP = 1;             // hoofdtoernooi → wedstrijd.js
  const QUEUE_KEY = 'jvo_hub_queue';  // localStorage: [{u,t,id,comp,body}]
  const DRAFT_KEY = 'jvo_hub_draft';  // sessionStorage: { [wedstrijdId]: {sets|score,pens,dirty} }
  const OPEN_KEY = 'jvo_hub_open';    // sessionStorage: geopende wedstrijd
  const SPORT_KEY = 'jvo_crew_sport'; // sessionStorage: gekozen sport
  const MSG_KEY = 'jvo_hub_msg';      // sessionStorage: melding voor ná het herladen (401)

  let comps = [];
  let sel = null;           // gekozen competitie (null = nog niet bekend)
  let data = null;          // GET /api/tournament?competition=sel (+ lokale wachtrij eroverheen)
  let dataFor = null;       // bij welke competitie `data` hoort
  let openId = null;        // geopende wedstrijd
  let draft = null;         // { score:[a,b], pens:[a,b] } of { sets:[[a,b],…] } tijdens live bediening
  let editing = false;      // correctieformulier open → niet automatisch verversen
  let confirmEnd = 0;       // tijdstip van de eerste tik op "Einde" (tweede tik bevestigt)
  let confirmTimer = null;
  let commitTimer = null;
  let rev = 0;              // telt wijzigingen in de draft (voor "is dit nog dezelfde stand?")
  let chain = Promise.resolve();   // acties strikt na elkaar
  let flushing = false;
  let skew = 0;             // server_now − Date.now()
  let lastLoad = 0;

  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };
  const token = () => { try { return localStorage.getItem('jvo_crew_token'); } catch { return null; } };
  const loggedIn = () => !!token() && !!login && login.classList.contains('wd-hidden');
  const comp = () => comps.find(c => c.id === sel) || null;
  const flash = (msg, kind) => { if (window.JVONet && window.JVONet.flash) window.JVONet.flash(msg, kind || 'warn'); };

  // ── Vaste opbouw: statusregel (wachtrij + melding) boven het paneel ─────────
  // De statusregel staat BUITEN #wd-hub, zodat hij ook zichtbaar is in de lijst,
  // op het hoofdtoernooi en op het loginscherm. Bestaande klassen, geen nieuwe CSS.
  const statusEl = document.createElement('div');
  statusEl.id = 'wh-status';
  const queueEl = document.createElement('div');
  queueEl.className = 'wh-paused'; queueEl.id = 'wh-queue'; queueEl.hidden = true;
  queueEl.setAttribute('role', 'status'); queueEl.setAttribute('aria-live', 'polite');
  const msgEl = document.createElement('div');
  msgEl.className = 'wh-alert'; msgEl.id = 'wh-msg'; msgEl.hidden = true;
  msgEl.setAttribute('role', 'alert');
  statusEl.append(queueEl, msgEl);
  hubEl.parentNode.insertBefore(statusEl, hubEl);
  const bodyEl = document.createElement('div');
  bodyEl.id = 'wh-body';
  hubEl.textContent = '';
  hubEl.appendChild(bodyEl);

  let msgTimer = null;
  // In de bediening staat de melding bij de knoppen (#wh-alert); in de lijst, op het
  // hoofdtoernooi en op het loginscherm in de statusregel erboven. Nooit dubbel.
  function syncMsg() {
    const text = msgEl.textContent;
    const a = hubEl.hidden ? null : $('wh-alert');
    if (a) a.textContent = text;
    msgEl.hidden = !text || !!a;
  }
  function setMsg(text, sticky) {
    clearTimeout(msgTimer);
    msgEl.textContent = text || '';
    syncMsg();
    if (text && !sticky) msgTimer = setTimeout(() => setMsg(''), 12000);
  }

  // ── Tijd ───────────────────────────────────────────────────────────────────
  const tsMs = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + 'Z') : null);
  // sqlite datetime('now') in UTC — zo klopt een offline gestarte wedstrijd met wat
  // de server later opslaat (de server honoreert started_at).
  function nowStr() {
    const t = new Date(Date.now() + skew);
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
  }

  // ── Wachtrij ───────────────────────────────────────────────────────────────
  function loadQueue() { try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; } }
  function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} renderQueue(); }
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  function enqueue(op) {
    const q = loadQueue();
    const last = q[q.length - 1];
    // Standen zijn absoluut: een nieuwere stand van dezelfde wedstrijd vervangt de
    // vorige achteraan in de rij (nieuw kenmerk, zodat een lopende verzending van
    // de oude de nieuwe niet meeneemt bij het afvinken).
    if (op.t === 'setscore' && last && last.t === 'setscore' && last.id === op.id) q.pop();
    q.push({ ...op, u: uid() });
    saveQueue(q);
  }
  function renderQueue() {
    const n = loadQueue().length;
    queueEl.hidden = !n;
    if (!n) { queueEl.textContent = ''; return; }
    const what = `${n} ${n === 1 ? 'actie wacht' : 'acties wachten'}`;
    queueEl.textContent = !token()
      ? `${what} — log in om ${n === 1 ? 'hem' : 'ze'} te versturen.`
      : `${what} op verbinding. Je kunt gewoon doorwerken: alles wordt vanzelf verstuurd zodra er weer bereik is.`;
  }
  const queuedIds = () => new Set(loadQueue().map(o => o.id));

  // Eén verzoek, met harde tijdslimiet (een wifi die "aan" staat maar niets doorlaat
  // moet snel in de wachtrij vallen in plaats van te blijven hangen).
  async function send(op) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    let r;
    try {
      r = await fetch(`/api/admin/tournament/match/${encodeURIComponent(op.id)}/${op.t}`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-admin-token': token() || '' },
        body: JSON.stringify(op.body || {}),
      });
    } catch { return { kind: 'net' }; }
    finally { clearTimeout(timer); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { kind: 'auth' };
    if (r.ok) return { kind: 'ok', json: j };
    if (r.status === 423) return { kind: 'paused', error: j.error || 'Deze sport is gepauzeerd.' };
    // Storing aan de serverkant of even te druk: geen oordeel over de actie → later opnieuw.
    if (r.status >= 500 || r.status === 429 || r.status === 408) return { kind: 'net', server: true, error: j.error || `Serverfout (${r.status}).` };
    return { kind: 'reject', error: j.error || 'Er ging iets mis.' };
  }

  // 401: sessie verlopen. Niets in de rij zetten; token weg en herladen, dan toont
  // wedstrijd.js het loginscherm. Draft en wachtrij staan in de opslag en blijven.
  function toLogin() {
    persistDraft();
    try { localStorage.removeItem('jvo_crew_token'); } catch {}
    ss.set(MSG_KEY, 'Je sessie is verlopen. Log opnieuw in — je invoer is bewaard.');
    location.reload();
  }

  // Voert acties uit, in volgorde. Geeft 'ok' | 'queued' | 'auth' | 'reject'.
  function act(ops) {
    const job = async () => {
      // Offline, of er staat al iets in de rij → achteraan aansluiten. Direct
      // versturen langs een niet-lege rij zou een OUDE stand later over deze heen zetten.
      if (!navigator.onLine || loadQueue().length) {
        ops.forEach(enqueue); ops.forEach(applyLocal);
        flush();
        return 'queued';
      }
      for (let i = 0; i < ops.length; i++) {
        const r = await send(ops[i]);
        if (r.kind === 'ok') { if (r.json && r.json.poules && ops[i].comp === sel) setData(r.json, ops[i].comp); continue; }
        if (r.kind === 'net') {
          ops.slice(i).forEach(enqueue); ops.slice(i).forEach(applyLocal);
          flash('Geen verbinding — je actie is bewaard en wordt vanzelf verstuurd', 'warn');
          return 'queued';
        }
        if (r.kind === 'auth') { toLogin(); return 'auth'; }
        setMsg(r.error);
        return 'reject';
      }
      setMsg('');
      return 'ok';
    };
    const p = chain.then(job, job);
    chain = p.catch(() => {});
    return p;
  }

  async function flush() {
    if (flushing || !token() || !navigator.onLine) return;
    if (!loadQueue().length) return;
    flushing = true;
    let sent = 0, stopped = false;
    try {
      for (;;) {
        const op = loadQueue()[0];
        if (!op) break;
        const r = await send(op);
        if (r.kind === 'net') {
          // Geen bereik: laten staan. Een server die deze ene actie blijft weigeren met
          // een storing mag de rest niet eeuwig tegenhouden: na 5 pogingen overslaan.
          const q = loadQueue();
          const i = q.findIndex(x => x.u === op.u);
          if (!r.server || i < 0) { stopped = true; break; }
          q[i].tries = (q[i].tries || 0) + 1;
          if (q[i].tries < 5) { saveQueue(q); stopped = true; break; }
          r.kind = 'reject';
        }
        if (r.kind === 'auth') { flushing = false; toLogin(); return; }
        if (r.kind === 'paused') {
          // Pauze is tijdelijk: laten staan en later opnieuw proberen.
          setMsg(`${r.error} Je acties blijven klaarstaan en gaan na het hervatten door.`);
          stopped = true; break;
        }
        // Verstuurd of afgewezen: uit de rij (op kenmerk — de rij kan intussen zijn aangevuld).
        const q = loadQueue();
        const i = q.findIndex(x => x.u === op.u);
        if (i >= 0) { q.splice(i, 1); saveQueue(q); }
        if (r.kind === 'ok') { sent++; if (r.json && r.json.poules && op.comp === sel) setData(r.json, op.comp); }
        else {
          const what = op.t === 'setscore' ? 'Een stand' : (op.t === 'start' ? 'Een start' : 'Een einde');
          setMsg(`${what} uit de wachtrij is door de server afgewezen en overgeslagen: ${r.error}`, true);
        }
      }
    } finally { flushing = false; }
    renderQueue();
    if (!stopped && sent && !loadQueue().length) flash('Alles is verstuurd', 'ok');
    if (canRender()) render();
    if (sent) load();
  }

  // ── Lokale stand (optimistisch) ────────────────────────────────────────────
  function ref(d, id) {
    if (!d) return null;
    for (const p of Object.keys(d.poules || {})) { const m = d.poules[p].matches.find(x => x.id === id); if (m) return m; }
    return (d.knockout || []).find(x => x.id === id) || null;
  }
  const setsWon = (sets) => { let a = 0, b = 0; for (const s of sets) { if (s[0] > s[1]) a++; else if (s[1] > s[0]) b++; } return [a, b]; };
  function applyTo(d, op) {
    const m = ref(d, op.id);
    if (!m) return;
    const b = op.body || {};
    if (op.t === 'start') {
      if (m.status === 'done') return;
      if (m.status !== 'live') { m.status = 'live'; m.started_at = b.started_at || m.started_at || nowStr(); }
      if (m.score_a == null) { m.score_a = 0; m.score_b = 0; }
      if (d.competition && d.competition.result_model === 'sets' && !(Array.isArray(m.sets) && m.sets.length)) m.sets = [[0, 0]];
    } else if (op.t === 'setscore' || op.t === 'end') {
      if (Array.isArray(b.sets)) {
        m.sets = b.sets.map(s => [s[0], s[1]]);
        const done = op.t === 'end' || m.status === 'done';
        const w = setsWon(done ? m.sets : m.sets.slice(0, -1));
        m.score_a = w[0]; m.score_b = w[1];
      } else if (Number.isInteger(b.score_a) && Number.isInteger(b.score_b)) { m.score_a = b.score_a; m.score_b = b.score_b; }
      if (Number.isInteger(b.pens_a) && Number.isInteger(b.pens_b)) { m.pens_a = b.pens_a; m.pens_b = b.pens_b; }
      if (op.t === 'end' && m.status !== 'scheduled') m.status = 'done';
    }
  }
  function applyLocal(op) { if (data && op.comp === dataFor) applyTo(data, op); }
  function setData(j, forComp) {
    for (const op of loadQueue()) if (op.comp === forComp) applyTo(j, op);
    data = j; dataFor = forComp;
    if (j.server_now) skew = j.server_now - Date.now();
  }

  // ── Draft (concept-invoer) ─────────────────────────────────────────────────
  function drafts() { try { const o = JSON.parse(ss.get(DRAFT_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
  function persistDraft() {
    if (openId == null) return;
    const o = drafts();
    if (draft) o[openId] = draft; else delete o[openId];
    ss.set(DRAFT_KEY, JSON.stringify(o));
  }
  function dropDraft(id) { const o = drafts(); if (o[id]) { delete o[id]; ss.set(DRAFT_KEY, JSON.stringify(o)); } }
  function storedDraft(id, sets) {
    const d = drafts()[id];
    if (!d) return null;
    const pair = (x) => Array.isArray(x) && x.length === 2 && x.every(n => Number.isInteger(n) && n >= 0 && n <= 99);
    if (sets) return Array.isArray(d.sets) && d.sets.length && d.sets.every(pair) ? { sets: d.sets, dirty: !!d.dirty } : null;
    if (!pair(d.score)) return null;
    return { score: d.score, pens: Array.isArray(d.pens) ? [d.pens[0] ?? '', d.pens[1] ?? ''] : ['', ''], dirty: !!d.dirty };
  }
  function touch() { rev++; if (draft) draft.dirty = true; persistDraft(); }
  function setOpen(id) {
    openId = id; draft = null; editing = false; confirmEnd = 0;
    if (id == null) ss.del(OPEN_KEY); else ss.set(OPEN_KEY, String(id));
  }

  // ── Sportkeuze ─────────────────────────────────────────────────────────────
  function renderChips() {
    chips.innerHTML = comps.map(c => `<button type="button" class="wh-chip" role="tab" data-id="${esc(c.id)}"
      aria-selected="${c.id === sel ? 'true' : 'false'}">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}${esc(c.name)}</button>`).join('');
  }
  const hubMode = () => loggedIn() && sel != null && sel !== DEFAULT_COMP && comps.some(c => c.id === sel);
  function applyMode() {
    bar.hidden = !(loggedIn() && comps.length > 1);
    const on = hubMode();
    document.body.classList.toggle('hub-mode', on);
    hubEl.hidden = !on;
    syncMsg();
    if (on) connect(); else disconnect();
    renderQueue();
  }
  chips.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    if (commitTimer) await commit();
    sel = Number(b.dataset.id);
    ss.set(SPORT_KEY, String(sel));
    setOpen(null); data = null; dataFor = null; setMsg('');
    renderChips(); applyMode();
    if (hubMode()) { render(); load(true); }
  });

  // ── Lijst ──────────────────────────────────────────────────────────────────
  const flat = () => {
    if (!data) return [];
    const out = [];
    for (const p of Object.keys(data.poules || {})) for (const m of data.poules[p].matches) out.push({ ...m, ready: true });
    for (const k of (data.knockout || [])) out.push({ ...k, a: k.a ? (k.a.name || k.a.placeholder) : null, b: k.b ? (k.b.name || k.b.placeholder) : null, ready: !!(k.a && k.a.id && k.b && k.b.id) });
    return out;
  };
  const scoreText = (m) => {
    if (m.score_a == null) return '';
    const s = `${m.score_a}–${m.score_b}`;
    return m.pens_a != null && m.pens_b != null ? `${s} (${m.pens_a}–${m.pens_b} n.p.)` : s;
  };
  const place = (m) => (m.field ? `${data.schedule.place_noun} ${m.field}` : '');
  const row = (m, waiting) => `<button type="button" class="wh-m${m.status === 'live' ? ' live' : ''}" data-open="${esc(m.id)}">
      <span class="tm">${esc(m.status === 'live' ? 'Live' : (m.expected || ''))}</span>
      <span class="tt">${esc(m.a || '?')} – ${esc(m.b || '?')}<small>${esc([m.where, place(m), waiting.has(m.id) ? 'wacht op verbinding' : ''].filter(Boolean).join(' · '))}</small></span>
      <span class="sc">${esc(scoreText(m))}</span></button>`;

  function renderList() {
    const c = comp();
    if (!c || !data || dataFor !== sel) {
      bodyEl.innerHTML = `<p class="wh-note">${navigator.onLine ? 'Laden…' : 'Geen verbinding — het schema verschijnt zodra er weer bereik is.'}</p>`;
      syncMsg(); return;
    }
    const all = flat();
    const q = queuedIds();
    const r = (m) => row(m, q);
    const live = all.filter(m => m.status === 'live');
    const next = all.filter(m => m.status === 'scheduled' && m.ready).sort((a, b) => String(a.expected).localeCompare(String(b.expected)));
    const waiting = all.filter(m => m.status === 'scheduled' && !m.ready).length;
    const done = all.filter(m => m.status === 'done');
    let h = `<div class="wh-head">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}<div><b>${esc(c.name)}</b>
      <span>${esc([c.team_label, data.schedule.fields ? `${data.schedule.fields}× ${String(data.schedule.place_noun || '').toLowerCase()}` : '', c.result_model === 'sets' ? `best of ${c.best_of}` : ''].filter(Boolean).join(' · '))}</span></div></div>`;
    if (data.paused) h += '<div class="wh-paused">Deze sport is even gepauzeerd: lopende wedstrijden mogen uitspelen, nieuwe niet starten.</div>';
    if (!data.configured) { bodyEl.innerHTML = h + '<p class="wh-note">Er is nog geen schema voor deze sport. De organisatie maakt dat in de admin.</p>'; syncMsg(); return; }
    h += `<div class="wh-sec">Nu bezig</div>` + (live.length ? live.map(r).join('') : '<p class="wh-note">Niets live.</p>');
    h += `<div class="wh-sec">Volgende</div>` + (next.length ? next.slice(0, 10).map(r).join('') : '<p class="wh-note">Geen wedstrijden klaar om te starten.</p>');
    if (waiting) h += `<p class="wh-note">${esc(waiting)} ${waiting === 1 ? 'wedstrijd wacht' : 'wedstrijden wachten'} op de vorige ronde.</p>`;
    if (done.length) h += `<details><summary class="wh-sec" style="cursor:pointer">Klaar (${esc(done.length)})</summary>${done.map(r).join('')}</details>`;
    if (Array.isArray(data.final_standing) && data.final_standing.length) {
      h += `<div class="wh-sec">Eindstand</div><p class="wh-note">${data.final_standing.slice(0, 3).map(t => `${esc(t.pos)}. ${esc(t.name)}`).join(' · ')}</p>`;
    }
    // Het uitklapblok "Klaar" blijft open bij verversen.
    const wasOpen = !!bodyEl.querySelector('details[open]');
    bodyEl.innerHTML = h;
    if (wasOpen) { const d = bodyEl.querySelector('details'); if (d) d.open = true; }
    syncMsg();
  }

  // ── Bediening van één wedstrijd ────────────────────────────────────────────
  const current = () => flat().find(m => m.id === openId) || null;
  const needSets = (c) => Math.floor((c.best_of || 3) / 2) + 1;

  function renderControl() {
    const m = current();
    const c = comp();
    if (!m || !c) { setOpen(null); renderList(); return; }
    const v = data.vocab || {};
    const sets = c.result_model === 'sets';
    const endLabel = confirmEnd ? 'Zeker weten? Tik nog een keer' : (v.end || 'Einde wedstrijd');
    let ctx = [c.name, m.where, place(m), m.status === 'scheduled' ? (m.expected || '') : ''];
    if (m.status === 'live' && !sets) {
      const st = tsMs(m.started_at);
      if (st) ctx.push(`${Math.max(0, Math.floor((Date.now() + skew - st) / 60000))}′${data.match_minutes ? ` van ${data.match_minutes} min` : ''}`);
    }
    const head = `<button type="button" class="wh-back" data-back>← Alle wedstrijden</button>
      <div class="wh-card"><div class="wh-ctx">${esc(ctx.filter(Boolean).join(' · '))}</div>`;
    let body = '';
    if (m.status !== 'live' && draft) { draft = null; dropDraft(m.id); }
    if (m.status === 'scheduled') {
      body += `<div class="wh-team"><span class="nm">${esc(m.a || '?')}</span></div><div class="wh-team"><span class="nm">${esc(m.b || '?')}</span></div>`;
      body += `<div class="wh-actions">${!m.ready ? '<p class="wh-note">Wacht op de vorige ronde.</p>'
        : (data.paused ? '<p class="wh-note">Deze sport is even gepauzeerd. Starten kan weer zodra de organisatie hervat.</p>'
          : `<button type="button" class="btn full" data-act="start">${esc(v.start || 'Start')} →</button>`)}</div>`;
    } else if (m.status === 'live' && !editing) {
      if (!draft) {
        draft = storedDraft(m.id, sets)
          || (sets ? { sets: (Array.isArray(m.sets) && m.sets.length ? m.sets : [[0, 0]]).map(s => [s[0], s[1]]) } : { score: [m.score_a || 0, m.score_b || 0], pens: ['', ''] });
        // Een bewaarde stand die nog niet bij de server was (herladen of opnieuw
        // ingelogd midden in het tikken) gaat alsnog weg.
        if (draft.dirty) scheduleCommit();
      }
      if (sets) {
        const cur = draft.sets[draft.sets.length - 1];
        const prev = draft.sets.slice(0, -1);
        // Beslist zodra één kant genoeg sets heeft (de lopende set telt mee met wie
        // nu voorstaat): dan geen "volgende set" meer — de server weigert die toch.
        const w = setsWon(draft.sets);
        const decided = w[0] >= needSets(c) || w[1] >= needSets(c);
        body += `<div class="wh-sets">${prev.length ? `Gespeeld: ${esc(prev.map(s => `${s[0]}–${s[1]}`).join(' · '))}` : 'Eerste set'}</div>
          <div class="wh-ctx" style="margin-top:12px">Set ${esc(draft.sets.length)}</div>
          <div class="wh-team"><span class="nm">${esc(m.a)}</span><span class="wh-step"><button type="button" data-step="0,-1" aria-label="Punt eraf voor ${esc(m.a)}">−</button><b>${esc(cur[0])}</b><button type="button" data-step="0,1" aria-label="Punt erbij voor ${esc(m.a)}">+</button></span></div>
          <div class="wh-team"><span class="nm">${esc(m.b)}</span><span class="wh-step"><button type="button" data-step="1,-1" aria-label="Punt eraf voor ${esc(m.b)}">−</button><b>${esc(cur[1])}</b><button type="button" data-step="1,1" aria-label="Punt erbij voor ${esc(m.b)}">+</button></span></div>
          <div class="wh-actions">
            ${draft.sets.length < c.best_of && !decided ? '<button type="button" class="btn ghost full" data-act="nextset">Set klaar → volgende set</button>' : ''}
            <button type="button" class="btn full" data-act="end">${esc(endLabel)}</button>
          </div>`;
      } else {
        const sc = draft.score;
        const tie = m.phase !== 'group' && sc[0] === sc[1];
        const pens = draft.pens || ['', ''];
        body += `<div class="wh-team"><span class="nm">${esc(m.a)}</span><span class="wh-step"><button type="button" data-step="0,-1" aria-label="Eraf voor ${esc(m.a)}">−</button><b>${esc(sc[0])}</b><button type="button" data-step="0,1" aria-label="Erbij voor ${esc(m.a)}">+</button></span></div>
          <div class="wh-team"><span class="nm">${esc(m.b)}</span><span class="wh-step"><button type="button" data-step="1,-1" aria-label="Eraf voor ${esc(m.b)}">−</button><b>${esc(sc[1])}</b><button type="button" data-step="1,1" aria-label="Erbij voor ${esc(m.b)}">+</button></span></div>
          ${tie ? `<div class="wh-pens"><label>Gelijk in de knock-out — ${esc((v.tiebreak || 'beslissing').toLowerCase())}:</label>
            <input type="number" id="wh-pa" data-pen="0" min="0" max="99" inputmode="numeric" value="${esc(pens[0])}" aria-label="${esc(v.tiebreak || 'Beslissing')} ${esc(m.a)}" />
            <input type="number" id="wh-pb" data-pen="1" min="0" max="99" inputmode="numeric" value="${esc(pens[1])}" aria-label="${esc(v.tiebreak || 'Beslissing')} ${esc(m.b)}" /></div>` : ''}
          <div class="wh-actions"><button type="button" class="btn full" data-act="end">${esc(endLabel)}</button></div>`;
      }
    } else {
      // Klaar: uitslag tonen, of het correctieformulier.
      if (!editing) {
        body += `<div class="wh-team"><span class="nm">${esc(m.a)}</span><b>${esc(m.score_a ?? '')}</b></div><div class="wh-team"><span class="nm">${esc(m.b)}</span><b>${esc(m.score_b ?? '')}</b></div>`;
        if (Array.isArray(m.sets) && m.sets.length) body += `<div class="wh-sets">${esc(m.sets.map(s => `${s[0]}–${s[1]}`).join(' · '))}</div>`;
        else if (m.pens_a != null) body += `<div class="wh-sets">n.p. ${esc(m.pens_a)}–${esc(m.pens_b)}</div>`;
        body += `<div class="wh-actions"><button type="button" class="btn ghost full" data-act="edit">Uitslag corrigeren</button></div>`;
      } else if (sets) {
        const rows = (Array.isArray(m.sets) && m.sets.length ? m.sets : [[0, 0]]).concat([]);
        while (rows.length < c.best_of) rows.push(['', '']);
        body += `<div class="wh-setrow"><span></span><label>${esc(m.a)}</label><label>${esc(m.b)}</label></div>` + rows.map((s, i) => `
          <div class="wh-setrow"><label for="wh-s${i}a">Set ${i + 1}</label>
            <input type="number" id="wh-s${i}a" min="0" max="99" inputmode="numeric" value="${esc(s[0])}" />
            <input type="number" id="wh-s${i}b" min="0" max="99" inputmode="numeric" value="${esc(s[1])}" aria-label="Set ${i + 1} ${esc(m.b)}" /></div>`).join('');
        body += `<div class="wh-actions"><button type="button" class="btn full" data-act="save">Opslaan</button><button type="button" class="btn ghost full" data-act="cancel">Annuleren</button></div>`;
      } else {
        body += `<div class="wh-pens"><label>Uitslag</label>
          <input type="number" id="wh-ca" min="0" max="99" inputmode="numeric" value="${esc(m.score_a ?? 0)}" aria-label="${esc(m.a)}" />
          <input type="number" id="wh-cb" min="0" max="99" inputmode="numeric" value="${esc(m.score_b ?? 0)}" aria-label="${esc(m.b)}" /></div>`;
        if (m.phase !== 'group') body += `<div class="wh-pens"><label>Bij gelijke stand: ${esc((v.tiebreak || 'beslissing').toLowerCase())}</label>
          <input type="number" id="wh-pa" min="0" max="99" inputmode="numeric" value="${esc(m.pens_a ?? '')}" aria-label="${esc(v.tiebreak)} ${esc(m.a)}" />
          <input type="number" id="wh-pb" min="0" max="99" inputmode="numeric" value="${esc(m.pens_b ?? '')}" aria-label="${esc(v.tiebreak)} ${esc(m.b)}" /></div>`;
        body += `<div class="wh-actions"><button type="button" class="btn full" data-act="save">Opslaan</button><button type="button" class="btn ghost full" data-act="cancel">Annuleren</button></div>`;
      }
    }
    const wait = queuedIds().has(m.id) ? '<p class="wh-note">Wacht op verbinding — wordt vanzelf verstuurd.</p>' : '';
    bodyEl.innerHTML = head + body + wait + '<div class="wh-alert" id="wh-alert"></div></div>';
    syncMsg();
  }

  function render() {
    if (!hubMode()) return;
    if (openId != null && data && dataFor === sel) renderControl(); else renderList();
  }
  // Niet onder de vingers verversen: tijdens corrigeren, tijdens het tikken (de stand
  // is nog onderweg) en zolang de cursor in een invoerveld staat.
  const inputFocused = () => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && bodyEl.contains(a); };
  const canRender = () => !editing && !commitTimer && !inputFocused();

  // Live-stand vastleggen (absoluut, na een korte pauze in het tikken).
  function scheduleCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, 700);
  }
  async function commit() {
    clearTimeout(commitTimer); commitTimer = null;
    if (!draft || openId == null || !draft.dirty) return 'ok';
    const d = draft, at = rev;
    const body = d.sets ? { sets: d.sets.map(s => [s[0], s[1]]) } : { score_a: d.score[0], score_b: d.score[1] };
    const res = await act([{ t: 'setscore', id: openId, comp: sel, body }]);
    // Verstuurd of veilig in de rij → niet meer "vuil" (tenzij er intussen is doorgetikt).
    // Afgewezen: ook niet opnieuw proberen, de melding staat er. Bij 401 blijft hij
    // vuil, zodat hij na het inloggen alsnog weggaat.
    if (res !== 'auth' && draft === d && rev === at) { d.dirty = false; persistDraft(); }
    return res;
  }

  const num = (id) => { const el = $(id); const n = el ? parseInt(el.value, 10) : NaN; return Number.isInteger(n) ? n : null; };

  // De beslissings-invoer hoort bij de draft: zo overleeft hij verversen en herladen.
  hubEl.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.dataset || t.dataset.pen == null || !draft || !draft.score) return;
    if (!draft.pens) draft.pens = ['', ''];
    const n = parseInt(t.value, 10);
    draft.pens[Number(t.dataset.pen)] = Number.isInteger(n) && n >= 0 && n <= 99 ? n : '';
    persistDraft();   // geen `dirty`: de beslissing gaat pas mee met "Einde"
    if (confirmEnd) { confirmEnd = 0; clearTimeout(confirmTimer); }
  });

  // Controle vóór het afsluiten — dezelfde regels als de server, zodat een einde
  // dat offline in de rij gaat later niet alsnog wordt afgewezen.
  function endBody(m, c) {
    if (c.result_model === 'sets') {
      const sets = draft.sets.map(s => [s[0], s[1]]);
      while (sets.length > 1 && sets[sets.length - 1][0] === 0 && sets[sets.length - 1][1] === 0) sets.pop();
      const tied = sets.findIndex(s => s[0] === s[1]);
      if (tied >= 0) return { error: `Set ${tied + 1} heeft nog geen winnaar.` };
      const w = setsWon(sets);
      if (w[0] === w[1]) return { error: 'Er is nog geen winnaar — speel een beslissende set.' };
      return { body: { sets } };
    }
    const body = {};
    if (m.phase !== 'group' && draft.score[0] === draft.score[1]) {
      const pa = draft.pens ? draft.pens[0] : '', pb = draft.pens ? draft.pens[1] : '';
      if (!Number.isInteger(pa) || !Number.isInteger(pb) || pa === pb) return { error: 'Vul twee verschillende getallen in voor de beslissing.' };
      body.pens_a = pa; body.pens_b = pb;
    }
    return { body };
  }

  hubEl.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.open) { setOpen(Number(t.dataset.open)); setMsg(''); renderControl(); return; }
    if (t.hasAttribute('data-back')) { if (commitTimer) await commit(); setOpen(null); setMsg(''); renderList(); return; }
    if (t.dataset.step && draft) {
      const [side, d] = t.dataset.step.split(',').map(Number);
      const arr = draft.sets ? draft.sets[draft.sets.length - 1] : draft.score;
      arr[side] = Math.max(0, Math.min(99, arr[side] + d));
      confirmEnd = 0; clearTimeout(confirmTimer);
      touch(); renderControl(); scheduleCommit();
      return;
    }
    const act_ = t.dataset.act;
    if (!act_) return;
    const m = current(), c = comp();
    if (!m || !c) return;
    const id = openId;
    if (act_ === 'edit') { editing = true; setMsg(''); renderControl(); return; }
    if (act_ === 'cancel') { editing = false; setMsg(''); renderControl(); return; }
    if (act_ === 'nextset') {
      if (!draft || !draft.sets) return;
      const cur = draft.sets[draft.sets.length - 1];
      if (cur[0] === cur[1]) { setMsg('Een set heeft een winnaar nodig voordat de volgende begint.'); return; }
      draft.sets.push([0, 0]);
      touch(); setMsg(''); renderControl();
      await commit();
      if (openId === id && canRender()) renderControl();
      return;
    }
    if (act_ === 'end') {
      if (!draft) return;
      const chk = endBody(m, c);
      if (chk.error) { confirmEnd = 0; setMsg(chk.error); return; }
      // Twee tikken: de eerste vraagt om bevestiging (5 s), de tweede sluit af.
      if (!confirmEnd || Date.now() - confirmEnd > 5000) {
        confirmEnd = Date.now(); setMsg('');
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { confirmEnd = 0; if (openId === id && canRender()) renderControl(); }, 5000);
        renderControl();
        return;
      }
      confirmEnd = 0; clearTimeout(confirmTimer);
      t.disabled = true;
      clearTimeout(commitTimer); commitTimer = null;
      const ops = [];
      // Stand op tijd: eerst de laatste stand (absoluut), dan het einde. Bij sets
      // gaat de hele setlijst met het einde mee.
      if (draft.score && draft.dirty) ops.push({ t: 'setscore', id, comp: sel, body: { score_a: draft.score[0], score_b: draft.score[1] } });
      ops.push({ t: 'end', id, comp: sel, body: chk.body });
      const d = draft;
      const res = await act(ops);
      if (res === 'ok' || res === 'queued') { if (draft === d) draft = null; dropDraft(id); }
      if (openId === id) renderControl();
      return;
    }
    if (act_ === 'start') {
      t.disabled = true;
      await act([{ t: 'start', id, comp: sel, body: { started_at: nowStr() } }]);
      if (openId === id) { draft = null; renderControl(); }
      return;
    }
    if (act_ === 'save') {
      let body;
      if (c.result_model === 'sets') {
        const sets = [];
        for (let i = 0; i < c.best_of; i++) {
          const a = num(`wh-s${i}a`), b = num(`wh-s${i}b`);
          if (a == null && b == null) continue;
          sets.push([a || 0, b || 0]);
        }
        if (!sets.length) { setMsg('Vul minstens één set in.'); return; }
        body = { sets };
      } else {
        const a = num('wh-ca'), b = num('wh-cb');
        if (a == null || b == null || a < 0 || b < 0 || a > 99 || b > 99) { setMsg('Vul twee getallen van 0 tot 99 in.'); return; }
        body = { score_a: a, score_b: b };
        if ($('wh-pa') && num('wh-pa') != null && num('wh-pb') != null) { body.pens_a = num('wh-pa'); body.pens_b = num('wh-pb'); }
        if (m.phase !== 'group' && a === b && (body.pens_a == null || body.pens_a === body.pens_b)) { setMsg('Gelijke stand in de knock-out — vul twee verschillende getallen in voor de beslissing.'); return; }
      }
      t.disabled = true;
      const res = await act([{ t: 'setscore', id, comp: sel, body }]);
      if (res === 'ok' || res === 'queued') editing = false;
      if (openId === id) { if (editing) t.disabled = false; else renderControl(); }
    }
  });

  // ── Laden ──────────────────────────────────────────────────────────────────
  let loading = false, loadAgain = false;
  async function load(force) {
    if (!hubMode()) return;
    if (loading) { loadAgain = true; return; }
    loading = true; lastLoad = Date.now();
    const want = sel;
    try {
      const r = await fetch(`/api/tournament?competition=${encodeURIComponent(want)}`, { cache: 'no-store' });
      // Een oud antwoord uit de offline-cache mag een nieuwere stand niet terugdraaien.
      const stale = r.headers.get('X-JVO-Cache') === 'stale';
      if (r.ok && want === sel && !(stale && data && dataFor === want)) {
        const j = await r.json();
        if (j && !j.offline && j.poules) {
          setData(j, want);
          if (openId == null) {
            // Herladen midden in een wedstrijd: dezelfde wedstrijd weer openen.
            const o = parseInt(ss.get(OPEN_KEY) || '', 10);
            if (Number.isInteger(o) && ref(data, o)) openId = o; else ss.del(OPEN_KEY);
          }
          if (force || canRender()) render();
        }
      }
    } catch { /* offline: laatste stand blijft staan */ }
    loading = false;
    if (loadAgain) { loadAgain = false; signal(); }
  }

  // Seintjes van de server: snel opeenvolgende seintjes worden één verversing, op een
  // willekeurig moment (0–1,5 s later) zodat niet alle toestellen tegelijk ophalen,
  // en nooit vaker dan eens per seconde.
  let sigTimer = null;
  function signal() {
    if (sigTimer || !hubMode()) return;
    const wait = Math.max(250 + Math.random() * 1500, lastLoad + 1000 - Date.now());
    sigTimer = setTimeout(() => { sigTimer = null; load(); }, wait);
  }
  let es = null, sseOk = false, triedLite = false;
  function connect() {
    if (es || typeof EventSource === 'undefined') return;
    const open = (url, lite) => {
      let opened = false;
      try { es = new EventSource(url); } catch { es = null; return; }
      es.addEventListener('open', () => { opened = true; sseOk = true; });
      es.addEventListener('update', signal);
      es.addEventListener('error', () => {
        sseOk = false;
        // De lichte stream bestaat (nog) niet op deze server (de browser geeft het dan
        // op: CLOSED; bij een haperende verbinding blijft hij zelf opnieuw proberen).
        if (lite && !opened && !triedLite && es && es.readyState === 2) { triedLite = true; es = null; open('/api/tournament/stream', false); }
      });
    };
    if (triedLite) open('/api/tournament/stream', false); else open('/api/tournament/stream?lite=1', true);
  }
  function disconnect() { if (es) { try { es.close(); } catch {} es = null; sseOk = false; } }

  async function init() {
    try {
      const r = await fetch('/api/competitions');
      const j = r.ok ? await r.json() : null;
      comps = j && Array.isArray(j.competitions) ? j.competitions : [];
    } catch { comps = []; }
    if (comps.length) {
      // Standaard de eerste ACTIEVE sport (het hoofdtoernooi kan uit staan).
      const stored = parseInt(ss.get(SPORT_KEY) || '', 10);
      if (sel == null || !comps.some(c => c.id === sel)) sel = comps.some(c => c.id === stored) ? stored : comps[0].id;
    } else if (sel == null) sel = DEFAULT_COMP;
    renderChips(); applyMode();
    if (hubMode()) { render(); load(true); }
  }

  // Melding van vóór het herladen (sessie verlopen) op het loginscherm tonen.
  (() => {
    const m = ss.get(MSG_KEY);
    if (!m) return;
    ss.del(MSG_KEY);
    const box = $('wd-login-alert');
    if (box && !token()) { const d = document.createElement('div'); d.className = 'alert error'; d.textContent = m; box.textContent = ''; box.appendChild(d); }
  })();

  // Inloggen/uitloggen in wedstrijd.js wisselt de klasse op #wd-login.
  if (login) new MutationObserver(() => {
    applyMode();
    if (loggedIn()) { flush(); if (!comps.length) init(); else if (hubMode()) { render(); load(true); } }
  }).observe(login, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('online', () => { renderQueue(); flush(); signal(); });
  window.addEventListener('offline', renderQueue);
  window.addEventListener('pagehide', persistDraft);
  // Elke 10 s: wachtrij opnieuw proberen (het 'online'-seintje komt niet als de wifi
  // aan blijft maar niets doorlaat), en verversen als de stream wegviel of stil is.
  setInterval(() => {
    flush();
    if (!comps.length) { init(); return; }
    if (hubMode() && (!sseOk || Date.now() - lastLoad > 45000)) load();
    else if (hubMode() && openId != null && canRender() && !confirmEnd) render();   // live-minuut bijwerken
  }, 10000);
  renderQueue();
  init();
  flush();
})();
