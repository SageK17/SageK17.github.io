// JVO live-bord — public live tournament view. App mode (tabs) + screen mode (auto-cycle).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const params = new URLSearchParams(location.search);
  const SCREEN = params.has('screen') || params.get('mode') === 'screen';
  // Sporthub-thema: "direct door" is daar blauw (niet groen) en de 3D-beker is het
  // merkteken — kleurwoorden en het beker-emoji volgen het thema. Schemering ongewijzigd.
  const SPORTHUB = document.documentElement.dataset.theme === 'sporthub';
  const TROPHY = '<span class="tn-emoji">🏆</span>';

  // ---------- JVO Smart flags — welke verweven learnings staan aan (publiek + gecachet) ----------
  let smartFlags = null;
  try { const c = localStorage.getItem('jvo_smart_flags'); if (c) smartFlags = JSON.parse(c); } catch {}
  function smartOn(id) { return !smartFlags || smartFlags[id] !== false; }   // default AAN (beschermend)
  async function loadSmartFlags() {
    try {
      const r = await fetch('/api/smart/flags');
      if (r.ok) { const d = await r.json(); if (d && d.flags) { smartFlags = d.flags; try { localStorage.setItem('jvo_smart_flags', JSON.stringify(d.flags)); } catch {} } }
    } catch { /* offline → val terug op cache/default AAN */ }
  }
  loadSmartFlags();

  // ---------- Evenement-profiel — naam van het evenement voor deel-teksten ----------
  // Komt uit /api/config (admin-instelbaar), gecachet zodat delen ook offline klopt.
  // Nooit een vaste evenementnaam in de code: zonder profiel valt de tekst terug op
  // het neutrale "het toernooi".
  let EV = null;            // { name, withArticle }
  try { const c = localStorage.getItem('jvo_event_txt'); if (c) { const p = JSON.parse(c); if (p && p.name) EV = p; } } catch {}
  async function loadEventText() {
    try {
      const r = await fetch('/api/config');
      if (!r.ok) return;
      const d = await r.json();
      const e = d && d.event;
      if (!e || !e.name) return;
      EV = { name: String(e.name), withArticle: String(e.withArticle || e.name) };
      try { localStorage.setItem('jvo_event_txt', JSON.stringify(EV)); } catch {}
    } catch { /* offline → cache of de neutrale zin */ }
  }
  if (!SCREEN) loadEventText();   // het TV-scherm deelt niets
  const eventName = () => (EV && EV.name) || (DATA && DATA.event && DATA.event.name) || 'Toernooi';
  const eventWhere = () => (EV && EV.withArticle) ? `op ${EV.withArticle}` : 'op het toernooi';

  const ALL_POULES = ['A', 'B', 'C', 'D'];
  let PANES = ['overzicht', ...ALL_POULES, 'ko'];
  const PANE_NAME = { mijn: 'Mijn team', overzicht: 'Overzicht', A: 'Poule A', B: 'Poule B', C: 'Poule C', D: 'Poule D', ko: 'Knock-out' };
  // Which poules actually have teams (so a half-filled test tournament hides empties).
  const poulesPresent = () => (DATA && DATA.poules) ? ALL_POULES.filter(p => DATA.poules[p] && DATA.poules[p].standings.length) : ALL_POULES;
  // Rebuild the pane order from what's present, keeping "Mijn team" first and "ko" last.
  function rebuildPanes() {
    const base = ['overzicht', ...poulesPresent(), 'ko'];
    PANES = (MYTEAMS.length && !SCREEN) ? ['mijn', ...base] : base;
    if (!PANES.includes(activePane)) activePane = PANES[0];
    if (cycleIdx >= PANES.length) cycleIdx = 0;
  }
  // Vanaf hoeveel minuten verschuiving we de "→ verwacht"-pijl tonen. Bewuste
  // tiering met de rest van het systeem: <3 min = stil (server-hysterese houdt
  // dit ook al tegen), ≥3 min = zichtbaar op bord/kaart, ≥10 min = push naar
  // volgers (tijdwijziging-categorie, server-side).
  const EXP_SHOW_MIN = 3;
  // Planned time + field + (when running late) the live "verwacht" time.
  function timeMeta(m) {
    if (!m || !m.time) return '';
    const veld = m.field ? ` · Veld ${m.field}` : '';
    const late = m.expected && m.expected !== m.time && (m.delay || 0) >= EXP_SHOW_MIN && m.status !== 'done';
    const exp = late ? ` <span class="tn-exp">→ ${esc(m.expected)}</span>` : '';
    return `<span class="tn-time">${esc(m.time)}${veld}</span>${exp}`;
  }

  let DATA = null;
  let activePane = 'overzicht';     // app mode (tabs)
  let lastCenteredPane = null;      // so live re-renders don't yank the tab strip's scroll
  let cycleIdx = 0;         // screen mode
  let offset = 0;           // serverNow - clientNow
  let prevScores = null;    // matchId -> {a,b,nameA,nameB} for goal detection
  let firstLoad = true;
  let lastSyncTime = null;  // timestamp of the last successful data load
  let lastServerNow = 0;    // highest server_now seen — drops stale/out-of-order snapshots
  let MYTEAMS = [];         // [{ id, name, poule }] — teams the visitor follows (or a captain's team)
  const pouleFilter = {};   // poule letter → team name the schedule is filtered by (unset/null = all)
  let myIds = new Set(), myNames = new Set();
  const recomputeMine = () => { myIds = new Set(MYTEAMS.map(t => t.id)); myNames = new Set(MYTEAMS.map(t => t.name)); };
  // small inline icons (no emoji)
  const SVG_BELL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const SVG_X = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const SVG_SHARE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
  const SVG_TROPHY = '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v4a6 6 0 0 1-12 0V4z"/><path d="M6 6H4a2 2 0 0 0 0 4h2"/><path d="M18 6h2a2 2 0 0 1 0 4h-2"/><path d="M9 18h6"/><path d="M10 14.5V18"/><path d="M14 14.5V18"/><path d="M8 21h8"/></svg>';
  const SVG_CLOCK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  // personal team token lives in the hash (#team=<jwt>) so it stays out of logs
  function teamToken() {
    const h = (location.hash || '').replace(/^#/, '');
    for (const part of h.split('&')) { const [k, v] = part.split('='); if (k === 'team' && v) return decodeURIComponent(v); }
    return null;
  }

  const initPane = params.get('pane');
  if (PANES.includes(initPane)) { activePane = initPane; cycleIdx = PANES.indexOf(initPane); }

  if (SCREEN) document.body.classList.add('screen');

  // ---------- rendering ----------
  const isMine = (name) => !!name && myNames.has(name);

  function standRow(s, maxPts) {
    const pw = Math.round((s.pts / Math.max(1, maxPts || 0)) * 100);
    // Server marks qualification from the bracket seeds: 'direct' = straight to
    // the kwartfinale, 'playoff' = must win the play-off first, else out.
    const direct = s.qual === 'direct', playoff = s.qual === 'playoff';
    const out = !s.qual && s.pos >= 3;
    const me = myIds.has(s.id);
    const ds = (s.gd >= 0 ? '+' : '') + s.gd;
    const tag = playoff ? ' <span class="tn-potag">play-off</span>' : '';
    // Tik op een team = teamprofiel (stats, resultaten, feitjes). Niet op het
    // TV-scherm — daar valt niets te tikken.
    const clickable = SCREEN ? '' : ` data-profile="${s.id}" role="button" tabindex="0" aria-label="Bekijk het profiel van ${esc(s.name)}"`;
    return `
      <div class="tn-row ${direct ? 'q' : ''} ${playoff ? 'qpo' : ''} ${out ? 'out' : ''} ${me ? 'me' : ''}" data-tid="${s.id}"${clickable} style="--pw:${pw}%">
        <div class="tn-pos">${s.pos}</div>
        <div class="tn-name">
          <b>${logoHtml(s.logo, 20)}${esc(s.name)}${me ? ' <span class="tn-metag">jij</span>' : ''}${tag}</b>
          <div class="tn-sub">${s.gp} gesp · ${s.w}-${s.d}-${s.l} · DV ${s.gf} · DT ${s.ga} · <span class="ds">DS ${ds}</span></div>
        </div>
        <div class="tn-pts">${s.pts}<small>ptn</small></div>
      </div>`;
  }

  function matchRow(m) {
    const done = m.status === 'done', live = m.status === 'live';
    const aw = done && m.score_a > m.score_b, bw = done && m.score_b > m.score_a;
    const sc = (done || live) ? `${m.score_a ?? 0} – ${m.score_b ?? 0}` : 'nog niet';
    const me = isMine(m.a) || isMine(m.b);
    const meta = timeMeta(m);
    return `
      <div class="tn-match ${done ? '' : 'todo'} ${live ? 'live' : ''} ${me ? 'me' : ''}">
        <div class="ta ${aw ? 'win' : ''} ${isMine(m.a) ? 'mine' : ''}">${esc(m.a || '—')}${logoByName(m.a, 16)}</div>
        <div class="sc">${sc}</div>
        <div class="tb ${bw ? 'win' : ''} ${isMine(m.b) ? 'mine' : ''}">${logoByName(m.b, 16)}${esc(m.b || '—')}</div>
        ${meta ? `<div class="tn-match-meta">${meta}</div>` : ''}
      </div>`;
  }

  function poulePane(p) {
    const pl = DATA.poules[p];
    // Voorlopige stand: zolang hier een wedstrijd loopt telt de tussenstand
    // zichtbaar mee (server levert standings_live); de badge maakt dat expliciet.
    const rows = pl.standings_live || pl.standings;
    const provisional = !!pl.standings_live;
    const maxPts = Math.max(1, ...rows.map(s => s.pts));
    const stand = (provisional ? `<div class="tn-provisional"><span class="d"></span>Voorlopige stand — de tussenstand van de lopende wedstrijd telt mee</div>` : '') +
      (rows.map(s => standRow(s, maxPts)).join('') ||
      `<div class="tn-empty">Nog geen teams in deze poule.</div>`);

    // Team-filter for the schedule below. The chips are built from this poule's
    // teams; the active choice lives in pouleFilter[p] so it survives every live
    // re-render (SSE push / poll). A renamed team that no longer matches falls
    // back to "Alle".
    const teams = pl.standings.map(s => s.name);
    const active = (pouleFilter[p] && teams.includes(pouleFilter[p])) ? pouleFilter[p] : null;
    const chip = (label, team, on) =>
      `<button type="button" class="tn-fchip ${on ? 'on' : ''}" data-poule-filter="${p}" data-team="${team == null ? '' : esc(team)}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button>`;
    // No filter chips on the TV/broadcast view — nothing to tap there (matches the
    // non-interactive group cards on the same screen).
    const filterBar = (!SCREEN && teams.length > 1)
      ? `<div class="tn-filter" role="group" aria-label="Filter wedstrijden op team">${chip('Alle', null, !active)}${teams.map(t => chip(t, t, active === t)).join('')}</div>`
      : '';

    // results grouped by planned slot/round, optionally narrowed to one team
    const byRound = {};
    pl.matches.forEach(m => {
      if (active && m.a !== active && m.b !== active) return;
      (byRound[m.round] = byRound[m.round] || []).push(m);
    });
    const rounds = Object.keys(byRound).sort((a, b) => a - b).map(r => `
      <div class="tn-round">
        <div class="tn-round-h">Ronde ${r}</div>
        ${byRound[r].map(matchRow).join('')}
      </div>`).join('');
    const emptyMsg = active
      ? `<div class="tn-empty">Geen wedstrijden voor ${esc(active)}.</div>`
      : '<div class="tn-empty">Nog geen wedstrijden.</div>';

    return `
      <div class="tn-section-label"><span class="tn-gtile sm" aria-hidden="true">${p}</span>Stand — Poule ${p}</div>
      <div class="tn-stand">${stand}</div>
      <div class="tn-qnote"><span class="g">${SPORTHUB ? 'Blauw' : 'Groen'}</span> = direct door · <span class="o">oranje</span> = play-off om een laatste ticket · <span class="r">rood</span> = nu nog buiten. Zo staan ze nú — tijdens de poulefase kan dit nog veranderen. Gelijk? Doelsaldo, dan onderling resultaat.</div>
      <div class="tn-section-label"><span class="tn-gtile sm" aria-hidden="true">${p}</span>Wedstrijden — Poule ${p}</div>
      ${filterBar}
      ${rounds || emptyMsg}`;
  }

  function tieWinner(t) {
    if (t.status !== 'done' || t.score_a == null) return null;
    if (t.score_a > t.score_b) return 'a';
    if (t.score_b > t.score_a) return 'b';
    if (t.pens_a != null && t.pens_b != null) {
      if (t.pens_a > t.pens_b) return 'a';
      if (t.pens_b > t.pens_a) return 'b';
    }
    return null;
  }

  // Full label per knock-out tie.
  const BR_LABEL = { VR1: 'Play-off 1', VR2: 'Play-off 2', A1: 'Achtste finale 1', A2: 'Achtste finale 2', A3: 'Achtste finale 3', A4: 'Achtste finale 4', A5: 'Achtste finale 5', A6: 'Achtste finale 6', A7: 'Achtste finale 7', A8: 'Achtste finale 8', KF1: 'Kwartfinale 1', KF2: 'Kwartfinale 2', KF3: 'Kwartfinale 3', KF4: 'Kwartfinale 4', HF1: 'Halve finale 1', HF2: 'Halve finale 2', Finale: 'Finale', '3e/4e': 'Troostfinale · 3e/4e' };

  // ---------- teamlogo's (goedgekeurd; server levert ze op de stand-rijen) ----------
  let LOGO_BY_NAME = new Map(), LOGO_BY_ID = new Map();
  function rebuildLogoMaps() {
    LOGO_BY_NAME = new Map(); LOGO_BY_ID = new Map();
    for (const p of Object.keys((DATA && DATA.poules) || {})) {
      for (const s of DATA.poules[p].standings) {
        if (s.logo) { LOGO_BY_NAME.set(s.name, s.logo); LOGO_BY_ID.set(s.id, s.logo); }
      }
    }
  }
  const logoHtml = (logo, size, cls) => (logo && window.jvoLogo) ? window.jvoLogo.html(logo, size, cls || '') : '';
  const logoByName = (name, size) => logoHtml(LOGO_BY_NAME.get(name), size);
  const logoById = (id, size) => logoHtml(LOGO_BY_ID.get(id), size);

  function tie(t) {
    const w = tieWinner(t);
    const done = t.status === 'done';
    const live = t.status === 'live';
    const pens = (t.pens_a != null && t.pens_b != null)
      ? (live ? ` <span class="tn-pens live">n.p. bezig ${t.pens_a}–${t.pens_b}</span>` : ` <span class="tn-pens">(n.p. ${t.pens_a}–${t.pens_b})</span>`)
      : '';
    const sa = (done || live) ? (t.score_a ?? 0) : '–';
    const sb = (done || live) ? (t.score_b ?? 0) : '–';
    const isFinal = t.label === 'Finale';
    const lbl = BR_LABEL[t.label] || t.label;
    const sideRow = (side, won, score, withPens) => {
      const ph = !side.name;
      const c = `tr ${ph ? 'ph' : ''} ${won ? 'win' : ''}`;
      const lg = !ph && side.id ? logoById(side.id, 16) : '';
      const label = ph ? `<span>${esc(side.placeholder || '—')}</span>` : `<b>${lg}${esc(side.name)}</b>`;
      return `<div class="${c}">${label}<span class="gs">${score}${withPens ? pens : ''}</span></div>`;
    };
    const tag = live
      ? `<span class="lv">● live · <span class="clk" data-start="${t.started_at || ''}">--:--</span></span>`
      : (t.time ? `<span class="tn-tie-time">${timeMeta(t)}</span>` : '');
    return `
      <div class="tn-tie ${isFinal ? 'final' : ''} ${live ? 'live' : ''} ${done ? 'done' : ''}">
        <div class="tn-tie-lbl">${esc(lbl)}${tag}</div>
        ${sideRow(t.a, w === 'a', sa, true)}
        ${sideRow(t.b, w === 'b', sb, false)}
      </div>`;
  }

  // Bracket as columns per round: Voorronde → Kwartfinales → Halve finales →
  // Finale (+ troostfinale). On wide screens / TV the columns sit side by side;
  // on phones they stack top to bottom in this same order.
  const KO_COLS = [
    { title: 'Play-off',      labels: ['VR1', 'VR2'] },
    { title: 'Achtste finales', labels: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'] },
    { title: 'Kwartfinales',  labels: ['KF1', 'KF2', 'KF3', 'KF4'] },
    { title: 'Halve finales', labels: ['HF1', 'HF2'] },
    { title: 'Finale',        labels: ['Finale', '3e/4e'] },
  ];
  // Symmetric bracket: the two halves work inward to the central final. The
  // binary core is identical for all formats — KF1,KF2→HF1 (left), KF3,KF4→HF2
  // (right), HF1,HF2→Finale — with the play-off/achtste as outer feeders. Slots
  // are padded with nulls so every feeder lines up horizontally with the tie it
  // feeds (e.g. VR2→A1, A2→KF1), making the connector lines straight.
  function bracketColumns() {
    // Data-gedreven uit de labels die er écht zijn, zodat elke bracket-variant
    // (standaard met play-offs, 'iedereen-ko' met 8 achtste finales, 'compact-8'
    // met alleen kwartfinales) de juiste boom krijgt zonder format-aannames.
    const labels = new Set((DATA.knockout || []).map(k => k.label));
    const has = (l) => labels.has(l);
    const left = [], right = [];
    if (has('A5')) {
      // 8 achtste finales: A1/A2→KF1, A3/A4→KF2 (links); A5/A6→KF3, A7/A8→KF4.
      left.push({ round: 'r16', slots: ['A1', 'A2', 'A3', 'A4'], conn: 'merge' });
    } else if (has('A1')) {
      left.push({ round: 'pre', slots: [null, 'VR2'] });   // VR2 → A1 (bottom)
      left.push({ round: 'r16', slots: ['A2', 'A1'] });    // A2 → KF1, A1 → KF2
    } else if (has('VR2')) {
      left.push({ round: 'pre', slots: ['VR2', null] });   // VR2 → KF1 (top)
    }
    left.push({ round: 'qf', slots: ['KF1', 'KF2'] });
    left.push({ round: 'sf', slots: ['HF1'] });

    right.push({ round: 'sf', slots: ['HF2'] });
    right.push({ round: 'qf', slots: ['KF3', 'KF4'] });
    if (has('A5')) {
      right.push({ round: 'r16', slots: ['A5', 'A6', 'A7', 'A8'], conn: 'merge' });
    } else if (has('A1')) {
      right.push({ round: 'r16', slots: ['A4', 'A3'] });   // A4 → KF3, A3 → KF4
      right.push({ round: 'pre', slots: ['VR1', null] });  // VR1 → A4 (top)
    } else if (has('VR1')) {
      right.push({ round: 'pre', slots: [null, 'VR1'] });  // VR1 → KF4 (bottom)
    }
    return { left, right };
  }

  function koBracketSymmetric(byLabel) {
    const slot = (lbl) => (lbl && byLabel[lbl])
      ? `<div class="tn-slot tie">${tie(byLabel[lbl])}</div>`
      : `<div class="tn-slot empty" aria-hidden="true"></div>`;
    const col = (c) => `<div class="tn-col" data-conn="${c.conn || (c.round === 'qf' ? 'merge' : 'straight')}">${c.slots.map(slot).join('')}</div>`;
    const { left, right } = bracketColumns();
    const fin = byLabel['Finale'], third = byLabel['3e/4e'];
    // Only the final lives in the centre column (so it stays vertically centred,
    // in line with the two semis). The troostfinale hangs centred below the tree.
    const center = `<div class="tn-center">${fin ? `<div class="tn-slot tie center-final">${tie(fin)}</div>` : ''}</div>`;
    const thirdRow = third ? `<div class="tn-third-row">${tie(third)}</div>` : '';
    return `<div class="tn-bracket-wrap">
        <div class="tn-bracket">
          <div class="tn-half tn-left">${left.map(col).join('')}</div>
          ${center}
          <div class="tn-half tn-right">${right.map(col).join('')}</div>
        </div>
        ${thirdRow}
      </div>`;
  }

  // ---------- Ronde bracket (FIFA-stijl) — rondes van buiten naar binnen ----------
  // Extra weergave naast de boom (toggle, brede schermen): eerste KO-ronde aan
  // de buitenring, elke volgende ronde een ring dichter bij het midden, de
  // beker (en straks de kampioen) in het centrum. Verbindingslijnen volgen de
  // échte W:/L:-feeders uit de bracket-data, dus elke variant klopt vanzelf.
  let koView = (() => { try { return localStorage.getItem('jvo_ko_view') || 'boom'; } catch { return 'boom'; } })();
  // Eigen JVO-beker (goud met JVO-wordmerk) — vervangt het generieke bekertje.
  const TROPHY_BIG = '<svg viewBox="0 0 48 52" width="46" height="52" aria-hidden="true"><path d="M12 9H6.5a5.5 5.5 0 0 0 5.5 8.6" fill="none" stroke="#E88C1E" stroke-width="2.4" stroke-linecap="round"/><path d="M36 9h5.5a5.5 5.5 0 0 1-5.5 8.6" fill="none" stroke="#E88C1E" stroke-width="2.4" stroke-linecap="round"/><path d="M11 5h26v8a13 13 0 0 1-26 0z" fill="#FFB347" stroke="#B4701A" stroke-width="1" stroke-linejoin="round"/><ellipse cx="24" cy="5" rx="13" ry="2.3" fill="#FFD48A"/><text x="24" y="10" text-anchor="middle" dominant-baseline="central" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="8.4" fill="#0A1628">JVO</text><rect x="21.3" y="25.5" width="5.4" height="8" fill="#E88C1E"/><path d="M13.4 40l3.3-6.8h14.6L34.6 40z" fill="#FFB347" stroke="#B4701A" stroke-width="1" stroke-linejoin="round"/><rect x="11.3" y="39.6" width="25.4" height="4.9" rx="1.6" fill="#E88C1E"/></svg>';
  // Ronde bracket = badge-wheel: 16 teams als badges op de buitenring, rondes van
  // buiten naar binnen, gekleurde elleboog-connectoren, de JVO-beker in het hart, en
  // een DRAAI-schuif waarmee je het wiel draait — onderaan verschijnt de teamnaam
  // rechtop. Geport uit de ontwerp-artifact, gevoed met de echte bracket-data.
  let koRot = 0;
  const KO_PAL = ['#FFB347', '#FF6B1A', '#C4382E', '#6CE3A0', '#59C3FF', '#9D7BFF', '#FFD48A', '#FF7BAE'];
  const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase() || '?';
  const teamColor = (name) => { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return KO_PAL[h % KO_PAL.length]; };
  function wheelBadge(side, size, cls) {
    const ph = !side || !side.name;
    if (ph) return `<span class="tn-cbadge ph ${cls}" style="width:${size}px;height:${size}px"></span>`;
    const inner = (side.id != null && LOGO_BY_ID.has(side.id))
      ? logoById(side.id, size - 6)
      : `<span class="tn-cbadge-kit" style="background:${teamColor(side.name)}">${esc(initialsOf(side.name))}</span>`;
    return `<span class="tn-cbadge ${cls}" style="width:${size}px;height:${size}px" title="${esc(side.name)}">${inner}</span>`;
  }
  function koCircle(byLabel) {
    const ko = DATA.knockout || [];
    const phaseRings = ['pre', 'r16', 'qf', 'sf']
      .map(ph => ko.filter(k => k.label !== '3e/4e' && k.label !== 'Finale' && koPhaseOf(k.label) === ph)
        .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true })))
      .filter(r => r.length);
    const fin = byLabel['Finale'];
    const ringsTies = fin ? [...phaseRings, [fin]] : phaseRings;
    if (!ringsTies.length) return '';
    // Elke ring = de twee teams (a,b) per wedstrijd, in bracket-volgorde.
    const rings = ringsTies.map(ties => ties.flatMap(t => {
      const w = tieWinner(t);
      return [{ side: t.a, win: w === 'a' }, { side: t.b, win: w === 'b' }];
    }));
    const N = rings.length, S = 1000, C = 500, half = 500;
    const rfOf = (i) => N <= 1 ? 0.62 : 0.88 - i * (0.88 - 0.33) / (N - 1);
    const szOf = (i) => Math.round(30 + (N <= 1 ? 6 : i * (10 / (N - 1))));
    // Hoeken: buitenring gelijkverdeeld; binnenring = middelpunt van z'n feeder-paar
    // (schone binaire boom → 16→8→4→2). Anders: elke ring apart gelijkverdeeld.
    const clean = rings.every((r, i) => i === 0 || r.length === rings[i - 1].length / 2);
    const angs = [];
    const n0 = rings[0].length, step0 = 360 / n0;
    angs[0] = rings[0].map((_, i) => -90 + step0 / 2 + i * step0);
    for (let i = 1; i < N; i++) {
      if (clean) angs[i] = rings[i].map((_, j) => (angs[i - 1][2 * j] + angs[i - 1][2 * j + 1]) / 2);
      else { const st = 360 / rings[i].length; angs[i] = rings[i].map((_, j) => -90 + st / 2 + j * st); }
    }
    // Nodes (badges) — dragen hun hoek/radius + naam, zodat positionKOCircle ze bij
    // het draaien alleen hoeft te verplaatsen.
    let nodesHtml = '';
    rings.forEach((slots, i) => {
      slots.forEach((s, j) => {
        const cls = s.win ? (i === N - 1 ? 'champ' : 'win') : '';
        nodesHtml += `<div class="tn-cnpos" data-ang="${angs[i][j].toFixed(2)}" data-rf="${rfOf(i).toFixed(3)}" data-ring="${i}" data-nm="${esc(s.side && s.side.name || '')}">${wheelBadge(s.side, szOf(i), cls)}</div>`;
      });
    });
    // Gekleurde connectoren (alleen bij een schone boom): elleboog van elk paar naar
    // de winnaar-node in de volgende ring; binnenste ring → radiaal naar het centrum.
    let pathsHtml = '';
    if (clean) {
      for (let i = 0; i < N - 1; i++) rings[i + 1].forEach((_, j) => {
        const col = KO_PAL[(j * (i + 1)) % KO_PAL.length];
        [2 * j, 2 * j + 1].forEach(k => { pathsHtml += `<path data-ea="${angs[i][k]}" data-erfo="${rfOf(i)}" data-eb="${angs[i + 1][j]}" data-erfi="${rfOf(i + 1)}" stroke="${col}"/>`; });
      });
      rings[N - 1].forEach((_, j) => { pathsHtml += `<path data-ra="${angs[N - 1][j]}" data-rfo="${rfOf(N - 1)}" data-rfi="0.085" stroke="${KO_PAL[(j * 4) % KO_PAL.length]}"/>`; });
    }
    const circles = rings.map((_, i) => `<circle class="tn-cring" cx="${C}" cy="${C}" r="${(rfOf(i) * half).toFixed(1)}" />`).join('');
    const champ = fin && tieWinner(fin) ? (tieWinner(fin) === 'a' ? fin.a.name : fin.b.name) : null;
    const center = `<div class="tn-ccenter"><div class="cup ${champ ? 'won' : ''}">${TROPHY_BIG}</div>${champ ? `<div class="chn">${esc(champ)}</div><div class="chl">Kampioen</div>` : ''}</div>`;
    const third = byLabel['3e/4e'];
    const thirdNote = third ? `<div class="tn-cthird">Troostfinale: ${esc(third.a.name || third.a.placeholder || '—')} ${third.score_a != null ? third.score_a : ''}–${third.score_b != null ? third.score_b : ''} ${esc(third.b.name || third.b.placeholder || '—')}</div>` : '';
    const slider = SCREEN ? '' : `<div class="tn-rotrow"><span class="rl">Draai</span><input type="range" id="tn-rot" min="0" max="360" value="${koRot}" aria-label="Draai de bracket"><span class="rl" id="tn-rotval">${koRot}°</span></div>`;
    return `<div class="tn-circle-wrap">
      <div class="tn-circle" id="tn-wheel" role="img" aria-label="Knock-out als ronde bracket — teams als badges, rondes van buiten naar het midden">
        <svg class="tn-clines" viewBox="0 0 ${S} ${S}" aria-hidden="true">${circles}${pathsHtml}</svg>
        ${nodesHtml}<div class="tn-clabels" id="tn-clabels"></div>${center}
      </div>${slider}${thirdNote}</div>`;
  }
  // Positioneer alle badges + connectoren + onderaan-labels op basis van koRot.
  function positionKOCircle() {
    const wheel = document.getElementById('tn-wheel'); if (!wheel) return;
    const S = 1000, C = 500, half = 500;
    const pt = (a, rf) => { const r = (a + koRot) * Math.PI / 180; return [C + rf * half * Math.cos(r), C + rf * half * Math.sin(r)]; };
    wheel.querySelectorAll('.tn-cnpos').forEach(el => {
      const p = pt(+el.dataset.ang, +el.dataset.rf);
      el.style.left = (p[0] / S * 100).toFixed(3) + '%'; el.style.top = (p[1] / S * 100).toFixed(3) + '%';
    });
    wheel.querySelectorAll('.tn-clines path').forEach(el => {
      if (el.dataset.ea != null) {
        const angO = +el.dataset.ea, rfO = +el.dataset.erfo, angI = +el.dataset.eb, rfI = +el.dataset.erfi;
        const knee = rfI + (rfO - rfI) * 0.5, p1 = pt(angO, rfO), p2 = pt(angO, knee), p3 = pt(angI, knee), p4 = pt(angI, rfI);
        const kr = (knee * half).toFixed(1), d = (((angI - angO) % 360) + 360) % 360, sweep = d < 180 ? 1 : 0;
        el.setAttribute('d', `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} A${kr} ${kr} 0 0 ${sweep} ${p3[0].toFixed(1)} ${p3[1].toFixed(1)} L${p4[0].toFixed(1)} ${p4[1].toFixed(1)}`);
      } else if (el.dataset.ra != null) {
        const p = pt(+el.dataset.ra, +el.dataset.rfo), q = pt(+el.dataset.ra, +el.dataset.rfi);
        el.setAttribute('d', `M${p[0].toFixed(1)} ${p[1].toFixed(1)} L${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
      }
    });
    const labelsEl = document.getElementById('tn-clabels');
    if (labelsEl) {
      const ZONE = 60; let lab = '';
      wheel.querySelectorAll('.tn-cnpos[data-ring="0"]').forEach(el => {
        const nm = el.dataset.nm; if (!nm) return;
        const ang = +el.dataset.ang, rf = +el.dataset.rf;
        const sa = ((ang + koRot) % 360 + 360) % 360, dist = Math.abs(((sa - 90 + 540) % 360) - 180);
        if (dist > ZONE) return;
        const op = Math.max(0, 1 - dist / ZONE), pL = pt(ang, rf + 0.12);
        lab += `<div class="tn-tlabel" style="left:${(pL[0] / S * 100).toFixed(2)}%;top:${(pL[1] / S * 100).toFixed(2)}%;opacity:${op.toFixed(2)}">${esc(nm)}</div>`;
      });
      labelsEl.innerHTML = lab;
    }
  }

  function koPane() {
    const ko = DATA.knockout || [];
    if (!ko.length) return `<div class="tn-bracket-cols"><div class="tn-empty">De knock-out begint na de poulefase.</div></div>`;
    const byLabel = {};
    ko.forEach(k => { byLabel[k.label] = k; });
    // Vertical stacked columns on phones; the symmetric tree on wide screens / TV
    // (one is hidden by CSS at a time — see the .tn-bracket / .tn-bracket-cols rules).
    const TROPHY_SM = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v4a6 6 0 0 1-12 0V4z"/><path d="M6 6H4a2 2 0 0 0 0 4h2"/><path d="M18 6h2a2 2 0 0 1 0 4h-2"/><path d="M9 18h6"/><path d="M8 21h8"/></svg>';
    // Mobiel overzichtelijker: elke fase is een inklapbare sectie. Volledig
    // gespeelde fases (behalve de finale-kolom) klappen vanzelf dicht, zodat
    // de lijst niet ellenlang wordt — de kop blijft de voortgang tonen.
    const cols = KO_COLS.map(c => {
      const ties = c.labels.map(l => byLabel[l]).filter(Boolean);
      if (!ties.length) return '';
      const isFinal = c.labels.includes('Finale');
      const doneN = ties.filter(t => t.status === 'done').length;
      const openAttr = (doneN === ties.length && !isFinal) ? '' : ' open';
      const head = `<span class="tn-kotile" aria-hidden="true">${isFinal ? TROPHY_SM : ties.length}</span>${c.title}<span class="tn-koprog">${doneN}/${ties.length} gespeeld</span>`;
      return `<details class="tn-ko-col"${openAttr}><summary class="tn-ko-col-h">${head}<svg class="tn-kochev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></summary>${ties.map(tie).join('')}</details>`;
    }).join('');
    // Weergave-schakelaar (alleen brede schermen; op mobiel gelden de kolommen
    // hieronder en op het TV-scherm blijft de boom vast staan).
    const toggle = SCREEN ? '' : `
      <div class="tn-koview" role="group" aria-label="Weergave van de knock-out">
        <button type="button" class="${koView === 'boom' ? 'on' : ''}" data-koview="boom" aria-pressed="${koView === 'boom'}">Boom</button>
        <button type="button" class="${koView === 'cirkel' ? 'on' : ''}" data-koview="cirkel" aria-pressed="${koView === 'cirkel'}">Cirkel</button>
      </div>`;
    const wide = (!SCREEN && koView === 'cirkel') ? koCircle(byLabel) : koBracketSymmetric(byLabel);
    return `${championBanner()}${toggle}${wide}<div class="tn-bracket-cols">${cols}</div>`;
  }

  // ---------- "Mijn team(s)" pane — one block per followed team ----------
  const KO_NICE = { VR1:'Play-off', VR2:'Play-off', A1:'Achtste finale', A2:'Achtste finale', A3:'Achtste finale', A4:'Achtste finale', A5:'Achtste finale', A6:'Achtste finale', A7:'Achtste finale', A8:'Achtste finale', KF1:'Kwartfinale', KF2:'Kwartfinale', KF3:'Kwartfinale', KF4:'Kwartfinale', HF1:'Halve finale', HF2:'Halve finale', Finale:'Finale', '3e/4e':'Troostfinale' };

  function teamMatches(team) {
    const out = [];
    const pick = (m) => ({ time: m.time, field: m.field, expected: m.expected, delay: m.delay, status: m.status, expMs: m.expMs });
    if (team.poule && DATA.poules[team.poule]) for (const m of DATA.poules[team.poule].matches) {
      if (m.a === team.name || m.b === team.name) out.push({ id: m.id, where: `Ronde ${m.round}`, a: m.a, b: m.b, score_a: m.score_a, score_b: m.score_b, started_at: m.started_at, ...pick(m) });
    }
    for (const k of (DATA.knockout || [])) {
      const an = k.a.name || k.a.placeholder, bn = k.b.name || k.b.placeholder;
      if (k.a.name === team.name || k.b.name === team.name) out.push({ id: 'k' + k.id, label: k.label, where: KO_NICE[k.label] || k.label, a: an, b: bn, score_a: k.score_a, score_b: k.score_b, pens_a: k.pens_a, pens_b: k.pens_b, started_at: k.started_at, ko: true, ...pick(k) });
    }
    return out;
  }
  // "Ronde X · 15:30 · Veld 2" style location line for a followed-team match.
  const whereWithTime = (m) => {
    const veld = m.field ? `Veld ${m.field}` : '';
    const t = m.time ? (m.expected && m.expected !== m.time && (m.delay || 0) >= EXP_SHOW_MIN && m.status !== 'done' ? `${m.time} → ${m.expected}` : m.time) : '';
    return [m.where, t, veld].filter(Boolean).join(' · ');
  };

  function teamResultRow(team, m) {
    const mineA = m.a === team.name;
    const opp = mineA ? m.b : m.a;
    const done = m.status === 'done', live = m.status === 'live';
    const mine = mineA ? m.score_a : m.score_b, theirs = mineA ? m.score_b : m.score_a;
    let res = '', cls = '';
    if (done) { res = mine > theirs ? 'W' : (mine < theirs ? 'V' : 'G'); cls = mine > theirs ? 'win' : (mine < theirs ? 'loss' : 'draw'); }
    const sc = (m.score_a != null) ? `${mine}–${theirs}` : '';
    return `
      <div class="tn-myrow ${live ? 'live' : ''}">
        <div class="tn-myres ${cls}">${live ? '●' : (res || '–')}</div>
        <div class="tn-myopp"><span class="vs">vs</span> ${esc(opp)}<div class="tn-mywhere">${esc(whereWithTime(m))}</div></div>
        <div class="tn-mysc ${live ? 'live' : ''}">${live ? `${sc} · <span class="clk" data-start="${m.started_at || ''}">--:--</span>` : (sc || '—')}</div>
      </div>`;
  }

  // De volgende-wedstrijd-kaart als state-machine. Les van editie 1: een
  // groepswinnaar wiens poule klaar was zag "Alle wedstrijden gespeeld." —
  // precies het team dat 1,5 uur zat te wachten. Nu dekt elke toestand een
  // eerlijk verhaal: live / hierna (mét countdown) / poule klaar & wachten op
  // de bracket (via s.ko_next van de server) / klaar-poulefase / klaar-KO.
  function teamNextCard(team, list, me) {
    const upcoming = list.filter(m => m.status !== 'done');
    const next = upcoming.find(m => m.status === 'live') || upcoming[0];
    if (next) {
      const mineA = next.a === team.name;
      const opp = mineA ? next.b : next.a;
      const mine = mineA ? next.score_a : next.score_b, theirs = mineA ? next.score_b : next.score_a;
      if (next.status === 'live') {
        return `<div class="tn-next live">
          <div class="tn-next-tag"><span class="d"></span>nu live</div>
          <div class="tn-next-vs"><b>${esc(team.name)}</b> <span class="s">${mine}–${theirs}</span> ${esc(opp)}</div>
          <div class="tn-next-meta">${esc(whereWithTime(next))} · <span class="clk" data-start="${next.started_at || ''}">--:--</span></div>
        </div>`;
      }
      // Countdown op de verwachte aftrap (expMs is er pas als de dag geankerd
      // is door de eerste echte aftrap; daarvoor tonen we "gepland HH:MM").
      const eta = next.expMs != null
        ? `<span class="tn-next-eta" data-expms="${next.expMs}">over ~? min</span>`
        : (next.time ? `<span class="tn-next-eta plan">gepland ${esc(next.time)}</span>` : '');
      return `<div class="tn-next">
        <div class="tn-next-tag">hierna</div>
        <div class="tn-next-vs"><b>${esc(team.name)}</b> <span class="vs">vs</span> ${esc(opp)}</div>
        <div class="tn-next-meta">${esc(whereWithTime(next))} ${eta}</div>
      </div>`;
    }
    // Geen eigen wedstrijd meer in de lijst. KO gespeeld → eindverhaal.
    const lastKo = [...list].reverse().find(m => m.ko && m.status === 'done');
    if (lastKo) {
      const mineA = lastKo.a === team.name;
      const mine = mineA ? lastKo.score_a : lastKo.score_b, theirs = mineA ? lastKo.score_b : lastKo.score_a;
      const mp = mineA ? lastKo.pens_a : lastKo.pens_b, tp = mineA ? lastKo.pens_b : lastKo.pens_a;
      const won = mine > theirs || (mine === theirs && mp != null && tp != null && mp > tp);
      let txt, cls = 'done';
      if (lastKo.label === 'Finale') { txt = won ? 'Kampioenen!' : 'Tweede van het toernooi — wat een dag!'; cls = won ? 'champ' : 'done'; }
      else if (lastKo.label === '3e/4e') { txt = won ? 'Derde van het toernooi!' : 'Vierde van het toernooi — knap gespeeld!'; }
      else { txt = `Uitgeschakeld in de ${KO_NICE[lastKo.label] ? KO_NICE[lastKo.label].toLowerCase() : 'knock-out'} — bedankt voor het spelen!`; }
      return `<div class="tn-next ${cls}"><div class="tn-next-vs">${esc(txt)}${cls === 'champ' ? ' ' + TROPHY : ''}</div><div class="tn-next-meta">Bekijk de uitslagen hieronder.</div></div>`;
    }
    // Poule klaar, bracket-plek bekend maar nog niet op naam: vertel wél al
    // welke wedstrijd (tijd + veld) er bij deze stand wacht.
    if (me && me.ko_next) {
      const tie = (DATA.knockout || []).find(k => k.label === me.ko_next);
      const roundName = KO_NICE[me.ko_next] ? KO_NICE[me.ko_next].toLowerCase() : 'knock-out';
      const when = tie && tie.time ? ` · verwacht ${esc(tie.expected || tie.time)}${tie.field ? ` · veld ${tie.field}` : ''}` : '';
      const definitief = DATA.group_complete ? '' : ' Definitief zodra alle poules klaar zijn.';
      return `<div class="tn-next wait">
        <div class="tn-next-tag">poule klaar</div>
        <div class="tn-next-vs">Bij deze stand spelen jullie straks de <b>${esc(roundName)}</b></div>
        <div class="tn-next-meta">${esc(me.ko_next)}${when}.${esc(definitief)}</div>
      </div>`;
    }
    if (!DATA.group_complete) {
      return `<div class="tn-next wait"><div class="tn-next-vs">Poulewedstrijden gespeeld.</div><div class="tn-next-meta">Even afwachten wat de andere poules doen — de stand kan nog schuiven.</div></div>`;
    }
    return `<div class="tn-next done"><div class="tn-next-vs">Jullie zitten erop — bedankt voor het spelen!</div><div class="tn-next-meta">Bekijk de uitslagen hieronder.</div></div>`;
  }

  function teamSection(team) {
    const poule = team.poule;
    const stand = (poule && DATA.poules[poule]) ? DATA.poules[poule].standings : [];
    const me = stand.find(s => s.id === team.id);
    const list = teamMatches(team);
    let badge = '', bcls = '';
    if (me) {
      const playoff = me.qual === 'playoff';
      if (DATA.group_complete) {
        if (me.qual === 'direct') { badge = 'Door naar de knock-out!'; bcls = 'go'; }
        else if (playoff) { badge = 'Door naar de play-off!'; bcls = 'go'; }
        else { badge = 'De poulefase zit erop — bedankt voor het spelen!'; bcls = 'out'; }
      } else if (me.qual === 'direct') {
        badge = 'Op koers voor de knock-out (beste 2)'; bcls = 'go';
      } else if (playoff) {
        badge = 'Op koers voor een play-off-ticket'; bcls = 'go';
      } else {
        // Gap to the lowest currently-qualifying team in this poule (works for
        // every format — the qualification cut differs per opzet).
        const qualified = stand.filter(s => s.qual);
        const cutoff = qualified.length ? qualified[qualified.length - 1] : null;
        const gap = cutoff ? (cutoff.pts - me.pts) : 0;
        badge = gap > 0 ? `Nog ${gap} ${gap === 1 ? 'punt' : 'punten'} tot een ticket` : 'Net buiten — knokken voor een ticket!';
        bcls = 'chase';
      }
    }
    return `
      <div class="tn-teamblock">
        <div class="tn-hero">
          <div class="tn-hero-eyebrow">Mijn team · Poule ${esc(poule || '?')}</div>
          <div class="tn-hero-name">${esc(team.name)}</div>
          ${me ? `<div class="tn-hero-stat"><span class="big">${me.pos}<sup>e</sup></span> in de poule · <b>${me.pts}</b> ptn · DV ${me.gf} · DT ${me.ga} · DS ${me.gd >= 0 ? '+' : ''}${me.gd}</div>` : `<div class="tn-hero-stat">Klaar voor het toernooi.</div>`}
          ${badge ? `<div class="tn-hero-badge ${bcls}">${badge}</div>` : ''}
          <button type="button" class="tn-hero-statsbtn" data-profile="${team.id}">Statistieken &amp; weetjes ↗</button>
        </div>
        <div class="tn-section-label">Volgende wedstrijd</div>
        ${teamNextCard(team, list, me)}
        ${teamForwardPath(team, me)}
        <div class="tn-section-label">Wedstrijden</div>
        <div class="tn-mylist">${list.map(m => teamResultRow(team, m)).join('') || '<div class="tn-empty">Schema komt eraan.</div>'}</div>
      </div>`;
  }

  function mijnPane() {
    if (!MYTEAMS.length) return `<div class="tn-empty">Volg een team om hier je persoonlijke overzicht te zien.</div>`;
    return MYTEAMS.map(teamSection).join('');
  }

  // ---------- "Overzicht" pane — the dashboard landing ----------
  // Maps a knock-out tie label to its phase bucket, used by the phase ribbon.
  // The troostfinale ('3e/4e') gets its OWN bucket so it never counts toward the
  // 'final' phase — otherwise the ribbon would only reach "champion" once the
  // 3e/4e is also done, even though the title is already decided by the Finale.
  const koPhaseOf = (label) => label === '3e/4e' ? 'third'
    : label.startsWith('VR') ? 'pre'
    : label.startsWith('A') ? 'r16'
    : label.startsWith('KF') ? 'qf'
    : label.startsWith('HF') ? 'sf' : 'final';
  const PHASE_STEPS = [
    { key: 'group', title: 'Poules' }, { key: 'pre', title: 'Play-off' },
    { key: 'r16', title: 'Achtste' }, { key: 'qf', title: 'Kwart' },
    { key: 'sf', title: 'Halve' }, { key: 'final', title: 'Finale' },
  ];
  const koByLabel = () => { const m = {}; (DATA.knockout || []).forEach(k => { m[k.label] = k; }); return m; };

  // Which phase is "now": the group while it's running, else the earliest KO
  // round that still has an unfinished tie; 'champion' once the final is done.
  function currentPhaseKey() {
    if (!DATA.group_complete) return 'group';
    const ko = DATA.knockout || [];
    if (!ko.length) return 'group';
    for (const ph of ['pre', 'r16', 'qf', 'sf', 'final']) {
      const ties = ko.filter(k => koPhaseOf(k.label) === ph);
      if (ties.length && ties.some(k => k.status !== 'done')) return ph;
    }
    return 'champion';
  }

  function phaseRibbon() {
    // De weg vooruit staat in de gegenereerde bracket zelf (template-rijen
    // bestaan vanaf generate), dus lees de fases uit de labels — zo kloppen ook
    // varianten zonder play-off ('iedereen-ko') of zonder achtste ('compact-8').
    const labels = (DATA.knockout || []).map(k => k.label);
    const hasAchtste = labels.some(l => /^A\d/.test(l));
    const hasPre = labels.some(l => l.startsWith('VR'));
    const steps = PHASE_STEPS.filter(s =>
      (s.key !== 'r16' || hasAchtste) && (s.key !== 'pre' || hasPre || !labels.length));
    const cur = currentPhaseKey();
    const curIdx = cur === 'champion' ? steps.length : steps.findIndex(s => s.key === cur);
    return `<div class="tn-ribbon">${steps.map((s, i) => {
      const state = i < curIdx ? 'done' : i === curIdx ? 'now' : 'next';
      return `<div class="tn-rib ${state}"><span class="tn-rib-dot"></span><span class="tn-rib-t">${s.title}</span></div>`;
    }).join('')}</div>`;
  }

  // ---------- net-bord-09: "Het pad van je team" — de weg naar de finale ----------
  // Eerlijk-conditioneel: alleen de eerstvolgende KO-ronde concreet (tijd/veld), de
  // rest 'bij winst', met de finale als bestemming. Alleen als het team op koers of
  // geplaatst is (me.ko_next) én er een echte meerstaps-route is. Statisch (geen
  // entree-animatie): de Mijn-pane herbouwt bij elke poule-score, en we willen niet
  // dat het pad dan telkens opnieuw inflitst. Alle namen/velden ge-esc().
  const PATH_ROUND = { pre: 'Play-off', r16: 'Achtste finale', qf: 'Kwartfinale', sf: 'Halve finale', final: 'Finale' };
  function teamForwardPath(team, me) {
    if (SCREEN || !smartOn('net-bord-09')) return '';
    const ko = DATA.knockout || [];
    if (!ko.length || !me || !me.ko_next) return '';   // geen KO / niet op koers → geen pad
    const ORDER = ['pre', 'r16', 'qf', 'sf', 'final'];
    const present = ORDER.filter(ph => ko.some(k => koPhaseOf(k.label) === ph));
    const startIdx = present.indexOf(koPhaseOf(me.ko_next));
    if (startIdx < 0) return '';
    const routePhases = present.slice(startIdx);
    if (routePhases.length < 2) return '';             // alleen finale over → teamNextCard vertelt dat al
    const byLabel = koByLabel();
    const entryTie = byLabel[me.ko_next];
    const finaleTie = byLabel['Finale'];
    const whenOf = (tie) => {
      if (!tie) return '';
      if (tie.expMs != null) return `<span class="tn-next-eta" data-expms="${tie.expMs}">over ~? min</span>`;
      if (tie.time) return `verwacht ${esc(tie.expected || tie.time)}`;
      return '';
    };
    const veldOf = (tie) => (tie && tie.field) ? `veld ${esc(String(tie.field))}` : '';
    const metaOf = (tie) => [whenOf(tie), veldOf(tie)].filter(Boolean).join(' · ');
    const stepsHtml = routePhases.map((ph, i) => {
      const isFirst = i === 0, isFinal = ph === 'final';
      const meta = isFirst ? metaOf(entryTie) : (isFinal ? metaOf(finaleTie) : '');
      const state = isFirst ? 'now' : 'next';
      const cond = isFirst ? '' : '<span class="tn-path-cond">bij winst</span>';
      return `<li class="tn-path-step ${state}${isFinal ? ' fin' : ''}">
        <span class="tn-path-dot"></span>
        <span class="tn-path-body">
          <span class="tn-path-round">${esc(PATH_ROUND[ph] || ph)}${isFinal ? ' ' + TROPHY : ''}</span>
          ${cond}${meta ? `<span class="tn-path-meta">${meta}</span>` : ''}
        </span>
      </li>`;
    }).join('');
    const projected = !DATA.group_complete;
    const lead = projected
      ? 'Bij deze stand loopt jullie weg zo — <span class="tn-path-hedge">definitief zodra alle poules klaar zijn.</span>'
      : 'Jullie weg naar de finale:';
    return `
      <div class="tn-section-label">Het pad naar de finale</div>
      <div class="tn-path" role="group" aria-label="Het pad van je team">
        <div class="tn-path-head"><span class="tn-path-mark">${JVS_DOVE}</span><span class="tn-path-lead">${lead}</span></div>
        <ol class="tn-path-list">${stepsHtml}</ol>
      </div>`;
  }

  // Every not-yet-started match (poule + knock-out), in chronological slot order.
  // Match status is 'scheduled' | 'live' | 'done' — "not started" = neither live
  // nor done (the safe negative form also covers any future status value).
  function allUpcoming() {
    const notStarted = (s) => s !== 'done' && s !== 'live';
    const out = [];
    for (const p of poulesPresent()) for (const m of DATA.poules[p].matches) {
      if (notStarted(m.status) && m.slot != null) out.push({ slot: m.slot, time: m.time, expected: m.expected, delay: m.delay, field: m.field, where: `Poule ${p} · R${m.round}`, a: m.a, b: m.b, expMs: m.expMs });
    }
    for (const k of (DATA.knockout || [])) {
      if (notStarted(k.status) && k.slot != null) out.push({ slot: k.slot, time: k.time, expected: k.expected, delay: k.delay, field: k.field, where: KO_NICE[k.label] || k.label, a: k.a.name || k.a.placeholder, b: k.b.name || k.b.placeholder, ko: true, expMs: k.expMs });
    }
    out.sort((x, y) => x.slot - y.slot);
    return out;
  }

  function upCard(m) {
    const late = m.expected && m.expected !== m.time && (m.delay || 0) >= EXP_SHOW_MIN;
    const t = m.time ? `${esc(m.time)}${late ? ` <span class="tn-exp">→ ${esc(m.expected)}</span>` : ''}` : '—';
    const veld = m.field ? `<span class="tn-up-field"><span class="tn-sep"> · </span>Veld ${esc(String(m.field))}</span>` : '';
    return `
      <div class="tn-up"${m.expMs ? ` data-expms="${m.expMs}"` : ''}>
        <div class="tn-up-time">${t}</div>
        <div class="tn-up-mid">
          <div class="tn-up-vs"><span class="${isMine(m.a) ? 'mine' : ''}">${esc(m.a || '—')}</span><i>vs</i><span class="${isMine(m.b) ? 'mine' : ''}">${esc(m.b || '—')}</span></div>
          <div class="tn-up-where">${esc(m.where)}${veld}</div>
        </div>
      </div>`;
  }

  function upNextSection() {
    const up = allUpcoming().slice(0, 4);
    if (!up.length) return '';
    return `<div class="tn-section-label">Straks</div><div class="tn-upnext">${up.map(upCard).join('')}</div>`;
  }

  // Groepen A–D — every team in its poule, so anyone can find their own group at a
  // glance. Colour-coding matches the standings legend (green = direct through,
  // orange = play-off, red = out) — the server marks s.qual from the bracket seeds
  // (a live projection during the group phase). In app mode the whole card is a
  // button that jumps to that poule's tab (full standings + schedule); on the TV /
  // screen view it renders as a plain, non-interactive card.
  function pouleGroups() {
    const ps = poulesPresent();
    if (!ps.length) return '';
    const cards = ps.map(p => {
      // Voorlopige stand ook op de groepskaarten (live tussenstand telt mee).
      const stand = DATA.poules[p].standings_live || DATA.poules[p].standings;
      const liveNow = !!DATA.poules[p].standings_live;
      const mineHere = stand.some(s => myIds.has(s.id));
      // Live mini-balkje per rij: puntenaandeel t.o.v. de koploper van de groep
      // (via --pw), zodat de groepskaart een klein staafdiagram wordt dat met de
      // dag meegroeit. Bij 0-0 (voor de aftrap) blijft alles leeg.
      const maxPts = Math.max(1, ...stand.map(s => s.pts));
      const rows = stand.map(s => {
        const out = !s.qual && s.pos >= 3;
        const cls = s.qual === 'direct' ? 'q' : s.qual === 'playoff' ? 'qpo' : (out ? 'out' : '');
        const mine = myIds.has(s.id);
        const me = mine ? ' <span class="tn-metag">jij</span>' : '';
        const pw = Math.round((s.pts / maxPts) * 100);
        return `<div class="tn-gteam ${cls} ${mine ? 'me' : ''}" style="--pw:${pw}%"><span class="tn-gpos">${s.pos}</span><span class="tn-gname">${logoHtml(s.logo, 15)}${esc(s.name)}${me}</span><span class="tn-gpts">${s.pts}<small>p</small></span></div>`;
      }).join('') || `<div class="tn-gteam ph"><span class="tn-gname">Nog geen teams</span></div>`;
      const head = `<div class="tn-gcard-h"><span class="tn-gtile" aria-hidden="true">${p}</span><span class="tn-gtitle">Groep ${p}</span>${liveNow ? '<span class="tn-gprov">voorlopig</span>' : ''}${mineHere ? '<span class="tn-ghere">jouw groep</span>' : ''}<span class="tn-gcount">${stand.length} team${stand.length === 1 ? '' : 's'}</span></div>`;
      const body = `${head}<div class="tn-gteams">${rows}</div><span class="tn-gwm" aria-hidden="true">${p}</span>`;
      // App mode: the whole card is mouse-clickable (delegated via data-goto-poule),
      // but the accessible control is a real <button> INSIDE it — so the standings
      // stay first-class readable content for screen readers instead of being
      // swallowed by a wrapping button's accessible name. TV/screen: a plain,
      // non-interactive card.
      return SCREEN
        ? `<div class="tn-gcard ${mineHere ? 'me' : ''}">${body}</div>`
        : `<div class="tn-gcard clickable ${mineHere ? 'me' : ''}" data-goto-poule="${p}">${body}<button type="button" class="tn-gcta" data-goto-poule="${p}" aria-label="Bekijk het wedstrijdschema van groep ${p}">Bekijk schema →</button></div>`;
    }).join('');
    const hint = SCREEN ? '' : '<div class="tn-ghint">Tik op een groep voor het volledige wedstrijdschema — daar filter je ook per team.</div>';
    return `<div class="tn-section-label">Groepen</div>${hint}<div class="tn-ggrid" style="--cols:${ps.length}">${cards}</div>`;
  }

  // Crowned champion banner once the final is decided (also reused atop the KO pane).
  function championBanner() {
    const fin = koByLabel()['Finale'];
    if (!fin || fin.status !== 'done') return '';
    const w = tieWinner(fin);
    if (!w) return '';
    const champ = w === 'a' ? fin.a.name : fin.b.name;
    const runner = w === 'a' ? fin.b.name : fin.a.name;
    // Orient the scoreline to the champion (winner's goals first), so "wint 3–2"
    // reads correctly even when team B won.
    const cs = w === 'a' ? fin.score_a : fin.score_b;
    const rs = w === 'a' ? fin.score_b : fin.score_a;
    const cp = w === 'a' ? fin.pens_a : fin.pens_b;
    const rp = w === 'a' ? fin.pens_b : fin.pens_a;
    const pens = (fin.pens_a != null && fin.pens_b != null) ? ` (n.p. ${cp}–${rp})` : '';
    return `
      <div class="tn-champ ${isMine(champ) ? 'me' : ''}">
        <div class="tn-champ-crown">${SVG_TROPHY}</div>
        <div class="tn-champ-eyebrow">Kampioen</div>
        <div class="tn-champ-name jvo-kwipe fx-in"><span>${esc(champ || '—')}</span></div>
        <div class="tn-champ-sub">wint de finale ${esc(`${cs}–${rs}`)}${esc(pens)} van ${esc(runner || '—')}</div>
      </div>`;
  }

  // The finale as a hero teaser while it's still to be played/decided.
  function finaleTeaser() {
    const fin = koByLabel()['Finale'];
    if (!fin || fin.status === 'done') return '';
    return `<div class="tn-section-label">De finale</div><div class="tn-bracket-cols tn-overview-final">${tie(fin)}</div>`;
  }

  // Plain-language "how does advancing work" — adapts to the running format
  // (16/18/20). Verified against the KNOCKOUT_8/18/20 brackets in tournament.js.
  // Dots match the standings legend: green = through, orange = play-off, red = out.
  // Team count + poule layout come from the LIVE data: the chosen format fixes
  // the bracket shape, not the entrant count — odd counts (17 → 5/4/4/4) run
  // fine, so the copy must never claim "20 teams" when there are 17.
  function formatExplainer() {
    const fmt = (DATA && DATA.ko_format) || '16';
    const li = (dot, pos, text) => `<li><span class="dot ${dot}"></span><span><span class="pos">${esc(pos)}</span> — ${esc(text)}</span></li>`;
    const ps = poulesPresent();
    const sizes = (DATA && DATA.poules) ? ps.map(p => DATA.poules[p].standings.length).filter(n => n > 0) : [];
    const N = sizes.reduce((a, b) => a + b, 0) || Number(fmt);
    const uniform = sizes.length > 0 && sizes.every(s => s === sizes[0]);
    const layout = sizes.length ? (uniform ? `${sizes.length} poules van ${sizes[0]}` : `poules van ${sizes.join('/')}`) : '';
    const head = `${N} teams${layout ? ' · ' + layout : ''}. Iedereen speelt één keer tegen elke ploeg in de poule. Daarna gaat het zo:`;
    // Teams still in the race after the poules (direct + play-off spots) per
    // bracket: KNOCKOUT_8 → 6+4, KNOCKOUT_18/20 → 10+4. The rest is done.
    const variant = (DATA && DATA.ko_variant) || 'standaard';
    const door = fmt === '16' ? 10 : 14;
    const af = Math.max(0, N - door);
    let rows, path, chips;
    // Varianten van het 18-format hebben een eigen verhaal (geen play-off,
    // andere aantallen) — de standaardtekst zou hier gewoon fout zijn.
    if (fmt === '18' && variant === 'iedereen-ko') {
      const doorV = Math.min(16, N);
      chips = [`${doorV} gaan door`, `${Math.max(0, N - doorV)} vallen af`, '16 in de achtste finale', '8 in de kwartfinale'];
      rows = [
        li('g', 'Top 5 van je poule', 'gaat direct door naar de achtste finales.'),
        li('o', 'Nummer 6', 'de beste nummer 6 (over alle poules) gaat óók door — bijna iedereen speelt knock-out.'),
        li('r', 'De rest', 'is klaar na de poulefase.'),
      ];
      path = 'Poules → <b>achtste finale</b> → kwartfinale → halve finale → <b>finale</b>';
    } else if (fmt === '18' && variant === 'compact-8') {
      chips = ['8 gaan door', `${Math.max(0, N - 8)} vallen af`, '8 in de kwartfinale'];
      rows = [
        li('g', 'Top 2 van je poule', 'gaat direct door naar de kwartfinale.'),
        li('o', 'Beste nummers 3', 'de 2 beste nummers 3 (over alle poules) gaan ook door.'),
        li('r', 'De rest', 'is klaar na de poulefase.'),
      ];
      path = 'Poules → <b>kwartfinale</b> → halve finale → <b>finale</b> (+ duel om plek 3)';
    } else if (fmt === '18') {
      chips = [`${door} gaan door`, `${af} vallen af`, '8 in de achtste finale', '8 in de kwartfinale'];
      rows = [
        li('g', 'Top 3 van je poule', 'gaat direct door naar de knock-out.'),
        li('o', 'Nummer 4 & 5', 'de beste nummer 4 gaat ook door; de overige nummers 4 en de 2 beste nummers 5 spelen eerst een play-off om de laatste tickets.'),
        li('r', 'De rest', 'is klaar na de poulefase.'),
      ];
      path = 'Poules → <b>play-off</b> → achtste finale → kwartfinale → halve finale → <b>finale</b>';
    } else if (fmt === '20') {
      chips = [`${door} gaan door`, `${af} vallen af`, '8 in de achtste finale', '8 in de kwartfinale'];
      rows = [
        li('g', '1e in je poule', 'rechtstreeks naar de kwartfinale — je slaat de achtste finale over!'),
        li('g', '2e in je poule', 'door naar de achtste finale.'),
        li('o', '3e in je poule', 'de 2 beste nummers 3 gaan naar de achtste finale; de andere 2 spelen eerst een play-off.'),
        li('o', 'Beste nummers 4', 'de 2 beste nummers 4 spelen mee in de play-off om de laatste plekken.'),
        li('r', 'De rest', 'is klaar na de poulefase.'),
      ];
      path = 'Poules → <b>play-off</b> → achtste finale → kwartfinale → halve finale → <b>finale</b>';
    } else {
      chips = [`${door} gaan door`, `${af} vallen af`, '8 in de kwartfinale'];
      // In een poule groter dan 4 bestaat er ook een nummer 5 (of lager) — die is
      // dan net zo goed klaar, dus benoem "en lager" zodra een poule >4 teams heeft.
      const deeper = sizes.some(s => s > 4);
      rows = [
        li('g', '1e in je poule', 'direct door naar de kwartfinale.'),
        li('g', '2e in je poule', 'door naar de kwartfinale — de 2 ‘laagste’ nummers 2 spelen eerst nog een korte play-off.'),
        li('o', 'Beste nummers 3', 'de 2 beste nummers 3 (over alle poules) krijgen via de play-off nog een kans.'),
        li('r', deeper ? 'Nummer 4 en lager & de overige nummers 3' : 'Nummer 4 & de overige nummers 3', 'zijn klaar na de poulefase.'),
      ];
      path = 'Poules → <b>play-off</b> → kwartfinale → halve finale → <b>finale</b> (+ duel om plek 3)';
    }
    const intro = head;
    // Ongelijke poules? Benoem hoe we eerlijk vergelijken (per wedstrijd), anders
    // snapt niemand waarom een nr. 3 uit een poule-van-5 "lager" kan staan.
    if (!uniform && sizes.length) rows.push(li('o', 'Ongelijke poules', 'grotere poules spelen meer wedstrijden — bij het vergelijken over poules heen tellen we per gespeelde wedstrijd (gemiddelde punten, dan doelsaldo).'));
    const chipsHtml = chips.map(c => `<span class="stat">${esc(c)}</span>`).join('');
    return `<div class="tn-section-label">Zo werkt het</div>
      <div class="tn-howto">
        <h4>Wie gaat er door?</h4>
        <div class="intro">${intro}</div>
        <div class="stats">${chipsHtml}</div>
        <ul>${rows.join('')}</ul>
        <div class="path"><b>De weg naar de finale:</b><br/>${path}</div>
      </div>`;
  }

  // Live "verwacht klaar rond HH:MM" for the whole tournament. The server computes
  // it from the schedule (ends.planned) and shifts ends.expected with the real
  // running delay, so it slides later when the day runs out. Hidden once the final
  // is played (champion) — there's nothing left to finish.
  function expectedEndLine() {
    const e = DATA && DATA.ends;
    if (!e || !e.expected || currentPhaseKey() === 'champion') return '';
    const late = e.delay > 0 ? ` <span class="tn-end-late">+${e.delay} min uitloop</span>` : '';
    return `<div class="tn-endline">${SVG_CLOCK}<span>Verwacht klaar rond <b>${esc(e.expected)}</b>${late}</span></div>`;
  }

  function overzichtPane() {
    if (!DATA || !DATA.configured) return `<div class="tn-empty">Het toernooischema is nog niet klaar.<br/>Kom hier terug zodra het toernooi van start gaat.</div>`;
    const champ = championBanner();
    return `${champ}${myNextStrip()}${phaseRibbon()}${factsTicker()}${expectedEndLine()}${upNextSection()}${pouleGroups()}${formatExplainer()}${finaleTeaser()}`;
  }

  // Compacte per-team-strip bovenin het Overzicht: voor wie een team volgt is
  // "wanneer & waar speel ik" het eerste dat telt — zonder eerst naar het
  // Mijn-paneel te hoeven. Klik = naar dat paneel. Live via dezelfde SSE-render.
  function myNextStrip() {
    if (!MYTEAMS.length || SCREEN) return '';
    const rows = MYTEAMS.map(team => {
      const list = teamMatches(team);
      const upcoming = list.filter(m => m.status !== 'done');
      const next = upcoming.find(m => m.status === 'live') || upcoming[0];
      let right;
      if (next && next.status === 'live') {
        right = `<span class="lv">● nu live</span>`;
      } else if (next) {
        const opp = next.a === team.name ? next.b : next.a;
        const eta = next.expMs != null
          ? `<span class="tn-next-eta" data-expms="${next.expMs}">over ~? min</span>`
          : (next.time ? `<span class="tn-next-eta plan">gepland ${esc(next.time)}</span>` : '');
        right = `${eta}${next.field ? ` · veld ${next.field}` : ' · veld volgt'} · vs ${esc(opp || '—')}`;   // net-bord-03: nooit stil weglaten
      } else {
        const stand = (team.poule && DATA.poules[team.poule]) ? DATA.poules[team.poule].standings : [];
        const me = stand.find(s => s.id === team.id);
        // Zelfde verhaal als de Mijn-kaart: vóór group_complete kan de stand
        // nog schuiven — dan is "alles gespeeld" te definitief.
        right = me && me.ko_next
          ? `wacht op de ${esc((KO_NICE[me.ko_next] || 'knock-out').toLowerCase())}`
          : (DATA.group_complete ? 'alles gespeeld' : 'poule klaar — stand kan nog schuiven');
      }
      return `<button type="button" class="tn-mynext-row" data-goto-mijn><b>${esc(team.name)}</b><span class="r">${right}</span></button>`;
    }).join('');
    return `<div class="tn-mynext">${rows}</div>`;
  }

  // ---------- JVO Smart (bezoeker) — warme helper boven de volg-balk ----------
  // Deterministisch: rustig standaard, spreekt alleen als het helpt. Eerst
  // "wie kom je aanmoedigen?", daarna één regel "wat gebeurt er nu voor je team".
  // De Duif — dezelfde getracede JVO-duif als het laadscherm (jvo-loader.js), viewBox 80×39
  const JVS_DOVE = '<svg viewBox="0 0 80 39" fill="currentColor" aria-hidden="true"><path d="M71.88 0.38 L75.13 0.63 L77.19 1.13 L78.06 1.88 L77.75 2.88 L76.25 4.13 L74.75 5.63 L73.25 7.38 L71.75 9.38 L70.25 11.63 L68.38 13.94 L66.13 16.31 L63.50 18.75 L60.50 21.25 L58.69 23.38 L58.06 25.13 L58.63 26.50 L60.38 27.50 L61.81 28.44 L62.94 29.31 L63.75 30.13 L64.25 30.88 L64.00 31.50 L63.00 32.00 L61.25 32.38 L58.75 32.63 L56.06 33.19 L53.19 34.06 L50.13 35.25 L46.88 36.75 L43.63 37.75 L40.38 38.25 L37.13 38.25 L33.88 37.75 L30.44 36.81 L26.81 35.44 L23.00 33.63 L19.00 31.38 L15.81 29.69 L13.44 28.56 L11.88 28.00 L11.13 28.00 L10.88 27.56 L11.13 26.69 L11.88 25.38 L13.13 23.63 L13.13 21.31 L11.88 18.44 L9.38 15.00 L5.63 11.00 L3.81 8.06 L3.94 6.19 L6.00 5.38 L10.00 5.63 L14.44 6.75 L19.31 8.75 L24.63 11.63 L30.38 15.38 L35.63 17.19 L40.38 17.06 L44.63 15.00 L48.38 11.00 L51.94 7.75 L55.31 5.25 L58.50 3.50 L61.50 2.50 L63.81 1.69 L65.44 1.06 L66.38 0.63 L66.63 0.38 L67.63 0.25 L69.38 0.25 Z"/></svg>';
  function smartVisitorState(team) {
    const nm = esc(team.name);
    // kampioen (het enige feestje) heeft voorrang
    const fin = (DATA.knockout || []).find(k => k.label === 'Finale');
    if (fin && typeof finalDecided === 'function' && finalDecided(DATA)) {
      const w = tieWinner(fin);
      const champName = w === 'a' ? (fin.a && fin.a.name) : w === 'b' ? (fin.b && fin.b.name) : null;
      if (champName && champName === team.name) return { rank: 6, sev: 'celebrate', html: `Kampioen! Gefeliciteerd <b>${nm}</b> — top gespeeld vandaag.` };
    }
    const list = teamMatches(team);
    const upcoming = list.filter(m => m.status !== 'done');
    const next = upcoming.find(m => m.status === 'live') || upcoming[0];
    if (next && next.status === 'live') return { rank: 4, sev: 'warn', html: `<b>${nm}</b> speelt nu${next.field ? ` op veld ${esc(String(next.field))}` : ''} — kijk mee!` };
    if (next) {
      const opp = next.a === team.name ? next.b : next.a;
      const eta = next.expMs != null ? `<span class="tn-next-eta" data-expms="${next.expMs}">zo</span>` : (next.time ? `rond ${esc(next.time)}` : 'straks');
      return { rank: 3, sev: 'info', html: `<b>${nm}</b> is zo aan de beurt — ${eta}${next.field ? ` · veld ${esc(String(next.field))}` : ' · veld volgt'} · tegen ${esc(opp || '—')}.` };
    }
    const stand = (team.poule && DATA.poules[team.poule]) ? DATA.poules[team.poule].standings : [];
    const me = stand.find(s => s.id === team.id);
    if (me && me.ko_next) return { rank: 2, sev: 'info', html: `<b>${nm}</b> is klaar in de poule — nu wachten op de ${esc((KO_NICE[me.ko_next] || 'knock-out').toLowerCase())}.` };
    if (DATA.group_complete) return { rank: 1, sev: 'info', html: `<b>${nm}</b> heeft alles gespeeld — bedankt voor het meedoen! De stand blijft hieronder staan.` };
    return { rank: 0, sev: 'info', html: `<b>${nm}</b> heeft de poule gespeeld — de stand kan nog schuiven.` };
  }
  function renderSmartVisitor() {
    const el = $('tn-smart'); if (!el) return;
    if (SCREEN || !DATA || !DATA.configured) { el.hidden = true; if (el.innerHTML) el.innerHTML = ''; return; }
    let html, cls;
    if (!MYTEAMS.length) {
      html = `<div class="jvs-head"><span class="jvs-mark">${JVS_DOVE}</span><span class="jvs-eyebrow">JVO Smart</span></div>`
        + `<p class="jvs-lead">Wie kom je vandaag aanmoedigen? Kies je team hieronder — dan houd ik je op de hoogte van elke wedstrijd.</p>`;
      cls = 'jvs jvs-visitor jvs--info';
    } else {
      let best = null;
      for (const team of MYTEAMS) { const s = smartVisitorState(team); if (!best || s.rank > best.rank) best = s; }
      if (!best) { el.hidden = true; if (el.innerHTML) el.innerHTML = ''; return; }
      html = `<div class="jvs-row"><span class="jvs-mark sm">${JVS_DOVE}</span><span class="jvs-vtxt">${best.html}</span></div>`;
      cls = `jvs jvs-visitor jvs--${best.sev}`;
    }
    if (el.className !== cls) el.className = cls;
    if (el.innerHTML !== html) el.innerHTML = html;   // dedup → geen re-animatie bij stabiele staat
    el.hidden = false;
  }

  // ---------- net-bord-07: proactieve "aan de beurt"-nudge (echte in-app pop-up) ----------
  // De smart-regel hierboven is passief; deze nudge is een eenmalig, wegklikbaar zetje
  // op het moment dat een gevolgd team ZO aan de beurt is of NET live gaat. Werkt óók
  // zonder push (voor wie push niet aanzette) en vuurt precies één keer per
  // wedstrijd-overgang — geen spam. Alle namen ge-esc().
  const NUDGE_SOON_MIN = 5;     // "zo aan de beurt" = binnen ~5 min
  const NUDGE_TTL = 10000;      // auto-verdwijnen na 10s (de smart-regel houdt de info vast)
  const NUDGE_OUT_MS = 260;     // moet gelijklopen met de .tn-nudge.out-animatie in de CSS
  const nudge = { primed: false, fired: new Set(), timer: null, exitT: null };
  const prefersReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  function finishHideNudge(el) {
    clearTimeout(nudge.exitT); nudge.exitT = null;
    el.hidden = true; el.className = 'tn-nudge'; el.innerHTML = '';
  }
  function hideNudge() {
    const el = $('tn-nudge');
    // Al verborgen óf al aan het uitgaan → niets doen (voorkomt her-entry: een
    // tweede tik op × verlengt de uitgang niet, en de TTL botst niet met een klik).
    if (!el || el.hidden || nudge.exitT) return;
    clearTimeout(nudge.timer); nudge.timer = null;
    if (prefersReduced()) { finishHideNudge(el); return; }   // geen exit-animatie → direct weg
    el.classList.remove('in'); el.classList.add('out');      // speel de uitgang, dan pas verbergen
    nudge.exitT = setTimeout(() => finishHideNudge(el), NUDGE_OUT_MS);
  }
  function showNudge(inner, sev) {
    const el = $('tn-nudge'); if (!el) return;
    clearTimeout(nudge.exitT); nudge.exitT = null;           // breek een lopende uitgang netjes af
    // className-reset haalt tegelijk .in én .out weg → de oude uitgangsanimatie stopt
    // (geen conflict met de nieuwe entree); de reflow hieronder herstart .in schoon.
    el.className = 'tn-nudge' + (sev ? ' ' + sev : '');
    el.innerHTML = `<span class="tn-nudge-mark">${JVS_DOVE}</span>`
      + `<div class="tn-nudge-body"><div class="tn-nudge-eyebrow">JVO Smart</div><div class="tn-nudge-txt">${inner}</div></div>`
      + `<button type="button" class="tn-nudge-x" aria-label="Melding sluiten">${SVG_X}</button>`;
    el.hidden = false;
    // Reflow committeert de 'geen .in'-basisstaat, dán synchroon .in toevoegen → de
    // keyframe-entree herstart altijd schoon, óók als de vorige nudge nog .in had.
    // Synchroon (geen requestAnimationFrame): rAF wordt in een achtergrond-tab
    // gepauzeerd, waardoor de entree anders zou overslaan. reduced-motion negeert de
    // animatie via de CSS-media-query.
    void el.offsetWidth;
    el.classList.add('in');
    el.querySelector('.tn-nudge-x').onclick = (e) => { e.stopPropagation(); hideNudge(); };
    el.onclick = () => { hideNudge(); if (PANES.includes('mijn')) selectTab('mijn'); };
    clearTimeout(nudge.timer);
    nudge.timer = setTimeout(hideNudge, NUDGE_TTL);
  }
  function checkTeamNudges() {
    if (SCREEN || !smartOn('net-bord-07') || !DATA || !DATA.configured || !MYTEAMS.length) return;
    const nowMs = serverNow();
    const cand = [];   // {key, sev, html} — hoogste urgentie eerst
    const seenKey = new Set();
    for (const team of MYTEAMS) {
      const list = teamMatches(team);
      const nm = esc(team.name);
      const liveM = list.find(m => m.status === 'live');
      if (liveM) {
        const k = 'live:' + liveM.id;
        if (!seenKey.has(k)) { seenKey.add(k);
          cand.push({ key: k, prio: 2, sev: 'clinch',
            html: `<b>${nm}</b> speelt nu${liveM.field ? ` op veld ${esc(String(liveM.field))}` : ''} — kijk mee!` }); }
      }
      const up = list.filter(m => m.status !== 'done' && m.status !== 'live' && Number.isFinite(m.expMs))
        .sort((a, b) => a.expMs - b.expMs)[0];
      if (up && up.field && (up.expMs - nowMs) <= NUDGE_SOON_MIN * 60000) {
        const k = 'soon:' + up.id;
        if (!seenKey.has(k)) { seenKey.add(k);
          const mins = Math.max(0, Math.round((up.expMs - nowMs) / 60000));
          cand.push({ key: k, prio: 1, sev: 'warn',
            html: `<b>${nm}</b> is zo aan de beurt — ga naar <b>veld ${esc(String(up.field))}</b> · aftrap ${mins <= 0 ? 'zo meteen' : `over ~${mins} min`}.` }); }
      }
    }
    // Eerste keer: alleen "primen" (huidige staat als al-getoond markeren) zodat een
    // al-lopende/al-aanstaande wedstrijd bij het openen géén pop-up-burst geeft — we
    // nudgen alléén op echte overgangen terwijl de pagina open staat.
    if (!nudge.primed) { cand.forEach(c => nudge.fired.add(c.key)); nudge.primed = true; return; }
    cand.sort((a, b) => b.prio - a.prio);
    for (const c of cand) {
      if (nudge.fired.has(c.key)) continue;
      nudge.fired.add(c.key);
      showNudge(c.html, c.sev);
      break;   // één pop-up tegelijk; een volgende overgang komt de volgende tik
    }
  }

  // ---------- feitjes-ticker + teamprofiel (klik op een team) ----------
  // Leuke weetjes uit de gespeelde wedstrijden (server: fun_facts, alleen bij
  // een unieke koploper). Roteert elke 8s; tikken opent het profiel van het
  // genoemde team.
  let factIdx = 0;
  function factsTicker() {
    const facts = DATA.fun_facts || [];
    if (!facts.length || SCREEN) return '';
    // Altijd feitje 0 renderen: zo blijft de HTML stabiel bij ongewijzigde data
    // (de render-deduplicatie hieronder vergelijkt op string) en doet
    // syncFactTicker() de rotatie ná elke render/interval-tik in het DOM.
    const f = facts[0];
    const attrs = f.team_id ? ` data-profile="${f.team_id}" role="button" tabindex="0"` : '';
    return `<div class="tn-fact"${attrs}><span class="ic" aria-hidden="true">✦</span> <span class="tx">${esc(f.text)}</span></div>`;
  }
  // Zet het huidige rotatie-feitje in de al gerenderde ticker, inclusief de
  // klik/focus-attributen (een feitje zonder team is geen knop).
  function syncFactTicker() {
    const facts = (DATA && DATA.fun_facts) || [];
    const el = document.querySelector('.tn-fact');
    if (!el || !facts.length) return;
    const f = facts[factIdx % facts.length];
    const tx = el.querySelector('.tx');
    if (tx && tx.textContent !== f.text) tx.textContent = f.text;
    if (f.team_id) {
      el.dataset.profile = f.team_id;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
    } else {
      delete el.dataset.profile;
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
    }
  }
  setInterval(() => {
    const facts = (DATA && DATA.fun_facts) || [];
    if (facts.length < 2) return;
    factIdx = (factIdx + 1) % facts.length;
    syncFactTicker();
  }, 8000);

  function teamById(id) {
    for (const p of Object.keys(DATA.poules || {})) {
      const s = DATA.poules[p].standings.find(x => x.id === id);
      if (s) return { id: s.id, name: s.name, poule: p, stand: s };
    }
    return null;
  }
  let openProfileId = null;      // live-refresh (SSE) herbouwt een open profiel
  let profileReturnFocus = null; // focus terug naar de opener bij sluiten
  function closeProfile() {
    const el = document.querySelector('.tn-profile-backdrop');
    if (el) el.remove();
    document.body.style.overflow = '';
    openProfileId = null;
    if (profileReturnFocus && document.contains(profileReturnFocus)) {
      try { profileReturnFocus.focus(); } catch { /* opener kan weg zijn */ }
    }
    profileReturnFocus = null;
  }
  function openProfile(id, opts = {}) {
    const refresh = opts.refresh === true;
    if (!refresh) profileReturnFocus = (document.activeElement instanceof HTMLElement) ? document.activeElement : null;
    const keepFocus = refresh ? document.activeElement : null;
    document.querySelector('.tn-profile-backdrop')?.remove();
    const t = teamById(id);
    if (!t || !DATA) { document.body.style.overflow = ''; openProfileId = null; return; }
    const team = { id: t.id, name: t.name, poule: t.poule };
    const list = teamMatches(team);
    const st = (DATA.team_stats || []).find(s => s.team_id === id);
    const facts = (DATA.fun_facts || []).filter(f => f.team_id === id);
    const s = t.stand;
    const following = myIds.has(id);
    const stat = (v, l) => `<div class="tn-pstat"><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`;
    const ds = (s.gd >= 0 ? '+' : '') + s.gd;
    const statsHtml = [
      stat(st ? st.gp : s.gp, 'gespeeld'),
      stat(`${st ? st.w : s.w}-${st ? st.d : s.d}-${st ? st.l : s.l}`, 'W-G-V'),
      stat(st ? st.gf : s.gf, 'goals'),
      stat(st ? st.ga : s.ga, 'tegen'),
      stat(st ? ((st.gd >= 0 ? '+' : '') + st.gd) : ds, 'saldo'),
      ...(st && st.cleansheets ? [stat(st.cleansheets + '×', 'de nul')] : []),
      ...(st && st.streak_best >= 2 ? [stat(st.streak_best, 'op rij gewonnen')] : []),
    ].join('');
    const factHtml = facts.length
      ? `<div class="tn-section-label">Weetjes</div>${facts.map(f => `<div class="tn-pfact"><span class="ic" aria-hidden="true">✦</span> ${esc(f.text)}</div>`).join('')}`
      : '';
    const big = st && st.biggest ? `<div class="tn-psub">Grootste zege: ${esc(st.biggest.score)} tegen ${esc(st.biggest.opponent)}</div>` : '';
    const wrap = document.createElement('div');
    wrap.className = 'tn-profile-backdrop';
    wrap.setAttribute('data-profile-close', '');
    wrap.innerHTML = `
      <div class="tn-profile" role="dialog" aria-modal="true" aria-label="Teamprofiel ${esc(t.name)}">
        <button type="button" class="tn-profile-x" data-profile-close aria-label="Sluiten">×</button>
        <div class="tn-hero-eyebrow">Teamprofiel · Poule ${esc(t.poule || '?')}</div>
        <div class="tn-profile-name">${logoHtml(s.logo, 40)}${esc(t.name)}</div>
        <div class="tn-psub">${s.pos}<sup>e</sup> in de poule · ${s.pts} ptn</div>
        ${big}
        <div class="tn-pstats">${statsHtml}</div>
        ${following
          ? `<div class="tn-pfollow on">Je volgt dit team</div>`
          : `<button type="button" class="tn-pfollow" data-profile-follow="${t.id}">☆ Volg dit team</button>`}
        <div class="tn-section-label">Volgende wedstrijd</div>
        ${teamNextCard(team, list, s)}
        ${factHtml}
        <div class="tn-section-label">Wedstrijden</div>
        <div class="tn-mylist">${list.map(m => teamResultRow(team, m)).join('') || '<div class="tn-empty">Nog geen wedstrijden.</div>'}</div>
      </div>`;
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    openProfileId = id;
    // Focus-trap: Tab blijft binnen de dialog rondgaan (aria-modal belooft dat).
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...wrap.querySelectorAll('button, a[href], [tabindex="0"]')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    if (refresh && keepFocus && keepFocus.className && document.querySelector('.' + String(keepFocus.className).split(' ')[0])) {
      // live-refresh: focus zo goed mogelijk laten staan (zelfde knop-soort)
      try { wrap.querySelector('.' + String(keepFocus.className).split(' ')[0])?.focus(); } catch { /* best effort */ }
    } else if (!refresh) {
      const x = wrap.querySelector('.tn-profile-x');
      if (x) x.focus();
    }
  }
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest && e.target.closest('[data-profile-close]');
    const inCard = e.target.closest && e.target.closest('.tn-profile');
    if (closeBtn && (!inCard || closeBtn.classList.contains('tn-profile-x'))) { closeProfile(); return; }
    const follow = e.target.closest && e.target.closest('[data-profile-follow]');
    if (follow) {
      const id = parseInt(follow.dataset.profileFollow, 10);
      if (Number.isInteger(id)) { addFollow(id); closeProfile(); }
      return;
    }
    const prof = e.target.closest && e.target.closest('[data-profile]');
    if (prof && !inCard) openProfile(parseInt(prof.dataset.profile, 10));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProfile();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-profile]')) {
      e.preventDefault();
      openProfile(parseInt(e.target.dataset.profile, 10));
    }
  });

  // Build the tab buttons from the current PANES (poules present + ko, + mijn).
  function renderTabs() {
    const tabs = $('tn-tabs');
    if (!tabs || SCREEN) return;
    // Compact tab labels so all six fit a phone: poules show just their letter
    // (context makes it unambiguous), the rest keep their full name.
    const tabLabel = (p) => p === 'mijn' ? (MYTEAMS.length > 1 ? 'Mijn teams' : 'Mijn team')
      : p === 'overzicht' ? 'Overzicht'
      : p === 'ko' ? 'Knock-out'
      : p;
    // Rebuilding innerHTML resets scrollLeft, so remember it and only auto-center
    // when the active tab actually changed — otherwise restore the user's scroll
    // so a live data refresh (every SSE push / 15s poll) doesn't jolt the strip.
    const prevLeft = tabs.scrollLeft;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Toernooi-onderdelen');
    tabs.innerHTML = PANES.map(p => {
      const on = p === activePane;
      return `<button class="tn-tab ${on ? 'active' : ''}" data-pane="${p}" role="tab" id="tn-tab-${p}" aria-controls="tn-pane-${p}" aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}">${esc(tabLabel(p))}</button>`;
    }).join('');
    tabs.querySelectorAll('.tn-tab').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.pane)));
    // Keyboard: arrow keys move between tabs (WAI-ARIA tab pattern).
    tabs.onkeydown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const i = PANES.indexOf(activePane);
      const next = e.key === 'Home' ? 0
        : e.key === 'End' ? PANES.length - 1
        : e.key === 'ArrowRight' ? (i + 1) % PANES.length
        : (i - 1 + PANES.length) % PANES.length;
      selectTab(PANES[next]);
      const el = tabs.querySelector('.tn-tab.active');
      if (el && el.focus) el.focus();
    };
    const act = tabs.querySelector('.tn-tab.active');
    if (activePane !== lastCenteredPane) {
      if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'center', block: 'nearest' });
      lastCenteredPane = activePane;
    } else {
      tabs.scrollLeft = prevLeft;
    }
  }

  function render() {
    const pausedEl = $('tn-paused');
    if (pausedEl) {
      pausedEl.hidden = !(DATA && DATA.paused);
      const msgEl = $('tn-paused-msg');
      if (msgEl) msgEl.textContent = (DATA && DATA.pause_message) || 'De wedstrijden liggen even stil — kom zo terug!';
    }
    if (!DATA || !DATA.configured) {
      $('tn-content').innerHTML = `<div class="tn-empty">Het toernooischema is nog niet klaar.<br/>Kom hier terug zodra het toernooi van start gaat.</div>`;
      const tabs = $('tn-tabs'); if (tabs && !SCREEN) tabs.innerHTML = '';
      return;
    }
    rebuildPanes();
    renderTabs();
    const html = PANES.map(p => {
      const inner = p === 'mijn' ? mijnPane()
        : p === 'overzicht' ? overzichtPane()
        : (p === 'ko' ? koPane() : poulePane(p));
      return `<div class="tn-pane" data-pane="${p}" id="tn-pane-${p}" role="tabpanel" aria-labelledby="tn-tab-${p}" tabindex="0">${inner}</div>`;
    }).join('');
    // Identical output? Skip the innerHTML swap — every SSE ping / poll would
    // otherwise destroy focus, text selection and tap targets for no reason.
    if (html !== render.lastHtml) {
      render.lastHtml = html;
      $('tn-content').innerHTML = html;
      flashMovedRows();
    }
    syncFactTicker();
    // Een open teamprofiel leeft mee met de live data (scores/tijden/status) —
    // anders oogt de overlay live (tikkende klok) terwijl hij bevroren is.
    if (openProfileId != null) openProfile(openProfileId, { refresh: true });
    updateVisibility();
    if (activePane === 'ko') refitKO();   // boom/wheel opnieuw passend maken na een re-render
  }

  // Cinematic: een korte gouden flash op standrijen waarvan de PUNTEN net
  // veranderden — zo zie je de stand letterlijk bewegen na een uitslag.
  let lastPtsMap = null;
  function flashMovedRows() {
    if (!DATA || !DATA.configured) { lastPtsMap = null; return; }
    const next = new Map();
    for (const p of poulesPresent()) for (const st of DATA.poules[p].standings) next.set(st.id, st.pts);
    if (lastPtsMap) {
      for (const [tid, pts] of next) {
        if (lastPtsMap.has(tid) && lastPtsMap.get(tid) !== pts) {
          document.querySelectorAll(`.tn-row[data-tid="${tid}"]`).forEach(el => el.classList.add('flash'));
        }
      }
    }
    lastPtsMap = next;
  }

  let lastShownAnim = null;
  function updateVisibility() {
    const shown = SCREEN ? PANES[cycleIdx] : activePane;
    const switched = shown !== lastShownAnim;
    lastShownAnim = shown;
    document.querySelectorAll('.tn-pane').forEach(el => {
      const on = el.dataset.pane === shown;
      el.classList.toggle(SCREEN ? 'screen-on' : 'active', on);
      // Cinematic instap-animatie alléén bij een echte wissel (tab-tik of
      // TV-cycle) — nooit bij een data-update, anders knippert het bord.
      el.classList.toggle('pane-in', on && switched);
    });
    if (SCREEN) {
      $('tn-cycle-name').textContent = PANE_NAME[shown];
      $('tn-dots').innerHTML = PANES.map((_, i) => `<i class="${i === cycleIdx ? 'on' : ''}"></i>`).join('');
    }
  }

  // ---------- broadcast-ticker ----------
  // Met uitslagen: de laatste resultaten ("Uitslagen"). Nog geen uitslag binnen
  // (voor de aftrap / vroege poulefase): de eerstvolgende wedstrijden met tijd en
  // veld ("Programma") — zo is de band er vanaf minuut één en schakelt hij
  // vanzelf om zodra de eerste uitslag valt.
  function renderTicker() {
    const el = $('tn-ticker'), track = $('tn-ticker-track');
    if (!el || !track) return;
    if (!DATA || !DATA.configured) { el.hidden = true; return; }
    const done = [];
    for (const p of poulesPresent()) for (const m of DATA.poules[p].matches) {
      if (m.status === 'done' && m.score_a != null) done.push({ t: m.ended_at || '', a: m.a, b: m.b, sa: m.score_a, sb: m.score_b, where: `Poule ${p}` });
    }
    for (const k of (DATA.knockout || [])) {
      if (k.status === 'done' && k.score_a != null) done.push({ t: k.ended_at || '', a: k.a.name || k.a.placeholder, b: k.b.name || k.b.placeholder, sa: k.score_a, sb: k.score_b, pa: k.pens_a, pb: k.pens_b, where: KO_NICE[k.label] || k.label });
    }
    let label, items;
    if (done.length) {
      label = 'Uitslagen';
      done.sort((x, y) => String(y.t).localeCompare(String(x.t)));
      items = done.slice(0, 12).map(m => {
        const aw = m.sa > m.sb || (m.sa === m.sb && m.pa != null && m.pa > m.pb);
        const bw = m.sb > m.sa || (m.sa === m.sb && m.pb != null && m.pb > m.pa);
        const np = (m.pa != null && m.pb != null) ? ` <span class="np">n.p. ${m.pa}–${m.pb}</span>` : '';
        return `<span class="tn-tick"><span class="${aw ? 'w' : ''}">${esc(m.a || '—')}</span><b>${m.sa}–${m.sb}</b><span class="${bw ? 'w' : ''}">${esc(m.b || '—')}</span>${np}<i>${esc(m.where)}</i></span>`;
      });
    } else {
      label = 'Programma';
      const up = allUpcoming().slice(0, 12);
      items = up.map(m => `<span class="tn-tick"><b>${esc(m.time || '—')}</b><span>${esc(m.a || '—')}</span><i>vs</i><span>${esc(m.b || '—')}</span><i>${esc([m.field ? 'Veld ' + m.field : '', m.where].filter(Boolean).join(' · '))}</i></span>`);
    }
    if (!items.length) { el.hidden = true; renderTicker.lastHtml = null; return; }
    const lbl = el.querySelector('.tn-ticker-lbl');
    if (lbl && lbl.textContent !== label) lbl.textContent = label;
    // Twee keer dezelfde reeks achter elkaar → de -50% marquee loopt naadloos rond.
    const html = items.join('') + items.join('');
    if (html === renderTicker.lastHtml) return;   // geen herstart van de band zonder nieuws
    renderTicker.lastHtml = html;
    track.innerHTML = html;
    track.style.setProperty('--tickdur', Math.max(26, Math.min(90, items.length * 6)) + 's');
    el.hidden = false;
  }

  const parseTs = (s) => s ? new Date(s.replace(' ', 'T') + 'Z').getTime() : null;
  const serverNow = () => Date.now() + offset;

  // ---------- live banner ----------
  // WC26-uitslagpil-helpers. Kit-chip: elk team draagt zijn eigen (gevalideerde)
  // badge-kleur; kleuren komen UITSLUITEND uit de gesloten COLORS-map via
  // accent() → nooit rauwe gebruikersinput in een style-attribuut (geen XSS).
  function accentOf(name, fallback) {
    const logo = LOGO_BY_NAME.get(name);
    if (logo && logo.badge && window.jvoLogo && window.jvoLogo.accent) return window.jvoLogo.accent(logo);
    return fallback || { c1: '#FF6B1A', c2: '#FFB347' };
  }
  function kitChip(a) {
    return `<span class="tn-sb-kit" style="--k1:${a.c1};--k2:${a.c2}"></span>`;
  }
  // Odometer: flip één cijfer, herstart-veilig (read-then-write van de class).
  function flipDigit(el) { if (!el || (window.JVOFX && window.JVOFX.reduce)) return; el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
  // Stabiele wedstrijd-id, fase-genamespaced (een poule-id en een KO-id kunnen botsen).
  const liveMid = (m) => (('pens_a' in m) ? 'k' : 'p') + m.id;

  // Pre-aftrap hero: als er (nog) niks live is maar er wél een wedstrijd aankomt,
  // vult de top-plek van het bord met de eerstvolgende wedstrijd + live countdown,
  // zodat het bord ook vóór de eerste fluit (en tussen rondes) meteen leeft.
  function preKickoffHero() {
    if (!DATA || !DATA.configured) return '';
    const up = allUpcoming();
    if (!up.length) return '';
    const m = up[0];
    const anyDone = poulesPresent().some(p => DATA.poules[p].matches.some(x => x.status === 'done'))
      || (DATA.knockout || []).some(k => k.status === 'done');
    const eye = anyDone ? 'Zo verder' : 'Zo van start';
    const eta = m.expMs != null
      ? `<span class="tn-next-eta" data-expms="${m.expMs}">over ~? min</span>`
      : (m.time ? `rond ${esc(m.time)}` : 'straks');
    const veld = m.field ? `Veld ${esc(String(m.field))}` : 'Veld volgt';
    return `<div class="tn-prehero">
        <div class="tn-prehero-head"><span class="tn-prehero-dot" aria-hidden="true"></span>${eye} · ${esc(m.where || '')}</div>
        <div class="tn-prehero-match"><span class="tn-prehero-team">${esc(m.a || '—')}</span><span class="tn-prehero-vs">vs</span><span class="tn-prehero-team">${esc(m.b || '—')}</span></div>
        <div class="tn-prehero-meta">${veld} · ${eta}</div>
      </div>`;
  }

  function renderLive() {
    const bar = $('tn-live');
    const live = (DATA && DATA.live) || [];
    const sr = $('tn-sr');
    if (!live.length) {
      const hero = preKickoffHero();
      bar.classList.toggle('show', !!hero);
      if (hero !== renderLive.lastHtml) { renderLive.lastHtml = hero; bar.innerHTML = hero; }
      if (sr) sr.textContent = '';
      if (announceLive.prev) announceLive.prev.clear();
      if (announceLive.pending) announceLive.pending.clear();
      clearTimeout(announceLive.t);
      return;
    }
    bar.classList.add('show');
    renderLive.seen = renderLive.seen || new Set();
    const cards = live.map(m => {
      const mid = liveMid(m);
      const kickoff = renderLive.seen.has(mid) ? '' : ' kickoff';   // aftrap-settle: 1× per wedstrijd
      renderLive.seen.add(mid);
      // eind-bars: team-accent bij een badge; anders home=warm / away=koel (jvo-scorebug-framing)
      const a1 = accentOf(m.a, { c1: '#FF8A3D', c2: '#FFB347' }), a2 = accentOf(m.b, { c1: '#2FD4C4', c2: '#59C3FF' });
      return `
      <div class="tn-sb ${(isMine(m.a) || isMine(m.b)) ? 'me' : ''}${kickoff}" data-mid="${mid}" data-start="${m.started_at || ''}">
        <span class="tn-sb-bar l" style="background:linear-gradient(180deg,${a1.c1},${a1.c2})"></span>
        <span class="tn-sb-bar r" style="background:linear-gradient(180deg,${a2.c1},${a2.c2})"></span>
        <div class="tn-sb-top">
          <span class="tn-sb-field">${m.field ? 'Veld ' + esc(String(m.field)) : 'Live'}</span>
          <span class="tn-sb-where">${esc(m.where)}</span>
          <span class="tn-sb-clk clk" data-start="${m.started_at || ''}">--:--</span>
        </div>
        <div class="tn-sb-body">
          <div class="tn-sb-team ${isMine(m.a) ? 'mine' : ''}"><span class="tn-sb-nm">${esc(m.a)}</span>${kitChip(a1)}</div>
          <div class="tn-sb-score"><b>${m.score_a}</b><i>:</i><b>${m.score_b}</b>${(m.pens_a != null && m.pens_b != null) ? `<span class="tn-sb-pens">n.p. ${m.pens_a}–${m.pens_b}</span>` : ''}</div>
          <div class="tn-sb-team ${isMine(m.b) ? 'mine' : ''}">${kitChip(a2)}<span class="tn-sb-nm">${esc(m.b)}</span></div>
        </div>
      </div>`;
    }).join('');
    const barHtml = `
      <div class="tn-live-head"><span class="tn-live-pulse"></span>Nu live<span class="tn-live-count">${live.length}</span></div>
      <div class="tn-live-grid">${cards}</div>`;
    // Alleen écht herbouwen bij een wijziging. Ná de innerHTML-swap draait de
    // odometer-diff: flip UITSLUITEND het cijfer dat omhoog ging (t.o.v. de vorige
    // score in renderLive.last), i.p.v. de oude blanket-pop op elk cijfer.
    if (barHtml !== renderLive.lastHtml) {
      renderLive.lastHtml = barHtml;
      bar.innerHTML = barHtml;
      renderLive.last = renderLive.last || new Map();
      live.forEach(m => {
        const mid = liveMid(m);
        const prev = renderLive.last.get(mid) || { a: m.score_a, b: m.score_b };
        const c = bar.querySelector(`.tn-sb[data-mid="${mid}"]`);
        if (c) {
          const bs = c.querySelectorAll('.tn-sb-score b');
          if (m.score_a > prev.a) flipDigit(bs[0]);
          if (m.score_b > prev.b) flipDigit(bs[1]);
        }
        renderLive.last.set(mid, { a: m.score_a, b: m.score_b });
      });
    }
    tickLive();
    announceLive(live);
  }

  // net-a11y-01: kondig alleen de VERANDERDE wedstrijd aan, gedebounced (~1,6s na de
  // laatste wijziging), i.p.v. bij elke tick de hele live-lijst opnieuw voor te lezen
  // (screenreader-flooding). De zichtbare score-cijferflip blijft direct. Bij een
  // afgewezen learning valt het terug op het oude gedrag (hele lijst).
  function announceLive(live) {
    const sr = $('tn-sr'); if (!sr) return;
    if (!smartOn('net-a11y-01')) {
      sr.textContent = live.length ? 'Nu live: ' + live.map(m => `${m.a} ${m.score_a}, ${m.b} ${m.score_b}`).join('; ') : '';
      return;
    }
    announceLive.prev = announceLive.prev || new Map();
    announceLive.pending = announceLive.pending || new Map();
    const seen = new Set();
    for (const m of live) {
      const mid = liveMid(m);
      seen.add(mid);
      const prev = announceLive.prev.get(mid);
      if (!prev || prev.a !== m.score_a || prev.b !== m.score_b) {
        const where = m.field ? `veld ${m.field}` : 'live';
        announceLive.pending.set(mid, prev
          ? `${where}: ${m.a} ${m.score_a}, ${m.b} ${m.score_b}`
          : `Nu live op ${where}: ${m.a} tegen ${m.b}`);
        announceLive.prev.set(mid, { a: m.score_a, b: m.score_b });
      }
    }
    for (const mid of [...announceLive.prev.keys()]) if (!seen.has(mid)) announceLive.prev.delete(mid);
    if (!announceLive.pending.size) return;
    clearTimeout(announceLive.t);
    announceLive.t = setTimeout(() => {
      sr.textContent = [...announceLive.pending.values()].join('; ');
      announceLive.pending.clear();
    }, 1600);
  }

  function tickLive() {
    // "Speelt zo": puls op up-next kaarten waarvan de verwachte aftrap binnen
    // ~5 min ligt (data-expms komt uit de server-simulatie, incl. uitloop).
    const nowMs = serverNow();
    document.querySelectorAll('.tn-up[data-expms]').forEach(el => {
      const t = parseInt(el.dataset.expms, 10);
      el.classList.toggle('soon', Number.isFinite(t) && t - nowMs < 5 * 60000 && t - nowMs > -10 * 60000);
    });
    // Countdown-chips op de volgende-wedstrijd-kaart + de overzicht-strip.
    document.querySelectorAll('.tn-next-eta[data-expms]').forEach(el => {
      const t = parseInt(el.dataset.expms, 10);
      if (!Number.isFinite(t)) return;
      const m = Math.round((t - nowMs) / 60000);
      el.textContent = m <= 0 ? 'zo meteen' : `over ~${m} min`;
      el.classList.toggle('soon', t - nowMs < 5 * 60000 && t - nowMs > -10 * 60000);
    });
    const mins = (DATA && DATA.schedule && DATA.schedule.match_min) || (DATA && DATA.match_minutes) || 10;
    document.querySelectorAll('.clk[data-start]').forEach(el => {
      const st = parseTs(el.dataset.start);
      if (!st) { el.textContent = '--:--'; return; }
      const ms = Math.max(0, serverNow() - st);
      const mm = String(Math.floor(ms / 60000)).padStart(2, '0');
      const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
      el.textContent = `${mm}:${ss}`;
      el.classList.toggle('extra', ms >= mins * 60000);
    });
    checkTeamNudges();   // net-bord-07: eenmalige aan-de-beurt-pop-up bij een overgang
  }

  // ---------- goal / win detection + celebration ----------
  function scoreMap(d) {
    const m = new Map();
    if (!d || !d.configured) return m;
    for (const p of ALL_POULES) for (const x of ((d.poules[p] && d.poules[p].matches) || []))
      m.set('g' + x.id, { a: x.score_a ?? 0, b: x.score_b ?? 0, na: x.a, nb: x.b, st: x.status, pa: null, pb: null });
    for (const k of d.knockout)
      m.set('k' + k.id, { a: k.score_a ?? 0, b: k.score_b ?? 0, na: k.a.name || k.a.placeholder, nb: k.b.name || k.b.placeholder, st: k.status, pa: k.pens_a ?? null, pb: k.pens_b ?? null });
    return m;
  }
  function detectGoal(oldM, newM) {
    if (!oldM) return null;
    for (const [id, cur] of newM) {
      const prev = oldM.get(id);
      if (!prev) continue;
      if (cur.a > prev.a) return { team: cur.na, score: `${cur.a}–${cur.b}`, mine: isMine(cur.na) };
      if (cur.b > prev.b) return { team: cur.nb, score: `${cur.a}–${cur.b}`, mine: isMine(cur.nb) };
    }
    return null;
  }
  function detectMyWin(oldM, newM) {
    if (!oldM || !MYTEAMS.length) return null;
    for (const [id, cur] of newM) {
      const prev = oldM.get(id);
      if (!prev || prev.st === 'done' || cur.st !== 'done') continue;
      if (!isMine(cur.na) && !isMine(cur.nb)) continue;
      const mineA = isMine(cur.na);
      const mine = mineA ? cur.a : cur.b, theirs = mineA ? cur.b : cur.a;
      if (mine > theirs) return { team: mineA ? cur.na : cur.nb, score: `${mine}–${theirs}` };
      // Knock-out shoot-out: scores level → decided on penalties (server forces
      // pens on a level KO tie). Credit the followed team its shoot-out win too.
      if (mine === theirs && cur.pa != null && cur.pb != null) {
        const minePens = mineA ? cur.pa : cur.pb, theirPens = mineA ? cur.pb : cur.pa;
        if (minePens > theirPens) return { team: mineA ? cur.na : cur.nb, score: `${mine}–${theirs} (n.p. ${minePens}–${theirPens})` };
      }
    }
    return null;
  }
  let goalTimer = null;
  function fireCelebration({ word, team, score, win }) {
    const ov = $('tn-goal');
    ov.classList.toggle('win', !!win);
    ov.querySelector('.tn-goal-word').textContent = word;
    $('tn-goal-team').textContent = team || '';
    $('tn-goal-score').textContent = score || '';
    ov.classList.remove('fire'); void ov.offsetWidth; ov.classList.add('fire');
    // Bewust GEEN confetti hier: goals en gewonnen wedstrijden vieren met de
    // kaart alleen. Confetti is gereserveerd voor EEN moment — de kampioen
    // (zie de finale-overgang in applyData) — zodat het speciaal blijft.
    clearTimeout(goalTimer);
    goalTimer = setTimeout(() => ov.classList.remove('fire'), win ? 3200 : 2300);
  }

  // Het ENE confettimoment van het toernooi: de kampioen. Vuurt op elk open
  // bord (telefoons EN de TV) precies eenmaal, op de overgang "finale beslist" —
  // wie later binnenkomt ziet de kampioensbanner, zonder salvo achteraf.
  const finalDecided = (d) => {
    const fin = ((d && d.knockout) || []).find(k => k.label === 'Finale');
    return !!(fin && fin.status === 'done' && ((fin.score_a ?? 0) !== (fin.score_b ?? 0) || (fin.pens_a != null && fin.pens_b != null && fin.pens_a !== fin.pens_b)));
  };
  function championConfetti() {
    if (!window.JVOFX) return;
    window.JVOFX.confetti({ count: 140, power: 16, y: 0.4, colors: SPORTHUB ? ['#FF6B1A', '#FFFFFF', '#C4382E', '#F6F7FB', '#0D2550'] : ['#FF6B1A', '#FFB347', '#FFCD7A', '#6CE3A0', '#E8F4FF'] });
  }

  // ---------- apply + render ----------
  function applyData(d, animate) {
    // Drop OUT-OF-ORDER snapshots. A reconnect (SSE auto-reconnect resends the
    // current snapshot) or a delayed poll arriving after a newer update can carry an
    // OLDER state; applying it would jump the board backwards and re-fire the
    // goal/win overlay on the next fresh update. server_now is the server WALL clock
    // (Date.now()), so it is NOT strictly monotonic — an NTP step or a redeploy can
    // move it backwards. So only treat a SMALL backward delta (< 60 s) as stale; a
    // larger backward jump is a clock reset → accept it and re-baseline below, so the
    // board can never freeze waiting for the clock to catch back up.
    const sn = d.server_now || 0;
    if (sn && sn < lastServerNow && (lastServerNow - sn) < 60000) return;
    const next = scoreMap(d);
    if (animate && !firstLoad) {
      const win = detectMyWin(prevScores, next);
      if (win) fireCelebration({ word: 'GEWONNEN!', team: win.team, score: win.score, win: true });
      else {
        const g = detectGoal(prevScores, next);
        // Only celebrate a goal by one of YOUR followed teams. Never blanket every
        // goal on the public board — overwhelming, especially with simultaneous
        // goals. No team followed → no goal celebration here (results come via push).
        if (g && g.mine) fireCelebration({ word: 'GOAL!', team: g.team, score: g.score });
      }
    }
    // Kampioensmoment: precies een salvo op de overgang niet-beslist → beslist.
    // Ook in SCREEN-modus (de TV hoort het grootste feestje van de dag te tonen);
    // nooit op first load, zodat laatkomers geen mosterd-na-de-maaltijd krijgen.
    if (!firstLoad && DATA && !finalDecided(DATA) && finalDecided(d)) championConfetti();
    prevScores = next;
    DATA = d;
    rebuildLogoMaps();
    offset = (d.server_now || Date.now()) - Date.now();
    if (sn) lastServerNow = sn;
    render();
    renderLive();
    renderTicker();
    renderSmartVisitor();
    lastSyncTime = new Date();
    const upEl = $('tn-updated');
    upEl.textContent = 'Live · bijgewerkt ' + lastSyncTime.toLocaleTimeString('nl-NL');
    upEl.classList.remove('stale', 'off');   // verse data → niet meer ouder/offline
    if (DATA.configured && !followBarRendered) { renderFollowBar(); followBarRendered = true; }
    firstLoad = false;
  }

  // Keep the last-known board on screen but make it obvious it's not live.
  function showOffline() {
    const el = $('tn-updated');
    if (el) {
      el.textContent = lastSyncTime
        ? 'Offline · laatst bijgewerkt ' + lastSyncTime.toLocaleTimeString('nl-NL')
        : 'Offline — wachten op verbinding';
      el.classList.add('off');
      el.classList.remove('stale');
    }
    // Cold start with nothing cached: replace the "Laden…" placeholder so the
    // main area doesn't pretend to load forever. applyData() restores it on
    // reconnect.
    if (!DATA) {
      const c = $('tn-content');
      if (c) c.innerHTML = `<div class="tn-empty">Geen verbinding — de stand verschijnt zodra je weer online bent.</div>`;
    }
  }

  // net-bord-06: als het bord online lijkt maar SSE/poll al te lang niets gaf, tonen
  // we "gegevens ouder" i.p.v. stil een verouderde "Live"-stand. De reconnect gebeurt
  // al automatisch (SSE auto-reconnect + poll-fallback); dit is puur het eerlijke signaal.
  const STALE_MS = 45000;
  function checkStale() {
    if (!smartOn('net-bord-06')) return;
    const el = $('tn-updated');
    if (!el || !lastSyncTime || !navigator.onLine || el.classList.contains('off')) return;
    if (Date.now() - lastSyncTime.getTime() > STALE_MS) {
      el.textContent = 'Gegevens ouder · laatst ' + lastSyncTime.toLocaleTimeString('nl-NL');
      el.classList.add('stale');
    }
  }
  setInterval(checkStale, 10000);

  async function load(spin) {
    const btn = $('tn-refresh');
    if (spin && btn) { btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); }
    try {
      const res = await fetch('/api/tournament', { cache: 'no-store' });
      // The service worker re-serves the last good snapshot (marked with
      // X-JVO-Cache) when the network is down-but-wifi-up — keep it on screen
      // but label the board offline instead of stamping stale data as "Live".
      if (res.headers.get('X-JVO-Cache') === 'stale') { showOffline(); return; }
      const json = await res.json();
      // Service worker hands back {offline:true} when it has nothing cached —
      // keep whatever is already on screen rather than wiping it.
      if (json && json.offline) { showOffline(); return; }
      // A server error (5xx JSON from the error middleware) must never be
      // APPLIED as tournament data — that would wipe every board to "nog niet
      // klaar" until the next good poll.
      if (!res.ok) { showOffline(); return; }
      applyData(json, spin === true);
    } catch (e) { showOffline(); /* houd oude data */ }
  }

  // ---------- live stream (SSE) with polling fallback ----------
  // SSE gives instant updates; a background poll is the SAFETY NET that we NEVER
  // switch off. A buffering proxy can keep the SSE socket "open" while silently
  // delivering nothing — no error fires, and SSE comment-pings are invisible to
  // EventSource — which would otherwise freeze the board indefinitely. So: SSE
  // alive → slow safety poll (30s); SSE down → fast poll (12s) while the browser
  // auto-reconnects. The board can never sit frozen longer than the poll interval.
  let es = null, pollTimer = null, pollEvery = 0;
  function startPolling(ms = 12000) {
    if (pollTimer && pollEvery === ms) return;   // already polling at this cadence
    stopPolling();
    pollEvery = ms;
    pollTimer = setInterval(() => load(false), ms);
  }
  function stopPolling() { clearInterval(pollTimer); pollTimer = null; pollEvery = 0; }
  function connectStream() {
    if (!('EventSource' in window)) { startPolling(12000); return; }
    startPolling(30000);   // safety net from the very start — covers a proxy that
                            // buffers SSE from the first byte (neither update nor
                            // error ever fires, so the board would otherwise freeze).
    try {
      es = new EventSource('/api/tournament/stream');
      es.addEventListener('update', (e) => {
        try { applyData(JSON.parse(e.data), true); } catch {}
        startPolling(30000);   // SSE is delivering → keep the slow safety poll (never off)
      });
      es.onerror = () => { startPolling(12000); };  // SSE down → poll faster; browser auto-reconnects
    } catch { startPolling(12000); }
  }

  // ---------- personal team link ----------
  async function loadMyTeam() {
    const tk = teamToken();
    if (!tk) return;
    try {
      // Token via header, NOT the query string — a query token lands in server/
      // proxy access logs, defeating the deliberate #hash placement in the link.
      const res = await fetch('/api/tournament/me', { headers: { 'Authorization': 'Bearer ' + tk } });
      if (!res.ok) return;
      const j = await res.json();
      // Captain link auto-follows its team (on top of any teams already followed).
      addFollow(j.team_id, { team: { id: j.team_id, name: j.team_name, poule: j.poule } });
    } catch {}
  }
  function selectTab(p) {
    activePane = p;
    renderTabs();
    updateVisibility();
    // De brede boom moet in één blik passen op laptop/desktop (de "laptop-boom"
    // liep vroeger van het scherm af). fitBracket schaalt 'm omlaag tot hij past.
    if (p === 'ko') refitKO();
  }
  // Boom → schaal-om-te-passen; Cirkel → wheel positioneren op de huidige draai.
  function refitKO() {
    if (activePane !== 'ko') return;
    if (koView === 'cirkel') requestAnimationFrame(positionKOCircle);
    else { requestAnimationFrame(fitBracket); setTimeout(fitBracket, 120); }
  }

  // Laat de knock-out-boom in z'n geheel op het scherm passen: schaal 'm omlaag tot
  // hij binnen de breedte valt (met een leesbaarheids-vloer; wordt hij te klein, dan
  // toch centreren + horizontaal scrollen). Niet op de TV (SCREEN) — die toont 'm groot.
  function fitBracket() {
    const wrap = document.querySelector('.tn-bracket-wrap');
    const tree = wrap && wrap.querySelector('.tn-bracket');
    if (!wrap || !tree) return;
    // zoom (i.p.v. transform: scale) schaalt ÉN reflowt → geen layout-mismatch/lege ruimte.
    tree.style.zoom = ''; wrap.style.overflowX = '';
    if (SCREEN) return;
    const natW = tree.scrollWidth, avail = wrap.clientWidth;
    if (!avail || natW <= avail + 1) return;         // niet meetbaar of past al → niks doen
    const scale = Math.max(0.5, avail / natW);        // vloer 0.5 zodat tekst leesbaar blijft
    tree.style.zoom = String(scale);
    if (avail / natW < 0.5) {                         // zelfs op 0.5 te breed → centreren + scrollen
      wrap.style.overflowX = 'auto';
      wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
    }
  }
  let fitTimer = null;
  window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => { if (activePane === 'ko') refitKO(); }, 150); });
  // DRAAI-schuif van de ronde bracket → draai het wiel (badges + labels + lijnen mee).
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'tn-rot') {
      koRot = +e.target.value || 0;
      const v = document.getElementById('tn-rotval'); if (v) v.textContent = koRot + '°';
      positionKOCircle();
    }
  });
  // Overzicht-strip: tik op je team → het Mijn-paneel (met de volledige kaart).
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-goto-mijn]') && PANES.includes('mijn')) selectTab('mijn');
    const kv = e.target.closest && e.target.closest('[data-koview]');
    if (kv && kv.dataset.koview !== koView) {
      koView = kv.dataset.koview;
      try { localStorage.setItem('jvo_ko_view', koView); } catch { /* private mode */ }
      render.lastHtml = null;   // andere weergave = bewust volledige re-render
      render();
      selectTab('ko');
    }
  });

  // ---------- follow team(s) (visitor) + push for the big moments ----------
  const FOLLOW_KEY = 'jvo_follow';            // array of {id,name}
  const FOLLOW_PUSH_KEY = 'jvo_follow_push';  // '1' when push is on for this device
  const COACH_FOLLOW_KEY = 'jvo_coach_follow';// '1' zodra de eenmalige volg-coach-mark is weggeklikt (net-bord-08)
  let followBarRendered = false;
  function loadFollow() {
    try { const a = JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]'); return Array.isArray(a) ? a : (a && a.id ? [a] : []); } catch { return []; }
  }
  function saveFollow() { localStorage.setItem(FOLLOW_KEY, JSON.stringify(MYTEAMS.map(t => ({ id: t.id, name: t.name })))); }
  function teamsFromData() {
    if (!DATA || !DATA.configured) return [];
    const out = [];
    for (const p of ALL_POULES) for (const s of ((DATA.poules[p] && DATA.poules[p].standings) || [])) out.push({ id: s.id, name: s.name, poule: p });
    return out;
  }
  function pouleOfId(id) { const t = teamsFromData().find(x => x.id === id); return t ? t.poule : null; }
  function ensureMijnPane() {
    if (!MYTEAMS.length || SCREEN) return;
    document.body.classList.add('has-me');   // panes + tabs rebuild on the next render()
  }
  function addFollow(id, opts) {
    opts = opts || {};
    if (SCREEN || myIds.has(id)) return;
    const t = teamsFromData().find(x => x.id === id) || opts.team;
    if (!t) return;
    MYTEAMS.push({ id: t.id, name: t.name, poule: t.poule != null ? t.poule : pouleOfId(t.id) });
    recomputeMine();
    if (!opts.fromStorage) saveFollow();
    ensureMijnPane();
    activePane = 'mijn';
    render(); renderFollowBar(); renderSmartVisitor();
    if (localStorage.getItem(FOLLOW_PUSH_KEY) === '1') subscribeTeam(t.id);  // push on → also subscribe this team
  }
  function removeFollow(id) {
    if (localStorage.getItem(FOLLOW_PUSH_KEY) === '1') unsubscribeTeam(id);
    MYTEAMS = MYTEAMS.filter(t => t.id !== id);
    recomputeMine();
    saveFollow();
    if (!MYTEAMS.length) {
      if (activePane === 'mijn') activePane = 'overzicht';
      document.body.classList.remove('has-me');
      // The removed team's own push-subscription was just dropped (unsubscribeTeam
      // above). Don't device-wide unsubscribe here — a no-team_id unsubscribe wipes
      // EVERY team this endpoint follows, which would also kill teams you still
      // follow in another tab. Just reset the local bell so re-adding a team asks
      // for push again.
      localStorage.removeItem(FOLLOW_PUSH_KEY);
    }
    render(); renderFollowBar(); renderSmartVisitor();   // render() rebuilds panes + tabs from MYTEAMS
  }
  function renderFollowBar() {
    const el = $('tn-follow');
    if (!el || SCREEN) return;
    if (!DATA || !DATA.configured) { el.classList.remove('show'); el.innerHTML = ''; return; }
    el.classList.add('show');
    const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const pushOn = localStorage.getItem(FOLLOW_PUSH_KEY) === '1';
    const avail = teamsFromData().filter(t => !myIds.has(t.id));
    const picker = avail.length ? `
        <div class="row" style="margin-top:${MYTEAMS.length ? '10px' : '0'};">
          <select id="tn-follow-select"><option value="">${MYTEAMS.length ? 'Nog een team toevoegen…' : 'Kies een team…'}</option>${avail.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
          <button id="tn-follow-go">Volg</button>
        </div>` : '';
    if (MYTEAMS.length) {
      el.classList.remove('tn-coach');   // coach-mark hoort alleen bij de lege staat
      const chips = MYTEAMS.map(t => `<span class="tn-chip">${esc(t.name)}<button class="x" data-rm="${t.id}" aria-label="Stop met volgen">${SVG_X}</button></span>`).join('');
      el.innerHTML = `
        <div class="lbl">${MYTEAMS.length > 1 ? 'Jouw teams' : 'Jouw team'}</div>
        <div class="tn-chips">${chips}</div>
        ${picker}
        <div class="row" style="margin-top:11px; gap:8px; flex-wrap:wrap;">
          ${pushSupported
            ? `<button class="bell ${pushOn ? 'on' : ''}" id="tn-bell">${SVG_BELL}<span>${pushOn ? 'Meldingen staan aan' : 'Zet meldingen aan'}</span></button>`
            : `<span class="hint">Push-meldingen worden niet ondersteund op dit toestel.</span>`}
          <button class="bell" id="tn-share">${SVG_SHARE}<span>Deel met je team</span></button>
        </div>
        <div class="hint" style="margin-top:8px;">Je krijgt een melding bij aftrap, de uitslag en als je team verder komt. <b>Captain?</b> Tik op “Deel met je team” en stuur de link door — dan kan je hele team meldingen aanzetten.</div>`;
      el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => removeFollow(parseInt(b.dataset.rm, 10))));
      if ($('tn-bell')) $('tn-bell').addEventListener('click', () => (pushOn ? disablePushUI() : enableTeamPush(false)));
      if ($('tn-share')) $('tn-share').addEventListener('click', shareTeam);
    } else {
      // net-bord-08: eenmalige coach-mark die nieuwe bezoekers naar "volg je team" leidt.
      // Staat de JVO Smart-kaart hierboven al met diezelfde vraag ("wie kom je
      // aanmoedigen?"), dan zwijgt de coach-mark — één stem, niet twee keer hetzelfde.
      // Zelfde voorwaarde als renderSmartVisitor() (die toont de vraag bij een leeg
      // MYTEAMS) — bewust niet uit de DOM gelezen: de volgbalk rendert daar vóór.
      const smartAsking = (!SCREEN && DATA && DATA.configured);
      const coach = (!SCREEN && !smartAsking && smartOn('net-bord-08') && localStorage.getItem(COACH_FOLLOW_KEY) !== '1');
      const coachHtml = coach ? `
        <div class="tn-coachmark">
          <span class="cm-ic">${JVS_DOVE}</span>
          <span class="cm-txt"><b>Tip:</b> kies hieronder je team — dan wordt je bord persoonlijk en krijg je een seintje zodra jouw team aan de beurt is.</span>
          <button type="button" class="cm-x" id="tn-coach-x" aria-label="Tip sluiten">${SVG_X}</button>
        </div>` : '';
      el.classList.toggle('tn-coach', coach);
      el.innerHTML = `
        ${coachHtml}
        <div class="lbl">Volg je favoriete team(s)</div>
        ${picker}
        <div class="hint" style="margin-top:8px;">Je kunt meerdere teams volgen.</div>`;
      if ($('tn-coach-x')) $('tn-coach-x').addEventListener('click', () => {
        localStorage.setItem(COACH_FOLLOW_KEY, '1');
        el.classList.remove('tn-coach');
        const cm = el.querySelector('.tn-coachmark'); if (cm) cm.remove();
      });
    }
    if ($('tn-follow-go')) $('tn-follow-go').addEventListener('click', () => { const v = parseInt(($('tn-follow-select') || {}).value, 10); if (Number.isInteger(v)) addFollow(v); });
  }
  // ----- push -----
  function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64); const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function ensureSubscription() {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.register('/sw.js');
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    const { publicKey } = await (await fetch('/api/push/public-key')).json();
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
  }
  async function subscribeTeam(teamId) {
    try {
      const sub = await ensureSubscription(); if (!sub) return false;
      const res = await fetch('/api/team-follow/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId, subscription: sub.toJSON() }) });
      return res.ok;   // a 4xx/5xx (rate limit, invalid) is NOT a subscription
    } catch (e) { console.warn('subscribeTeam', e); return false; }
  }
  async function unsubscribeTeam(teamId) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) await fetch('/api/team-follow/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, team_id: teamId }) });
    } catch {}
  }
  async function disableAllPush() {
    // Only clear the local "push is on" flag when the server really dropped the
    // subscriptions — otherwise the bell says "uit" while pushes keep arriving
    // (a consent problem). On failure, tell the user to retry.
    let ok = false;
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) ok = true;   // no browser subscription → nothing can arrive
      else {
        const res = await fetch('/api/team-follow/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        ok = res.ok;
      }
    } catch {}
    if (ok) localStorage.removeItem(FOLLOW_PUSH_KEY);
    else flash('Uitzetten lukte net niet — probeer het zo nog een keer.', 'warn');
    return ok;
  }
  // Non-blocking toast (works on TV/kiosk where a native alert() would hang);
  // falls back to alert() only if the offline-UI layer isn't loaded.
  function flash(msg, kind) {
    if (window.JVONet && window.JVONet.flash) window.JVONet.flash(msg, kind || 'info');
    else alert(msg);
  }
  async function enableTeamPush(silent) {
    if (!MYTEAMS.length) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      if (!silent) flash('Dit toestel ondersteunt geen push-meldingen. Tip: op iPhone voeg je de site eerst toe aan je beginscherm.', 'warn');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { if (!silent) flash('Meldingen zijn geblokkeerd. Zet ze aan in je browser-instellingen.', 'warn'); return; }
      const sub = await ensureSubscription(); if (!sub) return;
      // Every subscribe must actually LAND on the server: a rejected request
      // (rate limit, hiccup) with the flag still set would claim "meldingen aan"
      // while the server registered nothing — a silent no-show on match day.
      let allOk = true;
      for (const t of MYTEAMS) {
        const res = await fetch('/api/team-follow/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: t.id, subscription: sub.toJSON() }) });
        if (!res.ok) allOk = false;
      }
      if (!allOk) {
        if (!silent) flash('Kon meldingen (nog) niet aanzetten — het is even druk. Probeer het over een minuutje opnieuw.', 'warn');
        return;
      }
      localStorage.setItem(FOLLOW_PUSH_KEY, '1');
      renderFollowBar();
      if (!silent) flash('Meldingen staan aan — je krijgt een seintje bij aftrap, de uitslag en als je team verder komt.', 'ok');
    } catch (e) {
      console.warn('enableTeamPush', e);
      if (!silent) flash('Kon meldingen niet aanzetten. Probeer het opnieuw.', 'warn');
    }
  }
  async function disablePushUI() { await disableAllPush(); renderFollowBar(); }

  // Share the live-app link for your followed team so the WHOLE team can follow +
  // get notifications. A captain taps this and forwards it (WhatsApp, etc.); the
  // link uses the public team id (no personal token) and pre-follows that team.
  async function shareTeam() {
    if (!MYTEAMS.length) return;
    const ids = MYTEAMS.map(t => t.id).join(',');
    const names = MYTEAMS.map(t => t.name);
    const nameStr = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(', ') + ' en ' + names[names.length - 1];
    const url = `${location.origin}/toernooi.html?volg=${ids}&push=1`;
    const text = `Volg ${nameStr} live ${eventWhere()} — en zet meldingen aan voor aftrap, uitslag en als we verder komen:`;
    if (navigator.share) {
      try { await navigator.share({ title: eventName(), text, url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }   // user cancelled the share sheet
    }
    try { await navigator.clipboard.writeText(url); flash('Link gekopieerd — plak ’m in je teamgroep (WhatsApp, etc.).', 'ok'); }
    catch { flash('Deel deze link met je team: ' + url, 'info'); }
  }

  // A shared "follow this team" link (?volg=<id>[,<id>]) auto-follows that team(s).
  function followFromQuery() {
    if (SCREEN) return;
    let ids = [];
    try { ids = (new URLSearchParams(location.search).get('volg') || '').split(',').map(s => parseInt(s, 10)).filter(Number.isInteger); } catch {}
    ids.forEach(id => { if (!myIds.has(id)) addFollow(id); });
  }

  // Arrived from an e-mail "zet meldingen aan" button (?push=1): bring the follow
  // bar into view and nudge the user to choose a team + tap the bell. We never
  // auto-enable push — the browser (rightly) requires a tap, keeping it consent-first.
  function maybePushInvite() {
    if (SCREEN) return;
    let wants = false;
    try { wants = new URLSearchParams(location.search).get('push') === '1'; } catch {}
    if (!wants) return;
    // Tidy the URL so a refresh doesn't re-trigger (keep the #team= hash).
    try { history.replaceState(null, '', location.pathname + location.hash); } catch {}
    const bar = $('tn-follow');
    if (!bar || !DATA || !DATA.configured) {
      flash('Het programma is nog niet klaar. Kom hier terug om een team te kiezen en je meldingen aan te zetten.', 'info');
      return;
    }
    bar.scrollIntoView({ behavior: 'smooth', block: 'center' });
    bar.style.transition = 'box-shadow .3s';
    bar.style.boxShadow = '0 0 0 3px rgba(255,179,71,.6)';
    setTimeout(() => { bar.style.boxShadow = ''; }, 4000);
    if (MYTEAMS.length) {
      flash('Tik op “Zet meldingen aan” voor een seintje bij aftrap, de uitslag en als je team verder komt.', 'info');
    } else {
      // Point them straight at the team-picker and open it.
      const sel = $('tn-follow-select');
      if (sel) { try { sel.focus(); } catch {} }
      flash('Kies hier een team uit de lijst “Kies een team…” en tik op “Volg”. Daarna kun je je meldingen aanzetten.', 'info');
    }
  }

  // ---------- wiring ----------
  // Tabs are rendered (and click-wired) by renderTabs() on every render().
  $('tn-refresh')?.addEventListener('click', () => load(true));

  // Delegated clicks inside the content area (survives the innerHTML rebuild on
  // every render, since only the children are replaced). Handles the group cards
  // on the overview (jump to that poule's tab) and the per-team schedule filter.
  $('tn-content')?.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto-poule]');
    if (goto) {
      selectTab(goto.dataset.gotoPoule);
      $('tn-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const filt = e.target.closest('[data-poule-filter]');
    if (filt) {
      pouleFilter[filt.dataset.pouleFilter] = filt.dataset.team || null;
      render();
    }
  });

  // Live timers tick every second.
  setInterval(tickLive, 1000);
  // Screen mode: cycle panes every 12s.
  if (SCREEN) setInterval(() => { cycleIdx = (cycleIdx + 1) % PANES.length; updateVisibility(); }, 12000);

  // net-live-02: houd het live-bord/TV-scherm wakker tijdens een wedstrijd (Screen
  // Wake Lock). Raakt het offline-kritieke pad niet en degradeert stil waar de API
  // ontbreekt. De lock lost vanzelf op als de tab verborgen raakt → re-acquire bij terugkeer.
  let wakeLock = null;
  async function acquireWakeLock() {
    if (!smartOn('net-live-02') || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* geweigerd/niet beschikbaar → stil */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquireWakeLock(); });
  acquireWakeLock();

  // React to connectivity: flag offline immediately, and pull fresh data the
  // instant the connection returns (the SSE stream also auto-reconnects).
  if (window.JVONet) {
    window.JVONet.subscribe((online) => {
      if (!online) showOffline();
      else load(false);
    });
  }

  (async () => {
    await load(false);                          // DATA first (needed to resolve followed teams)
    if (!SCREEN) {                              // the TV/screen view never follows a team
      loadFollow().forEach(t => addFollow(t.id, { fromStorage: true }));
      await loadMyTeam();                        // captain link auto-follows its team, if present
      followFromQuery();                         // ?volg=<id> shared link → follow that team
      maybePushInvite();                         // ?push=1 from an e-mail → nudge to enable push
    }
    connectStream();
  })();
})();
