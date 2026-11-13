// Sport-hub — crew-bediening van de ANDERE sporten (branch sport-hub).
// Het hoofdtoernooi blijft volledig in wedstrijd.js (met offline-wachtrij, JVO
// Smart enz.). Dit script voegt alleen toe:
//   • een sportkeuze bovenaan (alleen bij meer dan één actieve sport, na inloggen);
//   • voor een andere sport: een eenvoudig bedienpaneel — start, +/− of sets,
//     einde, correctie — direct tegen de server (nog GEEN offline-wachtrij).
// Zelfde token (jvo_crew_token) en zelfde routes als de crew-pagina; de server
// schakelt per wedstrijd door naar de juiste competitie. Alle namen via esc().
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
  const bar = $('wd-sport'), chips = $('wd-sport-chips'), hubEl = $('wd-hub'), login = $('wd-login');
  if (!bar || !chips || !hubEl) return;

  let comps = [];
  let sel = 1;              // gekozen competitie (1 = hoofdtoernooi → wedstrijd.js)
  let data = null;          // GET /api/tournament?competition=sel
  let openId = null;        // geopende wedstrijd
  let draft = null;         // { score:[a,b] } of { sets:[[a,b],…] } tijdens live bediening
  let editing = false;      // correctieformulier open → niet automatisch verversen
  let commitTimer = null, committing = null;
  try { const s = parseInt(sessionStorage.getItem('jvo_crew_sport') || '1', 10); if (s > 0) sel = s; } catch {}

  const token = () => localStorage.getItem('jvo_crew_token');
  const loggedIn = () => !!token() && login && login.classList.contains('wd-hidden');
  const comp = () => comps.find(c => c.id === sel) || null;

  async function api(path, body) {
    const r = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token() || '' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { const e = new Error('Je bent uitgelogd — log opnieuw in.'); e.auth = true; throw e; }
    if (!r.ok) { const e = new Error(j.error || 'Er ging iets mis.'); e.body = j; throw e; }
    return j;
  }

  // ── Sportkeuze ─────────────────────────────────────────────────────────────
  function renderChips() {
    chips.innerHTML = comps.map(c => `<button type="button" class="wh-chip" role="tab" data-id="${esc(c.id)}"
      aria-selected="${c.id === sel ? 'true' : 'false'}">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}${esc(c.name)}</button>`).join('');
  }
  function applyMode() {
    const show = loggedIn() && comps.length > 1;
    bar.hidden = !show;
    const hubMode = show && sel !== 1;
    document.body.classList.toggle('hub-mode', hubMode);
    hubEl.hidden = !hubMode;
    if (!hubMode) { openId = null; draft = null; editing = false; }
  }
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    sel = Number(b.dataset.id);
    try { sessionStorage.setItem('jvo_crew_sport', String(sel)); } catch {}
    openId = null; draft = null; editing = false;
    renderChips(); applyMode();
    if (sel !== 1) load();
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
  const row = (m) => `<button type="button" class="wh-m${m.status === 'live' ? ' live' : ''}" data-open="${esc(m.id)}">
      <span class="tm">${esc(m.status === 'live' ? 'Live' : (m.expected || ''))}</span>
      <span class="tt">${esc(m.a || '?')} – ${esc(m.b || '?')}<small>${esc([m.where, place(m)].filter(Boolean).join(' · '))}</small></span>
      <span class="sc">${esc(scoreText(m))}</span></button>`;

  function renderList() {
    const c = comp();
    if (!c || !data) { hubEl.innerHTML = '<p class="wh-note">Laden…</p>'; return; }
    const all = flat();
    const live = all.filter(m => m.status === 'live');
    const next = all.filter(m => m.status === 'scheduled' && m.ready).sort((a, b) => String(a.expected).localeCompare(String(b.expected)));
    const waiting = all.filter(m => m.status === 'scheduled' && !m.ready).length;
    const done = all.filter(m => m.status === 'done');
    let h = `<div class="wh-head">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : ''}<div><b>${esc(c.name)}</b>
      <span>${esc([c.team_label, data.schedule.fields ? `${data.schedule.fields}× ${data.schedule.place_noun.toLowerCase()}` : '', c.result_model === 'sets' ? `best of ${c.best_of}` : ''].filter(Boolean).join(' · '))}</span></div></div>`;
    if (data.paused) h += '<div class="wh-paused">Deze sport is even gepauzeerd: lopende wedstrijden mogen uitspelen, nieuwe niet starten.</div>';
    if (!data.configured) { hubEl.innerHTML = h + '<p class="wh-note">Er is nog geen schema voor deze sport. De organisatie maakt dat in de admin.</p>'; return; }
    h += `<div class="wh-sec">Nu bezig</div>` + (live.length ? live.map(row).join('') : '<p class="wh-note">Niets live.</p>');
    h += `<div class="wh-sec">Volgende</div>` + (next.length ? next.slice(0, 10).map(row).join('') : '<p class="wh-note">Geen wedstrijden klaar om te starten.</p>');
    if (waiting) h += `<p class="wh-note">${esc(waiting)} ${waiting === 1 ? 'wedstrijd wacht' : 'wedstrijden wachten'} op de vorige ronde.</p>`;
    if (done.length) h += `<details><summary class="wh-sec" style="cursor:pointer">Klaar (${esc(done.length)})</summary>${done.map(row).join('')}</details>`;
    if (Array.isArray(data.final_standing) && data.final_standing.length) {
      h += `<div class="wh-sec">Eindstand</div><p class="wh-note">${data.final_standing.slice(0, 3).map(t => `${esc(t.pos)}. ${esc(t.name)}`).join(' · ')}</p>`;
    }
    hubEl.innerHTML = h;
  }

  // ── Bediening van één wedstrijd ────────────────────────────────────────────
  const current = () => flat().find(m => m.id === openId) || null;
  function setAlert(msg) { const a = $('wh-alert'); if (a) a.textContent = msg || ''; }

  function renderControl() {
    const m = current();
    const c = comp();
    if (!m || !c) { openId = null; renderList(); return; }
    const v = data.vocab || {};
    const sets = c.result_model === 'sets';
    const head = `<button type="button" class="wh-back" data-back>← Alle wedstrijden</button>
      <div class="wh-card"><div class="wh-ctx">${esc([c.name, m.where, place(m), m.status === 'scheduled' ? (m.expected || '') : ''].filter(Boolean).join(' · '))}</div>`;
    let body = '';
    if (m.status === 'scheduled') {
      body += `<div class="wh-team"><span class="nm">${esc(m.a || '?')}</span></div><div class="wh-team"><span class="nm">${esc(m.b || '?')}</span></div>`;
      body += `<div class="wh-actions">${m.ready ? `<button type="button" class="btn full" data-act="start">${esc(v.start || 'Start')} →</button>` : '<p class="wh-note">Wacht op de vorige ronde.</p>'}</div>`;
    } else if (m.status === 'live' && !editing) {
      if (!draft) draft = sets ? { sets: (Array.isArray(m.sets) && m.sets.length ? m.sets : [[0, 0]]).map(s => [s[0], s[1]]) } : { score: [m.score_a || 0, m.score_b || 0] };
      if (sets) {
        const cur = draft.sets[draft.sets.length - 1];
        const prev = draft.sets.slice(0, -1);
        body += `<div class="wh-sets">${prev.length ? `Gespeeld: ${esc(prev.map(s => `${s[0]}–${s[1]}`).join(' · '))}` : 'Eerste set'}</div>
          <div class="wh-ctx" style="margin-top:12px">Set ${esc(draft.sets.length)}</div>
          <div class="wh-team"><span class="nm">${esc(m.a)}</span><span class="wh-step"><button type="button" data-step="0,-1" aria-label="Punt eraf voor ${esc(m.a)}">−</button><b>${esc(cur[0])}</b><button type="button" data-step="0,1" aria-label="Punt erbij voor ${esc(m.a)}">+</button></span></div>
          <div class="wh-team"><span class="nm">${esc(m.b)}</span><span class="wh-step"><button type="button" data-step="1,-1" aria-label="Punt eraf voor ${esc(m.b)}">−</button><b>${esc(cur[1])}</b><button type="button" data-step="1,1" aria-label="Punt erbij voor ${esc(m.b)}">+</button></span></div>
          <div class="wh-actions">
            ${draft.sets.length < c.best_of ? '<button type="button" class="btn ghost full" data-act="nextset">Set klaar → volgende set</button>' : ''}
            <button type="button" class="btn full" data-act="end">${esc(v.end || 'Einde wedstrijd')}</button>
          </div>`;
      } else {
        const sc = draft.score;
        const tie = m.phase !== 'group' && sc[0] === sc[1];
        body += `<div class="wh-team"><span class="nm">${esc(m.a)}</span><span class="wh-step"><button type="button" data-step="0,-1" aria-label="Eraf voor ${esc(m.a)}">−</button><b>${esc(sc[0])}</b><button type="button" data-step="0,1" aria-label="Erbij voor ${esc(m.a)}">+</button></span></div>
          <div class="wh-team"><span class="nm">${esc(m.b)}</span><span class="wh-step"><button type="button" data-step="1,-1" aria-label="Eraf voor ${esc(m.b)}">−</button><b>${esc(sc[1])}</b><button type="button" data-step="1,1" aria-label="Erbij voor ${esc(m.b)}">+</button></span></div>
          ${tie ? `<div class="wh-pens"><label>Gelijk in de knock-out — ${esc((v.tiebreak || 'beslissing').toLowerCase())}:</label>
            <input type="number" id="wh-pa" min="0" max="99" inputmode="numeric" aria-label="${esc(v.tiebreak || 'Beslissing')} ${esc(m.a)}" />
            <input type="number" id="wh-pb" min="0" max="99" inputmode="numeric" aria-label="${esc(v.tiebreak || 'Beslissing')} ${esc(m.b)}" /></div>` : ''}
          <div class="wh-actions"><button type="button" class="btn full" data-act="end">${esc(v.end || 'Einde wedstrijd')}</button></div>`;
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
    hubEl.innerHTML = head + body + '<div class="wh-alert" id="wh-alert" role="alert"></div></div>';
  }

  function render() { if (openId != null) renderControl(); else renderList(); }

  // Live-stand vastleggen (absoluut, na een korte pauze in het tikken).
  function scheduleCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, 700);
  }
  async function commit() {
    clearTimeout(commitTimer); commitTimer = null;
    if (!draft || openId == null) return;
    const body = draft.sets ? { sets: draft.sets } : { score_a: draft.score[0], score_b: draft.score[1] };
    committing = api(`/api/admin/tournament/match/${openId}/setscore`, body)
      .then((j) => { data = j; setAlert(''); })
      .catch((e) => setAlert(e.message));
    await committing; committing = null;
  }

  const num = (id) => { const el = $(id); const n = el ? parseInt(el.value, 10) : NaN; return Number.isInteger(n) ? n : null; };

  hubEl.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.open) { openId = Number(t.dataset.open); draft = null; editing = false; renderControl(); return; }
    if (t.hasAttribute('data-back')) { if (commitTimer) await commit(); openId = null; draft = null; editing = false; renderList(); return; }
    if (t.dataset.step && draft) {
      const [side, d] = t.dataset.step.split(',').map(Number);
      const arr = draft.sets ? draft.sets[draft.sets.length - 1] : draft.score;
      arr[side] = Math.max(0, Math.min(99, arr[side] + d));
      renderControl(); scheduleCommit();
      return;
    }
    const act = t.dataset.act;
    if (!act) return;
    t.disabled = true;
    try {
      if (act === 'start') { data = await api(`/api/admin/tournament/match/${openId}/start`, {}); draft = null; }
      if (act === 'nextset') {
        const cur = draft.sets[draft.sets.length - 1];
        if (cur[0] === cur[1]) { setAlert('Een set heeft een winnaar nodig voordat de volgende begint.'); t.disabled = false; return; }
        draft.sets.push([0, 0]);
        await commit();
      }
      if (act === 'end') {
        if (commitTimer) await commit();
        if (committing) await committing;
        const body = draft && draft.sets ? { sets: draft.sets } : {};
        if (draft && draft.score && $('wh-pa')) {
          const pa = num('wh-pa'), pb = num('wh-pb');
          if (pa == null || pb == null || pa === pb) { setAlert('Vul twee verschillende getallen in voor de beslissing.'); t.disabled = false; return; }
          body.pens_a = pa; body.pens_b = pb;
        }
        data = await api(`/api/admin/tournament/match/${openId}/end`, body);
        draft = null;
      }
      if (act === 'edit') { editing = true; }
      if (act === 'cancel') { editing = false; }
      if (act === 'save') {
        const c = comp();
        let body;
        if (c.result_model === 'sets') {
          const sets = [];
          for (let i = 0; i < c.best_of; i++) {
            const a = num(`wh-s${i}a`), b = num(`wh-s${i}b`);
            if (a == null && b == null) continue;
            sets.push([a || 0, b || 0]);
          }
          body = { sets };
        } else {
          body = { score_a: num('wh-ca'), score_b: num('wh-cb') };
          if ($('wh-pa') && num('wh-pa') != null) { body.pens_a = num('wh-pa'); body.pens_b = num('wh-pb'); }
        }
        data = await api(`/api/admin/tournament/match/${openId}/setscore`, body);
        editing = false;
      }
      renderControl();
    } catch (err) {
      setAlert(err.message);
      t.disabled = false;
    }
  });

  // ── Laden ──────────────────────────────────────────────────────────────────
  async function load() {
    if (sel === 1 || !loggedIn()) return;
    try {
      const r = await fetch(`/api/tournament?competition=${encodeURIComponent(sel)}`, { cache: 'no-store' });
      if (!r.ok) return;
      data = await r.json();
      // Tijdens tikken (draft) of corrigeren niet onder de vingers verversen.
      if (!editing && !(openId != null && draft && commitTimer)) render();
    } catch { /* offline: laatste stand blijft staan */ }
  }
  async function init() {
    try {
      const r = await fetch('/api/competitions');
      const j = r.ok ? await r.json() : null;
      comps = j && Array.isArray(j.competitions) ? j.competitions : [];
    } catch { comps = []; }
    if (!comps.some(c => c.id === sel)) sel = 1;
    renderChips(); applyMode();
    if (sel !== 1) load();
  }
  // Inloggen/uitloggen in wedstrijd.js wisselt de klasse op #wd-login.
  if (login) new MutationObserver(() => { applyMode(); if (sel !== 1) load(); }).observe(login, { attributes: true, attributeFilter: ['class'] });
  try { new EventSource('/api/tournament/stream').addEventListener('update', () => { if (sel !== 1) setTimeout(load, 300); }); } catch {}
  setInterval(load, 10000);
  init();
})();
