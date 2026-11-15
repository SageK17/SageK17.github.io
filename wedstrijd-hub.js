// Sport-hub — crew-bediening van de ANDERE sporten (branch sport-hub).
// Het hoofdtoernooi (competitie 1) blijft volledig in wedstrijd.js. Dit script voegt toe:
//   • een sportkeuze bovenaan (bij meer dan één actieve sport, na inloggen);
//   • voor elke andere sport een bedienpaneel: start, +/− of sets, einde, correctie;
//   • een eigen OFFLINE-WACHTRIJ (localStorage 'jvo_hub_queue'). Veilig om opnieuw te
//     versturen: start is idempotent (started_at gaat mee), setscore is absoluut en
//     end geeft already_done. Netwerkfout of storing (5xx) = in de rij + zichtbare
//     teller, en blijft daar tot de server hem echt beoordeelt; 4xx = uit de rij +
//     melding; 423 (pauze) = alleen díe wedstrijd wacht, de rest gaat door;
//     401 = NIET in de rij, token weg en terug naar het loginscherm;
//   • concept-invoer per wedstrijd in sessionStorage ('jvo_hub_draft'), zodat herladen
//     of opnieuw inloggen midden in een set niets wist.
//   • MIJN PLEK: na het inloggen kiest de crew één keer sport + plek (localStorage
//     'jvo_crew_post'). Daarna staat alleen "jouw wedstrijd" groot in beeld, met
//     "hierna op jouw veld" eronder; de rest zit achter "Alle wedstrijden".
//   • ÉÉN TOESTEL PER WEDSTRIJD (server: crewpost.js): dit toestel meldt zich aan als
//     bediener (toestel-id in 'jvo_crew_device', header x-crew-device) en stuurt elke
//     20 s een hartslag. Bedient een ander de wedstrijd, dan kijkt dit toestel alleen
//     mee tot je bewust overneemt. 409 taken_over = oordeel van de server: de actie
//     gaat uit de rij en de melding zegt wie er nu bedient.
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
  const POST_KEY = 'jvo_crew_post';   // localStorage: { comp, field } of { free: true } — "mijn plek"
  const DEVICE_KEY = 'jvo_crew_device';   // localStorage: vast kenmerk van dit toestel
  const BEAT_MS = 20000;              // hartslag (de server laat een bediening na 90 s verlopen; een live wedstrijd pas na 10 min)

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
  let busy = 0;             // lopende verzendingen vanuit het paneel (stand/einde)
  let commitSeq = 0;        // telt afgeronde verzendingen vanuit het paneel
  let seq = 0;              // telt actie-antwoorden die als stand zijn neergezet
  let confirmNext = 0;      // eerste tik op "volgende set" bij een set die nog niet uit lijkt
  let nextTimer = null;
  let memQueue = null;      // de rij in het geheugen als de opslag hem weigert (vol)
  let pausedHeld = new Set();   // wedstrijden waarvan de acties wachten tot hun sport hervat wordt
  let flushNote = '';       // laatste melding van de wachtrij (pauze/storing), om hem weer te wissen
  let chain = Promise.resolve();   // acties strikt na elkaar
  let flushing = false;
  let skew = 0;             // server_now − Date.now()
  let lastLoad = 0;
  // Mijn plek + wie bedient wat
  let post = null;          // { comp, field } — de gekozen plek
  let freeMode = false;     // bewust zonder vaste plek (sportstrook + lijst, zoals vroeger)
  let view = 'home';        // 'pick' (plek kiezen) | 'home' | 'list' | 'match'
  let pickComp = null;      // plek kiezen, stap 2: de gekozen sport
  let prevPost = null;      // plek van vóór "Wissel van plek" (voor "terug")
  let switchAsk = false;    // "Wissel van plek" terwijl je een live wedstrijd bedient
  let opers = new Map();    // wedstrijd-id → { name, mine } (actieve bedieners volgens de server)
  let posts = [];           // wie staat op welke plek
  let opsSig = '';
  let claimedId = null;     // de wedstrijd die dit toestel bedient
  let claiming = null;      // wedstrijd waarvoor het aanmelden loopt
  let claimTried = { id: null, at: 0 };
  const optimistic = new Set();   // aanmelden lukte niet (geen bereik) → gewoon doorwerken, de server beslist later
  const lost = new Map();   // wedstrijd-id → naam: van dit toestel overgenomen
  const declined = new Set();     // "nee, alleen meekijken" gekozen
  let beating = false, lastBeat = 0, beatLater = null;

  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };
  const token = () => { try { return localStorage.getItem('jvo_crew_token'); } catch { return null; } };
  const myName = () => { try { return String(localStorage.getItem('jvo_crew_name') || '').trim(); } catch { return ''; } };
  // Vast kenmerk van dit toestel (geen persoonsgegeven): zo herkent de server "de eigen
  // bediener", ook na opnieuw inloggen of als twee mensen dezelfde naam invullen.
  let memDevice = null;
  function device() {
    if (memDevice) return memDevice;
    try { const d = localStorage.getItem(DEVICE_KEY); if (d && /^[A-Za-z0-9_-]{8,64}$/.test(d)) return (memDevice = d); } catch {}
    let d = '';
    try { const a = new Uint8Array(12); crypto.getRandomValues(a); d = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join(''); }
    catch { d = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(12, '0'); }
    memDevice = `d${d}`;
    try { localStorage.setItem(DEVICE_KEY, memDevice); } catch {}
    return memDevice;
  }
  function loadPost() {
    try {
      const o = JSON.parse(localStorage.getItem(POST_KEY) || 'null');
      if (o && o.free) return { free: true };
      if (o && Number.isInteger(o.comp) && Number.isInteger(o.field)) return { comp: o.comp, field: o.field };
    } catch {}
    return null;
  }
  function savePost() {
    try {
      if (post) localStorage.setItem(POST_KEY, JSON.stringify(post));
      else if (freeMode) localStorage.setItem(POST_KEY, JSON.stringify({ free: true }));
      else localStorage.removeItem(POST_KEY);
    } catch {}
  }
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
  // "Jij: Sam · Volleybal · Veld 1" — altijd bovenaan zolang je een plek hebt.
  const meEl = document.createElement('div');
  meEl.id = 'wh-me'; meEl.className = 'wh-me'; meEl.hidden = true;
  statusEl.parentNode.insertBefore(meEl, statusEl);
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
  // Weigert het toestel de opslag (vol), dan leeft de rij verder in het geheugen: de
  // acties gaan nog steeds weg, zolang deze pagina open blijft. De teller zegt dat erbij.
  function loadQueue() {
    if (memQueue) return memQueue.map(o => ({ ...o }));
    try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); memQueue = null; }
    catch { memQueue = q.map(o => ({ ...o })); }
    renderQueue();
  }
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
    const q = loadQueue();
    const n = q.length;
    queueEl.hidden = !n;
    if (!n) { queueEl.textContent = ''; return; }
    const telt = (k) => `${k} ${k === 1 ? 'actie wacht' : 'acties wachten'}`;
    const what = telt(n);
    // Acties van een gepauzeerde sport wachten niet op bereik maar op het hervatten.
    const p = q.filter(o => pausedHeld.has(o.id)).length;
    queueEl.textContent = !token()
      ? `${what} — log in om ${n === 1 ? 'hem' : 'ze'} te versturen.`
      : (memQueue && memQueue.length ? `${what}. De opslag van dit toestel is vol: houd deze pagina open tot alles verstuurd is.`
        : (p && p === n ? `${what} tot de sport hervat wordt. Daarna ${n === 1 ? 'gaat hij' : 'gaan ze'} vanzelf door; andere wedstrijden kun je gewoon bedienen.`
          : (p ? `${telt(n - p)} op verbinding en ${telt(p)} tot de sport hervat wordt. Je kunt gewoon doorwerken: alles wordt vanzelf verstuurd.`
            : `${what} op verbinding. Je kunt gewoon doorwerken: alles wordt vanzelf verstuurd zodra er weer bereik is.`)));
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
        headers: { 'content-type': 'application/json', 'x-admin-token': token() || '', 'x-crew-device': device() },
        body: JSON.stringify(op.body || {}),
      });
    } catch { return { kind: 'net' }; }
    finally { clearTimeout(timer); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { kind: 'auth' };
    if (r.ok) return { kind: 'ok', json: j };
    // Een ander toestel bedient deze wedstrijd: een oordeel van de server, geen storing.
    if (r.status === 409 && j.code === 'taken_over') return { kind: 'taken', name: (j.operator && j.operator.name) || 'Iemand anders', error: j.error || '' };
    if (r.status === 423) return { kind: 'paused', error: j.error || 'Deze sport is gepauzeerd.' };
    // Storing aan de serverkant of even te druk: geen oordeel over de actie → later opnieuw.
    if (r.status >= 500 || r.status === 429 || r.status === 408) return { kind: 'net', server: true, error: j.error || `Serverfout (${r.status}).` };
    return { kind: 'reject', error: j.error || 'Er ging iets mis.' };
  }

  // 401: sessie verlopen. Niets in de rij zetten; token weg en herladen, dan toont
  // wedstrijd.js het loginscherm. Draft en wachtrij staan in de opslag en blijven.
  function toLogin() {
    persistDraft();
    // Een rij die alleen in het geheugen staat overleeft het herladen niet: nog één
    // keer proberen op te slaan, en anders eerlijk zeggen dat hij weg is.
    let lost = 0;
    if (memQueue && memQueue.length) { const q = memQueue; saveQueue(q); if (memQueue) lost = q.length; }
    memQueue = null;   // geen "pagina verlaten?"-vraag bij dit herladen
    try { localStorage.removeItem('jvo_crew_token'); } catch {}
    ss.set(MSG_KEY, lost
      ? `Je sessie is verlopen en de opslag van dit toestel is vol: ${lost === 1 ? 'één wachtende actie is' : `${lost} wachtende acties zijn`} niet bewaard. Log opnieuw in en voer de laatste stand opnieuw in.`
      : 'Je sessie is verlopen. Log opnieuw in — je invoer is bewaard.');
    location.reload();
  }

  const SUPERSEDED = 'Deze wedstrijd was al afgesloten; de eerder ingevoerde uitslag blijft staan. Klopt die niet? Gebruik "Uitslag corrigeren".';
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
      let superseded = false;
      for (let i = 0; i < ops.length; i++) {
        const r = await send(ops[i]);
        if (r.kind === 'ok') {
          if (r.json && r.json.superseded) superseded = true;
          if (r.json && r.json.poules && ops[i].comp === sel) { setData(r.json, ops[i].comp); seq++; }
          continue;
        }
        if (r.kind === 'net') {
          ops.slice(i).forEach(enqueue); ops.slice(i).forEach(applyLocal);
          flash('Geen verbinding — je actie is bewaard en wordt vanzelf verstuurd', 'warn');
          return 'queued';
        }
        if (r.kind === 'auth') { toLogin(); return 'auth'; }
        if (r.kind === 'taken') { takenByWrite(ops[i].id, r.name); return 'reject'; }
        setMsg(r.error);
        return 'reject';
      }
      setMsg(superseded ? SUPERSEDED : '', superseded);
      return 'ok';
    };
    const p = chain.then(job, job);
    chain = p.catch(() => {});
    return p;
  }

  // Melding van de wachtrij zelf (pauze/storing): blijft staan tot hij niet meer klopt.
  function noteFlush(text) { flushNote = text; setMsg(text, true); }
  function clearFlushNote() { if (flushNote && msgEl.textContent === flushNote) setMsg(''); flushNote = ''; }

  async function flush() {
    if (flushing || !token() || !navigator.onLine) return;
    if (!loadQueue().length) { pausedHeld = new Set(); clearFlushNote(); return; }
    flushing = true;
    let sent = 0, stopped = false, note = '';
    // Wedstrijden die deze ronde 423 (pauze) kregen: hún acties blijven in volgorde
    // staan, de rest van de rij gaat gewoon door.
    const held = new Set();
    try {
      for (;;) {
        const op = loadQueue().find(o => !held.has(o.id));
        if (!op) break;
        const r = await send(op);
        if (r.kind === 'net') {
          // Geen bereik of een storing aan de serverkant (502/503 van de proxy tijdens een
          // herstart, 429): de server heeft niets over de actie gezegd, dus NOOIT weggooien.
          // De hele rij wacht; de teller telt alleen voor de melding.
          if (r.server) {
            const q = loadQueue();
            const i = q.findIndex(x => x.u === op.u);
            if (i >= 0) {
              q[i].tries = (q[i].tries || 0) + 1; saveQueue(q);
              if (q[i].tries >= 5) note = 'De server reageert niet goed. Je acties blijven bewaard en we blijven het proberen. Duurt het lang? Meld het bij de wedstrijdleiding.';
            }
          }
          stopped = true; break;
        }
        if (r.kind === 'auth') { flushing = false; toLogin(); return; }
        if (r.kind === 'paused') {
          // Pauze is tijdelijk: deze wedstrijd laten staan en later opnieuw proberen.
          held.add(op.id);
          note = `${r.error} Je acties voor deze sport blijven klaarstaan en gaan na het hervatten door.`;
          continue;
        }
        // Verstuurd of afgewezen: uit de rij (op kenmerk — de rij kan intussen zijn aangevuld).
        const q = loadQueue();
        const i = q.findIndex(x => x.u === op.u);
        if (i >= 0) { q.splice(i, 1); saveQueue(q); }
        if (r.kind === 'ok') {
          sent++;
          if (r.json && r.json.poules && op.comp === sel) { setData(r.json, op.comp); seq++; }
          if (r.json && r.json.superseded) { flushNote = ''; setMsg(SUPERSEDED, true); }
        } else if (r.kind === 'taken') {
          // Niet in de rij laten hangen: de nieuwe bediener heeft de stand nu in handen.
          takenByWrite(op.id, r.name, true);
        } else {
          const what = op.t === 'setscore' ? 'Een stand' : (op.t === 'start' ? 'Een start' : 'Een einde');
          flushNote = '';
          setMsg(`${what} uit de wachtrij is door de server afgewezen en overgeslagen: ${r.error}`, true);
        }
      }
    } finally { flushing = false; }
    pausedHeld = held;
    if (held.size) stopped = true;
    if (note) { if (note !== flushNote || msgEl.textContent !== note) noteFlush(note); } else clearFlushNote();
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
    openId = id; draft = null; editing = false; confirmEnd = 0; confirmNext = 0;
    if (id == null) ss.del(OPEN_KEY); else ss.set(OPEN_KEY, String(id));
  }

  // ── Mijn plek, sportkeuze en welke delen in beeld zijn ─────────────────────
  // "Mijn plek" geldt zodra er een andere sport dan het hoofdtoernooi is. Een
  // installatie met alleen het hoofdtoernooi merkt hier niets van.
  const plekMode = () => comps.some(c => c.id !== DEFAULT_COMP);
  const compById = (id) => comps.find(c => c.id === id) || null;
  const placesOf = (c) => Math.max(1, Number(c && c.places) || 1);
  const placeName = (c, f) => `${(c && c.place_noun) || 'Veld'} ${f}`;
  const postLabel = (p) => { const c = p && compById(p.comp); return c ? `${c.name} · ${placeName(c, p.field)}` : ''; };
  const postValid = (p) => { const c = p && compById(p.comp); return !!c && p.field >= 1 && p.field <= placesOf(c); };

  function renderChips() {
    chips.innerHTML = comps.map(c => `<button type="button" class="wh-chip" role="tab" data-id="${esc(c.id)}"
      aria-selected="${c.id === sel ? 'true' : 'false'}">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}${esc(c.name)}</button>`).join('');
  }
  const hubMode = () => loggedIn() && sel != null && sel !== DEFAULT_COMP && comps.some(c => c.id === sel);
  const picking = () => loggedIn() && plekMode() && view === 'pick';
  const panelOn = () => picking() || hubMode();
  function applyMode() {
    const li = loggedIn(), pm = li && plekMode();
    // De sportstrook is er alleen nog voor wie bewust zonder vaste plek werkt.
    bar.hidden = !(li && comps.length > 1 && (!pm || (freeMode && view !== 'pick')));
    const on = panelOn();
    document.body.classList.toggle('hub-mode', on);
    document.body.classList.toggle('wh-plek', pm);
    hubEl.hidden = !on;
    renderMe();
    syncMsg();
    if (hubMode()) connect(); else disconnect();
    renderQueue();
  }
  chips.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    if (commitTimer) await commit();
    sel = Number(b.dataset.id);
    ss.set(SPORT_KEY, String(sel));
    setOpen(null); data = null; dataFor = null; setMsg('');
    view = 'list';
    renderChips(); applyMode();
    if (hubMode()) { render(); load(true); }
    beat(true);
  });

  // ── "Jij: …"-balk + wisselen van plek ──────────────────────────────────────
  function renderMe() {
    const show = loggedIn() && plekMode() && view !== 'pick' && (post || freeMode);
    meEl.hidden = !show;
    if (!show) { meEl.textContent = ''; return; }
    const nm = myName();
    const c = post ? compById(post.comp) : null;
    let h = `<div class="wh-me-row"><span class="wh-me-t"><span class="wh-me-k">Jij</span>${nm ? `<b>${esc(nm)}</b>` : ''}`
      + (post && c ? `<span class="wh-me-p">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}${esc(c.name)} · ${esc(placeName(c, post.field))}</span>`
        : '<span class="wh-me-p">geen vaste plek</span>')
      + `</span><button type="button" class="wh-me-b" data-me="switch">${post ? 'Wissel van plek' : 'Kies een plek'}</button></div>`;
    if (switchAsk) {
      const m = claimedId != null ? ref(data, claimedId) : null;
      const names = m ? `${teamName(m.a)} – ${teamName(m.b)}` : 'deze wedstrijd';
      h += `<div class="wh-me-ask" role="alertdialog" aria-label="Wissel van plek">
        <p><b>Je bedient nu ${esc(names)}.</b> Wissel je van plek, dan geef je deze wedstrijd vrij. Iemand anders kan hem dan oppakken.</p>
        <div class="wh-me-acts"><button type="button" class="btn ghost" data-me="stay">Blijf</button><button type="button" class="btn" data-me="free">Geef deze wedstrijd vrij</button></div></div>`;
    }
    meEl.innerHTML = h;
  }
  const teamName = (v) => (v && typeof v === 'object' ? (v.name || v.placeholder || '?') : (v || '?'));
  const statusOf = (id) => { const m = id != null ? ref(data, id) : null; return m ? m.status : null; };

  async function goPick() {
    if (commitTimer) await commit();
    if (claimedId != null) release(claimedId);
    prevPost = post ? { ...post } : (freeMode ? { free: true } : null);
    switchAsk = false; pickComp = null;
    setOpen(null); setMsg('');
    view = 'pick';
    applyMode(); render();
    const h = bodyEl.querySelector('.wh-pick-h'); if (h) h.focus();
  }
  meEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-me]');
    if (!b) return;
    const what = b.dataset.me;
    if (what === 'stay') { switchAsk = false; renderMe(); return; }
    if (what === 'free') { goPick(); return; }
    // Wisselen terwijl je een LIVE wedstrijd bedient: eerst een duidelijke keuze.
    if (claimedId != null && statusOf(claimedId) === 'live') {
      switchAsk = true; renderMe();
      const f = meEl.querySelector('[data-me="stay"]'); if (f) f.focus();
      return;
    }
    goPick();
  });

  function choosePost(p) {
    post = p && !p.free ? { comp: p.comp, field: p.field } : null;
    freeMode = !!(p && p.free);
    savePost();
    prevPost = null; pickComp = null; switchAsk = false;
    if (post) sel = post.comp;
    else if (sel == null || !compById(sel)) sel = comps.length ? comps[0].id : DEFAULT_COMP;
    ss.set(SPORT_KEY, String(sel));
    setOpen(null); data = null; dataFor = null; setMsg('');
    view = post ? 'home' : 'list';
    renderChips(); applyMode();
    if (hubMode()) { render(); load(true); }
    beat(true);
  }

  function renderPick() {
    const multi = comps.length > 1;
    const nm = myName();
    const c = pickComp != null ? compById(pickComp) : (multi ? null : comps[0]);
    let h = `<div class="wh-pick"><h2 class="wh-pick-h" tabindex="-1">Waar sta jij${nm ? `, ${esc(nm)}` : ''}?</h2>`;
    if (!c) {
      h += `<p class="wh-pick-p">Kies je sport. Daarna zie je alleen de wedstrijden van jouw plek.</p><div class="wh-pick-grid">`
        + comps.map(x => `<button type="button" class="wh-pick-b" data-pick-comp="${esc(x.id)}">${isIcon(x.icon_small) ? `<img src="${esc(x.icon_small)}" alt="" />` : ''}<b>${esc(x.name)}</b>
            <small>${esc(placesOf(x))}× ${esc(String(x.place_noun || 'Veld').toLowerCase())}</small></button>`).join('') + '</div>';
    } else {
      h += `<p class="wh-pick-p">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}<span><b>${esc(c.name)}</b> — bij welk ${esc(String(c.place_noun || 'veld').toLowerCase())} sta je?</span></p><div class="wh-pick-grid">`;
      for (let f = 1; f <= placesOf(c); f++) {
        const others = [...new Set(posts.filter(p => !p.mine && p.competition_id === c.id && p.field === f).map(p => p.name))];
        const who = !others.length ? '' : (others.length === 1 ? `${others[0]} staat hier al` : `${others.slice(0, -1).join(', ')} en ${others[others.length - 1]} staan hier al`);
        h += `<button type="button" class="wh-pick-b" data-pick-field="${esc(f)}"><b>${esc(placeName(c, f))}</b>${who ? `<small>${esc(who)}</small>` : ''}</button>`;
      }
      h += '</div>';
      if (multi) h += '<button type="button" class="wh-back" data-pick-back>← Andere sport</button>';
    }
    h += '<div class="wh-pick-foot">';
    if (prevPost && !prevPost.free && postValid(prevPost)) h += `<button type="button" class="wh-link" data-pick-cancel>Toch terug naar ${esc(postLabel(prevPost))}</button>`;
    h += '<button type="button" class="wh-link" data-pick-free>Ik heb geen vaste plek</button></div></div>';
    bodyEl.innerHTML = h;
    syncMsg();
  }

  // ── Wie bedient wat (server: crewpost.js) ──────────────────────────────────
  const crewFetch = async (path, body, ms) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 6000);
    try {
      const r = await fetch(path, {
        method: 'POST', signal: ctrl.signal, keepalive: true,
        headers: { 'content-type': 'application/json', 'x-admin-token': token() || '', 'x-crew-device': device() },
        body: JSON.stringify(body || {}),
      });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, ok: r.ok, json: j };
    } catch { return { status: 0, ok: false, json: {} }; }
    finally { clearTimeout(timer); }
  };

  // Van dit toestel overgenomen: alles wat nog onderweg was loslaten (de nieuwe
  // bediener heeft de stand nu in handen) en het duidelijk zeggen.
  function onLost(id, name) {
    const first = lost.get(id) !== name;
    lost.set(id, name);
    declined.delete(id); optimistic.delete(id);
    if (claimedId === id) claimedId = null;
    if (openId === id) {
      clearTimeout(commitTimer); commitTimer = null;
      clearTimeout(confirmTimer); confirmEnd = 0;
      draft = null; editing = false; dropDraft(id);
    }
    if (first) flash(`Overgenomen door ${name} — dit toestel kijkt nu alleen mee`, 'warn');
  }
  // Een schrijfactie kreeg 409 taken_over.
  function takenByWrite(id, name, fromQueue) {
    const was = opers.get(id);
    const mineBefore = claimedId === id || (was && was.mine) || optimistic.has(id);
    opers.set(id, { match_id: id, name, mine: false });
    opsSig = '';
    if (mineBefore) onLost(id, name);
    else { optimistic.delete(id); if (openId === id) { clearTimeout(commitTimer); commitTimer = null; draft = null; editing = false; dropDraft(id); } }
    flushNote = '';
    setMsg(`${name} bedient deze wedstrijd nu. Jouw ${fromQueue ? 'bewaarde actie' : 'actie'} is niet verstuurd. Klopt de stand niet? Stem het even af met ${name}.`, true);
    if (canRender()) render();
  }

  function applySnap(j) {
    if (!j || !Array.isArray(j.operators)) return;
    const prevMine = new Set();
    for (const [id, o] of opers) if (o.mine) prevMine.add(id);
    if (claimedId != null) prevMine.add(claimedId);
    opers = new Map(j.operators.map(o => [o.match_id, o]));
    posts = Array.isArray(j.posts) ? j.posts : [];
    for (const id of prevMine) { const o = opers.get(id); if (o && !o.mine) onLost(id, o.name); }
    // Verlopen of door de admin vrijgegeven: bij de volgende weergave meldt dit toestel zich opnieuw.
    if (claimedId != null && !opers.get(claimedId)) claimedId = null;
    for (const [id, name] of [...lost]) { const o = opers.get(id); if (!o || o.mine || o.name !== name) { if (!o || o.mine) lost.delete(id); else lost.set(id, o.name); } }
    for (const id of [...optimistic]) if (opers.get(id)) optimistic.delete(id);
    const sig = JSON.stringify([j.operators.map(o => [o.match_id, o.name, o.mine]), posts.map(p => [p.competition_id, p.field, p.name])]);
    if (sig !== opsSig) { opsSig = sig; if (panelOn() && canRender()) render(); }
  }

  // Scherm aan houden zolang dit toestel een LIVE wedstrijd bedient: een vergrendelde
  // telefoon stuurt geen hartslag meer en mist dan seintjes (overname, pauze). Lukt het
  // niet (oude browser, energiebesparing), dan vangt de ruime live-termijn op de server
  // het op. Buiten een live wedstrijd laten we het scherm met rust.
  let wake = null, wakeBusy = false;
  async function syncWake() {
    const want = claimedId != null && statusOf(claimedId) === 'live' && loggedIn() && document.visibilityState === 'visible';
    if (!want) { if (wake) { const w = wake; wake = null; try { await w.release(); } catch {} } return; }
    if (wake || wakeBusy || !('wakeLock' in navigator)) return;
    wakeBusy = true;
    try {
      const w = await navigator.wakeLock.request('screen');
      w.addEventListener('release', () => { if (wake === w) wake = null; });
      wake = w;
    } catch { /* geweigerd of niet beschikbaar: stil verder */ }
    wakeBusy = false;
    syncWake();   // de situatie kan intussen veranderd zijn
  }

  // Hartslag: plek + eigen bediening verversen, en horen wie wat bedient.
  async function beat(force) {
    syncWake();
    if (!loggedIn() || !plekMode() || !navigator.onLine) return;
    // Loopt er al een, of was de vorige net: niet laten vallen maar zo meteen nog één
    // keer (een seintje "iemand nam over / gaf vrij" mag niet tot de volgende ronde wachten).
    const since = Date.now() - lastBeat;
    if (beating || (!force && since < 3000)) {
      if (!beatLater) beatLater = setTimeout(() => { beatLater = null; beat(); }, beating ? 800 : 3050 - since);
      return;
    }
    // Een afgesloten wedstrijd houdt dit toestel niet vast (behalve tijdens het corrigeren).
    if (claimedId != null && statusOf(claimedId) === 'done' && !(editing && openId === claimedId)) release(claimedId);
    beating = true; lastBeat = Date.now();
    try {
      const body = {
        competition_id: post ? post.comp : (freeMode && view !== 'pick' && sel != null ? sel : null),
        field: post ? post.field : null,
        match_id: claimedId,
      };
      const r = await crewFetch('/api/crew/post', body);
      if (r.status === 401) { toLogin(); return; }
      if (r.ok) applySnap(r.json);
      else if (r.status === 400 && r.json.code === 'bad_post' && post) {
        // De plek bestaat niet meer (de organisatie paste de sport aan): opnieuw kiezen.
        post = null; savePost(); view = 'pick'; pickComp = null;
        setMsg(r.json.error || 'Je plek bestaat niet meer. Kies een nieuwe plek.', true);
        applyMode(); render();
      }
    } finally { beating = false; }
  }
  function release(id) {
    if (claimedId === id) claimedId = null;
    optimistic.delete(id);
    if (!token() || !navigator.onLine) return;
    // Een hartslag die nét onderweg was kan de wedstrijd weer oppakken: dan nog één keer vrijgeven.
    const again = beating;
    const go = () => crewFetch(`/api/crew/match/${encodeURIComponent(id)}/release`, {}).then(r => { if (r.ok) applySnap(r.json); });
    go().then(() => { if (again && claimedId !== id) setTimeout(() => { if (claimedId !== id) go(); }, 1200); });
  }
  // Aanmelden als bediener. Zonder `takeover` weigert de server als een ander hem bedient.
  async function claim(id, takeover) {
    if (claiming === id) return;
    claiming = id; claimTried = { id, at: Date.now() };
    const r = await crewFetch(`/api/crew/match/${encodeURIComponent(id)}/claim`, takeover ? { takeover: true } : {}, 4500);
    claiming = null;
    if (r.status === 401) { toLogin(); return; }
    if (r.ok) {
      claimedId = id; lost.delete(id); declined.delete(id); optimistic.delete(id);
      opsSig = ''; applySnap(r.json); syncWake();
      if (takeover) { setMsg(''); flash(r.json.took_over ? `Jij bedient deze wedstrijd nu (overgenomen van ${r.json.took_over})` : 'Jij bedient deze wedstrijd nu', 'ok'); }
      return;
    }
    if (r.status === 409 && r.json.code === 'occupied') { opsSig = ''; applySnap(r.json); return; }
    if (r.status === 404) { opsSig = ''; if (canRender()) render(); return; }
    // Geen bereik of een storing: bij overnemen eerlijk zeggen, anders gewoon doorwerken
    // (de server beslist bij de eerste actie; een ander toestel krijgt dan voorrang).
    if (takeover) { setMsg('Overnemen kan alleen met verbinding. Probeer het zo nog een keer.'); if (canRender()) render(); return; }
    optimistic.add(id);
    if (canRender()) render();
  }
  // Mag dit toestel deze wedstrijd nu bedienen?
  //   'mine'    ja
  //   'other'   een ander bedient hem → alleen meekijken (of bewust overnemen)
  //   'busy'    je bedient zelf nog een andere LIVE wedstrijd → eerst kiezen
  //   'pending' het aanmelden loopt nog (heel even)
  function modeOf(m) {
    const o = opers.get(m.id);
    if (o && !o.mine) return 'other';
    if (m.status === 'done') return 'mine';
    if (o && o.mine) { if (claimedId == null) claimedId = m.id; return 'mine'; }
    if (claimedId === m.id) return 'mine';
    if (view === 'match' && claimedId != null && claimedId !== m.id && statusOf(claimedId) === 'live') return 'busy';
    if (optimistic.has(m.id) || !navigator.onLine || !plekMode()) return 'mine';
    return 'pending';
  }
  const lockedNow = () => { const m = current(); return !!m && modeOf(m) !== 'mine'; };

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
  // Een vrije tekst van de organisatie (reden van de pauze) als nette zin.
  const zin = (t) => { const x = String(t || '').trim(); return x && !/[.!?…]$/.test(x) ? `${x}.` : x; };
  const place = (m) => (m.field ? `${data.schedule.place_noun} ${m.field}` : '');
  const byExpected = (a, b) => String(a.expected || '99:99').localeCompare(String(b.expected || '99:99')) || a.id - b.id;
  // Wie bedient deze wedstrijd (alleen tonen zolang hij niet klaar is).
  const opText = (m) => { const o = m.status !== 'done' ? opers.get(m.id) : null; return !o ? '' : (o.mine ? 'jij bedient' : `${o.name} bedient`); };
  const row = (m, waiting) => `<button type="button" class="wh-m${m.status === 'live' ? ' live' : ''}${post && m.field === post.field ? ' mine' : ''}" data-open="${esc(m.id)}">
      <span class="tm">${esc(m.status === 'live' ? 'Live' : (m.expected || ''))}</span>
      <span class="tt">${esc(m.a || '?')} – ${esc(m.b || '?')}<small>${esc([m.where, place(m), waiting.has(m.id) ? (pausedHeld.has(m.id) ? 'wacht op hervatten' : 'wacht op verbinding') : '', opText(m)].filter(Boolean).join(' · '))}</small></span>
      <span class="sc">${esc(scoreText(m))}</span></button>`;

  function listHtml(c) {
    const all = flat();
    const q = queuedIds();
    const r = (m) => row(m, q);
    const live = all.filter(m => m.status === 'live');
    const next = all.filter(m => m.status === 'scheduled' && m.ready).sort(byExpected);
    const waiting = all.filter(m => m.status === 'scheduled' && !m.ready).length;
    const done = all.filter(m => m.status === 'done');
    let h = `<div class="wh-head">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}<div><b>${esc(c.name)}</b>
      <span>${esc([c.team_label, data.schedule.fields ? `${data.schedule.fields}× ${String(data.schedule.place_noun || '').toLowerCase()}` : '', c.result_model === 'sets' ? `best of ${c.best_of}` : ''].filter(Boolean).join(' · '))}</span></div></div>`;
    h += `<div class="wh-sec">Nu bezig</div>` + (live.length ? live.map(r).join('') : '<p class="wh-note">Niets live.</p>');
    h += `<div class="wh-sec">Volgende</div>` + (next.length ? next.slice(0, 10).map(r).join('') : '<p class="wh-note">Geen wedstrijden klaar om te starten.</p>');
    if (waiting) h += `<p class="wh-note">${esc(waiting)} ${waiting === 1 ? 'wedstrijd wacht' : 'wedstrijden wachten'} op de vorige ronde.</p>`;
    if (done.length) h += `<details><summary class="wh-sec" style="cursor:pointer">Klaar (${esc(done.length)})</summary>${done.map(r).join('')}</details>`;
    if (Array.isArray(data.final_standing) && data.final_standing.length) {
      h += `<div class="wh-sec">Eindstand</div><p class="wh-note">${data.final_standing.slice(0, 3).map(t => `${esc(t.pos)}. ${esc(t.name)}`).join(' · ')}</p>`;
    }
    return h;
  }

  // ── Jouw wedstrijd (op jouw plek) ──────────────────────────────────────────
  const onMyPlace = () => (post ? flat().filter(m => m.field === post.field) : []);
  function myMatch() {
    const mine = onMyPlace();
    const sched = mine.filter(m => m.status === 'scheduled').sort(byExpected);
    return mine.find(m => m.status === 'live') || sched.find(m => m.ready) || sched[0] || null;
  }
  // Thuis-weergave: de geopende wedstrijd volgt "jouw wedstrijd". Niet verspringen
  // terwijl er nog iets onderweg is of je aan het corrigeren bent.
  function syncHome() {
    if (!post || view === 'match' || view === 'pick') return;
    if (editing || commitTimer || busy || (draft && draft.dirty)) return;
    const t = myMatch();
    const want = t ? t.id : null;
    if (want === openId) return;
    const old = openId;
    setOpen(want);
    if (old != null) setMsg('');   // een melding over de vorige wedstrijd hoort niet bij de volgende
    if (old != null && claimedId === old && statusOf(old) !== 'live') release(old);
  }

  // ── Bediening van één wedstrijd ────────────────────────────────────────────
  const current = () => flat().find(m => m.id === openId) || null;
  const needSets = (c) => Math.floor((c.best_of || 3) / 2) + 1;

  const fromServer = (m, sets, pens) => (sets
    ? { sets: (Array.isArray(m.sets) && m.sets.length ? m.sets : [[0, 0]]).map(s => [s[0], s[1]]) }
    : { score: [m.score_a || 0, m.score_b || 0], pens: pens || ['', ''] });
  // Doelscore van set i (0 = geen: set op tijd). Alleen voor een waarschuwing; ingekorte
  // sets blijven mogelijk.
  function setTarget(c, i) {
    const cc = (data && data.competition) || {};
    const sp = Number(cc.set_points) || 0, dp = Number(cc.deciding_points) || 0;
    return i === (c.best_of || 3) - 1 ? (dp || sp) : sp;
  }
  const setShort = (c, s, i) => { const t = setTarget(c, i); return t > 0 && !(Math.max(s[0], s[1]) >= t && Math.abs(s[0] - s[1]) >= 2); };
  let warnText = '';
  function warn(text) { warnText = text; setMsg(text); }
  function clearWarn() { if (warnText && msgEl.textContent === warnText) setMsg(''); warnText = ''; }

  // Het vak bovenaan het kaartje: wie bedient dit, en wat kun je doen.
  function ownHtml(m, mode) {
    if (mode === 'other') {
      const o = opers.get(m.id) || {};
      const nm = o.name || 'Iemand anders';
      const was = m.status !== 'done' && lost.get(m.id);
      if (declined.has(m.id)) {
        return `<div class="wh-own" role="status"><p><b>${esc(nm)} bedient deze wedstrijd.</b> Je kijkt mee; tikken kan hier niet.</p>
          <div class="wh-own-acts"><button type="button" class="btn ghost" data-own="ask">Toch overnemen</button></div></div>`;
      }
      return `<div class="wh-own ask" role="alertdialog" aria-label="Overnemen?">
        <p><b>${was ? `Overgenomen door ${esc(nm)}.` : `${esc(nm)} bedient deze wedstrijd.`}</b> ${was ? 'Dit toestel kijkt nu alleen mee, zodat jullie niet door elkaar tikken. Terug overnemen?' : 'Overnemen? Dan kijkt het toestel van ' + esc(nm) + ' alleen nog mee.'}</p>
        <div class="wh-own-acts"><button type="button" class="btn ghost" data-own="watch">Nee, alleen meekijken</button><button type="button" class="btn" data-own="take">${was ? 'Neem terug over' : 'Ja, neem over'}</button></div></div>`;
    }
    if (mode === 'busy') {
      const mine = ref(data, claimedId);
      const names = mine ? `${teamName(mine.a)} – ${teamName(mine.b)}` : 'een andere wedstrijd';
      if (declined.has(m.id)) {
        return `<div class="wh-own" role="status"><p>Je kijkt mee. Jij bedient <b>${esc(names)}</b>.</p>
          <div class="wh-own-acts"><button type="button" class="btn ghost" data-own="ask">Toch deze bedienen</button></div></div>`;
      }
      return `<div class="wh-own ask" role="alertdialog" aria-label="Deze wedstrijd bedienen?">
        <p><b>Je bedient nu ${esc(names)}.</b> Wil je deze wedstrijd bedienen? Dan geef je ${esc(names)} vrij.</p>
        <div class="wh-own-acts"><button type="button" class="btn ghost" data-own="watch">Nee, alleen meekijken</button><button type="button" class="btn" data-own="claim">Bedien deze wedstrijd</button></div></div>`;
    }
    if (mode === 'pending') return '<div class="wh-own quiet" role="status"><p>Even aanmelden als bediener…</p></div>';
    if (m.status !== 'done' && plekMode()) return `<div class="wh-own quiet mine"><p>${claimedId === m.id ? 'Jij bedient deze wedstrijd.' : 'Jij bedient deze wedstrijd (nog niet bevestigd: geen verbinding).'}</p></div>`;
    return '';
  }

  // Het kaartje van één wedstrijd. `back` = terug-knop erboven (los geopend uit de lijst).
  function controlHtml(m, c, back) {
    const v = data.vocab || {};
    const sets = c.result_model === 'sets';
    const mode = modeOf(m);
    const lock = mode !== 'mine';
    if (mode === 'pending' && claiming !== m.id && !(claimTried.id === m.id && Date.now() - claimTried.at < 4000)) claim(m.id);
    const endLabel = confirmEnd ? 'Zeker weten? Tik nog een keer' : (v.end || 'Einde wedstrijd');
    let ctx = [c.name, m.where, place(m), m.status === 'scheduled' ? (m.expected || '') : ''];
    if (m.status === 'live' && !sets) {
      const st = tsMs(m.started_at);
      if (st) ctx.push(`${Math.max(0, Math.floor((Date.now() + skew - st) / 60000))}′${data.match_minutes ? ` van ${data.match_minutes} min` : ''}`);
    }
    const head = `${back ? `<button type="button" class="wh-back" data-back>${post ? '← Terug naar jouw wedstrijd' : '← Alle wedstrijden'}</button>` : ''}
      <div class="wh-card${lock ? ` locked mode-${esc(mode)}` : ''}${m.status === 'live' ? ' is-live' : ''}"><div class="wh-ctx">${esc(ctx.filter(Boolean).join(' · '))}</div>${ownHtml(m, mode)}<div class="wh-body">`;
    let body = '';
    // Niet (meer) live: ook een achtergebleven bewaarde draft opruimen, anders overleeft
    // hij een wis-en-herstart van de wedstrijd.
    if (m.status !== 'live') { draft = null; dropDraft(m.id); }
    if (lock) { draft = null; editing = false; }
    if (m.status === 'scheduled') {
      body += `<div class="wh-team"><span class="nm">${esc(m.a || '?')}</span></div><div class="wh-team"><span class="nm">${esc(m.b || '?')}</span></div>`;
      body += `<div class="wh-actions">${!m.ready ? '<p class="wh-note">Wacht op de vorige ronde.</p>'
        : (data.paused ? '<p class="wh-note">Deze sport is even gepauzeerd. Starten kan weer zodra de organisatie hervat.</p>'
          : `<button type="button" class="btn full" data-act="start">${esc(v.start || 'Start')} →</button>`)}</div>`;
    } else if (m.status === 'live' && !editing) {
      // Meekijken: de stand van de server, niets bewaren en niets versturen.
      let d = lock ? fromServer(m, sets, null) : draft;
      if (!d) {
        // Een bewaarde stand telt alleen als hij nog NIET bij de server was (herladen of
        // opnieuw ingelogd midden in het tikken): die gaat alsnog weg. Is hij al verstuurd,
        // dan is de server de bron (een correctie van elders mag niet worden teruggedraaid);
        // alleen de ingetypte beslissing blijft bewaard.
        const st = storedDraft(m.id, sets);
        if (st && st.dirty) draft = st;
        else draft = fromServer(m, sets, st && st.pens);
        if (draft.dirty) scheduleCommit();
        d = draft;
      }
      if (sets) {
        const cur = d.sets[d.sets.length - 1];
        const prev = d.sets.slice(0, -1);
        // Beslist zodra één kant genoeg sets heeft (de lopende set telt mee met wie
        // nu voorstaat): dan geen "volgende set" meer — de server weigert die toch.
        const w = setsWon(d.sets);
        const decided = w[0] >= needSets(c) || w[1] >= needSets(c);
        body += `<div class="wh-sets">${prev.length ? `Gespeeld: ${esc(prev.map(s => `${s[0]}–${s[1]}`).join(' · '))}` : 'Eerste set'}</div>
          <div class="wh-ctx" style="margin-top:12px">Set ${esc(d.sets.length)}</div>
          <div class="wh-team"><span class="nm">${esc(m.a)}</span><span class="wh-step"><button type="button" data-step="0,-1" aria-label="Punt eraf voor ${esc(m.a)}">−</button><b>${esc(cur[0])}</b><button type="button" data-step="0,1" aria-label="Punt erbij voor ${esc(m.a)}">+</button></span></div>
          <div class="wh-team"><span class="nm">${esc(m.b)}</span><span class="wh-step"><button type="button" data-step="1,-1" aria-label="Punt eraf voor ${esc(m.b)}">−</button><b>${esc(cur[1])}</b><button type="button" data-step="1,1" aria-label="Punt erbij voor ${esc(m.b)}">+</button></span></div>
          <div class="wh-actions">
            ${d.sets.length < c.best_of && !decided ? `<button type="button" class="btn ghost full" data-act="nextset">${confirmNext ? 'Zeker weten? Tik nog een keer' : 'Set klaar → volgende set'}</button>` : ''}
            ${d.sets.length > 1 && cur[0] === 0 && cur[1] === 0 ? `<button type="button" class="btn ghost full" data-act="prevset">← Terug naar set ${esc(d.sets.length - 1)}</button>` : ''}
            <button type="button" class="btn full" data-act="end">${esc(endLabel)}</button>
          </div>`;
      } else {
        const sc = d.score;
        const tie = m.phase !== 'group' && sc[0] === sc[1];
        const pens = d.pens || ['', ''];
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
    const wait = !queuedIds().has(m.id) ? '' : (pausedHeld.has(m.id)
      ? '<p class="wh-note">Wacht tot de sport hervat wordt — gaat daarna vanzelf door.</p>'
      : '<p class="wh-note">Wacht op verbinding — wordt vanzelf verstuurd.</p>');
    return head + body + wait + '</div><div class="wh-alert" id="wh-alert"></div></div>';
  }

  // Het hele paneel: links jouw (of de geopende) wedstrijd, rechts hierna + alle
  // wedstrijden. Op een telefoon staat er één deel tegelijk in beeld (zie de CSS).
  function render() {
    if (!panelOn()) return;
    if (view === 'pick') { renderPick(); return; }
    const c = comp();
    if (!c || !data || dataFor !== sel) {
      bodyEl.innerHTML = `<p class="wh-note">${navigator.onLine ? 'Laden…' : 'Geen verbinding — het schema verschijnt zodra er weer bereik is.'}</p>`;
      syncMsg(); return;
    }
    syncHome();
    let m = openId != null ? current() : null;
    if (openId != null && !m) { setOpen(null); if (view === 'match') view = post ? 'home' : 'list'; syncHome(); m = openId != null ? current() : null; }
    if (view === 'match' && !m) view = post ? 'home' : 'list';
    const paused = data.paused ? `<div class="wh-paused">${data.pause_message ? `${esc(zin(data.pause_message))} ` : ''}Deze sport is even gepauzeerd: lopende wedstrijden mogen uitspelen, nieuwe niet starten.</div>` : '';
    if (!data.configured) {
      bodyEl.innerHTML = `${paused}<div class="wh-head">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}<div><b>${esc(c.name)}</b></div></div><p class="wh-note">Er is nog geen schema voor deze sport. De organisatie maakt dat in de admin.</p>`;
      syncMsg(); return;
    }
    // Links
    let main = '';
    if (view === 'match') main = controlHtml(m, c, true);
    else if (post) {
      const pl = placeName(c, post.field);
      if (m) {
        main += `<h2 class="wh-big">${m.status === 'live' ? 'Jouw wedstrijd nu' : (m.status === 'done' ? 'Jouw wedstrijd' : 'Jouw volgende wedstrijd')}</h2>` + controlHtml(m, c, false);
      } else {
        const any = onMyPlace().length > 0;
        main += `<h2 class="wh-big">Jouw wedstrijd nu</h2><div class="wh-empty"><b>${any ? `Alles op ${esc(pl)} is gespeeld.` : `Er staat niets gepland op ${esc(pl)}.`}</b>
          <p>${any ? 'Je bent hier klaar. Kijk bij "Alle wedstrijden" of er elders hulp nodig is, of wissel van plek.' : 'Klopt dat niet? Wissel van plek, of vraag het de wedstrijdleiding.'}</p></div>`;
      }
      // Net afgelopen op jouw plek: één regel, voor een snelle correctie.
      const last = onMyPlace().filter(x => x.status === 'done' && x.id !== openId).sort((a, b) => String(b.ended_at || '').localeCompare(String(a.ended_at || '')) || b.id - a.id)[0];
      if (last) main += `<button type="button" class="wh-last" data-open="${esc(last.id)}"><span>Net klaar</span><b>${esc(last.a || '?')} – ${esc(last.b || '?')}</b><i>${esc(scoreText(last))}</i><em>Corrigeren</em></button>`;
    } else main = '<p class="wh-note wh-hint">Kies een wedstrijd uit de lijst.</p>';
    // Rechts
    let side = '';
    if (post) {
      const nxt = onMyPlace().filter(x => x.status === 'scheduled' && x.id !== openId).sort(byExpected)[0];
      side += `<div class="wh-next"><div class="wh-sec">Hierna op jouw ${esc(String(c.place_noun || 'veld').toLowerCase())}</div>`
        + (nxt ? `<p class="wh-next-l"><span>${esc(nxt.expected || '')}</span><b>${esc(nxt.a || '?')} – ${esc(nxt.b || '?')}</b></p>` : '<p class="wh-note">Daarna niets meer.</p>') + '</div>';
      side += '<button type="button" class="wh-all-btn" data-view="list">Alle wedstrijden <span aria-hidden="true">›</span></button>';
    }
    side += `<div class="wh-all">${post ? '<button type="button" class="wh-back wh-all-back" data-view="home">← Terug naar jouw wedstrijd</button>' : ''}${listHtml(c)}</div>`;
    // Het uitklapblok "Klaar" blijft open bij verversen; de schuifpositie van de lijst ook.
    const wasOpen = !!bodyEl.querySelector('details[open]');
    const sc = bodyEl.querySelector('.wh-side'); const top = sc ? sc.scrollTop : 0;
    const foc = document.activeElement && bodyEl.contains(document.activeElement) ? document.activeElement : null;
    const focKey = foc ? (foc.dataset.act ? `[data-act="${foc.dataset.act}"]` : (foc.dataset.step ? `[data-step="${foc.dataset.step}"]` : (foc.dataset.own ? `[data-own="${foc.dataset.own}"]` : (foc.dataset.open ? `[data-open="${foc.dataset.open}"]` : (foc.dataset.view ? `[data-view="${foc.dataset.view}"]` : ''))))) : '';
    bodyEl.innerHTML = `${paused}<div class="wh-grid view-${esc(view)}${post ? ' has-post' : ' no-post'}"><section class="wh-main" aria-label="${post ? 'Jouw wedstrijd' : 'Wedstrijd'}">${main}</section><aside class="wh-side" aria-label="Alle wedstrijden">${side}</aside></div>`;
    if (wasOpen) { const d = bodyEl.querySelector('details'); if (d) d.open = true; }
    const sc2 = bodyEl.querySelector('.wh-side'); if (sc2 && top) sc2.scrollTop = top;
    // Meekijken of nog aan het aanmelden: de knoppen in het kaartje staan uit.
    bodyEl.querySelectorAll('.wh-card.locked .wh-body button, .wh-card.locked .wh-body input').forEach(el => { el.disabled = true; });
    if (focKey) { const el = bodyEl.querySelector(focKey); if (el && !el.disabled) { try { el.focus({ preventScroll: true }); } catch { el.focus(); } } }
    renderMe();
    syncMsg();
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
    // `live: 1` = "dit is live-bediening, geen correctie": is de wedstrijd intussen elders
    // afgesloten, dan mag de server deze stand weigeren in plaats van de uitslag te herschrijven.
    const body = d.sets ? { sets: d.sets.map(s => [s[0], s[1]]), live: 1 } : { score_a: d.score[0], score_b: d.score[1], live: 1 };
    busy++;
    let res;
    try { res = await act([{ t: 'setscore', id: openId, comp: sel, body }]); }
    finally { busy--; commitSeq++; }
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
    // Plek kiezen
    if (t.dataset.pickComp) { pickComp = Number(t.dataset.pickComp); const pc = compById(pickComp); if (pc && placesOf(pc) === 1) { choosePost({ comp: pc.id, field: 1 }); return; } render(); const h = bodyEl.querySelector('.wh-pick-h'); if (h) h.focus(); return; }
    if (t.dataset.pickField) { const pc = pickComp != null ? compById(pickComp) : comps[0]; if (pc) choosePost({ comp: pc.id, field: Number(t.dataset.pickField) }); return; }
    if (t.hasAttribute('data-pick-back')) { pickComp = null; render(); return; }
    if (t.hasAttribute('data-pick-free')) { choosePost({ free: true }); return; }
    if (t.hasAttribute('data-pick-cancel')) { if (prevPost) choosePost(prevPost); return; }
    // Telefoon: wisselen tussen "jouw wedstrijd" en "alle wedstrijden"
    if (t.dataset.view) { view = t.dataset.view === 'list' ? 'list' : (post ? 'home' : 'list'); render(); try { window.scrollTo(0, 0); } catch {} return; }
    // Wie bedient: overnemen / meekijken
    if (t.dataset.own) {
      const id = openId, w = t.dataset.own;
      if (id == null) return;
      if (w === 'watch') { declined.add(id); render(); return; }
      if (w === 'ask') { declined.delete(id); render(); const f = bodyEl.querySelector('[data-own="take"], [data-own="claim"]'); if (f) f.focus(); return; }
      if (!navigator.onLine) { setMsg('Overnemen kan alleen met verbinding. Probeer het zo nog een keer.'); return; }
      t.disabled = true;
      await claim(id, w === 'take');
      if (openId === id && canRender()) render();
      return;
    }
    if (t.dataset.open) {
      if (commitTimer) await commit();
      const id = Number(t.dataset.open), old = openId;
      const home = post ? myMatch() : null;
      if (old != null && old !== id && claimedId === old && statusOf(old) !== 'live') release(old);
      setOpen(id); setMsg('');
      view = home && home.id === id ? 'home' : 'match';
      render(); try { window.scrollTo(0, 0); } catch {}
      return;
    }
    if (t.hasAttribute('data-back')) {
      if (commitTimer) await commit();
      const old = openId;
      if (old != null && claimedId === old && statusOf(old) !== 'live') release(old);
      setOpen(null); setMsg('');
      view = post ? 'home' : 'list';
      render(); return;
    }
    // Meekijken (een ander bedient, of het aanmelden loopt nog): hier kan niets getikt worden.
    if ((t.dataset.step || t.dataset.act) && lockedNow()) return;
    if (t.dataset.step && draft) {
      const [side, d] = t.dataset.step.split(',').map(Number);
      const arr = draft.sets ? draft.sets[draft.sets.length - 1] : draft.score;
      arr[side] = Math.max(0, Math.min(99, arr[side] + d));
      confirmEnd = 0; clearTimeout(confirmTimer);
      confirmNext = 0; clearTimeout(nextTimer); clearWarn();
      touch(); render(); scheduleCommit();
      return;
    }
    const act_ = t.dataset.act;
    if (!act_) return;
    const m = current(), c = comp();
    if (!m || !c) return;
    const id = openId;
    if (act_ === 'edit') { editing = true; setMsg(''); render(); return; }
    if (act_ === 'cancel') { editing = false; setMsg(''); render(); return; }
    if (act_ === 'nextset') {
      if (!draft || !draft.sets) return;
      const cur = draft.sets[draft.sets.length - 1];
      if (cur[0] === cur[1]) { setMsg('Een set heeft een winnaar nodig voordat de volgende begint.'); return; }
      confirmEnd = 0; clearTimeout(confirmTimer);
      // De set lijkt nog niet uit (doelscore niet gehaald): eerst een tweede tik vragen.
      // Niet blokkeren — een ingekorte set of een set op tijd moet kunnen.
      if (setShort(c, cur, draft.sets.length - 1) && !(confirmNext && Date.now() - confirmNext <= 5000)) {
        confirmNext = Date.now();
        clearTimeout(nextTimer);
        nextTimer = setTimeout(() => { confirmNext = 0; clearWarn(); if (openId === id && canRender()) render(); }, 5000);
        render();
        warn(`Set ${draft.sets.length} staat pas ${cur[0]}–${cur[1]}. Zeker weten? Tik nog een keer.`);
        return;
      }
      confirmNext = 0; clearTimeout(nextTimer); clearWarn();
      draft.sets.push([0, 0]);
      touch(); setMsg(''); render();
      await commit();
      if (openId === id && canRender()) render();
      return;
    }
    if (act_ === 'prevset') {
      // Verkeerde tik op "volgende set": de lege set weer weghalen (stand is absoluut).
      if (!draft || !draft.sets || draft.sets.length < 2) return;
      const cur = draft.sets[draft.sets.length - 1];
      if (cur[0] !== 0 || cur[1] !== 0) return;
      confirmEnd = 0; clearTimeout(confirmTimer); confirmNext = 0; clearTimeout(nextTimer);
      draft.sets.pop();
      touch(); setMsg(''); render();
      await commit();
      if (openId === id && canRender()) render();
      return;
    }
    if (act_ === 'end') {
      if (!draft) return;
      const chk = endBody(m, c);
      if (chk.error) { confirmEnd = 0; setMsg(chk.error); return; }
      // Twee tikken: de eerste vraagt om bevestiging (5 s), de tweede sluit af.
      if (!confirmEnd || Date.now() - confirmEnd > 5000) {
        confirmEnd = Date.now(); setMsg('');
        confirmNext = 0; clearTimeout(nextTimer);
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { confirmEnd = 0; clearWarn(); if (openId === id && canRender()) render(); }, 5000);
        render();
        // Een set die de doelscore niet haalde: erbij zeggen, niet blokkeren.
        if (chk.body.sets) {
          const i = chk.body.sets.findIndex((s, k) => setShort(c, s, k));
          if (i >= 0) warn(`Set ${i + 1} staat pas ${chk.body.sets[i][0]}–${chk.body.sets[i][1]}. Zeker weten? Tik nog een keer op de knop.`);
        }
        return;
      }
      confirmEnd = 0; clearTimeout(confirmTimer); clearWarn();
      t.disabled = true;
      clearTimeout(commitTimer); commitTimer = null;
      const ops = [];
      // Stand op tijd: eerst de laatste stand (absoluut), dan het einde. Bij sets
      // gaat de hele setlijst met het einde mee.
      // `live: 1`: zie commit() — een einde uit de rij mag een uitslag die intussen door
      // de organisatie is ingevoerd niet overschrijven.
      if (draft.score && draft.dirty) ops.push({ t: 'setscore', id, comp: sel, body: { score_a: draft.score[0], score_b: draft.score[1], live: 1 } });
      ops.push({ t: 'end', id, comp: sel, body: { ...chk.body, live: 1 } });
      const d = draft;
      busy++;
      let res;
      try { res = await act(ops); }
      finally { busy--; commitSeq++; }
      if (res === 'ok' || res === 'queued') { if (draft === d) draft = null; dropDraft(id); if (res === 'ok') release(id); }
      if (openId === id) render();
      return;
    }
    if (act_ === 'start') {
      t.disabled = true;
      await act([{ t: 'start', id, comp: sel, body: { started_at: nowStr() } }]);
      dropDraft(id);   // een draft van vóór een wis-en-herstart hoort hier niet meer bij
      if (openId === id) { draft = null; render(); }
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
      if (openId === id) { if (editing) t.disabled = false; else render(); }
    }
  });

  // ── Laden ──────────────────────────────────────────────────────────────────
  let loading = false, loadAgain = false;
  async function load(force) {
    if (!hubMode()) return;
    if (loading) { loadAgain = true; return; }
    loading = true; lastLoad = Date.now();
    const want = sel;
    const at = seq, rev0 = rev, seq0 = commitSeq, busy0 = busy;
    try {
      const r = await fetch(`/api/tournament?competition=${encodeURIComponent(want)}`, { cache: 'no-store' });
      // Een oud antwoord uit de offline-cache mag een nieuwere stand niet terugdraaien.
      const stale = r.headers.get('X-JVO-Cache') === 'stale';
      // Is er tijdens het ophalen een actie verwerkt, dan is dit antwoord mogelijk ouder
      // dan wat er al staat (de Start-knop zou terugkomen): overslaan en vers ophalen.
      if (r.ok && want === sel && at !== seq && data && dataFor === want) loadAgain = true;
      else if (r.ok && want === sel && !(stale && data && dataFor === want)) {
        const j = await r.json();
        if (j && !j.offline && j.poules) {
          setData(j, want);
          // Een schone draft (alles is verstuurd, niets onderweg) volgt de server, zodat een
          // correctie van elders niet met één tik wordt teruggedraaid. De beslissing blijft.
          if (draft && openId != null && !draft.dirty && !commitTimer && !busy && !busy0
              && rev === rev0 && commitSeq === seq0 && !queuedIds().has(openId)) {
            const m = current();
            if (m && m.status === 'live') {
              const f = fromServer(m, !!draft.sets, draft.pens);
              if (draft.sets) draft.sets = f.sets; else draft.score = f.score;
              persistDraft();
            }
          }
          if (openId == null) {
            // Herladen midden in een wedstrijd: dezelfde wedstrijd weer openen.
            const o = parseInt(ss.get(OPEN_KEY) || '', 10);
            if (Number.isInteger(o) && ref(data, o)) {
              openId = o;
              const home = post ? myMatch() : null;
              view = home && home.id === o ? 'home' : 'match';
            } else ss.del(OPEN_KEY);
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
    sigTimer = setTimeout(() => { sigTimer = null; load(); beat(); }, wait);
  }
  let es = null, sseOk = false, triedLite = false, retryTimer = null, retryMs = 5000;
  function connect() {
    if (es || retryTimer || typeof EventSource === 'undefined') return;
    const open = (url, lite) => {
      let opened = false;
      try { es = new EventSource(url); } catch { es = null; return; }
      const me = es;
      me.addEventListener('open', () => { opened = true; sseOk = true; retryMs = 5000; });
      me.addEventListener('update', signal);
      me.addEventListener('error', () => {
        if (es !== me) return;
        sseOk = false;
        // Bij een haperende verbinding probeert de browser zelf opnieuw (CONNECTING).
        if (me.readyState !== 2) return;
        // De lichte stream bestaat (nog) niet op deze server → de gewone proberen.
        if (lite && !opened && !triedLite) { triedLite = true; es = null; open('/api/tournament/stream', false); return; }
        // Ook de gewone ging nooit open: dan lag het niet aan de lichte stream.
        if (!lite && !opened) triedLite = false;
        // CLOSED: de browser geeft het op na een antwoord dat geen stream is (502/503 van
        // de proxy tijdens een herstart, of de server zit vol). Zelf opnieuw verbinden,
        // steeds rustiger (5 s → 60 s, plus spreiding); intussen ververst de 10 s-ronde.
        try { me.close(); } catch {}
        es = null;
        const wait = retryMs + Math.random() * 5000;
        retryMs = Math.min(60000, retryMs * 2);
        retryTimer = setTimeout(() => { retryTimer = null; if (hubMode()) connect(); }, wait);
      });
    };
    if (triedLite) open('/api/tournament/stream', false); else open('/api/tournament/stream?lite=1', true);
  }
  function disconnect() {
    clearTimeout(retryTimer); retryTimer = null;
    if (es) { try { es.close(); } catch {} es = null; sseOk = false; }
  }

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
    if (plekMode()) {
      // Mijn plek: onthouden op dit toestel. Bestaat hij niet meer → opnieuw kiezen.
      const st = loadPost();
      freeMode = !!(st && st.free);
      post = st && !st.free && postValid(st) ? st : null;
      if (post) { sel = post.comp; view = 'home'; }
      else view = freeMode ? 'list' : 'pick';
    } else { post = null; freeMode = false; view = 'list'; }
    renderChips(); applyMode();
    if (panelOn()) render();
    if (hubMode()) load(true);
    beat(true);
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
    if (loggedIn()) { flush(); if (!comps.length) init(); else { if (panelOn()) render(); if (hubMode()) load(true); beat(true); } }
  }).observe(login, { attributes: true, attributeFilter: ['class'] });
  // Uitloggen: plek en bediening van dit toestel meteen vrijgeven (anders pas na de termijn van de server).
  // In de vangfase, zodat het token er nog is als wedstrijd.js daarna uitlogt.
  document.addEventListener('click', (e) => {
    if (!e.target || !e.target.closest || !e.target.closest('#wd-logout') || !token()) return;
    crewFetch('/api/crew/leave', {});
    claimedId = null; opers = new Map(); posts = []; opsSig = ''; lost.clear(); declined.clear(); optimistic.clear(); switchAsk = false;
  }, true);
  window.addEventListener('online', () => { renderQueue(); flush(); signal(); beat(true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); syncWake(); });
  setInterval(beat, BEAT_MS);
  window.addEventListener('offline', renderQueue);
  window.addEventListener('pagehide', persistDraft);
  // Een rij die alleen in het geheugen staat (opslag vol) gaat verloren bij het sluiten.
  window.addEventListener('beforeunload', (e) => { if (memQueue && memQueue.length) { e.preventDefault(); e.returnValue = ''; } });
  // Elke 10 s: wachtrij opnieuw proberen (het 'online'-seintje komt niet als de wifi
  // aan blijft maar niets doorlaat), en verversen als de stream wegviel of stil is.
  setInterval(() => {
    flush(); syncWake();
    if (!comps.length) { init(); return; }
    if (hubMode() && (!sseOk || Date.now() - lastLoad > 45000)) load();
    else if (hubMode() && openId != null && canRender() && !confirmEnd) render();   // live-minuut bijwerken
  }, 10000);
  renderQueue();
  init();
  flush();
})();
