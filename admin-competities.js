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

  async function api(method, path, body) {
    const r = await fetch(path, {
      method, headers: { 'content-type': 'application/json', 'x-admin-token': token() || '' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Er ging iets mis (${r.status}).`);
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

  function formHtml(c) {
    const isDef = !!(c && c.is_default);
    const v = (k, d = '') => esc(c && c[k] != null ? c[k] : d);
    const opt = (arr, cur) => arr.map(x => `<option value="${esc(x)}"${String(cur) === String(x) ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const sets = c ? c.result_model === 'sets' : false;
    return `<form class="hub-form" id="hub-form" data-id="${c ? esc(c.id) : ''}">
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
      <label class="chk wide"><input type="checkbox" name="active"${!c || c.active ? ' checked' : ''} /> Actief (zichtbaar bij aanmelden en op het bord)</label>
      <div class="hub-c-act wide"><button type="submit" class="btn-sm primary">${c ? 'Opslaan' : 'Sport toevoegen'}</button><button type="button" class="btn-sm" data-act="close">Annuleren</button></div>
    </form>`;
  }

  async function load() {
    if (!token()) return;
    try { meta = await api('GET', '/api/admin/competitions'); render(); }
    catch (e) { list.innerHTML = `<p class="small">${esc(e.message)}</p>`; }
  }

  $('hub-new')?.addEventListener('click', () => { wrap.innerHTML = formHtml(null); say(''); wrap.querySelector('input[name="name"]')?.focus(); });

  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]')) wrap.innerHTML = ''; });
  wrap.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const id = f.dataset.id;
    const body = {};
    for (const el of f.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') body[el.name] = el.checked;
      else if (el.type === 'number') { if (el.value !== '') body[el.name] = parseInt(el.value, 10); else if (el.name === 'team_size') body[el.name] = null; }
      else if (el.name === 'best_of') body[el.name] = parseInt(el.value, 10);
      else body[el.name] = el.value;
    }
    try {
      if (id) await api('PUT', `/api/admin/competitions/${encodeURIComponent(id)}`, body);
      else await api('POST', '/api/admin/competitions', body);
      wrap.innerHTML = '';
      say(id ? 'Opgeslagen.' : 'Sport toegevoegd.');
      load();
    } catch (err) { say(err.message, true); }
  });

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
        if (c.matches && !confirm(`Het schema van ${c.name} opnieuw maken? Alle uitslagen van deze sport gaan verloren.`)) return;
        await api('POST', '/api/admin/tournament/generate', { competition_id: id, format, force: !!c.matches });
        say(`Schema voor ${c.name} gemaakt.`);
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
    } catch (err) { say(err.message, true); }
  });

  // Na inloggen (admin.js zet de token) en bij het openen van het blok verversen.
  $('hub-fold')?.addEventListener('toggle', (e) => { if (e.target.open) load(); });
  let tries = 0;
  const wait = setInterval(() => { if (token() || ++tries > 60) { clearInterval(wait); load(); } }, 1000);
  load();
})();
