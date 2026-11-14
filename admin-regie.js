// JVO Admin — REGIE-LAAG voor een dag met meerdere sporten (branch sport-hub).
//
// Een extra laag bovenop de bestaande admin; er verdwijnt niets. Vier onderdelen:
//   1. Regie-startscherm (Overzicht): per sport de stappen + één volgende actie.
//   2. Sportschakelaar (onder de tabs): Teams en Toernooi volgen de gekozen sport.
//   3. Wedstrijddag-modus (Overzicht): pauzeer alles, uitloop per sport, corrigeren.
//   4. Afronden: resultaten bewaren, bedanken, schone start.
//
// WANNEER STAAT DEZE LAAG AAN?  Eén conditie, op één plek (`laagAan`):
//     er is meer dan één competitie, OF het hoofdtoernooi staat op inactief.
// Met precies één sport blijft alles hier verborgen en verandert er niets.
//
// Gegevens: GET /api/admin/regie (alles per sport in één antwoord). Er is geen
// eigen timer: dit bestand loopt mee met renderAll van admin.js (de 10 s-poll) via
// window.JVO_ADMIN.onRender. Alle aanroepen gaan door de api() van admin.js, zodat
// een verlopen sessie (401) naar het inlogscherm leidt en niet "offline" heet.
// Alles wat van gebruikers komt gaat door esc() voordat het in innerHTML belandt;
// meldingen gaan via showToast (textContent).
(() => {
  const A = window.JVO_ADMIN;
  if (!A) return;
  const $ = (id) => document.getElementById(id);
  const bar = $('rg-bar'), regie = $('rg-regie'), dag = $('rg-dag'), paneel = $('rg-sportpaneel');
  if (!bar || !regie || !dag || !paneel) return;
  const esc = A.escape;
  const HUB = () => window.JVO_HUB || null;
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
  const icon = (c, cls = 'rg-icoon') => (isIcon(c.icon_small) ? `<img class="${cls}" src="${esc(c.icon_small)}" alt="" width="40" height="40" />` : `<span class="${cls} rg-icoon-leeg" aria-hidden="true"></span>`);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const svg = (d, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
    play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>', 12),
    chev: svg('<polyline points="9 6 15 12 9 18"/>', 16),
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    flag: svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', 16),
  };

  // ── Staat ────────────────────────────────────────────────────────────────
  let R = null;               // laatste antwoord van /api/admin/regie
  let aan = false;            // staat de laag aan? (zie `laagAan`)
  let dagAan = false;         // wedstrijddag-modus zichtbaar
  let dagHand = null;         // handmatige keuze (true/false) of null = automatisch
  let lastFetch = 0, fetching = null;
  let mis = 0;                // mislukte verversingen op rij (2 = "geen verbinding")
  let nieuwOpen = false;      // paneel "+ Sport toevoegen" open
  let eindstand = {};         // comp-id → eindstand (open in de kaart)
  let detail = {};            // comp-id → /api/tournament?competition=N (sportpaneel)
  let howDone = false;        // uitlegkaart op Teams al één keer dichtgezet
  const cards = new Map();    // wedstrijd-id → kaartje (voor "Corrigeer")
  try { const v = sessionStorage.getItem('jvo_admin_dag'); if (v === '1' || v === '0') dagHand = v === '1'; } catch {}

  // De ene conditie voor "hub-modus" in de admin.
  const laagAan = (comps) => {
    const main = comps.find(c => c.is_default);
    return comps.length > 1 || !!(main && !main.active);
  };
  const comps = () => (R && Array.isArray(R.competitions) ? R.competitions : []);
  const compById = (id) => comps().find(c => c.id === id) || null;
  const mainComp = () => comps().find(c => c.is_default) || null;
  const actives = () => comps().filter(c => c.active);

  // innerHTML alleen vervangen als er echt iets veranderd is: zo verliest een knop
  // niet elke 10 seconden zijn focus en flikkert er niets.
  function setHtml(el, html) {
    if (!el || el.__rg === html) return;
    el.__rg = html;
    el.innerHTML = html;
  }

  async function call(method, path, body) {
    try {
      const r = await A.api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, j };
    } catch (e) {
      // api() heeft bij een 401 zelf al gemeld dat de sessie verlopen is.
      if (!e || e.message !== 'Sessie verlopen') A.showToast('Geen verbinding — probeer het zo opnieuw.', 'error');
      return { ok: false, status: 0, j: {}, net: true };
    }
  }
  const fail = (r, fallback) => { if (!r.net) A.showToast(r.j.error || fallback, 'error'); };

  // ── Ophalen ──────────────────────────────────────────────────────────────
  async function load(force) {
    if (!A.hasToken()) return;
    if (fetching) return fetching;
    if (!force && Date.now() - lastFetch < 3000) return;
    fetching = (async () => {
      try {
        const r = await A.api('/api/admin/regie');
        if (!r.ok) return gemist();
        R = await r.json();
        lastFetch = Date.now();
        const wasWeg = weg();
        mis = 0;
        // Midden in een invoerveld of met een venster open: de gegevens zijn binnen,
        // maar het scherm blijft staan tot de volgende ronde (zelfde regel als admin.js).
        // Uitzondering: de verbinding is net terug. Dan moet "Geen verbinding" meteen weg.
        if (force || wasWeg || !A.userIsBusy()) apply();
      } catch (e) {
        // De laatst bekende stand blijft staan, maar niet stilzwijgend. Een verlopen
        // sessie (401) is geen verbindingsprobleem: api() stuurt dan zelf naar het inlogscherm.
        if (!e || e.message !== 'Sessie verlopen') gemist();
      }
      finally { fetching = null; }
    })();
    return fetching;
  }
  const refresh = () => load(true);

  // Geen verbinding: het scherm mag niet blijven beweren dat alles loopt. Geteld in
  // mislukte pogingen (niet in tijd: een tab die terugkomt uit de achtergrond is niet
  // offline). Eén gemiste ronde is nog geen nieuws; bij de tweede zeggen we het.
  const weg = () => mis >= 2 && lastFetch > 0;
  const wegTekst = () => {
    const d = new Date(lastFetch);
    return `Geen verbinding. Dit is de stand van ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}.`;
  };
  // Ondertitel zetten; zonder verbinding staat daar de eerlijke melding. Alleen
  // schrijven als de tekst verandert (rg-dag-sub is aria-live).
  function subTekst(el, txt) {
    if (!el) return;
    const t = weg() ? wegTekst() : txt;
    if (el.textContent !== t) el.textContent = t;
  }
  function paintWeg() {
    const w = weg() && aan;
    document.body.classList.toggle('rg-weg', w);
    const pil = $('live-status');
    if (pil) {
      pil.classList.toggle('stale', w);
      const t = pil.lastChild;
      if (t && t.nodeType === 3) { const txt = w ? ' Geen verbinding' : ' Live'; if (t.textContent.trim() !== txt.trim()) t.textContent = txt; }
    }
  }
  function gemist() {
    mis++;
    if (mis === 2 && aan && R) paint();
  }
  const go = (tab) => { A.switchTab(tab); if (aan && R) paintBar(); };

  function apply() {
    const list = comps();
    const was = aan;
    aan = laagAan(list);
    A.setComps(aan ? list : []);
    document.body.classList.toggle('rg-hub', aan);
    if (!aan) {
      [bar, regie, dag, paneel].forEach(el => { el.hidden = true; });
      $('tab-overview')?.classList.remove('rg-dag-aan');
      $('tab-tournament')?.classList.remove('rg-andere-sport');
      const how = $('rg-how'); if (how) how.open = true;
      const noot = $('rg-mail-noot'); if (noot) noot.hidden = true;
      const om = $('tc-omroep-link'); if (om) om.style.display = '';
      paintWeg();
      if (A.selSport != null) A.selSport = null;
      else if (was) A.refreshAll();
      return;
    }
    if (A.selSport != null && !compById(A.selSport)) { A.selSport = null; return; }   // setter tekent opnieuw
    const auto = !!(R.totals && R.totals.live > 0) || !!(R.event && R.event.is_today);
    dagAan = dagHand != null ? dagHand : auto;
    if (!was) { A.refreshAll(); return; }   // eerste keer aan: tellers/labels in admin.js meenemen
    paint();
  }

  function paint() {
    if (!aan || !R) return;
    cards.clear();
    for (const c of comps()) for (const x of [...(c.now || []), ...(c.next || []), ...(c.recent || []), ...gespeeld(c)]) cards.set(x.id, x);
    // Een opengeklapte eindstand hoort alleen bij een afgeronde sport: na Schone start,
    // leegmaken, opnieuw genereren of verwijderen mag hij niet blijven staan.
    for (const k of Object.keys(eindstand)) { const c = compById(Number(k)); if (!c || !c.finished) delete eindstand[k]; }
    checkSchema();
    paintWeg();
    paintBar();
    paintDag();
    paintRegie();
    paintPaneel();
    paintNotes();
  }

  // ── 2. Sportschakelaar ───────────────────────────────────────────────────
  function paintBar() {
    bar.hidden = false;
    const sel = A.selSport;
    const chip = (id, label, extra = '') => `<button type="button" role="tab" class="rg-chip" data-sport="${id == null ? '' : esc(id)}" aria-selected="${sel === id ? 'true' : 'false'}" tabindex="${sel === id ? '0' : '-1'}">${label}${extra}</button>`;
    const chips = [chip(null, '<span class="rg-chip-t">Alle sporten</span>')].concat(comps().map(c => {
      const n = c.teams.pending;
      return chip(c.id,
        `${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" width="22" height="22" />` : ''}<span class="rg-chip-t">${esc(c.name)}</span>`,
        (c.active ? '' : '<span class="rg-chip-uit">inactief</span>')
        + (n > 0 ? `<span class="rg-chip-n" aria-label="${esc(plural(n, 'aanmelding wacht', 'aanmeldingen wachten'))} op beoordeling">${n}</span>` : ''));
    }));
    const live = R.totals.live;
    setHtml(bar, `
      <div class="rg-chips" role="tablist" aria-label="Kies een sport">${chips.join('')}</div>
      <button type="button" class="rg-dagknop" id="rg-dagknop" aria-pressed="${dagAan && $('tab-overview').classList.contains('active') ? 'true' : 'false'}" title="Het scherm voor de dag zelf: pauzeren, uitloop en uitslagen">
        ${IC.flag}<span>Wedstrijddag</span>${live > 0 ? `<span class="rg-live-n" aria-label="${esc(plural(live, 'wedstrijd', 'wedstrijden'))} live">${live} live</span>` : ''}
      </button>`);
    // De gekozen sport hoort in beeld te staan, ook als de keuze van elders kwam
    // (een Regie-knop). Alleen de strook zelf schuift, nooit de pagina.
    if (bar.__sel !== sel) {
      bar.__sel = sel;
      const strip = bar.querySelector('.rg-chips'), cur = bar.querySelector('.rg-chip[aria-selected="true"]');
      if (strip && cur) strip.scrollLeft = Math.max(0, cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2);
    }
  }
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.rg-chip');
    if (chip) { A.selSport = chip.dataset.sport === '' ? null : Number(chip.dataset.sport); focusChip(); return; }
    if (e.target.closest('#rg-dagknop')) setDag(!dagAan || !$('tab-overview').classList.contains('active'));
  });
  // De knop Wedstrijddag is alleen "aan" als je het blok ook echt ziet (tab Overzicht).
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { if (aan && R) paintBar(); }));
  // Pijltjestoetsen binnen de schakelaar (tablist-gedrag).
  bar.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || !e.target.closest('.rg-chip')) return;
    const all = [...bar.querySelectorAll('.rg-chip')];
    let i = all.indexOf(e.target.closest('.rg-chip'));
    i = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
    e.preventDefault();
    A.selSport = all[i].dataset.sport === '' ? null : Number(all[i].dataset.sport);
    focusChip();
  });
  function focusChip() {
    const cur = bar.querySelector('.rg-chip[aria-selected="true"]');
    if (!cur) return;
    cur.focus({ preventScroll: true });
  }

  // ── 3. Wedstrijddag-modus ────────────────────────────────────────────────
  function setDag(v) {
    dagAan = !!v; dagHand = dagAan;
    try { sessionStorage.setItem('jvo_admin_dag', dagAan ? '1' : '0'); } catch {}
    if (!$('tab-overview').classList.contains('active')) go('overview');
    paint();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const placeOf = (x) => (x.field == null ? (x.place_label || '') : `${x.place_label ? `${x.place_label} · ` : ''}${x.place_noun} ${x.field}`);
  const names = (x) => `${esc(x.a || 'Nog onbekend')} <span class="rg-vs">–</span> ${esc(x.b || 'Nog onbekend')}`;
  function scoreText(x) {
    if (x.model === 'sets') {
      const s = Array.isArray(x.sets) ? x.sets.filter(p => Array.isArray(p)) : [];
      const won = (x.score_a != null && x.score_b != null) ? `${x.score_a}–${x.score_b}` : '';
      const detail = s.map(p => `${p[0]}-${p[1]}`).join(', ');
      return won && detail ? `${won} (${detail})` : (won || detail || '0–0');
    }
    const base = `${x.score_a == null ? 0 : x.score_a}–${x.score_b == null ? 0 : x.score_b}`;
    return x.pens_a != null && x.pens_b != null ? `${base} (${x.pens_a}–${x.pens_b} na beslissing)` : base;
  }
  // Kort voor in de lijst: "2–1" (bij sets: gewonnen sets; live zonder gewonnen set
  // de lopende setstand). De losse setstanden staan in de regel eronder.
  const setList = (x) => (x.model === 'sets' && Array.isArray(x.sets) ? x.sets.filter(p => Array.isArray(p) && (p[0] || p[1])).map(p => `${p[0]}-${p[1]}`).join(', ') : '');
  function scoreShort(x) {
    if (x.model !== 'sets') return scoreText(x).replace(/ \(.*$/, '') + (x.pens_a != null && x.pens_b != null ? '*' : '');
    return `${x.score_a == null ? 0 : x.score_a}–${x.score_b == null ? 0 : x.score_b}`;
  }
  const metaLine = (x, multi, withSets) => [multi ? x.comp_name : '', x.where, placeOf(x)].filter(Boolean).map(esc).join(' · ')
    + (withSets && setList(x) ? `<em class="rg-sets-lijst">${x.model === 'sets' ? 'sets ' : ''}${esc(setList(x))}</em>` : '')
    + (withSets && x.model !== 'sets' && x.pens_a != null && x.pens_b != null ? `<em class="rg-sets-lijst">* beslissing ${esc(x.pens_a)}–${esc(x.pens_b)}</em>` : '');

  // Nieuwste uitslag eerst. Uitslagen die via de admin zijn ingevoerd hebben geen
  // eindtijd: die vallen terug op hun nummer (hoogste eerst), niet op "oudste bovenaan".
  const nieuwst = (a, b) => String(b.ended_at || '').localeCompare(String(a.ended_at || '')) || b.id - a.id;
  // Alle gespeelde wedstrijden van een sport als kaartje (zelfde vorm als now/next/
  // recent van de server), uit het schema dat het sportpaneel al ophaalt. Zolang dat
  // er niet is: de laatste paar die de Regie meestuurt.
  function gespeeld(c) {
    const d = detail[c.id];
    if (!d || !d.configured) return (c.recent || []).slice().sort(nieuwst);
    const nm = (v) => (v && typeof v === 'object' ? (v.name || v.placeholder || null) : v);
    const base = { comp_id: c.id, comp_name: c.name, icon_small: c.icon_small, place_noun: c.place_noun, place_label: c.place_label, model: c.result_model };
    const out = [];
    const push = (x, phase, pens) => {
      if (x.status !== 'done') return;
      out.push({ ...base, id: x.id, phase, where: x.where, a: nm(x.a), b: nm(x.b), score_a: x.score_a, score_b: x.score_b, pens_a: pens ? x.pens_a : null, pens_b: pens ? x.pens_b : null, sets: x.sets, status: x.status, ended_at: x.ended_at, field: x.field, time: x.time, expected: x.expected });
    };
    for (const p of Object.keys(d.poules || {})) for (const x of (d.poules[p].matches || [])) push(x, 'group', false);
    for (const k of (d.knockout || [])) push(k, k.phase || 'ko', true);
    return out.sort(nieuwst);
  }

  function dagSkeleton() {
    if (dag.__klaar) return;
    dag.__klaar = true;
    dag.innerHTML = `
      <div class="rg-dag-kop">
        <div>
          <div class="card-eyebrow">Wedstrijddag</div>
          <h3 class="rg-titel" id="rg-dag-titel">—</h3>
          <p class="rg-sub" id="rg-dag-sub" aria-live="polite"></p>
        </div>
        <button type="button" class="rg-knop rg-knop-rustig" data-rg="dag-uit">Terug naar Regie</button>
      </div>
      <div class="rg-nood" id="rg-nood">
        <div class="rg-nood-veld" id="rg-nood-veld">
          <label class="rg-label" for="rg-reden">Reden voor op het bord (mag leeg)</label>
          <input type="text" id="rg-reden" maxlength="140" autocomplete="off" placeholder="Bijv. Onweer, we schuilen even" />
        </div>
        <button type="button" class="rg-knop rg-knop-nood" id="rg-pauze-alles"></button>
        <p class="rg-nood-uitleg" id="rg-nood-uitleg"></p>
      </div>
      <nav class="rg-spring" id="rg-spring" aria-label="Spring naar"></nav>
      <div class="rg-rijen" id="rg-rijen"></div>
      <div class="rg-kolommen">
        <section aria-labelledby="rg-h-nu"><h4 id="rg-h-nu" tabindex="-1">Nu bezig</h4><ul class="rg-lijst" id="rg-nu"></ul></section>
        <section aria-labelledby="rg-h-straks"><h4 id="rg-h-straks" tabindex="-1">Straks</h4><ul class="rg-lijst" id="rg-straks"></ul></section>
        <section aria-labelledby="rg-h-uit"><h4 id="rg-h-uit" tabindex="-1">Laatste uitslagen</h4><ul class="rg-lijst" id="rg-uit"></ul>
          <p class="rg-eerlijk" id="rg-uit-noot" hidden></p></section>
      </div>
      <nav class="rg-snel" id="rg-snel" aria-label="Snelkoppelingen"></nav>
      <p class="rg-eerlijk">Opnieuw genereren, resetten en wissen staan hier bewust niet. Die vind je op de tab Toernooi.</p>`;
  }

  function paintDag() {
    $('tab-overview').classList.toggle('rg-dag-aan', dagAan);
    dag.hidden = !dagAan;
    if (!dagAan) return;
    dagSkeleton();
    const act = actives();
    const multi = act.length > 1;
    const t = R.totals;
    const allDone = t.total > 0 && t.done === t.total;
    $('rg-dag-titel').textContent = t.total === 0 ? 'Nog geen schema'
      : allDone ? 'Alles is gespeeld'
      : t.live > 0 ? `${t.live} live · ${t.done}/${t.total} gespeeld` : `${t.done}/${t.total} gespeeld`;
    const late = act.filter(c => c.delay_min >= 3 && !c.finished);   // een minuutje is geen nieuws
    const paused = act.filter(c => c.paused);
    subTekst($('rg-dag-sub'), t.total === 0 ? 'Maak eerst een schema in de Regie. Daarna stuur je de dag vanaf hier.'
      : R.paused_all ? 'Alles staat op pauze. Niemand kan een wedstrijd starten.'
      : paused.length ? `${paused.map(c => c.name).join(', ')} ${paused.length === 1 ? 'staat' : 'staan'} op pauze.`
      : allDone ? 'Tijd om af te ronden. Dat doe je in de Regie.'
      : late.length ? `${late.map(c => `${c.name} loopt ${c.delay_min} min uit`).join(' · ')}.`.replace(/^./, m => m.toUpperCase())
      : t.live > 0 ? 'Alles loopt. Niks te doen.' : 'Er is nu niets bezig.');

    // a. Pauzeer alles / hervat alles (niet meer nodig als er niets te spelen valt)
    $('rg-nood').hidden = (t.total === 0 || allDone) && !R.paused_any;
    const pa = $('rg-pauze-alles');
    setHtml(pa, R.paused_all ? `${IC.play}<span>Hervat alles</span>` : `${IC.pause}<span>Pauzeer alles</span>`);
    pa.classList.toggle('is-pauze', !!R.paused_all);
    $('rg-nood-veld').hidden = !!R.paused_all;
    $('rg-nood-uitleg').textContent = R.paused_all
      ? (R.pause_message ? `Op het bord staat: "${R.pause_message}". Hervatten zet alle sporten weer aan.` : 'Hervatten zet alle sporten weer aan.')
      : `Eén tik zet ${multi ? `alle ${act.length} sporten` : 'het toernooi'} stil: niemand kan nog een wedstrijd starten tot je hervat.${paused.length ? ` (${plural(paused.length, 'sport staat', 'sporten staan')} al op pauze.)` : ''}`;

    // b. Eén rij per sport
    setHtml($('rg-rijen'), act.map(c => {
      const m = c.matches;
      const bits = [];
      if (m.total === 0) bits.push('Nog geen schema');
      else {
        if (m.live > 0) bits.push(`<b class="rg-live">${m.live} live</b>`);
        bits.push(`${m.done}/${m.total} gespeeld`);
        if (c.finished) bits.push('afgerond');
        else {
          if (c.delay_min > 0) bits.push(`<b class="rg-laat">loopt ${c.delay_min} min uit</b>`);
          if (c.shift_min) bits.push(`${c.shift_min > 0 ? '+' : '−'}${Math.abs(c.shift_min)} min verschoven`);
          if (c.expected_end) bits.push(`klaar rond ${esc(c.expected_end)}`);
        }
      }
      const knoppen = (m.total === 0 || c.finished) ? '' : `
        <div class="rg-rij-k" role="group" aria-label="Bijsturen: ${esc(c.name)}">
          <button type="button" class="rg-mini${c.paused ? ' is-pauze' : ''}" data-rg="${c.paused ? 'hervat' : 'pauze'}" data-id="${esc(c.id)}">${c.paused ? 'Hervat' : 'Pauze'}</button>
          <button type="button" class="rg-mini" data-rg="shift" data-d="5" data-id="${esc(c.id)}" aria-label="${esc(c.name)}: alles 5 minuten later">+5</button>
          <button type="button" class="rg-mini" data-rg="shift" data-d="10" data-id="${esc(c.id)}" aria-label="${esc(c.name)}: alles 10 minuten later">+10</button>
          <button type="button" class="rg-mini" data-rg="shift-reset" data-id="${esc(c.id)}"${c.shift_min ? '' : ' disabled'} aria-label="${esc(c.name)}: verschuiving herstellen">Herstel</button>
        </div>`;
      return `<div class="rg-rij${c.paused ? ' is-pauze' : ''}" data-id="${esc(c.id)}">
        ${icon(c)}
        <div class="rg-rij-t"><b>${esc(c.name)}</b>${c.paused ? '<span class="rg-status rg-status-pauze">Gepauzeerd</span>' : ''}<span class="rg-rij-s">${bits.join(' · ')}</span></div>
        ${knoppen}
      </div>`;
    }).join(''));

    // c. Nu bezig / straks
    const hm = (s) => { const mm = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return mm ? Number(mm[1]) * 60 + Number(mm[2]) : 9999; };
    const now = act.flatMap(c => c.now || []);
    const next = act.flatMap(c => c.next || []).sort((a, b) => hm(a.expected) - hm(b.expected)).slice(0, 6);
    const recent = act.flatMap(c => (c.recent || [])).sort(nieuwst).slice(0, 6);
    const crew = `<a class="rg-item-a rg-item-open" href="/wedstrijd" target="_blank" rel="noopener" aria-label="Open de wedstrijdbediening in een nieuw tabblad"><span>Bediening</span> ↗</a>`;
    const item = (x, right) => `<li class="rg-item">
        ${isIcon(x.icon_small) ? `<img class="rg-item-i" src="${esc(x.icon_small)}" alt="" width="28" height="28" />` : '<span class="rg-item-i"></span>'}
        <div class="rg-item-t"><b>${names(x)}</b><span>${metaLine(x, multi, true)}</span></div>
        ${right}
      </li>`;
    setHtml($('rg-nu'), now.map(x => item(x, `<span class="rg-item-s rg-live">${esc(scoreShort(x))}</span>${crew}`)).join('')
      || '<li class="rg-leeg-li">Er is nu niets bezig.</li>');
    setHtml($('rg-straks'), next.map(x => item(x, `<span class="rg-item-s rg-tijd">${esc(x.expected || x.time || '')}${x.time && x.expected && x.time !== x.expected ? `<small>was ${esc(x.time)}</small>` : ''}</span>${crew}`)).join('')
      || `<li class="rg-leeg-li">${allDone ? 'Alles is gespeeld.' : 'Er staat niets klaar.'}</li>`);
    // d. Laatste uitslagen + corrigeren
    setHtml($('rg-uit'), recent.map(x => item(x, `<span class="rg-item-s">${esc(scoreShort(x))}</span><button type="button" class="rg-item-a" data-rg="corrigeer" data-match="${esc(x.id)}" aria-label="Corrigeer de uitslag van ${esc(x.a || '')} tegen ${esc(x.b || '')}">Corrigeer</button>`)).join('')
      || '<li class="rg-leeg-li">Nog geen uitslagen.</li>');
    // Hier staan alleen de laatste paar. Oudere uitslagen zijn ook te corrigeren: zeg waar.
    const uitNoot = $('rg-uit-noot');
    uitNoot.hidden = t.done <= recent.length;
    if (!uitNoot.textContent) uitNoot.textContent = 'Een oudere uitslag corrigeren? Kies de sport op de tab Toernooi en open "Alle uitslagen". Het kan ook in de Bediening, onder Klaar.';
    // Telefoon: de drie lijsten staan onder alle sportrijen. Eén tik brengt je erheen.
    setHtml($('rg-spring'), t.total === 0 ? '' : [['rg-h-nu', 'Nu bezig', now.length], ['rg-h-straks', 'Straks', null], ['rg-h-uit', 'Uitslagen', t.done]]
      .map(([doel, label, n]) => `<button type="button" class="rg-mini" data-rg="spring" data-doel="${doel}">${label}${n ? ` <span class="rg-spring-n">${n}</span>` : ''}</button>`).join(''));

    // e. Snelkoppelingen. De omroep kent alleen het hoofdtoernooi: zonder schema daar
    // is dat scherm leeg, dus dan staat de link er niet.
    const hoofd = mainComp();
    const omroep = !!(hoofd && hoofd.active && hoofd.matches.total > 0);
    const multiAct = R.hub_mode;
    const prints = act.filter(c => c.matches.total > 0).map(c => `<a class="rg-snel-a rg-snel-print" href="${c.is_default ? '/print' : `/print?competition=${esc(c.id)}`}" target="_blank" rel="noopener">Print ${esc(c.name)} ↗</a>`).join('');
    setHtml($('rg-snel'), `
      <a class="rg-snel-a" href="/wedstrijd" target="_blank" rel="noopener">Bediening ↗</a>
      <a class="rg-snel-a" href="${multiAct ? '/sporten' : '/toernooi'}" target="_blank" rel="noopener">Bord ↗</a>
      <a class="rg-snel-a" href="${multiAct ? '/sporten?screen=1' : '/toernooi?screen=1'}" target="_blank" rel="noopener">TV ↗</a>
      ${omroep ? `<a class="rg-snel-a" href="/omroep" target="_blank" rel="noopener">${multi ? `Omroep ${esc(hoofd.name)}` : 'Omroep'} ↗</a>` : ''}
      ${prints}`);
  }

  dag.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rg], #rg-pauze-alles');
    if (!b) return;
    if (b.id === 'rg-pauze-alles') return pauseAll(b);
    const act = b.dataset.rg;
    if (act === 'dag-uit') return setDag(false);
    if (act === 'corrigeer') return openFix(Number(b.dataset.match));
    if (act === 'spring') {
      const doel = $(b.dataset.doel);
      if (!doel) return;
      const rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      doel.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'start' });
      return doel.focus({ preventScroll: true });
    }
    const c = compById(Number(b.dataset.id));
    if (!c) return;
    await sportAction(act, c, b);
  });

  async function pauseAll(btn) {
    const on = !R.paused_all;
    // Pauzeren vraagt niets (bij onweer telt elke seconde); hervatten wel.
    if (!on && !confirm('Alles hervatten?\n\nDe crew kan dan bij elke sport weer wedstrijden starten.')) return;
    const message = on ? ($('rg-reden')?.value || '').trim() : undefined;
    btn.disabled = true;
    const r = await call('POST', '/api/admin/tournament/pause-all', on ? { on: true, message } : { on: false });
    btn.disabled = false;
    if (!r.ok) return fail(r, on ? 'Pauzeren lukte niet.' : 'Hervatten lukte niet.');
    if (on && $('rg-reden')) $('rg-reden').value = '';
    A.showToast(on ? 'Alles staat op pauze' : 'Alles loopt weer');
    await refresh();
  }

  // Pauze / hervat / verschuiven voor één sport. Het hoofdtoernooi gebruikt dezelfde
  // adressen zonder competition_id (zo deed de admin het al).
  async function sportAction(act, c, btn) {
    const idPart = c.is_default ? {} : { competition_id: c.id };
    let r, okMsg;
    if (btn) btn.disabled = true;
    if (act === 'pauze' || act === 'hervat') {
      r = await call('POST', `/api/admin/tournament/${act === 'pauze' ? 'pause' : 'resume'}`, idPart);
      okMsg = act === 'pauze' ? `${c.name} staat op pauze` : `${c.name} loopt weer`;
    } else if (act === 'shift') {
      const d = parseInt(btn.dataset.d, 10);
      r = await call('POST', '/api/admin/tournament/schedule-shift', { ...idPart, delta: d });
      okMsg = `${c.name}: alles ${Math.abs(d)} min ${d > 0 ? 'later' : 'eerder'}`;
    } else if (act === 'shift-reset') {
      r = await call('POST', '/api/admin/tournament/schedule-shift', { ...idPart, reset: true });
      okMsg = `${c.name}: verschuiving hersteld`;
    } else { if (btn) btn.disabled = false; return; }
    if (btn) btn.disabled = false;
    if (!r.ok) return fail(r, 'Aanpassen lukte niet.');
    A.showToast(okMsg);
    await refresh();
  }

  // ── Uitslag corrigeren (score én sets) ───────────────────────────────────
  function fixModal() {
    let m = $('rg-fix-modal');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'rg-fix-modal';
    m.innerHTML = `<div class="modal rg-fix" role="dialog" aria-modal="true" aria-labelledby="rg-fix-titel">
      <button type="button" class="modal-close" aria-label="Sluiten">×</button>
      <div class="card-eyebrow" id="rg-fix-eyebrow">Uitslag corrigeren</div>
      <h3 id="rg-fix-titel">—</h3>
      <p class="small rg-fix-meta" id="rg-fix-meta"></p>
      <form id="rg-fix-form" novalidate>
        <div id="rg-fix-velden"></div>
        <p class="rg-fix-fout" id="rg-fix-fout" role="alert"></p>
        <p class="small rg-fix-uitleg" id="rg-fix-uitleg"></p>
        <div class="rg-fix-acties">
          <button type="button" class="rg-knop rg-knop-rustig" data-rg="fix-sluit">Annuleren</button>
          <button type="submit" class="rg-knop" id="rg-fix-opslaan">Opslaan</button>
        </div>
      </form></div>`;
    document.body.appendChild(m);
    const close = () => { m.classList.remove('show'); document.body.style.overflow = ''; m.__match = null; terugFocus(m); };
    m.__close = close;
    // aria-modal belooft dat je in het venster blijft: Tab loopt rond. De lijst wordt
    // per toets opnieuw bepaald (de velden wisselen per wedstrijd, de beslissing komt en gaat).
    m.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !m.classList.contains('show')) return;
      const f = [...m.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    m.querySelector('.modal-close').addEventListener('click', close);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-rg="fix-sluit"]')) close(); });
    m.querySelector('#rg-fix-velden').addEventListener('input', syncPens);
    m.querySelector('#rg-fix-form').addEventListener('submit', submitFix);
    return m;
  }
  // Focus terug naar de knop "Corrigeer" waar je vandaan kwam. Is die intussen opnieuw
  // getekend (na opslaan, of door de poll), dan naar de nieuwe knop van dezelfde wedstrijd.
  function terugFocus(m) {
    const el = (m.__terug && document.contains(m.__terug)) ? m.__terug
      : [...document.querySelectorAll(`[data-rg="corrigeer"][data-match="${Number(m.__terugId)}"]`)].find(x => x.offsetParent !== null);
    if (el) el.focus({ preventScroll: true });
  }
  const num = (name, label, val) => `<label class="rg-num"><span>${label}</span><input type="number" name="${name}" min="0" max="99" step="1" inputmode="numeric" pattern="[0-9]*" value="${val == null ? '' : esc(val)}" /></label>`;

  function openFix(matchId) {
    const x = cards.get(matchId);
    const c = x && compById(x.comp_id);
    if (!x || !c) return;
    const m = fixModal();
    m.__match = x; m.__comp = c; m.__terug = document.activeElement; m.__terugId = matchId;
    $('rg-fix-eyebrow').textContent = `Uitslag corrigeren · ${c.name}`;
    $('rg-fix-titel').textContent = `${x.a || '—'} – ${x.b || '—'}`;
    $('rg-fix-meta').textContent = [x.where, placeOf(x), `nu: ${scoreText(x)}`].filter(Boolean).join(' · ');
    $('rg-fix-fout').textContent = '';
    const a = esc(x.a || 'Thuis'), b = esc(x.b || 'Uit');
    let h;
    if (c.result_model === 'sets') {
      const sets = Array.isArray(x.sets) ? x.sets : [];
      h = `<div class="rg-sets" role="group" aria-label="Setstanden">
          <div class="rg-sets-kop"><span></span><span>${a}</span><span>${b}</span></div>
          ${Array.from({ length: c.best_of }, (_, i) => `<div class="rg-sets-rij"><span class="rg-sets-n">Set ${i + 1}</span>
            <input type="number" name="s${i}a" min="0" max="99" inputmode="numeric" pattern="[0-9]*" aria-label="Set ${i + 1}: ${a}" value="${sets[i] ? esc(sets[i][0]) : ''}" />
            <input type="number" name="s${i}b" min="0" max="99" inputmode="numeric" pattern="[0-9]*" aria-label="Set ${i + 1}: ${b}" value="${sets[i] ? esc(sets[i][1]) : ''}" /></div>`).join('')}
        </div>`;
      $('rg-fix-uitleg').textContent = `Best of ${c.best_of}. Laat sets die niet gespeeld zijn leeg.`;
    } else {
      const tb = (c.vocab && c.vocab.tiebreak) || 'Beslissing';
      h = `<div class="rg-score">${num('score_a', a, x.score_a)}<span class="rg-vs" aria-hidden="true">–</span>${num('score_b', b, x.score_b)}</div>
        <div class="rg-pens" id="rg-fix-pens" hidden>
          <div class="rg-label">${esc(tb)} (gelijke stand in de knock-out)</div>
          <div class="rg-score">${num('pens_a', a, x.pens_a)}<span class="rg-vs" aria-hidden="true">–</span>${num('pens_b', b, x.pens_b)}</div>
        </div>`;
      $('rg-fix-uitleg').textContent = c.is_default
        ? 'Een correctie stuurt geen nieuwe uitslag-melding. De stand en de knock-out rekenen meteen opnieuw.'
        : 'De stand rekent meteen opnieuw.';
    }
    $('rg-fix-velden').innerHTML = h;
    syncPens();
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => m.querySelector('input')?.focus(), 60);
  }
  // Beslissing (penalty's) alleen tonen bij een gelijke stand in de knock-out.
  function syncPens() {
    const m = $('rg-fix-modal'), box = $('rg-fix-pens');
    if (!m || !box || !m.__match) return;
    const f = $('rg-fix-form');
    const sa = f.elements.score_a.value, sb = f.elements.score_b.value;
    box.hidden = !(m.__match.phase !== 'group' && sa !== '' && sa === sb);
  }
  async function submitFix(e) {
    e.preventDefault();
    const m = $('rg-fix-modal'), x = m.__match, c = m.__comp, f = e.target, err = $('rg-fix-fout');
    if (!x || !c) return;
    err.textContent = '';
    const body = { match_id: x.id };
    if (c.result_model === 'sets') {
      const sets = [];
      let gap = false;
      for (let i = 0; i < c.best_of; i++) {
        const a = f.elements[`s${i}a`].value, b = f.elements[`s${i}b`].value;
        if (a === '' && b === '') { gap = true; continue; }
        if (gap || a === '' || b === '') { err.textContent = `Vul set ${gap ? i : i + 1} helemaal in, of laat hem leeg.`; return; }
        sets.push([Number(a), Number(b)]);
      }
      body.sets = sets;
    } else {
      body.score_a = f.elements.score_a.value; body.score_b = f.elements.score_b.value;
      if (!$('rg-fix-pens').hidden) { body.pens_a = f.elements.pens_a.value; body.pens_b = f.elements.pens_b.value; }
    }
    const btn = $('rg-fix-opslaan');
    btn.disabled = true;
    const r = await call('POST', '/api/admin/tournament/score', body);
    btn.disabled = false;
    // De server legt uit waarom iets niet mag (bv. "de knock-out is al begonnen"):
    // die tekst letterlijk tonen, in het venster.
    if (!r.ok) { if (!r.net) err.textContent = r.j.error || `Opslaan lukte niet (${r.status}).`; return; }
    m.__close();
    A.showToast('Uitslag aangepast');
    if (paneel.__id === c.id) await loadDetail(c.id);
    await refresh();
    terugFocus(m);   // de lijst is opnieuw getekend: de oude knop bestaat niet meer
  }

  // ── 1. Regie-startscherm ─────────────────────────────────────────────────
  // Goedgekeurde teams die niet in het schema staan (goedgekeurd ná "Maak schema").
  // Stuurt de server het aantal mee (teams.unscheduled), dan geldt dat. Anders tellen
  // we zelf: de teams in het schema van die sport naast de teamlijst van de admin.
  // Het schema wordt alleen opnieuw opgehaald als het aantal goedgekeurde teams of
  // het aantal wedstrijden verandert, niet elke ronde.
  const inSchema = {};        // comp-id → { key, ids: Set | null }
  function losVan(c) {
    if (typeof c.teams.unscheduled === 'number') return c.teams.unscheduled;
    const s = inSchema[c.id];
    if (!s || !s.ids) return 0;
    const ts = A.getTeams();
    return !Array.isArray(ts) ? 0 : ts.filter(t => t.status === 'approved' && (t.competition_id || 1) === c.id && !s.ids.has(t.id)).length;
  }
  function checkSchema() {
    for (const c of comps()) {
      if (typeof c.teams.unscheduled === 'number') continue;
      if (!c.active || c.finished || !c.matches.total) { delete inSchema[c.id]; continue; }
      const key = `${c.teams.approved}:${c.matches.total}`;
      const was = inSchema[c.id];
      if (was && was.key === key) continue;
      inSchema[c.id] = { key, ids: was ? was.ids : null };
      fetch(c.is_default ? '/api/tournament' : `/api/tournament?competition=${encodeURIComponent(c.id)}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          const ids = new Set();
          for (const p of Object.keys((j && j.poules) || {})) for (const s of (j.poules[p].standings || [])) if (Number.isInteger(s.id)) ids.add(s.id);
          if (!ids.size) { delete inSchema[c.id]; return; }   // onbekende vorm: liever niets dan een valse waarschuwing
          inSchema[c.id] = { key, ids };
          if (aan && R && !dagAan) paintRegie();
        })
        .catch(() => { delete inSchema[c.id]; });
    }
  }
  const STEPS = ['Instellen', 'Aanmeldingen', 'Schema', 'Speeldag', 'Afgerond'];
  function stateOf(c) {
    const t = c.teams, m = c.matches;
    if (!c.active) return { step: 0, key: 'inactief' };
    if (c.finished) return { step: 4, key: 'klaar' };
    if (m.live > 0 || m.done > 0) return { step: 3, key: 'bezig' };
    if (m.total > 0) return { step: 3, key: 'schema-staat' };
    if (t.pending > 0) return { step: 1, key: 'beoordelen' };
    if (t.approved >= 2) return { step: 2, key: 'maak-schema' };
    return { step: 1, key: 'wachten' };
  }
  function rail(st) {
    return `<ol class="rg-rail">${STEPS.map((s, i) => {
      const done = st.key === 'klaar' || i < st.step;
      const cur = st.key === 'klaar' ? i === STEPS.length - 1 : i === st.step;
      const cls = done ? 'is-klaar' : cur ? 'is-nu' : 'is-straks';
      const word = done ? 'klaar' : cur ? 'hier ben je nu' : 'komt nog';
      return `<li class="${cls}${cur ? ' is-hier' : ''}"${cur ? ' aria-current="step"' : ''}><span class="rg-rail-p" aria-hidden="true">${done ? IC.check : i + 1}</span><span class="rg-rail-t">${s}</span><span class="rg-sr"> (${word})</span></li>`;
    }).join('')}</ol>`;
  }
  function card(c) {
    const st = stateOf(c), t = c.teams, m = c.matches, id = esc(c.id);
    const link = (label, attrs) => `<button type="button" class="rg-link" ${attrs} data-id="${id}">${label}</button>`;
    const ext = (label, href) => `<a class="rg-link" href="${href}" target="_blank" rel="noopener">${label} ↗</a>`;
    let primary = '', quiet = [], noot = '';
    if (st.key === 'inactief') {
      primary = `<button type="button" class="rg-knop" data-rg="bewerk" data-id="${id}">Bewerk en zet actief</button>`;
      noot = 'Deze sport staat uit: niet te kiezen bij aanmelden en niet op het bord.';
    } else if (st.key === 'wachten') {
      const need = Math.max(0, 2 - t.approved);
      primary = `<button type="button" class="rg-knop" data-rg="kopieer" data-id="${id}">Kopieer de aanmeldlink</button>`;
      quiet = [link('Bewerken', 'data-rg="bewerk"')];
      noot = t.approved === 0 && t.waiting === 0 ? `Nog geen aanmeldingen. Deel de link, dan komen ze vanzelf.`
        : `Nog ${plural(need, 'goedgekeurde aanmelding', 'goedgekeurde aanmeldingen')} nodig voor een schema.`;
    } else if (st.key === 'beoordelen') {
      primary = `<button type="button" class="rg-knop" data-rg="beoordeel" data-id="${id}">Beoordeel ${plural(t.pending, 'aanmelding', 'aanmeldingen')}</button>`;
      quiet = [link('Bewerken', 'data-rg="bewerk"')];
    } else if (st.key === 'maak-schema') {
      primary = `<button type="button" class="rg-knop" data-rg="maak-schema" data-id="${id}">Maak schema</button>`;
      quiet = [link('Bewerken', 'data-rg="bewerk"')];
      noot = c.is_default ? 'Je kiest eerst de opzet; daarna maak je het schema.' : `Met ${t.approved} ${esc(c.unit)}. De opzet kiest het systeem zelf; aanpassen kan daarna.`;
    } else if (st.key === 'schema-staat') {
      primary = `<a class="rg-knop" href="/wedstrijd" target="_blank" rel="noopener">Open bediening ↗</a>`;
      quiet = [ext('Bekijk schema', R.hub_mode ? `/sporten?sport=${id}` : '/toernooi'), link('Beheer', 'data-rg="beheer"')];
      noot = c.expected_end ? `Schema staat. Start ${esc(c.start_time)}, klaar rond ${esc(c.expected_end)}.` : 'Schema staat.';
    } else if (st.key === 'bezig') {
      primary = `<button type="button" class="rg-knop" data-rg="dag-aan" data-id="${id}">Naar wedstrijddag</button>`;
      quiet = [ext('Open bediening', '/wedstrijd'), link('Beheer', 'data-rg="beheer"')];
      noot = c.delay_min > 0 ? `Loopt ${c.delay_min} min uit.` : (c.expected_end ? `Klaar rond ${esc(c.expected_end)}.` : '');
    } else {
      const open = !!eindstand[c.id];
      primary = `<button type="button" class="rg-knop" data-rg="eindstand" data-id="${id}" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Verberg eindstand' : 'Eindstand'}</button>`;
      quiet = [link('Afronden', 'data-rg="naar-afronden"'), link('Beheer', 'data-rg="beheer"')];
      noot = 'Alle wedstrijden zijn gespeeld.';
    }
    // Goedgekeurd nadat het schema is gemaakt: dat team heeft geen enkele wedstrijd.
    // Vaste tekst met een getal; er komt geen invoer van gebruikers in.
    const los = losVan(c);
    let losNoot = '';
    if (los > 0 && (st.key === 'schema-staat' || st.key === 'bezig')) {
      const wie = c.solo ? plural(los, 'goedgekeurde deelnemer staat', 'goedgekeurde deelnemers staan') : plural(los, 'goedgekeurd team staat', 'goedgekeurde teams staan');
      if (st.key === 'schema-staat') {
        primary = `<button type="button" class="rg-knop" data-rg="beheer" data-id="${id}">Schema opnieuw maken</button>`;
        quiet = [ext('Open bediening', '/wedstrijd'), ext('Bekijk schema', R.hub_mode ? `/sporten?sport=${id}` : '/toernooi')];
        losNoot = `${wie} niet in het schema. Maak het schema opnieuw; dat kan nu nog zonder iets te verliezen.`;
      } else {
        losNoot = `${wie} niet in het schema. Opnieuw maken wist de uitslagen. Zet ${los === 1 ? (c.solo ? 'de deelnemer' : 'het team') : 'ze'} terug op de wachtlijst, of maak het schema toch opnieuw bij Beheer.`;
      }
    }
    // Late aanmeldingen terwijl het schema al staat: de hoofdknop blijft bij de fase,
    // maar je kunt er wel in één tik heen.
    if (t.pending > 0 && st.key !== 'beoordelen' && c.active) quiet.unshift(link(`Beoordeel ${t.pending}`, 'data-rg="beoordeel"'));
    if (c.warning && st.key !== 'klaar') noot = esc(c.warning);
    if (losNoot) noot = losNoot;
    if (c.paused && c.active) noot = `Gepauzeerd${c.pause_message ? `: "${esc(c.pause_message)}"` : ''}. ${noot}`;
    const status = !c.active ? '<span class="rg-status rg-status-uit">Inactief</span>'
      : c.paused ? '<span class="rg-status rg-status-pauze">Gepauzeerd</span>'
      : m.live > 0 ? `<span class="rg-status rg-status-live">${m.live} live</span>` : '';
    // Zonder vaste teamgrootte (hoofdtoernooi) geen los woord "teams" vooraan.
    const sub = [c.team_label || '', `${c.places}× ${String(c.place_noun).toLowerCase()}`, c.result_model === 'sets' ? `sets, best of ${c.best_of}` : '', `start ${c.start_time}`].filter(Boolean).map(esc).join(' · ');
    const es = st.key === 'klaar' ? eindstand[c.id] : null;
    return `<article class="rg-kaart rg-stap-${st.step}${c.active ? '' : ' is-uit'}" data-id="${id}" aria-label="${esc(c.name)}">
      <header class="rg-kaart-kop">${icon(c)}
        <div class="rg-kaart-naam"><h4>${esc(c.name)}${c.is_default && comps().length > 1 ? ' <span class="rg-hoofd">hoofdtoernooi</span>' : ''}</h4><span>${sub}</span></div>
        ${status}
      </header>
      ${rail(st)}
      <dl class="rg-cijfers">
        <div><dt>Goedgekeurd</dt><dd>${t.approved}<span>/${c.max_teams}</span></dd></div>
        <div class="${t.pending > 0 ? 'is-actie' : ''}"><dt>Wacht op jou</dt><dd>${t.pending}</dd></div>
        <div><dt>Gespeeld</dt><dd>${m.total ? `${m.done}<span>/${m.total}</span>` : '<span class="rg-geen">–</span>'}</dd></div>
      </dl>
      ${noot ? `<p class="rg-noot${losNoot ? ' rg-noot-let' : ''}">${noot}</p>` : ''}
      ${es ? `<ol class="rg-eindstand">${es.map(s => `<li><span>${esc(s.pos)}</span>${esc(s.name)}</li>`).join('') || '<li>Nog geen eindstand.</li>'}</ol>` : ''}
      <div class="rg-acties">${primary}${quiet.length ? `<div class="rg-links">${quiet.join('')}</div>` : ''}</div>
    </article>`;
  }

  // Voorinstellingen per sport: één lijst, in admin-competities.js (ook te kiezen
  // bij "+ Nieuwe sport", zodat de eerste sport er al een kan gebruiken).
  const presetObj = (p) => HUB().presetObj(p, comps(), R.event && R.event.startTime);

  function regieSkeleton() {
    if (regie.__klaar) return;
    regie.__klaar = true;
    regie.innerHTML = `
      <div class="rg-kop">
        <div class="card-eyebrow">Regie</div>
        <h3 class="rg-titel" id="rg-regie-titel">Wat moet je nu doen?</h3>
        <p class="rg-sub" id="rg-regie-sub"></p>
      </div>
      <div id="rg-ev"></div>
      <div class="rg-kaarten" id="rg-kaarten"></div>
      <div class="rg-nieuw" id="rg-nieuw" hidden>
        <h4 id="rg-nieuw-titel">Welke sport komt erbij?</h4>
        <p class="rg-sub">Een voorinstelling vult het formulier alvast in. Je kunt daarna alles nog aanpassen.</p>
        <div class="rg-presets" id="rg-presets" role="group" aria-labelledby="rg-nieuw-titel"></div>
      </div>
      <div class="rg-form-wrap" id="rg-form-wrap"></div>
      <div id="rg-af"></div>`;
  }

  function paintRegie() {
    regie.hidden = dagAan;
    if (dagAan) return;
    regieSkeleton();
    const list = comps();
    const pend = R.totals.waiting != null ? list.reduce((s, c) => s + c.teams.pending, 0) : 0;
    const noSchema = list.filter(c => c.active && stateOf(c).key === 'maak-schema').length;
    const bits = [];
    if (pend) bits.push(`${plural(pend, 'aanmelding wacht', 'aanmeldingen wachten')} op jou`);
    if (noSchema) bits.push(`${plural(noSchema, 'sport kan', 'sporten kunnen')} een schema krijgen`);
    if (R.totals.live) bits.push(`${R.totals.live} live`);
    const af = afrondenNu();
    // Evenement-regel: de checklist "Klaar voor de start?" in één regel.
    const open = (R.checks || []).filter(c => !c.competition_id && c.level !== 'ok');
    const los = list.filter(c => c.active && !c.finished && c.matches.total > 0 && losVan(c) > 0).length;
    if (los) bits.unshift(`${plural(los, 'sport heeft', 'sporten hebben')} een goedgekeurd team buiten het schema`);
    // Niets dat op jou wacht: zeg wat er wél aan de hand is, niet "alles loopt".
    const rust = !list.some(c => c.active) ? 'Nog geen sport actief. Voeg er hieronder een toe.'
      : R.totals.total > 0 ? 'Het schema staat. Er is nu niets bezig.'
      : open.length ? `Nog ${plural(open.length, 'ding', 'dingen')} te regelen voor de start. Deel intussen de aanmeldlink.`
      : 'Wacht op aanmeldingen. Deel de aanmeldlink.';
    const txt = bits.length ? `${bits.join(' · ')}.` : af.allDone ? 'Alles is gespeeld. Rond de dag hieronder af.' : rust;
    subTekst($('rg-regie-sub'), txt.replace(/^./, m => m.toUpperCase()));

    const fout = open.filter(c => c.level === 'fout').length;
    const ev = R.event || {};
    setHtml($('rg-ev'), `<button type="button" class="rg-ev${open.length ? (fout ? ' is-fout' : ' is-let') : ' is-ok'}" data-rg="evenement">
        <span class="rg-ev-m" aria-hidden="true">${open.length ? open.length : IC.check}</span>
        <span class="rg-ev-t"><b>${esc(ev.name || 'Evenement')}</b><span>${[ev.dateText || 'Datum volgt', ev.location].filter(Boolean).map(esc).join(' · ')}</span></span>
        <span class="rg-ev-s">${open.length ? `${plural(open.length, 'ding', 'dingen')} nog regelen` : 'Klaar'}</span>${IC.chev}
      </button>`);

    setHtml($('rg-kaarten'), list.map(card).join('')
      + `<button type="button" class="rg-kaart rg-kaart-nieuw" data-rg="nieuw" aria-expanded="${nieuwOpen ? 'true' : 'false'}" aria-controls="rg-nieuw">${IC.plus}<b>Sport toevoegen</b><span>Met een voorinstelling per sport</span></button>`);

    // Voorinstellingen
    $('rg-nieuw').hidden = !nieuwOpen;
    if (nieuwOpen) {
      const ok = HUB() ? HUB().presets() : [];
      setHtml($('rg-presets'), ok.map(p => `<button type="button" class="rg-preset" data-rg="preset" data-sport="${esc(p.sport)}">
          <img src="/sport/${esc(p.sport)}-klein.webp" alt="" width="36" height="36" /><b>${esc(p.name)}</b><span>${esc(p.sub)}</span></button>`).join('')
        + `<button type="button" class="rg-preset rg-preset-leeg" data-rg="preset" data-sport=""><span class="rg-preset-plus" aria-hidden="true">${IC.plus}</span><b>Iets anders</b><span>Leeg formulier</span></button>`);
    }

    paintAfronden();
  }

  // ── 4. Afronden ──────────────────────────────────────────────────────────
  function afrondenNu() {
    const withMatches = actives().filter(c => c.matches.total > 0);
    const allDone = withMatches.length > 0 && withMatches.every(c => c.finished);
    const d = new Date(R.server_now || Date.now());
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const past = !!(R.event && R.event.date && R.event.date < today);
    return { show: allDone || past, allDone, past };
  }
  function paintAfronden() {
    const a = afrondenNu();
    setHtml($('rg-af'), !a.show ? '' : `<section class="rg-af" id="rg-afronden" aria-labelledby="rg-af-titel">
        <div class="card-eyebrow">Afronden</div>
        <h4 class="rg-titel" id="rg-af-titel">${a.allDone ? 'De dag zit erop. Nog drie dingen.' : 'De datum is voorbij. Nog drie dingen.'}</h4>
        <ol class="rg-af-stappen">
          <li><span class="rg-af-n" aria-hidden="true">1</span><div><b>Bewaar de uitslagen</b><span>Eén bestand met alle standen en eindstanden, van elke sport.</span></div>
            <button type="button" class="rg-knop rg-knop-rustig" data-rg="af-download">Download resultaten</button></li>
          <li><span class="rg-af-n" aria-hidden="true">2</span><div><b>Bedank iedereen en vraag feedback</b><span>Je ziet eerst een voorbeeld met het aantal ontvangers. Er gaat niets weg tot jij op versturen tikt.</span></div>
            <div class="rg-af-k"><button type="button" class="rg-knop rg-knop-rustig" data-rg="af-mail">Mail bedankt &amp; feedback</button><button type="button" class="rg-link" data-rg="af-feedback">Bekijk de feedback</button></div></li>
          <li><span class="rg-af-n" aria-hidden="true">3</span><div><b>Schone start</b><span>Pas als je alles hebt bewaard. Wist aanmeldingen, teams en uitslagen; je instellingen en sporten blijven staan.</span></div>
            <button type="button" class="rg-knop rg-knop-rustig" data-rg="af-wis">Open het wis-paneel</button></li>
        </ol>
      </section>`);
  }

  function openFold(el) {
    if (!el) return;
    if (el.tagName === 'DETAILS') el.open = true;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  regie.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rg]');
    if (!b) return;
    const act = b.dataset.rg;
    const c = b.dataset.id ? compById(Number(b.dataset.id)) : null;
    if (act === 'evenement') return openFold($('evc-fold'));
    if (act === 'nieuw') {
      nieuwOpen = !nieuwOpen;
      if (!nieuwOpen) $('rg-form-wrap').innerHTML = '';
      paintRegie();
      if (nieuwOpen) openFold($('rg-nieuw'));
      return;
    }
    if (act === 'preset') {
      const h = HUB(); if (!h) return;
      const p = h.presets().find(x => x.sport === b.dataset.sport);
      regie.querySelectorAll('.rg-preset').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      const wrap = $('rg-form-wrap');
      wrap.innerHTML = h.formHtml(null, p ? presetObj(p) : null) + '<p class="hub-msg" id="rg-form-msg" role="alert"></p>';
      openFold(wrap);
      setTimeout(() => wrap.querySelector('input[name="name"]')?.focus({ preventScroll: true }), 350);
      return;
    }
    if (act === 'af-download') return $('tourn-export-results')?.click();
    if (act === 'af-mail') return $('tourn-feedback-mail')?.click();
    if (act === 'af-feedback') { A.selSport = null; go('tournament'); return setTimeout(() => openFold($('fb-fold')), 250); }
    if (act === 'af-wis') {
      const panel = document.querySelector('#tab-overview .danger-zone');
      const d = panel && panel.querySelector('details.danger-collapse');
      if (d) d.open = true;
      return openFold(panel);
    }
    if (!c) return;
    if (act === 'beoordeel') { A.selSport = c.id; A.setFilter('pending'); go('teams'); return; }
    if (act === 'beheer') { A.selSport = c.id; go('tournament'); return; }
    if (act === 'dag-aan') return setDag(true);
    if (act === 'naar-afronden') return openFold($('rg-afronden'));
    if (act === 'kopieer') {
      const url = `${location.origin}/`;
      try { await navigator.clipboard.writeText(url); A.showToast('Aanmeldlink gekopieerd'); }
      catch { prompt('Kopieer de aanmeldlink:', url); }
      return;
    }
    if (act === 'bewerk') {
      const h = HUB(); if (!h) return;
      const full = (h.getMeta().competitions || []).find(x => x.id === c.id) || c;
      nieuwOpen = false; paintRegie();
      const wrap = $('rg-form-wrap');
      wrap.innerHTML = `<h4 class="rg-form-titel">${esc(c.name)} bewerken</h4>` + h.formHtml(full) + '<p class="hub-msg" id="rg-form-msg" role="alert"></p>';
      return openFold(wrap);
    }
    if (act === 'maak-schema') return makeSchedule(c, b);
    if (act === 'eindstand') return toggleEindstand(c);
  });

  // Formulier (nieuw of bewerken) in het Regie-scherm en in het sportpaneel.
  async function onFormSubmit(e) {
    const f = e.target.closest('form.hub-form');
    if (!f) return;
    e.preventDefault();
    const h = HUB(); if (!h) return;
    const wrap = f.parentElement;
    const msg = wrap.querySelector('.hub-msg');
    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const out = await h.saveForm(f);
      wrap.innerHTML = '';
      nieuwOpen = false;
      A.showToast(out.isNew ? `${out.name} toegevoegd` : `${out.name} opgeslagen`);
      await refresh();
      if (out.isNew && out.id) regie.querySelector(`.rg-kaart[data-id="${out.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      if (btn) btn.disabled = false;
      if (msg) { msg.textContent = err.message; msg.classList.add('err'); }
    }
  }
  function onFormClose(e) {
    const b = e.target.closest('form.hub-form [data-act="close"]');
    if (b) b.closest('.rg-form-wrap').innerHTML = '';
  }
  regie.addEventListener('submit', onFormSubmit);
  regie.addEventListener('click', onFormClose);
  paneel.addEventListener('submit', onFormSubmit);
  paneel.addEventListener('click', onFormClose);

  // Schema maken. Hoofdtoernooi: de bestaande opzetkiezer (daar kies je 16/18/20 en
  // de knock-out-variant). Andere sporten: direct, opzet automatisch.
  async function makeSchedule(c, btn, format) {
    if (c.is_default) {
      A.selSport = c.id;
      go('tournament');
      return setTimeout(() => openFold($('tc-setup-fold')), 250);
    }
    const h = HUB(); if (!h) return;
    if (btn) btn.disabled = true;
    try {
      const out = await h.generateFor(c, format || 'auto');
      if (!out) return;
      const n = Object.values(out.poules || {}).reduce((s, p) => s + p.matches.length, 0) + (out.knockout || []).length;
      const base = `Schema voor ${c.name} staat: ${plural(n, 'wedstrijd', 'wedstrijden')}${out.expected_end ? `, klaar rond ${out.expected_end}` : ''}.`;
      // De server waarschuwt als het schema na de eindtijd van de dag doorloopt.
      if (out.warning) A.showToast(`${base} Let op: ${out.warning}`, 'info'); else A.showToast(base);
      h.load();
      delete inSchema[c.id];   // nieuw schema: opnieuw nagaan wie erin zit
      await refresh();
    } catch (err) {
      if (err && err.message !== 'Sessie verlopen') A.showToast(err.message || 'Schema maken lukte niet.', err.cancelled ? 'info' : 'error');
    } finally { if (btn) btn.disabled = false; }
  }

  async function toggleEindstand(c) {
    if (eindstand[c.id]) { delete eindstand[c.id]; return paintRegie(); }
    try {
      const r = await fetch(c.is_default ? '/api/tournament' : `/api/tournament?competition=${encodeURIComponent(c.id)}`, { cache: 'no-store' });
      const j = await r.json();
      eindstand[c.id] = Array.isArray(j.final_standing) ? j.final_standing.slice(0, 8) : [];
    } catch { A.showToast('Eindstand ophalen lukte niet.', 'error'); return; }
    paintRegie();
  }

  // ── Sportpaneel op de tab Toernooi ───────────────────────────────────────
  function paintPaneel() {
    const c = compById(A.selSport);
    const show = !!(c && !c.is_default);
    $('tab-tournament').classList.toggle('rg-andere-sport', show);
    paneel.hidden = !show;
    if (!show) { paneel.__id = null; return; }
    const main = mainComp();
    if (paneel.__id !== c.id) {
      paneel.__id = c.id;
      paneel.innerHTML = `
        <div class="tc-head">
          <div><div class="card-eyebrow">Toernooi · gekozen sport</div><h3 id="rg-paneel-titel"></h3></div>
          <div class="tc-statebadge off" id="rg-p-state"></div>
        </div>
        <div class="tc-stats" id="rg-p-stats"></div>
        <p class="rg-noot" id="rg-p-noot" hidden></p>
        <div id="rg-p-acties"></div>
        <div class="rg-form-wrap" id="rg-p-form"></div>
        <div class="rg-kolommen rg-kolommen-2">
          <section aria-labelledby="rg-p-h1"><h4 id="rg-p-h1">Eerstvolgende wedstrijden</h4><ul class="rg-lijst" id="rg-p-next"></ul></section>
          <section aria-labelledby="rg-p-h2"><h4 id="rg-p-h2">Stand</h4><div id="rg-p-stand"></div></section>
        </div>
        <details class="rg-alle" id="rg-p-alle" hidden><summary id="rg-p-alle-kop"></summary><ul class="rg-lijst" id="rg-p-uit"></ul></details>
        <div class="tc-links" id="rg-p-links"></div>
        <p class="rg-eerlijk" id="rg-p-eerlijk"></p>`;
      loadDetail(c.id);
    }
    const m = c.matches, t = c.teams;
    $('rg-paneel-titel').textContent = `Schema van ${c.name}`;
    const stEl = $('rg-p-state');
    const stTxt = !c.active ? 'Inactief' : c.paused ? 'Gepauzeerd' : c.finished ? 'Afgerond' : m.live > 0 ? `${m.live} live` : m.total ? 'Schema staat' : 'Nog geen schema';
    stEl.className = `tc-statebadge ${m.live > 0 && !c.paused ? 'on' : 'off'}`;
    setHtml(stEl, `<span class="d"></span>${esc(stTxt)}`);
    const tile = (v, k, cls = '') => `<div class="tc-tile"><div class="v ${cls}">${v}</div><div class="k">${k}</div></div>`;
    setHtml($('rg-p-stats'), tile(`${t.approved}<small>/${c.max_teams}</small>`, 'Goedgekeurd')
      + tile(t.pending, 'Wacht op jou', t.pending ? 'gold' : '')
      + tile(m.total ? `${m.done}<small>/${m.total}</small>` : '–', 'Gespeeld')
      + tile(esc(c.expected_end || '–'), 'Klaar rond'));
    const noot = $('rg-p-noot');
    const nt = c.warning || (c.paused ? `Gepauzeerd${c.pause_message ? `: "${c.pause_message}"` : ''}. Niemand kan een wedstrijd starten.` : (c.delay_min >= 3 ? `Loopt ${c.delay_min} min uit.` : ''));
    noot.hidden = !nt; noot.textContent = nt;

    const meta = HUB() ? HUB().getMeta() : { formats: [] };
    const fmts = `<label class="rg-sr" for="rg-p-fmt">Opzet</label><select id="rg-p-fmt" class="rg-select"><option value="auto">Opzet: automatisch</option>${(meta.formats || []).map(f => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('')}</select>`;
    const id = esc(c.id);
    let h;
    if (!m.total) {
      h = `<div class="rg-p-rij">${fmts}<button type="button" class="rg-knop" data-rg="genereer" data-id="${id}"${t.approved < 2 ? ' disabled' : ''}>Genereer schema</button>
           <button type="button" class="rg-knop rg-knop-rustig" data-rg="bewerk" data-id="${id}">Bewerken</button></div>
           ${t.approved < 2 ? `<p class="rg-noot">Nog ${plural(2 - t.approved, 'goedgekeurde aanmelding', 'goedgekeurde aanmeldingen')} nodig voor een schema.</p>` : ''}`;
    } else {
      h = `<div class="rg-p-rij" role="group" aria-label="Bijsturen">
            ${c.finished ? '<span class="rg-p-shift">Alle wedstrijden zijn gespeeld.</span>' : `
            <button type="button" class="rg-mini${c.paused ? ' is-pauze' : ''}" data-rg="${c.paused ? 'hervat' : 'pauze'}" data-id="${id}">${c.paused ? 'Hervat' : 'Pauze'}</button>
            <button type="button" class="rg-mini" data-rg="shift" data-d="-5" data-id="${id}" aria-label="Alles 5 minuten eerder">−5</button>
            <button type="button" class="rg-mini" data-rg="shift" data-d="5" data-id="${id}" aria-label="Alles 5 minuten later">+5</button>
            <button type="button" class="rg-mini" data-rg="shift-reset" data-id="${id}"${c.shift_min ? '' : ' disabled'}>Herstel</button>
            <span class="rg-p-shift">${c.shift_min ? `Nu ${c.shift_min > 0 ? '+' : '−'}${Math.abs(c.shift_min)} min verschoven` : 'Tijden staan zoals gepland'}</span>`}
            <button type="button" class="rg-knop rg-knop-rustig" data-rg="bewerk" data-id="${id}">Bewerken</button>
          </div>
          <details class="rg-gevaar"><summary>Opnieuw genereren of resetten</summary>
            <p class="small">Opnieuw genereren maakt een nieuwe indeling en nieuwe tijden. Reset haalt het schema en alle uitslagen van ${esc(c.name)} weg; de aanmeldingen blijven staan.${m.done || m.live ? ' Er is al gespeeld: je moet WIS typen om door te gaan.' : ''}</p>
            <div class="rg-p-rij">${fmts}<button type="button" class="btn-sm" data-rg="genereer" data-id="${id}">Opnieuw genereren</button>
            <button type="button" class="btn-sm danger" data-rg="reset" data-id="${id}">Reset</button></div>
          </details>`;
    }
    // Verandert dit blok (pauze, verschuiven, eerste aftrap), dan wordt het opnieuw
    // getekend. De open vouw en de gekozen opzet mogen daarbij niet stil terugspringen:
    // anders genereer je met "automatisch" terwijl je iets anders had gekozen.
    const acties = $('rg-p-acties');
    if (acties.__rg !== h) {
      const d0 = acties.querySelector('.rg-gevaar');
      const open0 = !!(d0 && d0.open);
      const s0 = acties.querySelector('select');
      const fmt0 = s0 ? s0.value : null;
      const focusFmt = !!s0 && document.activeElement === s0;
      setHtml(acties, h);
      const d1 = acties.querySelector('.rg-gevaar');
      if (d1 && open0) d1.open = true;
      const s1 = acties.querySelector('select');
      if (s1 && fmt0 && [...s1.options].some(o => o.value === fmt0)) s1.value = fmt0;
      if (s1 && focusFmt) s1.focus({ preventScroll: true });
    }

    setHtml($('rg-p-next'), (c.now || []).concat(c.next || []).slice(0, 5).map(x => `<li class="rg-item">
        <div class="rg-item-t"><b>${names(x)}</b><span>${metaLine(x, false)}</span></div>
        <span class="rg-item-s ${x.status === 'live' ? 'rg-live' : 'rg-tijd'}">${x.status === 'live' ? `live ${esc(scoreShort(x))}` : esc(x.expected || x.time || '')}</span></li>`).join('')
      || `<li class="rg-leeg-li">${m.total ? (c.finished ? 'Alles is gespeeld.' : 'Er staat niets klaar.') : 'Nog geen schema.'}</li>`);
    paintStand(c);
    paintUitslagen(c);
    setHtml($('rg-p-links'), `<a class="tc-link primary" href="/wedstrijd" target="_blank" rel="noopener">Wedstrijdbediening ↗</a>
      <a class="tc-link" href="/sporten?sport=${id}" target="_blank" rel="noopener">Bord van ${esc(c.name)} ↗</a>
      <a class="tc-link" href="/print?competition=${id}" target="_blank" rel="noopener">Print-backup ↗</a>`);
    $('rg-p-eerlijk').textContent = `Losse wedstrijden verzetten, wachttijden en de ronde-meldingen zijn er alleen voor ${main ? main.name : 'het hoofdtoernooi'}. Kies die sport of "Alle sporten" om die blokken weer te zien.`;
  }
  function paintStand(c) {
    const d = detail[c.id];
    const el = $('rg-p-stand');
    if (!el) return;
    if (!d || !d.configured) return setHtml(el, `<p class="rg-leeg-li">${d ? 'Nog geen stand.' : 'Laden…'}</p>`);
    const sets = c.result_model === 'sets';
    setHtml(el, Object.keys(d.poules || {}).map(p => `<table class="rg-stand">
        <caption>Poule ${esc(p)}</caption>
        <thead><tr><th scope="col">#</th><th scope="col">${esc(c.solo ? 'Speler' : 'Team')}</th><th scope="col" title="Gespeeld">GS</th><th scope="col" title="Gewonnen">W</th><th scope="col" title="${sets ? 'Setsaldo' : 'Doelsaldo'}">+/−</th><th scope="col" title="Punten">Ptn</th></tr></thead>
        <tbody>${d.poules[p].standings.map(s => `<tr><td>${esc(s.pos)}</td><th scope="row">${esc(s.name)}</th><td>${esc(s.gp)}</td><td>${esc(s.w)}</td><td>${s.gd > 0 ? '+' : ''}${esc(s.gd)}</td><td><b>${esc(s.pts)}</b></td></tr>`).join('')}</tbody>
      </table>`).join('') || '<p class="rg-leeg-li">Nog geen stand.</p>');
  }
  // Alle uitslagen van de gekozen sport, elk met "Corrigeer" (niet alleen de laatste paar).
  function paintUitslagen(c) {
    const box = $('rg-p-alle');
    if (!box) return;
    const all = gespeeld(c);
    box.hidden = !all.length;
    if (!all.length) return;
    const kop = `Alle uitslagen (${all.length})`;
    if ($('rg-p-alle-kop').textContent !== kop) $('rg-p-alle-kop').textContent = kop;
    setHtml($('rg-p-uit'), all.map(x => `<li class="rg-item">
        <div class="rg-item-t"><b>${names(x)}</b><span>${metaLine(x, false, true)}</span></div>
        <span class="rg-item-s">${esc(scoreShort(x))}</span>
        <button type="button" class="rg-item-a" data-rg="corrigeer" data-match="${esc(x.id)}" aria-label="Corrigeer de uitslag van ${esc(x.a || '')} tegen ${esc(x.b || '')}">Corrigeer</button></li>`).join(''));
  }
  async function loadDetail(id) {
    try {
      const r = await fetch(`/api/tournament?competition=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) return;
      detail[id] = await r.json();
      const c = compById(id);
      if (c && paneel.__id === id) {
        for (const x of gespeeld(c)) cards.set(x.id, x);
        paintStand(c); paintUitslagen(c);
      }
    } catch { /* stand blijft op de laatst bekende */ }
  }

  paneel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rg]');
    if (!b) return;
    if (b.dataset.rg === 'corrigeer') return openFix(Number(b.dataset.match));
    const c = compById(Number(b.dataset.id));
    if (!c) return;
    const act = b.dataset.rg;
    if (act === 'bewerk') {
      const h = HUB(); if (!h) return;
      const full = (h.getMeta().competitions || []).find(x => x.id === c.id) || c;
      const wrap = $('rg-p-form');
      wrap.innerHTML = `<h4 class="rg-form-titel">${esc(c.name)} bewerken</h4>` + h.formHtml(full) + '<p class="hub-msg" role="alert"></p>';
      return openFold(wrap);
    }
    if (act === 'genereer') {
      const sel = b.closest('.rg-p-rij')?.querySelector('select');
      const fmt = (sel && sel.value) || 'auto';
      const opzet = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace(/^Opzet: /, '') : 'automatisch';
      if (c.matches.total && !confirm(`Het schema van ${c.name} opnieuw maken?\n\nOpzet: ${opzet}. De indeling en alle tijden worden opnieuw bepaald.`)) return;
      await makeSchedule(c, b, fmt);
      return loadDetail(c.id);
    }
    if (act === 'reset') {
      const played = c.matches.done + c.matches.live;
      if (played) {
        const typed = prompt(`Bij ${c.name} ${played === 1 ? 'is al 1 wedstrijd' : `zijn al ${played} wedstrijden`} bezig of gespeeld.\n\nReset wist het schema en alle uitslagen van deze sport. Dat kun je niet terugdraaien.\n\nTyp WIS om door te gaan.`);
        if (typed == null) return;
        if (typed.trim().toUpperCase() !== 'WIS') return A.showToast('Niet gewist: je typte geen WIS.', 'info');
      } else if (!confirm(`Het schema van ${c.name} weghalen?\n\nDe aanmeldingen blijven staan.`)) return;
      b.disabled = true;
      const r = await call('POST', '/api/admin/tournament/reset', { competition_id: c.id });
      b.disabled = false;
      if (!r.ok) return fail(r, 'Reset lukte niet.');
      A.showToast(`${c.name} is leeggemaakt`);
      HUB()?.load();
      await refresh();
      return loadDetail(c.id);
    }
    await sportAction(act, c, b);
    loadDetail(c.id);
  });

  // ── Eerlijke regels + uitlegkaart ────────────────────────────────────────
  function paintNotes() {
    const noot = $('rg-mail-noot');
    const main = mainComp();
    if (noot) {
      noot.hidden = false;
      noot.textContent = `Met meerdere sporten: "Mail schema's" gaat naar de captains van alle actieve sporten met een schema, ieder met het schema van de eigen sport. "Mail programma & tijdschema" gaat alleen naar ${main ? main.name : 'het hoofdtoernooi'}. De andere mails gaan naar alle goedgekeurde teams, van elke sport. De downloads bevatten alle sporten.`;
    }
    // Uitlegkaart op Teams: met meerdere sporten staat hij dicht (één keer; daarna
    // bepaal je het zelf), zodat de lijst bovenaan staat.
    const how = $('rg-how');
    if (how && !howDone) { howDone = true; how.open = false; }
    // De omroep kent alleen het hoofdtoernooi: zonder schema daar is het een leeg scherm.
    const om = $('tc-omroep-link');
    if (om) om.style.display = (main && main.active && main.matches.total > 0) ? '' : 'none';
  }

  // ── Meelopen met admin.js ────────────────────────────────────────────────
  A.onRender(() => {
    if (aan && R) paint();      // direct, met wat we al weten (bv. na een sportwissel)
    load(false);                // en ververs (hooguit eens per 3 s)
    if (aan && paneel.__id && !paneel.hidden && Date.now() - (paneel.__t || 0) > 8000) { paneel.__t = Date.now(); loadDetail(paneel.__id); }
  });
  window.JVO_REGIE = {
    refresh, isOn: () => aan,
    // Voor admin.js: de 10 s-ronde liep zonder renderAll (geen verbinding, of je zat in
    // een veld). Dan loopt deze laag niet vanzelf mee; zo merkt hij het toch.
    tik: () => load(false),
    // Naam van de sport als daar al een schema staat (voor de melding bij goedkeuren).
    schemaVan: (compId) => { const c = compById(Number(compId)) || (compId == null ? mainComp() : null); return c && c.matches.total > 0 ? c.name : ''; },
  };
  if (A.hasToken()) load(true);
})();
