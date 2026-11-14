// Sport-hub live-bord (/sporten): "Nu bezig" over alle sporten heen, met een tab
// "Alles" en een tab per competitie. Leest GET /api/hub (publiek).
// Verversen: een seintje van de lichte stream (/api/tournament/stream?lite=1; valt
// terug op de gewone stream) → /api/hub ophalen op een willekeurig moment 0–1,5 s
// later (niet alle telefoons tegelijk), snelle seintjes samengevoegd, nooit vaker
// dan eens per seconde. Valt de stream weg, dan elke 20 s.
// Directe link naar één sport: /sporten?sport=<id> of /sporten#sport-<id>.
// Volg je team: opt-in push via de bestaande /api/team-follow/*-routes (zelfde als
// het bord van het hoofdtoernooi); eigen opslag, zodat de twee borden elkaars
// volglijst niet opschonen. ?volg=<id>[,<id>]&push=1 (uit een mail) zet het team
// klaar en wijst de knop aan — aanzetten gebeurt nooit vanzelf.
// Regels: elke naam/tekst van de server gaat door esc() vóór innerHTML; geen
// sportnamen in deze code — alles komt uit de competitie-instellingen.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeIcon = (u) => (/^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || '')) ? u : '/sport/beker-klein.webp');
  let data = null;
  let tab = 'alles';
  let skew = 0;   // server_now - Date.now(), voor de live-minuut
  let stale = false;   // laatste antwoord kwam uit de offline-cache
  try { const t = sessionStorage.getItem('jvo_sporten_tab'); if (t) tab = t; } catch {}
  // Een link uit een mail of de admin wint van het laatst gekozen tabblad.
  function tabFromUrl() {
    try {
      const q = new URLSearchParams(location.search).get('sport');
      const h = /^#sport-(\d+)$/.exec(location.hash || '');
      const v = h ? h[1] : (q && /^\d+$/.test(q) ? q : null);
      return v;
    } catch { return null; }
  }
  { const v = tabFromUrl(); if (v) tab = v; }
  function rememberTab() {
    try { sessionStorage.setItem('jvo_sporten_tab', tab); } catch {}
    // Adresbalk laten meelopen, zodat doorsturen de juiste sport opent.
    try {
      const u = new URL(location.href);
      u.hash = '';
      if (tab === 'alles') u.searchParams.delete('sport'); else u.searchParams.set('sport', tab);
      history.replaceState(null, '', u.pathname + u.search);
    } catch {}
  }

  const tsMs = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + 'Z') : null);
  const setsLine = (sets) => (Array.isArray(sets) && sets.length ? sets.map(s => `${s[0]}–${s[1]}`).join(' · ') : '');
  const compOf = (id) => (data ? data.competitions.find(c => c.id === id) : null);

  function liveLabel(c) {
    if (c.status === 'done') return '<em class="klaar">Klaar</em>';
    if (c.status !== 'live') return c.expected ? `<em class="klaar">${esc(c.expected)}</em>` : '';
    if (c.model === 'sets') return `<em>Live set ${Array.isArray(c.sets) && c.sets.length ? c.sets.length : 1}</em>`;
    const st = tsMs(c.started_at);
    const min = st ? Math.max(0, Math.floor((Date.now() + skew - st) / 60000)) : 0;
    return `<em>Live ${min}′</em>`;
  }

  function kaart(c) {
    const where = [c.comp_name, c.where].filter(Boolean).map(esc).join(' · ');
    const mijn = isMine(c.comp_id, c.a) || isMine(c.comp_id, c.b);
    const sa = c.score_a == null ? '' : c.score_a, sb = c.score_b == null ? '' : c.score_b;
    const winA = c.status === 'done' && (c.score_a > c.score_b || (c.score_a === c.score_b && c.pens_a > c.pens_b));
    const winB = c.status === 'done' && (c.score_b > c.score_a || (c.score_a === c.score_b && c.pens_b > c.pens_a));
    const extra = setsLine(c.sets) || (c.pens_a != null && c.pens_b != null ? `n.p. ${c.pens_a}–${c.pens_b}` : '');
    const plek = c.field ? `${esc(c.place_noun)} ${esc(c.field)}` : '';
    return `<article class="kaart" aria-label="${esc(c.a || '?')} tegen ${esc(c.b || '?')}">
      <div class="l">
        <div class="k mono">${liveLabel(c)} ${where}${mijn ? ' <em class="mijn">Jouw team</em>' : ''}</div>
        <div class="tm${winA ? ' win' : ''}"><span>${esc(c.a || 'Nog onbekend')}</span><b>${esc(sa)}</b></div>
        <div class="tm${winB ? ' win' : ''}"><span>${esc(c.b || 'Nog onbekend')}</span><b>${esc(sb)}</b></div>
        ${extra ? `<div class="sets">${esc(extra)}</div>` : ''}
      </div>
      <div class="r"><span class="badge"><img src="${esc(safeIcon(c.icon_small))}" alt="" /></span><span class="mono">${plek}</span></div>
    </article>`;
  }

  function straks(list) {
    if (!list.length) return '';
    return `<div class="lbl mono">Straks</div>` + list.map(c => `
      <div class="sr${isMine(c.comp_id, c.a) || isMine(c.comp_id, c.b) ? ' mijn' : ''}"><b>${esc(c.expected || '')}</b><img src="${esc(safeIcon(c.icon_small))}" alt="${esc(c.comp_name)}" />
        <span>${esc(c.a || 'Nog onbekend')} – ${esc(c.b || 'Nog onbekend')}</span>
        <i class="mono">${c.field ? `${esc(c.place_noun)} ${esc(c.field)}` : ''}</i></div>`).join('');
  }

  function standen(comp) {
    const ps = Object.keys(comp.poules || {}).sort();
    if (!ps.length) return '';
    const sets = comp.result_model === 'sets';
    return `<div class="lbl mono">Stand</div>` + ps.map(p => {
      const rows = comp.poules[p].standings || [];
      return `<section class="stand" aria-label="Stand poule ${esc(p)}">
        <h3>${ps.length > 1 ? `Poule ${esc(p)}` : 'Poule'}<i>${sets ? 'gs · pnt · sets' : 'gs · pnt · saldo'}</i></h3>
        <div class="srow kop" aria-hidden="true"><span>#</span><span>Naam</span><span class="n">Gs</span><span class="n">Pnt</span><span class="n">±</span></div>
        ${rows.map(s => `<div class="srow${myIds().has(s.id) ? ' mijn' : ''}"><span>${esc(s.pos)}</span><em>${esc(s.name)}</em><span class="n">${esc(s.gp)}</span><b>${esc(s.pts)}</b><span class="n">${s.gd > 0 ? '+' : ''}${esc(s.gd)}</span></div>`).join('')}
      </section>`;
    }).join('');
  }

  function eindstand(comp) {
    const fs = comp.final_standing;
    if (!Array.isArray(fs) || !fs.length) return '';
    return `<div class="lbl mono">Eindstand</div><div class="podium">` + fs.slice(0, 4).map(t =>
      `<div class="plek p${esc(t.pos)}"><b>${esc(t.pos)}</b><span>${esc(t.name)}</span></div>`).join('') + `</div>`;
  }

  function knockout(comp) {
    const ko = comp.knockout || [];
    if (!ko.length) return '';
    const cards = ko.map(k => ({
      comp_id: comp.id, comp_name: '', icon_small: comp.icon_small, place_noun: comp.place_noun, model: comp.result_model,
      where: k.where, a: k.a ? (k.a.name || k.a.placeholder) : null, b: k.b ? (k.b.name || k.b.placeholder) : null,
      score_a: k.score_a, score_b: k.score_b, pens_a: k.pens_a, pens_b: k.pens_b, sets: k.sets, status: k.status,
      field: k.field, expected: k.expected, started_at: null,
    }));
    return `<div class="lbl mono">Knock-out</div><div class="list">${cards.map(kaart).join('')}</div>`;
  }

  function leeg(text) { return `<p class="leeg">${esc(text)}</p>`; }
  function pauze(text) {
    return `<div class="pauze" role="status"><b>Pauze</b>${esc(text)} Wat al bezig is wordt uitgespeeld; de rest begint later. De tijden hieronder schuiven mee zodra er weer gespeeld wordt.</div>`;
  }

  function renderTabs() {
    const comps = data.competitions;
    const tabs = [{ key: 'alles', label: 'Alles', icon: null }].concat(comps.map(c => ({ key: String(c.id), label: c.name, icon: c.icon_small })));
    if (!tabs.some(t => t.key === tab)) tab = 'alles';
    const strip = $('tabs');
    const scrollWas = strip.scrollLeft;
    $('tabs').innerHTML = tabs.map(t => `<button type="button" role="tab" class="tab${t.icon ? '' : ' alles'}" id="tab-${esc(t.key)}"
      aria-controls="paneel" aria-selected="${t.key === tab ? 'true' : 'false'}" tabindex="${t.key === tab ? '0' : '-1'}" data-tab="${esc(t.key)}">
      ${t.icon ? `<img src="${esc(safeIcon(t.icon))}" alt="" />` : ''}${esc(t.label)}</button>`).join('');
    $('paneel').setAttribute('aria-labelledby', 'tab-' + tab);
    // Eén sport: geen tabs nodig.
    $('tabs').hidden = comps.length < 2;
    // De strook houdt zijn plek bij het verversen; het gekozen tabblad schuift in beeld
    // (alleen horizontaal, de pagina zelf scrolt niet mee).
    strip.scrollLeft = scrollWas;
    const actief = strip.querySelector('[aria-selected="true"]');
    if (actief) {
      const l = actief.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
      const r = l + actief.offsetWidth;
      if (l < strip.scrollLeft) strip.scrollLeft = Math.max(0, l - 16);
      else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 16;
    }
  }

  function render() {
    if (!data) return;
    renderTabs();
    const live = tab === 'alles' ? data.now : data.now.filter(c => String(c.comp_id) === tab);
    const sportsLive = new Set(data.now.map(c => c.comp_id)).size;
    $('sub').textContent = `${data.now.length} ${data.now.length === 1 ? 'wedstrijd' : 'wedstrijden'} · ${sportsLive} ${sportsLive === 1 ? 'sport' : 'sporten'}`;
    const pill = $('pill');
    if (data.now.length) { pill.textContent = '● Live'; pill.classList.add('live'); pill.removeAttribute('href'); }
    else { pill.textContent = 'Aanmelden'; pill.classList.remove('live'); pill.setAttribute('href', '/'); }

    let html = '';
    if (tab === 'alles') {
      const stil = data.competitions.filter(c => c.paused);
      if (stil.length) html += pauze(stil.length === 1 ? `${stil[0].name} ligt even stil.` : `Even pauze bij ${stil.map(c => c.name).join(', ')}.`);
      html += live.length ? `<div class="list" style="margin-top:22px">${live.map(kaart).join('')}</div>`
        : `<div style="margin-top:22px">${leeg(data.next.length ? 'Er wordt nu even niets gespeeld. Hieronder zie je wat er straks komt.' : 'Er wordt nu niets gespeeld.')}</div>`;
      html += straks(data.next.slice(0, 8));
      const done = data.competitions.filter(c => Array.isArray(c.final_standing) && c.final_standing.length);
      if (done.length) {
        html += `<div class="lbl mono">Kampioenen</div>` + done.map(c => `<div class="sr"><b>1</b><img src="${esc(safeIcon(c.icon_small))}" alt="${esc(c.name)}" /><span>${esc(c.final_standing[0].name)}</span><i class="mono">${esc(c.name)}</i></div>`).join('');
      }
    } else {
      const comp = compOf(Number(tab));
      if (!comp) return;
      if (comp.paused) html += pauze(`${comp.name} ligt even stil.`);
      html += live.length ? `<div class="list" style="margin-top:22px">${live.map(kaart).join('')}</div>`
        : `<div style="margin-top:22px">${leeg(comp.configured ? `Bij ${comp.name} wordt nu niets gespeeld.` : `Het schema van ${comp.name} komt hier zodra het klaar is.`)}</div>`;
      html += straks(data.next.filter(c => c.comp_id === comp.id).slice(0, 6));
      html += eindstand(comp);
      html += standen(comp);
      html += knockout(comp);
      if (comp.is_default) html += `<a class="meer" href="/toernooi">Het volledige bord van ${esc(comp.name)} →</a>`;
    }
    $('paneel').innerHTML = html;
    $('voet').textContent = stale ? 'Geen verbinding — dit is de laatst bekende stand.'
      : (data.multi ? `${data.competitions.length} sporten · ververst vanzelf` : 'Ververst vanzelf');
    renderVolg();
  }

  // Tabs: klik + pijltjestoetsen (ARIA-tabpatroon).
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    rememberTab();
    render();
  });
  window.addEventListener('hashchange', () => { const v = tabFromUrl(); if (v && v !== tab) { tab = v; render(); } });
  $('tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btns = [...$('tabs').querySelectorAll('[data-tab]')];
    const i = btns.findIndex(b => b.dataset.tab === tab);
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    if (!next) return;
    tab = next.dataset.tab;
    rememberTab();
    render();
    $('tab-' + tab)?.focus();
  });

  // ── Volg je team (opt-in push) ─────────────────────────────────────────────
  const FOLLOW_KEY = 'jvo_hub_follow';        // [{id,name,comp}]
  const PUSH_KEY = 'jvo_hub_follow_push';     // '1' als meldingen op dit toestel aan staan
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  let mine = (() => { try { const a = JSON.parse(ls.get(FOLLOW_KEY) || '[]'); return Array.isArray(a) ? a.filter(t => t && Number.isInteger(t.id)) : []; } catch { return []; } })();
  const saveMine = () => ls.set(FOLLOW_KEY, JSON.stringify(mine));
  const pushOn = () => ls.get(PUSH_KEY) === '1';
  function myIds() { return new Set(mine.map(t => t.id)); }
  function isMine(compId, name) { return !!name && mine.some(t => t.comp === compId && t.name === name); }
  function allTeams() {
    const out = [];
    for (const c of (data ? data.competitions : [])) {
      for (const p of Object.keys(c.poules || {}).sort()) for (const t of (c.poules[p].standings || [])) out.push({ id: t.id, name: t.name, comp: c.id, comp_name: c.name });
    }
    return out;
  }
  const pushSupported = () => ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  let volgMsgTimer = null;
  function volgMsg(text) {
    clearTimeout(volgMsgTimer);
    $('volg-melding').textContent = text || '';
    if (text) volgMsgTimer = setTimeout(() => { $('volg-melding').textContent = ''; }, 9000);
  }
  function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64); const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function currentSub() {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function ensureSub() {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    const { publicKey } = await (await fetch('/api/push/public-key')).json();
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
  }
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  async function subscribeTeam(id, sub) {
    try { const s = sub || await ensureSub(); if (!s) return false; return (await post('/api/team-follow/subscribe', { team_id: id, subscription: s.toJSON() })).ok; }
    catch { return false; }
  }
  // Uitzetten moet écht bij de server aankomen, anders zegt de knop "uit" terwijl er
  // nog meldingen komen. Geen abonnement in de browser = er kan niets aankomen.
  async function unsubscribeTeam(id) {
    try { const s = await currentSub(); if (!s) return true; return (await post('/api/team-follow/unsubscribe', { endpoint: s.endpoint, team_id: id })).ok; }
    catch { return false; }
  }
  async function addFollow(id) {
    if (myIds().has(id)) return;
    const t = allTeams().find(x => x.id === id);
    if (!t) return;
    mine.push({ id: t.id, name: t.name, comp: t.comp });
    saveMine();
    if (pushOn() && !(await subscribeTeam(t.id))) volgMsg(`Meldingen voor ${t.name} aanzetten lukte net niet. Zet meldingen even uit en weer aan.`);
    render();
  }
  async function removeFollow(id) {
    const t = mine.find(x => x.id === id);
    if (!t) return;
    if (pushOn() && !(await unsubscribeTeam(id))) { volgMsg('Uitzetten lukte net niet — probeer het zo nog een keer.'); return; }
    mine = mine.filter(x => x.id !== id);
    saveMine();
    if (!mine.length) ls.del(PUSH_KEY);
    render();
  }
  async function enablePush() {
    if (!mine.length) return;
    if (!pushSupported()) { volgMsg('Dit toestel ondersteunt geen meldingen. Tip: op een iPhone zet je de site eerst op je beginscherm.'); return; }
    const btn = $('volg-aan'); btn.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { volgMsg('Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je browser.'); return; }
      const sub = await ensureSub();
      let ok = !!sub;
      for (const t of mine) if (ok && !(await subscribeTeam(t.id, sub))) ok = false;
      if (!ok) { volgMsg('Meldingen aanzetten lukte net niet — het is even druk. Probeer het over een minuutje opnieuw.'); return; }
      ls.set(PUSH_KEY, '1');
      volgMsg('Meldingen staan aan.');
    } catch { volgMsg('Meldingen aanzetten lukte niet. Probeer het opnieuw.'); }
    finally { btn.disabled = false; renderVolg(); }
  }
  async function disablePush() {
    const btn = $('volg-uit'); btn.disabled = true;
    let ok = true;
    for (const t of mine) if (!(await unsubscribeTeam(t.id))) ok = false;
    btn.disabled = false;
    if (!ok) { volgMsg('Uitzetten lukte net niet — probeer het zo nog een keer.'); return; }
    ls.del(PUSH_KEY);
    volgMsg('Meldingen staan uit. Je team blijft hier wel gemarkeerd.');
    renderVolg();
  }
  let volgSig = '';
  function renderVolg() {
    const box = $('volg');
    if (!box || !data) return;
    const teams = allTeams();
    // Namen bijwerken (een team kan hernoemd zijn); niets weggooien op basis van één antwoord.
    let changed = false;
    for (const t of mine) { const cur = teams.find(x => x.id === t.id); if (cur && (cur.name !== t.name || cur.comp !== t.comp)) { t.name = cur.name; t.comp = cur.comp; changed = true; } }
    if (changed) saveMine();
    box.hidden = !teams.length && !mine.length;
    if (box.hidden) return;
    // De server kan meldingen voor dit bord uitzetten (push: false in /api/hub).
    const pushOk = data.push !== false;
    const on = pushOn() && pushOk;
    const sig = JSON.stringify([teams.map(t => [t.id, t.name, t.comp_name]), mine, on, pushOk, data.multi]);
    if (sig === volgSig) return;      // niets veranderd → de open keuzelijst met rust laten
    volgSig = sig;
    const st = $('volg-st');
    st.textContent = mine.length ? `${mine.length === 1 ? mine[0].name : `${mine.length} teams`}${on ? ' · meldingen aan' : ''}` : '';
    st.classList.toggle('aan', on);
    const compName = (id) => { const c = compOf(id); return c ? c.name : ''; };
    $('volg-lijst').innerHTML = mine.map(t => `<span class="volg-chip"><span>${esc(t.name)}</span>${data.multi && compName(t.comp) ? `<small>${esc(compName(t.comp))}</small>` : ''}
      <button type="button" data-weg="${esc(t.id)}" aria-label="${esc(t.name)} niet meer volgen">×</button></span>`).join('');
    const ids = myIds();
    const rest = teams.filter(t => !ids.has(t.id));
    const sel = $('volg-kies');
    sel.hidden = !rest.length;
    const byComp = new Map();
    for (const t of rest) { if (!byComp.has(t.comp)) byComp.set(t.comp, { name: t.comp_name, list: [] }); byComp.get(t.comp).list.push(t); }
    const opt = (t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`;
    sel.innerHTML = `<option value="">${mine.length ? 'Nog een team volgen…' : 'Kies je team…'}</option>` + [...byComp.values()].map(g => {
      const list = g.list.slice().sort((a, b) => a.name.localeCompare(b.name, 'nl'));
      return data.multi ? `<optgroup label="${esc(g.name)}">${list.map(opt).join('')}</optgroup>` : list.map(opt).join('');
    }).join('');
    $('volg-uitleg').textContent = !mine.length ? 'Kies je team: het wordt hier gemarkeerd, zodat je in één oogopslag ziet wanneer en waar je speelt.'
      : (!pushOk ? 'Je team is hier gemarkeerd.'
        : (on ? 'Meldingen staan aan op dit toestel. Uitzetten kan altijd met de knop hieronder.'
          : 'Wil je ook een seintje op je telefoon als je team speelt? Zet meldingen aan. Dat gebeurt alleen als jij op de knop tikt en je browser toestemming geeft; uitzetten kan altijd.'));
    $('volg-aan').hidden = !(mine.length && pushOk && !on);
    $('volg-uit').hidden = !(mine.length && on);
  }
  $('volg-kies').addEventListener('change', (e) => { const id = parseInt(e.target.value, 10); e.target.value = ''; if (Number.isInteger(id)) addFollow(id); });
  $('volg-lijst').addEventListener('click', (e) => { const b = e.target.closest('[data-weg]'); if (b) removeFollow(parseInt(b.dataset.weg, 10)); });
  $('volg-aan').addEventListener('click', enablePush);
  $('volg-uit').addEventListener('click', disablePush);
  // Link uit een mail: ?volg=<id>[,<id>]&push=1 → team klaarzetten en de knop aanwijzen.
  let inviteDone = false;
  async function invite() {
    if (inviteDone || !data) return;
    let ids = [], wants = false;
    try {
      const q = new URLSearchParams(location.search);
      ids = String(q.get('volg') || '').split(',').filter(x => /^\d+$/.test(x)).map(Number).slice(0, 8);
      wants = q.get('push') === '1';
    } catch {}
    if (!ids.length && !wants) { inviteDone = true; return; }
    const teams = allTeams();
    if (ids.length && !teams.length) return;   // schema nog niet geladen → volgende keer
    inviteDone = true;
    for (const id of ids) await addFollow(id);
    // Eerste gevolgde team bepaalt het tabblad als de link er geen noemde.
    if (!tabFromUrl() && ids.length) { const t = teams.find(x => x.id === ids[0]); if (t && data.multi) { tab = String(t.comp); } }
    // Adresbalk opruimen. Een persoonlijke sleutel achter de # (uit een captain-mail)
    // gebruikt dit bord niet en hoort niet mee te gaan als iemand de link doorstuurt.
    try {
      const u = new URL(location.href); u.searchParams.delete('volg'); u.searchParams.delete('push');
      history.replaceState(null, '', u.pathname + u.search + (/^#sport-\d+$/.test(u.hash) ? u.hash : ''));
    } catch {}
    render();
    if (wants || ids.length) {
      const box = $('volg');
      box.open = true; box.classList.add('wijs');
      setTimeout(() => box.classList.remove('wijs'), 6000);
      if (wants && data.push !== false && !pushOn()) volgMsg(mine.length ? 'Tik op ‘Zet meldingen aan’ om een seintje te krijgen.' : 'Kies eerst je team. Daarna kun je meldingen aanzetten.');
    }
  }

  let busy = false, again = false, lastLoad = 0;
  async function load() {
    if (busy) { again = true; return; }
    busy = true; lastLoad = Date.now();
    try {
      const r = await fetch('/api/hub', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.competitions) && Array.isArray(j.now)) {
          stale = r.headers.get('X-JVO-Cache') === 'stale';
          data = j;
          if (!stale && data.server_now) skew = data.server_now - Date.now();
          render();
          invite();
        }
      }
    } catch { /* offline: laatst getoonde stand blijft staan */ }
    busy = false;
    if (again) { again = false; signal(); }
  }
  // Seintjes samenvoegen + spreiden (zie kop van dit bestand).
  let sigTimer = null;
  function signal() {
    if (sigTimer) return;
    if (document.hidden) { pendingWhileHidden = true; return; }
    const wait = Math.max(Math.random() * 1500, lastLoad + 1000 - Date.now());
    sigTimer = setTimeout(() => { sigTimer = null; load(); }, wait);
  }
  let pendingWhileHidden = false;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (pendingWhileHidden || Date.now() - lastLoad > 20000)) { pendingWhileHidden = false; signal(); }
  });
  let sseOk = false;
  (function connect(lite) {
    if (typeof EventSource === 'undefined') return;
    let es, opened = false;
    try { es = new EventSource(lite ? '/api/tournament/stream?lite=1' : '/api/tournament/stream'); } catch { return; }
    es.addEventListener('open', () => { opened = true; sseOk = true; });
    es.addEventListener('update', signal);
    es.addEventListener('error', () => {
      sseOk = false;
      // De lichte stream bestaat (nog) niet op deze server (de browser geeft het dan
      // op: CLOSED; bij een haperende verbinding blijft hij zelf opnieuw proberen).
      if (lite && !opened && es.readyState === 2) connect(false);
    });
  })(true);
  // Vangnet: zonder stream elke 20 s, mét stream alleen als het een minuut stil was.
  setInterval(() => { if (!document.hidden && (!sseOk || Date.now() - lastLoad > 60000)) load(); }, 20000);
  window.addEventListener('online', signal);
  setInterval(() => { if (!document.hidden) render(); }, 15000);   // live-minuut bijwerken
  load();
})();
