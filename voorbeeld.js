// Kijkversie: er is geen server. Gegevens komen uit /api/*.json (opgenomen voorbeeldgegevens).
// Inloggen, een profiel kiezen, de poortjes en "mijn plek" bij de crew doen alsof: elke code,
// elke pas en elk wachtwoord werkt. Aanmelden met een stad doet ook alsof: jouw stad staat daarna
// in dit toestel (alleen hier) op het bord en in de admin. Al het andere opslaan wordt geweigerd.
(function () {
  var BEKEND = ["admin_audit","admin_audit_wedstrijden","admin_competitions","admin_crew-posts","admin_event-config","admin_feedback_summary","admin_logo-mails_preview","admin_logos","admin_overview","admin_profielen_beheer","admin_profile","admin_push-prefs","admin_push-texts","admin_regie","admin_registrations","admin_reminders-auto","admin_reminders_status","admin_rules","admin_smart_learnings","admin_teams","admin_teams-lite","admin_tournament-statuses","admin_tournament_eventday-mails_preview","admin_tournament_feedback-mails_preview","admin_tournament_prize-announce_preview","admin_tournament_program-info_preview","admin_tournament_qr-mails_preview","admin_tournament_schedule-config","competitions","config","crew_me","hub","mijn","mijn_kijk","push_public-key","smart_flags","tournament","tournament_competition_1","tournament_competition_2","tournament_competition_3"];
  var NA = ["hub","competitions","tournament","tournament_competition_1","tournament_competition_2","tournament_competition_3","admin_teams","admin_teams-lite","admin_competitions","admin_overview","admin_regie","admin_tournament-statuses","admin_crew-posts","mijn_stad"];                 // deze gegevens bestaan ook "na jouw aanmelding" (/api/na/…)
  var STATUS = {"admin_tournament_prize-announce_preview":409,"admin_logo-mails_preview":409};         // opgenomen antwoorden die geen 200 waren
  var V = {"loginEenvoudig":{"s":200,"j":{"token":"voorbeeld","name":"Beheerder","admin_stand":"eenvoudig"}},"loginZonderCode":{"s":400,"j":{"error":"Vul de admincode in."}},"ikGeen":{"s":200,"j":{"profielen_actief":false,"profielen_uit":false,"hub_mode":true,"kan_starten":true,"server_nu":1795353721008,"naam":"Beheerder","profiel":null,"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":true},"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":null,"mag":{"aanwezigheid":false},"herstel_env":false}},"profielenGeen":{"s":200,"j":{"actief":false,"profielen":[],"aanmaken":"open","kan_starten":true,"toernooi_live":true}},"beheerGeen":{"s":409,"j":{"error":"Er zijn nog geen profielen op deze installatie.","code":"profielen_inactief"}},"crewLoginFout":{"s":400,"j":{"error":"Vul je naam en de crew-code in."}},"mijnCodeKort":{"s":400,"j":{"error":"Een teamcode ziet eruit als STAD-7K4PXQ: de eerste letters van je stad, een streepje en 6 tekens.","code":"length"}},"mijnGeenSleutel":{"s":400,"j":{"error":"Geen sleutel meegestuurd.","code":"no_key"}},"mijnFouteSleutel":{"s":401,"j":{"error":"Deze link werkt niet meer. Open Mijn team met je teamcode.","code":"key_invalid"}},"zoekKort":{"s":400,"j":{"error":"Typ minstens 2 tekens."}},"mijnTeam":2,"mijnKijkTeam":10,"zoek":[{"id":1,"name":"Amsterdam","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true},{"id":9,"name":"Amsterdam","competition_id":2,"competition":"Dames","poule":"A","checked_in":true},{"id":8,"name":"Den Haag","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":11,"name":"Den Haag","competition_id":2,"competition":"Dames","poule":"A","checked_in":false},{"id":4,"name":"Eindhoven","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":6,"name":"Enschede","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":12,"name":"Enschede","competition_id":2,"competition":"Dames","poule":"A","checked_in":false},{"id":5,"name":"Groningen","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true},{"id":13,"name":"Leiden","competition_id":2,"competition":"Dames","poule":"A","checked_in":true},{"id":2,"name":"Rotterdam","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":3,"name":"Utrecht","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true},{"id":10,"name":"Utrecht","competition_id":2,"competition":"Dames","poule":"A","checked_in":true},{"id":7,"name":"Zwolle","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true}],"zoekNa":[{"id":1,"name":"Amsterdam","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true},{"id":9,"name":"Amsterdam","competition_id":2,"competition":"Dames","poule":"B","checked_in":true},{"id":8,"name":"Den Haag","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":11,"name":"Den Haag","competition_id":2,"competition":"Dames","poule":"B","checked_in":false},{"id":4,"name":"Eindhoven","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":6,"name":"Enschede","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":12,"name":"Enschede","competition_id":2,"competition":"Dames","poule":"A","checked_in":false},{"id":5,"name":"Groningen","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true},{"id":15,"name":"Haarlem","competition_id":2,"competition":"Dames","poule":"A","checked_in":false},{"id":13,"name":"Leiden","competition_id":2,"competition":"Dames","poule":"B","checked_in":true},{"id":2,"name":"Rotterdam","competition_id":3,"competition":"Jongens","poule":"B","checked_in":true},{"id":3,"name":"Utrecht","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true},{"id":10,"name":"Utrecht","competition_id":2,"competition":"Dames","poule":"A","checked_in":true},{"id":7,"name":"Zwolle","competition_id":3,"competition":"Jongens","poule":"A","checked_in":true}],"stadLeeg":{"s":400,"j":{"error":"Vul je stad in.","field":"city","code":"city"}},"stadOnbekend":{"s":400,"j":{"error":"\"Voorbeeldstad\" staat niet in de lijst. Kies een naam uit de lijst.","field":"city","code":"city_unknown"}},"stadGeenCat":{"s":400,"j":{"error":"Kies eerst een categorie.","field":"competition_id"}},"stadGestart":{"s":409,"j":{"error":"Jongens is al begonnen. Aanmelden kan niet meer; vraag het de organisatie.","code":"started"}},"stadLokveld":{"s":200,"j":{"ok":true,"team_id":null,"team_status":null,"mijn":null}},"stadKlaar":{"s":200,"j":{"ok":true,"team_id":15,"team_status":"approved","team_name":"Haarlem","city":"Haarlem","numbered":false,"competition":{"id":2,"name":"Dames"},"mijn":{"key":"aangemeld.voorbeeld.voorbeeld","team_code":"HAARL-36YMW4"},"draw":{"state":"ready","poule":"A","mates":["Utrecht","Enschede"],"can_change":true}}},"stad":{"naam":"Haarlem","comp":2,"code":"HAARL-36YMW4","al":["Amsterdam","Den Haag","Enschede","Leiden","Utrecht"]},"steden":["Almelo","Almere","Amersfoort","Amsterdam","Apeldoorn","Arnhem","Breda","Den Haag","Deventer","Dordrecht","Eindhoven","Enschede","Groningen","Haarlem","Hengelo","Leeuwarden","Leiden","Maastricht","Nijmegen","Rotterdam","Tilburg","Utrecht","Zaanstad","Zwolle"],"login":{"s":200,"j":{"kies_profiel":true,"voortoken":"voorbeeld","profielen":[{"id":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen"},{"id":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw"},{"id":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje"}],"aanmaken":"open"}},"profielen":{"s":200,"j":{"actief":true,"profielen":[{"id":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen"},{"id":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw"},{"id":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje"}],"aanmaken":"open","kan_starten":false,"toernooi_live":true}},"profielNodig":{"s":401,"j":{"error":"Kies eerst je profiel.","code":"profiel_nodig"}},"kiesOnbekend":{"s":404,"j":{"error":"Dit profiel bestaat niet (meer).","code":"profiel_onbekend"}},"kiesPasOngeldig":{"s":400,"j":{"error":"Een pas is precies 4 cijfers.","code":"pas_ongeldig"}},"ik":{"1":{"profielen_actief":true,"profielen_uit":false,"hub_mode":true,"kan_starten":false,"server_nu":1795353722341,"naam":"Sam Voorbeeld","profiel":{"id":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje","is_hoofd":true,"is_eigenaar":true},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":true},"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":{"vragen":"elke_wijk","warm":false,"warm_tot_ms":null},"mag":{"aanwezigheid":true},"geblokkeerd":[],"vraag":["Sam Voorbeeld"],"herstel_env":false},"2":{"profielen_actief":true,"profielen_uit":false,"hub_mode":true,"kan_starten":false,"server_nu":1795353722398,"naam":"Noor Voorbeeld","profiel":{"id":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw","is_hoofd":true,"is_eigenaar":false},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":false},"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":{"vragen":"elke_wijk","warm":false,"warm_tot_ms":null},"mag":{"aanwezigheid":true},"vraag":["Sam Voorbeeld"],"herstel_env":false},"3":{"profielen_actief":true,"profielen_uit":false,"hub_mode":true,"kan_starten":false,"server_nu":1795353722453,"naam":"Daan Voorbeeld","profiel":{"id":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen","is_hoofd":false,"is_eigenaar":false},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":false},"sessie":{"wijk":null,"wijk_tot_ms":null},"pas":{"vragen":"elke_wijk","warm":false,"warm_tot_ms":null},"mag":{"aanwezigheid":false},"vraag":["Sam Voorbeeld"],"herstel_env":false}},"poortDicht":{"s":403,"j":{"error":"De poort van Mensen is dicht. Toets je pas in.","code":"poort_dicht","wijk":"mensen","wijken":["mensen"]}},"pasNodig":{"s":400,"j":{"error":"Toets je pas van 4 cijfers in.","code":"pas_nodig"}},"pasOngeldig":{"s":400,"j":{"error":"Een pas is precies 4 cijfers.","code":"pas_ongeldig"}},"wijkOnbekend":{"s":400,"j":{"error":"Deze afdeling bestaat niet.","code":"wijk_onbekend"}},"wwNodig":{"s":400,"j":{"error":"Vul het wachtwoord van Veiligheid in.","code":"wachtwoord_nodig"}},"geenToegang":{"s":403,"j":{"error":"Je mag niet in Veiligheid. Vraag Sam Voorbeeld om toegang.","code":"geen_toegang","wijk":"veiligheid","vraag":["Sam Voorbeeld"]}},"alleenHoofd":{"s":403,"j":{"error":"Dit kan alleen een hoofd van de organisatie.","code":"alleen_hoofd"}},"poortOpen":{"s":200,"j":{"ok":true,"wijk":"sport","wijk_tot_ms":1795355522512,"server_nu":1795353722512,"pas":{"vragen":"elke_wijk","warm":false,"warm_tot_ms":null}}},"poortBinnen":{"s":200,"j":{"ok":true,"wijk":"sport","wijk_tot_ms":1795355522512,"server_nu":1795353722513,"al_binnen":true,"pas":{"vragen":"elke_wijk","warm":false,"warm_tot_ms":null}}},"hartslag":{"s":200,"j":{"ok":true,"sessie":{"wijk":"sport","wijk_tot_ms":1795355522512},"pas":{"vragen":"elke_wijk","warm":false,"warm_tot_ms":null},"toegang":{"evenement":true,"sport":true,"toernooi":true,"mensen":true,"communicatie":true,"veiligheid":true},"is_hoofd":true,"aanmaken":"open","server_nu":1795353722629,"geblokkeerd":[]}},"aanwezig":{"s":200,"j":{"aanwezig":[{"pid":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen","plek":"mensen","seconden_geleden":0,"sinds_ms":1795353722626},{"pid":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw","plek":"toernooi","seconden_geleden":0,"sinds_ms":1795353722569},{"pid":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje","plek":"sport","seconden_geleden":0,"sinds_ms":1795353722512}],"server_nu":1795353722630}},"wissel":{"s":200,"j":{"ok":true,"voortoken":"voorbeeld","profielen":[{"id":3,"naam":"Daan Voorbeeld","functie":"Vrijwilliger","initialen":"DV","kleur":"groen"},{"id":2,"naam":"Noor Voorbeeld","functie":"Hoofd Toernooien","initialen":"NV","kleur":"blauw"},{"id":1,"naam":"Sam Voorbeeld","functie":"Directie","initialen":"SV","kleur":"oranje"}],"aanmaken":"open"}},"crewPost":{"s":200,"j":{"ok":true,"post":{"competition_id":3,"field":1},"match":null,"ttl_seconds":90,"live_ttl_seconds":600,"server_now":1795353722928,"operators":[],"posts":[{"competition_id":3,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-22T13:22:02.928Z"}]}},"crewClaim":{"s":200,"j":{"ok":true,"mine":true,"took_over":null,"ttl_seconds":90,"live_ttl_seconds":600,"server_now":1795353722929,"operators":[{"match_id":7,"competition_id":3,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-22T13:22:02.929Z","seconds_ago":0}],"posts":[{"competition_id":3,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-22T13:22:02.928Z"}]}},"crewRelease":{"s":200,"j":{"ok":true,"released":true,"ttl_seconds":90,"live_ttl_seconds":600,"server_now":1795353722931,"operators":[],"posts":[{"competition_id":3,"field":1,"name":"Voorbeeld","mine":true,"since":"2026-11-22T13:22:02.928Z"}]}},"kleuren":["blauw","oranje","groen","paars","turkoois","geel","roze","grijs"]};
  var REGEL = {"admin_rules":{"w":["evenement"]},"admin_logos":{"w":["sport","mensen"]},"admin_tournament_schedule-config":{"w":["toernooi"]},"admin_audit_wedstrijden":{"w":["toernooi"]},"admin_registrations":{"w":["mensen"]},"admin_teams":{"w":["mensen"]},"admin_crew-posts":{"w":["mensen","toernooi"]},"admin_reminders_status":{"w":["communicatie"]},"admin_reminders-auto":{"w":["communicatie"]},"admin_tournament_prize-announce_preview":{"w":["communicatie"]},"admin_tournament_program-info_preview":{"w":["communicatie"]},"admin_tournament_qr-mails_preview":{"w":["communicatie"]},"admin_tournament_eventday-mails_preview":{"w":["communicatie"]},"admin_tournament_feedback-mails_preview":{"w":["communicatie"]},"admin_feedback_summary":{"w":["communicatie"]},"admin_push-prefs":{"w":["communicatie"]},"admin_push-texts":{"w":["communicatie"]},"admin_logo-mails_preview":{"w":["communicatie","sport"]},"admin_system-overview":{"w":["veiligheid"]},"admin_export_backup":{"w":["veiligheid"]},"admin_audit":{"w":["veiligheid"]},"admin_marketing-list.csv":{"w":["veiligheid"]},"admin_backup.zip":{"w":["veiligheid"]},"admin_db-snapshot":{"w":["veiligheid"]},"admin_profielen_beheer":{"w":["veiligheid"]}};           // opgenomen admin-GET → afdeling(en) waar de poort voor open moet staan
  var BASIS = 1795353720770;            // het moment van opnemen: de klok van de kijkversie begint daar
  var WEIGER = 'Dit is een voorbeeld om te bekijken: opslaan en wijzigen werkt hier niet.';
  var WIJKNAAM = { evenement: 'Evenement', sport: 'Sport', toernooi: 'Toernooien', mensen: 'Mensen', communicatie: 'Communicatie', veiligheid: 'Veiligheid' };
  var PAS = { vragen: 'elke_wijk', warm: false, warm_tot_ms: null };   // het poortje vraagt hier bij elke afdeling je pas
  var MIN = 60000;

  // ── De klok: het is hier altijd de middag van het voorbeeld ────────────────
  // De opgenomen wedstrijden zijn "nu" bezig. Zonder dit zou de live-minuut met de echte datum
  // meelopen (dagen later: duizenden minuten). De klok begint bij elke pagina op het opnamemoment.
  (function () {
    var Echt = Date, t0 = Echt.now();
    function nu() { return BASIS + (Echt.now() - t0); }
    function Nep(a, b, c, d, e, f, g) {
      if (!(this instanceof Nep)) return new Echt(nu()).toString();
      var n = arguments.length, x;
      if (n === 0) x = new Echt(nu());
      else if (n === 1) x = new Echt(a);
      else x = new Echt(a, b, n > 2 ? c : 1, n > 3 ? d : 0, n > 4 ? e : 0, n > 5 ? f : 0, n > 6 ? g : 0);
      Object.setPrototypeOf(x, Nep.prototype);
      return x;
    }
    Nep.prototype = Echt.prototype;
    Nep.now = nu; Nep.parse = Echt.parse; Nep.UTC = Echt.UTC;
    try { window.Date = Nep; } catch (e) {}
  })();

  var echt = window.fetch.bind(window);
  function kloon(o) { return JSON.parse(JSON.stringify(o)); }
  function antwoord(obj, status) { return Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })); }
  function los(naam, pas) { var r = V[naam], j = kloon(r.j); if (pas) pas(j); return antwoord(j, r.s); }
  function sleutel(pq) { return pq.replace(/^\/api\//, '').replace(/[^A-Za-z0-9._-]+/g, '_'); }

  // ── Wat de kijkversie zelf onthoudt (alleen in deze browser) ────────────────
  var geheugen = {};
  function lees(k) { try { var v = localStorage.getItem(k); return v == null ? (geheugen[k] || null) : JSON.parse(v); } catch (e) { return geheugen[k] || null; } }
  function schrijf(k, v) { geheugen[k] = v; try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var MIJN_EIGEN = 'voorbeeld.voorbeeld.voorbeeld', MIJN_KIJK = 'meekijken.voorbeeld.voorbeeld', MIJN_STAD = 'aangemeld.voorbeeld.voorbeeld';

  // De stad die je in dit voorbeeld hebt aangemeld (of niets).
  function mijnStad() { var s = lees('kijk_stad'); return s && typeof s === 'object' && typeof s.naam === 'string' && s.naam ? s : null; }
  function jsonTekst(s) { return JSON.stringify(String(s)).slice(1, -1); }
  // Een opgenomen bestand. Na jouw aanmelding: de opname van daarna, met jouw stad op de plek van de voorbeeldstad.
  function tekstVan(k) {
    var st = mijnStad(), na = !!st && NA.indexOf(k) >= 0;
    return echt('/api/' + (na ? 'na/' : '') + k + '.json', { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (t) {
      if (na && st.naam !== V.stad.naam) t = t.split('"' + V.stad.naam + '"').join('"' + jsonTekst(st.naam) + '"');
      if (na && st.code && st.code !== V.stad.code) t = t.split(V.stad.code).join(jsonTekst(st.code));
      return t;
    });
  }
  // Elk antwoord krijgt de klok van nu mee (zo blijft de live-minuut lopen) en de stand van de admin.
  function bestand(k, pas) {
    return tekstVan(k).then(function (t) {
      var j = JSON.parse(t);
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        if (typeof j.server_now === 'number') j.server_now = Date.now();
        if (typeof j.server_nu === 'number') j.server_nu = Date.now();
        if (typeof j.admin_stand === 'string') j.admin_stand = stand();
        if (k === 'admin_event-config' && j.admin) { j.admin.stand = stand(); j.admin.keuze = stand(); j.admin.vast = null; }
      }
      if (pas) pas(j);
      return antwoord(j, STATUS[k] || 200);
    });
  }

  // ── Admin: eenvoudige stand of de volledige hub met profielen ──────────────
  function staat() { var s = lees('kijk_admin'); return s && typeof s === 'object' ? s : {}; }
  function zet(s) { schrijf('kijk_admin', s); }
  function stand() { return staat().stand === 'volledig' ? 'volledig' : 'eenvoudig'; }
  try {
    // crew en check-in: meteen binnen (uitloggen en opnieuw inloggen kan met elke naam en code)
    if (!localStorage.getItem('jvo_crew_token')) { localStorage.setItem('jvo_crew_token', 'voorbeeld'); localStorage.setItem('jvo_crew_name', 'Voorbeeld'); }
    localStorage.setItem('jvo_crew_install_seen', '1');
    // /admin?stand=volledig of ?stand=eenvoudig (de kaarten op /alles): begin in die stand, opnieuw inloggen.
    var q0 = /[?&]stand=(eenvoudig|volledig)\b/.exec(location.search);
    if (q0 && /^\/admin(\.html)?$/.test(location.pathname)) {
      zet({ stand: q0[1] }); localStorage.removeItem('jvo_admin_token');
      history.replaceState(null, '', location.pathname + location.hash);
    }
    // volledige stand: je loopt zelf door code → profiel → pas. Een login zonder gekozen profiel telt niet.
    var a0 = staat();
    if (stand() === 'volledig' && localStorage.getItem('jvo_admin_token') && !(a0.pid && V.ik[a0.pid])) localStorage.removeItem('jvo_admin_token');
    // Mijn team: één keer een voorbeeldsleutel klaarzetten (weghalen op de pagina blijft weg)
    if (/^\/mijn(\.html)?$/.test(location.pathname) && !localStorage.getItem('kijk_mijn_gezet')) {
      localStorage.setItem('kijk_mijn_gezet', '1');
      if (!localStorage.getItem('jvo_mijn')) localStorage.setItem('jvo_mijn', JSON.stringify({ v: 1, keys: [{ k: MIJN_EIGEN, kind: 'own', scope: 'team', since: Date.now(), teams: [V.mijnTeam] }] }));
    }
  } catch (e) {}

  function ikNu() {
    var s = staat();
    if (stand() !== 'volledig') { var g = kloon(V.ikGeen.j); g.server_nu = Date.now(); return g; }
    if (!s.pid || !V.ik[s.pid]) return null;
    var ik = kloon(V.ik[s.pid]), nu = Date.now();
    ik.server_nu = nu;
    ik.sessie = s.wijk && s.tot > nu ? { wijk: s.wijk, wijk_tot_ms: s.tot } : { wijk: null, wijk_tot_ms: null };
    ik.pas = kloon(PAS);
    if (s.kleur) ik.profiel.kleur = s.kleur;
    return ik;
  }
  var nodig = function () { return los('profielNodig'); };
  function schuif(wijk) { var s = staat(); if (s.wijk === wijk && wijk !== 'veiligheid' && s.tot > Date.now()) { s.tot = Date.now() + 30 * MIN; zet(s); } }
  // Wisselen tussen de eenvoudige stand en de volledige hub: het enige dat je hier mag "opslaan".
  function alleenStand(b) {
    var e = b && b.event;
    if (!e || typeof e !== 'object') return null;
    var ks = Object.keys(e);
    return ks.length === 1 && ks[0] === 'adminStand' && (e.adminStand === 'eenvoudig' || e.adminStand === 'volledig') ? e.adminStand : null;
  }
  function admin(m, pad, b) {
    var ik, s, nu = Date.now(), r, vol = stand() === 'volledig';
    if (pad === '/api/admin/login/modus') return antwoord({ profielen: vol });
    if (m === 'POST' && pad === '/api/admin/login') {
      if (!b.code) return los('loginZonderCode');
      if (!vol) return los('loginEenvoudig');
      return los('login');
    }
    if (m === 'GET' && pad === '/api/admin/profielen') return vol ? los('profielen') : los('profielenGeen');
    if (m === 'POST' && pad === '/api/admin/profielen/kies') {
      if (!vol) return antwoord({ error: WEIGER }, 403);
      var id = String(b.profiel_id);
      if (!V.ik[id]) return los('kiesOnbekend');
      if (!/^\d{4}$/.test(String(b.pas == null ? '' : b.pas))) return los('kiesPasOngeldig');
      zet({ stand: 'volledig', pid: id, wijk: null, tot: 0, sinds: nu });
      ik = ikNu();
      return antwoord({ token: 'voorbeeld', naam: ik.naam, ik: ik });
    }
    if (m === 'POST' && pad === '/api/admin/uitloggen') { zet({ stand: stand() }); return antwoord({ ok: true }); }
    if (m === 'POST' && pad === '/api/admin/profielen/wissel' && vol) { zet({ stand: 'volledig' }); return los('wissel'); }
    // De wisselknop: "Alles tonen" (naar de hub met profielen) en "Eenvoudige weergave" (terug).
    if (m === 'PUT' && pad === '/api/admin/event-config' && alleenStand(b)) {
      var naar = alleenStand(b);
      zet({ stand: naar });
      if (naar === 'eenvoudig') setTimeout(function () { location.replace('/admin.html'); }, 60);   // opnieuw beginnen, zonder profiel
      return bestand('admin_event-config', function (j) { j.ok = true; });
    }
    ik = ikNu();
    if (pad === '/api/admin/ik') {
      if (!ik) return nodig();
      if (m === 'GET') return antwoord(ik);
      if (vol && m === 'PUT' && b.kleur && V.kleuren.indexOf(b.kleur) >= 0) { s = staat(); s.kleur = b.kleur; zet(s); return antwoord({ ik: ikNu() }); }
      return antwoord({ error: WEIGER }, 403);
    }
    if (!ik) return nodig();
    if (vol && m === 'POST' && pad === '/api/admin/ik/pas') {
      if (b.alleen_toets === true) return antwoord({ ok: true, toets: true });
      return antwoord({ error: WEIGER }, 403);
    }
    if (vol && m === 'POST' && pad === '/api/admin/poort') {
      var w = b.wijk;
      if (!Object.prototype.hasOwnProperty.call(ik.toegang, w)) return los('wijkOnbekend');
      if (!ik.toegang[w]) return los('geenToegang', function (j) { j.wijk = w; });
      var geheim = w === 'veiligheid' ? b.wachtwoord : b.pas;
      s = staat();
      if (geheim == null || geheim === '') {
        if (ik.sessie.wijk === w) { schuif(w); return los('poortBinnen', function (j) { j.wijk = w; j.wijk_tot_ms = staat().tot; j.server_nu = nu; j.pas = kloon(PAS); }); }
        return w === 'veiligheid' ? los('wwNodig') : los('pasNodig');
      }
      if (w !== 'veiligheid' && !/^\d{4}$/.test(String(geheim))) return los('pasOngeldig');
      s.wijk = w; s.tot = nu + (w === 'veiligheid' ? 15 : 30) * MIN; s.sinds = nu; zet(s);
      return los('poortOpen', function (j) { j.wijk = w; j.wijk_tot_ms = s.tot; j.server_nu = nu; j.pas = kloon(PAS); });
    }
    if (vol && m === 'POST' && pad === '/api/admin/poort/sluit') { s = staat(); s.wijk = null; s.tot = 0; s.sinds = nu; zet(s); return antwoord({ ok: true }); }
    if (vol && m === 'POST' && pad === '/api/admin/hartslag') {
      if (b.plek && b.plek === ik.sessie.wijk) schuif(b.plek);
      ik = ikNu();
      return los('hartslag', function (j) { j.sessie = ik.sessie; j.pas = ik.pas; j.toegang = ik.toegang; j.is_hoofd = !!(ik.profiel.is_hoofd || ik.profiel.is_eigenaar); j.server_nu = nu; });
    }
    if (vol && m === 'GET' && pad === '/api/admin/aanwezigheid') {
      if (!(ik.profiel.is_hoofd || ik.profiel.is_eigenaar)) return los('alleenHoofd');
      s = staat();
      var lijst = kloon(V.aanwezig.j.aanwezig).map(function (a, i) {
        if (String(a.pid) === String(s.pid)) { a.plek = ik.sessie.wijk; a.seconden_geleden = 0; a.sinds_ms = s.sinds || nu; a.kleur = ik.profiel.kleur; }
        else { a.plek = a.plek || 'evenement'; a.seconden_geleden = 4 + i * 5; a.sinds_ms = nu - (6 + i * 5) * MIN; }
        return a;
      });
      return antwoord({ aanwezig: lijst, server_nu: nu });
    }
    if (m !== 'GET') return antwoord({ error: WEIGER }, 403);
    var k = sleutel(pad), regel = REGEL[k];
    // Met een profiel: gegevens van een afdeling alleen als de poort van die afdeling open staat (zoals de echte server).
    if (vol && regel && regel.w) {
      var mag = regel.w.filter(function (x) { return ik.toegang[x]; });
      if (!mag.length) return los('geenToegang', function (j) { j.wijk = regel.w[0]; j.error = 'Je mag niet in ' + (WIJKNAAM[regel.w[0]] || 'deze afdeling') + '. Vraag Sam Voorbeeld om toegang.'; });
      if (!ik.sessie.wijk || mag.indexOf(ik.sessie.wijk) < 0) {
        return los('poortDicht', function (j) { j.wijk = mag[0]; j.wijken = mag;
          j.error = mag[0] === 'veiligheid' ? 'De poort van Veiligheid is dicht. Vul het wachtwoord in.' : 'De poort van ' + WIJKNAAM[mag[0]] + ' is dicht. Toets je pas in.'; });
      }
      schuif(ik.sessie.wijk);
    }
    if (BEKEND.indexOf(k) < 0) return antwoord({ error: 'Dit is een voorbeeld om te bekijken: dit onderdeel (downloaden of een los voorbeeld) zit er niet in.' }, 403);
    // Zonder profielen bestaat het beheer van profielen niet (zoals de echte server dan antwoordt).
    if (k === 'admin_profielen_beheer') return vol ? bestand(k, function (j) { j.pas_vragen = PAS.vragen; j.server_nu = nu; }) : los('beheerGeen');
    if (k === 'admin_profile' && vol) return bestand(k, function (j) { j.name = ik.naam; });
    // Het plein telt 'zonder bediener' met de klok van nu; het crew-overzicht moet dat ook doen.
    if (k === 'admin_crew-posts') return bestand(k, function (j) { j.server_now = nu; });
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
      if (!b.code || !b.name || String(b.name).trim().length < 2) return los('crewLoginFout');
      return antwoord({ token: 'voorbeeld', name: b.name });
    }
    if (m === 'GET' && pad === '/api/crew/me') return antwoord({ ok: true, name: crewNaam() });
    if (m === 'POST' && pad === '/api/crew/post') {
      if (b.competition_id == null || b.competition_id === '') c.post = null;
      else { var np = { competition_id: Number(b.competition_id), field: b.field == null || b.field === '' ? null : Number(b.field) };
        if (!c.post || c.post.competition_id !== np.competition_id || c.post.field !== np.field) c.sinds = nu; c.post = np; }
      if (b.match_id != null && b.match_id !== '') { if (c.match !== Number(b.match_id)) c.matchSinds = nu; c.match = Number(b.match_id); }
      schrijf('kijk_crew', c);
      r = crewSnap(V.crewPost.j); r.post = c.post; r.match = b.match_id != null && b.match_id !== '' ? { match_id: Number(b.match_id), mine: true } : null;
      return antwoord(r);
    }
    if (m === 'POST' && (mt = /^\/api\/crew\/match\/(\d+)\/(claim|release)$/.exec(pad))) {
      if (mt[2] === 'claim') { c.match = Number(mt[1]); c.matchSinds = nu; schrijf('kijk_crew', c); return antwoord(crewSnap(V.crewClaim.j)); }
      if (c.match === Number(mt[1])) c.match = null; schrijf('kijk_crew', c); return antwoord(crewSnap(V.crewRelease.j));
    }
    if (m === 'POST' && pad === '/api/crew/leave') { schrijf('kijk_crew', null); return antwoord({ ok: true }); }
    return null;
  }

  // ── Aanmelden met alleen een stad ──────────────────────────────────────────
  function voorvoegsel(stad) {   // zoals de server: de eerste letters van de stad, alleen A-Z, hooguit 5
    var s = String(stad).normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5);
    return s.length >= 2 ? s : '';
  }
  function meldAan(b) {
    if (b.website) return los('stadLokveld');
    var stad = String(b.city == null ? '' : b.city).replace(/\s+/g, ' ').trim();
    if (b.competition_id == null || b.competition_id === '') return los('stadGeenCat');
    if (!stad) return los('stadLeeg');
    var echteNaam = null;
    for (var i = 0; i < V.steden.length; i++) if (V.steden[i].toLowerCase() === stad.toLowerCase()) echteNaam = V.steden[i];
    if (!echteNaam) return los('stadOnbekend', function (j) { j.error = j.error.replace(/"[^"]*"/, '"' + stad.slice(0, 40) + '"'); });
    if (Number(b.competition_id) !== V.stad.comp) return los('stadGestart');
    // Bestaat de stad al in deze categorie, dan heet het tweede team "<Stad> 2" (zoals de echte server).
    var al = V.stad.al.indexOf(echteNaam) >= 0;
    var naam = al ? echteNaam + ' 2' : echteNaam;
    var vv = voorvoegsel(echteNaam), rest = V.stad.code.split('-')[1] || V.stad.code;
    var code = vv ? vv + '-' + rest : V.stad.code;
    schrijf('kijk_stad', { naam: naam, stad: echteNaam, code: code });
    return los('stadKlaar', function (j) {
      j.team_name = naam; j.city = echteNaam; j.numbered = al; j.mijn.team_code = code;
    });
  }

  // ── De nep-fetch ───────────────────────────────────────────────────────────
  function kop(o, u, naam) {
    var h = (o && o.headers) || (u && u.headers) || null;
    if (!h) return '';
    if (typeof h.get === 'function') return h.get(naam) || '';
    for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k) && k.toLowerCase() === naam.toLowerCase()) return String(h[k]);
    return '';
  }
  var onbekend = window.__kijkOnbekend = [];
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
        if (!sl) return los('mijnGeenSleutel');
        if (sl === MIJN_STAD) return mijnStad() ? bestand('mijn_stad') : los('mijnFouteSleutel');
        if (sl === MIJN_KIJK) return bestand('mijn_kijk');
        if (sl === MIJN_EIGEN) return bestand('mijn');
        return los('mijnFouteSleutel');
      }
      if (m === 'POST' && pad === '/api/mijn/code') {
        var code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 7 || code.length > 11) return los('mijnCodeKort');
        return antwoord({ key: MIJN_KIJK, team_id: V.mijnKijkTeam });
      }
      if (m === 'POST' && pad === '/api/register') return meldAan(b);
      if (m === 'GET' && pad === '/api/checkin/zoek') {
        var qm = /[?&]q=([^&#]*)/.exec(p), q = qm ? decodeURIComponent(qm[1].replace(/\+/g, ' ')).replace(/\s+/g, ' ').trim().toLowerCase() : '';
        if (q.length < 2) return los('zoekKort');
        var st = mijnStad(), bron = kloon(st ? V.zoekNa : V.zoek);
        if (st) bron.forEach(function (x) { if (x.name === V.stad.naam) x.name = st.naam; });
        var treffers = bron.filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0; });
        treffers.sort(function (x, y) { return (x.name.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (y.name.toLowerCase().indexOf(q) === 0 ? 0 : 1) || x.name.localeCompare(y.name) || x.id - y.id; });
        return antwoord({ results: treffers.slice(0, 12) });
      }
    } catch (e) { return antwoord({ error: 'Er ging iets mis in de voorbeeldversie.' }, 500); }
    if (m !== 'GET') return antwoord({ error: WEIGER }, 403);
    var k = sleutel(p), k2 = sleutel(pad);
    var kies = BEKEND.indexOf(k) >= 0 ? k : (BEKEND.indexOf(k2) >= 0 ? k2 : null);
    if (!kies) { onbekend.push(m + ' ' + p); return antwoord({}); }
    return bestand(kies);
  };

  // Geen live-verbinding en geen service worker in de kijkversie.
  function NepBron() { this.readyState = 1; }
  NepBron.prototype.addEventListener = function () {}; NepBron.prototype.removeEventListener = function () {}; NepBron.prototype.close = function () {};
  window.EventSource = NepBron;
  try { if (navigator.serviceWorker) { navigator.serviceWorker.register = function () { return new Promise(function () {}); };
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {}); } } catch (e) {}

  // Meldingen (push) staan uit: geen toestemmingsvraag van de browser, wel een eerlijke uitleg op het bord.
  try { if (window.Notification) window.Notification.requestPermission = function () { return Promise.reject(new Error('voorbeeld')); }; } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    var m = document.getElementById('volg-melding');
    if (!m || typeof MutationObserver !== 'function') return;
    var UITLEG = 'Dit is een voorbeeld: meldingen staan hier uit. Je team volgen op dit scherm werkt wel.';
    new MutationObserver(function () { if (/aanzetten lukte/.test(m.textContent)) m.textContent = UITLEG; }).observe(m, { childList: true, characterData: true, subtree: true });
  });

  // Een smalle balk bovenaan, op elke pagina: dit is een voorbeeld, met de weg terug naar alle schermen.
  var WERK = /^\/(admin|wedstrijd|checkin|omroep|print|mijn)(\.html)?$/.test(location.pathname);
  var ORANJE = 'background:#FF6B1A;color:#06193A;font:600 12px/1.35 system-ui,sans-serif;text-align:center';
  document.addEventListener('DOMContentLoaded', function () {
    var balk = document.createElement('div');
    balk.id = 'kijk-balk';
    balk.setAttribute('role', 'note');
    balk.setAttribute('style', 'position:sticky;top:0;z-index:2147483000;padding:7px 12px;' + ORANJE);
    var smal = window.innerWidth < 620;
    if (smal) balk.style.fontSize = '11px';   // op de telefoon: één regel, mét de weg terug
    balk.appendChild(document.createTextNode(WERK ? (smal ? 'Voorbeeld · wijzigen werkt hier niet' : 'Voorbeeld met verzonnen gegevens · wijzigen werkt hier niet')
      : smal ? 'Voorbeeld · er wordt niets bewaard' : 'Voorbeeld met verzonnen gegevens · er wordt niets bewaard of gemaild'));
    balk.appendChild(document.createTextNode(' · '));
    var a = document.createElement('a'); a.href = '/alles'; a.textContent = 'alle schermen'; a.setAttribute('style', 'color:#06193A;text-decoration:underline;white-space:nowrap');
    balk.appendChild(a);
    document.body.insertBefore(balk, document.body.firstChild);
    aangemeld();
  });

  // Aanmeldpagina: het scherm "<Stad> doet mee" zegt erbij dat dit een voorbeeld is.
  function aangemeld() {
    var vak = document.getElementById('stad-klaar');
    if (!vak || typeof MutationObserver !== 'function') return;
    function eerlijk() {
      if (vak.hidden || document.getElementById('kijk-aangemeld')) return;
      var n = document.createElement('p');
      n.id = 'kijk-aangemeld';
      n.setAttribute('role', 'note');
      n.setAttribute('style', 'margin:14px 0 0;padding:10px 12px;border-radius:12px;border:1.5px solid #FF6B1A;background:rgba(255,107,26,.12);color:inherit;font:600 14px/1.4 system-ui,sans-serif;text-align:center');
      n.textContent = 'Dit is een voorbeeld: je aanmelding is niet echt bewaard. Alleen op dit toestel zie je je stad nu ook op het bord en in de admin.';
      vak.appendChild(n);
    }
    new MutationObserver(eerlijk).observe(vak, { attributes: true, attributeFilter: ['hidden'] });
    eerlijk();
  }
})();
