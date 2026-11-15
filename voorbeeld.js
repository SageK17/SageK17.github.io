// Kijkversie: er is geen server. Gegevens komen uit /api/*.json (opgenomen testgegevens).
// Inloggen, een profiel kiezen, de poortjes en "mijn plek" bij de crew doen alsof: elke code,
// elke pas en elk wachtwoord werkt. Al het andere opslaan en wijzigen wordt geweigerd.
(function () {
  var BEKEND = ["admin_audit","admin_competitions","admin_crew-posts","admin_event-config","admin_feedback_summary","admin_logo-mails_preview","admin_logos","admin_overview","admin_profielen","admin_profielen_beheer","admin_profile","admin_push-prefs","admin_push-texts","admin_regie","admin_registrations","admin_reminders_status","admin_rules","admin_smart_learnings","admin_teams-lite","admin_teams","admin_tournament-statuses","admin_tournament_eventday-mails_preview","admin_tournament_feedback-mails_preview","admin_tournament_program-info_preview","admin_tournament_qr-mails_preview","competitions","config","crew_me","hub","mijn","mijn_kijk","push_public-key","smart_flags","tournament","tournament_competition_2","tournament_competition_3","tournament_competition_4","tournament_competition_5","tournament_competition_6","tournament_competition_7"];
  var V = {"login":{"kies_profiel":true,"voortoken":"voorbeeld","profielen":[{"id":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen"},{"id":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw"},{"id":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje"}],"aanmaken":"open"},"profielen":{"actief":true,"profielen":[{"id":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen"},{"id":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw"},{"id":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje"}],"aanmaken":"open","kan_starten":false,"toernooi_live":true},"ik":{"1":{"profielen_actief":true,"profielen_uit":false,"hub_mode":true,"kan_starten":false,"server_nu":1794731512332,"naam":"Sam Voorbeeld","profiel":{"id":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje","is_hoofd":true,"is_eigenaar":true},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":true},"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":{"vragen":"kwartier","warm":true,"warm_tot_ms":1794732412331},"mag":{"aanwezigheid":true},"vraag":["Sam Voorbeeld"],"herstel_env":false},"2":{"profielen_actief":true,"profielen_uit":false,"hub_mode":true,"kan_starten":false,"server_nu":1794731512387,"naam":"Noor Voorbeeld","profiel":{"id":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw","is_hoofd":true,"is_eigenaar":false},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":false},"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":{"vragen":"kwartier","warm":true,"warm_tot_ms":1794732412387},"mag":{"aanwezigheid":true},"vraag":["Sam Voorbeeld"],"herstel_env":false},"3":{"profielen_actief":true,"profielen_uit":false,"hub_mode":true,"kan_starten":false,"server_nu":1794731512442,"naam":"Daan Voorbeeld","profiel":{"id":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen","is_hoofd":false,"is_eigenaar":false},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":false},"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":{"vragen":"kwartier","warm":true,"warm_tot_ms":1794732412442},"mag":{"aanwezigheid":false},"vraag":["Sam Voorbeeld"],"herstel_env":false}},"kleuren":["blauw","oranje","groen","paars","turkoois","geel","roze","grijs"],"geenToegang":{"error":"Je mag niet in Veiligheid. Vraag Sam Voorbeeld om toegang.","code":"geen_toegang","wijk":"veiligheid","vraag":["Sam Voorbeeld"]},"poortBinnen":{"ok":true,"wijk":"sport","wijk_tot_ms":1794732412506,"server_nu":1794731512507,"al_binnen":true,"pas":{"vragen":"kwartier","warm":true,"warm_tot_ms":1794732412506}},"wwNodig":{"error":"Vul het wachtwoord van Veiligheid in.","code":"wachtwoord_nodig"},"poortOpen":{"ok":true,"wijk":"sport","wijk_tot_ms":1794732412506,"server_nu":1794731512506,"pas":{"vragen":"kwartier","warm":true,"warm_tot_ms":1794732412506}},"poortDicht":{"error":"De poort van Mensen is dicht. Toets je pas in.","code":"poort_dicht","wijk":"mensen","wijken":["mensen"]},"hartslag":{"ok":true,"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":{"vragen":"kwartier","warm":true,"warm_tot_ms":1794732412506},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":true},"is_hoofd":true,"aanmaken":"open","server_nu":1794731512511},"alleenHoofd":{"error":"Dit kan alleen een hoofd van de organisatie.","code":"alleen_hoofd"},"aanwezig":[{"pid":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen","plek":"mensen","seconden_geleden":0,"sinds_ms":1794731512833},{"pid":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw","plek":"toernooi","seconden_geleden":0,"sinds_ms":1794731512779},{"pid":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje","plek":null,"seconden_geleden":0,"sinds_ms":1794731512726}],"crewPost":{"ok":true,"post":{"competition_id":2,"field":1},"match":{"match_id":95,"mine":true},"ttl_seconds":90,"live_ttl_seconds":600,"server_now":1794731512915,"operators":[{"match_id":95,"competition_id":2,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-15T08:31:52.914Z","seconds_ago":0}],"posts":[{"competition_id":2,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-15T08:31:52.913Z"}]},"crewClaim":{"ok":true,"mine":true,"took_over":null,"ttl_seconds":90,"live_ttl_seconds":600,"server_now":1794731512914,"operators":[{"match_id":95,"competition_id":2,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-15T08:31:52.914Z","seconds_ago":0}],"posts":[{"competition_id":2,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-15T08:31:52.913Z"}]},"crewRelease":{"ok":true,"released":true,"ttl_seconds":90,"live_ttl_seconds":600,"server_now":1794731512916,"operators":[],"posts":[{"competition_id":2,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-15T08:31:52.913Z"}]},"registerTeam":{"ok":true,"team_id":1,"team_status":"pending","mijn":{"key":"voorbeeld.voorbeeld.voorbeeld","team_code":"K7M3-PA9Q"}},"registerBezoeker":{"ok":true,"team_id":null,"team_status":null,"mijn":null},"mijnCodeFout":{"error":"Een teamcode heeft 8 tekens, bijvoorbeeld K7M3-PA9Q.","code":"length"},"mijnKijkTeam":9,"mijnTeams":[1,43]};
  var REGEL = {"admin_rules":{"w":["evenement"]},"admin_logos":{"w":["sport","mensen"]},"admin_tournament_schedule-config":{"w":["toernooi"]},"admin_audit_wedstrijden":{"w":["toernooi"]},"admin_registrations":{"w":["mensen"]},"admin_teams":{"w":["mensen"]},"admin_crew-posts":{"w":["mensen","toernooi"]},"admin_reminders_status":{"w":["communicatie"]},"admin_reminders-auto":{"w":["communicatie"]},"admin_tournament_prize-announce_preview":{"w":["communicatie"]},"admin_tournament_program-info_preview":{"w":["communicatie"]},"admin_tournament_qr-mails_preview":{"w":["communicatie"]},"admin_tournament_eventday-mails_preview":{"w":["communicatie"]},"admin_tournament_feedback-mails_preview":{"w":["communicatie"]},"admin_feedback_summary":{"w":["communicatie"]},"admin_push-prefs":{"w":["communicatie"]},"admin_push-texts":{"w":["communicatie"]},"admin_logo-mails_preview":{"w":["communicatie","sport"]},"admin_system-overview":{"w":["veiligheid"]},"admin_export_backup":{"w":["veiligheid"]},"admin_audit":{"w":["veiligheid"]},"admin_marketing-list.csv":{"w":["veiligheid"]},"admin_backup.zip":{"w":["veiligheid"]},"admin_db-snapshot":{"w":["veiligheid"]},"admin_profielen_beheer":{"w":["veiligheid"]}};          // opgenomen admin-GET → afdeling(en) waar de poort voor open moet staan
  var WEIGER = 'Dit is een voorbeeld om te bekijken: opslaan en wijzigen werkt hier niet.';
  var WIJKNAAM = { evenement: 'Evenement', sport: 'Sport', toernooi: 'Toernooien', mensen: 'Mensen', communicatie: 'Communicatie', veiligheid: 'Veiligheid' };
  var PAS = { vragen: 'elke_wijk', warm: false, warm_tot_ms: null };   // het poortje vraagt hier bij elke afdeling je pas
  var MIN = 60000;
  var echt = window.fetch.bind(window);
  function kloon(o) { return JSON.parse(JSON.stringify(o)); }
  function antwoord(obj, status) { return Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })); }
  function sleutel(pq) { return pq.replace(/^\/api\//, '').replace(/[^A-Za-z0-9._-]+/g, '_'); }
  function bestand(k) { return echt('/api/' + k + '.json', { cache: 'no-cache' }); }
  function alsJson(k, pas) { return bestand(k).then(function (r) { return r.json(); }).then(function (j) { return antwoord(pas ? (pas(j) || j) : j); }); }

  // ── Wat de kijkversie zelf onthoudt (alleen in deze browser) ────────────────
  var geheugen = {};
  function lees(k) { try { var v = localStorage.getItem(k); return v == null ? (geheugen[k] || null) : JSON.parse(v); } catch (e) { return geheugen[k] || null; } }
  function schrijf(k, v) { geheugen[k] = v; try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var MIJN_EIGEN = 'voorbeeld.voorbeeld.voorbeeld', MIJN_KIJK = 'meekijken.voorbeeld.voorbeeld';
  try {
    // crew en check-in: meteen binnen (uitloggen en opnieuw inloggen kan met elke naam en code)
    if (!localStorage.getItem('jvo_crew_token')) { localStorage.setItem('jvo_crew_token', 'voorbeeld'); localStorage.setItem('jvo_crew_name', 'Voorbeeld'); }
    localStorage.setItem('jvo_crew_install_seen', '1');
    // admin: je loopt zelf door code → profiel → pas. Een login zonder gekozen profiel telt niet.
    var a0 = lees('kijk_admin');
    if (localStorage.getItem('jvo_admin_token') && !(a0 && a0.pid && V.ik[a0.pid])) localStorage.removeItem('jvo_admin_token');
    // Mijn team: één keer een voorbeeldsleutel klaarzetten (weghalen op de pagina blijft weg)
    if (/^\/mijn(\.html)?$/.test(location.pathname) && !localStorage.getItem('kijk_mijn_gezet')) {
      localStorage.setItem('kijk_mijn_gezet', '1');
      if (!localStorage.getItem('jvo_mijn')) localStorage.setItem('jvo_mijn', JSON.stringify({ v: 1, keys: [{ k: MIJN_EIGEN, kind: 'own', scope: 'address', since: Date.now(), teams: V.mijnTeams }] }));
    }
  } catch (e) {}

  // ── Admin: profiel, poort, hartslag ────────────────────────────────────────
  function staat() { var s = lees('kijk_admin'); return s && typeof s === 'object' ? s : {}; }
  function zet(s) { schrijf('kijk_admin', s); }
  function ikNu() {
    var s = staat();
    if (!s.pid || !V.ik[s.pid]) return null;
    var ik = kloon(V.ik[s.pid]), nu = Date.now();
    ik.server_nu = nu;
    ik.sessie = s.wijk && s.tot > nu ? { wijk: s.wijk, wijk_tot_ms: s.tot } : { wijk: null, wijk_tot_ms: null };
    ik.pas = kloon(PAS);
    if (s.kleur) ik.profiel.kleur = s.kleur;
    return ik;
  }
  var nodig = function () { return antwoord({ error: 'Kies eerst je profiel.', code: 'profiel_nodig' }, 401); };
  function schuif(wijk) { var s = staat(); if (s.wijk === wijk && wijk !== 'veiligheid' && s.tot > Date.now()) { s.tot = Date.now() + 30 * MIN; zet(s); } }
  function admin(m, pad, b) {
    var ik, s, nu = Date.now(), r;
    if (pad === '/api/admin/login/modus') return antwoord({ profielen: true });
    if (m === 'POST' && pad === '/api/admin/login') {
      if (!b.code) return antwoord({ error: 'Vul de admincode in.' }, 400);
      return antwoord(kloon(V.login));
    }
    if (m === 'GET' && pad === '/api/admin/profielen') return antwoord(kloon(V.profielen));
    if (m === 'POST' && pad === '/api/admin/profielen/kies') {
      var id = String(b.profiel_id);
      if (!V.ik[id]) return antwoord({ error: 'Dit profiel bestaat niet (meer).', code: 'profiel_onbekend' }, 404);
      if (!/^\d{4}$/.test(String(b.pas == null ? '' : b.pas))) return antwoord({ error: 'Een pas is precies 4 cijfers.', code: 'pas_ongeldig' }, 400);
      zet({ pid: id, wijk: null, tot: 0, sinds: nu });
      ik = ikNu();
      return antwoord({ token: 'voorbeeld', naam: ik.naam, ik: ik });
    }
    if (m === 'POST' && pad === '/api/admin/uitloggen') { zet(null); return antwoord({ ok: true }); }
    ik = ikNu();
    if (pad === '/api/admin/ik') {
      if (!ik) return nodig();
      if (m === 'GET') return antwoord(ik);
      if (m === 'PUT' && b.kleur && V.kleuren.indexOf(b.kleur) >= 0) { s = staat(); s.kleur = b.kleur; zet(s); return antwoord({ ik: ikNu() }); }
      return antwoord({ error: WEIGER }, 403);
    }
    if (!ik) return nodig();
    if (m === 'POST' && pad === '/api/admin/ik/pas') {
      if (b.alleen_toets === true) return antwoord({ ok: true, toets: true });
      return antwoord({ error: WEIGER }, 403);
    }
    if (m === 'POST' && pad === '/api/admin/poort') {
      var w = b.wijk;
      if (!Object.prototype.hasOwnProperty.call(ik.toegang, w)) return antwoord({ error: 'Deze afdeling bestaat niet.', code: 'wijk_onbekend' }, 400);
      if (!ik.toegang[w]) { r = kloon(V.geenToegang); r.wijk = w; return antwoord(r, 403); }
      var geheim = w === 'veiligheid' ? b.wachtwoord : b.pas;
      s = staat();
      if (geheim == null || geheim === '') {
        if (ik.sessie.wijk === w) { schuif(w); r = kloon(V.poortBinnen); r.wijk = w; r.wijk_tot_ms = staat().tot; r.server_nu = nu; r.pas = kloon(PAS); return antwoord(r); }
        return w === 'veiligheid' ? antwoord(kloon(V.wwNodig), 400) : antwoord({ error: 'Toets je pas van 4 cijfers in.', code: 'pas_nodig' }, 400);
      }
      if (w !== 'veiligheid' && !/^\d{4}$/.test(String(geheim))) return antwoord({ error: 'Een pas is precies 4 cijfers.', code: 'pas_ongeldig' }, 400);
      s.wijk = w; s.tot = nu + (w === 'veiligheid' ? 15 : 30) * MIN; s.sinds = nu; zet(s);
      r = kloon(V.poortOpen); r.wijk = w; r.wijk_tot_ms = s.tot; r.server_nu = nu; r.pas = kloon(PAS);
      return antwoord(r);
    }
    if (m === 'POST' && pad === '/api/admin/poort/sluit') { s = staat(); s.wijk = null; s.tot = 0; s.sinds = nu; zet(s); return antwoord({ ok: true }); }
    if (m === 'POST' && pad === '/api/admin/hartslag') {
      if (b.plek && b.plek === ik.sessie.wijk) schuif(b.plek);
      ik = ikNu();
      r = kloon(V.hartslag); r.sessie = ik.sessie; r.pas = ik.pas; r.toegang = ik.toegang; r.is_hoofd = !!(ik.profiel.is_hoofd || ik.profiel.is_eigenaar); r.server_nu = nu;
      return antwoord(r);
    }
    if (m === 'GET' && pad === '/api/admin/aanwezigheid') {
      if (!(ik.profiel.is_hoofd || ik.profiel.is_eigenaar)) return antwoord(kloon(V.alleenHoofd), 403);
      s = staat();
      var lijst = kloon(V.aanwezig).map(function (a, i) {
        if (String(a.pid) === String(s.pid)) { a.plek = ik.sessie.wijk; a.seconden_geleden = 0; a.sinds_ms = s.sinds || nu; a.kleur = ik.profiel.kleur; }
        else { a.plek = a.plek || 'evenement'; a.seconden_geleden = 4 + i * 5; a.sinds_ms = nu - (6 + i * 5) * MIN; }
        return a;
      });
      return antwoord({ aanwezig: lijst, server_nu: nu });
    }
    if (m !== 'GET') return antwoord({ error: WEIGER }, 403);
    // Gegevens van een afdeling: alleen als de poort van die afdeling open staat (zoals de echte server).
    var k = sleutel(pad), regel = REGEL[k];
    if (regel && regel.w) {
      var mag = regel.w.filter(function (x) { return ik.toegang[x]; });
      if (!mag.length) { r = kloon(V.geenToegang); r.wijk = regel.w[0]; r.error = 'Je mag niet in ' + (WIJKNAAM[regel.w[0]] || 'deze afdeling') + '. Vraag Sam Voorbeeld om toegang.'; return antwoord(r, 403); }
      if (!ik.sessie.wijk || mag.indexOf(ik.sessie.wijk) < 0) {
        r = kloon(V.poortDicht); r.wijk = mag[0]; r.wijken = mag;
        r.error = mag[0] === 'veiligheid' ? 'De poort van Veiligheid is dicht. Vul het wachtwoord in.' : 'De poort van ' + WIJKNAAM[mag[0]] + ' is dicht. Toets je pas in.';
        return antwoord(r, 403);
      }
      schuif(ik.sessie.wijk);
    }
    if (BEKEND.indexOf(k) < 0) return antwoord({ error: 'Dit is een voorbeeld om te bekijken: dit onderdeel (downloaden of een los voorbeeld) zit er niet in.' }, 403);
    if (k === 'admin_profielen_beheer') return alsJson(k, function (j) { j.pas_vragen = PAS.vragen; j.server_nu = nu; });
    // Het plein telt 'zonder bediener' met de klok van nu; het crew-overzicht moet dat ook doen,
    // anders springt het aantal zodra je een afdeling opent.
    if (k === 'admin_crew-posts') return alsJson(k, function (j) { j.server_now = nu; });
    return bestand(k);
  }

  // ── Crew: mijn plek, bediening, hartslag ───────────────────────────────────
  function crewNaam() { try { return String(localStorage.getItem('jvo_crew_name') || 'Voorbeeld'); } catch (e) { return 'Voorbeeld'; } }
  function crewSnap(basis) {
    var c = lees('kijk_crew') || {}, nu = Date.now(), r = kloon(basis);
    var sinds = new Date(c.sinds || nu).toISOString();
    r.server_now = nu;
    r.posts = c.post ? [{ competition_id: c.post.competition_id, field: c.post.field, name: crewNaam(), mine: true, since: sinds }] : [];
    r.operators = c.match ? [{ match_id: c.match, competition_id: c.post ? c.post.competition_id : null, field: c.post ? c.post.field : null, name: crewNaam(), mine: true, since: new Date(c.matchSinds || nu).toISOString(), seconds_ago: 0 }] : [];
    return r;
  }
  function crew(m, pad, b) {
    var c = lees('kijk_crew') || {}, nu = Date.now(), r, mt;
    if (m === 'POST' && pad === '/api/crew/login') {
      if (!b.code || !b.name || String(b.name).trim().length < 2) return antwoord({ error: 'Vul je naam en de crew-code in.' }, 400);
      return antwoord({ token: 'voorbeeld', name: b.name });
    }
    if (m === 'GET' && pad === '/api/crew/me') return antwoord({ ok: true, name: crewNaam() });
    if (m === 'POST' && pad === '/api/crew/post') {
      if (b.competition_id == null || b.competition_id === '') c.post = null;
      else { var np = { competition_id: Number(b.competition_id), field: b.field == null || b.field === '' ? null : Number(b.field) };
        if (!c.post || c.post.competition_id !== np.competition_id || c.post.field !== np.field) c.sinds = nu; c.post = np; }
      if (b.match_id != null && b.match_id !== '') { if (c.match !== Number(b.match_id)) c.matchSinds = nu; c.match = Number(b.match_id); }
      schrijf('kijk_crew', c);
      r = crewSnap(V.crewPost); r.post = c.post; r.match = b.match_id != null && b.match_id !== '' ? { match_id: Number(b.match_id), mine: true } : null;
      return antwoord(r);
    }
    if (m === 'POST' && (mt = /^\/api\/crew\/match\/(\d+)\/(claim|release)$/.exec(pad))) {
      if (mt[2] === 'claim') { c.match = Number(mt[1]); c.matchSinds = nu; schrijf('kijk_crew', c); return antwoord(crewSnap(V.crewClaim)); }
      if (c.match === Number(mt[1])) c.match = null; schrijf('kijk_crew', c); return antwoord(crewSnap(V.crewRelease));
    }
    if (m === 'POST' && pad === '/api/crew/leave') { schrijf('kijk_crew', null); return antwoord({ ok: true }); }
    return null;
  }

  // ── De nep-fetch ───────────────────────────────────────────────────────────
  function kop(o, u, naam) {
    var h = (o && o.headers) || (u && u.headers) || null;
    if (!h) return '';
    if (typeof h.get === 'function') return h.get(naam) || '';
    for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k) && k.toLowerCase() === naam.toLowerCase()) return String(h[k]);
    return '';
  }
  window.fetch = function (u, o) {
    var s = typeof u === 'string' ? u : (u && u.url) || String(u || '');
    var m = String((o && o.method) || (u && typeof u === 'object' && u.method) || 'GET').toUpperCase();
    var p = s.replace(location.origin, '');
    if (p.indexOf('/api/') !== 0) return echt(u, o);
    var pad = p.split('?')[0].split('#')[0], b = {};
    if (o && typeof o.body === 'string') { try { b = JSON.parse(o.body) || {}; } catch (e) { b = {}; } }
    try {
      if (pad.indexOf('/api/admin/') === 0 && pad.indexOf('/api/admin/tournament/match/') !== 0) return admin(m, pad, b);
      if (pad.indexOf('/api/crew/') === 0) { var c = crew(m, pad, b); if (c) return c; }
      if (pad === '/api/mijn' && m === 'GET') {
        var sl = kop(o, u, 'authorization').replace(/^Bearer\s+/i, '');
        if (!sl) return antwoord({ error: 'Geen sleutel.' }, 400);
        return bestand(sl.indexOf('meekijken') === 0 ? 'mijn_kijk' : 'mijn');
      }
      if (m === 'POST' && pad === '/api/mijn/code') {
        var code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 8) return antwoord(kloon(V.mijnCodeFout), 400);
        return antwoord({ key: MIJN_KIJK, team_id: V.mijnKijkTeam });
      }
      if (m === 'POST' && pad === '/api/mijn/stuur-link') return antwoord({ ok: true });
      if (m === 'POST' && pad === '/api/register') {
        if (!b.full_name || String(b.full_name).trim().length < 2) return antwoord({ error: 'Vul je volledige naam in.', field: 'full_name' }, 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(b.email || ''))) return antwoord({ error: 'Vul een geldig e-mailadres in.', field: 'email' }, 400);
        return antwoord(kloon(b.register_team ? V.registerTeam : V.registerBezoeker));   // er wordt niets bewaard of verstuurd
      }
    } catch (e) { return antwoord({ error: 'Er ging iets mis in de voorbeeldversie.' }, 500); }
    if (m !== 'GET') return antwoord({ error: WEIGER }, 403);
    var k = sleutel(p), k2 = sleutel(pad);
    var kies = BEKEND.indexOf(k) >= 0 ? k : (BEKEND.indexOf(k2) >= 0 ? k2 : null);
    if (!kies) return antwoord({});
    return bestand(kies);
  };

  // Geen live-verbinding en geen service worker in de kijkversie.
  function NepBron() { this.readyState = 1; }
  NepBron.prototype.addEventListener = function () {}; NepBron.prototype.removeEventListener = function () {}; NepBron.prototype.close = function () {};
  window.EventSource = NepBron;
  try { if (navigator.serviceWorker) { navigator.serviceWorker.register = function () { return new Promise(function () {}); };
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {}); } } catch (e) {}

  // Een smalle balk bovenaan, op elke pagina: dit is een voorbeeld.
  var WERK = /^\/(admin|wedstrijd|checkin|omroep|print|mijn)(\.html)?$/.test(location.pathname);
  var ORANJE = 'background:#FF6B1A;color:#06193A;font:600 12px/1.35 system-ui,sans-serif;text-align:center';
  document.addEventListener('DOMContentLoaded', function () {
    var balk = document.createElement('div');
    balk.id = 'kijk-balk';
    balk.setAttribute('role', 'note');
    balk.setAttribute('style', 'position:sticky;top:0;z-index:2147483000;padding:7px 12px;' + ORANJE);
    var smal = window.innerWidth < 620;
    if (smal && !WERK) balk.style.fontSize = '11px';   // op de telefoon: één regel, mét de weg terug
    balk.appendChild(document.createTextNode(WERK ? 'Voorbeeld met testgegevens · wijzigen werkt hier niet'
      : smal ? 'Voorbeeld · niets wordt bewaard of gemaild' : 'Voorbeeld met testgegevens · er wordt niets bewaard of gemaild'));
    // Werkschermen op de telefoon houden één regel; de openbare pagina's krijgen altijd de weg terug.
    if (!WERK || !smal) {
      balk.appendChild(document.createTextNode(' · '));
      var a = document.createElement('a'); a.href = '/alles'; a.textContent = 'alle schermen'; a.setAttribute('style', 'color:#06193A;text-decoration:underline;white-space:nowrap');
      balk.appendChild(a);
    }
    document.body.insertBefore(balk, document.body.firstChild);
    aangemeld();
  });

  // Aanmeldpagina: het scherm "Je bent aangemeld" mag niet zeggen dat er gemaild is.
  function aangemeld() {
    var vak = document.getElementById('success');
    if (!vak || typeof MutationObserver !== 'function') return;
    function zetTekst(el, t) { if (el && el.textContent !== t) el.textContent = t; }
    function eerlijk() {
      if (vak.style.display === 'none') return;
      var msg = document.getElementById('success-msg'), mail = document.getElementById('success-mijn-mail'), extra = document.getElementById('success-extra');
      if (!document.getElementById('kijk-aangemeld') && msg && msg.parentNode) {
        var n = document.createElement('p');
        n.id = 'kijk-aangemeld';
        n.setAttribute('role', 'note');
        n.setAttribute('style', 'margin:14px 0 0;padding:10px 12px;border-radius:12px;border:1.5px solid #FF6B1A;background:rgba(255,107,26,.12);font:600 14px/1.4 system-ui,sans-serif;text-align:center');
        n.textContent = 'Dit is een voorbeeld: je aanmelding is niet bewaard en er is geen mail verstuurd.';
        msg.parentNode.insertBefore(n, msg.nextSibling);
      }
      if (msg) zetTekst(msg, msg.textContent
        .replace(/; het besluit krijg je ook per mail\./, '. In het echt krijg je het besluit ook per mail.')
        .replace(/\s*Check je inbox voor een bevestiging\./, ' In het echt krijg je een bevestiging per mail.')
        .replace(/\s*Je krijgt een bevestiging in je inbox\./, ' In het echt krijg je een bevestiging per mail.'));
      if (mail) zetTekst(mail, mail.textContent
        .replace(/We hebben je link ook gemaild naar [^\s]+\.(?=\s|$)/, 'In het echt krijg je je link ook per mail. Hier is niets verstuurd.')
        .replace(/ of de link in je mail\./, '.')
        .replace(/\s*De link staat ook in je mail\./, ''));
      if (extra && extra.style.display !== 'none') extra.style.display = 'none';   // de zin over de spam-map
    }
    new MutationObserver(eerlijk).observe(vak, { attributes: true, attributeFilter: ['style', 'hidden'], childList: true, subtree: true, characterData: true });
    eerlijk();
  }
})();
