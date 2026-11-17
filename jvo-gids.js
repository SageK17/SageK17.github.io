// JVO Smart als gids — gedeelde bouwstenen voor de pagina's die hem tonen:
// de eenvoudige admin (admin-eenvoudig.js), Mijn team (mijn.js), de voordeur (app.js) en
// het bord (sporten.js).
//
// DE SERVER REKENT, DE PAGINA TOONT. Welke stap nu telt, wat er klaar is en elke zin komt
// uit smartgids.js (GET /api/admin/smart/gids, `gids` op de kaart van /api/mijn en in het
// antwoord van aanmelden, `smart` in /api/competitions, `regel` in /api/hub). Hier staat
// alleen wat een browser moet doen: tekenen in één stem en één stijl (jvo-smart.css), "om
// 15:20" omzetten naar "over 12 min", en per toestel onthouden wat je zelf hebt afgevinkt
// of weggeklikt. Staat een helper uit, dan stuurt de server het veld niet mee en tekent
// dit bestand niets.
//
// Opslag op het toestel (alles via try/catch; zonder opslag komt een stap gewoon terug):
//   jvo_gids_zelf  { "<teamcode>:<stap>": 1|2 }   wat een deelnemer zelf afvinkte (1) of oversloeg (2).
//                  Op teamcode en niet op nummer: na een schone start beginnen de nummers opnieuw,
//                  en dan zou een nieuw team de vinkjes van een oud team erven.
//   jvo_gids_weg   { "<plek>": "<sleutel>" }   een weggeklikte hint; komt terug als de sleutel verandert
//
// Regel: elke tekst van de server gaat door esc() voordat hij in innerHTML belandt.
(() => {
  'use strict';
  if (window.JVO_GIDS) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // De Duif: dezelfde getracede JVO-duif als in de rest van JVO Smart (viewBox 80×39).
  const DUIF = '<svg viewBox="0 0 80 39" fill="currentColor" aria-hidden="true"><path d="M71.88 0.38 L75.13 0.63 L77.19 1.13 L78.06 1.88 L77.75 2.88 L76.25 4.13 L74.75 5.63 L73.25 7.38 L71.75 9.38 L70.25 11.63 L68.38 13.94 L66.13 16.31 L63.50 18.75 L60.50 21.25 L58.69 23.38 L58.06 25.13 L58.63 26.50 L60.38 27.50 L61.81 28.44 L62.94 29.31 L63.75 30.13 L64.25 30.88 L64.00 31.50 L63.00 32.00 L61.25 32.38 L58.75 32.63 L56.06 33.19 L53.19 34.06 L50.13 35.25 L46.88 36.75 L43.63 37.75 L40.38 38.25 L37.13 38.25 L33.88 37.75 L30.44 36.81 L26.81 35.44 L23.00 33.63 L19.00 31.38 L15.81 29.69 L13.44 28.56 L11.88 28.00 L11.13 28.00 L10.88 27.56 L11.13 26.69 L11.88 25.38 L13.13 23.63 L13.13 21.31 L11.88 18.44 L9.38 15.00 L5.63 11.00 L3.81 8.06 L3.94 6.19 L6.00 5.38 L10.00 5.63 L14.44 6.75 L19.31 8.75 L24.63 11.63 L30.38 15.38 L35.63 17.19 L40.38 17.06 L44.63 15.00 L48.38 11.00 L51.94 7.75 L55.31 5.25 L58.50 3.50 L61.50 2.50 L63.81 1.69 L65.44 1.06 L66.38 0.63 L66.63 0.38 L67.63 0.25 L69.38 0.25 Z"/></svg>';
  const VINK = '<svg class="jvs-vink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const KRUIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const mark = (klein) => `<span class="jvs-mark${klein ? ' sm' : ''}">${DUIF}</span>`;
  // 'fout' bestaat alleen in "Let op" van de admin; in beeld is dat dezelfde rail als een waarschuwing.
  const ERNST = { info: 'info', warn: 'warn', clinch: 'clinch', celebrate: 'celebrate', fout: 'warn' };
  const ernstKlas = (e) => `jvs--${ERNST[e] || 'info'}`;

  // ── Opslag per toestel ───────────────────────────────────────────────────
  const lees = (k) => { try { const o = JSON.parse(localStorage.getItem(k) || 'null'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
  const bewaar = (k, o) => { try { const n = Object.keys(o); if (n.length) localStorage.setItem(k, JSON.stringify(o)); else localStorage.removeItem(k); return true; } catch { return false; } };
  const ZELF = 'jvo_gids_zelf', WEG = 'jvo_gids_weg';
  // 1 = gedaan, 2 = overgeslagen ("Sla over"): allebei voorbij, maar alleen wat gedaan is krijgt een vinkje.
  const zelfStaat = (wie, stap) => { const v = lees(ZELF)[`${wie}:${stap}`]; return v === 1 || v === 2 ? v : 0; };
  const zelfGedaan = (wie, stap) => zelfStaat(wie, stap) > 0;
  function zetZelf(wie, stap, over) {
    const o = lees(ZELF);
    delete o[`${wie}:${stap}`];
    o[`${wie}:${stap}`] = over ? 2 : 1;
    // Een toestel dat jaren meegaat: alleen de laatste zestig blijven.
    const namen = Object.keys(o);
    for (const n of namen.slice(0, Math.max(0, namen.length - 60))) delete o[n];
    return bewaar(ZELF, o);
  }
  const isWeg = (plek, sleutel) => !!sleutel && lees(WEG)[plek] === String(sleutel);
  function zetWeg(plek, sleutel) {
    const o = lees(WEG);
    delete o[plek];
    o[plek] = String(sleutel || '');
    const namen = Object.keys(o);
    for (const n of namen.slice(0, Math.max(0, namen.length - 60))) delete o[n];
    return bewaar(WEG, o);
  }

  // ── "om 15:20" → "over 12 min" ───────────────────────────────────────────
  // De server stuurt de kloktijd letterlijk in de zin mee (`wanneer.tekst`) en, alleen op de
  // dag zelf, het moment in ms (`exp_ms`). Binnen het uur telt deze pagina af; verder weg, of
  // zonder moment, blijft de zin van de server staan. `skew` = serverklok min toestelklok.
  let skew = 0;
  function wanneerNu(w, nu) {
    const klok = String((w && w.tekst) || '');
    const ms = w ? Number(w.exp_ms) : NaN;
    if (!klok || !Number.isFinite(ms) || ms <= 0) return klok;
    const min = Math.round((ms - (nu == null ? Date.now() + skew : nu)) / 60000);
    if (min >= 60 || min < -20) return klok;
    const uit = min >= 1 ? `over ${min} min` : 'zo';
    return /^[A-Z]/.test(klok) ? uit.charAt(0).toUpperCase() + uit.slice(1) : uit;
  }
  function metWanneer(tekst, w) {
    const t = String(tekst == null ? '' : tekst);
    const klok = String((w && w.tekst) || '');
    const ms = w ? Number(w.exp_ms) : NaN;
    // Aan het begin van een zin staat hij met een hoofdletter ("Om 22:17 op …"): die blijft.
    const i = klok ? t.toLowerCase().indexOf(klok.toLowerCase()) : -1;
    if (i < 0 || !Number.isFinite(ms) || ms <= 0) return esc(t);
    const zoals = t.slice(i, i + klok.length);
    return `${esc(t.slice(0, i))}<span class="jvs-wanneer" data-jg-exp="${esc(ms)}" data-jg-klok="${esc(zoals)}">${esc(wanneerNu({ tekst: zoals, exp_ms: ms }))}</span>${esc(t.slice(i + klok.length))}`;
  }
  // Eén rustige tik voor alle aftellers in beeld (geen herteken van de pagina).
  function tikWanneer() {
    document.querySelectorAll('[data-jg-exp]').forEach((el) => {
      const t = wanneerNu({ tekst: el.dataset.jgKlok, exp_ms: Number(el.dataset.jgExp) });
      if (el.textContent !== t) el.textContent = t;
    });
  }
  setInterval(() => { if (!document.hidden) tikWanneer(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tikWanneer(); });

  // ── Deelnemers: "Wat nu?" ────────────────────────────────────────────────
  const stappenVan = (gids) => (gids && gids.v === 1 && Array.isArray(gids.stappen) ? gids.stappen.filter(s => s && typeof s.id === 'string') : []);
  const isKlaar = (s, wie) => !!s.klaar || !!(s.zelf && zelfGedaan(wie, s.id));
  // De stap van nu: de eerste die niet klaar is en die je niet zelf hebt afgevinkt.
  function stapVanNu(gids, wie) {
    const s = stappenVan(gids).find(x => !isKlaar(x, wie));
    return s && s.titel ? s : null;
  }
  const veiligBord = (u) => (typeof u === 'string' && /^\/(sporten|toernooi)([?#][A-Za-z0-9._~=&%#-]*)?$/.test(u) ? u : '');
  // opts: teamId (voor de knoppen van de pagina), wie (de sleutel waaronder dit toestel onthoudt wat
  //       je afvinkte: de teamcode), kan: { deel, qr } (welke knoppen deze pagina kan uitvoeren),
  //       straks: aantal volgende stappen dat klein en grijs meekomt, meld: bied meldingen aan.
  function strook(gids, opts) {
    const o = opts || {}, id = o.teamId, wie = String(o.wie || o.teamId), kan = o.kan || {};
    const alle = stappenVan(gids);
    const nu = stapVanNu(gids, wie);
    if (!alle.length || !nu) return '';
    const data = `data-jg-team="${esc(id)}" data-jg-wie="${esc(wie)}" data-jg-stap="${esc(nu.id)}"`;
    const knop = (k, cls, tweede) => {
      if (!k || !k.label) return '';
      if (k.actie === 'gedaan') return `<button type="button" class="${cls}" data-jg="gedaan"${tweede ? ' data-jg-over="1"' : ''} ${data}>${esc(k.label)}</button>`;
      if (k.actie === 'deel') return kan.deel ? `<button type="button" class="${cls}" data-jg="deel" ${data}>${esc(k.label)}</button>` : '';
      if (k.actie === 'qr') return kan.qr ? `<button type="button" class="${cls}" data-jg="qr" ${data}>${esc(k.label)}</button>` : '';
      if (k.actie === 'bord') { const u = veiligBord(k.url); return u ? `<a class="${cls}" href="${esc(u)}">${esc(k.label)}</a>` : ''; }
      return '';
    };
    let knoppen = knop(nu.knop, 'jvs-cta') + knop(nu.tweede, 'jvs-stil', true);
    // Kan deze pagina de hoofdknop niet uitvoeren (delen), dan blijft afvinken over.
    if (nu.zelf && !/data-jg="(gedaan|deel)"/.test(knoppen)) knoppen = `<button type="button" class="jvs-cta" data-jg="gedaan" ${data}>Heb ik gedaan</button>`;
    const klaar = alle.filter(s => isKlaar(s, wie) && !(s.zelf && !s.klaar && zelfStaat(wie, s.id) === 2)).map(s => (s.zelf && !s.klaar ? (s.kort_klaar || s.kort) : s.kort)).filter(Boolean);
    const i = alle.indexOf(nu);
    const straks = o.straks > 0 ? alle.slice(i + 1).filter(s => !isKlaar(s, wie) && s.kort).slice(0, o.straks).map(s => s.kort) : [];
    return `<section class="jvs jvs-wat ${ernstKlas(nu.ernst)}" aria-label="Wat nu? Hulp van JVO Smart" data-jg-wat="${esc(id)}">
        <div class="jvs-wat-kop">${mark(true)}<span class="jvs-eyebrow">JVO Smart · Wat nu?</span></div>
        <h3 class="jvs-wat-titel">${metWanneer(nu.titel, nu.wanneer)}</h3>
        ${nu.tekst ? `<p class="jvs-wat-tekst">${metWanneer(nu.tekst, nu.wanneer)}</p>` : ''}
        ${knoppen ? `<div class="jvs-wat-k">${knoppen}</div>` : ''}
        <p class="jvs-wat-zeg" data-jg-zeg="${esc(id)}" role="status" aria-live="polite"></p>
        ${straks.length ? `<ol class="jvs-straks" aria-label="Daarna">${straks.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
        ${klaar.length ? `<ul class="jvs-stappen" aria-label="Al gedaan">${klaar.map(t => `<li>${VINK}${esc(t)}</li>`).join('')}</ul>` : ''}
        ${o.meld ? `<p class="jvs-wat-meld">Seintje als je moet spelen? <button type="button" class="jvs-tekstknop" data-jg="meld" ${data}>Zet meldingen aan</button></p>` : ''}
      </section>`;
  }
  // Eén klik-afhandeling voor elke pagina. `h`: { opnieuw(), deel(teamId, knop) → Promise<bool>,
  // qr(teamId), meld() }. Geeft true terug als de klik van de gids was.
  function klik(e, h) {
    const b = e.target && e.target.closest ? e.target.closest('[data-jg]') : null;
    if (!b) return false;
    const act = b.dataset.jg, team = Number(b.dataset.jgTeam), wie = b.dataset.jgWie || String(team), stap = b.dataset.jgStap || '';
    const herteken = () => {
      if (h && h.opnieuw) h.opnieuw(act);
      // De knop is weg: de focus gaat naar de nieuwe stap, niet naar het begin van de pagina.
      const nieuw = document.querySelector(`[data-jg-wat="${team}"]`);
      const doel = nieuw && (nieuw.querySelector('.jvs-cta, .jvs-stil') || nieuw.querySelector('.jvs-wat-titel'));
      if (doel) { if (!doel.matches('button, a')) doel.setAttribute('tabindex', '-1'); try { doel.focus({ preventScroll: true }); } catch { /* geen focus */ } }
    };
    if (act === 'gedaan') { zetZelf(wie, stap, b.dataset.jgOver === '1'); herteken(); return true; }
    if (act === 'deel') {
      if (!h || !h.deel) return true;
      Promise.resolve(h.deel(team, b)).then((ok) => { if (ok) { zetZelf(wie, stap); herteken(); } }).catch(() => {});
      return true;
    }
    if (act === 'qr') { if (h && h.qr) h.qr(team); return true; }
    if (act === 'meld') { if (h && h.meld) h.meld(); return true; }
    return false;
  }
  // De teamcode delen (zelfde woorden als "Laat je team meekijken" in Mijn team).
  // `zeg(tekst)` zet een regel in beeld. Geeft true als er gedeeld of gekopieerd is.
  async function deelCode(naam, code, zeg) {
    if (!code) return false;
    const url = `${location.origin}/mijn#c=${encodeURIComponent(code)}`;
    const tekst = `Kijk mee met ${naam}: status, QR voor de check-in en onze wedstrijden. Teamcode ${code}.`;
    try {
      if (navigator.share) { await navigator.share({ title: String(naam || ''), text: tekst, url }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    try { await navigator.clipboard.writeText(`${tekst} ${url}`); if (zeg) zeg('Link gekopieerd. Plak hem in je teamgroep.'); return true; }
    catch { if (zeg) zeg(`Geef je teamgenoten de teamcode ${code}. Die typen ze op de pagina Mijn team.`); return false; }
  }

  // ── Het bord en "Nu en straks": de ene regel ─────────────────────────────
  // rijen: [{ regel, naam }] van de teams die bij dit toestel horen. De regel met de hoogste
  // rang wint (speelt nu > eerstvolgende > door > rest); bij gelijke rang wie het eerst speelt.
  function kiesRegel(rijen) {
    const ok = (rijen || []).filter(r => r && r.regel && typeof r.regel.kort === 'string' && r.regel.kort);
    const rang = (r) => (Number.isInteger(r.regel.rang) ? r.regel.rang : 3);
    const tijd = (r) => { const w = r.regel.wanneer; return w && Number(w.exp_ms) > 0 ? Number(w.exp_ms) : (w && w.klok ? w.klok : 'zz'); };
    ok.sort((a, b) => rang(a) - rang(b) || (tijd(a) < tijd(b) ? -1 : tijd(a) > tijd(b) ? 1 : 0));
    return ok[0] || null;
  }
  // "Jouw team Aalst speelt over 12 min op …" (één team op dit toestel) of "Aalst speelt …" (meer).
  function regelHtml(rij, aantal) {
    if (!rij || !rij.regel) return '';
    const r = rij.regel;
    // De zin loopt door na de naam ("Aalst is kampioen"); een zin op zich (`los`) krijgt een
    // dubbele punt ("Aalst: het toernooi zit erop"). Eén eigen team: "Jouw team Aalst …".
    const naam = String(r.naam || rij.naam || '').trim();
    const voor = naam && !(aantal > 1) ? 'Jouw team ' : '';
    const wie = `${voor}<b>${esc(naam || 'Jouw team')}</b>${r.los ? ':' : ''}`;
    return `<div class="jvs-row">${mark(true)}<span class="jvs-vtxt">${wie} ${metWanneer(r.kort, r.wanneer)}</span></div>`;
  }

  window.JVO_GIDS = {
    esc, mark, ernstKlas, VINK, KRUIS,
    zelfGedaan, zetZelf, isWeg, zetWeg,
    wanneerNu, metWanneer, tikWanneer,
    stapVanNu, strook, klik, deelCode,
    kiesRegel, regelHtml,
    set skew(v) { skew = Number.isFinite(v) ? v : 0; },
    get skew() { return skew; },
  };
})();
