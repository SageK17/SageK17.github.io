// Sport-hub (branch sport-hub) — admin-blok "Sporten & competities".
// Competities aanmaken/bewerken/verwijderen, en per extra sport genereren,
// pauzeren en resetten. Het hoofdtoernooi (competitie 1) houdt zijn eigen
// blokken (Opzet & genereren, Tijdschema …); hier alleen naam/icoon/teamgrootte.
// Alles via de admin-token (adminAuth op de server); namen via esc().
(() => {
  const $ = (id) => document.getElementById(id);
  const list = $('hub-list'), wrap = $('hub-form-wrap'), msg = $('hub-msg'), badge = $('hub-badge');
  if (!list || !wrap) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
  const token = () => localStorage.getItem('jvo_admin_token');
  let meta = { competitions: [], sports: [], place_nouns: [], formats: [] };

  // Via de api() van admin.js als die er is: die herkent een verlopen sessie (401)
  // en stuurt je naar het inlogscherm, in plaats van een kale foutregel.
  async function api(method, path, body) {
    const A = window.JVO_ADMIN;
    const opts = { method, body: body === undefined ? undefined : JSON.stringify(body) };
    let r;
    try {
      r = A && A.api ? await A.api(path, opts)
        : await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-token': token() || '' } });
    } catch (e) {
      // Geen kale browsertekst ("Failed to fetch") op het scherm. Een verlopen sessie
      // is geen verbindingsfout: die gaat ongewijzigd door.
      if (e && e.message === 'Sessie verlopen') throw e;
      throw new Error('Geen verbinding. Probeer het zo opnieuw.');
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Er ging iets mis (${r.status}).`); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  const say = (text, err) => { msg.textContent = text || ''; msg.classList.toggle('err', !!err); };

  function line(c) {
    const bits = [];
    if (c.team_label) bits.push(c.team_label);
    bits.push(`${c.approved}/${c.max_teams} ${c.unit} goedgekeurd`);
    if (c.waiting) bits.push(`${c.waiting} wachtend`);
    bits.push(`${c.places}× ${String(c.place_noun).toLowerCase()}`);
    bits.push(c.result_model === 'sets' ? `sets · best of ${c.best_of}` : 'gewone stand');
    if (!c.is_default) bits.push(`start ${c.start_time} · ${c.match_min}+${c.break_min} min`);
    return bits.join(' · ');
  }

  function render() {
    const comps = meta.competitions;
    // Teamkaarten in het Teams-tabblad tonen de sport zodra er meer dan één is.
    window.JVO_HUB_NAMES = comps.length > 1 ? Object.fromEntries(comps.map(c => [c.id, c.name])) : null;
    if (badge) { badge.hidden = comps.length < 2; badge.textContent = `${comps.length} sporten`; }
    list.innerHTML = comps.map(c => {
      const status = c.matches ? `Schema staat (${c.matches} wedstrijden)` : 'Nog geen schema';
      const fmts = meta.formats.map(f => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('');
      return `<div class="hub-c" data-id="${esc(c.id)}">
        <div class="hub-c-top">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" />` : '<span></span>'}
          <div><b>${esc(c.name)}${c.is_default ? ' · hoofdtoernooi' : ''}${c.active ? '' : ' · inactief'}${c.paused ? ' · gepauzeerd' : ''}</b>
          <span>${esc(line(c))}</span><span>${esc(status)}</span></div></div>
        <div class="hub-c-act">
          <button type="button" class="btn-sm" data-act="edit">Bewerken</button>
          ${c.is_default ? '' : `
            <select data-fmt aria-label="Opzet voor ${esc(c.name)}"><option value="auto">Opzet: automatisch</option>${fmts}</select>
            <button type="button" class="btn-sm primary" data-act="generate">${c.matches ? 'Opnieuw genereren' : 'Genereer schema'}</button>
            ${c.matches ? `<button type="button" class="btn-sm" data-act="${c.paused ? 'resume' : 'pause'}">${c.paused ? 'Hervat' : 'Pauze'}</button>
              <button type="button" class="btn-sm danger" data-act="reset">Reset</button>` : ''}
            <button type="button" class="btn-sm danger" data-act="delete">Verwijderen</button>`}
        </div></div>`;
    }).join('') || '<p class="small">Nog geen competities.</p>';
  }

  // `existing` = een bestaande competitie (bewerken). `preset` = alleen voorinvullen
  // voor een NIEUWE sport (de voorinstellingen van het Regie-scherm): zelfde velden,
  // maar het formulier blijft "toevoegen" en krijgt geen id mee.
  function formHtml(existing, preset) {
    const c = existing || preset || null;
    const isNew = !existing;
    const isDef = !!(existing && existing.is_default);
    const v = (k, d = '') => esc(c && c[k] != null ? c[k] : d);
    const opt = (arr, cur) => arr.map(x => `<option value="${esc(x)}"${String(cur) === String(x) ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const sets = c ? c.result_model === 'sets' : false;
    return `<form class="hub-form" id="hub-form" data-id="${existing ? esc(existing.id) : ''}">
      <label class="wide">Naam<input name="name" maxlength="40" required value="${v('name')}" placeholder="Bijv. Tafeltennis" /></label>
      <label>Sport-icoon<select name="sport">${opt(meta.sports, c ? c.sport : 'beker')}</select></label>
      <label>Teamgrootte (tegen elkaar)<input name="team_size" type="number" min="1" max="15" value="${v('team_size')}" placeholder="bv. 5 = 5 tegen 5" /></label>
      <label>Min. spelers per aanmelding<input name="min_players" type="number" min="1" max="40" value="${v('min_players', 1)}" /></label>
      <label>Max. spelers per aanmelding<input name="max_players" type="number" min="1" max="40" value="${v('max_players', 8)}" /></label>
      <label>Maximum teams<input name="max_teams" type="number" min="2" max="64" value="${v('max_teams', 16)}" /></label>
      <label>Plek heet<select name="place_noun">${opt(meta.place_nouns, c ? c.place_noun : 'Veld')}</select></label>
      ${isDef ? '<p class="small wide">Velden, wedstrijdduur en starttijd van het hoofdtoernooi stel je in bij "Tijdschema".</p>' : `
      <label>Aantal plekken<input name="places" type="number" min="1" max="12" value="${v('places', 2)}" /></label>
      <label>Starttijd<input name="start_time" type="time" value="${v('start_time', '13:30')}" /></label>
      <label>Wedstrijdduur (min)<input name="match_min" type="number" min="1" max="90" value="${v('match_min', 10)}" /></label>
      <label>Wisseltijd (min)<input name="break_min" type="number" min="0" max="60" value="${v('break_min', 2)}" /></label>
      <label>Uitslag<select name="result_model"><option value="score"${sets ? '' : ' selected'}>Gewone stand (doelpunten/punten)</option><option value="sets"${sets ? ' selected' : ''}>Sets (geen gelijkspel)</option></select></label>
      <label>Best of (sets)<select name="best_of">${opt([1, 3, 5, 7], c ? c.best_of : 3)}</select></label>
      <label>Punten per set (0 = op tijd)<input name="set_points" type="number" min="0" max="99" value="${v('set_points', 25)}" /></label>
      <label>Punten beslissende set<input name="deciding_points" type="number" min="0" max="99" value="${v('deciding_points', 15)}" /></label>`}
      <label class="chk wide"><input type="checkbox" name="active"${isNew || c.active ? ' checked' : ''} /> Actief (zichtbaar bij aanmelden en op het bord)</label>
      <div class="hub-c-act wide"><button type="submit" class="btn-sm primary">${isNew ? 'Sport toevoegen' : 'Opslaan'}</button><button type="button" class="btn-sm" data-act="close">Annuleren</button></div>
    </form>`;
  }

  async function load() {
    if (!token()) return;
    try { meta = await api('GET', '/api/admin/competitions'); render(); }
    catch (e) { list.innerHTML = `<p class="small">${esc(e.message)}</p>`; }
  }

  // Voorinstellingen per sport: alleen voorinvullen van het formulier hierboven. Eén
  // lijst voor "+ Nieuwe sport" hier en voor "Sport toevoegen" in de Regie.
  const PRESETS = [
    { sport: 'voetbal', name: 'Voetbal', team_size: 5, min_players: 5, max_players: 8, max_teams: 12, place_noun: 'Veld', places: 2, match_min: 12, break_min: 3, result_model: 'score', sub: '5 tegen 5' },
    { sport: 'volleybal', name: 'Volleybal', team_size: 4, min_players: 4, max_players: 6, max_teams: 8, place_noun: 'Veld', places: 2, match_min: 20, break_min: 5, result_model: 'sets', best_of: 3, set_points: 25, deciding_points: 15, sub: '4 tegen 4 · sets' },
    { sport: 'basketbal', name: 'Basketbal', team_size: 3, min_players: 3, max_players: 5, max_teams: 8, place_noun: 'Court', places: 1, match_min: 10, break_min: 2, result_model: 'score', sub: '3 tegen 3' },
    { sport: 'tafeltennis', name: 'Tafeltennis', team_size: 1, min_players: 1, max_players: 1, max_teams: 16, place_noun: 'Tafel', places: 4, match_min: 10, break_min: 2, result_model: 'sets', best_of: 3, set_points: 11, deciding_points: 11, sub: '1 tegen 1 · sets' },
    { sport: 'badminton', name: 'Badminton', team_size: 2, min_players: 2, max_players: 2, max_teams: 16, place_noun: 'Baan', places: 3, match_min: 12, break_min: 3, result_model: 'sets', best_of: 3, set_points: 21, deciding_points: 21, sub: '2 tegen 2 · sets' },
    { sport: 'hockey', name: 'Hockey', team_size: 6, min_players: 6, max_players: 9, max_teams: 8, place_noun: 'Veld', places: 1, match_min: 15, break_min: 3, result_model: 'score', sub: '6 tegen 6' },
    { sport: 'padel', name: 'Padel', team_size: 2, min_players: 2, max_players: 2, max_teams: 12, place_noun: 'Baan', places: 2, match_min: 20, break_min: 5, result_model: 'sets', best_of: 3, set_points: 6, deciding_points: 6, sub: '2 tegen 2 · sets' },
  ];
  // Alleen sporten waar deze installatie een icoon voor heeft.
  const presets = () => PRESETS.filter(p => !meta.sports.length || meta.sports.includes(p.sport));
  // `taken` = de bestaande competities (voor een unieke naam), `start` = starttijd van de dag.
  function presetObj(p, taken, start) {
    const names = new Set((taken || meta.competitions).map(c => String(c.name).toLowerCase()));
    let name = p.name, n = 2;
    while (names.has(name.toLowerCase())) name = `${p.name} ${n++}`;
    const { sub, ...rest } = p;
    return { best_of: 3, set_points: 25, deciding_points: 15, ...rest, name, start_time: /^\d{2}:\d{2}$/.test(start || '') ? start : '13:30' };
  }

  // "+ Nieuwe sport": eerst kiezen (een voorinstelling zet uitslag, plek en punten
  // meteen goed), dan het formulier. "Iets anders" geeft het lege formulier.
  $('hub-new')?.addEventListener('click', () => {
    say('');
    wrap.innerHTML = `<div class="hub-presets" role="group" aria-label="Kies een voorinstelling">
        <p class="small">Kies een sport: het formulier is dan al ingevuld. Je kunt daarna alles nog aanpassen.</p>
        <div class="hub-c-act">${presets().map(p => `<button type="button" class="btn-sm" data-preset="${esc(p.sport)}">${esc(p.name)} · ${esc(p.sub)}</button>`).join('')}
          <button type="button" class="btn-sm" data-preset="">Iets anders</button></div>
      </div>`;
    wrap.querySelector('[data-preset]')?.focus();
  });

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]')) { wrap.innerHTML = ''; return; }
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS.find(x => x.sport === b.dataset.preset);
    wrap.innerHTML = formHtml(null, p ? presetObj(p) : null);
    wrap.querySelector('input[name="name"]')?.focus();
  });
  // Formulier opslaan (nieuw of bestaand). Gooit een Error met de servermelding.
  async function saveForm(f) {
    const id = f.dataset.id;
    const body = {};
    // Bewerken: alleen de velden meesturen die je zelf hebt veranderd. Zo zet wie als tweede
    // opslaat de wijziging van een collega (bv. de wedstrijdduur) niet stil terug.
    const zelfde = (el) => (el.type === 'checkbox' ? el.checked === el.defaultChecked
      : el.tagName === 'SELECT' ? [...el.options].every(o => o.selected === o.defaultSelected)
      : el.value === el.defaultValue);
    for (const el of f.elements) {
      if (!el.name) continue;
      if (id && zelfde(el)) continue;
      if (el.type === 'checkbox') body[el.name] = el.checked;
      else if (el.type === 'number') { if (el.value !== '') body[el.name] = parseInt(el.value, 10); else if (el.name === 'team_size') body[el.name] = null; }
      else if (el.name === 'best_of') body[el.name] = parseInt(el.value, 10);
      else body[el.name] = el.value;
    }
    const j = id ? await api('PUT', `/api/admin/competitions/${encodeURIComponent(id)}`, body)
      : await api('POST', '/api/admin/competitions', body);
    load();
    return { id: id ? Number(id) : (j.competition && j.competition.id), isNew: !id, name: body.name || (j.competition && j.competition.name) || (f.elements.name && f.elements.name.value) || '', competition: j.competition || null };
  }
  wrap.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await saveForm(e.target);
      wrap.innerHTML = '';
      say(r.isNew ? 'Sport toegevoegd.' : 'Opgeslagen.');
      if (window.JVO_REGIE) window.JVO_REGIE.refresh();
    } catch (err) { say(err.message, true); }
  });

  // Schema (opnieuw) maken voor een extra sport. De server vraagt om `force` als er
  // al een schema staat, en om een extra bevestiging zodra er wedstrijden bezig of
  // gespeeld zijn — dezelfde "typ WIS"-drempel als het hoofdtoernooi.
  async function generateFor(c, format) {
    const has = !!(typeof c.matches === 'object' ? c.matches.total : c.matches);
    const body = { competition_id: c.id, format: format || 'auto', force: has };
    try { return await api('POST', '/api/admin/tournament/generate', body); }
    catch (err) {
      if (!(err.status === 409 && err.body && err.body.needs_confirm)) throw err;
      const n = err.body.played;
      const typed = prompt(`Bij ${c.name} ${n === 1 ? 'is al 1 wedstrijd' : `zijn al ${n} wedstrijden`} bezig of gespeeld.\n\nOpnieuw genereren wist alle uitslagen van deze sport. Dat kun je niet terugdraaien.\n\nTyp WIS om door te gaan.`);
      if (typed == null) return null;
      if (typed.trim().toUpperCase() !== 'WIS') { const e2 = new Error('Niet gewist: je typte geen WIS.'); e2.cancelled = true; throw e2; }
      return await api('POST', '/api/admin/tournament/generate', { ...body, confirm: true });
    }
  }

  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const card = b.closest('[data-id]');
    const id = Number(card.dataset.id);
    const c = meta.competitions.find(x => x.id === id);
    if (!c) return;
    const act = b.dataset.act;
    if (act === 'edit') { wrap.innerHTML = formHtml(c); say(''); wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    try {
      if (act === 'generate') {
        const format = card.querySelector('[data-fmt]').value;
        if (c.matches && !confirm(`Het schema van ${c.name} opnieuw maken? De indeling en alle tijden worden opnieuw bepaald.`)) return;
        const out = await generateFor(c, format);
        if (!out) return;
        say(out.warning ? `Schema voor ${c.name} gemaakt. Let op: ${out.warning}` : `Schema voor ${c.name} gemaakt.`);
      } else if (act === 'reset') {
        if (!confirm(`Het schema en alle uitslagen van ${c.name} wissen? De aanmeldingen blijven staan.`)) return;
        await api('POST', '/api/admin/tournament/reset', { competition_id: id });
        say(`${c.name} is leeggemaakt.`);
      } else if (act === 'pause' || act === 'resume') {
        await api('POST', `/api/admin/tournament/${act}`, { competition_id: id });
        say(act === 'pause' ? `${c.name} gepauzeerd.` : `${c.name} hervat.`);
      } else if (act === 'delete') {
        if (!confirm(`${c.name} verwijderen?`)) return;
        await api('DELETE', `/api/admin/competitions/${id}`);
        say(`${c.name} verwijderd.`);
      }
      load();
      if (window.JVO_REGIE) window.JVO_REGIE.refresh();
    } catch (err) { say(err.message, true); }
  });

  // Voor admin-regie.js: zelfde formulier en dezelfde opslag, elders op het scherm.
  window.JVO_HUB = { getMeta: () => meta, formHtml, saveForm, generateFor, load, isIcon, presets, presetObj };

  // Na inloggen (admin.js zet de token) en bij het openen van het blok verversen.
  $('hub-fold')?.addEventListener('toggle', (e) => { if (e.target.open) load(); });
  let tries = 0;
  const wait = setInterval(() => { if (token() || ++tries > 60) { clearInterval(wait); load(); } }, 1000);
  load();
})();
