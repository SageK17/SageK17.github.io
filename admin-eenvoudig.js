// JVO Admin — EENVOUDIGE STAND (branch sport-hub).
//
// Voor een evenement waar je je met alleen een stad aanmeldt is de Admin Hub (zes afdelingen,
// profielen, passen, mailschermen) veel te veel. In de eenvoudige stand opent /admin met één
// rustig scherm en vier onderdelen:
//     Aanmeldingen · Poules en schema · Wedstrijddag · Instellingen
//
// WAT DIT BESTAND WEL EN NIET DOET
//   - Het is alleen een andere SCHIL. De bestaande blokken van admin.html (teamlijst, het
//     schema-paneel en de wedstrijddag van admin-regie.js, het evenement-formulier, schone
//     start) verhuizen hierheen: dezelfde knopen, dezelfde ids, dezelfde handlers. Gaat de
//     stand terug naar volledig, dan staat elk blok weer op zijn oude plek.
//   - Het tekent zelf alleen wat nergens bestond: het startscherm met vier tegels, de keuze
//     van de categorie met tellers, "met de hand toevoegen", tijden per categorie, de links
//     voor de crew, aanmelden open/dicht en de categorieën (naam + maximum). Alles via
//     bestaande routes; er is geen eigen beheerlogica.
//   - WANNEER AAN? Als de server zegt dat de stand 'eenvoudig' is (admin_stand in
//     /api/admin/regie). Dat is een instelling van het evenement (adminStand), geen keuze
//     die in de browser wordt bewaard. Bij de uitgebreide aanmelding en met admin-profielen
//     is de stand altijd volledig; dan gebeurt hier niets.
//   - Voor admin.js en admin-regie.js gedraagt deze schil zich als de hub: het object
//     window.JVO_ADMIN_HUB antwoordt in deze stand met de plekken van hier (zie onderaan).
//
// JVO SMART ALS GIDS (jvo-gids.js + GET /api/admin/smart/gids): de server rekent uit wat de
// volgende stap is, de voortgang en wat niet klopt; deze schil tekent dat op het startscherm
// (#ae-gids), zet hooguit één hint bovenaan elk onderdeel (#ae-hint-…) en brengt je met de
// knop naar de plek zelf (breng(): onderdeel open, veld in beeld, even oplichten, focus erop).
// Staat de gids uit, dan is alles zoals het was: het startscherm toont weer "Nog te regelen".
//
// Adressen: #/ · #/aanmeldingen · #/schema · #/dag · #/instellingen. Geen eigen timer: dit
// loopt mee met renderAll van admin.js en met elke verversing van de regie-gegevens.
// Alles wat van gebruikers komt gaat door esc() voordat het in innerHTML belandt.
(() => {
  const A = window.JVO_ADMIN, RG = window.JVO_REGIE, H0 = window.JVO_ADMIN_HUB || null;
  const root = document.getElementById('ae');
  if (!A || !RG || !root) return;
  const $ = (id) => document.getElementById(id);
  const esc = A.escape;
  const G = window.JVO_GIDS || null;   // gedeelde bouwstenen van de gids; ontbreekt het bestand, dan is er geen gids
  const svg = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    start: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    aanmeldingen: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
    schema: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M9 4v17"/>'),
    dag: svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    instellingen: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    pijl: svg('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>', 18),
    check: svg('<polyline points="20 6 9 17 4 12"/>', 14),
  };
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
  const hoofdletter = (s) => { const t = String(s || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  function setHtml(el, html) {
    if (!el || el.__ae === html) return false;
    el.__ae = html; el.innerHTML = html; return true;
  }
  // Een formulier waarin je bezig bent wordt niet onder je vingers vervangen.
  // (`data-vuil` zet het formulier zelf zodra je typt; het gaat eraf na opslaan of als je wegloopt.)
  const bezigIn = (el) => !!(el && (el.contains(document.activeElement) || el.querySelector('form[data-vuil="1"]')));
  function vergeetConcepten() {
    root.querySelectorAll('form[data-vuil]').forEach(f => { delete f.dataset.vuil; });
    ['ae-a-nieuw', 'ae-s-tijden', 'ae-i-cats'].forEach(id => { const n = $(id); if (n) n.__sig = null; });
  }

  // De vier onderdelen. `hub` = de plek die admin.js en admin-regie.js ervoor kennen.
  const DELEN = [
    { id: 'aanmeldingen', naam: 'Aanmeldingen', kort: 'Aanmeld.', hub: ['mensen', 'teams'] },
    { id: 'schema', naam: 'Poules en schema', kort: 'Schema', hub: ['toernooi', 'schema'] },
    { id: 'dag', naam: 'Wedstrijddag', kort: 'Vandaag', hub: ['toernooi', 'wedstrijddag'] },
    { id: 'instellingen', naam: 'Instellingen', kort: 'Instel.', hub: ['evenement', 'profiel'] },
  ];
  const deelVan = (id) => DELEN.find(d => d.id === id) || null;

  // ── Staat ────────────────────────────────────────────────────────────────
  let aan = false;
  let route = null;             // null = startscherm, anders de id van een onderdeel
  let cfg = null;               // /api/config: woorden (stad, categorie), stedenlijst, vlaggen
  let cfgBezig = false, cfgAt = 0;
  let schemaCat = null;         // de categorie waar je bij Poules en schema het laatst keek
  let nieuwUit = null;          // de laatste "met de hand toegevoegd" (voor de regel onder het veld)
  let kopie = null;             // { id, tot } net gekopieerde link
  let qrOpen = null;            // welke link zijn QR toont
  let standBezig = false;
  // De gids van JVO Smart: het laatste antwoord van de server (null = nog niet binnen).
  let gids = null, gidsBezig = false, gidsNog = false, gidsAt = 0, gidsStand = '';
  let gidsTerug = null;         // { stap, kort, tot } net afgevinkt: even "Toch niet" aanbieden
  let routeOpen = false, letopOpen = false;
  let gebracht = null;          // { stap, doel } de gids bracht je hierheen; is dat geregeld, dan wijst hij verder
  let volg = null;              // { tekst, knop } de regel "volgende stap" onderaan een onderdeel
  let naKlik1 = null, naKlik2 = null;
  let vlaggen = null, vlagBezig = false;   // /api/smart/flags, voor de schakelaar bij Instellingen
  const thuis = new Map();      // verhuisd blok → { ph, open, vouw }
  const el = {};

  // ── Gegevens ─────────────────────────────────────────────────────────────
  const R = () => RG.data();
  const zichtbaar = () => RG.zichtbaar();
  const cats = () => zichtbaar().filter(c => c.active);
  const hoofd = () => RG.mainComp();
  const teams = () => { const t = A.getTeams(); return Array.isArray(t) ? t : []; };
  const tekst = () => (cfg && cfg.text) || {};
  // Woorden uit het evenement (instelbaar): "stad"/"steden" en "categorie"/"categorieën".
  const W = () => {
    const t = tekst();
    return {
      een: t.entryNoun || 'aanmelding', veel: t.entryNounPlural || 'aanmeldingen',
      Een: t.cityLabel || 'Naam', Veel: t.cityLabelPlural || 'Aanmeldingen',
      // Met nog maar één rij weet de site niet of het sporten of categorieën worden. Hier maak
      // je er altijd een bij met dezelfde sport: dan heet het een categorie.
      cat: cats().length < 2 ? 'categorie' : (t.groupNoun || 'categorie'), cats: cats().length < 2 ? 'categorieën' : (t.groupNounPlural || 'categorieën'),
    };
  };
  const aantal = (n, een, veel) => `${n} ${n === 1 ? een : veel}`;
  const stedenlijst = () => { const l = cfg && cfg.event && cfg.event.cityList; return Array.isArray(l) ? l : []; };

  async function laadCfg(nu) {
    if (cfgBezig || (!nu && cfg && Date.now() - cfgAt < 60000)) return;
    cfgBezig = true;
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      if (r.ok) { cfg = await r.json(); cfgAt = Date.now(); if (aan) teken(); }
    } catch { /* de woorden van de vorige keer blijven staan */ }
    cfgBezig = false;
  }
  async function call(method, path, body) {
    try {
      const r = await A.api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, j };
    } catch (e) {
      if (!e || e.message !== 'Sessie verlopen') A.showToast('Geen verbinding. Probeer het zo opnieuw.', 'error');
      return { ok: false, status: 0, j: {}, net: true };
    }
  }
  const fout = (r, anders) => { if (!r.net) A.showToast((r.j && r.j.error) || anders, 'error'); };

  // ── Hoort de eenvoudige stand aan? ───────────────────────────────────────
  function wil() {
    if (!A.hasToken()) return false;
    const P = window.JVO_PAS;
    if (P && P.heeftProfiel && P.heeftProfiel()) return false;
    const d = R();
    if (d && d.admin_stand) return d.admin_stand === 'eenvoudig';
    return A.standHint && A.standHint() === 'eenvoudig';
  }
  // Mag je vanuit de volledige hub terug naar eenvoudig? Dat zegt de server (admin.vast).
  function kanEenvoudig() {
    const e = A.evenement && A.evenement();
    const d = R();
    if (!d || d.admin_stand !== 'volledig') return false;
    if (e && e.admin) return e.admin.vast === null;
    // Het evenement is nog niet binnen (kort na het laden): dezelfde twee redenen, uit wat er al is.
    const P = window.JVO_PAS, ik = P && P.ik ? P.ik() : null;
    return d.signup_form === 'city' && !(ik && ik.profielen_actief) && !(P && P.heeftProfiel && P.heeftProfiel());
  }
  async function zetStand(stand, knop) {
    if (standBezig) return;
    standBezig = true;
    if (knop) knop.disabled = true;
    const r = await call('PUT', '/api/admin/event-config', { event: { adminStand: stand } });
    if (knop) knop.disabled = false;
    standBezig = false;
    if (!r.ok) return fout(r, 'Wisselen lukte niet.');
    if (stand === 'volledig' && /^#\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (A.laadEvenement) A.laadEvenement({ zacht: true });
    await RG.refresh();
    await A.refreshAll();
    window.scrollTo(0, 0);
  }

  // ── Opbouw (één keer) ────────────────────────────────────────────────────
  function bouw() {
    if (el.klaar) return;
    el.klaar = true;
    const navA = (id, naam, kort, icoon) => `<a class="ae-nav-a" href="#/${id}" data-deel="${id}"><span class="ae-nav-i">${icoon}</span><span class="ae-nav-t"><span class="ae-nav-lang">${naam}</span><span class="ae-nav-kort">${kort}</span></span><span class="ae-nav-n" data-n="${id}"></span></a>`;
    const hintPlek = (id) => `<div class="jvs jvs-hint" id="ae-hint-${id}" role="note" hidden></div>`;
    const kop = (id, naam) => `<header class="ae-kop"><h2 class="ae-titel" id="ae-h-${id}" tabindex="-1">${naam}</h2><p class="ae-sub" id="ae-sub-${id}"></p></header>`;
    root.innerHTML = `
      <nav class="ae-nav" id="ae-nav" aria-label="Onderdelen">
        ${navA('', 'Start', 'Start', IC.start)}
        ${DELEN.map(d => navA(d.id, d.naam, d.kort, IC[d.id])).join('')}
      </nav>
      <div class="ae-main">
        <section class="ae-home" id="ae-home" aria-labelledby="ae-h-home">
          <header class="ae-kop ae-kop-home">
            <div class="card-eyebrow ae-oog">Beheer</div>
            <h2 class="ae-titel ae-titel-home" id="ae-h-home" tabindex="-1">—</h2>
            <p class="ae-sub" id="ae-sub-home"></p>
          </header>
          <section class="jvs jvs-gids" id="ae-gids" aria-label="JVO Smart: je volgende stap" hidden></section>
          <p class="ae-sr" id="ae-gids-live" role="status" aria-live="polite"></p>
          <div class="ae-tegels" id="ae-tegels"></div>
          <div class="ae-open" id="ae-open" hidden></div>
          <footer class="ae-voet" id="ae-voet"></footer>
        </section>

        <section class="ae-deel" id="ae-d-aanmeldingen" hidden aria-labelledby="ae-h-aanmeldingen">
          ${kop('aanmeldingen', 'Aanmeldingen')}
          ${hintPlek('aanmeldingen')}
          <div class="ae-cats" id="ae-a-cats" role="group" aria-label="Kies wat je ziet"></div>
          <div id="ae-a-nieuw"></div>
          <div class="ae-slot ae-slot-teams" id="ae-a-slot"></div>
        </section>

        <section class="ae-deel" id="ae-d-schema" hidden aria-labelledby="ae-h-schema">
          ${kop('schema', 'Poules en schema')}
          ${hintPlek('schema')}
          <div class="ae-cats ae-cats-een" id="ae-s-cats" role="group" aria-label="Kies van wie je het schema ziet"></div>
          <div class="ae-acties" id="ae-s-acties"></div>
          <p class="ae-leeg" id="ae-s-leeg" hidden></p>
          <div class="ae-slot" id="ae-s-slot"></div>
          <div id="ae-s-tijden"></div>
          <div class="ae-slot" id="ae-s-hoofd" hidden></div>
        </section>

        <section class="ae-deel" id="ae-d-dag" hidden aria-labelledby="ae-h-dag">
          <h2 class="ae-sr" id="ae-h-dag" tabindex="-1">Wedstrijddag</h2>
          ${hintPlek('dag')}
          <div class="ae-slot" id="ae-g-slot"></div>
          <div class="ae-slot" id="ae-g-hoofd" hidden></div>
          <section class="ae-kaart" id="ae-g-links" aria-labelledby="ae-g-links-h"></section>
        </section>

        <section class="ae-deel" id="ae-d-instellingen" hidden aria-labelledby="ae-h-instellingen">
          ${kop('instellingen', 'Instellingen')}
          ${hintPlek('instellingen')}
          <section class="ae-kaart" id="ae-i-open" aria-label="Aanmelden open of dicht"></section>
          <section class="ae-kaart" id="ae-i-deel" aria-labelledby="ae-i-deel-h"></section>
          <section class="ae-kaart" id="ae-i-cats" aria-labelledby="ae-i-cats-h"></section>
          <div class="ae-slot ae-slot-evc" id="ae-i-slot"></div>
          <div class="ae-meer" id="ae-i-meer"></div>
          <section class="ae-kaart" id="ae-i-smart" aria-label="JVO Smart"></section>
          <div class="ae-slot" id="ae-i-rest"></div>
          <div class="ae-voet" id="ae-i-voet"></div>
        </section>
      </div>
      <div class="jvs jvs-hint jvs-volg" id="ae-volg" role="status" hidden></div>`;
    Object.assign(el, { nav: $('ae-nav'), home: $('ae-home') });
    root.addEventListener('click', klik);
    root.addEventListener('submit', verstuur);
    root.addEventListener('input', (e) => { const f = e.target.closest('form[data-ae-form]'); if (f) f.dataset.vuil = '1'; });
    // Ga je zelf verder met typen, dan is de regel "volgende stap" onderaan niet meer nodig (en staat hij de opslaan-balk niet in de weg).
    root.addEventListener('input', (e) => { if (volg && !e.target.closest('#ae-volg')) { volg = null; tekenVolg(); } });
    root.addEventListener('change', (e) => { if (e.target && e.target.id === 'ae-smart-aan') zetSmart(e.target); });
    // Na een knop in een van de bestaande blokken (opslaan, vastzetten, pauzeren) kan de stand
    // anders zijn: de gids kijkt dan kort daarna opnieuw, zonder op de volgende verversing te wachten.
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button, input[type="checkbox"]');
      if (!b || b.closest('[data-ae^="gids-"], .ae-nav, .ae-cats') || b.dataset.ae === 'qr' || b.dataset.ae === 'kopie' || b.dataset.ae === 'meer') return;
      clearTimeout(naKlik1); clearTimeout(naKlik2);
      naKlik1 = setTimeout(() => laadGids(true), 1300);
      naKlik2 = setTimeout(() => laadGids(true), 4000);
    });
    // Wat je zelf open- of dichtklapt in de gids blijft zo bij de volgende verversing.
    root.addEventListener('toggle', (e) => {
      const d = e.target;
      if (d && d.classList && d.classList.contains('jvs-route')) routeOpen = d.open;
      if (d && d.id === 'ae-letop-meer') letopOpen = d.open;
    }, true);
  }

  // ── Verhuizen en terugzetten ─────────────────────────────────────────────
  function verhuis(node, doel, vast) {
    if (!node || !doel || thuis.has(node) || !node.parentNode) return;
    const ph = document.createComment('ae-plek');
    node.parentNode.insertBefore(ph, node);
    const vouw = node.matches('details.section.fold');
    thuis.set(node, { ph, open: vouw ? node.open : undefined, vouw, vast: !!(vouw && vast) });
    doel.appendChild(node);
    if (vouw && vast) {
      node.classList.add('ae-vast');
      node.open = true;
      const s = node.querySelector(':scope > summary');
      if (s) { s.setAttribute('tabindex', '-1'); s.setAttribute('aria-disabled', 'true'); }
      if (!node.__aeToggle) {
        node.__aeToggle = true;
        // In deze schil is het een vaste kaart: hij blijft open.
        const isVast = () => aan && thuis.has(node) && thuis.get(node).vast;
        node.addEventListener('toggle', () => { if (isVast() && !node.open) node.open = true; });
        node.querySelector(':scope > summary')?.addEventListener('click', (e) => { if (isVast()) e.preventDefault(); });
      }
    }
  }
  // Velden van het evenement-formulier die in de eenvoudige stand achter "Meer instellingen" staan.
  const KERN_GROEP = ['evc-name', 'evc-location', 'evc-startTime', 'evc-registration', 'evc-heroTitle'];
  const EXTRA_VELD = ['evc-shortName', 'evc-article', 'evc-audience', 'evc-dateText', 'evc-priceText', 'evc-heroTitleMulti', 'evc-signupForm', 'evc-cityLabel', 'evc-cityLabelPlural', 'evc-registration'];
  const EXTRA_RIJ = ['evc-cityMulti', 'evc-autoApprove', 'evc-autoDraw'];
  function merkExtra(zet) {
    const form = $('evc-form');
    if (!form) return;
    form.querySelectorAll('.ae-extra').forEach(n => n.classList.remove('ae-extra'));
    if (!zet) return;
    form.querySelectorAll('fieldset.evc-group').forEach(fs => { if (!KERN_GROEP.some(id => fs.querySelector(`#${id}`))) fs.classList.add('ae-extra'); });
    EXTRA_VELD.forEach(id => { const f = $(id) && $(id).closest('.evc-f'); if (f) f.classList.add('ae-extra'); });
    EXTRA_RIJ.forEach(id => { const f = $(id) && $(id).closest('label.toggle-row'); if (f) f.classList.add('ae-extra'); });
    form.querySelectorAll('.evc-foot, #evc-profile, #evc-stad-noot, .evc-vb-lbl').forEach(n => n.classList.add('ae-extra'));
    const vb = $('evc-stad-vb'); if (vb && vb.closest('.evc-f')) vb.closest('.evc-f').classList.add('ae-extra');
  }
  function verhuisAlles() {
    verhuis(document.querySelector('#tab-teams > .section'), $('ae-a-slot'));
    verhuis($('rg-sportpaneel'), $('ae-s-slot'));
    ['tc-setup-fold', 'tc-schedule-fold', 'time-control-section'].forEach(id => verhuis($(id), $('ae-s-hoofd')));
    verhuis($('rg-dag'), $('ae-g-slot'));
    verhuis(document.querySelector('#tab-tournament > .section[data-rg-hoofd]'), $('ae-g-hoofd'));
    verhuis($('evc-fold'), $('ae-i-slot'), true);
    verhuis($('rules-fold'), $('ae-i-rest'));
    verhuis(document.querySelector('#tab-overview > .danger-zone'), $('ae-i-rest'));
    merkExtra(true);
    const zoek = $('team-search');
    if (zoek && zoek.dataset.aePh == null) { zoek.dataset.aePh = zoek.getAttribute('placeholder') || ''; }
  }
  function zetTerug() {
    for (const [node, m] of thuis) {
      if (m.ph.parentNode) { m.ph.parentNode.insertBefore(node, m.ph); m.ph.remove(); }
      if (m.vouw && m.vast) {
        node.classList.remove('ae-vast');
        const s = node.querySelector(':scope > summary');
        if (s) { s.removeAttribute('tabindex'); s.removeAttribute('aria-disabled'); }
      }
      if (m.vouw) node.open = !!m.open;
    }
    thuis.clear();
    merkExtra(false);
    const zoek = $('team-search');
    if (zoek && zoek.dataset.aePh != null) { zoek.setAttribute('placeholder', zoek.dataset.aePh); delete zoek.dataset.aePh; }
    document.querySelectorAll('#filters .ae-nul').forEach(n => n.classList.remove('ae-nul'));
  }
  // De regel "Ingelogd als …" (met Live en Vernieuw) schuift de bovenbalk in, net als in de hub.
  function bovenbalk(zet) {
    const dash = $('dash'), top = dash && dash.querySelector(':scope > .topbar'), wie = dash && dash.querySelector('.who');
    if (!top || !wie) return;
    if (zet) {
      if (wie.parentNode === top) return;
      el.wiePlek = document.createComment('ae-who');
      wie.parentNode.insertBefore(el.wiePlek, wie);
      top.appendChild(wie);
    } else if (el.wiePlek && el.wiePlek.parentNode) {
      el.wiePlek.parentNode.insertBefore(wie, el.wiePlek);
      el.wiePlek.remove(); el.wiePlek = null;
    }
  }

  // ── Aan / uit ────────────────────────────────────────────────────────────
  function zetAan() {
    if (aan) return;
    aan = true;
    bouw();
    verhuisAlles();
    root.hidden = false;
    document.body.classList.add('ae-aan');
    document.body.classList.remove('ae-wacht', 'ah-wacht');
    bovenbalk(true);
    window.addEventListener('hashchange', opHash);
    window.addEventListener('popstate', opHash);
    laadCfg(true);
    if (!gids) gids = leesGids();
    // Eerste keer in dit tabblad en nog geen gids binnen: het scherm komt in één keer in beeld,
    // mét de gids, in plaats van eerst zonder en dan verspringend. Hooguit anderhalve seconde.
    if (G && !gids && !gidsUitHint()) { root.classList.add('ae-gids-wacht'); setTimeout(() => root.classList.remove('ae-gids-wacht'), 1500); }
    laadGids('zeker');
    // Overzicht en Toernooi blijven voor admin.js "open": zo verversen hun blokken door.
    A.switchTab('overview', { vanHub: true });
    leesHash(true);
    RG.herteken();
  }
  function zetUit() {
    if (!aan) return;
    aan = false;
    root.classList.remove('ae-gids-wacht');
    window.removeEventListener('hashchange', opHash);
    window.removeEventListener('popstate', opHash);
    zetTerug();
    bovenbalk(false);
    root.hidden = true;
    document.body.classList.remove('ae-aan', 'ae-thuis', 'ae-wacht', 'ae-meer-open');
    route = null;
    if (/^#\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (A.selSport != null) A.selSport = null;
    A.switchTab('overview', { vanHub: true });
    RG.herteken();
  }

  // ── Adressen ─────────────────────────────────────────────────────────────
  function leesHash(eerste) {
    const m = /^#\/([a-z]+)?\/?$/.exec(location.hash || '');
    const id = m && m[1] && deelVan(m[1]) ? m[1] : null;
    const goed = `#/${id || ''}`;
    if (location.hash !== goed) history.replaceState(null, '', goed);
    const nieuw = eerste || id !== route;
    route = id;
    toonRoute(nieuw, eerste);
  }
  function opHash() { if (aan) leesHash(false); }
  function ga(id, opts) {
    if (!aan) return false;
    const doel = id && deelVan(id) ? id : null;
    const hash = `#/${doel || ''}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
    const nieuw = doel !== route;
    route = doel;
    toonRoute(nieuw, false);
    if (opts && typeof opts.na === 'function') opts.na();
    return true;
  }
  // Een plek van de hub (afdeling, onderwerp) → het onderdeel van hier.
  function vertaal(afd, t) {
    if (!afd) return null;
    if (afd === 'mensen') return t === 'crew' || t === 'checkin' ? 'dag' : 'aanmeldingen';
    if (afd === 'toernooi') return t === 'wedstrijddag' || t === 'stand' ? 'dag' : 'schema';
    if (afd === 'evenement') return t === 'schermen' ? 'dag' : t === 'programma' ? null : 'instellingen';
    if (afd === 'sport') return 'instellingen';
    if (afd === 'veiligheid') return t === 'gevaar' ? 'instellingen' : null;
    return null;
  }
  function hubRoute() {
    const d = route && deelVan(route);
    return d ? { afd: d.hub[0], t: d.hub[1] } : { afd: null, t: null };
  }
  function naarTab(name) {
    if (!aan) return false;
    ga(({ teams: 'aanmeldingen', signups: 'aanmeldingen', tournament: 'schema', overview: null, program: null, audit: null })[name] || null);
    return true;
  }
  function toon(node) {
    if (!aan || !node) return false;
    const deel = node.closest('.ae-deel');
    if (!deel) { if (node.closest('#ae-home')) { ga(null); return true; } return false; }
    if (node.closest('.ae-extra')) document.body.classList.add('ae-meer-open');
    ga(deel.id.replace('ae-d-', ''));
    return true;
  }

  // ── Welke categorie hoort bij deze plek? ─────────────────────────────────
  function zetSport() {
    const lijst = cats();
    const cur = lijst.find(c => c.id === A.selSport) || null;
    // Eén toernooi (de regie-laag staat uit): er valt niets te kiezen, en die laag zet een
    // gekozen sport zelf steeds terug. Dan blijft de keuze leeg.
    if (!RG.isOn()) { if (A.selSport != null && R()) A.selSport = null; return; }
    if (route === 'schema') {
      if (cur) { schemaCat = cur.id; return; }
      const b = lijst.find(c => c.id === schemaCat) || lijst[0] || null;
      if (b) { schemaCat = b.id; if (A.selSport !== b.id) A.selSport = b.id; }
      else if (A.selSport != null) A.selSport = null;
    } else if (route === 'aanmeldingen') {
      if (A.selSport != null && !cur) A.selSport = null;
    } else if (A.selSport != null) A.selSport = null;
  }

  // ── Tonen ────────────────────────────────────────────────────────────────
  function toonRoute(nieuw, eerste) {
    document.body.classList.toggle('ae-thuis', !route);
    el.home.hidden = !!route;
    for (const d of DELEN) { const s = $(`ae-d-${d.id}`); if (s) s.hidden = route !== d.id; }
    root.dataset.deel = route || '';
    // Een half ingevuld formulier op de plek waar je vandaan komt: weg ermee, anders toont het
    // straks oude gegevens.
    if (nieuw) { if (root.contains(document.activeElement) && document.activeElement.blur) document.activeElement.blur(); vergeetConcepten(); }
    $('tab-overview')?.classList.add('active');
    $('tab-tournament')?.classList.add('active');
    zetSport();
    teken();
    if (route === 'instellingen' && A.laadEvenement && nieuw) { A.laadEvenement({ zacht: true }); RG.refresh(); laadCfg(true); laadVlaggen(); }
    if (nieuw && !eerste) laadGids('zeker');
    if (nieuw) {
      window.scrollTo(0, 0);
      const h = $(`ae-h-${route || 'home'}`);
      if (h && !eerste) h.focus({ preventScroll: true });
    }
  }

  // ── Tekenen (loopt mee met elke verversing) ──────────────────────────────
  function teken() {
    if (!aan) return;
    const d = R();
    tekenNav(d);
    if (!route) tekenHome(d);
    else if (route === 'aanmeldingen') tekenAanmeldingen(d);
    else if (route === 'schema') tekenSchema(d);
    else if (route === 'dag') tekenDag(d);
    else if (route === 'instellingen') tekenInstellingen(d);
    if (!route) { volg = null; gebracht = null; }
    tekenVolg();
  }
  // Het hoofdtoernooi dat (bij aanmelden met alleen een stad) als categorie in gebruik is.
  // Dat kan zijn eigen schema pas maken bij veel aanmeldingen; een gewone categorie al bij twee.
  const stadVorm = () => { const d = R(); return !!(d && d.signup_form === 'city'); };
  function hoofdAlsCat() {
    const m = hoofd();
    return m && m.active && stadVorm() ? m : null;
  }
  let omBezig = false;
  async function hoofdOm(knop) {
    const m = hoofdAlsCat();
    if (!m || omBezig) return;
    const w = W();
    if (m.matches && m.matches.total > 0) { A.showToast(`Er staat al een schema voor ${m.name}. Reset dat eerst bij Poules en schema.`, 'error'); return; }
    const eigen = teams().filter(t => (t.competition_id || m.id) === m.id);
    if (!(await A.bevestig({ titel: `${m.name} een gewone ${w.cat} maken?`, tekst: `Er komt een ${w.cat} met dezelfde naam, hetzelfde maximum en dezelfde tijden.${eigen.length ? ` De ${eigen.length === 1 ? 'aanmelding gaat' : `${eigen.length} aanmeldingen gaan`} mee en ${eigen.length === 1 ? 'krijgt' : 'krijgen'} meteen een poule als dat kan.` : ''} Het hoofdtoernooi gaat uit. Teamcodes blijven werken.`, ja: 'Ja, zet om', nee: 'Annuleren' }))) return;
    omBezig = true;
    if (knop) knop.disabled = true;
    try {
      const neem = ['sport', 'team_size', 'min_players', 'max_players', 'place_noun', 'places', 'start_time', 'match_min', 'break_min'];
      const body = { name: m.name, max_teams: m.max_teams, active: true };
      for (const k of neem) if (m[k] != null && m[k] !== '') body[k] = m[k];
      const r = await call('POST', '/api/admin/competitions', body);
      const nieuw = r.ok && r.j && r.j.competition ? r.j.competition.id : null;
      if (!Number.isInteger(nieuw)) return fout(r, 'Omzetten lukte niet.');
      // Wie het langst wacht eerst: zo houdt de wachtlijst zijn volgorde.
      let mis = 0;
      for (const t of eigen.slice().sort((a, b) => a.id - b.id)) {
        const v = await call('POST', `/api/admin/teams/${t.id}/competition`, { competition_id: nieuw });
        if (!v.ok) { mis++; if (v.net) break; }
      }
      if (mis) { A.showToast(`${mis} ${mis === 1 ? 'aanmelding kon' : 'aanmeldingen konden'} niet mee. Het hoofdtoernooi blijft daarom aan; verplaats ze bij Aanmeldingen en probeer het opnieuw.`, 'error'); return; }
      const u = await call('PUT', `/api/admin/competitions/${m.id}`, { active: false });
      if (!u.ok) return fout(u, 'Het hoofdtoernooi uitzetten lukte niet.');
      if (schemaCat === m.id) schemaCat = nieuw;
      A.showToast(`${m.name} is nu een gewone ${w.cat}`);
    } finally {
      omBezig = false;
      if (knop) knop.disabled = false;
      await naCat();
    }
  }
  const wachtend = () => teams().filter(t => t.status === 'pending').length;
  const opLijst = () => teams().filter(t => t.status === 'waitlist').length;

  function tekenNav(d) {
    const tot = (d && d.totals) || {};
    const n = { aanmeldingen: wachtend() || '', dag: tot.live > 0 ? tot.live : '' };
    el.nav.querySelectorAll('.ae-nav-a').forEach(a => {
      const id = a.dataset.deel, hier = (route || '') === id;
      if (hier) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      const b = a.querySelector('.ae-nav-n');
      const v = String(n[id] == null ? '' : n[id]);
      if (b && b.textContent !== v) b.textContent = v;
      if (b) {
        const lab = !v ? '' : id === 'dag' ? `${v} live` : `${v} wachten op jou`;
        if (lab) b.setAttribute('aria-label', lab); else b.removeAttribute('aria-label');
      }
    });
  }

  // Startscherm ---------------------------------------------------------------
  function tekenHome(d) {
    const w = W();
    const ev = (d && d.event) || {};
    const naam = ev.name || tekst().name || 'Beheer';
    const h = $('ae-h-home');
    if (h.textContent !== naam) h.textContent = naam;
    const reg = d && d.registration;
    const sub = [ev.dateText || tekst().dateText || '', ev.location || ''].filter(Boolean).join(' · ');
    const subEl = $('ae-sub-home');
    const subT = RG.weg() ? 'Geen verbinding: dit is de laatst bekende stand.' : sub;
    if (subEl.textContent !== subT) subEl.textContent = subT;
    if (!d) { tekenGids(); setHtml($('ae-tegels'), '<p class="ae-leeg">Laden…</p>'); return; }

    const lijst = cats(), tot = d.totals || {};
    const tm = teams().filter(t => t.status === 'approved');
    const binnen = tm.filter(t => t.checked_in_at).length;
    const wl = opLijst(), wa = wachtend();
    const perCat = lijst.map(c => `${esc(c.name)} ${esc(c.teams.approved)} van ${esc(c.max_teams)}`).join(' · ');
    const metSchema = lijst.filter(c => c.matches.total > 0);
    const open = lijst.filter(c => c.draw_open && !(c.matches.done || c.matches.live)).length;
    const allDone = tot.total > 0 && tot.done === tot.total;
    const tegel = (id, groot, eenheid, regel, extra = '', cls = '') => `<a class="ae-tegel${cls}" href="#/${id}" data-deel="${id}">
        <span class="ae-tegel-i" aria-hidden="true">${IC[id]}</span>
        <span class="ae-tegel-t">
          <span class="ae-tegel-naam">${deelVan(id).naam}</span>
          <span class="ae-tegel-groot"><b>${esc(groot)}</b>${eenheid ? `<i>${eenheid}</i>` : ''}</span>
          <span class="ae-tegel-regel">${regel}</span>
          ${extra}
        </span>
        <span class="ae-tegel-pijl" aria-hidden="true">${IC.pijl}</span>
      </a>`;
    const let_ = (t) => `<span class="ae-let"><i class="ae-stip" aria-hidden="true"></i>${t}</span>`;
    const h1 = tegel('aanmeldingen', tm.length, esc(tm.length === 1 ? w.een : w.veel),
      perCat || 'Nog geen categorie.',
      wa ? let_(`${wa} ${wa === 1 ? 'wacht' : 'wachten'} op jou`) : wl ? let_(`${wl} op de wachtlijst`) : '', wa ? ' is-let' : '');
    const h2 = tegel('schema', tot.total || 0, tot.total === 1 ? 'wedstrijd' : 'wedstrijden',
      !lijst.length ? 'Nog geen categorie.'
        : !metSchema.length ? 'Nog geen indeling. Die komt zodra er genoeg aanmeldingen zijn.'
          : open ? (open === lijst.length ? 'De indeling loopt nog mee met de aanmeldingen.' : `De indeling van ${esc(aantal(open, w.cat, w.cats))} loopt nog mee.`)
            : 'De indeling staat vast.');
    const dagGroot = d.paused_all ? 'Pauze' : tot.live > 0 ? tot.live : allDone ? 'Klaar' : tot.done || 0;
    const dagEenheid = d.paused_all ? '' : tot.live > 0 ? 'live' : allDone ? '' : `van ${esc(tot.total || 0)} gespeeld`;
    const h3 = tegel('dag', dagGroot, dagEenheid,
      d.paused_all ? 'Alles staat op pauze. Niemand kan een wedstrijd starten.'
        : tot.live > 0 ? `${esc(tot.done)} van ${esc(tot.total)} gespeeld · ${binnen} van ${tm.length} binnen`
          : tot.total === 0 ? 'Zodra er een schema is, stuur je de dag vanaf hier.'
            : allDone ? 'Alle wedstrijden zijn gespeeld.'
              : `${binnen} van ${tm.length} binnen · uitslagen, pauze en de link voor de crew`,
      '', tot.live > 0 || d.paused_all ? ' is-nu' : '');
    const h4 = tegel('instellingen', reg && reg.open ? 'Open' : 'Dicht', 'aanmelden',
      'Naam, datum, tijden, locatie en de lijst om uit te kiezen.');
    setHtml($('ae-tegels'), h1 + h2 + h3 + h4);

    // Nog te regelen: wat de controle van de server open heeft staan (zonder de mailregels).
    // Eerst wat alleen deze schil ziet: het hoofdtoernooi als categorie (maakt geen poules bij
    // weinig aanmeldingen) en twee categorieën die tegelijk op dezelfde plek spelen.
    const eigen = [];
    const hf = hoofdAlsCat();
    if (hf) eigen.push({ kort: `${hf.name} is nog het hoofdtoernooi: dat maakt pas poules bij veel aanmeldingen. Maak er een gewone ${w.cat} van.`, ga: 'evenement/profiel', naarCats: true });
    const gezien = new Set();
    for (const c of lijst) {
      const met = botsing(c).filter(x => !gezien.has(`${Math.min(c.id, x.id)}-${Math.max(c.id, x.id)}`));
      if (!met.length) continue;
      met.forEach(x => gezien.add(`${Math.min(c.id, x.id)}-${Math.max(c.id, x.id)}`));
      eigen.push({ kort: botsTekst(c, met), competition_id: c.id });
    }
    const punten = eigen.concat((d.checks || []).filter(c => c && c.level !== 'ok' && !c.mail && !c.host && !(hf && /hoofdtoernooi/i.test(String(c.text || ''))))).slice(0, 5);
    const metGids = tekenGids();
    if (metGids) punten.length = 0;      // dezelfde punten staan dan bij "Let op" in de gids
    const openEl = $('ae-open');
    setHtml(openEl, punten.length ? `<h3 class="ae-tussenkop">Nog te regelen</h3><ul class="ae-punten">${punten.map(c => {
      const [afd, t] = String(c.ga || '').split('/');
      const doel = Number.isInteger(c.competition_id) ? 'schema' : (vertaal(afd, t) || 'instellingen');
      return `<li><span>${esc(c.kort || c.text)}</span><a class="ae-link" href="#/${doel}" data-deel="${doel}"${Number.isInteger(c.competition_id) ? ` data-cat="${esc(c.competition_id)}"` : ''}${c.ga === 'evenement/spelregels' ? ' data-open="rules-fold"' : ''}>Bekijk</a></li>`;
    }).join('')}</ul>` : '');
    if (openEl.hidden !== !punten.length) openEl.hidden = !punten.length;

    setHtml($('ae-voet'), `<div class="ae-voet-links"><a class="ae-link" href="/" target="_blank" rel="noopener">Aanmeldpagina ↗</a><a class="ae-link" href="${d.hub_mode ? '/sporten' : '/toernooi'}" target="_blank" rel="noopener">Live-bord ↗</a></div>
      <div class="ae-voet-stand"><span>Dit is de eenvoudige weergave. Mis je iets, zoals mails, het logboek of een back-up?</span>
      <button type="button" class="rg-knop rg-knop-rustig ae-knop" data-ae="alles">Alles tonen</button></div>`);
  }

  // Categorie-keuze met tellers ("8 van 12"). `alle` = met de keuze "Alle".
  function catKnoppen(doel, alle) {
    const lijst = cats(), sel = A.selSport, w = W();
    if (lijst.length < 2 && !alle) { setHtml(doel, ''); doel.hidden = true; return; }
    doel.hidden = false;
    const tm = teams();
    const binnen = (naam, cijfer, onder, icoon) => `${icoon || ''}<span class="ae-cat-t"><span class="ae-cat-naam">${naam}</span><span class="ae-cat-n">${cijfer}</span>${onder ? `<span class="ae-cat-s">${onder}</span>` : ''}</span>`;
    // Eén categorie: dan is het een teller, geen keuze.
    const knop = (id, naam, cijfer, onder, icoon) => (lijst.length < 2
      ? `<div class="ae-cat ae-cat-vast">${binnen(naam, cijfer, onder, icoon)}</div>`
      : `<button type="button" class="ae-cat" data-cat="${id == null ? '' : esc(id)}" aria-pressed="${sel === id ? 'true' : 'false'}">${binnen(naam, cijfer, onder, icoon)}</button>`);
    const totaal = tm.filter(t => t.status === 'approved').length;
    const zelfdeSport = new Set(lijst.map(c => c.sport)).size < 2;
    const html = (alle && lijst.length > 1 ? knop(null, 'Alle', `${totaal}`, esc(totaal === 1 ? w.een : w.veel)) : '')
      + lijst.map(c => {
        const t = c.teams, vol = t.approved >= c.max_teams;
        const onder = [vol ? 'vol' : `nog ${c.max_teams - t.approved} ${c.max_teams - t.approved === 1 ? 'plek' : 'plekken'}`, t.waitlist ? `${t.waitlist} wachtlijst` : '', t.pending ? `${t.pending} wacht op jou` : ''].filter(Boolean).join(' · ');
        // Het icoon helpt alleen als de categorieën een andere sport hebben.
        return knop(c.id, esc(c.name), `${esc(t.approved)} van ${esc(c.max_teams)}`, alle ? esc(onder) : '', !zelfdeSport && isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" width="30" height="30" />` : '');
      }).join('');
    setHtml(doel, html);
  }

  // 1. Aanmeldingen -----------------------------------------------------------
  function tekenAanmeldingen(d) {
    const w = W(), lijst = cats();
    const tm = teams(), ok = tm.filter(t => t.status === 'approved');
    const reg = d && d.registration;
    const sub = !d ? 'Laden…' : `${aantal(ok.length, w.een, w.veel)} ${ok.length === 1 ? 'doet' : 'doen'} mee. Aanmelden staat ${reg && reg.open ? 'open' : 'dicht'}.`;
    const subEl = $('ae-sub-aanmeldingen');
    if (subEl.textContent !== sub) subEl.textContent = sub;
    catKnoppen($('ae-a-cats'), true);
    tekenHint('aanmeldingen');

    // Met de hand toevoegen (bestaande route; mag ook als aanmelden dicht is of de categorie vol).
    const doel = $('ae-a-nieuw');
    const sl = stedenlijst();
    const sig = JSON.stringify([lijst.map(c => [c.id, c.name]), sl, w.Een, A.selSport]);
    if (doel.__sig !== sig && !bezigIn(doel)) {
      doel.__sig = sig;
      const sel = lijst.find(c => c.id === A.selSport) || null;
      // Op een telefoon staat de lijst voorop: het toevoegen klapt daar open met één tik.
      const was = doel.querySelector('details');
      const open = was ? was.open : !!(window.matchMedia && window.matchMedia('(min-width: 900px)').matches);
      doel.innerHTML = lijst.length ? `<details class="ae-nieuw-vouw"${open ? ' open' : ''}><summary><span class="ae-plus" aria-hidden="true"></span>${esc(w.Een)} met de hand toevoegen</summary>
        <form class="ae-nieuw" id="ae-nieuw" data-ae-form="nieuw" autocomplete="off" novalidate>
          <label class="ae-sr" for="ae-nieuw-stad">${esc(w.Een)}</label>
          <div class="ae-nieuw-rij">
            <input type="text" id="ae-nieuw-stad" name="city" maxlength="60" required ${sl.length ? 'list="ae-nieuw-lijst"' : ''} placeholder="${esc(sl.length ? 'Kies of typ' : 'Typ de naam')}" enterkeyhint="done" />
            ${sl.length ? `<datalist id="ae-nieuw-lijst">${sl.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>` : ''}
            ${lijst.length > 1 ? `<select id="ae-nieuw-cat" name="competition_id" aria-label="${esc(hoofdletter(w.cat))}">${lijst.map(c => `<option value="${esc(c.id)}"${sel && sel.id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
              : `<input type="hidden" name="competition_id" value="${esc(lijst[0].id)}" />`}
            <button type="submit" class="rg-knop ae-knop">Voeg toe</button>
          </div>
          <p class="ae-nieuw-uit" id="ae-nieuw-uit" role="status"></p>
        </form></details>` : '';
    }
    const uit = $('ae-nieuw-uit');
    if (uit) {
      const u = nieuwUit;
      const h = !u ? '' : `<b>${esc(u.naam)}</b> ${u.wacht ? `staat op de wachtlijst van ${esc(u.cat)} (die is vol).` : `doet mee bij ${esc(u.cat)}${u.poule ? `, poule ${esc(u.poule)}` : ''}.`}
        ${u.genummerd ? `Die naam was er al: dit is nummer twee. ` : ''}${u.code ? `Teamcode <code>${esc(u.code)}</code>: geef die mee, het is hun enige sleutel voor Mijn team.` : ''}`;
      setHtml(uit, h);
    }

    // De bestaande teamlijst: zoekveld in eigen woorden, lege filters uit beeld.
    const zoek = $('team-search');
    if (zoek) { const ph = `Zoek op ${w.een} of teamcode`; if (zoek.getAttribute('placeholder') !== ph) zoek.setAttribute('placeholder', ph); }
    document.querySelectorAll('#filters .filter-pill').forEach(p => {
      const n = Number((p.querySelector('.count') || {}).textContent || 0);
      p.classList.toggle('ae-nul', p.dataset.filter !== 'all' && !n && !p.classList.contains('active'));
    });
  }

  // 2. Poules en schema -------------------------------------------------------
  function tekenSchema(d) {
    const w = W(), lijst = cats();
    if (d && RG.isOn() && !lijst.some(c => c.id === A.selSport) && lijst.length) { zetSport(); }
    const c = lijst.find(x => x.id === A.selSport) || (!RG.isOn() && lijst.length === 1 ? lijst[0] : null);
    const subEl = $('ae-sub-schema');
    const sub = !d ? 'Laden…' : !lijst.length ? '' : lijst.length > 1 ? `Per ${w.cat}: wie in welke poule zit, het tijdschema en de tijden.` : 'Wie in welke poule zit, het tijdschema en de tijden.';
    if (subEl.textContent !== sub) subEl.textContent = sub;
    catKnoppen($('ae-s-cats'), false);
    tekenHint('schema');
    const leeg = $('ae-s-leeg');
    const leegT = d && !lijst.length ? `Er is nog geen ${w.cat}. Maak er een bij Instellingen.` : '';
    if (leeg.textContent !== leegT) leeg.textContent = leegT;
    leeg.hidden = !leegT;
    const isHoofd = !!(c && c.is_default);
    $('ae-s-hoofd').hidden = !isHoofd;
    // Afdrukken en het bord: altijd op dezelfde plek, bovenaan.
    setHtml($('ae-s-acties'), c && c.matches.total > 0 ? `<a class="rg-knop ae-knop" href="${c.is_default ? '/print' : `/print?competition=${esc(c.id)}`}" target="_blank" rel="noopener">Schema afdrukken ↗</a>
        <a class="rg-knop rg-knop-rustig ae-knop" href="${d && d.hub_mode ? `/sporten?sport=${esc(c.id)}` : '/toernooi'}" target="_blank" rel="noopener">Bekijk op het bord ↗</a>` : '');
    tekenTijden(c && !c.is_default ? c : null);
  }
  // Spelen twee categorieën op dezelfde plek (zelfde naam, zelfde soort plek) op tijden die
  // elkaar overlappen? Dan staan er straks twee wedstrijden tegelijk op bijvoorbeeld veld 1.
  const minuten = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const venster = (c) => {
    const van = minuten(c.start_time); if (van == null) return null;
    const tot = minuten(c.expected_end);
    return [van, tot != null && tot > van ? tot : van + 60];
  };
  const plekSleutel = (c) => `${String(c.place_noun || 'Veld').toLowerCase()}|${String(c.place_label || '').trim().toLowerCase()}`;
  function botsing(c) {
    const a = venster(c);
    if (!a || c.is_default || !c.active) return [];
    return cats().filter(x => x.id !== c.id && !x.is_default && plekSleutel(x) === plekSleutel(c) && (() => { const b = venster(x); return !!b && a[0] < b[1] && b[0] < a[1]; })());
  }
  const botsTekst = (c, met) => `${c.name} en ${met.map(x => x.name).join(' en ')} spelen tegelijk op ${c.place_label ? `${c.place_label}, ` : ''}${String(c.place_noun || 'Veld').toLowerCase()} 1${c.places > 1 ? ` tot ${c.places}` : ''}.`;
  function tekenTijden(c) {
    const doel = $('ae-s-tijden');
    if (!c) { if (doel.__sig !== '') { doel.__sig = ''; doel.innerHTML = ''; } return; }
    const sig = JSON.stringify([c.id, c.start_time, c.match_min, c.break_min, c.places, c.place_noun, c.place_label, botsing(c).map(x => x.id)]);
    const zelfde = (doel.querySelector('form') || { dataset: {} }).dataset.id === String(c.id);
    if (doel.__sig === sig || (zelfde && bezigIn(doel))) return;
    doel.__sig = sig;
    const plek = String(c.place_noun || 'Veld').toLowerCase();
    const bots = botsing(c);
    doel.innerHTML = `<form class="ae-kaart ae-tijden" data-ae-form="tijden" data-id="${esc(c.id)}" novalidate>
        <h3 class="ae-kaart-h">Tijden van ${esc(c.name)}</h3>
        <p class="ae-kaart-s">Pas je iets aan, dan schuiven de wedstrijden die nog gespeeld moeten worden meteen mee.</p>
        <div class="ae-velden">
          <label>Eerste wedstrijd<input type="time" name="start_time" value="${esc(c.start_time || '')}" required /></label>
          <label>Wedstrijd (min)<input type="number" name="match_min" min="1" max="90" inputmode="numeric" value="${esc(c.match_min)}" required /></label>
          <label>Wissel (min)<input type="number" name="break_min" min="0" max="60" inputmode="numeric" value="${esc(c.break_min)}" required /></label>
          <label>Hoeveel × ${esc(plek)}<input type="number" name="places" min="1" max="12" inputmode="numeric" value="${esc(c.places)}" required /></label>
          ${cats().length > 1 ? `<label class="ae-veld-breed">Waar speelt ${esc(c.name)}?<input type="text" name="place_label" maxlength="30" value="${esc(c.place_label || '')}" placeholder="Bijvoorbeeld de naam van de hal" autocomplete="off" /></label>` : ''}
        </div>
        ${bots.length ? `<p class="ae-kaart-let" role="status"><i class="ae-stip" aria-hidden="true"></i>${esc(botsTekst(c, bots))} Geef elke ${esc(W().cat)} een eigen plek, of een andere begintijd.</p>` : ''}
        <div class="ae-kaart-k"><button type="submit" class="rg-knop ae-knop">Tijden opslaan</button><span class="ae-status" role="status"></span></div>
      </form>`;
  }

  // 3. Wedstrijddag -----------------------------------------------------------
  function basisAdres() {
    const sy = (R() && R().system) || {};
    return sy.base_url_ok && /^https?:\/\//.test(String(sy.base_url || '')) ? String(sy.base_url).replace(/\/+$/, '') : location.origin;
  }
  function schermen() {
    const d = R(), m = hoofd();
    const lijst = [
      { id: 'bediening', pad: '/wedstrijd', naam: 'Bediening voor de crew', uitleg: 'Wedstrijden starten, de stand bijhouden en affluiten. Eén telefoon per wedstrijd.' },
      { id: 'checkin', pad: '/checkin', naam: 'Check-in bij de ingang', uitleg: 'De QR van Mijn team scannen, of zoeken op naam.' },
    ];
    // De omroep kent alleen het hoofdtoernooi: zonder schema daar is dat scherm leeg.
    if (m && m.active && m.matches.total > 0) lijst.push({ id: 'omroep', pad: '/omroep', naam: 'Omroep', uitleg: 'Zinnen om voor te lezen, voor wie de microfoon heeft.' });
    lijst.push({ id: 'bord', pad: d && d.hub_mode ? '/sporten' : '/toernooi', naam: 'Live-bord', uitleg: 'Wat iedereen ziet: standen, uitslagen en na afloop de eindstand. Ook voor een groot scherm.', publiek: true });
    return lijst;
  }
  function qrSvg(t) {
    try {
      if (typeof qrcode !== 'function') return '';
      const q = qrcode(0, 'M');
      q.addData(t); q.make();
      const n = q.getModuleCount(), rand = 3;
      let p = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c + rand} ${r + rand}h1v1h-1z`;
      return `<svg class="ae-qr" viewBox="0 0 ${n + rand * 2} ${n + rand * 2}" role="img" aria-label="QR-code" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${p}" fill="#06193A"/></svg>`;
    } catch { return ''; }
  }
  function tekenDag(d) {
    const los = !RG.isOn();      // één toernooi: de wedstrijddag van de regie-laag bestaat dan niet
    $('ae-g-hoofd').hidden = !los;
    tekenHint('dag');
    const doel = $('ae-g-links');
    if (!d) { setHtml(doel, ''); return; }
    const sy = d.system || {};
    const basis = basisAdres(), kanQr = typeof qrcode === 'function';
    const nuKopie = kopie && kopie.tot > Date.now() ? kopie.id : null;
    const tm = teams().filter(t => t.status === 'approved'), binnen = tm.filter(t => t.checked_in_at).length;
    const rij = (x) => {
      const url = basis + x.pad, open = qrOpen === x.id;
      return `<li class="ae-scherm${open ? ' is-qr' : ''}" id="ae-scherm-${esc(x.id)}">
          <div class="ae-scherm-t"><b>${esc(x.naam)}</b><span>${esc(x.uitleg)}${x.id === 'checkin' && tm.length ? ` Nu ${binnen} van ${tm.length} binnen.` : ''}</span></div>
          <div class="ae-scherm-k">
            <a class="rg-knop${x.id === 'bediening' ? '' : ' rg-knop-rustig'} ae-knop" href="${esc(x.pad)}" target="_blank" rel="noopener" aria-label="${esc(x.naam)} openen in een nieuw tabblad">Open ↗</a>
            <button type="button" class="rg-knop rg-knop-rustig ae-knop${nuKopie === x.id ? ' is-klaar' : ''}" data-ae="kopie" data-id="${esc(x.id)}" aria-label="Kopieer de link van ${esc(x.naam)}">${nuKopie === x.id ? `${IC.check} Gekopieerd` : 'Kopieer link'}</button>
            ${kanQr ? `<button type="button" class="rg-knop rg-knop-rustig ae-knop" data-ae="qr" data-id="${esc(x.id)}" aria-expanded="${open}" aria-label="QR-code van ${esc(x.naam)}">QR</button>` : ''}
          </div>
          ${open ? `<div class="ae-scherm-qr">${qrSvg(url)}<p>${x.publiek ? '<b>Scan met de camera van een telefoon.</b> Dan opent het live-bord daar meteen. Inloggen hoeft niet: iedereen mag meekijken.' : '<b>Scan met de camera van de telefoon van de crew.</b> Dan opent dit scherm daar meteen; daarna vraagt het de crew-code.'}</p></div>` : ''}
        </li>`;
    };
    const prints = cats().filter(c => c.matches.total > 0);
    setHtml(doel, `<h3 class="ae-kaart-h" id="ae-g-links-h">Voor de crew</h3>
      <p class="ae-kaart-s ae-code${sy.crew_code === false ? ' is-let' : ''}"><b>Crew-code:</b> ${sy.crew_code === false
        ? 'nu niet ingesteld. De crew heeft dan de admincode nodig; laat de crew-code instellen bij de hosting (CREW_CODE).'
        : 'ingesteld. Hij staat bewust niet op dit scherm: je hebt hem gekregen van wie deze site heeft opgezet (bij de hosting heet hij CREW_CODE). Met de crew-code kan iemand alleen wedstrijden bedienen en inchecken.'}</p>
      <ul class="ae-schermen">${schermen().map(rij).join('')}</ul>
      ${prints.length ? `<div class="ae-prints"><span>Op papier, voor als het internet wegvalt:</span>${prints.map(c => `<a class="ae-link" href="${c.is_default ? '/print' : `/print?competition=${esc(c.id)}`}" target="_blank" rel="noopener">Print ${esc(c.name)} ↗</a>`).join('')}</div>` : ''}
      <p class="ae-sr" aria-live="polite" id="ae-live"></p>`);
  }
  const AANMELD = { id: 'aanmelden', pad: '/', naam: 'de aanmeldpagina' };
  const linkVan = (id) => (id === AANMELD.id ? AANMELD : schermen().find(q => q.id === id));
  async function kopieer(id) {
    const x = linkVan(id);
    if (!x) return;
    const url = basisAdres() + x.pad;
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); ok = true; } } catch { /* dan met de hand */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch { ok = false; }
    }
    if (!ok) { A.showToast(`Kopiëren lukte niet. De link is ${url}`, 'info'); return; }
    kopie = { id, tot: Date.now() + 2500 };
    teken();
    const live = $(id === AANMELD.id ? 'ae-deel-live' : 'ae-live'); if (live) live.textContent = `Link van ${x.naam} gekopieerd.`;
    gedeeld(id);
    setTimeout(() => { if (aan) teken(); }, 2600);
  }

  // 4. Instellingen -----------------------------------------------------------
  function tekenInstellingen(d) {
    const w = W();
    const subEl = $('ae-sub-instellingen');
    const sub = 'Wat je hier opslaat staat meteen op de site.';
    if (subEl.textContent !== sub) subEl.textContent = sub;
    tekenHint('instellingen');
    tekenDeel(d);
    tekenSmart();
    // Aanmelden open of dicht: één tik.
    const reg = d && d.registration, ev = (A.evenement && A.evenement()) || null;
    const modus = ev && ev.event ? ev.event.registration : null;
    const open = !!(reg && reg.open);
    const waarom = !reg ? '' : open ? (modus === 'auto' ? 'Automatisch: open tot en met de dag zelf.' : 'Iedereen kan zich aanmelden.')
      : reg.reason === 'soon' ? 'Er is nog geen datum ingevuld. Met de knop zet je het toch open.'
        : reg.reason === 'over' ? 'De dag is voorbij. Met de knop zet je het toch weer open.'
          : 'Niemand kan zich nu aanmelden. Met de hand toevoegen kan wel.';
    setHtml($('ae-i-open'), !reg ? '' : `<div class="ae-open-rij${open ? ' is-open' : ''}">
        <div class="ae-open-t"><span class="ae-open-stip" aria-hidden="true"></span><div><b>Aanmelden staat ${open ? 'open' : 'dicht'}</b><span>${esc(waarom)}</span></div></div>
        <button type="button" class="rg-knop ${open ? 'rg-knop-rustig ' : ''}ae-knop" data-ae="aanmelden" data-zet="${open ? 'closed' : 'open'}">${open ? 'Zet aanmelden dicht' : 'Zet aanmelden open'}</button>
      </div>`);

    // Categorieën: naam en maximum. Het hoofdtoernooi op inactief is geen categorie.
    const doel = $('ae-i-cats');
    const alle = zichtbaar();
    const hfd = hoofdAlsCat();
    const sig = JSON.stringify([alle.map(c => [c.id, c.name, c.max_teams, c.active, c.teams.approved, c.teams.waitlist, c.teams.pending, c.is_default]), w.cat, w.cats, hfd ? hfd.id : 0]);
    if (d && doel.__sig !== sig && !bezigIn(doel)) {
      doel.__sig = sig;
      const rij = (c) => `<form class="ae-catrij" data-ae-form="cat" data-id="${esc(c.id)}" novalidate>
          <label><span class="ae-sr">Naam</span><input type="text" name="name" maxlength="40" required value="${esc(c.name)}" aria-label="Naam van ${esc(c.name)}" /></label>
          <label class="ae-catrij-max"><span>Maximum</span><input type="number" name="max_teams" min="2" max="64" inputmode="numeric" required value="${esc(c.max_teams)}" aria-label="Maximum bij ${esc(c.name)}" /></label>
          <span class="ae-catrij-n">${esc(c.teams.approved)} aangemeld${c.teams.waitlist ? ` · ${esc(c.teams.waitlist)} wachtlijst` : ''}${c.active ? '' : ' · staat uit'}</span>
          <button type="submit" class="rg-knop rg-knop-rustig ae-knop">Opslaan</button>
          ${c.is_default ? '' : `<button type="button" class="ae-catrij-weg" data-ae="cat-weg" data-id="${esc(c.id)}" aria-label="${esc(c.name)} verwijderen">Verwijder</button>`}
        </form>${hfd && hfd.id === c.id ? `<div class="ae-catrij-let" id="ae-i-hoofd" role="status">
          <p><i class="ae-stip" aria-hidden="true"></i><span><b>${esc(c.name)} is nog het hoofdtoernooi.</b> Dat maakt pas poules bij veel aanmeldingen (ongeveer tien). Als gewone ${esc(w.cat)} krijgt elke aanmelding meteen een poule, al vanaf twee. ${c.teams.approved + c.teams.waitlist + c.teams.pending > 0 ? 'De aanmeldingen gaan mee.' : ''}</span></p>
          <button type="button" class="rg-knop ae-knop" data-ae="hoofd-om">Maak er een gewone ${esc(w.cat)} van</button>
        </div>` : ''}`;
      doel.innerHTML = `<h3 class="ae-kaart-h" id="ae-i-cats-h">${esc(hoofdletter(w.cats))}</h3>
        <p class="ae-kaart-s">Elke ${esc(w.cat)} heeft een eigen poule-indeling en een eigen maximum. Zet je het maximum hoger, dan schuift de wachtlijst vanzelf door.</p>
        <div class="ae-catrijen">${alle.map(rij).join('') || `<p class="ae-leeg">Nog geen ${esc(w.cat)}.</p>`}</div>
        <form class="ae-catrij ae-catrij-nieuw" data-ae-form="cat-nieuw" novalidate>
          <label><span class="ae-sr">Naam</span><input type="text" name="name" maxlength="40" required placeholder="Nieuwe ${esc(w.cat)}" aria-label="Naam van de nieuwe ${esc(w.cat)}" /></label>
          <label class="ae-catrij-max"><span>Maximum</span><input type="number" name="max_teams" min="2" max="64" inputmode="numeric" required value="${esc((alle[0] && alle[0].max_teams) || 12)}" aria-label="Maximum" /></label>
          <span class="ae-catrij-n"></span>
          <button type="submit" class="rg-knop ae-knop">Voeg toe</button>
        </form>
        <p class="ae-status" id="ae-i-cats-uit" role="status"></p>`;
    }

    const open2 = document.body.classList.contains('ae-meer-open');
    setHtml($('ae-i-meer'), `<button type="button" class="ae-meer-knop" data-ae="meer" aria-expanded="${open2}">${open2 ? 'Minder instellingen' : 'Meer instellingen'}</button>
      <span>${open2 ? 'Je ziet nu ook de stijl, de teksten, de sponsor en de aanmeldvorm.' : 'Stijl, teksten op de site, sponsor en de aanmeldvorm.'}</span>`);
    setHtml($('ae-i-voet'), `<div class="ae-voet-stand"><span>Mis je iets, zoals mails, het logboek, een back-up of de instellingen per ${esc(w.cat)}? Dat staat in de volledige Admin Hub. Je kunt daar altijd weer terug.</span>
      <button type="button" class="rg-knop rg-knop-rustig ae-knop" data-ae="alles">Alles tonen</button></div>`);
  }

  // ── JVO Smart als gids ───────────────────────────────────────────────────
  // De server rekent (GET /api/admin/smart/gids); hier wordt alleen getekend en gebracht.
  const GIDS_BEWAAR = 'jvo_gids_laatst', GIDS_UIT = 'jvo_gids_uit';
  const HELPERS = ['net-admin-04', 'net-admin-05', 'net-mijn-01', 'net-deur-01', 'net-bord-10'];
  // Het laatste antwoord blijft in dit tabblad staan: bij verversen staat de gids er meteen
  // (geen sprong in de pagina) en wordt hij daarna bijgewerkt.
  function leesGids() {
    try { const o = JSON.parse(sessionStorage.getItem(GIDS_BEWAAR) || 'null'); return o && o.v === 1 ? o : null; } catch { return null; }
  }
  function bewaarGids() {
    try { sessionStorage.setItem(GIDS_BEWAAR, JSON.stringify(gids)); } catch { /* geen opslag */ }
    try { if (gids && gids.aan === false) localStorage.setItem(GIDS_UIT, '1'); else localStorage.removeItem(GIDS_UIT); } catch { /* geen opslag */ }
  }
  const gidsUitHint = () => { try { return localStorage.getItem(GIDS_UIT) === '1'; } catch { return false; } };
  // nu: true = meteen (niet op de acht seconden wachten); 'zeker' = ook als JVO Smart uit stond.
  // Staat de gids (en elke hint) uit, dan vraagt deze pagina hem niet steeds opnieuw: alleen bij
  // het openen, bij een ander onderdeel, na de schakelaar, of als de helpers weer aan blijken.
  const gidsIsUit = () => !!(gids && gids.aan === false && gids.hints_aan === false);
  async function laadGids(nu) {
    if (!G || !aan) return;
    if (gidsIsUit() && nu !== 'zeker') return;
    if (gidsBezig) { if (nu) gidsNog = nu === 'zeker' ? 'zeker' : (gidsNog || true); return; }
    if (!nu && Date.now() - gidsAt < 8000) return;
    gidsBezig = true; gidsAt = Date.now();
    try {
      const r = await A.api('/api/admin/smart/gids', { stil: true });
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j && j.v === 1) { gids = j; bewaarGids(); wijsVerder(); if (aan) teken(); }
    } catch { /* geen verbinding of sessie verlopen: de gids van de vorige keer blijft staan */ }
    gidsBezig = false;
    root.classList.remove('ae-gids-wacht');
    if (gidsNog) { const n = gidsNog; gidsNog = false; laadGids(n); }
  }
  // Loopt mee met elke verversing: is de stand veranderd (een aanmelding, een uitslag, een
  // instelling), dan komt de gids meteen opnieuw; anders hooguit eens per acht seconden.
  function volgGids() {
    const d = R();
    if (!d) return;
    const tm = teams();
    const stand = JSON.stringify([d.event, d.registration, d.totals, d.paused_all, d.signup_form,
      zichtbaar().map(c => [c.id, c.name, c.active, c.max_teams, c.teams, c.matches, c.draw_open, c.draw_locked, c.start_time, c.places, c.place_label, c.delay_min]),
      tm.length, tm.filter(t => t.checked_in_at).length, stedenlijst().length]);
    const anders = stand !== gidsStand;
    gidsStand = stand;
    laadGids(anders && Date.now() - gidsAt > 1200);
  }
  // innerHTML vervangen zonder dat de focus of een opengeklapt blok verdwijnt.
  function setHtmlMetFocus(el, html) {
    if (!el || el.__ae === html) return false;
    const f = el.contains(document.activeElement) ? document.activeElement.closest('[data-fk]') : null;
    const fk = f ? f.dataset.fk : '';
    setHtml(el, html);
    if (fk) { const n = el.querySelector(`[data-fk="${fk}"]`); if (n) { try { n.focus({ preventScroll: true }); } catch { /* geen focus */ } } }
    return true;
  }
  const gaKnop = (k, cls, fk) => (k && k.doel && k.label
    ? `<button type="button" class="${cls}" data-ae="gids-ga" data-doel="${esc(k.doel)}"${Number.isInteger(k.cat) ? ` data-cat="${esc(k.cat)}"` : ''}${Number.isInteger(k.team) ? ` data-team="${esc(k.team)}"` : ''} data-fk="${esc(fk)}">${esc(k.label)}</button>` : '');
  const FASE = { opzet: 'je volgende stap', dag: 'de dag zelf', na: 'na afloop' };
  // Het startscherm. Geeft true terug als de gids in beeld staat (dan vervalt "Nog te regelen").
  function tekenGids() {
    const doel = $('ae-gids');
    if (!doel) return false;
    const weg = () => { if (!doel.hidden) doel.hidden = true; setHtml(doel, ''); return false; };
    if (!G) return weg();
    const s = gids && gids.aan ? gids.stap : null;
    if (!s || !s.titel) return weg();
    const v = gids.voortgang || {}, stappen = Array.isArray(gids.stappen) ? gids.stappen : [];
    const opzet = gids.fase === 'opzet';
    const streep = opzet && stappen.length ? `<span class="jvs-voortgang-s" aria-hidden="true">${stappen.map(x => `<i${x.klaar ? ' class="op"' : ''}></i>`).join('')}</span>` : '';
    const t2 = s.tweede && s.tweede.label && s.tweede.stap
      ? `<button type="button" class="rg-knop rg-knop-rustig ae-knop" data-ae="gids-stap" data-stap="${esc(s.tweede.stap)}" data-fk="tweede">${esc(s.tweede.label)}</button>` : '';
    const terug = gidsTerug && gidsTerug.tot > Date.now()
      ? `Afgevinkt: ${esc(gidsTerug.kort)}. <button type="button" class="jvs-tekstknop" data-ae="gids-stap" data-stap="${esc(gidsTerug.stap)}" data-zet="nee" data-fk="terug">Toch niet</button>` : '';
    const klaarN = stappen.filter(x => x.klaar).length;
    const route = opzet && stappen.length ? `<details class="jvs-route"${routeOpen ? ' open' : ''}><summary data-fk="route">${klaarN ? `Wat al klaar is (${klaarN} van ${stappen.length})` : `De hele route (${stappen.length} stappen)`}</summary>
        <ol>${stappen.map(x => `<li class="${x.klaar ? 'is-klaar' : (x.id === s.id ? 'is-nu' : '')}"><span class="jvs-bol" aria-hidden="true">${x.klaar ? G.VINK : ''}</span><span>${esc(x.kort)}${x.klaar ? '<span class="ae-sr"> (klaar)</span>' : (x.id === s.id ? ' <em>nu</em>' : '')}</span></li>`).join('')}</ol></details>` : '';
    // Let op: wat niet klopt. De eerste regel staat er, de rest achter "en nog …".
    const punten = (Array.isArray(gids.let_op) ? gids.let_op : []).filter(x => x && x.tekst && !G.isWeg(`letop:${x.sleutel}`, x.sleutel));
    const punt = (x, i) => `<li class="is-${esc(x.ernst || 'info')}"><i class="jvs-stip" aria-hidden="true"></i><span>${esc(x.tekst)}</span>${gaKnop(x.knop, 'jvs-tekstknop', `lo-${i}`)}${x.ernst === 'fout' ? '' : `<button type="button" class="jvs-x" data-ae="gids-weg" data-plek="letop:${esc(x.sleutel)}" data-sleutel="${esc(x.sleutel)}" data-fk="lx-${i}" aria-label="Verberg dit punt">${G.KRUIS}</button>`}</li>`;
    const meer = Number(gids.let_op_meer) > 0 ? Number(gids.let_op_meer) : 0;
    const rest = punten.slice(1);
    const letop = punten.length ? `<div class="jvs-letop"><h4 class="jvs-letop-h">Let op</h4><ul>${punt(punten[0], 0)}</ul>
        ${rest.length || meer ? `<details id="ae-letop-meer"${letopOpen ? ' open' : ''}><summary data-fk="lo-meer">en nog ${rest.length + meer}</summary><ul>${rest.map((x, i) => punt(x, i + 1)).join('')}${meer ? `<li><i class="jvs-stip" aria-hidden="true"></i><span>En nog ${meer} ${meer === 1 ? 'kleiner punt' : 'kleinere punten'}; die ${meer === 1 ? 'komt' : 'komen'} hier te staan zodra er ruimte is.</span></li>` : ''}</ul></details>` : ''}</div>` : '';
    const cls = `jvs jvs-gids ${G.ernstKlas(s.ernst)}`;
    if (doel.className !== cls) doel.className = cls;
    doel.hidden = false;
    setHtmlMetFocus(doel, `<div class="jvs-gids-kop">${G.mark(true)}<span class="jvs-eyebrow">JVO Smart · ${FASE[gids.fase] || FASE.opzet}</span>${v.tekst ? `<span class="jvs-voortgang"><span>${esc(v.tekst)}</span>${streep}</span>` : ''}</div>
      <div class="jvs-gids-nu"><div><h3 class="jvs-gids-titel">${esc(s.titel)}</h3>${s.tekst ? `<p class="jvs-gids-tekst">${esc(s.tekst)}</p>` : ''}</div>
        <div class="jvs-gids-k">${gaKnop(s.knop, 'rg-knop ae-knop', 'ga')}${t2}</div></div>
      <p class="jvs-gids-zeg">${terug}</p>
      ${route}${letop}
      <p class="jvs-gids-voet">Liever zonder gids? <button type="button" class="jvs-tekstknop" data-ae="gids-ga" data-doel="instellingen/smart" data-fk="uit">Dat zet je uit bij Instellingen</button></p>`);
    // Voor wie het scherm laat voorlezen: alleen een nieuwe stap wordt gemeld, niet elke verversing.
    const live = $('ae-gids-live'), zeg = `JVO Smart: ${s.titel}`;
    if (live && live.dataset.zei !== zeg) { live.dataset.zei = zeg; if (live.dataset.eerste) live.textContent = zeg; live.dataset.eerste = '1'; }
    return true;
  }
  // Hooguit één regel bovenaan een onderdeel; weg te klikken, en terug zodra de stand wezenlijk verandert.
  function tekenHint(deel) {
    const doel = $(`ae-hint-${deel}`);
    if (!doel) return;
    const h = G && gids && gids.hints ? gids.hints[deel] : null;
    const plek = `hint:${deel}`;
    if (!h || !h.tekst || G.isWeg(plek, h.sleutel)) { if (!doel.hidden) doel.hidden = true; setHtml(doel, ''); return; }
    // Is de hint de stap van nu, dan wijst "Laat zien" de plek op dit onderdeel aan.
    let k = h.knop && h.knop.doel ? h.knop : null;
    const sk = gids.aan && gids.stap ? gids.stap.knop : null;
    if (!k && h.stap && sk && /\//.test(String(sk.doel)) && String(sk.doel).split('/')[0] === deel) k = { label: 'Laat zien', doel: sk.doel, cat: sk.cat, team: sk.team };
    const cls = `jvs jvs-hint ${G.ernstKlas(h.ernst)}`;
    if (doel.className !== cls) doel.className = cls;
    doel.hidden = false;
    setHtmlMetFocus(doel, `${G.mark(true)}<span class="jvs-hint-t"><span class="ae-sr">JVO Smart: </span>${esc(h.tekst)}</span>${gaKnop(k, 'jvs-tekstknop', 'ga')}
      <button type="button" class="jvs-x" data-ae="gids-weg" data-plek="${esc(plek)}" data-sleutel="${esc(h.sleutel)}" data-fk="x" aria-label="Hint verbergen">${G.KRUIS}</button>`);
  }
  // Een stap die alleen jij kunt weten (link gedeeld, crew geregeld, zonder lijst): afvinken of terugzetten.
  async function gidsStap(stap, gedaan, knop) {
    if (!stap) return;
    if (knop) knop.disabled = true;
    const r = await call('POST', '/api/admin/smart/gids', { stap, gedaan: !!gedaan });
    if (knop) knop.disabled = false;
    if (!r.ok) return fout(r, 'Dat lukte niet.');
    const was = gids && Array.isArray(gids.stappen) ? gids.stappen.find(x => x.id === stap) : null;
    if (r.j && r.j.v === 1) { gids = r.j; gidsAt = Date.now(); bewaarGids(); wijsVerder(); }
    gidsTerug = gedaan ? { stap, kort: (was && was.kort) || 'de stap', tot: Date.now() + 15000 } : null;
    teken();
    if (gedaan) setTimeout(() => { if (aan && gidsTerug && gidsTerug.tot <= Date.now()) { gidsTerug = null; teken(); } }, 15200);
    const g = $('ae-gids'), f = g && !g.hidden ? (g.querySelector('[data-fk="ga"]') || g.querySelector('.jvs-gids-titel')) : null;
    if (f && route == null) { if (!f.matches('button')) f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
  }
  // Je kwam hier via de knop van de gids en die stap is nu geregeld (of er hoort een volgend veld
  // bij): dan staat onderaan één regel met de volgende stap. Geen sprong vanzelf: jij tikt.
  // Alleen bij het opzetten; op de dag wisselt de stap vanzelf en zou dit alleen maar storen.
  function wijsVerder() {
    if (!gebracht) return;
    const st = gids && gids.aan && gids.fase === 'opzet' ? gids.stap : null;
    if (!st || !route) { gebracht = null; return; }
    const doel = st.knop ? st.knop.doel : '', cat = st.knop && Number.isInteger(st.knop.cat) ? st.knop.cat : null;
    if (st.id === gebracht.stap && doel === gebracht.doel && cat === gebracht.cat) return;
    const was = (Array.isArray(gids.stappen) ? gids.stappen : []).find(x => x.id === gebracht.stap);
    volg = { tekst: st.id === gebracht.stap ? `Verder met: ${st.titel}.` : `${was && was.klaar ? 'Dat is geregeld. ' : ''}Volgende stap: ${st.titel}.`, knop: st.knop || null, ernst: st.ernst };
    gebracht = null;
  }
  function tekenVolg() {
    const doel = $('ae-volg');
    if (!doel) return;
    if (!G || !volg || !route || !gids || !gids.aan) { if (!doel.hidden) doel.hidden = true; setHtml(doel, ''); return; }
    doel.hidden = false;
    setHtmlMetFocus(doel, `${G.mark(true)}<span class="jvs-hint-t"><span class="ae-sr">JVO Smart: </span>${esc(volg.tekst)}</span>${gaKnop(volg.knop, 'rg-knop ae-knop', 'ga')}
      <button type="button" class="jvs-x" data-ae="volg-weg" data-fk="x" aria-label="Verberg deze regel">${G.KRUIS}</button>`);
  }
  // De link van de aanmeldpagina gekopieerd of de QR getoond: dan is "Deel de link" gedaan (alleen
  // als dat de stap van nu is).
  // Zo ook de link van de bediening of de check-in bij "Regel de crew". Terugzetten kan op Start ("Toch niet").
  function gedeeld(id) {
    const st = gids && gids.aan ? gids.stap : null;
    if (!st) return;
    if (st.id === 'delen' && id === AANMELD.id) gidsStap('delen', true, null);
    else if (st.id === 'crew' && (id === 'bediening' || id === 'checkin')) gidsStap('crew', true, null);
  }

  // "Breng me erheen": het onderdeel open, de plek in beeld, even oplichten, de focus erop.
  // De server noemt een doel bij naam (instellingen/datum); deze kaart weet welke plek dat hier is.
  const ANKERS = {
    'instellingen/naam': { id: 'evc-name' }, 'instellingen/datum': { id: 'evc-date' }, 'instellingen/tijden': { id: 'evc-startTime' },
    'instellingen/locatie': { id: 'evc-location' }, 'instellingen/lijst': { id: 'evc-cityList' }, 'instellingen/open': { id: 'ae-i-open', focus: '[data-ae="aanmelden"]' },
    'instellingen/delen': { id: 'ae-i-deel', focus: '[data-ae="kopie"]' }, 'instellingen/cats': { id: 'ae-i-cats', focus: '#ae-i-hoofd button, .ae-catrij-nieuw input[name="name"]' },
    'instellingen/spelregels': { id: 'rules-fold' }, 'instellingen/smart': { id: 'ae-i-smart', focus: '#ae-smart-aan' },
    'aanmeldingen/wachten': { id: 'teams-cards', filter: 'pending' }, 'aanmeldingen/nieuw': { id: 'ae-a-nieuw', focus: '#ae-nieuw-stad' },
    // Eén team ("X is er nog niet"): zijn rij in de lijst, de focus op "Check in".
    'aanmeldingen/team': { team: true, anders: 'teams-cards', focus: '[data-act="checkin"]' },
    'schema/indeling': { sel: '#rg-sportpaneel .rg-indeling, #rg-sportpaneel [data-rg="genereer"]', anders: 'rg-sportpaneel', focus: '[data-rg="indeling"], [data-rg="genereer"]' },
    'schema/tijden': { id: 'ae-s-tijden', focus: 'input[name="start_time"]' },
    'dag/nu': { id: 'rg-h-nu', blok: 'section' }, 'dag/straks': { id: 'rg-h-straks', blok: 'section' }, 'dag/bijsturen': { id: 'rg-rijen' },
    'dag/pauze': { id: 'rg-pauze-alles' }, 'dag/crew': { id: 'ae-g-links' }, 'dag/checkin': { id: 'ae-scherm-checkin', focus: 'a, button' },
    'dag/bord': { id: 'ae-scherm-bord', focus: '[data-ae="kopie"]' },
  };
  const rustig = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  let brengTimer = null, lichtTimer = null;
  function breng(doel, catId, teamId) {
    const naam = String(doel || '');
    const deel = naam.split('/')[0];
    if (!deelVan(deel)) { ga(null); return; }
    const a = ANKERS[naam] || null;
    const cat = /^\d+$/.test(String(catId || '')) ? Number(catId) : null;
    const team = a && a.team && /^\d+$/.test(String(teamId || '')) ? Number(teamId) : null;
    const st = gids && gids.aan && gids.fase === 'opzet' ? gids.stap : null;
    gebracht = st && st.knop && st.knop.doel === naam ? { stap: st.id, doel: naam, cat: Number.isInteger(st.knop.cat) ? st.knop.cat : null } : null;
    volg = null;
    if (cat != null && deel === 'schema') schemaCat = cat;
    ga(deel);
    if (cat != null && RG.isOn() && (deel === 'schema' || deel === 'aanmeldingen') && cats().some(c => c.id === cat) && A.selSport !== cat) A.selSport = cat;
    if (a && a.filter && A.setFilter) A.setFilter(a.filter);
    if (!a) return;
    clearTimeout(brengTimer);
    let poging = 0, ruim = false;
    const rijVan = () => (team != null ? document.querySelector(`#teams-cards .tm-card[data-id="${team}"]`) : null);
    const zoek = () => {
      if (!aan || route !== deel) return;
      // Het team staat niet in beeld (een ander filter, of een zoekterm): dan alles tonen, één keer.
      if (team != null && !rijVan() && !ruim && A.zoekTeam) { ruim = true; A.zoekTeam(''); }
      let el = team != null ? rijVan() : a.id ? $(a.id) : a.sel ? document.querySelector(a.sel) : null;
      // Bij één team eerst even op zijn rij wachten (de lijst kan net opnieuw getekend worden).
      if (!el && a.anders && (team == null || poging >= 5)) el = $(a.anders);
      // Elke vouw erboven open, en "Meer instellingen" als de plek daarachter staat.
      const klapOpen = (n) => { let d = n && n.closest('details'); while (d) { if (!d.open) d.open = true; d = d.parentElement && d.parentElement.closest('details'); } };
      if (el) {
        klapOpen(el);
        if (el.closest('.ae-extra') && !document.body.classList.contains('ae-meer-open')) { document.body.classList.add('ae-meer-open'); teken(); }
      }
      // Het blok wordt soms net na de wissel getekend: kort opnieuw proberen.
      if (!el || el.offsetParent === null) {
        if (++poging < 8) brengTimer = setTimeout(zoek, 220);
        return;
      }
      if (a.focus) klapOpen(el.querySelector(a.focus));
      const blok = (a.blok && el.closest(a.blok)) || (el.matches('input, select, textarea') && el.closest('.evc-f, label')) || el;
      try { blok.scrollIntoView({ behavior: rustig() ? 'auto' : 'smooth', block: 'center' }); } catch { blok.scrollIntoView(); }
      document.querySelectorAll('.jvs-target').forEach(n => n.classList.remove('jvs-target'));
      blok.classList.add('jvs-target');
      clearTimeout(lichtTimer);
      lichtTimer = setTimeout(() => blok.classList.remove('jvs-target'), 2400);
      let f = el.matches('input, select, textarea, button, a[href]') ? el : null;
      if (!f && a.focus) f = el.querySelector(a.focus);
      if (!f) { f = blok; if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1'); }
      try { f.focus({ preventScroll: true }); } catch { /* geen focus */ }
    };
    brengTimer = setTimeout(zoek, 180);
  }

  // Instellingen: de link van de aanmeldpagina delen (kopiëren, QR, openen).
  function tekenDeel(d) {
    const doel = $('ae-i-deel');
    if (!doel) return;
    if (!d) { setHtml(doel, ''); return; }
    const url = basisAdres() + '/';
    const open = !!(d.registration && d.registration.open);
    const kanQr = typeof qrcode === 'function', qr = qrOpen === AANMELD.id;
    const nuKopie = kopie && kopie.tot > Date.now() && kopie.id === AANMELD.id;
    setHtml(doel, `<h3 class="ae-kaart-h" id="ae-i-deel-h">Deel de aanmeldlink</h3>
      <p class="ae-kaart-s">${open ? 'Stuur deze link rond, of laat de QR scannen vanaf een poster of een scherm.' : 'Aanmelden staat nu dicht: wie de link opent leest dat. Zet aanmelden eerst open en deel hem daarna.'}</p>
      <div class="ae-deel-rij${qr ? ' is-qr' : ''}">
        <span class="ae-deel-url" translate="no">${esc(url.replace(/^https?:\/\//, ''))}</span>
        <div class="ae-scherm-k">
          <button type="button" class="rg-knop ae-knop${nuKopie ? ' is-klaar' : ''}" data-ae="kopie" data-id="${AANMELD.id}">${nuKopie ? `${IC.check} Gekopieerd` : 'Kopieer link'}</button>
          ${kanQr ? `<button type="button" class="rg-knop rg-knop-rustig ae-knop" data-ae="qr" data-id="${AANMELD.id}" aria-expanded="${qr}" aria-label="QR-code van de aanmeldpagina">QR</button>` : ''}
          <a class="rg-knop rg-knop-rustig ae-knop" href="/" target="_blank" rel="noopener" aria-label="De aanmeldpagina openen in een nieuw tabblad">Open ↗</a>
        </div>
        ${qr ? `<div class="ae-scherm-qr">${qrSvg(url)}<p><b>Scan met de camera van een telefoon.</b> Dan opent de aanmeldpagina. Voor een poster: maak een schermafbeelding van deze QR.</p></div>` : ''}
      </div>
      <p class="ae-sr" aria-live="polite" id="ae-deel-live"></p>`);
  }

  // Instellingen: één schakelaar voor de hele gids (voor jou en voor de deelnemers). Per stuk
  // aan of uit kan in de volledige Admin Hub ("JVO Smart leert"); dit zet ze alle vijf tegelijk.
  async function laadVlaggen() {
    if (vlagBezig) return;
    vlagBezig = true;
    try {
      const r = await fetch('/api/smart/flags', { cache: 'no-store' }); const j = r.ok ? await r.json() : null;
      if (j && j.flags) {
        vlaggen = j.flags;
        // Elders (de volledige Admin Hub) weer aangezet: dan de gids meteen ophalen.
        if (gidsIsUit() && HELPERS.some(id => vlaggen[id] !== false)) laadGids('zeker');
        if (aan) teken();
      }
    } catch { /* de stand van de vorige keer blijft staan */ }
    vlagBezig = false;
  }
  function tekenSmart() {
    const doel = $('ae-i-smart');
    if (!doel) return;
    if (!vlaggen) { setHtml(doel, ''); return; }
    const op = HELPERS.filter(id => vlaggen[id] !== false).length;
    if (bezigIn(doel) && doel.__ae) return;
    setHtml(doel, `<label class="toggle-row ae-smart-rij" for="ae-smart-aan">
        <input type="checkbox" id="ae-smart-aan"${op > 0 ? ' checked' : ''} />
        <span><b>JVO Smart helpt mee</b>
          <small>Aan: jij krijgt hier steeds de volgende stap en hooguit één hint per onderdeel, en deelnemers zien “Wat nu?” in Mijn team, op de aanmeldpagina en op het bord. Uit: alles werkt hetzelfde, zonder die hulp.${op > 0 && op < HELPERS.length ? ' Nu staat een deel uit; dat is per stuk ingesteld in de volledige Admin Hub.' : ''}</small></span>
      </label>
      <p class="ae-status" id="ae-smart-uit" role="status"></p>`);
  }
  async function zetSmart(vak) {
    const zet = !!vak.checked;
    vak.disabled = true;
    let mis = 0;
    for (const id of HELPERS) {
      const r = await call('POST', `/api/admin/smart/learnings/${encodeURIComponent(id)}/${zet ? 'apply' : 'dismiss'}`);
      if (!r.ok) { mis++; if (r.net) break; }
    }
    vak.disabled = false;
    if (mis) A.showToast('Dat lukte niet helemaal. Probeer het opnieuw.', 'error');
    else A.showToast(zet ? 'JVO Smart helpt weer mee' : 'JVO Smart staat uit');
    await laadVlaggen();
    await laadGids('zeker');
    teken();
    const n = $('ae-smart-aan'); if (n) n.focus({ preventScroll: true });
  }

  // ── Klikken en opslaan ───────────────────────────────────────────────────
  function kiesCat(v, strook) {
    const id = v === '' || v == null ? null : Number(v);
    if (route === 'schema' && id != null) schemaCat = id;
    A.selSport = id;                                   // tekent alles opnieuw (renderAll)
    const nu = strook && strook.querySelector('.ae-cat[aria-pressed="true"]');
    if (nu) nu.focus({ preventScroll: true });
  }
  async function klik(e) {
    const link = e.target.closest('a[href^="#/"]');
    if (link && root.contains(link) && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const m = /^#\/([a-z]+)?\/?$/.exec(link.getAttribute('href') || '');
      if (m) {
        e.preventDefault();
        if (link.dataset.cat && /^\d+$/.test(link.dataset.cat)) schemaCat = Number(link.dataset.cat);
        ga(m[1] || null);
        if (link.dataset.cat && route === 'schema' && A.selSport !== schemaCat) A.selSport = schemaCat;
        if (link.dataset.open) { const v = $(link.dataset.open); if (v && v.tagName === 'DETAILS') { v.open = true; v.scrollIntoView({ block: 'start' }); } }
        return;
      }
    }
    const cat = e.target.closest('button.ae-cat');
    if (cat && root.contains(cat)) return kiesCat(cat.dataset.cat, cat.parentNode);
    const b = e.target.closest('[data-ae]');
    if (!b || !root.contains(b)) return;
    const act = b.dataset.ae;
    if (act === 'alles') return zetStand('volledig', b);
    if (act === 'kopie') return kopieer(b.dataset.id);
    if (act === 'qr') { qrOpen = qrOpen === b.dataset.id ? null : b.dataset.id; teken(); if (qrOpen) gedeeld(qrOpen); return; }
    if (act === 'gids-ga') return breng(b.dataset.doel, b.dataset.cat, b.dataset.team);
    if (act === 'volg-weg') { volg = null; return teken(); }
    if (act === 'gids-weg') {
      if (G) G.zetWeg(b.dataset.plek, b.dataset.sleutel);
      teken();
      // De knop is weg: de focus blijft in de buurt (het volgende punt, anders de knop van de gids of de kop).
      const g = $('ae-gids');
      const f = (!route && g && !g.hidden && (g.querySelector('.jvs-letop .jvs-x') || g.querySelector('[data-fk="ga"]'))) || $(`ae-h-${route || 'home'}`);
      if (f) f.focus({ preventScroll: true });
      return;
    }
    if (act === 'gids-stap') return gidsStap(b.dataset.stap, b.dataset.zet !== 'nee', b);
    if (act === 'meer') { document.body.classList.toggle('ae-meer-open'); return teken(); }
    if (act === 'aanmelden') {
      const zet = b.dataset.zet === 'open' ? 'open' : 'closed';
      b.disabled = true;
      const r = await call('PUT', '/api/admin/event-config', { event: { registration: zet } });
      b.disabled = false;
      if (!r.ok) return fout(r, 'Dat lukte niet.');
      A.showToast(zet === 'open' ? 'Aanmelden staat open' : 'Aanmelden staat dicht');
      if (A.laadEvenement) A.laadEvenement({ zacht: true });
      laadCfg(true);
      await RG.refresh();
      laadGids(true);
      return teken();
    }
    if (act === 'hoofd-om') return hoofdOm(b);
    if (act === 'cat-weg') {
      const c = zichtbaar().find(x => x.id === Number(b.dataset.id));
      if (!c) return;
      if (!(await A.bevestig({ titel: `${c.name} verwijderen?`, tekst: 'Dat kan alleen als er geen aanmeldingen meer aan hangen. Het schema van deze categorie gaat mee weg.', ja: 'Verwijder', nee: 'Annuleren' }))) return;
      const r = await call('DELETE', `/api/admin/competitions/${c.id}`);
      if (!r.ok) return fout(r, 'Verwijderen lukte niet.');
      A.showToast(`${c.name} is verwijderd`);
      return naCat();
    }
  }
  async function naCat() {
    const doel = $('ae-i-cats'); if (doel) { doel.querySelectorAll('form').forEach(f => { delete f.dataset.vuil; }); if (doel.contains(document.activeElement)) document.activeElement.blur(); }
    if (window.JVO_HUB) window.JVO_HUB.load();
    laadCfg(true);
    await RG.refresh();
    await A.refreshAll();
    laadGids(true);
  }
  async function verstuur(e) {
    const f = e.target.closest('form[data-ae-form]');
    if (!f) return;
    e.preventDefault();
    const soort = f.dataset.aeForm;
    const knop = f.querySelector('button[type="submit"]');
    const bezig = (v) => { if (knop) knop.disabled = v; };

    if (soort === 'nieuw') {
      const city = String(f.elements.city.value || '').trim();
      const comp = Number(f.elements.competition_id.value);
      if (!city) { f.elements.city.focus(); return; }
      bezig(true);
      const r = await call('POST', '/api/admin/teams/stad', { city, competition_id: comp });
      bezig(false);
      if (!r.ok) return fout(r, 'Toevoegen lukte niet.');
      const j = r.j || {};
      nieuwUit = { naam: j.team_name || city, cat: (j.competition && j.competition.name) || '', wacht: j.team_status === 'waitlist', poule: j.draw && j.draw.poule ? j.draw.poule : '', code: j.mijn_code || '', genummerd: !!j.numbered };
      f.elements.city.value = '';
      delete f.dataset.vuil;
      A.showToast(nieuwUit.wacht ? `${nieuwUit.naam} staat op de wachtlijst` : `${nieuwUit.naam} doet mee`);
      await RG.refresh();
      await A.refreshAll();
      return;
    }
    if (soort === 'tijden') {
      const id = Number(f.dataset.id);
      const body = {};
      for (const veld of f.elements) {
        if (!veld.name || veld.value === veld.defaultValue) continue;
        body[veld.name] = veld.type === 'number' ? parseInt(veld.value, 10) : veld.name === 'place_label' ? veld.value.trim() : veld.value;
      }
      const st = f.querySelector('.ae-status');
      if (!Object.keys(body).length) { if (st) st.textContent = 'Er is niets veranderd.'; return; }
      bezig(true);
      const r = await call('PUT', `/api/admin/competitions/${id}`, body);
      bezig(false);
      if (!r.ok) return fout(r, 'Opslaan lukte niet.');
      delete f.dataset.vuil;
      if (f.contains(document.activeElement)) document.activeElement.blur();
      A.showToast(Object.keys(body).every(k => k === 'place_label') ? 'Opgeslagen.' : 'Tijden opgeslagen. Het schema is bijgewerkt.');
      if (window.JVO_HUB) window.JVO_HUB.load();
      await RG.refresh();
      await A.refreshAll();
      return;
    }
    if (soort === 'cat' || soort === 'cat-nieuw') {
      const naam = String(f.elements.name.value || '').trim();
      const max = parseInt(f.elements.max_teams.value, 10);
      const uit = $('ae-i-cats-uit');
      if (!naam) { f.elements.name.focus(); return; }
      if (!Number.isInteger(max)) { f.elements.max_teams.focus(); return; }
      let r;
      bezig(true);
      if (soort === 'cat') {
        const body = {};
        if (naam !== f.elements.name.defaultValue) body.name = naam;
        if (String(max) !== f.elements.max_teams.defaultValue) body.max_teams = max;
        if (!Object.keys(body).length) { bezig(false); if (uit) uit.textContent = 'Er is niets veranderd.'; return; }
        r = await call('PUT', `/api/admin/competitions/${Number(f.dataset.id)}`, body);
      } else {
        // Een nieuwe categorie krijgt de opzet van de eerste die er al is (zelfde sport, zelfde
        // teamgrootte, tijden en plekken); alleen de naam en het maximum zijn van jou.
        const bron = cats().find(c => !c.is_default) || zichtbaar()[0] || hoofd() || {};
        const neem = ['sport', 'team_size', 'min_players', 'max_players', 'place_noun', 'places', 'start_time', 'match_min', 'break_min', 'result_model', 'best_of', 'set_points', 'deciding_points'];
        const body = { name: naam, max_teams: max, active: true };
        for (const k of neem) if (bron[k] != null && bron[k] !== '') body[k] = bron[k];
        r = await call('POST', '/api/admin/competitions', body);
      }
      bezig(false);
      if (!r.ok) return fout(r, 'Opslaan lukte niet.');
      A.showToast(soort === 'cat' ? `${naam} is opgeslagen` : `${naam} is toegevoegd`);
      return naCat();
    }
  }

  // ── Uitleg voor de ?-knop (admin.js: openHelp) ───────────────────────────
  function uitleg() {
    const w = W();
    const rij = (d, t) => `<li><a href="#/${d.id}" data-ah-uitleg><b>${d.naam}</b></a>: ${t}</li>`;
    return { title: route ? deelVan(route).naam : 'Beheer', html: `<p>Dit is de eenvoudige weergave: alles voor de dag zelf in vier onderdelen. Elke handeling is hooguit twee tikken.</p>
      <ul style="margin:8px 0 0; padding-left:18px;">
        ${rij(DELEN[0], `wie er meedoet per ${esc(w.cat)}, met poule, teamcode en check-in. Verwijderen, toelaten van de wachtlijst en met de hand toevoegen.`)}
        ${rij(DELEN[1], 'de poules en het tijdschema. Opnieuw indelen, de indeling vastzetten, de tijden en afdrukken.')}
        ${rij(DELEN[2], 'wat er nu loopt, uitslagen corrigeren, alles pauzeren en de link voor de crew.')}
        ${rij(DELEN[3], `naam, datum, tijden, locatie, de ${esc(w.cats)}, de lijst om uit te kiezen, aanmelden open of dicht en een schone start.`)}
      </ul>
      <p style="margin-top:8px;">JVO Smart wijst op het startscherm steeds de volgende stap aan en zet hooguit één regel bovenaan een onderdeel. Liever zonder? Dat zet je uit bij Instellingen.</p>
      <p style="margin-top:8px;">Mails, het logboek en back-ups staan in de volledige Admin Hub: onderaan het startscherm staat “Alles tonen”.</p>` };
  }

  // ── Meelopen ─────────────────────────────────────────────────────────────
  function tik() {
    const moet = wil();
    // Van volledig naar eenvoudig: eerst zet de hub zijn blokken terug, dan pakt deze schil ze.
    if (moet && !aan) { if (H0 && H0.actief() && H0.uit) H0.uit(); zetAan(); }
    else if (!moet && aan) zetUit();
    if (!moet) document.body.classList.remove('ae-wacht');
    if (aan) { laadCfg(false); if (route === 'schema' || route === 'aanmeldingen') zetSport(); teken(); volgGids(); }
  }
  A.onRender(tik);

  // Geen flits van de tabs bij verversen: verwacht de pagina de eenvoudige stand (de server zet
  // dat in de kop), dan blijft de oude indeling uit beeld tot de gegevens er zijn.
  if (A.hasToken() && A.standHint && A.standHint() === 'eenvoudig') {
    document.body.classList.add('ae-wacht');
    setTimeout(() => document.body.classList.remove('ae-wacht'), 4000);
  }

  window.JVO_ADMIN_EENVOUDIG = {
    actief: () => aan,
    wil, kanEenvoudig, zetStand,
    uit: () => zetUit(),
    opData: () => { tik(); },
  };

  // Voor admin.js, admin-regie.js en admin-profielen.js is er één "hub". In de eenvoudige stand
  // antwoordt die met de plekken van deze schil; anders gaat alles ongewijzigd naar de echte hub.
  if (H0) {
    window.JVO_ADMIN_HUB = {
      actief: () => aan || H0.actief(),
      ga: (afd, t, opts) => (aan ? ga(vertaal(afd, t), opts) : H0.ga(afd, t, opts)),
      toon: (node) => (aan ? toon(node) : H0.toon(node)),
      naarTab: (name) => (aan ? naarTab(name) : H0.naarTab(name)),
      uitleg: () => (aan ? uitleg() : H0.uitleg()),
      naAankomst: (fn) => { if (aan) { if (typeof fn === 'function') fn(); } else H0.naAankomst(fn); },
      teken: () => { if (aan) teken(); else H0.teken(); },
      dagLoopt: () => (aan ? !!(R() && ((R().totals && R().totals.live > 0) || (R().event && R().event.is_today))) : H0.dagLoopt()),
      route: () => (aan ? hubRoute() : H0.route()),
    };
  }
})();
