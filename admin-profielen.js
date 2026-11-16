// JVO Admin — PROFIELEN, PAS VAN 4 CIJFERS EN POORTJES (schermkant).
//
// De server (profielen.js) dwingt alles af; dit bestand tekent alleen:
//   - inloggen na de admin-code: profiel kiezen, pas intoetsen, nieuw profiel maken;
//   - het cijferpaneel (en bij Veiligheid het wachtwoordveld), ook als venster wanneer
//     de server midden in een scherm "poort dicht" zegt (admin.js: api());
//   - je eigen pasje rechtsboven, de hartslag en wie-is-waar voor hoofden.
//
// Zonder profielen op de server (of met een oudere server) doet dit bestand niets:
// actief() is dan onwaar en de admin werkt zoals altijd.
//
// Dit bestand laadt VÓÓR admin.js, zodat window.JVO_PAS er al is als admin.js start.
// Wat het van admin.js nodig heeft (toast, api, sessie starten) haalt het pas op het
// moment van gebruik uit window.JVO_ADMIN.
// Alles wat van gebruikers komt gaat door esc() voordat het in innerHTML belandt;
// meldingen gaan via textContent. De pas en het wachtwoord worden nergens bewaard of gelogd.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ADM = () => window.JVO_ADMIN || null;
  const toast = (m, k) => { const A = ADM(); if (A && A.showToast) A.showToast(m, k); };
  const rustig = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const svg = (d, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    chev: svg('<polyline points="9 6 15 12 9 18"/>', 16),
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18),
    wis: svg('<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><line x1="17" y1="9.5" x2="12" y2="14.5"/><line x1="12" y1="9.5" x2="17" y2="14.5"/>', 22),
    slot: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 16),
    vink: svg('<polyline points="20 6 9 17 4 12"/>', 16),
    terug: svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>', 16),
  };

  const WIJKEN = ['evenement', 'sport', 'toernooi', 'mensen', 'communicatie', 'veiligheid'];
  const WIJKNAAM = { evenement: 'Evenement', sport: 'Sport', toernooi: 'Toernooien', mensen: 'Mensen', communicatie: 'Communicatie', veiligheid: 'Veiligheid' };
  const KLEUREN = ['blauw', 'oranje', 'groen', 'paars', 'turkoois', 'geel', 'roze', 'grijs'];
  const KLEURNAAM = { blauw: 'Blauw', oranje: 'Oranje', groen: 'Groen', paars: 'Paars', turkoois: 'Turkoois', geel: 'Geel', roze: 'Roze', grijs: 'Grijs' };
  const FUNCTIES = ['Directie', 'Hoofd Sport', 'Hoofd Toernooien', 'Hoofd Mensen', 'Hoofd Communicatie', 'Hoofd Veiligheid', 'Wedstrijdleiding', 'Vrijwilliger'];
  const ZICHTBAAR = 'Hoofden van de organisatie zien in welke afdeling je de admin open hebt. Er wordt geen geschiedenis bewaard: sluit je de admin, dan ben je binnen een minuut uit beeld.';
  const WW_MIN = 10;

  // ── Staat ────────────────────────────────────────────────────────────────
  let token = null;
  let ik = null;                 // laatste antwoord van GET /api/admin/ik (bijgewerkt door de hartslag)
  let klok = 0;                  // serverklok min die van dit toestel
  let modus = null;              // null = onbekend, true = server heeft profielen, false = niet
  let voor = null;               // { tok, tot }: het voortoken, alleen in het geheugen (wissel van profiel)
  let plek = null, plekTimer = null, slagTimer = null;
  let aanwezig = [], aanwezigKlaar = false;
  let invoer = false, invoerGemeld = 0, pasTimer = null;   // is er getikt of getypt sinds de vorige hartslag?
  const horen = [];
  const nuServer = () => Date.now() + klok;
  const meld = () => { tekenPasje(); tekenBalk(); for (const f of horen) { try { f(ik); } catch { /* een luisteraar mag de rest niet breken */ } } };

  const actief = () => !!(ik && ik.profielen_actief && !ik.profielen_uit);
  const heeftProfiel = () => !!(actief() && ik.profiel);
  const magIn = (w) => !actief() || !!(ik.toegang && ik.toegang[w]);
  const isHoofd = () => !!(heeftProfiel() && (ik.profiel.is_hoofd || ik.profiel.is_eigenaar));
  function inWijk() {
    if (!heeftProfiel()) return null;
    const s = ik.sessie || {};
    return s.wijk && (!s.wijk_tot_ms || s.wijk_tot_ms > nuServer()) ? s.wijk : null;
  }
  // ── De warme pas ─────────────────────────────────────────────────────────
  // De server houdt bij of je pas warm is (profielen.js); dit is alleen wat het scherm ervan
  // weet, om te tekenen en om geen zinloos verzoek te doen. 'elke_wijk' | 'kwartier' | 'inloggen'.
  const pasStand = () => (heeftProfiel() && ik.pas && ik.pas.vragen) || 'elke_wijk';
  function pasWarm() {
    if (!heeftProfiel() || !ik.pas || !ik.pas.warm) return false;
    return ik.pas.warm_tot_ms == null || ik.pas.warm_tot_ms > nuServer();
  }
  // Wat er klein in het pasje staat: "pas actief tot 14:32" of "pas verlopen".
  const klokTijd = (ms) => { const d = new Date(ms - klok); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function pasTekst() {
    const st = pasStand();
    if (st === 'elke_wijk') return '';
    if (st === 'inloggen') return 'pas actief';
    return pasWarm() ? `pas actief tot ${klokTijd(ik.pas.warm_tot_ms)}` : 'pas verlopen';
  }
  function zetPas(pas) {
    if (!ik || !pas || typeof pas !== 'object') return;
    ik.pas = pas;
    // Precies op het moment van verlopen opnieuw tekenen (pasje, poortbalk, lampjes).
    clearTimeout(pasTimer);
    if (pas.warm && pas.warm_tot_ms) pasTimer = setTimeout(meld, Math.max(300, Math.min(pas.warm_tot_ms - nuServer() + 400, 2147000000)));
  }
  function zetIk(j) {
    ik = j || null;
    if (ik && ik.server_nu) klok = ik.server_nu - Date.now();
    if (ik && ik.pas) zetPas(ik.pas);
    if (ik && ik.profiel) { try { localStorage.setItem('jvo_admin_pid', String(ik.profiel.id)); } catch { /* geen opslag: dan staat je profiel niet vooraan */ } }
    meld();
  }
  function zetToken(t) {
    token = t || null;
    if (!token) { ik = null; aanwezig = []; aanwezigKlaar = false; clearTimeout(pasTimer); stopSlag(); sluitKaart(); meld(); }
  }

  // Verzoek zonder de centrale laag van admin.js: voor alles vóór de sessie (kiezer, voortoken).
  async function haal(path, { method = 'GET', body, tok } = {}) {
    const t = tok === undefined ? token : tok;
    const r = await fetch(path, {
      method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(t ? { 'x-admin-token': t } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j = {};
    try { j = await r.json(); } catch { /* geen JSON: lege body */ }
    return { ok: r.ok, status: r.status, j: j || {} };
  }
  // Verzoek binnen de sessie: door api() van admin.js, zodat een verlopen sessie daar wordt afgehandeld.
  async function vraag(path, method, body) {
    const A = ADM();
    const r = await A.api(path, { method: method || 'GET', body: body === undefined ? undefined : JSON.stringify(body), stil: true });
    let j = {};
    try { j = await r.json(); } catch { /* geen JSON */ }
    return { ok: r.ok, status: r.status, j: j || {} };
  }

  async function laadIk() {
    if (!token) { zetIk(null); return null; }
    try {
      const r = await haal('/api/admin/ik');
      if (r.status === 401) return null;            // api() van admin.js handelt de verlopen sessie af
      if (!r.ok) { zetIk(null); return null; }      // oudere server zonder profielen
      zetIk(r.j);
      if (heeftProfiel()) startSlag();
      return ik;
    } catch { return ik; }
  }

  // ── Rondje met initialen ─────────────────────────────────────────────────
  const kleurVan = (k) => (KLEUREN.includes(k) ? k : 'grijs');
  function initialenVan(naam) {
    const d = String(naam || '').trim().split(/\s+/).filter(Boolean);
    if (!d.length) return '?';
    const eerste = [...d[0]][0] || '';
    const laatste = d.length > 1 ? ([...d[d.length - 1]][0] || '') : ([...d[0]][1] || '');
    return (eerste + laatste).toUpperCase();
  }
  const rondje = (p, extra = '') => `<span class="pf-rond pf-k-${kleurVan(p && p.kleur)} ${extra}" aria-hidden="true">${esc((p && p.initialen) || initialenVan(p && p.naam))}</span>`;

  // ── Vensters: focus binnen het venster, de rest van de pagina niet bereikbaar ──
  function maakInert(behalve) {
    const lijst = [];
    for (const n of document.body.children) {
      if (n === behalve || n.inert || n.id === 'toast-host' || n.tagName === 'SCRIPT') continue;
      n.inert = true; lijst.push(n);
    }
    return () => { for (const n of lijst) n.inert = false; };
  }
  const focusbaar = (el) => [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(n => !n.disabled && !n.hidden && n.offsetParent !== null);
  function houdFocus(e, el) {
    if (e.key !== 'Tab') return;
    const f = focusbaar(el);
    if (!f.length) { e.preventDefault(); return; }
    const eerste = f[0], laatste = f[f.length - 1];
    if (!el.contains(document.activeElement)) { e.preventDefault(); eerste.focus(); }
    else if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
    else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
  }

  // ── Het cijferpaneel ─────────────────────────────────────────────────────
  // soort: 'pas' (4 cijfers, vanzelf versturen), 'kies' (zelf een pas kiezen: twee rondes),
  //        'wachtwoord' (Veiligheid), 'bord' (alleen een mededeling met één knop).
  // verstuur(waarde) → { ok, data } | { fout, schud } | { blok: { tot_ms } } | { sluit, fout }
  // plaats: 'venster' (over het scherm) of 'poort' (naast de ingezoomde wijk; de camera is de achtergrond).
  const teMakkelijk = (v) => /^(\d)\1{3}$/.test(v) || '0123456789'.includes(v) || '9876543210'.includes(v);
  let rij = Promise.resolve();
  let openPaneel = null;
  function paneel(o) {
    const p = rij.then(() => echtPaneel(o));
    rij = p.catch(() => null);
    return p;
  }
  function echtPaneel(o) {
    return new Promise((klaar) => {
      const vorig = document.activeElement;
      const soort = o.soort || 'pas';
      const toetsen = soort === 'pas' || soort === 'kies';
      const laag = document.createElement('div');
      laag.className = `pf-laag pf-plaats-${o.plaats === 'poort' ? 'poort' : 'venster'}`;
      const raster = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="pf-toets" data-c="${n}" aria-label="cijfer ${n}">${n}</button>`).join('')
        + `<button type="button" class="pf-toets pf-toets-tekst" data-annuleer>Annuleer</button>`
        + `<button type="button" class="pf-toets" data-c="0" aria-label="cijfer 0">0</button>`
        + `<button type="button" class="pf-toets pf-toets-tekst" data-wis aria-label="Wis het laatste cijfer">${IC.wis}</button>`;
      laag.innerHTML = `
        <div class="pf-paneel pf-soort-${soort}" role="dialog" aria-modal="true" aria-labelledby="pf-p-kop" aria-describedby="pf-p-regel">
          <div class="pf-p-top">
            ${o.lamp ? '<div class="pf-lamp" data-staat="dicht"><i aria-hidden="true"></i><span data-lamp>Poort dicht</span></div>' : ''}
            ${o.profiel ? rondje(o.profiel, 'pf-rond-g') : ''}
            ${soort === 'bord' ? `<span class="pf-p-slot" aria-hidden="true">${IC.slot}</span>` : ''}
            <h2 class="pf-p-kop" id="pf-p-kop" tabindex="-1"></h2>
            ${o.groot ? `<p class="pf-p-groot" aria-label="${esc(String(o.groot).split('').join(' '))}">${esc(o.groot)}</p>` : ''}
            <p class="pf-p-regel" id="pf-p-regel"></p>
          </div>
          ${toetsen ? `<div class="pf-vakjes" aria-hidden="true">${'<span><i></i></span>'.repeat(4)}</div>` : ''}
          <p class="pf-sr" aria-live="polite" data-live></p>
          ${soort === 'wachtwoord' ? `<form class="pf-ww" novalidate autocomplete="off">
              <label class="pf-label" for="pf-p-ww">Wachtwoord van Veiligheid</label>
              <div class="pf-ww-rij"><input class="pf-veld" id="pf-p-ww" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="200" />
              <button type="button" class="pf-toon" data-toon aria-pressed="false">Toon</button></div>
            </form>` : ''}
          <p class="pf-p-melding" data-melding></p>
          <p class="pf-p-hulp" data-hulp hidden></p>
          ${toetsen ? `<div class="pf-toetsen">${raster}</div>`
            : soort === 'wachtwoord' ? '<div class="pf-p-k"><button type="button" class="pf-knop pf-knop-rustig" data-annuleer>Annuleer</button><button type="button" class="pf-knop" data-open>' + esc(o.knop || 'Open de poort') + '</button></div>'
            : `<div class="pf-p-k"><button type="button" class="pf-knop" data-annuleer>${esc(o.knop || 'Terug')}</button></div>`}
        </div>`;
      const P = laag.querySelector('.pf-paneel');
      const kop = laag.querySelector('.pf-p-kop'), regel = laag.querySelector('.pf-p-regel');
      const vakjes = [...laag.querySelectorAll('.pf-vakjes span')];
      const live = laag.querySelector('[data-live]'), melding = laag.querySelector('[data-melding]'), hulp = laag.querySelector('[data-hulp]');
      const lamp = laag.querySelector('.pf-lamp'), lampTekst = laag.querySelector('[data-lamp]');
      const inp = laag.querySelector('#pf-p-ww');
      let waarde = '', eerste = null, bezig = false, dicht = false, blok = false, blokTimer = null;

      const zetKop = (k, r) => { kop.textContent = k || ''; regel.textContent = r || ''; };
      const tekenVakjes = () => vakjes.forEach((v, i) => v.classList.toggle('is-vol', i < waarde.length));
      const zetUit = (uit) => {
        P.classList.toggle('is-uit', uit);
        laag.querySelectorAll('[data-c], [data-wis], [data-open], [data-toon]').forEach(b => { b.disabled = uit; });
        if (inp) inp.disabled = uit;
      };
      const zeg = (t) => { live.textContent = ''; setTimeout(() => { if (!dicht) live.textContent = t; }, 30); };
      function schud() {
        try { if (navigator.vibrate) navigator.vibrate(80); } catch { /* geen trilmotor */ }
        P.classList.remove('is-schud'); void P.offsetWidth; P.classList.add('is-schud');
        setTimeout(() => P.classList.remove('is-schud'), 520);
      }
      function zegFout(tekst, metSchud) {
        melding.classList.remove('is-rustig');
        melding.textContent = tekst || '';
        if (tekst) zeg(tekst);
        if (metSchud) schud();
      }
      function sluit(res) {
        if (dicht) return;
        dicht = true;
        clearInterval(blokTimer);
        document.removeEventListener('keydown', opToets, true);
        herstel();
        laag.classList.add('is-weg');
        setTimeout(() => laag.remove(), rustig() ? 0 : 200);
        if (!o.geenFocusTerug && vorig && vorig.isConnected && typeof vorig.focus === 'function') { try { vorig.focus({ preventScroll: true }); } catch { /* element kan geen focus krijgen */ } }
        if (openPaneel === api) openPaneel = null;
        klaar(res);
      }
      function gelukt(data) {
        if (lamp) { lamp.dataset.staat = 'open'; lampTekst.textContent = 'Poort open'; }
        P.classList.add('is-open');
        zeg(o.lamp ? 'Poort open' : 'Gelukt');
        zetUit(true);
        try { if (o.opOpen) o.opOpen(); } catch { /* de camera mag het paneel niet breken */ }
        setTimeout(() => sluit(data === undefined ? true : data), rustig() ? 80 : 440);
      }
      function blokkeer(b, tekst) {
        blok = true; zetUit(true); P.classList.add('is-blok');
        const tot = Number(b && b.tot_ms) || (nuServer() + 5 * 60000);
        if (b && b.server_nu) klok = b.server_nu - Date.now();
        // Wie kan helpen staat er met naam bij (de server geeft de namen mee met de blokkade).
        const wie = Array.isArray(b && b.vraag) && b.vraag.length ? b.vraag.slice(0, 2).join(' of ') : '';
        hulp.textContent = soort === 'wachtwoord'
          ? 'Wachtwoord vergeten? Vraag de eigenaar. Weet niemand het meer, dan kan het alleen via het noodherstel op de server.'
          : `Pas vergeten? Vraag ${wie || 'iemand die in Veiligheid mag'} om hem opnieuw in te stellen.`;
        hulp.hidden = false;
        zeg(tekst || 'Geblokkeerd. Probeer het over een paar minuten opnieuw.');
        const vrij = (zin) => {
          clearInterval(blokTimer); blok = false; P.classList.remove('is-blok'); zetUit(false);
          melding.classList.add('is-rustig');      // goed nieuws: niet in de foutkleur
          melding.textContent = zin; hulp.hidden = true;
          zeg(zin);
          if (inp) inp.focus();
        };
        // Heft iemand in Veiligheid de blokkade op, dan komt het paneel binnen een paar seconden
        // vanzelf vrij (o.blokCheck → null = geen blokkade meer; undefined = onbekend, niets doen).
        let gevraagd = Date.now();
        const tik = () => {
          const s = Math.ceil((tot - nuServer()) / 1000);
          if (s <= 0) return vrij('Je kunt het weer proberen.');
          melding.classList.remove('is-rustig');
          melding.textContent = `Geblokkeerd. Probeer het over ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} opnieuw.`;
          if (o.blokCheck && Date.now() - gevraagd >= 4000) {
            gevraagd = Date.now();
            Promise.resolve().then(() => o.blokCheck()).then((t) => { if (!dicht && blok && t === null) vrij('De blokkade is opgeheven. Je kunt het weer proberen.'); }).catch(() => { /* geen verbinding: het aftellen loopt door */ });
          }
        };
        clearInterval(blokTimer); tik(); blokTimer = setInterval(tik, 500);
      }
      async function stuur(v) {
        bezig = true; zetUit(true); P.classList.add('is-bezig'); melding.textContent = '';
        let r;
        try { r = await o.verstuur(v); } catch { r = { fout: 'Geen verbinding. Probeer het opnieuw.', schud: false }; }
        if (dicht) return;
        bezig = false; P.classList.remove('is-bezig');
        waarde = ''; tekenVakjes();
        if (inp) inp.value = '';
        if (r && r.ok) return gelukt(r.data);
        if (r && r.sluit) { if (r.fout) toast(r.fout, 'error'); return sluit(null); }
        if (r && r.blok) return blokkeer(r.blok, r.fout);
        zetUit(!!(r && r.vast));
        if (soort === 'kies') { eerste = null; zetKop(o.kop, o.regel); }
        zegFout((r && r.fout) || 'Dat lukte niet. Probeer het opnieuw.', !r || r.schud !== false);
        if (inp && !inp.disabled) inp.focus();
      }
      function vier(v) {
        if (soort !== 'kies') return stuur(v);
        if (eerste == null) {
          bezig = false; waarde = ''; tekenVakjes();
          if (teMakkelijk(v)) return zegFout('Kies een pas die minder makkelijk te raden is.', true);
          eerste = v;
          zetKop(o.kop2 || 'Nog een keer', 'Toets dezelfde pas nog een keer in.');
          melding.textContent = '';
          return zeg('Nog een keer. Toets dezelfde pas nog een keer in.');
        }
        if (eerste !== v) {
          eerste = null; bezig = false; waarde = ''; tekenVakjes(); zetKop(o.kop, o.regel);
          return zegFout('De twee passen zijn niet gelijk. Begin opnieuw.', true);
        }
        if (!o.verstuur) { bezig = false; return gelukt(v); }
        return stuur(v);
      }
      function cijfer(c) {
        if (bezig || dicht || blok || waarde.length >= 4 || P.classList.contains('is-uit')) return;
        if (!waarde) { melding.textContent = ''; melding.classList.remove('is-rustig'); }
        waarde += c; tekenVakjes();
        live.textContent = `${waarde.length} van 4 cijfers`;
        if (waarde.length === 4) { const v = waarde; bezig = true; setTimeout(() => { if (!dicht) vier(v); }, 130); }
      }
      function wis() {
        if (bezig || dicht || blok || !waarde) return;
        waarde = waarde.slice(0, -1); tekenVakjes();
        live.textContent = waarde.length ? `${waarde.length} van 4 cijfers` : 'Leeg';
      }
      function stuurWachtwoord() {
        if (bezig || dicht || blok) return;
        const v = inp.value;
        if (!v) { zegFout('Vul het wachtwoord in.', false); inp.focus(); return; }
        stuur(v);
      }
      function opToets(e) {
        if (dicht) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return sluit(null); }
        if (e.key === 'Tab') return houdFocus(e, P);
        if (soort === 'wachtwoord' && e.key === 'Enter' && document.activeElement === inp) { e.preventDefault(); return stuurWachtwoord(); }
        if (!toetsen || e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault(); e.stopPropagation(); cijfer(e.key);
          const b = laag.querySelector(`[data-c="${e.key}"]`);
          if (b) { b.classList.add('is-druk'); setTimeout(() => b.classList.remove('is-druk'), 140); }
        } else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); wis(); }
      }
      laag.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || !laag.contains(b)) return;
        if (b.dataset.c !== undefined) return cijfer(b.dataset.c);
        if (b.hasAttribute('data-wis')) return wis();
        if (b.hasAttribute('data-annuleer')) return sluit(null);
        if (b.hasAttribute('data-open')) return stuurWachtwoord();
        if (b.hasAttribute('data-toon')) {
          const aan = inp.type === 'password';
          inp.type = aan ? 'text' : 'password';
          b.setAttribute('aria-pressed', aan ? 'true' : 'false');
          b.textContent = aan ? 'Verberg' : 'Toon';
          inp.focus();
        }
      });
      laag.addEventListener('paste', (e) => { if (toetsen) e.preventDefault(); });
      if (soort === 'wachtwoord') laag.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); stuurWachtwoord(); });
      // Achter het paneel schuift niets mee.
      laag.addEventListener('wheel', (e) => { if (!P.contains(e.target)) e.preventDefault(); }, { passive: false });
      laag.addEventListener('touchmove', (e) => { if (!P.contains(e.target)) e.preventDefault(); }, { passive: false });

      zetKop(o.kop, o.regel);
      document.body.appendChild(laag);
      const herstel = maakInert(laag);
      document.addEventListener('keydown', opToets, true);
      const api = { sluit: () => sluit(null) };
      openPaneel = api;
      requestAnimationFrame(() => { laag.classList.add('is-in'); try { (inp || kop).focus({ preventScroll: true }); } catch { /* geen focus mogelijk */ } });
      if (o.blok) blokkeer(o.blok);
    });
  }
  const sluitPaneel = () => { if (openPaneel) openPaneel.sluit(); };

  // Antwoord van de server → wat het paneel moet doen.
  function uitkomst(r) {
    const j = r.j || {};
    if (r.ok) return { ok: true, data: j };
    if (j.code === 'geblokkeerd') return { blok: { tot_ms: j.tot_ms, server_nu: j.server_nu, vraag: j.vraag }, fout: j.error };
    if (j.code === 'te_veel_pogingen') return { fout: j.error || 'Te veel pogingen vanaf dit netwerk. Wacht een kwartier.', vast: true, schud: false };
    if (j.code === 'geen_toegang' || j.code === 'profiel_onbekend' || j.code === 'profielen_uit' || j.code === 'profielen_inactief') return { sluit: true, fout: j.error };
    if (j.code === 'wachtwoord_ontbreekt') return { fout: j.error, vast: true, schud: false };
    if (r.status >= 500 || r.status === 0) return { fout: 'Er ging iets mis. Probeer het opnieuw.', schud: false };
    return { fout: j.error || 'Dat lukte niet. Probeer het opnieuw.' };
  }
  // Loopt de blokkade nog? → tijd (ja), null (nee) of undefined (onbekend). `tok` = het voortoken
  // van de kiezer; zonder `tok` gaat het over de eigen sessie.
  const blokVan = (soort, pid, tok) => async () => {
    try {
      const pad = `/api/admin/blokkade?soort=${soort}${pid ? `&profiel_id=${encodeURIComponent(pid)}` : ''}`;
      const r = await haal(pad, tok === undefined ? {} : { tok });
      return r.ok ? (r.j.tot_ms || null) : undefined;
    } catch { return undefined; }
  };
  const veilig = async (fn) => {
    try { return await fn(); }
    catch (e) { return e && e.message === 'Sessie verlopen' ? { sluit: true } : { fout: 'Geen verbinding. Probeer het opnieuw.', schud: false }; }
  };

  // ── De poort ─────────────────────────────────────────────────────────────
  async function poortVraag(wijk, geheim) {
    const body = { wijk };
    if (geheim != null) body[wijk === 'veiligheid' ? 'wachtwoord' : 'pas'] = geheim;
    const r = await vraag('/api/admin/poort', 'POST', body);
    if (r.ok && r.j.ok && ik && r.j.profielen_actief !== false) {
      if (r.j.server_nu) klok = r.j.server_nu - Date.now();
      ik.sessie = { wijk: r.j.wijk || wijk, wijk_tot_ms: r.j.wijk_tot_ms || null };
      if (r.j.pas) zetPas(r.j.pas);
      meld();
    } else if (!r.ok && ik && (r.j.code === 'pas_nodig' || r.j.code === 'wachtwoord_nodig')) {
      // De server zegt: zonder pas (of wachtwoord) gaat dit niet open. Dan is de pas dus koud.
      if (ik.sessie && ik.sessie.wijk === wijk) ik.sessie = { wijk: null, wijk_tot_ms: null };
      if (r.j.code === 'pas_nodig' && ik.pas && pasStand() === 'kwartier') ik.pas = { ...ik.pas, warm: false, warm_tot_ms: null };
      meld();
    }
    return r;
  }
  // Staat deze sessie volgens de server (nu nog) in deze wijk? Schuift de poort meteen op.
  async function staatIn(wijk) {
    if (!heeftProfiel()) return true;
    if (inWijk() !== wijk) return false;
    try { const r = await poortVraag(wijk); return !!(r.ok && r.j.ok); } catch { return false; }
  }
  // Probeer de poort ZONDER iets te typen: je staat er al, of je pas is warm en het poortje
  // scant hem. → 'binnen' | 'gescand' | false (dan is de pas of het wachtwoord nodig).
  // De server beslist; dit vraagt het alleen. Veiligheid gaat nooit open op een warme pas.
  async function scan(wijk) {
    if (!heeftProfiel()) return 'binnen';
    if (!magIn(wijk)) return false;
    const hier = inWijk() === wijk;
    if (!hier && (wijk === 'veiligheid' || pasStand() === 'elke_wijk')) return false;
    // Weet het scherm al dat de pas koud is, dan is vragen zinloos: de server zegt toch "pas nodig".
    if (!hier && pasStand() === 'kwartier' && !pasWarm()) return false;
    try {
      const r = await poortVraag(wijk);
      return r.ok && r.j.ok ? (r.j.gescand ? 'gescand' : 'binnen') : false;
    } catch { return false; }
  }
  // Wie kun je om toegang vragen? (De server geeft de namen alleen bij een geweigerde poort.)
  async function wieHelpt(wijk) {
    if (ik && Array.isArray(ik.vraag)) return ik.vraag;      // de server geeft de namen al mee met je profiel
    try { const r = await poortVraag(wijk); return Array.isArray(r.j.vraag) ? r.j.vraag : []; } catch { return []; }
  }
  // Het paneel bij een poort. → true als de sessie daarna in die wijk staat.
  async function poort(wijk, o = {}) {
    // Warme pas: geen paneel, het poortje scant hem zelf.
    if (!o.geenScan && await scan(wijk)) return true;
    const ww = wijk === 'veiligheid';
    return paneel({
      soort: ww ? 'wachtwoord' : 'pas', lamp: true, plaats: o.plaats, geenFocusTerug: o.geenFocusTerug, opOpen: o.opOpen,
      kop: o.kop || `Poort ${WIJKNAAM[wijk] || ''}`,
      regel: o.regel || (ww ? 'Hier heb je geen pas maar het wachtwoord van Veiligheid nodig.' : 'Toets je pas van 4 cijfers in.'),
      blokCheck: blokVan(ww ? 'veiligheid' : 'poort'),
      verstuur: (v) => veilig(async () => uitkomst(await poortVraag(wijk, v))),
    }).then(r => !!r);
  }
  // De server zei "poort dicht" midden in een scherm (admin.js: api()). Er is altijd maar
  // één paneel: verzoeken die tegelijk geweigerd werden wachten op dezelfde belofte.
  let heropenBezig = null, heropenNee = 0;
  function heropen(wijk, wijken) {
    if (heropenBezig) return heropenBezig;
    if (Date.now() - heropenNee < 1200) return Promise.resolve(false);   // net geannuleerd: niet meteen weer vragen
    const H = window.JVO_ADMIN_HUB;
    const hier = H && H.actief() ? H.route().afd : null;
    const lijst = Array.isArray(wijken) && wijken.length ? wijken : [wijk];
    const doel = hier && lijst.includes(hier) && magIn(hier) ? hier : wijk;
    const anders = !!hier && hier !== doel;
    const naam = WIJKNAAM[doel] || 'deze afdeling';
    heropenBezig = poort(doel, {
      kop: anders ? `Dit hoort bij ${naam}` : `De poort van ${naam} is dicht`,
      regel: doel === 'veiligheid' ? 'Vul het wachtwoord van Veiligheid in om door te gaan.' : 'Toets je pas in om door te gaan.',
    }).then((ok) => {
      heropenBezig = null;
      if (!ok) { heropenNee = Date.now(); return false; }
      // Met een warme pas loop je daarna vanzelf terug naar de afdeling waar je stond (terugNaarPlek).
      if (anders && !pasWarm()) toast(`Je bent nu in ${naam}. Ga je hier verder, dan vraagt deze afdeling weer je pas.`, 'info');
      const A = ADM();
      if (A && A.laadWijk) A.laadWijk(doel);
      return true;
    });
    return heropenBezig;
  }
  // Na een handeling die bij een ándere afdeling hoorde (api() van admin.js heeft de poort
  // daarvan geopend): met een warme pas loop je stil terug naar de afdeling waar je staat,
  // zodat wat je daar zag weer wordt geladen. Zonder warme pas gebeurt er niets.
  let terugBezig = false;
  async function terugNaarPlek() {
    const H = window.JVO_ADMIN_HUB, A = ADM();
    const hier = H && H.actief() ? H.route().afd : null;
    if (terugBezig || !hier || hier === 'veiligheid' || inWijk() === hier || !pasWarm() || !magIn(hier)) return;
    terugBezig = true;
    try { if (await scan(hier) && A && A.laadWijk) await A.laadWijk(hier); } catch { /* de poortbalk blijft dan staan */ }
    terugBezig = false;
  }
  async function sluitPoort() {
    try { await vraag('/api/admin/poort/sluit', 'POST', {}); } catch { /* de poort verloopt anders vanzelf */ }
    if (ik) { ik.sessie = { wijk: null, wijk_tot_ms: null }; meld(); }
  }
  // admin.js meldt een stille 403: de sessie staat dus niet (meer) in die wijk.
  function poortDicht(wijken) {
    if (!ik || !ik.sessie || !ik.sessie.wijk) return;
    const lijst = Array.isArray(wijken) ? wijken : [wijken];
    if (lijst.includes(ik.sessie.wijk)) { ik.sessie = { wijk: null, wijk_tot_ms: null }; meld(); }
  }
  function geenToegang(wijk) {
    if (!ik || !ik.toegang || !ik.toegang[wijk]) return;
    ik.toegang[wijk] = false;
    if (ik.sessie && ik.sessie.wijk === wijk) ik.sessie = { wijk: null, wijk_tot_ms: null };
    meld();
  }

  // ── Hartslag en aanwezigheid ─────────────────────────────────────────────
  function neemOver(j) {
    if (!ik || !j) return;
    const was = JSON.stringify([ik.sessie, ik.toegang, ik.profiel && ik.profiel.is_hoofd, ik.aanmaken, ik.pas, ik.geblokkeerd]);
    if (j.server_nu) klok = j.server_nu - Date.now();
    if (j.ok) ik.geblokkeerd = Array.isArray(j.geblokkeerd) ? j.geblokkeerd : undefined;   // wie er nu geblokkeerd is (alleen voor wie in Veiligheid mag)
    if (j.sessie) ik.sessie = j.sessie;
    if (j.pas) zetPas(j.pas);
    if (j.toegang) ik.toegang = j.toegang;
    if (ik.profiel && typeof j.is_hoofd === 'boolean') {
      ik.profiel.is_hoofd = j.is_hoofd;
      ik.mag = { ...(ik.mag || {}), aanwezigheid: j.is_hoofd || !!ik.profiel.is_eigenaar };
    }
    if (j.aanmaken) ik.aanmaken = j.aanmaken;
    if (was !== JSON.stringify([ik.sessie, ik.toegang, ik.profiel && ik.profiel.is_hoofd, ik.aanmaken, ik.pas, ik.geblokkeerd])) meld();
  }
  async function hartslag() {
    if (!token || !heeftProfiel() || document.hidden || !ADM()) return;
    // `invoer`: er is sinds de vorige slag getikt of getypt. Dat houdt een warme pas warm; een
    // scherm dat alleen open staat koelt af. Een verborgen of vergrendeld scherm meldt niets.
    const metInvoer = invoer;
    invoer = false;
    try {
      const r = await vraag('/api/admin/hartslag', 'POST', { plek: plek && plek === inWijk() ? plek : null, ...(metInvoer ? { invoer: true } : {}) });
      if (!r.ok) { invoer = invoer || metInvoer; return; }
      if (metInvoer) invoerGemeld = Date.now();
      neemOver(r.j);
      if (isHoofd()) {
        const was = JSON.stringify(aanwezig.map(a => [a.pid, a.plek]));
        await laadAanwezig();
        if (was !== JSON.stringify(aanwezig.map(a => [a.pid, a.plek]))) meld();
      }
    } catch { invoer = invoer || metInvoer; /* geen verbinding: de volgende slag probeert het weer */ }
  }
  // Tikken, typen of scrollen. Was het even stil, dan gaat het seintje meteen (zo blijft een pas
  // die bijna afloopt warm zodra je weer iets doet); anders reist het mee met de gewone hartslag.
  let invoerTimer = null;
  function opInvoer() {
    if (invoer) return;
    invoer = true;
    if (!token || !heeftProfiel() || invoerTimer || Date.now() - invoerGemeld < 30000) return;
    invoerTimer = setTimeout(() => { invoerTimer = null; hartslag(); }, 500);
  }
  for (const soort of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(soort, opInvoer, { capture: true, passive: true });
  function startSlag() {
    if (slagTimer) return;
    slagTimer = setInterval(hartslag, 20000);
    setTimeout(hartslag, 400);
  }
  function stopSlag() { clearInterval(slagTimer); slagTimer = null; clearTimeout(plekTimer); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) hartslag(); });
  function zetPlek(p) {
    p = WIJKEN.includes(p) ? p : null;
    if (p === plek) return;
    plek = p;
    clearTimeout(plekTimer);
    plekTimer = setTimeout(hartslag, 500);
  }
  async function laadAanwezig() {
    if (!isHoofd()) { aanwezig = []; return aanwezig; }
    try {
      const r = await vraag('/api/admin/aanwezigheid');
      if (!r.ok) { if (r.status === 403) aanwezig = []; return aanwezig; }
      if (r.j.server_nu) klok = r.j.server_nu - Date.now();
      const lijst = Array.isArray(r.j.aanwezig) ? r.j.aanwezig : [];
      // "sinds" komt van de server (gelijk voor elk hoofd, en het verspringt niet bij herladen);
      // hier alleen omgerekend naar de klok van dit toestel. Een oudere server stuurt het niet mee.
      for (const a of lijst) a.sinds_ms = Number(a.sinds_ms) > 0 ? Number(a.sinds_ms) - klok : null;
      aanwezig = lijst; aanwezigKlaar = true;
    } catch { /* laatst bekende lijst blijft staan */ }
    return aanwezig;
  }

  // ── Inloggen: modus, kiezer, pas ─────────────────────────────────────────
  const kaart = () => document.querySelector('#login .login-card');
  async function opLogin() {
    verbergKiezer();
    try {
      const r = await fetch('/api/admin/login/modus', { cache: 'no-store' });
      modus = r.ok ? !!(await r.json()).profielen : false;
    } catch { modus = null; }            // onbekend: het oude formulier blijft staan
    const k = kaart();
    if (!k) return;
    k.classList.toggle('pf-met-profielen', modus === true);
    const naam = $('admin-name');
    if (naam) {
      naam.required = modus !== true;
      const veld = naam.closest('.field');
      if (veld) veld.hidden = modus === true;
    }
    const uitleg = $('pf-login-uitleg');
    if (uitleg) uitleg.hidden = modus !== true;
    if (modus === true && $('login') && $('login').style.display !== 'none') { const c = $('admin-code'); if (c && document.activeElement === document.body) c.focus(); }
  }
  function verbergKiezer() {
    const k = kaart();
    if (k) k.classList.remove('pf-kiest');
    const el = $('pf-kiezer');
    if (el) el.hidden = true;
  }
  // Toon de kiezer in de inlogkaart. `tok` = het token waarmee gekozen wordt (voortoken, of
  // een oud token van vóór de profielen).
  function toonKiezer({ tok, profielen, aanmaken, tekst }) {
    const k = kaart();
    if (!k) return;
    voor = { tok, tot: Date.now() + 14 * 60000 };
    let el = $('pf-kiezer');
    if (!el) { el = document.createElement('div'); el.id = 'pf-kiezer'; el.className = 'pf-kiezer'; k.appendChild(el); }
    let laatst = 0;
    try { laatst = Number(localStorage.getItem('jvo_admin_pid')) || 0; } catch { /* geen opslag */ }
    const lijst = (Array.isArray(profielen) ? profielen : []).slice().sort((a, b) => (b.id === laatst) - (a.id === laatst) || String(a.naam).localeCompare(String(b.naam), 'nl'));
    el.innerHTML = `
      <h2 class="pf-k-kop" id="pf-k-kop" tabindex="-1">Wie ben je?</h2>
      <p class="pf-k-sub">${esc(tekst || 'Kies je profiel. Daarna toets je je pas van 4 cijfers in.')}</p>
      ${lijst.length ? `<ul class="pf-k-lijst" aria-labelledby="pf-k-kop">${lijst.map(p => `<li><button type="button" class="pf-k-knop" data-id="${esc(p.id)}">
          ${rondje(p, 'pf-rond-m')}
          <span class="pf-k-t">${p.id === laatst ? '<span class="pf-k-verder">Verder als</span>' : ''}<b>${esc(p.naam)}</b><span>${esc(p.functie || '')}</span></span>
          <span class="pf-k-p" aria-hidden="true">${IC.chev}</span>
        </button></li>`).join('')}</ul>` : '<p class="pf-k-leeg">Er zijn nog geen profielen.</p>'}
      ${aanmaken === 'dicht'
        ? '<p class="pf-k-dicht">Nieuwe profielen staan dicht. Vraag iemand die in Veiligheid mag om dat open te zetten.</p>'
        : `<button type="button" class="pf-k-nieuw" data-nieuw>${IC.plus}<span>Nieuw profiel maken</span></button>`}
      <button type="button" class="pf-k-terug" data-terug>${IC.terug}<span>Terug naar de admin-code</span></button>`;
    el.hidden = false;
    k.classList.add('pf-kiest');
    el.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-terug')) { voor = null; verbergKiezer(); const c = $('admin-code'); if (c) { c.value = ''; c.focus(); } return; }
      if (b.hasAttribute('data-nieuw')) {
        const r = await profielVenster({ tok });
        if (r === 'kiezer') return herlaadKiezer(tok);
        if (r && r.token) klaarMetInloggen(r, tok);
        return;
      }
      const p = lijst.find(x => String(x.id) === b.dataset.id);
      if (p) kies(p, tok);
    };
    setTimeout(() => { try { $('pf-k-kop').focus({ preventScroll: true }); } catch { /* geen focus */ } }, 40);
  }
  async function herlaadKiezer(tok, tekst) {
    try {
      const r = await haal('/api/admin/profielen', { tok });
      if (r.ok && r.j.actief !== false) return toonKiezer({ tok, profielen: r.j.profielen, aanmaken: r.j.aanmaken, tekst });
    } catch { /* geen verbinding: terug naar het codeveld */ }
    naarCode('Vul de admin-code opnieuw in.');
  }
  function naarCode(tekst) {
    voor = null;
    verbergKiezer();
    const al = $('login-alert');
    if (al && tekst) { al.innerHTML = '<div class="alert error"></div>'; al.firstChild.textContent = tekst; }
    const c = $('admin-code');
    if (c) c.focus();
  }
  async function kies(p, tok) {
    const stuur = (body) => veilig(async () => {
      const r = await haal('/api/admin/profielen/kies', { method: 'POST', tok, body });
      if (r.ok) return { ok: true, data: r.j };
      if (r.j.code === 'nieuwe_pas_nodig') return { ok: true, data: { tijdelijk: body.pas } };
      if (r.status === 401) return { sluit: true, fout: 'Dat duurde te lang. Vul de admin-code opnieuw in.', code: true };
      return uitkomst(r);
    });
    let res = await paneel({ soort: 'pas', profiel: p, kop: `Hoi ${p.naam}`, regel: 'Toets je pas van 4 cijfers in.', blokCheck: blokVan('kiezer', p.id, tok), verstuur: (pas) => stuur({ profiel_id: p.id, pas }) });
    if (res && res.tijdelijk) {
      const oud = res.tijdelijk;
      res = await paneel({
        soort: 'kies', profiel: p, kop: 'Kies nu je eigen pas', regel: 'Je pas is opnieuw ingesteld. Kies zelf een nieuwe pas van 4 cijfers.',
        verstuur: (nw) => stuur({ profiel_id: p.id, pas: oud, nieuwe_pas: nw, nieuwe_pas2: nw }),
      });
    }
    if (res && res.token) return klaarMetInloggen(res, tok);
    if (res === null) {
      // Geannuleerd of afgebroken: is het voortoken verlopen of het profiel weg, dan de lijst verversen.
      try {
        const r = await haal('/api/admin/profielen', { tok });
        if (r.status === 401) return naarCode('Dat duurde te lang. Vul de admin-code opnieuw in.');
        const lijst = r.ok && Array.isArray(r.j.profielen) ? r.j.profielen : null;
        if (lijst && !lijst.some(x => x.id === p.id)) toonKiezer({ tok, profielen: lijst, aanmaken: r.j.aanmaken });
      } catch { /* geen verbinding: de kiezer blijft staan */ }
    }
  }
  function klaarMetInloggen(j, tok) {
    if (tok) voor = { tok, tot: (voor && voor.tok === tok && voor.tot) || Date.now() + 10 * 60000 };
    verbergKiezer();
    const A = ADM();
    token = j.token;
    if (j.ik) zetIk(j.ik);
    if (A && A.startSessie) A.startSessie(j.token, j.naam || (j.ik && j.ik.naam) || '');
  }
  // 401 "profiel_nodig": er zijn (nu) profielen en dit token heeft er geen. Het token
  // werkt nog wel als voortoken voor de kiezer.
  async function profielNodig(tok) {
    await opLogin();
    await herlaadKiezer(tok, 'Er zijn nu profielen. Kies je profiel of maak er een.');
  }
  // Antwoord van POST /api/admin/login met kies_profiel (admin.js: inlogformulier).
  function naLogin(j) {
    toonKiezer({ tok: j.voortoken, profielen: j.profielen, aanmaken: j.aanmaken });
  }
  async function uitlogServer(tok) {
    const t = tok || token;
    if (!t) return;
    try { await fetch('/api/admin/uitloggen', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'x-admin-token': t }, body: '{}' }); }
    catch { /* de sessie verloopt anders vanzelf */ }
  }
  // Wissel van profiel: de server stopt deze sessie en geeft de kiezer terug (met een vers
  // voortoken), dus je komt altijd bij "Wie ben je?" uit, hoe lang de pagina ook open stond.
  // Lukt dat niet (oudere server, geen verbinding), dan zoals vroeger: uitloggen.
  async function wisselProfiel() {
    const A = ADM();
    const v = voor && voor.tot > Date.now() ? voor.tok : null;
    sluitKaart();
    let r = null;
    if (token && heeftProfiel()) { try { r = await haal('/api/admin/profielen/wissel', { method: 'POST', body: {} }); } catch { r = null; } }
    if (r && r.ok && r.j.voortoken && A && A.naarLogin) {
      A.naarLogin('');                 // lokaal uit: de sessie is op de server al gestopt
      zetToken(null);
      toonKiezer({ tok: r.j.voortoken, profielen: r.j.profielen, aanmaken: r.j.aanmaken });
      return;
    }
    if (A && A.uitloggen) await A.uitloggen();
    if (v) herlaadKiezer(v);
  }

  // ── Nieuw profiel (ook: het allereerste, de eigenaar) ────────────────────
  function sterkte(ww) {
    const n = [...ww].length;
    if (!n) return { n: 0, tekst: `Minstens ${WW_MIN} tekens.` };
    if (n < WW_MIN) return { n: 1, tekst: `Te kort: nog ${WW_MIN - n} ${WW_MIN - n === 1 ? 'teken' : 'tekens'}.` };
    if (new TextEncoder().encode(ww).length > 72) return { n: 1, tekst: 'Te lang: hooguit 72 tekens.' };
    const soorten = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(ww)).length;
    if (n >= 14 && soorten >= 2 || soorten >= 3 && n >= 12) return { n: 3, tekst: 'Sterk wachtwoord.' };
    return { n: 2, tekst: 'Goed genoeg. Sterker wordt het met meer tekens, of een zin van een paar woorden.' };
  }
  function profielVenster({ tok, eerste, naam }) {
    return new Promise((klaar) => {
      const vorig = document.activeElement;
      const laag = document.createElement('div');
      laag.className = 'pf-laag pf-plaats-venster pf-laag-form';
      const kleur0 = KLEUREN[Math.floor(Math.random() * KLEUREN.length)];
      // De alinea over meldingen zegt alleen iets tegen wie al eerder met een naam inlogde.
      let hadNaam = !!eerste;
      try { hadNaam = hadNaam || !!(localStorage.getItem('jvo_admin_name') || '').trim(); } catch { /* geen opslag */ }
      laag.innerHTML = `
        <form class="pf-form" role="dialog" aria-modal="true" aria-labelledby="pf-f-kop" novalidate autocomplete="off">
          <div class="pf-f-rol">
            <div class="pf-oog">${eerste ? 'Profielen starten' : 'Nieuw profiel'}</div>
            <h2 class="pf-f-kop" id="pf-f-kop" tabindex="-1">${eerste ? 'Jij wordt eigenaar' : 'Maak je profiel'}</h2>
            <p class="pf-f-sub">${eerste
              ? 'Vanaf nu kiest iedereen na de admin-code een profiel en een pas van 4 cijfers. Wie nu is ingelogd, maakt bij zijn volgende klik een profiel. Jij wordt eigenaar: je mag overal in en beheert vanuit Veiligheid wie waar mag komen.'
              : 'Met je profiel en je pas van 4 cijfers log je voortaan in. Tussen de afdelingen toets je je pas opnieuw in.'}</p>
            <div class="pf-f-wie">
              <span data-voorbeeld>${rondje({ naam: naam || '', kleur: kleur0 }, 'pf-rond-g')}</span>
              <div class="pf-f-velden">
                <label class="pf-label" for="pf-f-naam">Je naam</label>
                <input class="pf-veld" id="pf-f-naam" type="text" maxlength="40" autocomplete="off" value="${esc(naam || '')}" placeholder="Bijv. Sanne" />
              </div>
            </div>
            <label class="pf-label" for="pf-f-functie">Je functie</label>
            <input class="pf-veld" id="pf-f-functie" type="text" maxlength="40" autocomplete="off" placeholder="Bijv. Hoofd Toernooien" />
            <div class="pf-f-sug" role="group" aria-label="Veelgebruikte functies">${FUNCTIES.map(f => `<button type="button" class="pf-chip" data-functie="${esc(f)}">${esc(f)}</button>`).join('')}</div>
            <fieldset class="pf-f-kleur"><legend class="pf-label">Kleur van je rondje</legend>
              <div class="pf-kleuren">${KLEUREN.map(k => `<label class="pf-kleur" title="${esc(KLEURNAAM[k])}"><input type="radio" name="pf-kleur" value="${k}"${k === kleur0 ? ' checked' : ''} /><span class="pf-rond pf-k-${k}" aria-hidden="true"></span><span class="pf-sr">${esc(KLEURNAAM[k])}</span></label>`).join('')}</div>
            </fieldset>
            <div class="pf-f-pas">
              <span class="pf-label" id="pf-f-pas-l">Je pas van 4 cijfers</span>
              <div class="pf-f-pas-rij">
                <span class="pf-vakjes pf-vakjes-klein" aria-hidden="true" data-pasvak>${'<span><i></i></span>'.repeat(4)}</span>
                <span class="pf-f-pas-s" data-pas-status>Nog niet gekozen</span>
                <button type="button" class="pf-knop pf-knop-rustig" data-kies aria-describedby="pf-f-pas-l">Kies je pas</button>
              </div>
              <p class="pf-f-klein">Je toetst hem twee keer in. Onthoud hem goed: alleen iemand van Veiligheid kan hem opnieuw instellen.</p>
            </div>
            ${eerste ? `<fieldset class="pf-f-ww"><legend class="pf-label">Wachtwoord van Veiligheid</legend>
              <p class="pf-f-klein">De afdeling Veiligheid (logboek, back-ups, profielen) gaat niet open met een pas maar met dit wachtwoord. Kies iets anders dan de admin-code.</p>
              <label class="pf-label" for="pf-f-ww">Wachtwoord</label>
              <div class="pf-ww-rij"><input class="pf-veld" id="pf-f-ww" type="password" autocomplete="new-password" maxlength="100" aria-describedby="pf-f-sterk" />
                <button type="button" class="pf-toon" data-toon aria-pressed="false">Toon</button></div>
              <div class="pf-sterk" data-sterk="0"><span class="pf-sterk-b" aria-hidden="true"><i></i><i></i><i></i></span><span id="pf-f-sterk" aria-live="polite">Minstens ${WW_MIN} tekens.</span></div>
              <label class="pf-label" for="pf-f-ww2">Nog een keer</label>
              <input class="pf-veld" id="pf-f-ww2" type="password" autocomplete="new-password" maxlength="100" />
              <p class="pf-f-klein">Tip: geef daarna één ander profiel toegang tot Veiligheid en vertel die het wachtwoord. Dan kan een vergeten pas ook worden hersteld als jij er niet bent.</p>
            </fieldset>` : ''}
            <div class="pf-f-zicht">
              ${hadNaam ? '<p><b>Meldingen.</b> Had je een mail of pushmelding aan staan bij nieuwe aanmeldingen? Die hingen aan de naam waarmee je inlogde en gelden niet voor je profiel. Zet ze daarna opnieuw aan bij Communicatie, Mijn notificaties.</p>' : ''}
              <p><b>Goed om te weten.</b> ${esc(ZICHTBAAR)}</p>
            </div>
            <p class="pf-f-fout" role="alert" data-fout></p>
          </div>
          <div class="pf-f-k">
            <label class="pf-vink pf-vink-balk"><input type="checkbox" id="pf-f-gezien" /><span>Begrepen</span></label>
            <button type="button" class="pf-knop pf-knop-rustig" data-annuleer>Annuleer</button>
            <button type="submit" class="pf-knop" data-maak>${eerste ? 'Start met profielen' : 'Maak profiel'}</button>
          </div>
        </form>`;
      const F = laag.querySelector('form');
      const q = (s) => laag.querySelector(s);
      const fout = q('[data-fout]');
      let pas = null, bezig = false, force = false, dicht = false;
      const sluit = (res) => {
        if (dicht) return;
        dicht = true; pas = null;
        document.removeEventListener('keydown', opToets, true);
        herstel(); laag.remove();
        if (vorig && vorig.isConnected && typeof vorig.focus === 'function') { try { vorig.focus({ preventScroll: true }); } catch { /* geen focus */ } }
        klaar(res);
      };
      const opToets = (e) => {
        if (laag.inert) return;                      // het cijferpaneel ligt eroverheen
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sluit(null); }
        else houdFocus(e, F);
      };
      const tekenVoorbeeld = () => {
        const k = (F.querySelector('input[name="pf-kleur"]:checked') || {}).value || kleur0;
        q('[data-voorbeeld]').innerHTML = rondje({ naam: q('#pf-f-naam').value, kleur: k }, 'pf-rond-g');
      };
      // De melding staat direct onder het veld waar hij over gaat (en dus in beeld), niet onderaan.
      const foutThuis = fout.parentNode;
      const zegFout = (t, veld) => {
        fout.textContent = t || '';
        laag.querySelectorAll('.is-fout').forEach(x => x.classList.remove('is-fout'));
        if (!t) return;
        const inBalk = !!(veld && veld.closest('.pf-f-k'));
        const anker = veld && !inBalk ? (veld.closest('.pf-ww-rij, .pf-f-pas-rij') || veld) : null;
        if (anker) anker.insertAdjacentElement('afterend', fout); else foutThuis.appendChild(fout);
        if (veld) {
          (veld.closest('.pf-vink') || veld).classList.add('is-fout');
          try { veld.focus({ preventScroll: true }); } catch { /* geen focus */ }
        }
        try { fout.scrollIntoView({ block: inBalk || !veld ? 'nearest' : 'center' }); } catch { /* oudere browser */ }
      };
      q('#pf-f-naam').addEventListener('input', tekenVoorbeeld);
      F.addEventListener('change', (e) => { if (e.target.name === 'pf-kleur') tekenVoorbeeld(); });
      const ww = q('#pf-f-ww');
      if (ww) ww.addEventListener('input', () => { const s = sterkte(ww.value); q('.pf-sterk').dataset.sterk = String(s.n); q('#pf-f-sterk').textContent = s.tekst; });
      laag.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b || bezig) return;
        if (b.hasAttribute('data-annuleer')) return sluit(null);
        if (b.dataset.functie) { q('#pf-f-functie').value = b.dataset.functie; q('#pf-f-functie').focus(); return; }
        if (b.hasAttribute('data-toon')) {
          const aan = ww.type === 'password';
          ww.type = aan ? 'text' : 'password'; q('#pf-f-ww2').type = ww.type;
          b.setAttribute('aria-pressed', aan ? 'true' : 'false'); b.textContent = aan ? 'Verberg' : 'Toon';
          return;
        }
        if (b.hasAttribute('data-kies')) {
          const v = await paneel({ soort: 'kies', kop: 'Kies je pas', regel: 'Toets 4 cijfers in die je goed kunt onthouden.' });
          if (dicht) return;
          if (typeof v === 'string') {
            pas = v;
            q('[data-pasvak]').querySelectorAll('span').forEach(s => s.classList.add('is-vol'));
            q('[data-pas-status]').textContent = 'Pas gekozen';
            b.textContent = 'Kies een andere';
            if (fout.textContent.includes('pas')) fout.textContent = '';
          }
        }
      });
      F.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (bezig) return;
        const naamV = q('#pf-f-naam').value.trim().replace(/\s+/g, ' '), functie = q('#pf-f-functie').value.trim().replace(/\s+/g, ' ');
        if ([...naamV].length < 2) return zegFout('Vul je naam in (minstens 2 tekens).', q('#pf-f-naam'));
        if ([...functie].length < 2) return zegFout('Vul je functie in, of tik op een van de voorbeelden.', q('#pf-f-functie'));
        if (!pas) return zegFout('Kies eerst je pas van 4 cijfers.', q('[data-kies]'));
        const body = { naam: naamV, functie, kleur: (F.querySelector('input[name="pf-kleur"]:checked') || {}).value || kleur0, pas, pas2: pas, zichtbaar_gezien: true };
        if (eerste) {
          const a = ww.value, b2 = q('#pf-f-ww2').value;
          if (sterkte(a).n < 2) return zegFout(`Het wachtwoord van Veiligheid moet minstens ${WW_MIN} tekens zijn (hooguit 72).`, ww);
          if (a !== b2) return zegFout('De twee wachtwoorden zijn niet gelijk.', q('#pf-f-ww2'));
          body.veiligheid_wachtwoord = a; body.veiligheid_wachtwoord2 = b2;
          if (force) body.force = true;
        }
        if (!q('#pf-f-gezien').checked) return zegFout('Vink eerst “Begrepen” aan.', q('#pf-f-gezien'));
        bezig = true; fout.textContent = '';
        const knop = q('[data-maak]'), tekst = knop.textContent;
        knop.disabled = true; knop.textContent = 'Bezig…';
        let r;
        try { r = await haal('/api/admin/profielen', { method: 'POST', tok, body }); }
        catch { r = { ok: false, status: 0, j: { error: 'Geen verbinding. Probeer het opnieuw.' } }; }
        bezig = false; knop.disabled = false; knop.textContent = tekst;
        if (dicht) return;
        if (r.ok && r.j.token) return sluit(r.j);
        const c = r.j.code;
        if (c === 'toernooi_live') { force = true; knop.textContent = 'Toch doen'; return zegFout('Er loopt nu een toernooi. Wie is ingelogd moet bij de volgende klik een profiel maken. Wil je het toch nu doen, tik dan op “Toch doen”.'); }
        if (c === 'al_gestart') { toast(r.j.error || 'Iemand anders heeft de profielen net gestart.', 'info'); return sluit('kiezer'); }
        if (r.status === 401) { toast('Dat duurde te lang. Vul de admin-code opnieuw in.', 'error'); return sluit('code'); }
        if (c === 'pas_te_makkelijk' || c === 'pas_ongeldig' || c === 'pas_ongelijk') { pas = null; q('[data-pasvak]').querySelectorAll('span').forEach(s => s.classList.remove('is-vol')); q('[data-pas-status]').textContent = 'Nog niet gekozen'; }
        zegFout(r.j.error || 'Dat lukte niet. Probeer het opnieuw.', c === 'naam_bezet' || c === 'naam_ongeldig' ? q('#pf-f-naam') : c === 'functie_ongeldig' ? q('#pf-f-functie') : c && c.startsWith('wachtwoord') ? ww : null);
      });
      document.body.appendChild(laag);
      const herstel = maakInert(laag);
      document.addEventListener('keydown', opToets, true);
      requestAnimationFrame(() => { laag.classList.add('is-in'); try { (naam ? q('#pf-f-functie') : q('#pf-f-naam')).focus({ preventScroll: true }); } catch { /* geen focus */ } });
    });
  }
  // De allereerste: vanuit de hub, met het token van de gewone login.
  async function startEerste() {
    const A = ADM();
    const naam = (ik && ik.naam) || ($('who') || {}).textContent || '';
    const r = await profielVenster({ tok: token, eerste: true, naam });
    if (r === 'kiezer') { if (A && A.naarLogin) A.naarLogin(''); return profielNodig(token); }
    if (r && r.token) { toast('De profielen staan aan. Jij bent eigenaar. Zet je meldingen opnieuw aan bij Communicatie.', 'success'); klaarMetInloggen(r, null); }
  }

  // ── Je eigen pasje ───────────────────────────────────────────────────────
  let kaartOpen = null;
  function tekenPasje() {
    const wie = document.querySelector('#dash .who');
    if (!wie) return;
    // "Ingelogd als <naam>" één keer in een eigen element zetten, zodat het pasje die plek kan overnemen.
    if (!wie.querySelector('.pf-wie')) {
      const b = $('who');
      const w = document.createElement('span');
      w.className = 'pf-wie';
      const eerste = wie.firstChild;
      if (eerste && eerste.nodeType === 3 && b) { wie.insertBefore(w, eerste); w.appendChild(eerste); w.appendChild(b); }
    }
    let knop = $('pf-pasje');
    if (!heeftProfiel()) { if (knop) knop.remove(); wie.classList.remove('pf-heeft-pasje'); sluitKaart(); return; }
    const p = ik.profiel;
    if (!knop) {
      knop = document.createElement('button');
      knop.type = 'button'; knop.id = 'pf-pasje'; knop.className = 'pf-pasje';
      knop.setAttribute('aria-haspopup', 'dialog'); knop.setAttribute('aria-expanded', 'false');
      knop.addEventListener('click', () => (kaartOpen ? sluitKaart() : openKaart()));
      wie.appendChild(knop);
    }
    const pt = pasTekst(), koud = pasStand() === 'kwartier' && !pasWarm();
    const html = `${rondje(p, 'pf-rond-m')}<span class="pf-pasje-t"><b>${esc(p.naam)}</b><span class="pf-pasje-f">${esc(p.functie || '')}</span>${pt ? `<span class="pf-pasje-pas${koud ? ' is-koud' : ''}"><i aria-hidden="true"></i>${esc(pt)}</span>` : ''}</span>`;
    if (knop.__pf !== html) { knop.__pf = html; knop.innerHTML = html; }
    knop.setAttribute('aria-label', `Jouw pasje: ${p.naam}${p.functie ? `, ${p.functie}` : ''}${pt ? `, ${pt}` : ''}`);
    wie.classList.add('pf-heeft-pasje');
    if (kaartOpen) tekenKaart();
  }
  function tekenKaart() {
    if (!kaartOpen || !heeftProfiel()) return;
    const p = ik.profiel, nu = inWijk();
    const tot = nu && ik.sessie.wijk_tot_ms ? new Date(ik.sessie.wijk_tot_ms - klok) : null;
    const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const st = pasStand(), warm = pasWarm();
    const pasZin = st === 'kwartier'
      ? (warm ? `<b>Je pas is actief tot ${esc(klokTijd(ik.pas.warm_tot_ms))}.</b> Zolang je bezig bent schuift dat mee: de poortjes scannen hem vanzelf. Na een kwartier niets doen toets je hem opnieuw in.`
        : '<b>Je pas is verlopen.</b> Bij de volgende afdeling toets je hem opnieuw in; daarna gaat het weer vanzelf.')
      : st === 'inloggen' ? '<b>Je pas is actief tot je uitlogt.</b> De poortjes scannen hem vanzelf.'
      : 'Elke afdeling vraagt je pas bij het poortje.';
    const hoe = (w) => (w === 'veiligheid' ? 'met wachtwoord' : st !== 'elke_wijk' && warm ? 'gaat vanzelf open' : 'met je pas');
    const html = `
      <div class="pf-kaart-kop">${rondje(p, 'pf-rond-g')}<div><h2 id="pf-kaart-naam" tabindex="-1">${esc(p.naam)}</h2><p>${esc(p.functie || '')}</p>
        ${p.is_eigenaar ? '<span class="pf-label-s">Eigenaar</span>' : p.is_hoofd ? '<span class="pf-label-s">Hoofd</span>' : ''}</div></div>
      <h3 class="pf-kaart-t">Waar je in mag</h3>
      <ul class="pf-wijken">${WIJKEN.map(w => {
        const mag = !!(ik.toegang && ik.toegang[w]);
        return `<li class="${mag ? 'is-mag' : 'is-dicht'}${nu === w ? ' is-nu' : ''}"><span class="pf-wijk-i" aria-hidden="true">${mag ? IC.vink : IC.slot}</span><span>${esc(WIJKNAAM[w])}</span><em>${nu === w ? (w === 'veiligheid' || st === 'elke_wijk' ? `poort open${tot ? ` tot ${hm(tot)}` : ''}` : 'hier ben je nu') : mag ? hoe(w) : 'geen toegang'}</em></li>`;
      }).join('')}</ul>
      <p class="pf-kaart-pas${st === 'kwartier' && !warm ? ' is-koud' : ''}">${pasZin}</p>
      <p class="pf-kaart-zin">Zichtbaar voor hoofden: in welke afdeling je de admin nu open hebt.</p>
      <div class="pf-kaart-kleur" role="group" aria-label="Kleur van je rondje">${KLEUREN.map(k => `<button type="button" class="pf-kleurknop${kleurVan(p.kleur) === k ? ' is-nu' : ''}" data-kleur="${k}" aria-pressed="${kleurVan(p.kleur) === k}" aria-label="${esc(KLEURNAAM[k])}" title="${esc(KLEURNAAM[k])}"><span class="pf-rond pf-k-${k}" aria-hidden="true"></span></button>`).join('')}</div>
      <div class="pf-kaart-k">
        <button type="button" class="pf-knop pf-knop-rustig" data-pas>Pas wijzigen</button>
        <button type="button" class="pf-knop pf-knop-rustig" data-wissel>Wissel van profiel</button>
        <button type="button" class="pf-knop" data-uit>Uitloggen</button>
      </div>`;
    if (kaartOpen.__pf !== html) { kaartOpen.__pf = html; kaartOpen.innerHTML = html; }
  }
  function openKaart() {
    const knop = $('pf-pasje'), wie = document.querySelector('#dash .who');
    if (!knop || !wie || kaartOpen) return;
    const el = document.createElement('div');
    el.className = 'pf-kaart'; el.id = 'pf-kaart';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'pf-kaart-naam');
    wie.appendChild(el);
    kaartOpen = el;
    tekenKaart();
    knop.setAttribute('aria-expanded', 'true');
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.kleur) {
        try { const r = await vraag('/api/admin/ik', 'PUT', { kleur: b.dataset.kleur }); if (r.ok && r.j.ik) zetIk(r.j.ik); else toast(r.j.error || 'Dat lukte niet.', 'error'); }
        catch { toast('Geen verbinding. Probeer het opnieuw.', 'error'); }
        const nieuw = kaartOpen && kaartOpen.querySelector('.pf-kleurknop.is-nu');
        if (nieuw) nieuw.focus();
        return;
      }
      if (b.hasAttribute('data-pas')) { sluitKaart(); return wijzigPas(); }
      if (b.hasAttribute('data-wissel')) return wisselProfiel();
      if (b.hasAttribute('data-uit')) { sluitKaart(); const A = ADM(); if (A && A.uitloggen) A.uitloggen(); }
    });
    setTimeout(() => { document.addEventListener('pointerdown', buitenKaart, true); document.addEventListener('keydown', toetsKaart, true); }, 0);
    try { $('pf-kaart-naam').focus({ preventScroll: true }); } catch { /* geen focus */ }
  }
  function buitenKaart(e) { if (kaartOpen && !kaartOpen.contains(e.target) && !e.target.closest('#pf-pasje')) sluitKaart(); }
  function toetsKaart(e) {
    if (!kaartOpen || openPaneel) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sluitKaart(true); }
    else houdFocus(e, kaartOpen);
  }
  function sluitKaart(focusTerug) {
    if (!kaartOpen) return;
    document.removeEventListener('pointerdown', buitenKaart, true);
    document.removeEventListener('keydown', toetsKaart, true);
    kaartOpen.remove(); kaartOpen = null;
    const knop = $('pf-pasje');
    if (knop) { knop.setAttribute('aria-expanded', 'false'); if (focusTerug) knop.focus(); }
  }
  async function wijzigPas() {
    // Stap 1: de huidige pas wordt meteen door de server getoetst (zelfde teller als elke
    // pascontrole), zodat je een tikfout direct hoort en niet pas na twee keer een nieuwe pas.
    const oud = await paneel({
      soort: 'pas', profiel: ik && ik.profiel, kop: 'Pas wijzigen', regel: 'Toets eerst je huidige pas in.',
      verstuur: (v) => veilig(async () => {
        const r = await vraag('/api/admin/ik/pas', 'POST', { pas: v, alleen_toets: true });
        if (r.ok && r.j.toets) return { ok: true, data: v };
        // Een oudere server kent de toets niet (die mist dan de nieuwe pas): dan pas aan het eind controleren.
        if (r.status === 400 && r.j.code === 'pas_ongeldig') return { ok: true, data: v };
        return uitkomst(r);
      }),
    });
    if (typeof oud !== 'string') return;
    const ok = await paneel({
      soort: 'kies', profiel: ik && ik.profiel, kop: 'Kies je nieuwe pas', regel: 'Toets 4 cijfers in die je goed kunt onthouden.',
      verstuur: (nw) => veilig(async () => {
        const r = await vraag('/api/admin/ik/pas', 'POST', { pas: oud, nieuwe_pas: nw, nieuwe_pas2: nw });
        if (r.ok) return { ok: true };
        if (r.j.code === 'pas_fout') return { sluit: true, fout: `Je huidige pas klopte niet. ${String(r.j.error || '').replace(/^Die pas klopt niet\.\s*/, '')}`.trim() };
        return uitkomst(r);
      }),
    });
    if (ok) toast('Je pas is gewijzigd. Op andere toestellen ben je uitgelogd.', 'success');
  }

  // ── Balk bovenin: noodrem en noodherstel ─────────────────────────────────
  function tekenBalk() {
    const dash = $('dash');
    if (!dash) return;
    let el = $('pf-balk');
    const regels = [];
    if (ik && ik.profielen_uit) regels.push('De profielen staan uit (noodrem op de server). Iedereen met de admin-code kan nu overal in. Haal PROFIELEN_UIT weg bij de hosting om ze weer aan te zetten.');
    if (ik && ik.herstel_env) regels.push('Het noodherstel staat nog in de serverinstellingen. Haal het daar weg.');
    if (!regels.length) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'pf-balk'; el.className = 'pf-balk'; el.setAttribute('role', 'status');
      // In hub-modus staat .who in de bovenbalk: dan komt de balk direct onder die bovenbalk.
      const wie = dash.querySelector('.who');
      const anker = wie && wie.parentNode === dash ? wie : dash.querySelector(':scope > .topbar');
      if (anker && anker.nextSibling) dash.insertBefore(el, anker.nextSibling); else dash.appendChild(el);
    }
    const html = regels.map(t => `<p>${esc(t)}</p>`).join('');
    if (el.__pf !== html) { el.__pf = html; el.innerHTML = html; }
  }

  window.JVO_PAS = {
    // staat
    actief, heeftProfiel, isHoofd, magIn, inWijk, ik: () => ik, nuServer, modus: () => modus,
    pasStand, pasWarm, pasTekst, klokTijd,
    opIk: (fn) => { if (typeof fn === 'function') horen.push(fn); },
    // sessie
    zetToken, laadIk, zetIk, opLogin, naLogin, profielNodig, uitlogServer, startEerste,
    // poort en paneel
    paneel, sluitPaneel, poort, scan, heropen, terugNaarPlek, staatIn, wieHelpt, sluitPoort, poortDicht, geenToegang,
    // aanwezigheid
    zetPlek, hartslag, laadAanwezig, aanwezig: () => aanwezig, aanwezigKlaar: () => aanwezigKlaar,
    // tekenhulpen voor de hub
    rondje, esc, WIJKEN, WIJKNAAM, KLEUREN, KLEURNAAM,
  };
})();
