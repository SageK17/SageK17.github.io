// Mijn team (/mijn) — de eigen pagina van elke aanmelding. Stap 1: alleen lezen.
//
// Erin zonder wachtwoord: de sleutel komt uit het aanmeld-antwoord (app.js bewaart hem),
// uit een link (#k=<sleutel>, of oud #team=<sleutel>) of uit een teamcode (#c=<code> of
// het invulveld). Hij staat alleen achter de # en gaat naar de server in de
// Authorization-kop; de adresbalk wordt opgeruimd vóór het eerste netwerkverzoek.
//
// Opslag op het toestel (alles via try/catch; zonder opslag werkt de pagina via de link):
//   jvo_mijn          { v:1, keys:[{ k, kind, scope, since, teams:[id] }] }   max. 6
//   jvo_mijn_kaarten  { v:1, at, event, account, cards:[…] }   laatste goede antwoord (bron voor offline, mét QR)
//   jvo_mijn_meld     [team_id]   teams waarvoor meldingen zijn klaargezet terwijl ze nog wachten
//   jvo_mijn_tip_weg  '1' als de beginscherm-uitleg is weggetikt
//   jvo_gids_zelf     { "<teamcode>:<stap>": 1|2 }   wat je in "Wat nu?" zelf afvinkte of oversloeg (jvo-gids.js)
//   jvo_stad          [{ id, name, comp, cat, at }]   wat er op dit toestel met "alleen stad" is aangemeld
//                     (geschreven door app.js; hier bijgehouden zodat de voordeur niets ouds toont)
// Aangemeld met alleen een stad (card.signup === 'city', card.mail === false): er is geen
// e-mailadres. Dan belooft deze pagina nergens een mail, is de teamcode de enige reserve en
// staat de poule met de andere namen erbij zolang de indeling nog kan veranderen.
// Het bord houdt zijn eigen volglijst bij (jvo_hub_follow / jvo_follow); deze pagina zet
// het eigen team daarin klaar, zodat "Bekijk het hele bord" het team gemarkeerd toont.
//
// "Wat nu?" van JVO Smart (jvo-gids.js): de server rekent per kaart uit welke stap nu telt
// (card.gids); deze pagina toont die ene stap boven "wat nu telt", met wat klaar is klein
// afgevinkt. Wat je zelf afvinkt (code bewaard, gedeeld) staat alleen op dit toestel
// (jvo_gids_zelf). Stuurt de server geen gids mee (helper uit), dan is de pagina zoals altijd.
//
// Regels: elke waarde van de server gaat door esc() vóór innerHTML; geen evenement-teksten
// in deze code (datum, locatie, sportnamen komen van de server); meldingen gaan alleen aan
// na een tik op de knop én toestemming in de browser, en de uit-knop staat er altijd.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('mt-app');
  if (!app) return;
  const G = window.JVO_GIDS || null;
  const CONTACT = app.dataset.contact || '';
  const LOCATIE = app.dataset.locatie || '';
  const BASIS_SUB = $('mt-sub').textContent;
  const BASIS_TITEL = document.title;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const KEYS = 'jvo_mijn', CACHE = 'jvo_mijn_kaarten', MELD = 'jvo_mijn_meld', TIP = 'jvo_mijn_tip_weg', STAD = 'jvo_stad';
  // Staat "laat je link mailen" op deze pagina? (De server laat het weg als niemand een adres heeft.)
  const MAIL_KAN = !!$('mt-link-form');
  const zonderMail = (c) => !!c && c.mail === false;
  const isJwt = (k) => typeof k === 'string' && k.length < 2000 && /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(k);

  // ── Sleutels ───────────────────────────────────────────────────────────────
  function leesKeys() {
    try {
      const o = JSON.parse(ls.get(KEYS) || 'null');
      const a = o && Array.isArray(o.keys) ? o.keys : [];
      return a.filter(x => x && isJwt(x.k)).slice(0, 6).map(x => ({
        k: x.k, kind: x.kind === 'view' ? 'view' : (x.kind === 'own' ? 'own' : null), scope: x.scope === 'address' ? 'address' : (x.scope === 'team' ? 'team' : null),
        since: Number(x.since) || Date.now(), teams: Array.isArray(x.teams) ? x.teams.filter(Number.isInteger).slice(0, 12) : [],
      }));
    } catch { return []; }
  }
  let keys = leesKeys();
  function bewaarKeys() {
    if (!keys.length) { ls.del(KEYS); return; }
    ls.set(KEYS, JSON.stringify({ v: 1, keys: keys.map(x => ({ k: x.k, kind: x.kind, scope: x.scope, since: x.since, teams: x.teams })) }));
  }
  function voegSleutelToe(k, kind) {
    if (!isJwt(k)) return false;
    if (keys.some(x => x.k === k)) return true;
    keys.unshift({ k, kind: kind || null, scope: null, since: Date.now(), teams: [] });
    keys = keys.slice(0, 6);
    bewaarKeys();
    return true;
  }

  // ── Binnenkomen: sleutel of code uit de link, en meteen de adresbalk opruimen ──
  let wijsTeam = null, wijsPush = false, startCode = '', linkKapot = false;
  function binnenkomst() {
    let k = '', c = '';
    try {
      const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
      k = h.get('k') || h.get('team') || '';
      c = h.get('c') || '';
      const q = new URLSearchParams(location.search);
      const t = q.get('team');
      if (t && /^\d{1,9}$/.test(t)) wijsTeam = Number(t);
      wijsPush = q.get('push') === '1';
    } catch {}
    try { if (location.hash || location.search) history.replaceState(null, '', location.pathname); } catch {}
    if (k && !voegSleutelToe(k)) linkKapot = true;
    if (c) startCode = String(c).slice(0, 40);
    return !!(k || c);
  }
  binnenkomst();

  // ── De pagina zelf op het toestel (service worker) ─────────────────────────
  // (1) De service worker bewaart een geopende pagina onder haar volledige adres, dus mét
  //     de sleutel of code achter de #. Die regels halen we weg, ook als de adresbalk al
  //     schoon is. (2) Zodra de service worker meedoet, halen we de pagina en haar scripts
  //     één keer op via die worker: dan staan ze na het EERSTE bezoek al klaar voor offline.
  let paginaKlaar = null;   // null = onbekend of niet te zeggen, true/false = staat de pagina in de cache?
  async function veegLinkCache() {
    if (!('caches' in window)) return;
    try {
      for (const naam of await caches.keys()) {
        const c = await caches.open(naam);
        for (const req of await c.keys()) {
          let u; try { u = new URL(req.url); } catch { continue; }
          if (u.origin !== location.origin || !u.hash || !/^\/(mijn|sporten|toernooi)(\.html)?$/.test(u.pathname)) continue;
          if (/(^#|&)(k|team|c)=/.test(u.hash)) await c.delete(req);
        }
      }
    } catch {}
  }
  let paginaBezig = false, paginaGedaan = false;
  async function bewaarPagina() {
    if (paginaBezig || paginaGedaan || !('serviceWorker' in navigator) || !('caches' in window)) return;
    if (!navigator.serviceWorker.controller) return;   // komt terug bij 'controllerchange'
    paginaBezig = true;
    try {
      await veegLinkCache();
      const eigen = (u) => { try { const x = new URL(u, location.href); return x.origin === location.origin ? x.pathname + x.search : ''; } catch { return ''; } };
      const lijst = new Set(['/mijn.webmanifest']);
      document.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach(el => { const u = eigen(el.src || el.href); if (u) lijst.add(u); });
      await Promise.all([fetch('/mijn', { headers: { Accept: 'text/html' } }).catch(() => null), ...[...lijst].map(u => fetch(u).catch(() => null))]);
      await new Promise(r => setTimeout(r, 400));   // de worker schrijft de kopie zonder erop te wachten
      const heeft = async (u) => !!(await caches.match(u, { ignoreSearch: true }));
      const was = paginaKlaar;
      paginaKlaar = (await heeft('/mijn')) && (await heeft('/mijn.js'));
      paginaGedaan = paginaKlaar;
      if (was !== paginaKlaar) render();
    } catch {}
    finally { paginaBezig = false; }
  }
  veegLinkCache(); setTimeout(veegLinkCache, 4000);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { paginaGedaan = false; bewaarPagina(); });
    window.addEventListener('online', () => bewaarPagina());
  }

  // ── De volglijst van het bord (alleen markeren; abonneren gebeurt na een tik) ──
  const BORD = {
    sporten: { volg: 'jvo_hub_follow', push: 'jvo_hub_follow_push' },
    toernooi: { volg: 'jvo_follow', push: 'jvo_follow_push' },
  };
  const bordVan = (c) => (c && c.board && BORD[c.board.kind] ? c.board.kind : 'sporten');
  function lijst(kind) {
    try { const a = JSON.parse(ls.get(BORD[kind].volg) || '[]'); return Array.isArray(a) ? a.filter(t => t && Number.isInteger(t.id)) : []; } catch { return []; }
  }
  function bewaarLijst(kind, l) { ls.set(BORD[kind].volg, JSON.stringify(l)); }
  const bordAan = (kind) => ls.get(BORD[kind].push) === '1';
  const volgRij = (c) => (bordVan(c) === 'sporten' ? { id: c.follow.id, name: c.follow.name, comp: c.follow.comp } : { id: c.follow.id, name: c.follow.name });
  let meld = (() => { try { const a = JSON.parse(ls.get(MELD) || '[]'); return new Set(Array.isArray(a) ? a.filter(Number.isInteger) : []); } catch { return new Set(); } })();
  const bewaarMeld = () => { if (meld.size) ls.set(MELD, JSON.stringify([...meld])); else ls.del(MELD); };

  function markeerVolgen(cards) {
    for (const c of cards) {
      if (c._oud || !c.follow || !Number.isInteger(c.follow.id)) continue;
      const kind = bordVan(c);
      let l = lijst(kind);
      const e = l.find(t => t.id === c.team_id);
      if (c.status === 'rejected') {
        // De server heeft de meldingen van dit team gewist; hier hoort het ook weg.
        if (e) { l = l.filter(t => t.id !== c.team_id); bewaarLijst(kind, l); if (!l.length) ls.del(BORD[kind].push); }
        if (meld.delete(c.team_id)) bewaarMeld();
        continue;
      }
      if (c.status !== 'approved') continue;
      if (e) {
        if (e.name !== c.follow.name || (kind === 'sporten' && e.comp !== c.follow.comp)) { e.name = c.follow.name; if (kind === 'sporten') e.comp = c.follow.comp; bewaarLijst(kind, l); }
        if (meld.has(c.team_id) && bordAan(kind)) { delete e.wacht; bewaarLijst(kind, l); meld.delete(c.team_id); bewaarMeld(); }
        continue;
      }
      if (meld.has(c.team_id)) {
        // Meldingen stonden al klaar toen het team nog wachtte: nu is het een gewoon gevolgd team.
        l.push(volgRij(c)); bewaarLijst(kind, l); ls.set(BORD[kind].push, '1');
        meld.delete(c.team_id); bewaarMeld();
      } else if (!bordAan(kind)) {
        l.push(volgRij(c)); bewaarLijst(kind, l);
      } else if (kind === 'sporten') {
        // Meldingen staan op dit bord al aan voor andere teams: klaarzetten, niet vanzelf abonneren.
        l.push({ ...volgRij(c), wacht: true }); bewaarLijst(kind, l);
      }
    }
  }

  // ── Ophalen ────────────────────────────────────────────────────────────────
  function leesCache() {
    try { const o = JSON.parse(ls.get(CACHE) || 'null'); return o && Array.isArray(o.cards) ? o : null; } catch { return null; }
  }
  const kaal = (c) => { const o = { ...c }; delete o._key; delete o._oud; return o; };
  let state = null;           // { cards, event, account, at, stale }
  let bewaard = new Set();    // team-ids waarvan de QR echt in de opslag staat
  let melding = '';
  function zetMelding(t) { melding = t || ''; const el = $('mt-melding'); el.textContent = melding; el.hidden = !melding; }

  async function haal(key) {
    try {
      const r = await fetch('/api/mijn', { headers: { Authorization: 'Bearer ' + key.k }, cache: 'no-store' });
      if (r.status === 200) {
        const j = await r.json().catch(() => null);
        return j && Array.isArray(j.cards) ? { ok: true, j } : { later: true };
      }
      if (r.status === 401 || r.status === 404) {
        // Alleen het uitdrukkelijke antwoord van /api/mijn gooit een sleutel weg; een kale 404/401
        // (proxy, oudere server tijdens een herstart) laat hem staan.
        const j = await r.json().catch(() => ({}));
        if (j && (j.code === 'key_invalid' || j.code === 'gone')) return { weg: true, code: j.code };
      }
      return { later: true, druk: r.status === 429 };
    } catch { return { later: true }; }
  }

  const rang = (c) => (c._kind === 'own' ? (c._scope === 'address' ? 3 : 2) : 1) * 2 + (c._oud ? 0 : 1);
  let bezig = false, nogEens = false, laatst = 0, eerste = true;
  async function laad() {
    if (bezig) { nogEens = true; return; }
    bezig = true; laatst = Date.now();
    try {
      if (!keys.length) { state = null; ls.del(CACHE); bewaard = new Set(); render(); return; }
      const gebruikt = keys.slice();
      const res = await Promise.all(gebruikt.map(haal));
      const cache = leesCache();
      let alle = [], event = null, account = null, stale = false, druk = false;
      const weg = [];
      res.forEach((r, i) => {
        const key = gebruikt[i];
        if (r.ok) {
          const j = r.j;
          if (isJwt(j.renew)) key.k = j.renew;
          key.kind = j.kind === 'view' ? 'view' : 'own';
          key.scope = j.scope === 'address' ? 'address' : 'team';
          key.teams = j.cards.map(c => c.team_id).filter(Number.isInteger).slice(0, 12);
          if (j.event) event = j.event;
          if (j.account && j.account.email) account = { name: String(j.account.name || ''), email: String(j.account.email) };
          for (const c of j.cards) if (c && Number.isInteger(c.team_id)) alle.push({ ...c, _kind: key.kind, _scope: key.scope, _key: key });
        } else if (r.weg) {
          weg.push(r.code);
        } else {
          stale = true; if (r.druk) druk = true;
          // Geen antwoord: de laatst bewaarde kaarten van deze sleutel blijven staan.
          for (const c of (cache ? cache.cards : [])) if (key.teams.includes(c.team_id)) alle.push({ ...c, _key: key, _oud: true });
        }
      });
      keys = keys.filter(k => { const i = gebruikt.indexOf(k); return i < 0 || !res[i].weg; });
      // Samenvoegen op team: eigen (adres) wint van eigen (team) wint van meekijken.
      const perTeam = new Map();
      for (const c of alle) { const h = perTeam.get(c.team_id); if (!h || rang(c) > rang(h)) perTeam.set(c.team_id, c); }
      const cards = [...perTeam.values()];
      // Een adres-sleutel dekt de sleutel van één team: die laatste vervalt.
      const gedekt = new Set(keys.filter(k => k.kind === 'own' && k.scope === 'address').flatMap(k => k.teams));
      keys = keys.filter(k => !(k.kind === 'own' && k.scope === 'team' && k.teams.length && k.teams.every(id => gedekt.has(id))));
      bewaarKeys();
      if (!stale) {
        state = { cards, event, account, at: Date.now(), stale: false };
        if (cards.length) ls.set(CACHE, JSON.stringify({ v: 1, at: state.at, event, account, cards: cards.map(kaal) })); else ls.del(CACHE);
      } else {
        state = { cards, event: event || (cache && cache.event) || null, account: account || (cache && cache.account) || null, at: cache ? cache.at : null, stale: true, druk };
      }
      if (!stale) houStadBij(cards);
      const op = leesCache();
      bewaard = new Set((op ? op.cards : []).filter(c => c.checkin && typeof c.checkin.qr_svg === 'string').map(c => c.team_id));
      markeerVolgen(cards);
      if (weg.length && !keys.length) zetMelding(weg.includes('gone') ? 'Deze aanmelding bestaat niet meer.' : (MAIL_KAN ? 'Deze link werkt niet meer. Vraag hieronder een nieuwe aan.' : 'Deze sleutel werkt niet meer. Typ hieronder je teamcode.'));
      else if (weg.length && eerste) zetMelding('Eén van je links werkt niet meer en is van dit toestel gehaald.');
      render();
    } finally {
      eerste = false; bezig = false;
      if (nogEens) { nogEens = false; sein(); }
    }
  }

  // De voordeur onthoudt wat er op dit toestel met "alleen stad" is aangemeld (om te vragen
  // "nog een?"). Bestaat zo'n aanmelding niet meer, of heet hij anders, dan loopt dat hier mee.
  function houStadBij(cards) {
    try {
      const a = JSON.parse(ls.get(STAD) || '[]');
      if (!Array.isArray(a) || !a.length) return;
      const leeft = new Map(cards.filter(c => c.status !== 'rejected' && c.status !== 'revoked').map(c => [c.team_id, c]));
      const rest = a.filter(x => x && leeft.has(x.id)).map(x => ({ ...x, name: String(leeft.get(x.id).name || x.name) }));
      if (JSON.stringify(rest) === JSON.stringify(a)) return;
      if (rest.length) ls.set(STAD, JSON.stringify(rest)); else ls.del(STAD);
    } catch {}
  }

  // ── Bouwstenen ─────────────────────────────────────────────────────────────
  const veiligIcoon = (u) => (/^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || '')) ? u : '/sport/beker-klein.webp');
  const grootIcoon = (u) => veiligIcoon(u).replace(/-klein\.webp$/, '.webp');
  const logoHtml = (logo, px) => (logo && window.jvoLogo ? window.jvoLogo.html(logo, px) : '');
  const qrSrc = (svg) => (typeof svg === 'string' && svg.length < 80000 && /^<svg[\s>]/.test(svg) ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : '');
  const tijdVan = (ms) => { try { return new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const VINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const uitloop = (d) => (d < 60 ? `+${d} min` : `+${Math.floor(d / 60)} u${d % 60 ? ` ${d % 60} min` : ''}`);
  const zin = (t) => { const x = String(t || '').trim(); return x && !/[.!?…]$/.test(x) ? `${x}.` : x; };
  // Heeft één rij in een lijst een logo, dan krijgen de andere een lege plek van dezelfde maat (namen blijven uitgelijnd).
  const logoPlek = (logo, px, lijstHeeft) => logoHtml(logo, px) || (lijstHeeft ? `<span class="mt-geen-logo" style="width:${px}px" aria-hidden="true"></span>` : '');
  const setsRegel = (sets) => (Array.isArray(sets) && sets.length ? sets.map(s => `${s[0]}–${s[1]}`).join(' · ') : '');

  const STATUS = {
    pending: ['', 'Ontvangen'], approved: ['ja', 'Je doet mee'], waitlist: ['vol', 'Wachtlijst'],
    rejected: ['nee', 'Afgewezen'], revoked: ['nee', 'Ingetrokken'],
  };

  // De ring met het sport-icoon wordt één keer gebouwd en daarna teruggezet, zodat een
  // draaiende bal (sh-bal3d.js, alleen in de stijl Sporthub) zijn canvas houdt.
  const ringen = new Map();
  function ringNode(c) {
    const naam = String((c.sport && c.sport.key) || '');
    const sleutel = `${c.team_id}|${naam}|${c.sport ? c.sport.icon_small : ''}`;
    let el = ringen.get(sleutel);
    if (el) return el;
    el = document.createElement('span');
    el.className = 'mt-ring'; el.setAttribute('aria-hidden', 'true');
    const inn = document.createElement('span'); inn.className = 'mt-ring-in';
    const img = new Image(); img.alt = ''; img.decoding = 'async';
    const bal = /^(voetbal|volleybal|basketbal)$/.test(naam) && document.documentElement.getAttribute('data-theme') === 'sporthub';
    img.src = bal ? `/sport/bal/${naam}-stil.webp` : grootIcoon(c.sport && c.sport.icon_small);
    inn.appendChild(img); el.appendChild(inn);
    if (bal) {
      const go = () => { if (window.shBal3d && img.isConnected) window.shBal3d.maak(img, naam); };
      setTimeout(() => { if (window.shBal3d || document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true }); }, 0);
    }
    ringen.set(sleutel, el);
    return el;
  }

  // Een lange naam krijgt een kleinere letter (en nooit een afbreking midden in een woord).
  const naamKlas = (n) => { const l = String(n || '').length; return l >= 40 ? ' class="erg-lang"' : (l >= 25 ? ' class="lang"' : ''); };
  function pas(c) {
    const own = c._kind === 'own';
    const sp = c.sport || {};
    const [cls, tekst] = STATUS[c.status] || STATUS.pending;
    const chips = [`<em class="mt-chip ${cls}">${esc(tekst)}</em>`];
    if (c.checkin && c.checkin.checked_in_time) chips.push(`<em class="mt-chip vol">Ingecheckt ${esc(c.checkin.checked_in_time)}</em>`);
    if (c.schedule && c.schedule.poule) chips.push(`<em class="mt-chip stil">Poule ${esc(c.schedule.poule)}</em>`);
    if (own && !c.solo && Number(c.players) > 0) chips.push(`<em class="mt-chip stil">${esc(c.players)} spelers</em>`);
    if (!own) chips.push('<em class="mt-chip stil">Je kijkt mee</em>');
    let onder = '';
    if (c.checkin) {
      const src = qrSrc(c.checkin.qr_svg);
      const op = bewaard.has(c.team_id);
      onder = `<div class="mt-scheur"></div><div class="mt-pas-qr">
        ${src ? `<button type="button" class="mt-qr" data-qr="${esc(c.team_id)}" aria-label="Toon de QR-code groot"><img src="${esc(src)}" alt="QR-code voor de check-in van ${esc(c.name)}" /></button>` : '<span></span>'}
        <div><span class="mt-k">Check-in-code</span><b class="mt-code">${esc(c.checkin.code || '')}</b>
          <p>${c.checkin.checked_in_time ? 'Je bent binnen. De QR blijft hier staan.' : 'Laat de QR zien bij de ingang. Lukt scannen niet? Noem deze code.'}</p>
          <p class="mt-bewaard">${op ? (paginaKlaar === false ? 'Je QR is bewaard, de pagina zelf nog niet. Maak voor de zekerheid een schermafbeelding.' : `${VINK}Staat op dit toestel bewaard`) : 'Niet bewaard op dit toestel: maak een schermafbeelding.'}</p></div>
      </div>
      <div class="mt-pas-voet"><span class="mt-k">${c.solo ? 'Jouw code' : 'Teamcode'} <b>${esc(c.team_code || '')}</b></span>${own && zonderMail(c) && c.team_code ? '<p class="mt-enige">Bewaar deze code (schermafbeelding): er komt geen mail, dit is je enige sleutel.</p>' : ''}</div>`;
    } else if ((c.status === 'pending' || c.status === 'waitlist') && c.team_code) {
      onder = `<div class="mt-scheur"></div><div class="mt-pas-stub"><span class="mt-k">${c.solo ? 'Jouw code' : 'Teamcode'}</span><b class="mt-code">${esc(c.team_code || '')}</b>
        <p>Maak een schermafbeelding van deze code. Daarmee open je ${c.solo ? 'je aanmelding' : 'Mijn team'} op elk toestel${c.solo ? '' : ', en je teamgenoten kunnen ermee meekijken'}.${zonderMail(c) ? ' Er komt geen mail: dit is je enige sleutel.' : ''}</p></div>`;
    }
    return `<article class="mt-pas" aria-label="${esc(c.name)}${sp.name ? `, ${esc(sp.name)}` : ''}">
      <div class="mt-pas-kop${String(c.name || '').length >= 25 ? ' breed' : ''}">
        <span data-ring="${esc(c.team_id)}"></span>
        <div><div class="mt-k">${[sp.name, sp.team_label].filter(Boolean).map(esc).join(' · ')}</div>
          <h2 lang="nl"${naamKlas(c.name)} title="${esc(c.name)}">${esc(c.name)}</h2>
          <div class="mt-st">${chips.join('')}</div></div>
        ${logoHtml(c.logo, 46)}
      </div>${onder}
    </article>`;
  }

  function kaartje(c, m) {
    const live = m.status === 'live';
    const d = Number(m.delay) || 0;
    const k = [m.where ? esc(m.where) : '', !live && d >= 3 && m.time ? `gepland ${esc(m.time)}` : '', !live && d >= 3 ? `uitloop ${esc(uitloop(d))}` : ''].filter(Boolean).join(' · ');
    const chip = live ? `<em>Live${c.sport && c.sport.model === 'sets' && Array.isArray(m.sets) && m.sets.length ? ` set ${m.sets.length}` : ''}</em> ` : '';
    const groot = live ? (m.score ? `${m.score[0]} – ${m.score[1]}` : '0 – 0') : (m.expected || m.time || 'Tijd volgt');
    const opp = m.opponent || {};
    const sets = live ? setsRegel(m.sets) : '';
    return `<div class="mt-kaartje"><div class="l">
        <div class="k">${chip}${k}</div>
        <div class="mt-tijd">${esc(groot)}</div>
        <div class="mt-tegen">tegen ${logoHtml(opp.logo, 20)}<b lang="nl">${esc(opp.name || 'nog niet bekend')}</b></div>
        ${sets ? `<div class="mt-sets">${esc(sets)}</div>` : ''}
      </div><div class="r"><span class="mt-badge"><img src="${esc(veiligIcoon(c.sport && c.sport.icon_small))}" alt="" /></span><span class="mono">${esc(m.place || '')}</span></div></div>`;
  }

  // Met één aanmelding staan wedstrijden en stand open; met meer klappen ze in tot één regel
  // (anders wordt de pagina schermen lang). Wat je zelf open- of dichtklapt blijft zo.
  const vouw = new Map();
  let meerKaarten = false;
  const vouwOpen = (c, wat) => { const k = `${c.team_id}|${wat}`; return vouw.has(k) ? vouw.get(k) : !meerKaarten; };
  const UITSLAG = { w: ['W', 'Gewonnen'], d: ['G', 'Gelijk'], l: ['V', 'Verloren'] };
  function wedstrijden(c) {
    const s = c.schedule;
    if (!s || !Array.isArray(s.matches) || !s.matches.length) return '';
    const metLogo = s.matches.some(m => m.opponent && m.opponent.logo);
    const klaarN = s.matches.filter(m => m.status === 'done').length, rest = s.matches.length - klaarN;
    const kort = [klaarN ? `${klaarN} gespeeld` : '', rest ? `${rest} te gaan` : ''].filter(Boolean).join(' · ');
    return `<details class="mt-wed mt-vouw" data-vouw="${esc(c.team_id)}|wed"${vouwOpen(c, 'wed') ? ' open' : ''}><summary class="mt-lbl">Jouw wedstrijden<i>${esc(kort)}</i></summary><ul>` + s.matches.map(m => {
      const live = m.status === 'live', klaar = m.status === 'done';
      const opp = m.opponent || {};
      let u = '';
      if (klaar && m.score) { const r = UITSLAG[m.result] || null; u = `${r ? `<em class="mt-uit ${esc(m.result)}" role="img" aria-label="${r[1]}">${r[0]}</em>` : ''}<b>${esc(m.score[0])}–${esc(m.score[1])}</b>`; }
      else if (live) u = `<em class="mt-live">Live</em>${m.score ? `<b>${esc(m.score[0])}–${esc(m.score[1])}</b>` : ''}`;
      const extra = [m.where, m.place, setsRegel(m.sets), m.pens ? `n.p. ${m.pens[0]}–${m.pens[1]}` : ''].filter(Boolean).map(esc).join(' · ');
      return `<li class="mt-wr"><span class="t">${esc(m.expected || m.time || '')}</span>
        <span class="n">${logoPlek(opp.logo, 18, metLogo)}<span lang="nl">${esc(opp.name || 'Nog niet bekend')}</span></span>
        <span class="u">${u}</span>${extra ? `<span class="o">${extra}</span>` : ''}</li>`;
    }).join('') + `</ul></details>`;
  }

  function stand(c) {
    const s = c.schedule;
    if (!s || !Array.isArray(s.standings) || !s.standings.length) return '';
    const sets = c.sport && c.sport.model === 'sets';
    const metLogo = s.standings.some(r => r.logo);
    const ik = s.standings.find(r => r.me);
    return `<details class="mt-stand-vak mt-vouw" data-vouw="${esc(c.team_id)}|stand"${vouwOpen(c, 'stand') ? ' open' : ''}><summary class="mt-lbl">Stand${s.poule ? ` poule ${esc(s.poule)}` : ''}<i>${ik ? `${c.solo ? 'jij staat' : 'jullie staan'} ${esc(ik.pos)}e` : ''}</i></summary>
      <div class="mt-stand-uitleg mono">${sets ? 'gs · pnt · sets' : 'gs · pnt · saldo'}</div>
      <div class="mt-stand"><div class="mt-srow kop" aria-hidden="true"><span>#</span><span>Naam</span><span class="n">Gs</span><span class="n">Pnt</span><span class="n">±</span></div>
      ${s.standings.map(r => `<div class="mt-srow${r.me ? ' mij' : ''}"><span>${esc(r.pos)}</span><em>${logoPlek(r.logo, 18, metLogo)}<i lang="nl">${esc(r.name)}</i></em><span class="n">${esc(r.gp)}</span><b>${esc(r.pts)}</b><span class="n">${r.gd > 0 ? '+' : ''}${esc(r.gd)}</span></div>`).join('')}
      </div></details>`;
  }

  const reden = (c) => (c.reason ? `<div class="mt-reden"><b>Van de organisatie</b>${esc(c.reason)}</div>` : '');
  const liveHref = () => { const a = $('mt-live'); const h = a ? a.getAttribute('href') : ''; return /^\/(sporten|toernooi)$/.test(h || '') ? h : ''; };
  const welkom = () => `<p>Je bent welkom om te komen kijken.</p>${liveHref() ? `<div class="mt-rij"><a class="mt-knop" href="${esc(liveHref())}">Bekijk het live-bord</a></div>` : ''}`;
  const vragen = () => (CONTACT ? `<p class="klein">Vragen? Mail <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>.</p>` : '');
  // "Je zit in Poule B" met de anderen in die poule. Staat er zolang de indeling nog kan
  // veranderen (schedule.draw_open), en bij een aanmelding met alleen een stad tot de eerste
  // wedstrijd: daar is dit het antwoord op "in welke poule kom ik?".
  function pouleStuk(c) {
    const s = c.schedule;
    if (!s || s.state !== 'ready' || !s.poule) return '';
    if (!(s.draw_open || (c.signup === 'city' && !gespeeld(c)))) return '';
    const anderen = (Array.isArray(s.standings) ? s.standings : []).filter(r => r && !r.me && r.name).map(r => r.name);
    return `<div class="mt-lbl">${c.solo ? 'Je poule' : 'Jullie poule'}</div>
      <div class="mt-poule"><b>Poule ${esc(s.poule)}</b>
        <ul aria-label="In deze poule"><li class="ik" lang="nl">${esc(c.name)}</li>${anderen.map(n => `<li lang="nl">${esc(n)}</li>`).join('')}</ul>
        ${anderen.length ? '' : '<p class="klein">Je bent de eerste in deze poule.</p>'}
        ${s.draw_open ? '<p class="klein">De indeling kan nog veranderen tot de start. Hier staat altijd de laatste stand.</p>' : ''}</div>`;
  }
  function schemaStuk(c, kop) {
    const s = c.schedule;
    if (!s || s.state === 'none') {
      return s && s.reason === 'few'
        ? '<div class="mt-lbl">Je poule</div><p>Je poule volgt zodra er genoeg aanmeldingen zijn. Dan staat hij hier, met je eerste wedstrijd.</p>'
        : '<p>Het schema volgt. Zodra het klaar is, staat je eerste wedstrijd hier.</p>';
    }
    if (s.state === 'not_in_schedule') return `<p>Het schema staat al, maar ${c.solo ? 'je bent' : 'je team is'} nog niet ingedeeld. De organisatie regelt dat.</p>`;
    const pz = (s.paused ? `<div class="mt-pauze" role="status"><b>Pauze</b>${s.pause_message ? `${esc(zin(s.pause_message))} ` : ''}Wat bezig is wordt uitgespeeld. De tijden schuiven mee zodra er weer gespeeld wordt.</div>` : '') + pouleStuk(c);
    if (s.live) return `${pz}<div class="mt-lbl">Nu bezig</div>${kaartje(c, s.live)}${s.next ? `<div class="mt-lbl">Daarna</div>${kaartje(c, s.next)}` : ''}`;
    if (s.next) return `${pz}<div class="mt-lbl">${esc(kop)}</div>${kaartje(c, s.next)}`;
    return `${pz}<p>${s.group_complete ? 'De poulewedstrijden zitten erop.' : 'Er staat nu geen wedstrijd voor je klaar.'} Je uitslagen en de stand staan hieronder.</p>`;
  }
  const gespeeld = (c) => !!(c.schedule && Array.isArray(c.schedule.matches) && c.schedule.matches.some(m => m.status === 'done' || m.status === 'live'));

  // Na het inchecken telt de volgende wedstrijd, niet meer de QR: dan staat "nu" boven het pasje.
  const nuEerst = (c) => /^(show_qr|checked_in|match|done)$/.test(c.now || '');
  // `dekt`: de strook "Wat nu?" van JVO Smart zegt op deze kaart al wat de kop van dit blok
  // zegt (wachtlijst, QR laten zien, eindstand). Dan blijft de kop weg en staat de rest er nog.
  function nu(c, ev, dekt) {
    const solo = !!c.solo;
    const now = c.now || c.status;
    const kop = (html) => (dekt ? '' : `<div class="mt-nu-kop">${html}</div>`);
    let h = '';
    if (now === 'pending') {
      h = kop(`<div class="mt-lbl">Status</div><h3>Ontvangen<em>.</em></h3>
        <p>We bekijken ${solo ? 'je aanmelding' : 'je team'}. Het besluit zie je hier${zonderMail(c) ? '' : ', en je krijgt het ook per mail'}.</p>`);
    } else if (now === 'waitlist') {
      h = kop(`<div class="mt-lbl">Status</div><h3>Wachtlijst<em>.</em></h3>
        <p>Er is nu geen plek. ${zonderMail(c) ? 'Komt er een plek vrij, dan schuif je door en zie je het hier. Kijk af en toe even: er komt geen mail.' : 'Komt er een plek vrij, dan zie je het hier en krijg je een mail.'}</p>`) + reden(c);
    } else if (now === 'rejected') {
      h = `<div class="mt-lbl">Status</div><h3>Afgewezen<em>.</em></h3>
        <p>${solo ? 'Je aanmelding' : 'De aanmelding van je team'} gaat helaas niet door.</p>${reden(c)}${welkom()}${vragen()}`;
    } else if (now === 'revoked') {
      h = `<div class="mt-lbl">Status</div><h3>Ingetrokken<em>.</em></h3>
        <p>De goedkeuring is ingetrokken. ${solo ? 'Je doet' : 'Je team doet'} op dit moment niet mee.</p>${reden(c)}${welkom()}${vragen()}`;
    } else if (now === 'countdown') {
      const n = ev && Number.isInteger(ev.days_left) ? ev.days_left : null;
      const start = c.sport && c.sport.start_time;
      h = n != null
        ? `<div class="mt-lbl">Nog even</div><h3>${n === 0 ? 'Vandaag' : `Nog ${esc(n)} ${n === 1 ? 'dag' : 'dagen'}`}<em>.</em></h3>
           <p>${esc(ev.date_text || '')}${LOCATIE ? ` · ${esc(LOCATIE)}` : ''}.${start && c.sport.name ? ` ${esc(c.sport.name)} begint om ${esc(start)}.` : ''}</p>`
        : `<div class="mt-lbl">Je doet mee</div><h3>Datum volgt<em>.</em></h3>
           <p>Zodra de datum bekend is, staat hij hier${LOCATIE ? ` (${esc(LOCATIE)})` : ''}.</p>`;
      h += schemaStuk(c, gespeeld(c) ? 'Jouw volgende wedstrijd' : 'Jouw eerste wedstrijd');
    } else if (now === 'show_qr') {
      h = kop(`<div class="mt-lbl">Vandaag</div><h3>Laat dit zien bij de ingang<em>.</em></h3>
        <p>Zet je scherm op de felste stand. Lukt scannen niet? Noem de check-in-code.</p>
        ${c.checkin && qrSrc(c.checkin.qr_svg) ? `<div class="mt-rij"><button type="button" class="mt-knop accent" data-qr="${esc(c.team_id)}">Toon de QR groot</button></div>` : ''}`);
      h += schemaStuk(c, gespeeld(c) ? 'Jouw volgende wedstrijd' : 'Jouw eerste wedstrijd');
    } else if (now === 'checked_in') {
      h = `<div class="mt-lbl">Je bent binnen</div><h3>Ingecheckt${c.checkin && c.checkin.checked_in_time ? ` om ${esc(c.checkin.checked_in_time)}` : ''}<em>.</em></h3>`;
      h += schemaStuk(c, 'Jouw eerste wedstrijd');
    } else if (now === 'match') {
      h = schemaStuk(c, gespeeld(c) ? 'Jouw volgende wedstrijd' : 'Jouw eerste wedstrijd');
      if (c.checkin && c.checkin.checked_in_time) h += `<p class="klein">Ingecheckt om ${esc(c.checkin.checked_in_time)}.</p>`;
    } else {   // done
      const f = c.final;
      if (f && Number.isInteger(f.pos)) {
        h = kop(`<div class="mt-lbl">Eindstand</div><h3>${f.pos === 1 ? 'Kampioen' : `${esc(f.pos)}e plek`}<em>.</em></h3>
          <p>${f.pos === 1 ? `${solo ? 'Je hebt' : 'Jullie hebben'} gewonnen. Gefeliciteerd!` : `${solo ? 'Je bent' : 'Jullie zijn'} ${esc(f.pos)}e geworden${Number.isInteger(f.of) ? ` van de ${esc(f.of)}` : ''}.`}</p>`);
      } else {
        h = kop(`<div class="mt-lbl">Geweest</div><h3>Het zit erop<em>.</em></h3><p>Bedankt voor het meedoen.</p>`);
      }
      const url = c.survey && typeof c.survey.url === 'string' && /^\/feedback(\?[A-Za-z0-9._~=&%-]*)?$/.test(c.survey.url) ? c.survey.url : '';
      if (url) h += `<div class="mt-lbl">Hoe was het?</div><p>Vertel het ons in twee minuten. Daar wordt de volgende keer beter van.</p>
        <div class="mt-rij"><a class="mt-knop accent" href="${esc(url)}">Vul de enquête in</a></div>`;
    }
    if (!h.trim()) return '';   // de gids zei het al en er is verder niets te melden
    const wie = meerKaarten && nuEerst(c) ? `<div class="mt-wie mono">${[c.sport && c.sport.name, c.name].filter(Boolean).map(esc).join(' · ')}</div>` : '';
    return `<section class="mt-nu" aria-label="Wat nu telt">${wie}${h}</section>`;
  }

  // ── "Wat nu?" van JVO Smart ────────────────────────────────────────────────
  // Met meer aanmeldingen staat de strook bij één kaart: wie nu of straks vandaag speelt gaat
  // voor, dan een kaart waar je zelf nog iets moet doen (code bewaren), dan wie door is, dan de rest.
  let gidsKaart = null;
  // Onder deze sleutel onthoudt het toestel wat je afvinkte: de teamcode (nummers beginnen na een schone start opnieuw).
  const wieVan = (c) => String(c.team_code || c.team_id);
  function kiesGidsKaart(cards) {
    if (!G) return null;
    const ok = cards.map((c, i) => ({ c, i, s: c.gids ? G.stapVanNu(c.gids, wieVan(c)) : null })).filter(x => x.s);
    const rang = (x) => { const r = x.c.gids.regel, n = r && Number.isInteger(r.rang) ? r.rang : 3; return n <= 1 ? n : (x.s.zelf && x.c._kind === 'own' ? 1.5 : n); };
    const tijd = (x) => { const w = x.c.gids.regel && x.c.gids.regel.wanneer; return w && Number(w.exp_ms) > 0 ? Number(w.exp_ms) : Infinity; };
    ok.sort((a, b) => rang(a) - rang(b) || tijd(a) - tijd(b) || a.i - b.i);
    return ok.length ? ok[0].c.team_id : null;
  }
  // Meldingen aanbieden: alleen als de server zegt dat het kan, dit toestel het kan en ze nog
  // uit staan. De tik brengt je naar het bestaande vak met de knop; aan gaat het nooit vanzelf.
  function meldAanbod(c) {
    if (!c.gids || !c.gids.aanbod || !c.gids.aanbod.meld || !pushKan()) return false;
    const st = meldStaat();
    return st.kaarten.some(k => k.team_id === c.team_id) && !kaartAan(c, st.perm);
  }
  function watNu(c) {
    if (!G || gidsKaart !== c.team_id || !c.gids) return { html: '', dekt: false };
    const stap = G.stapVanNu(c.gids, wieVan(c));
    if (!stap) return { html: '', dekt: false };
    const own = c._kind === 'own';
    const html = G.strook(c.gids, { teamId: c.team_id, wie: wieVan(c), meld: meldAanbod(c), kan: { deel: own && !c.solo && !!c.team_code, qr: !!(c.checkin && qrSrc(c.checkin.qr_svg)) } });
    return { html, dekt: !!html && !!stap.dekt && stap.dekt === (c.now || c.status) };
  }

  function acties(c) {
    const url = c.board && typeof c.board.url === 'string' && /^\/(sporten|toernooi)([?#][A-Za-z0-9._~=&%#-]*)?$/.test(c.board.url) ? c.board.url : '';
    const knoppen = [];
    if (url && c.status === 'approved') knoppen.push(`<a class="mt-knop" href="${esc(url)}">Bekijk het hele bord</a>`);
    if (!c.solo && c.team_code && c.status !== 'rejected' && c.status !== 'revoked') knoppen.push(`<button type="button" class="mt-knop rustig" data-deel="${esc(c.team_id)}">Laat je team meekijken</button>`);
    if (!knoppen.length) return '';
    return `<div class="mt-acties">${knoppen.join('')}<p class="mt-status" data-deel-msg="${esc(c.team_id)}" role="status" aria-live="polite"></p></div>`;
  }

  function blok(c, ev) {
    const w = wedstrijden(c), s = stand(c), g = watNu(c);
    return `<section class="mt-blok${c.now === 'show_qr' ? ' qr-eerst' : ''}${nuEerst(c) ? ' nu-eerst' : ''}" id="mt-team-${esc(c.team_id)}" data-team="${esc(c.team_id)}" tabindex="-1">
      <div class="mt-links">${pas(c)}${eersteTip && eersteTip === c.team_id ? '<p class="mt-tip"><a href="#mt-install" data-naar="mt-install">Zet deze app op je beginscherm</a></p>' : ''}${acties(c)}</div>
      <div class="mt-rechts">${g.html}${nu(c, ev, g.dekt)}${w || s ? `<div class="mt-onderdelen">${w}${s}</div>` : ''}</div>
    </section>`;
  }

  // Meer dan één aanmelding: bovenaan één korte strook met per aanmelding het ene ding dat nu
  // telt (bezig → eerstvolgende wedstrijd op tijd → de rest), met een sprong naar de kaart.
  const KORT = { pending: 'Ontvangen', waitlist: 'Wachtlijst', rejected: 'Afgewezen', revoked: 'Ingetrokken' };
  function kortRij(c) {
    const s = c.schedule, sp = c.sport || {};
    const m = s && s.state === 'ready' ? (s.live || s.next) : null;
    let groot, rest = '', plek = '', rang = 3, tijd = '';
    if (m && m.status === 'live') {
      groot = m.score ? `${m.score[0]}–${m.score[1]}` : 'Bezig'; rang = 0;
      rest = `<em class="mt-live">Live</em> tegen ${esc((m.opponent && m.opponent.name) || 'nog niet bekend')}`; plek = m.place || '';
    } else if (m && c.now !== 'done') {
      groot = m.expected || m.time || 'Straks'; rang = 1; tijd = m.expected || m.time || '99:99';
      const d = Number(m.delay) || 0;
      rest = `tegen ${esc((m.opponent && m.opponent.name) || 'nog niet bekend')}${d >= 3 ? ` · ${esc(uitloop(d))}` : ''}`; plek = m.place || '';
    } else if (c.now === 'done') {
      const f = c.final; groot = f && Number.isInteger(f.pos) ? (f.pos === 1 ? 'Kampioen' : `${f.pos}e plek`) : 'Klaar';
    } else if (KORT[c.status]) {
      groot = KORT[c.status];
    } else if (c.now === 'show_qr') {
      groot = 'Check in'; rest = 'laat je QR zien bij de ingang';
    } else {
      groot = !s || s.state === 'none' ? 'Schema volgt' : (s.state === 'not_in_schedule' ? 'Nog niet ingedeeld' : 'Geen wedstrijd');
      if (s && s.paused) rest = 'pauze';
    }
    const html = `<a class="mt-kort-rij${rang === 3 ? ' tekst' : ''}" href="#mt-team-${esc(c.team_id)}" data-naar="mt-team-${esc(c.team_id)}">
        <b>${esc(groot)}</b><img src="${esc(veiligIcoon(sp.icon_small))}" alt="" />
        <span><i lang="nl">${esc(sp.name || c.name)}</i>${rest ? ` ${rest}` : ''}</span><em class="mono">${esc(plek)}</em></a>`;
    return { html, rang, tijd };
  }
  function kort(cards) {
    if (cards.length < 2) return '';
    const rijen = cards.map((c, i) => ({ ...kortRij(c), i })).sort((a, b) => a.rang - b.rang || (a.tijd < b.tijd ? -1 : a.tijd > b.tijd ? 1 : 0) || a.i - b.i);
    return `<nav class="mt-kort" id="mt-kort" aria-label="Al je aanmeldingen in het kort"><div class="mt-lbl">Nu en straks</div>${rijen.map(r => r.html).join('')}</nav>`;
  }

  function subTekst(ev) {
    if (!ev) return BASIS_SUB;
    const d = ev.date_text || BASIS_SUB;
    if (ev.over) return `${d} · geweest`;
    if (ev.today) return ev.days_left === 0 ? `${d} · vandaag` : 'Vandaag';
    if (Number.isInteger(ev.days_left)) return `${d} · nog ${ev.days_left} ${ev.days_left === 1 ? 'dag' : 'dagen'}`;
    return d;
  }

  // ── Tekenen ────────────────────────────────────────────────────────────────
  let sig = '', eersteTip = null;
  function render() {
    const cards = state ? state.cards.slice().sort((a, b) => (a._kind === b._kind ? 0 : (a._kind === 'own' ? -1 : 1)) || a.team_id - b.team_id) : [];
    const leeg = !cards.length;
    const geenKaart = state && state.stale && leeg;   // sleutel aanwezig, maar nog nooit iets geladen
    $('mt-leeg').hidden = !(leeg && !geenKaart);
    $('mt-toestel').hidden = !keys.length && leeg;
    $('mt-meld').hidden = leeg; $('mt-extra').hidden = false;
    const alleSolo = cards.length > 0 && cards.every(c => c.solo);
    meerKaarten = cards.length > 1;
    eersteTip = cards.length && installToon() ? cards[0].team_id : null;
    gidsKaart = kiesGidsKaart(cards);
    const gk = gidsKaart != null ? cards.find(c => c.team_id === gidsKaart) : null;
    const gidsStaat = gk ? [gidsKaart, (G.stapVanNu(gk.gids, wieVan(gk)) || {}).id, meldAanbod(gk)] : 0;
    const kop = alleSolo ? 'Mijn aanmelding' : 'Mijn team';
    $('mt-install-uitleg').textContent = `Dan open je ${alleSolo ? 'je aanmelding' : 'Mijn team'} en het live-bord met één tik, ook zonder internet.`;
    $('mt-kop').firstChild.nodeValue = kop;
    document.title = BASIS_TITEL.replace(/^Mijn team/, kop);
    $('mt-sub').textContent = subTekst(state && state.event);
    const net = $('mt-net');
    net.hidden = !(state && state.stale);
    if (state && state.stale) net.textContent = state.druk ? 'Even druk' : (state.at ? `Offline · ${tijdVan(state.at)}` : 'Offline');

    const nieuw = JSON.stringify([cards.map(kaal), state && state.event, [...bewaard], geenKaart, !!(state && state.stale), state && state.stale ? [state.at, !!state.druk] : 0, eersteTip, paginaKlaar, gidsStaat]);
    if (nieuw !== sig) {
      sig = nieuw;
      const fq = document.activeElement && document.activeElement.closest ? document.activeElement.closest('#mt-app [data-qr], #mt-app [data-deel]') : null;
      const fsel = fq ? (fq.hasAttribute('data-qr') ? `${fq.tagName}[data-qr="${fq.dataset.qr}"]` : `[data-deel="${fq.dataset.deel}"]`) : '';
      let html = '';
      if (geenKaart) html = `<p class="mt-melding">${state.druk ? 'Het is even druk. Probeer het over een paar minuten opnieuw.' : 'Geen verbinding. Open deze pagina één keer met internet; daarna zie je je kaart en QR ook zonder.'}</p>`;
      else if (state && state.stale && state.at) html = `<p class="mt-melding">${state.druk ? 'Het is even druk; dit' : 'Geen verbinding. Dit'} is je kaart van ${esc(tijdVan(state.at))}. Je QR werkt gewoon.</p>`;
      html += kort(cards) + cards.map(c => blok(c, state.event)).join('');
      app.innerHTML = html;
      for (const c of cards) {
        const ph = app.querySelector(`[data-ring="${c.team_id}"]`);
        if (ph) ph.replaceWith(ringNode(c));
      }
      if (fsel) { const el = app.querySelector(fsel); if (el) el.focus({ preventScroll: true }); }
      if (G) G.tikWanneer();
    }
    if (deelZeg && deelZeg.tot > Date.now()) { const el = app.querySelector(`[data-jg-zeg="${deelZeg.id}"]`) || app.querySelector(`[data-deel-msg="${deelZeg.id}"]`); if (el && el.textContent !== deelZeg.tekst) el.textContent = deelZeg.tekst; }
    renderMeld();
    renderSleutel();
    renderInstall();
    streamNodig();
    if (cards.length && (wijsTeam != null || wijsPush)) {
      const t = wijsTeam, p = wijsPush;
      wijsTeam = null; wijsPush = false;
      setTimeout(() => {
        const doel = p ? $('mt-meld') : (t != null ? $('mt-team-' + t) : null);
        if (!doel) return;
        try { doel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch { doel.scrollIntoView(); }
        if (p) {
          doel.classList.add('wijs'); setTimeout(() => doel.classList.remove('wijs'), 6000);
          const st = meldStaat();
          if (st.kan && !st.alle) meldMsg('Tik op ‘Zet meldingen aan’ om een seintje te krijgen.');
        }
      }, 250);
    }
  }

  // ── De QR groot in beeld ───────────────────────────────────────────────────
  let grootTerug = null, wakker = null;
  function toonGroot(id) {
    const c = state && state.cards.find(x => x.team_id === id);
    const src = c && c.checkin ? qrSrc(c.checkin.qr_svg) : '';
    if (!src) return;
    grootTerug = document.activeElement;
    $('mt-groot-naam').textContent = c.name;
    $('mt-groot-img').src = src;
    $('mt-groot-code').textContent = c.checkin.code || '';
    $('mt-groot').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    $('mt-groot-dicht').focus();
    // Scherm wakker houden zolang de QR in beeld staat (waar de browser dat kan).
    try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(w => { wakker = w; }).catch(() => {}); } catch {}
  }
  function sluitGroot() {
    if ($('mt-groot').hidden) return;
    $('mt-groot').hidden = true;
    document.documentElement.style.overflow = '';
    try { if (wakker) wakker.release(); } catch {}
    wakker = null;
    if (grootTerug && grootTerug.isConnected && grootTerug.focus) grootTerug.focus();
    grootTerug = null;
  }
  $('mt-groot-dicht').addEventListener('click', sluitGroot);
  $('mt-groot').addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); $('mt-groot-dicht').focus(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sluitGroot(); });

  // ── Laat je team meekijken: de teamcode als link ───────────────────────────
  let deelZeg = null;   // { id, tekst, tot }: de regel na het delen blijft staan als de pagina hertekent
  async function deel(id, knop) {
    const c = state && state.cards.find(x => x.team_id === id);
    if (!c || !c.team_code) return false;
    const vanGids = !!(knop && knop.closest && knop.closest('[data-jg-wat]'));
    const zeg = (t) => { deelZeg = { id, tekst: t, tot: Date.now() + 12000 }; const el = (vanGids && app.querySelector(`[data-jg-zeg="${id}"]`)) || app.querySelector(`[data-deel-msg="${id}"]`); if (el) el.textContent = t; };
    const url = `${location.origin}/mijn#c=${encodeURIComponent(c.team_code)}`;
    const tekst = `Kijk mee met ${c.name}: status, QR voor de check-in en onze wedstrijden. Teamcode ${c.team_code}.`;
    try {
      if (navigator.share) { await navigator.share({ title: c.name, text: tekst, url }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    let ok = false;
    try { await navigator.clipboard.writeText(`${tekst} ${url}`); zeg('Link gekopieerd. Plak hem in je teamgroep.'); ok = true; }
    catch { zeg(`Geef je teamgenoten de teamcode ${c.team_code}. Die typen ze op de pagina Mijn team.`); }
    if (knop && knop.isConnected) knop.focus();
    return ok;
  }
  function spring(id) {
    const doel = $(id);
    if (!doel || doel.hidden) return;
    try { doel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch { doel.scrollIntoView(); }
    if (doel.classList.contains('mt-vak')) { doel.classList.add('wijs'); setTimeout(() => doel.classList.remove('wijs'), 4000); }
    try { doel.focus({ preventScroll: true }); } catch {}
  }
  app.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.vouw) vouw.set(d.dataset.vouw, d.open); }, true);
  app.addEventListener('click', (e) => {
    // De knoppen van "Wat nu?": afvinken, delen, de QR groot, naar het vak met de meldingen.
    if (G && G.klik(e, { opnieuw: (act) => { if (act !== 'deel') deelZeg = null; sig = ''; render(); }, deel: (id, knop) => deel(id, knop), qr: (id) => toonGroot(id), meld: () => spring('mt-meld') })) return;
    const n = e.target.closest('[data-naar]');
    if (n) { e.preventDefault(); spring(n.dataset.naar); return; }
    const q = e.target.closest('[data-qr]');
    if (q) { toonGroot(Number(q.dataset.qr)); return; }
    const d = e.target.closest('[data-deel]');
    if (d) deel(Number(d.dataset.deel), d);
  });

  // ── Meldingen (opt-in push; zelfde routes als het bord) ────────────────────
  const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isApp = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
  const pushKan = () => ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  let meldTimer = null;
  function meldMsg(t) {
    clearTimeout(meldTimer);
    $('mt-meld-msg').textContent = t || '';
    if (t) meldTimer = setTimeout(() => { $('mt-meld-msg').textContent = ''; }, 10000);
  }
  function urlB64(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const raw = atob((base64String + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function huidigeSub() {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function zorgSub() {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const bestaand = await reg.pushManager.getSubscription();
    if (bestaand) return bestaand;
    const { publicKey } = await (await fetch('/api/push/public-key')).json();
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(publicKey) });
  }
  async function abonneer(teamId, sub, sleutel) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (sleutel) headers.Authorization = 'Bearer ' + sleutel;
      const r = await fetch('/api/team-follow/subscribe', { method: 'POST', headers, body: JSON.stringify({ team_id: teamId, subscription: sub }) });
      if (!r.ok) return { ok: false };
      const j = await r.json().catch(() => ({}));
      return { ok: true, waiting: !!j.waiting };
    } catch { return { ok: false }; }
  }
  const meldKaarten = () => (state ? state.cards.filter(c => c.push && c.push.available && c.follow) : []);
  function kaartAan(c, perm) {
    if (perm !== 'granted') return false;
    if (c.status === 'approved' && !meld.has(c.team_id)) {
      const kind = bordVan(c), e = lijst(kind).find(t => t.id === c.team_id);
      return bordAan(kind) && !!e && !e.wacht;
    }
    return meld.has(c.team_id);
  }
  function meldStaat() {
    const kaarten = meldKaarten();
    const perm = ('Notification' in window) ? Notification.permission : 'default';
    const aan = kaarten.filter(c => kaartAan(c, perm));
    return { kan: kaarten.length > 0, kaarten, aan, alle: kaarten.length > 0 && aan.length === kaarten.length, perm };
  }
  function renderMeld() {
    const s = meldStaat();
    if (!s.kan) { $('mt-meld').hidden = true; return; }
    $('mt-meld').hidden = false;
    const klaar = s.aan.filter(c => c.status !== 'approved');
    const st = $('mt-meld-st');
    st.textContent = s.alle ? (klaar.length === s.aan.length ? 'Klaargezet' : 'Aan') : (s.aan.length ? 'Deels aan' : 'Uit');
    st.classList.toggle('aan', s.aan.length > 0);
    const wacht = s.kaarten.some(c => c.status !== 'approved');
    let t;
    if (!pushKan()) {
      t = isIos() && !isApp() ? 'Op een iPhone werken meldingen alleen in de app op je beginscherm. Zet hem daar eerst neer; daarna kun je ze hier aanzetten.'
        : 'Dit toestel ondersteunt hier geen meldingen. Je ziet alles ook op deze pagina.';
    } else if (s.alle) {
      t = 'Meldingen staan aan op dit toestel. Uitzetten kan altijd met de knop hieronder.'
        + (klaar.length ? ` Voor ${klaar.map(c => c.name).join(' en ')} staan ze klaar: het besluit ${klaar.every(zonderMail) ? 'zie je hier' : 'krijg je per mail'}, vanaf de eerste wedstrijd komen de meldingen vanzelf.` : '');
    } else if (s.aan.length) {
      t = 'Voor een deel van je aanmeldingen staan meldingen aan. Tik op ‘Zet meldingen aan’ voor de rest.';
    } else {
      t = 'Krijg een seintje op je telefoon als je moet spelen en bij de uitslag. Dat gaat alleen aan als jij op de knop tikt en je browser toestemming geeft; uitzetten kan altijd.'
        + (wacht ? ` Je kunt ze nu al klaarzetten; het besluit zelf ${s.kaarten.filter(c => c.status !== 'approved').every(zonderMail) ? 'zie je hier' : 'krijg je per mail'}.` : '');
    }
    $('mt-meld-uitleg').textContent = t;
    $('mt-meld-aan').hidden = !pushKan() || s.alle;
    $('mt-meld-uit').hidden = !(s.aan.length || bordAan('sporten') || bordAan('toernooi') || meld.size);
  }
  async function meldAan() {
    const s = meldStaat();
    if (!s.kan || !pushKan()) return;
    const btn = $('mt-meld-aan'); btn.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { meldMsg('Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je browser.'); return; }
      const sub = await zorgSub();
      if (!sub) { meldMsg('Meldingen aanzetten lukte niet. Probeer het opnieuw.'); return; }
      const body = sub.toJSON();
      let goed = true;
      const perBord = new Map();   // bord → { heel: lukte alles?, iets: lukte er iets? }
      const bord = (kind) => { if (!perBord.has(kind)) perBord.set(kind, { heel: true, iets: false }); return perBord.get(kind); };
      for (const c of s.kaarten) {
        const kind = bordVan(c), b = bord(kind);
        const r = await abonneer(c.team_id, body, c._key && c._key.k);
        const l = lijst(kind); const e = l.find(t => t.id === c.team_id);
        if (!r.ok) {
          // Niet gelukt: dit team mag op het bord niet als "aan" tellen.
          goed = false; b.heel = false;
          if (e && kind === 'sporten') { e.wacht = true; bewaarLijst(kind, l); }
          continue;
        }
        b.iets = true;
        if (r.waiting || c.status !== 'approved') { meld.add(c.team_id); continue; }
        meld.delete(c.team_id);
        if (e) delete e.wacht; else l.push(volgRij(c));
        bewaarLijst(kind, l);
      }
      // "Meldingen aan" geldt per bord voor de hele volglijst: ook de andere gevolgde teams abonneren.
      const eigen = new Set(s.kaarten.map(c => c.team_id));
      for (const [kind, b] of perBord) {
        const l = lijst(kind);
        for (const t of l) {
          if (eigen.has(t.id) || (bordAan(kind) && !t.wacht)) continue;
          const r = await abonneer(t.id, body);
          if (r.ok) { delete t.wacht; b.iets = true; } else { b.heel = false; goed = false; if (kind === 'sporten') t.wacht = true; }
        }
        bewaarLijst(kind, l);
        // Het bord van één toernooi kent geen "wacht": daar alleen aan als alles lukte.
        if (kind === 'sporten' ? b.iets : b.heel) ls.set(BORD[kind].push, '1');
      }
      bewaarMeld();
      meldMsg(goed ? 'Meldingen staan aan.' : 'Voor een deel lukte het net niet. Probeer het over een minuutje opnieuw.');
    } catch { meldMsg('Meldingen aanzetten lukte niet. Probeer het opnieuw.'); }
    finally { btn.disabled = false; renderMeld(); }
  }
  // Uitzetten moet écht bij de server aankomen; het geldt voor dit hele toestel.
  async function meldUit() {
    const btn = $('mt-meld-uit'); btn.disabled = true;
    try {
      const sub = await huidigeSub().catch(() => null);
      if (sub) {
        const r = await fetch('/api/team-follow/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (!r.ok) { meldMsg('Uitzetten lukte net niet. Probeer het zo nog een keer.'); return; }
      }
      for (const kind of Object.keys(BORD)) {
        ls.del(BORD[kind].push);
        const l = lijst(kind); let anders = false;
        for (const t of l) if (t.wacht) { delete t.wacht; anders = true; }
        if (anders) bewaarLijst(kind, l);
      }
      meld = new Set(); bewaarMeld();
      meldMsg('Meldingen staan uit op dit toestel, ook voor andere teams die je volgde.');
    } catch { meldMsg('Uitzetten lukte net niet. Probeer het zo nog een keer.'); }
    finally { btn.disabled = false; renderMeld(); }
  }
  $('mt-meld-aan').addEventListener('click', meldAan);
  $('mt-meld-uit').addEventListener('click', meldUit);

  // ── Op je beginscherm ──────────────────────────────────────────────────────
  let installVraag = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installVraag = e; render(); });
  window.addEventListener('appinstalled', () => { installVraag = null; ls.set(TIP, '1'); render(); });
  // Alleen als er nog iets te beleven valt: bij enkel afgewezen/ingetrokken aanmeldingen niet.
  function installToon() {
    const mobiel = isIos() || /Android/i.test(navigator.userAgent || '');
    return !isApp() && ls.get(TIP) !== '1' && (mobiel || !!installVraag) && !!(state && state.cards.some(c => /^(approved|pending|waitlist)$/.test(c.status)));
  }
  function renderInstall() {
    const box = $('mt-install');
    const ios = isIos(), mobiel = ios || /Android/i.test(navigator.userAgent || '');
    const toon = installToon();
    box.hidden = !toon;
    if (!toon) return;
    $('mt-install-ios').hidden = !ios;
    $('mt-install-android').hidden = ios || !!installVraag || !mobiel;
    $('mt-install-knop').hidden = !installVraag;
  }
  $('mt-install-weg').addEventListener('click', () => { ls.set(TIP, '1'); render(); });
  $('mt-install-knop').addEventListener('click', async () => {
    if (!installVraag) return;
    try { installVraag.prompt(); await installVraag.userChoice; } catch {}
    installVraag = null; render();
  });

  // ── De sleutel op dit toestel ──────────────────────────────────────────────
  function renderSleutel() {
    const a = state && state.account;
    const kijkt = keys.length > 0 && keys.every(k => k.kind === 'view');
    $('mt-sleutel-uitleg').textContent = a && a.email
      ? `Je bent hier als ${a.name ? `${a.name} (${a.email})` : a.email}. Dit toestel onthoudt je sleutel, zodat je niet hoeft in te loggen.`
      : (kijkt ? 'Je kijkt mee met een teamcode. Dit toestel onthoudt hem, zodat je hem niet opnieuw hoeft te typen.'
        : 'Dit toestel onthoudt je sleutel, zodat je niet hoeft in te loggen.' + (alleenCode() ? ' Bewaar ook je teamcode: op een ander toestel, of als dit toestel hem kwijtraakt, kom je er alleen daarmee weer in.' : ''));
  }
  // Alle eigen aanmeldingen hier zijn zonder e-mail gedaan: dan is de teamcode de enige weg terug.
  const alleenCode = () => { const eigen = state ? state.cards.filter(c => c._kind === 'own') : []; return eigen.length > 0 && eigen.every(zonderMail); };
  const wegKnoppen = (vraag) => { $('mt-weg').hidden = vraag; $('mt-weg-ja').hidden = !vraag; $('mt-weg-nee').hidden = !vraag; };
  $('mt-weg').addEventListener('click', () => { wegKnoppen(true); $('mt-weg-msg').textContent = alleenCode()
    ? 'Weet je het zeker? Je kaart en QR verdwijnen van dit toestel. Alleen met je teamcode kom je er weer in: heb je die bewaard?'
    : 'Weet je het zeker? Je kaart en QR verdwijnen van dit toestel. Met je link of teamcode kom je er altijd weer in. De link zelf blijft werken; een link in je browsergeschiedenis wis je daar.'; $('mt-weg-nee').focus(); });
  $('mt-weg-nee').addEventListener('click', () => { wegKnoppen(false); $('mt-weg-msg').textContent = ''; $('mt-weg').focus(); });
  $('mt-weg-ja').addEventListener('click', async () => {
    const btn = $('mt-weg-ja'); btn.disabled = true;
    const ids = new Set([...(state ? state.cards.map(c => c.team_id) : []), ...keys.flatMap(k => k.teams)]);
    // Meldingen voor de eigen teams uitschrijven (lukt dat niet, dan blijft de uit-knop op het bord).
    try {
      const sub = await huidigeSub().catch(() => null);
      if (sub) for (const id of ids) {
        await fetch('/api/team-follow/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, team_id: id }) }).catch(() => {});
      }
    } catch {}
    for (const kind of Object.keys(BORD)) {
      const l = lijst(kind), rest = l.filter(t => !ids.has(t.id));
      if (rest.length !== l.length) { bewaarLijst(kind, rest); if (!rest.length) ls.del(BORD[kind].push); }
    }
    const zonder = alleenCode();
    meld = new Set(); bewaarMeld();
    keys = []; bewaarKeys(); ls.del(CACHE); ls.del(STAD);
    state = null; bewaard = new Set(); sig = ''; vouw.clear();
    await veegLinkCache();   // ook de kopie van de geopende link in de cache van de service worker
    btn.disabled = false; wegKnoppen(false); $('mt-weg-msg').textContent = '';
    zetMelding('Je sleutel en je kaart zijn van dit toestel verwijderd.' + (zonder ? ' Met je teamcode kom je er weer in.' : ' Opende je een link uit je mail? Die kan nog in je browsergeschiedenis staan: wis die als je dit toestel deelt.'));
    render();
    try { window.scrollTo(0, 0); } catch {}
  });

  // ── Erin met een teamcode, of de link laten mailen ─────────────────────────
  async function metCode(code, foutEl, knop) {
    foutEl.textContent = '';
    const schoon = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Hoe de code eruitziet zegt de server (bij aanmelden met alleen een stad begint hij met de stad).
    const vorm = ($('mt-code-form') && $('mt-code-form').dataset.codeHint) || '';
    if (!schoon) { foutEl.textContent = vorm ? `Typ je teamcode: ${vorm}.` : 'Typ je teamcode. Die heeft 8 tekens.'; return false; }
    if (knop) knop.disabled = true;
    try {
      const r = await fetch('/api/mijn/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: schoon }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && isJwt(j.key)) {
        voegSleutelToe(j.key, 'view');
        if (Number.isInteger(j.team_id)) wijsTeam = j.team_id;
        zetMelding('');
        await laad();
        return true;
      }
      foutEl.textContent = j.offline ? 'Geen verbinding. Probeer het zo opnieuw.' : (j.error || 'Dat lukte niet. Probeer het opnieuw.');
    } catch { foutEl.textContent = 'Geen verbinding. Probeer het zo opnieuw.'; }
    finally { if (knop) knop.disabled = false; }
    return false;
  }
  function codeFormulier(form, input, fout, knop) {
    $(form).addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await metCode($(input).value, $(fout), $(knop))) { $(input).value = ''; const d = $('mt-extra'); if (d) d.open = false; }
    });
    $(input).addEventListener('input', () => { $(fout).textContent = ''; });
  }
  codeFormulier('mt-code-form', 'mt-code', 'mt-code-fout', 'mt-code-knop');
  codeFormulier('mt-code-form2', 'mt-code2', 'mt-code-fout2', 'mt-code-knop2');

  if (MAIL_KAN) $('mt-link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fout = $('mt-link-fout'), ok = $('mt-link-ok'), knop = $('mt-link-knop');
    fout.textContent = ''; ok.textContent = '';
    const email = $('mt-mail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) { fout.textContent = 'Vul het e-mailadres in waarmee je je hebt aangemeld.'; return; }
    knop.disabled = true;
    try {
      const r = await fetch('/api/mijn/stuur-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) ok.textContent = 'Als dit adres bij ons bekend is, is de link onderweg. Kijk ook even in je spam.';
      else fout.textContent = j.offline ? 'Geen verbinding. Probeer het zo opnieuw.' : (j.error || 'Dat lukte niet. Probeer het opnieuw.');
    } catch { fout.textContent = 'Geen verbinding. Probeer het zo opnieuw.'; }
    finally { knop.disabled = false; }
  });
  if (MAIL_KAN && $('mt-mail')) $('mt-mail').addEventListener('input', () => { $('mt-link-fout').textContent = ''; });

  // ── Verversen: bij terugkomst, elke minuut, en bij een seintje van het bord ──
  let seinTimer = null, wachtOpZicht = false;
  function sein() {
    if (seinTimer) return;
    if (document.hidden) { wachtOpZicht = true; return; }
    const wacht = Math.max(Math.random() * 4000, laatst + 3000 - Date.now());
    seinTimer = setTimeout(() => { seinTimer = null; laad(); }, wacht);
  }
  let es = null, esTimer = null;
  function streamNodig() {
    const nodig = !!(state && state.cards.some(c => c.schedule && c.schedule.state === 'ready'));
    if (!nodig || es || esTimer || typeof EventSource === 'undefined') return;
    try { es = new EventSource('/api/tournament/stream?lite=1'); } catch { es = null; return; }
    es.addEventListener('update', sein);
    es.addEventListener('error', () => {
      if (!es || es.readyState !== 2) return;   // de browser probeert het zelf opnieuw
      try { es.close(); } catch {}
      es = null;
      esTimer = setTimeout(() => { esTimer = null; if (!document.hidden) streamNodig(); }, 30000 + Math.random() * 30000);
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (wachtOpZicht || Date.now() - laatst > 15000) { wachtOpZicht = false; laad(); }
    streamNodig();
  });
  setInterval(() => { if (!document.hidden && Date.now() - laatst > 55000) laad(); }, 60000);
  window.addEventListener('online', () => laad());
  window.addEventListener('offline', () => laad());

  // ── Start ──────────────────────────────────────────────────────────────────
  // Eerst de bewaarde kaart tonen (meteen iets in beeld, ook zonder verbinding), dan verversen.
  async function start() {
    const cache = keys.length ? leesCache() : null;
    if (cache && cache.cards.length) {
      const cards = cache.cards.filter(c => c && Number.isInteger(c.team_id)).map(c => ({ ...c, _key: keys.find(k => k.teams.includes(c.team_id)) || null, _oud: true }));
      state = { cards, event: cache.event || null, account: cache.account || null, at: cache.at || null, stale: false };
      bewaard = new Set(cards.filter(c => c.checkin && typeof c.checkin.qr_svg === 'string').map(c => c.team_id));
      render();
    }
    if (linkKapot) zetMelding(MAIL_KAN ? 'Deze link is niet compleet. Open hem opnieuw vanuit je mail, of gebruik je teamcode.' : 'Deze link is niet compleet. Gebruik je teamcode.');
    if (startCode) {
      const ok = await metCode(startCode, $('mt-code-fout'), null);
      if (!ok) { $('mt-code').value = startCode.toUpperCase(); if (keys.length) { const d = $('mt-extra'); d.open = true; $('mt-code2').value = startCode.toUpperCase(); $('mt-code-fout2').textContent = $('mt-code-fout').textContent; } }
      startCode = '';
      if (ok) return;
    }
    await laad();
  }
  start();
  bewaarPagina();
  // Een link geopend terwijl de pagina al open staat (alleen de # verandert): zelfde weg.
  window.addEventListener('hashchange', () => { if (binnenkomst()) { zetMelding(''); start(); } });
})();
