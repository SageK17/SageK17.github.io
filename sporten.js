// Sport-hub live-bord (/sporten): "Nu bezig" over alle sporten heen, met een tab
// "Alles" en een tab per competitie. Leest GET /api/hub (publiek).
// Verversen: een seintje van de lichte stream (/api/tournament/stream?lite=1; valt
// terug op de gewone stream) → /api/hub ophalen op een willekeurig moment 0–1,5 s
// later (niet alle telefoons tegelijk), snelle seintjes samengevoegd, nooit vaker
// dan eens per seconde. Valt de stream weg, dan elke 20 s.
// Indeling: telefoon = één kolom; vanaf 700px kaartjes in twee kolommen; vanaf 900px
// kolommen naast elkaar (zie de @media-blokken in sporten.html). Een sport met meerdere
// poules toont ze allemaal, met een kiezer "Alle poules / Poule A / B …" erboven.
// Directe link naar één sport: /sporten?sport=<id> of /sporten#sport-<id>.
// Volg je team: opt-in push via de bestaande /api/team-follow/*-routes (zelfde als
// het bord van het hoofdtoernooi); eigen opslag, zodat de twee borden elkaars
// volglijst niet opschonen. ?volg=<id>[,<id>]&push=1 (uit een mail) zet het team
// klaar en wijst de knop aan — aanzetten gebeurt nooit vanzelf. Een persoonlijke
// sleutel achter de # (#team=<sleutel> uit een captain-mail) hoort bij Mijn team:
// hij wordt op dit toestel bewaard (jvo_mijn, zelfde opslag als mijn.js) en de eigen
// goedgekeurde teams komen in de volglijst; de # verdwijnt meteen uit de adresbalk.
// Teamlogo's: /api/hub geeft per sport `teams: [{id,name,logo?}]` (alle goedgekeurde
// teams, ook vóór het schema) → logo's in stand, kaartjes en knock-out via
// logo-render.js, en dezelfde lijst vult "Volg je team".
// Regels: elke naam/tekst van de server gaat door esc() vóór innerHTML; geen
// sportnamen in deze code — alles komt uit de competitie-instellingen.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeIcon = (u) => (/^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || '')) ? u : '/sport/beker-klein.webp');
  // Persoonlijke sleutel uit de link: meteen uit de adresbalk, vóór elk netwerkverzoek.
  const isJwt = (k) => typeof k === 'string' && k.length < 2000 && /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(k);
  let eigenSleutel = '';
  try {
    const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const k = h.get('team') || h.get('k') || '';
    if (k) { if (isJwt(k)) eigenSleutel = k; history.replaceState(null, '', location.pathname + location.search); }
  } catch {}
  // De service worker bewaart een geopende pagina onder haar volledige adres, dus mét de
  // sleutel achter de #. Die regels horen niet op het toestel te blijven: weghalen (ook als
  // de sleutel al uit de adresbalk is) en een schone kopie van de pagina terugzetten.
  async function veegLinkCache() {
    if (!('caches' in window)) return;
    try {
      let weg = false;
      for (const naam of await caches.keys()) {
        const c = await caches.open(naam);
        for (const req of await c.keys()) {
          let u; try { u = new URL(req.url); } catch { continue; }
          if (u.origin !== location.origin || !u.hash || !/^\/(sporten|mijn|toernooi)(\.html)?$/.test(u.pathname)) continue;
          if (/(^#|&)(team|k|c)=/.test(u.hash)) { await c.delete(req); weg = true; }
        }
      }
      if (weg && navigator.serviceWorker && navigator.serviceWorker.controller) fetch(location.pathname, { headers: { Accept: 'text/html' } }).catch(() => {});
    } catch {}
  }
  veegLinkCache(); setTimeout(veegLinkCache, 4000);
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
  // De woorden voor de competities: "sport/sporten", of wat de server geeft als ze allemaal
  // dezelfde sport zijn (bv. categorie/categorieën). Een ouder antwoord kent `labels` niet.
  const LABELS = { one: 'sport', many: 'sporten', choose: 'Kies je sport', all: 'Alle sporten' };
  const lbl = (k) => { const l = data && data.labels; return l && typeof l[k] === 'string' && l[k].trim() ? l[k] : LABELS[k]; };
  const hoofd = (t) => { const x = String(t || ''); return x.charAt(0).toUpperCase() + x.slice(1); };
  // Automatisch ingedeeld en nog niet gestart: de indeling kan nog schuiven als er iemand bijkomt.
  const VOORLOPIG = 'Voorlopige indeling: die kan nog veranderen tot de start.';
  const voorlopig = (comp) => (comp && comp.draw_open && comp.configured ? `<p class="voorlopig" role="note">${VOORLOPIG}</p>` : '');
  // Teamlogo's (alleen goedgekeurde, nooit bij een solo-sport): opzoeken op id, of op
  // naam binnen de sport (de kaartjes "nu/straks" dragen alleen namen). Geen logo = ''.
  let logoIdx = { src: null, id: new Map(), naam: new Map() };
  function logoVan(compId, id, name, px) {
    if (!data || !window.jvoLogo) return '';
    if (logoIdx.src !== data) {
      logoIdx = { src: data, id: new Map(), naam: new Map() };
      for (const c of data.competitions) for (const t of (Array.isArray(c.teams) ? c.teams : [])) {
        if (!t || !t.logo) continue;
        logoIdx.id.set(t.id, t.logo); logoIdx.naam.set(`${c.id}|${t.name}`, t.logo);
      }
    }
    const logo = (id != null && logoIdx.id.get(id)) || (name ? logoIdx.naam.get(`${compId}|${name}`) : null);
    return logo ? window.jvoLogo.html(logo, px) : '';
  }

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
        <div class="tm${winA ? ' win' : ''}"><span>${logoVan(c.comp_id, c.a_id, c.a, 16)}${esc(c.a || 'Nog onbekend')}</span><b>${esc(sa)}</b></div>
        <div class="tm${winB ? ' win' : ''}"><span>${logoVan(c.comp_id, c.b_id, c.b, 16)}${esc(c.b || 'Nog onbekend')}</span><b>${esc(sb)}</b></div>
        ${extra ? `<div class="sets">${esc(extra)}</div>` : ''}
      </div>
      <div class="r"><span class="badge"><img src="${esc(safeIcon(c.icon_small))}" alt="" /></span><span class="mono">${plek}</span></div>
    </article>`;
  }

  // Allemaal dezelfde sport: het icoon zegt dan niet welke competitie het is. Op "Alles" staat
  // de naam (bv. de categorie) er daarom in tekst bij.
  const zelfdeIcoon = () => !!(data && data.same_sport && tab === 'alles' && data.competitions.length > 1);
  function straks(list) {
    if (!list.length) return '';
    return `<div class="lbl mono">Straks</div><div class="rijen">` + list.map(c => `
      <div class="sr${isMine(c.comp_id, c.a) || isMine(c.comp_id, c.b) ? ' mijn' : ''}"><b>${esc(c.expected || '')}</b><img src="${esc(safeIcon(c.icon_small))}" alt="${esc(c.comp_name)}" />
        <span>${logoVan(c.comp_id, c.a_id, c.a, 16)}${esc(c.a || 'Nog onbekend')} – ${logoVan(c.comp_id, c.b_id, c.b, 16)}${esc(c.b || 'Nog onbekend')}</span>
        <i class="mono">${[zelfdeIcoon() ? esc(c.comp_name) : '', c.field ? `${esc(c.place_noun)} ${esc(c.field)}` : ''].filter(Boolean).join(' · ')}</i></div>`).join('') + `</div>`;
  }
  // Het eerstvolgende stuk schema van één sport (uit comp.upcoming; een ouder antwoord uit
  // de offline-cache heeft dat veld nog niet → dan uit de gedeelde "straks"-lijst).
  function schemaVan(comp, poule) {
    const eigen = Array.isArray(comp.upcoming)
      ? comp.upcoming.map(u => ({ ...u, comp_id: comp.id, comp_name: comp.name, icon_small: comp.icon_small, place_noun: comp.place_noun }))
      : data.next.filter(c => c.comp_id === comp.id);
    const ps = pouleNamen(comp);
    // Zolang er poulewedstrijden op het schema staan, horen de knock-outwedstrijden alleen in hun eigen blok.
    const groep = eigen.filter(c => c.phase === 'group');
    let list = groep.length ? groep : eigen;
    if (poule && ps.length > 1) list = list.filter(c => (c.poule ? c.poule === poule : c.where === `Poule ${poule}`));
    return list.slice(0, 8);
  }
  const pouleNamen = (comp) => Object.keys(comp.poules || {}).sort();
  // Gekozen poule per sport ('' = alle poules; dat is ook altijd de beginstand).
  const pouleKeuze = new Map();
  function gekozenPoule(comp) {
    const p = pouleKeuze.get(comp.id) || '';
    return p && pouleNamen(comp).includes(p) ? p : '';
  }
  function pouleKiezer(comp) {
    const ps = pouleNamen(comp);
    if (ps.length < 2) return '';
    const nu = gekozenPoule(comp);
    const knop = (p, label) => `<button type="button" class="pchip" data-poule="${esc(p)}" aria-pressed="${p === nu ? 'true' : 'false'}">${esc(label)}</button>`;
    return `<div class="poules" role="group" aria-label="Kies een poule">${knop('', `Alle ${ps.length} poules`)}${ps.map(p => knop(p, `Poule ${p}`)).join('')}</div>`;
  }

  function standen(comp, poule) {
    const alle = pouleNamen(comp);
    const ps = poule ? alle.filter(p => p === poule) : alle;
    if (!ps.length) return '';
    const sets = comp.result_model === 'sets';
    return `<div class="lbl mono">Stand</div><div class="standen">` + ps.map(p => {
      const rows = comp.poules[p].standings || [];
      return `<section class="stand" aria-label="Stand poule ${esc(p)}">
        <h3>${alle.length > 1 ? `Poule ${esc(p)}` : 'Poule'}<i>${sets ? 'gs · pnt · sets' : 'gs · pnt · saldo'}</i></h3>
        <div class="srow kop" aria-hidden="true"><span>#</span><span>Naam</span><span class="n">Gs</span><span class="n">Pnt</span><span class="n">±</span></div>
        ${rows.map(s => `<div class="srow${myIds().has(s.id) ? ' mijn' : ''}"><span>${esc(s.pos)}</span><em>${logoVan(comp.id, s.id, s.name, 18)}${esc(s.name)}</em><span class="n">${esc(s.gp)}</span><b>${esc(s.pts)}</b><span class="n">${s.gd > 0 ? '+' : ''}${esc(s.gd)}</span></div>`).join('')}
      </section>`;
    }).join('') + `</div>`;
  }

  function eindstand(comp) {
    const fs = comp.final_standing;
    if (!Array.isArray(fs) || !fs.length) return '';
    return `<div class="lbl mono">Eindstand</div><div class="podium">` + fs.slice(0, 4).map(t =>
      `<div class="plek p${esc(t.pos)}"><b>${esc(t.pos)}</b><span>${logoVan(comp.id, t.id, t.name, 18)}${esc(t.name)}</span></div>`).join('') + `</div>`;
  }

  function knockout(comp) {
    const ko = comp.knockout || [];
    if (!ko.length) return '';
    const cards = ko.map(k => ({
      comp_id: comp.id, comp_name: '', icon_small: comp.icon_small, place_noun: comp.place_noun, model: comp.result_model,
      where: k.where, a: k.a ? (k.a.name || k.a.placeholder) : null, b: k.b ? (k.b.name || k.b.placeholder) : null,
      a_id: k.a && k.a.id != null ? k.a.id : null, b_id: k.b && k.b.id != null ? k.b.id : null,
      score_a: k.score_a, score_b: k.score_b, pens_a: k.pens_a, pens_b: k.pens_b, sets: k.sets, status: k.status,
      field: k.field, expected: k.expected, started_at: null,
    }));
    return `<div class="lbl mono">Knock-out</div><div class="list">${cards.map(kaart).join('')}</div>`;
  }

  // Overzicht "Alles": per sport één regel — hoeveel poules en deelnemers, en of er gespeeld
  // wordt. Een tik opent de sport (zelfde als het tabblad erboven).
  function sportenLijst() {
    const comps = data.competitions;
    if (comps.length < 2) return '';
    return `<div class="lbl mono">${esc(hoofd(lbl('many')))}</div><div class="sporten">` + comps.map(c => {
      const np = pouleNamen(c).length;
      const live = data.now.filter(x => x.comp_id === c.id).length;
      const klaar = Array.isArray(c.final_standing) && c.final_standing.length;
      const eerst = Array.isArray(c.upcoming) && c.upcoming[0] ? c.upcoming[0].expected : '';
      let meta2 = '';
      const meta = () => [np ? `${np} ${np === 1 ? 'poule' : 'poules'}` : '', c.approved ? `${c.approved} ${c.unit || ''}`.trim() : '', meta2].filter(Boolean).join(' · ');
      const chip = live ? `<em class="live">${live} live</em>` : (klaar ? '<em>Klaar</em>' : (c.paused ? '<em>Pauze</em>' : (eerst ? `<em>${esc(eerst)}</em>` : (c.configured ? '' : '<em>Schema volgt</em>'))));
      if (c.draw_open && c.configured) meta2 = 'voorlopige indeling';
      return `<button type="button" class="sportrij" data-tab="${esc(c.id)}"><span class="badge"><img src="${esc(safeIcon(c.icon_small))}" alt="" /></span>
        <span><b>${esc(c.name)}</b><i>${esc(meta())}</i></span>${chip}</button>`;
    }).join('') + `</div>`;
  }

  function leeg(text) { return `<p class="leeg">${esc(text)}</p>`; }
  // De reden die de organisatie bij de pauze typte staat vooraan (vrije tekst → esc()).
  const zin = (t) => { const x = String(t || '').trim(); return x && !/[.!?…]$/.test(x) ? `${x}.` : x; };
  function pauze(text, reden) {
    return `<div class="pauze" role="status"><b>Pauze</b>${reden ? `${esc(zin(reden))} ` : ''}${esc(text)} Wat al bezig is wordt uitgespeeld; de rest begint later. De tijden hieronder schuiven mee zodra er weer gespeeld wordt.</div>`;
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
    $('tabs').setAttribute('aria-label', lbl('choose'));
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
    // Niets live: geen "0 wedstrijden · 0 sporten", maar wat er wél te zien is.
    const klaar = data.competitions.some(c => Array.isArray(c.final_standing) && c.final_standing.length);
    $('sub').textContent = data.now.length
      ? `${data.now.length} ${data.now.length === 1 ? 'wedstrijd' : 'wedstrijden'} · ${sportsLive} ${sportsLive === 1 ? lbl('one') : lbl('many')}`
      : (data.next[0] ? (data.next[0].expected ? `Straks · ${data.next[0].expected}` : 'Straks') : (klaar ? 'Uitslagen' : 'Nog geen wedstrijden'));
    const pill = $('pill');
    // "Aanmelden" hoort alleen bij een dag zonder schema; tussen de rondes door en na
    // afloop staat er geen knop naar het aanmeldformulier.
    if (data.now.length) { pill.textContent = '● Live'; pill.classList.add('live'); pill.removeAttribute('href'); pill.hidden = false; }
    else { pill.textContent = 'Aanmelden'; pill.classList.remove('live'); pill.setAttribute('href', '/'); pill.hidden = klaar || data.competitions.some(c => c.configured); }

    let html = '';
    if (tab === 'alles') {
      const stil = data.competitions.filter(c => c.paused);
      // De reden is er één voor het hele evenement: één keer tonen.
      if (stil.length) html += pauze(stil.length === 1 ? `${stil[0].name} ligt even stil.` : `Even pauze bij ${stil.map(c => c.name).join(', ')}.`,
        (stil.find(c => c.pause_message) || {}).pause_message || '');
      // Breed scherm: links wat er nu speelt + de sporten, rechts "Straks" (en de kampioenen).
      let links = live.length ? `<div class="list" style="margin-top:22px">${live.map(kaart).join('')}</div>`
        : `<div style="margin-top:22px">${leeg(data.next.length ? 'Er wordt nu even niets gespeeld. Je ziet hier ook wat er straks komt.' : 'Er wordt nu niets gespeeld.')}</div>`;
      let zij = straks(data.next.slice(0, 8));
      const done = data.competitions.filter(c => Array.isArray(c.final_standing) && c.final_standing.length);
      if (done.length) {
        zij += `<div class="lbl mono">Kampioenen</div><div class="rijen">` + done.map(c => `<div class="sr"><b>1</b><img src="${esc(safeIcon(c.icon_small))}" alt="${esc(c.name)}" /><span>${logoVan(c.id, c.final_standing[0].id, c.final_standing[0].name, 16)}${esc(c.final_standing[0].name)}</span><i class="mono">${esc(c.name)}</i></div>`).join('') + `</div>`;
      }
      // Op een telefoon staat "Straks" vóór de sportenlijst (order), op een breed scherm ernaast.
      html += `<div class="vlak${zij ? '' : ' solo'}"><div class="v-nu">${links}</div>${zij ? `<aside class="v-zij">${zij}</aside>` : ''}<div class="v-sporten">${sportenLijst()}</div></div>`;
    } else {
      const comp = compOf(Number(tab));
      if (!comp) return;
      if (comp.paused) html += pauze(`${comp.name} ligt even stil.`, comp.pause_message || '');
      html += live.length ? `<div class="list breed" style="margin-top:22px">${live.map(kaart).join('')}</div>`
        : `<div style="margin-top:22px">${leeg(comp.configured ? `Bij ${comp.name} wordt nu niets gespeeld.` : `Het schema van ${comp.name} komt hier zodra het klaar is.`)}</div>`;
      html += eindstand(comp);
      html += voorlopig(comp);
      // Stand, schema en knock-out: op een telefoon onder elkaar, op een breed scherm naast
      // elkaar. Met meer dan twee poules tegelijk in beeld krijgt de stand de volle breedte.
      const poule = gekozenPoule(comp);
      const np = pouleNamen(comp).length;
      const sStand = standen(comp, poule), sSchema = straks(schemaVan(comp, poule)), sKo = knockout(comp);
      html += pouleKiezer(comp);
      if (sStand || sSchema || sKo) {
        html += `<div class="sportvlak${!poule && np > 2 ? ' veel' : ''}${sSchema ? ' m-schema' : ''}${sKo ? ' m-ko' : ''}">`
          + (sSchema ? `<section class="s-schema" aria-label="Straks">${sSchema}</section>` : '')
          + (sStand ? `<section class="s-stand" aria-label="Stand">${sStand}</section>` : '')
          + (sKo ? `<section class="s-ko" aria-label="Knock-out">${sKo}</section>` : '') + `</div>`;
      }
      if (comp.is_default) html += `<a class="meer" href="/toernooi.html">Het volledige bord van ${esc(comp.name)} →</a>`;
    }
    // Focus op een poule-knop of sportregel overleeft het verversen.
    const fc = document.activeElement, fp = fc && fc.closest ? fc.closest('#paneel [data-poule], #paneel [data-tab]') : null;
    const fsel = fp ? (fp.hasAttribute('data-poule') ? `[data-poule="${fp.dataset.poule}"]` : `[data-tab="${fp.dataset.tab}"]`) : '';
    $('paneel').innerHTML = html;
    if (fsel) { const el = $('paneel').querySelector(fsel); if (el) el.focus({ preventScroll: true }); }
    renderRing();
    $('voet').textContent = stale ? 'Geen verbinding — dit is de laatst bekende stand.'
      : (data.multi ? `${data.competitions.length} ${lbl('many')} · ververst vanzelf` : 'Ververst vanzelf');
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
  // In het paneel: een poule kiezen (sportpagina) of een sport openen (overzicht).
  $('paneel').addEventListener('click', (e) => {
    const p = e.target.closest('[data-poule]');
    if (p) { const comp = compOf(Number(tab)); if (comp) { pouleKeuze.set(comp.id, p.dataset.poule); render(); } return; }
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    rememberTab();
    render();
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); }
    $('tab-' + tab)?.focus({ preventScroll: true });
  });

  // ── De ring rechtsboven ────────────────────────────────────────────────────
  // "Alles": de iconen van de sporten wisselen elkaar rustig af (bij "minder beweging"
  // staat de beker stil). Eén sport: het icoon van die sport; een bal draait om zijn as
  // als sh-bal3d.js dat kan en mag. Elk beeld wordt één keer gebouwd en daarna alleen
  // getoond/verborgen, zodat een draaiende bal zijn canvas houdt.
  const grootIcon = (u) => (/^\/sport\/[a-z]+\.webp$/.test(String(u || '')) ? u : '/sport/beker.webp');
  const minderBeweging = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const ringBeelden = new Map();
  let ringSig = '', ringTimer = null;
  function ringBeeld(key, bouw) {
    let el = ringBeelden.get(key);
    if (!el) { el = document.createElement('span'); el.className = 'ring-in'; el.hidden = true; bouw(el); $('ring').appendChild(el); ringBeelden.set(key, el); }
    return el;
  }
  function ringImg(src) { const i = new Image(); i.alt = ''; i.decoding = 'async'; i.src = src; return i; }
  function renderRing() {
    const ring = $('ring');
    if (!ring || !data) return;
    const comps = data.competitions;
    // Allemaal dezelfde sport (bv. twee categorieën): ook op "Alles" dat ene icoon, niets om af te wisselen.
    const comp = tab === 'alles' ? (comps.length === 1 || (data.same_sport && comps.length) ? comps[0] : null) : compOf(Number(tab));
    const stil = minderBeweging();
    const iconen = comps.map(c => grootIcon(c.icon));
    const sig = comp ? `s|${comp.sport}|${grootIcon(comp.icon)}` : (stil || iconen.length < 2 ? 'beker' : `a|${iconen.join(',')}`);
    if (sig === ringSig) return;
    ringSig = sig;
    clearInterval(ringTimer); ringTimer = null;
    const el = ringBeeld(sig, (doos) => {
      if (comp) {
        const img = ringImg(grootIcon(comp.icon)); img.className = 'op'; doos.appendChild(img);
        // Welke sporten een draaiende bal hebben weet alleen sh-bal3d.js (één bron):
        // maak() doet niets en geeft false als het de sport niet kent of niet mag draaien.
        const naam = String(comp.sport || '');
        const go = () => { if (window.shBal3d && img.isConnected) window.shBal3d.maak(img, naam, { groot: true }); };
        if (window.shBal3d || document.readyState === 'complete') setTimeout(go, 0);
        else window.addEventListener('load', go, { once: true });
      } else if (sig === 'beker') {
        const img = ringImg('/sport/beker.webp'); img.className = 'op'; doos.appendChild(img);
      } else {
        const a = ringImg(iconen[0]), b = ringImg(iconen[1]); a.className = 'op';
        doos.appendChild(a); doos.appendChild(b);
        doos._lijst = iconen; doos._i = 0;
      }
    });
    for (const x of ringBeelden.values()) x.hidden = x !== el;
    if (el._lijst) {
      ringTimer = setInterval(() => {
        if (document.hidden) return;
        const [a, b] = el.children;
        const voor = a.classList.contains('op') ? a : b, achter = voor === a ? b : a;
        el._i = (el._i + 1) % el._lijst.length;
        const src = el._lijst[el._i];
        const wissel = () => { achter.classList.add('op'); voor.classList.remove('op'); };
        if (achter.getAttribute('src') === src && achter.complete) wissel();
        else { achter.onload = wissel; achter.src = src; }
      }, 3600);
    }
  }
  try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { if (data) renderRing(); }); } catch {}

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
  // Alle goedgekeurde teams per sport (comp.teams), dus ook wie nog niet in een schema
  // staat. Een ouder antwoord uit de offline-cache kent dat veld niet → dan de standen.
  function allTeams() {
    const out = [];
    for (const c of (data ? data.competitions : [])) {
      if (Array.isArray(c.teams)) { for (const t of c.teams) if (t && Number.isInteger(t.id)) out.push({ id: t.id, name: t.name, comp: c.id, comp_name: c.name }); continue; }
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
  // opts.subscribe === false (een link, geen tik): staan meldingen al aan, dan komt het
  // team erbij met `wacht` en gaat er NIETS naar de server tot de tik op de knop.
  async function addFollow(id, opts) {
    if (myIds().has(id)) return;
    const t = allTeams().find(x => x.id === id);
    if (!t) return;
    const wacht = pushOn() && !!opts && opts.subscribe === false;
    mine.push(wacht ? { id: t.id, name: t.name, comp: t.comp, wacht: true } : { id: t.id, name: t.name, comp: t.comp });
    saveMine();
    if (pushOn() && !wacht && !(await subscribeTeam(t.id))) volgMsg(`Meldingen voor ${t.name} aanzetten lukte net niet. Zet meldingen even uit en weer aan.`);
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
    if (!pushSupported()) { volgMsg('Dit toestel ondersteunt hier geen meldingen. Op een iPhone: tik op de deelknop (vierkant met pijl), kies ‘Zet op beginscherm’ en open de app daarna vanaf je beginscherm.'); return; }
    const btn = $('volg-aan'); btn.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { volgMsg('Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je browser.'); return; }
      const sub = await ensureSub();
      let ok = !!sub;
      for (const t of mine) if (ok && !(await subscribeTeam(t.id, sub))) ok = false;
      if (!ok) { volgMsg('Meldingen aanzetten lukte net niet — het is even druk. Probeer het over een minuutje opnieuw.'); return; }
      ls.set(PUSH_KEY, '1');
      for (const t of mine) delete t.wacht;
      saveMine();
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
    for (const t of mine) delete t.wacht;
    saveMine();
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
    // Teams die via een link zijn klaargezet terwijl meldingen al aan stonden.
    const wacht = on && mine.some(t => t.wacht);
    const sig = JSON.stringify([teams.map(t => [t.id, t.name, t.comp_name]), mine, on, pushOk, data.multi]);
    if (sig === volgSig) return;      // niets veranderd → de open keuzelijst met rust laten
    volgSig = sig;
    const st = $('volg-st');
    st.textContent = mine.length ? `${mine.length === 1 ? mine[0].name : `${mine.length} teams`}${on ? (wacht ? ' · meldingen deels aan' : ' · meldingen aan') : ''}` : '';
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
        : (wacht ? 'Tik op ‘Zet meldingen aan’ om ook voor de nieuwe teams een seintje te krijgen. Voor de andere teams staan meldingen al aan.'
          : on ? 'Meldingen staan aan op dit toestel. Uitzetten kan altijd met de knop hieronder.'
          : 'Wil je ook een seintje op je telefoon als je team speelt? Zet meldingen aan. Dat gebeurt alleen als jij op de knop tikt en je browser toestemming geeft; uitzetten kan altijd.'));
    $('volg-aan').hidden = !(mine.length && pushOk && (!on || wacht));
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
    for (const id of ids) await addFollow(id, { subscribe: false });
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
      else if (data.push !== false && pushOn() && mine.some(t => t.wacht)) volgMsg('Tik op ‘Zet meldingen aan’ om ook voor de nieuwe teams een seintje te krijgen.');
    }
  }

  // Persoonlijke link uit een mail (#team=<sleutel>): de sleutel bewaren voor Mijn team en
  // de eigen goedgekeurde teams klaarzetten (alleen markeren; abonneren pas na een tik).
  function bewaarSleutel(k, j) {
    try {
      const o = JSON.parse(ls.get('jvo_mijn') || 'null');
      const keys = o && Array.isArray(o.keys) ? o.keys.filter(x => x && x.k !== k && x.k !== eigenOud) : [];
      keys.unshift({
        k, kind: j ? (j.kind === 'view' ? 'view' : 'own') : null, scope: j ? (j.scope === 'address' ? 'address' : 'team') : null, since: Date.now(),
        teams: j && Array.isArray(j.cards) ? j.cards.map(c => c && c.team_id).filter(Number.isInteger).slice(0, 12) : [],
      });
      ls.set('jvo_mijn', JSON.stringify({ v: 1, keys: keys.slice(0, 6) }));
    } catch {}
  }
  let eigenOud = '';
  async function eigenTeams() {
    if (!eigenSleutel || !data) return;
    const k = eigenSleutel; eigenSleutel = '';
    bewaarSleutel(k, null);
    try {
      const r = await fetch('/api/mijn', { headers: { Authorization: 'Bearer ' + k }, cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !Array.isArray(j.cards)) return;
      eigenOud = k;
      bewaarSleutel(isJwt(j.renew) ? j.renew : k, j);
      const voor = mine.length;
      for (const c of j.cards) {
        if (c && c.status === 'approved' && c.follow && Number.isInteger(c.follow.id) && c.board && c.board.kind === 'sporten') await addFollow(c.follow.id, { subscribe: false });
      }
      if (mine.length > voor) { const box = $('volg'); box.classList.add('wijs'); setTimeout(() => box.classList.remove('wijs'), 6000); }
    } catch { /* geen verbinding: de sleutel staat bewaard, Mijn team pakt hem later op */ }
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
          eigenTeams();
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
  let sseOk = false, retryMs = 5000, retryTimer = null, retryWaiting = false;
  function connect(lite) {
    if (typeof EventSource === 'undefined') return;
    let es, opened = false;
    try { es = new EventSource(lite ? '/api/tournament/stream?lite=1' : '/api/tournament/stream'); } catch { return; }
    es.addEventListener('open', () => { opened = true; sseOk = true; retryMs = 5000; });
    es.addEventListener('update', signal);
    es.addEventListener('error', () => {
      sseOk = false;
      // Bij een haperende verbinding probeert de browser zelf opnieuw (CONNECTING).
      if (es.readyState !== 2) return;
      // De lichte stream bestaat (nog) niet op deze server → de gewone proberen.
      if (lite && !opened) { connect(false); return; }
      // CLOSED: de browser geeft het op na een antwoord dat geen stream is (502/503 van
      // de proxy tijdens een herstart, of de server zit vol). Zelf opnieuw verbinden,
      // steeds rustiger (5 s → 60 s, plus spreiding); intussen ververst het vangnet.
      try { es.close(); } catch {}
      if (retryTimer || retryWaiting) return;
      if (document.hidden) { retryWaiting = true; return; }
      const wait = retryMs + Math.random() * 5000;
      retryMs = Math.min(60000, retryMs * 2);
      retryTimer = setTimeout(() => { retryTimer = null; connect(true); }, wait);
    });
  }
  connect(true);
  // Viel de stream weg terwijl de pagina op de achtergrond stond: opnieuw verbinden bij terugkomst.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && retryWaiting && !retryTimer) { retryWaiting = false; connect(true); }
  });
  // Vangnet: zonder stream elke 20 s, mét stream alleen als het een minuut stil was.
  setInterval(() => { if (!document.hidden && (!sseOk || Date.now() - lastLoad > 60000)) load(); }, 20000);
  window.addEventListener('online', signal);
  setInterval(() => { if (!document.hidden) render(); }, 15000);   // live-minuut bijwerken
  load();
})();
