// JVO Admin — ADMIN HUB (branch sport-hub).
//
// In hub-modus (meerdere sporten) vervangt dit de tabs door één centraal startscherm
// met het gebouw (public/hub/, eigen Blender-render) en zes afdelingen die daarvan
// afstromen: Evenement, Sport, Toernooien, Mensen, Communicatie, Veiligheid.
//
// WAT DIT BESTAND WEL EN NIET DOET
//   - Het VERHUIST de bestaande blokken van admin.html (dezelfde DOM-knopen, dezelfde
//     ids, dezelfde event-handlers) naar hun afdeling. Er wordt niets gekopieerd of
//     herschreven; gaat hub-modus uit, dan staat elk blok weer op zijn oude plek.
//   - Het tekent zelf alleen wat nieuw is: het gebouw, "Wat moet je nu doen?", de
//     tegels en kerncijfers, en vier kaarten zonder oud blok (check-in, crew, omroep,
//     toegang, systeemcontrole).
//   - WANNEER AAN? Precies wanneer de regie-laag aan staat (JVO_REGIE.isOn(): meer dan
//     één competitie, of het hoofdtoernooi op inactief). Met één toernooi (o.a. de
//     Open Dag) gebeurt hier niets en blijft de admin zoals hij was.
//
// Adressen: #/  ·  #/<afdeling>  ·  #/<afdeling>/<onderwerp>  (terug/vooruit en
// verversen houden je op dezelfde plek). Gegevens: /api/admin/regie (via JVO_REGIE)
// en /api/admin/crew-posts. Geen eigen timer: dit loopt mee met renderAll van admin.js.
// Alles wat van gebruikers komt gaat door esc() voordat het in innerHTML belandt.
//
// INZOOMEN EN POORTJES
//   - Van afdeling wisselen (stad, tegel, zijbalk, onderbalk, adres) loopt via wissel():
//     de camera zoomt in op de wijk, en met profielen (admin-profielen.js) vraagt het
//     poortje je pas van 4 cijfers (Veiligheid: het wachtwoord). De server dwingt dat af;
//     dit bestand tekent het alleen. Terug naar het plein = uitzoomen.
//   - Is je pas nog warm (de server houdt dat bij), dan scant het poortje hem zelf: lampje
//     groen, slagboom open en door, zonder iets te typen.
//   - BOVENBALK: in hub-modus blijven alleen het logo, de naam, je pasje en het vraagteken
//     over. De links van vroeger staan bij hun afdeling (Mensen > Check-in, Evenement >
//     Schermen en pagina's), het systeemoverzicht onder het vraagteken, uitloggen in het pasje.
//   - ALLES over de stad komt uit public/hub/gebouw.json: maten, vlakken, ankers van de
//     spelden, poortjes, plekken voor de rondjes, en (als ze er staan) "dichtbij" (de
//     close-up + zijn kader in het overzicht) en "icoon". Ontbreekt een sleutel, dan valt
//     de hub terug op wat er wel is. Nergens staan vaste beeldpunten.
//   - Hoofden zien op het plein wie in welke wijk bezig is (rondjes + "Wie is waar").
(() => {
  const A = window.JVO_ADMIN, RG = window.JVO_REGIE;
  const root = document.getElementById('ah');
  if (!A || !RG || !root) return;
  const $ = (id) => document.getElementById(id);
  const esc = A.escape;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const svg = (d, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    pijl: svg('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>', 16),
    chev: svg('<polyline points="9 6 15 12 9 18"/>', 14),
    check: svg('<polyline points="20 6 9 17 4 12"/>', 14),
    slot: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 20),
    slotje: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 12),
    hub: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>', 20),
  };
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
  function setHtml(el, html) {
    if (!el || el.__ah === html) return false;
    el.__ah = html; el.innerHTML = html; return true;
  }
  const rustig = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Profielen en poortjes (admin-profielen.js). Zonder profielen is metPas() onwaar en
  // gedraagt de hub zich zoals altijd, alleen mét het inzoomen.
  const PAS = () => window.JVO_PAS || null;
  const metPas = () => { const P = PAS(); return !!(P && P.heeftProfiel()); };
  const magIn = (id) => { const P = PAS(); return !P || P.magIn(id); };
  const slaap = (ms) => new Promise(r => setTimeout(r, ms));
  const beeldje = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Bestandsnamen uit gebouw.json: alleen een kale naam in /hub/, nooit een pad of adres.
  const bestand = (v) => (typeof v === 'string' && /^[a-z0-9][a-z0-9._-]*\.(webp|png|avif|jpg)$/i.test(v) ? v : null);

  // ── Afdelingen en onderwerpen ────────────────────────────────────────────
  // `pak` geeft de bestaande blokken die naar dit onderwerp verhuizen. `tab` is de
  // oude tab waar admin.js het verversen aan ophangt. `sport`: 'alle' = sportschakelaar
  // met "Alle sporten", 'een' = precies één sport. `hoofd` = alleen voor het hoofdtoernooi.
  const AFD = [
    { id: 'evenement', naam: 'Evenement', kort: 'Event', rol: 'Directie', sub: 'Naam, datum en plaats, het programma en de spelregels.' },
    { id: 'sport', naam: 'Sport', rol: 'Hoofd sport', sub: 'Welke sporten er zijn en hoe ze gespeeld worden.' },
    { id: 'toernooi', naam: 'Toernooien', kort: 'Toernooi', rol: 'Hoofd toernooien', sub: 'Schema’s, tijden en de wedstrijddag zelf.' },
    { id: 'mensen', naam: 'Mensen', rol: 'Hoofd mensen', sub: 'Teams, aanmeldingen, check-in en de crew.' },
    { id: 'communicatie', naam: 'Communicatie', kort: 'Comm.', rol: 'Hoofd communicatie', sub: 'Mails, pushmeldingen en de omroep.' },
    { id: 'veiligheid', naam: 'Veiligheid', kort: 'Veilig', rol: 'Hoofd veiligheid', sub: 'Logboek, back-ups, toegang en de systeemcontrole.' },
  ];
  const afdVan = (id) => AFD.find(a => a.id === id) || null;
  const sel = (s) => () => [document.querySelector(s)];
  const vouwMet = (binnen) => () => { const el = document.querySelector(binnen); return [el && el.closest('details.section.fold, .section')]; };
  const T = [
    // Evenement
    { afd: 'evenement', id: 'profiel', titel: 'Evenement-profiel', sub: 'Naam, datum, plaats, stijl, tijden, sponsor en of aanmelden open staat.', tab: 'overview', pak: sel('#evc-fold') },
    { afd: 'evenement', id: 'klaar', titel: 'Klaar voor de start?', sub: 'De controle die zegt wat er nog geregeld moet worden.', tab: 'overview', pak: sel('#evc-checks-wrap'), leeg: 'Alles is geregeld. Er staat niets open.' },
    { afd: 'evenement', id: 'programma', titel: 'Programma', sub: 'Het live programma zoals bezoekers het zien, met standen en knock-out.', tab: 'program', pak: sel('#tab-program > .program-wrap'), breed: true },
    { afd: 'evenement', id: 'spelregels', titel: 'Spelregels', sub: 'De tekst op de spelregelpagina.', tab: 'overview', pak: sel('#rules-fold') },
    { afd: 'evenement', id: 'schermen', titel: 'Schermen en pagina’s', sub: 'Alle schermen bij elkaar: aanmelden, het bord, de bediening, de check-in, de omroep en de print. Openen, link kopiëren of een QR.', tab: 'tournament', maak: true },
    { afd: 'evenement', id: 'afronden', titel: 'Afronden', sub: 'Uitslagen bewaren, iedereen bedanken en een schone start.', tab: 'overview', pak: sel('#rg-af'), als: () => { const R = RG.data(); return !!R && RG.afrondenNu().show; } },
    // Sport
    { afd: 'sport', id: 'sporten', titel: 'Sporten', sub: 'Per sport de stappen en de volgende actie. Hier voeg je ook een sport toe.', tab: 'overview', breed: true, pak: sel('#rg-regie') },
    { afd: 'sport', id: 'opzet', titel: 'Opzet, velden en plekken', sub: 'Per sport: teamgrootte, aantal velden, banen of tafels, wedstrijdduur en uitslagvorm.', tab: 'tournament', pak: sel('#hub-fold') },
    { afd: 'sport', id: 'logos', titel: 'Teamlogo’s', sub: 'Ingestuurde logo’s beoordelen en de logo-link mailen.', tab: 'tournament', pak: sel('#tc-logos-fold') },
    // Toernooien
    { afd: 'toernooi', id: 'wedstrijddag', titel: 'Wedstrijddag', sub: 'Het scherm voor de dag zelf: pauzeren, uitloop, wat er nu speelt en uitslagen corrigeren.', tab: 'overview', pak: sel('#rg-dag'), breed: true },
    { afd: 'toernooi', id: 'schema', titel: 'Schema per sport', sub: 'Schema maken of opnieuw maken, tijden verschuiven, de stand en alle uitslagen.', tab: 'tournament', pak: sel('#rg-sportpaneel'), sport: 'een', breed: true },
    { afd: 'toernooi', id: 'stand', titel: 'Stand en pauze', sub: 'Voortgang, pauzeknop en het live-overzicht.', tab: 'tournament', hoofd: true, sport: 'een', pak: () => [document.querySelector('#tab-tournament > .section[data-rg-hoofd]'), $('ov-live')] },
    { afd: 'toernooi', id: 'genereren', titel: 'Opzet & genereren', sub: 'De opzet kiezen en het schema maken.', tab: 'tournament', hoofd: true, pak: sel('#tc-setup-fold') },
    { afd: 'toernooi', id: 'tijdschema', titel: 'Tijdschema', sub: 'Starttijd, wedstrijdduur, velden en veldrollen.', tab: 'tournament', hoofd: true, pak: sel('#tc-schedule-fold') },
    { afd: 'toernooi', id: 'tijden', titel: 'Tijden bijsturen', sub: 'Losse wedstrijden verzetten als de dag anders loopt.', tab: 'tournament', hoofd: true, pak: sel('#time-control-section') },
    { afd: 'toernooi', id: 'wachttijden', titel: 'Wachttijden per team', sub: 'Hoe lang elk team tussen wedstrijden wacht.', tab: 'tournament', hoofd: true, pak: sel('#wait-metrics-section') },
    { afd: 'toernooi', id: 'status', titel: 'Status & meldingen', sub: 'Waar het toernooi staat en welke ronde-meldingen zijn verstuurd.', tab: 'tournament', hoofd: true, pak: sel('#tc-status-fold') },
    // Mensen
    { afd: 'mensen', id: 'teams', titel: 'Teams', sub: 'Aanmeldingen beoordelen: goedkeuren, wachtlijst of afwijzen. Met de check-in-QR.', tab: 'teams', sport: 'alle', breed: true, pak: () => [$('freeze-banner'), document.querySelector('#tab-teams > .section'), $('rg-how')] },
    { afd: 'mensen', id: 'aanmeldingen', titel: 'Aanmeldingen & bezoekers', sub: 'Iedereen die zich heeft aangemeld, en de mailinglijst voor een volgende keer.', tab: 'signups', breed: true, pak: () => [document.querySelector('#tab-signups > .info-cards'), document.querySelector('#tab-signups > .signups-subtabs'), ...vouwMet('#signups-tbody')()] },
    { afd: 'mensen', id: 'checkin', titel: 'Check-in', sub: 'Het scanscherm openen, wie er al binnen is en wie je nog verwacht.', tab: 'teams', maak: true },
    { afd: 'mensen', id: 'crew', titel: 'Crew: wie bedient wat', sub: 'Welke crew op welke plek staat en welke wedstrijd geen bediener heeft.', tab: 'teams', maak: true, breed: true },
    // Communicatie
    { afd: 'communicatie', id: 'mails', titel: 'Mails & exports', sub: 'Schema’s, programma, herinneringen en bedankmail. Je ziet altijd eerst een voorbeeld.', tab: 'tournament', kol: 2, pak: () => [$('tc-mails-fold'), ...vouwMet('#rem-intro-auto')()] },
    { afd: 'communicatie', id: 'push', titel: 'Pushmeldingen', sub: 'Welke meldingen aan staan en wat erin staat.', tab: 'tournament', kol: 2, pak: () => [$('push-prefs-section'), $('push-texts-section')] },
    { afd: 'communicatie', id: 'omroep', titel: 'Omroep', sub: 'Het scherm met zinnen om voor te lezen.', tab: 'tournament', maak: true },
    { afd: 'communicatie', id: 'notificaties', titel: 'Mijn notificaties', sub: 'Of jij op dit apparaat een mail of melding krijgt bij nieuwe aanmeldingen.', tab: 'overview', pak: sel('.profile-section') },
    { afd: 'communicatie', id: 'feedback', titel: 'Feedback', sub: 'Wat deelnemers na afloop invulden.', tab: 'tournament', pak: sel('#fb-fold') },
    // Veiligheid
    { afd: 'veiligheid', id: 'logboek', titel: 'Logboek', sub: 'Wie deed wat, en wanneer.', tab: 'audit', breed: true, pak: () => [...vouwMet('#recent-activity')(), document.querySelector('#tab-audit > .section')] },
    { afd: 'veiligheid', id: 'backups', titel: 'Back-ups & exports', sub: 'Alles downloaden als zip, de mailinglijst en een database-snapshot.', tab: 'signups', pak: vouwMet('#export-backup-btn') },
    { afd: 'veiligheid', id: 'profielen', titel: 'Profielen en passen', sub: 'Wie in welke afdeling mag komen, een pas opnieuw instellen en het wachtwoord van Veiligheid.', tab: 'overview', maak: true, breed: true, als: () => metPas() },
    { afd: 'veiligheid', id: 'toegang', titel: 'Codes', sub: 'Admincode, crew-code en captain-link: wat je ermee kunt en waar je ze wijzigt.', tab: 'overview', maak: true },
    { afd: 'veiligheid', id: 'systeem', titel: 'Systeemcontrole', sub: 'Mail, webadres, crew-code en back-ups: staat alles goed?', tab: 'overview', maak: true },
    { afd: 'veiligheid', id: 'smart', titel: 'JVO Smart leert', sub: 'Wat JVO Smart van eerdere dagen heeft onthouden.', tab: 'overview', pak: sel('#smart-learn-fold') },
    { afd: 'veiligheid', id: 'gevaar', titel: 'Gevaarlijke acties', sub: 'Schone start: aanmeldingen, teams en uitslagen wissen.', tab: 'overview', slot: true, pak: sel('#tab-overview > .danger-zone') },
  ];
  const tVan = (afd, id) => T.find(t => t.afd === afd && t.id === id) || null;
  const TABROUTE = { overview: [null, null], teams: ['mensen', 'teams'], tournament: ['toernooi', 'schema'], program: ['evenement', 'programma'], signups: ['mensen', 'aanmeldingen'], audit: ['veiligheid', 'logboek'] };

  // ── Staat ────────────────────────────────────────────────────────────────
  let aan = false;
  let route = { afd: null, t: null };
  let gebouw = null;            // public/hub/gebouw.json (null = niet geladen → tegels)
  let gebouwMis = false;
  let crew = null, crewAt = 0, crewBezig = false, crewMis = false;
  let syncTab = null;
  let sportBewaard = null;      // gekozen sport, onthouden zolang je ergens staat waar hij niets betekent
  const thuis = new Map();      // verhuisd blok → { ph (plaatshouder), open }
  const el = {};                // vaste onderdelen van de hub
  let wisselBezig = false;      // de camera loopt (of het cijferpaneel staat open bij een poort)
  let wisselNa = null;          // adres dat tijdens de camera binnenkwam (terug/vooruit)
  // Zolang de camera nog onderweg is naar het poortje (er staat nog geen paneel) kun je
  // afbreken: met Escape, of door op een andere wijk te tikken (die klik wordt onthouden).
  let stopbaar = false, gestopt = false, stopNu = null, volgendeKlik = null, wisselDoel = null;
  const naAankomstRij = [];     // wie wacht tot je er staat (oplichten, scrollen)
  let beheer = null, beheerBezig = false, beheerMis = false;   // profielbeheer in Veiligheid
  let aanwezigOp = 0, aanwezigEerder = new Set();
  let laatstePid = null, stondOpen = false;
  let qrOpen = null, kopieKlaar = null, mijnBestaat = null;   // Schermen en pagina's: open QR, net gekopieerde link, bestaat /mijn?
  let actiesOpen = false;       // "Wat moet je nu doen?": alle punten in beeld (anders de eerste drie)
  // De sport waar je het laatst een schema van bekeek: onthouden, ook na verversen.
  try { const v = localStorage.getItem('jvo_admin_sport_laatst'); if (v && /^\d+$/.test(v)) sportBewaard = Number(v); } catch { /* geen opslag */ }
  const onthoudSport = (id) => { try { if (id == null) localStorage.removeItem('jvo_admin_sport_laatst'); else localStorage.setItem('jvo_admin_sport_laatst', String(id)); } catch { /* geen opslag */ } };

  // Geen flits van de oude tabs bij verversen: was de hub de vorige keer aan, dan
  // blijft de oude indeling uit beeld tot de gegevens er zijn (hooguit 4 s).
  try {
    if (sessionStorage.getItem('jvo_admin_hub') === '1') {
      document.body.classList.add('ah-wacht');
      setTimeout(() => document.body.classList.remove('ah-wacht'), 4000);
    }
  } catch { /* geen opslag: dan flitst het hooguit even */ }

  // ── Gegevens uit de regie-laag ───────────────────────────────────────────
  const R = () => RG.data();
  const comps = () => RG.zichtbaar();
  const actief = () => comps().filter(c => c.active);
  const hoofd = () => RG.mainComp();
  const hoofdAan = () => { const m = hoofd(); return !!(m && m.active); };
  const losse = () => actief().filter(c => !c.is_default);
  const teams = () => { const t = A.getTeams(); return Array.isArray(t) ? t : []; };
  const checksOpen = () => ((R() && R().checks) || []).filter(c => !c.competition_id && c.level !== 'ok');
  // Wat "Klaar voor de start?" als open punt toont: van het evenement én per sport. De regels voor
  // wie bij de hosting kan staan daar apart (ingeklapt) en tellen hier niet mee.
  const checksLijst = () => ((R() && R().checks) || []).filter(c => c.level !== 'ok' && !c.host);
  const hm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  function systeemRijen() {
    const s = (R() && R().system) || null;
    if (!s) return [];
    const rij = (level, kop, tekst, waar) => ({ level, kop, tekst, waar });
    const out = [];
    out.push(rij('ok', 'Omgeving', s.production ? 'Dit is de echte installatie (productie).' : 'Dit is een testomgeving.', ''));
    out.push(s.base_url_ok
      ? rij('ok', 'Webadres', `Links in mails en QR-codes wijzen naar ${s.base_url}.`, '')
      : rij(s.production ? 'fout' : 'let', 'Webadres', `Links in mails en QR-codes wijzen naar ${s.base_url}. Dat werkt alleen op deze computer.`, 'Zet PUBLIC_BASE_URL bij de hosting van deze installatie.'));
    out.push(s.mail_live
      ? rij('ok', 'E-mail', 'Aangesloten: mails gaan echt de deur uit.', '')
      : rij('let', 'E-mail', 'Proefmodus: er gaat geen enkele mail echt de deur uit.', 'Zet RESEND_API_KEY bij de hosting en haal EMAIL_DRY_RUN weg.'));
    if (!s.mail_own_from) out.push(rij('let', 'Afzender', 'Mails komen nog van het testadres van de maildienst.', 'Zet EMAIL_FROM op een eigen, geverifieerd adres.'));
    if (!s.mail_own_reply) out.push(rij('let', 'Contactadres', 'Er is geen eigen contactadres ingesteld; pagina’s en mails tonen het standaardadres.', 'Zet EMAIL_REPLY_TO bij de hosting.'));
    out.push(s.crew_code
      ? rij('ok', 'Crew-code', 'Ingesteld: de crew logt in met een eigen code.', '')
      : rij('let', 'Crew-code', 'Niet ingesteld: bediening, check-in en omroep werken alleen met de admincode.', 'Zet CREW_CODE bij de hosting.'));
    const b = s.backups || {};
    out.push(b.last
      ? rij('ok', 'Back-ups', `De laatste automatische back-up is van ${b.last} (${plural(b.count, 'bestand', 'bestanden')} bewaard).`, '')
      : rij('info', 'Back-ups', 'Er staat nog geen automatische back-up op de server. Die wordt elke dag vanzelf gemaakt.', ''));
    return out;
  }
  const systeemPunten = () => systeemRijen().filter(r => r.level === 'let' || r.level === 'fout');

  // Eén regel per afdeling: het ene getal dat ertoe doet, en of het aandacht vraagt.
  function afdStatus(id) {
    const d = R();
    if (!d) return { tekst: '', let: false, n: 0 };
    const t = d.totals || {};
    if (id === 'evenement') {
      const open = checksLijst(), fout = open.some(c => c.level === 'fout');
      const af = RG.afrondenNu();
      if (af.allDone) return { tekst: 'afronden', let: true, n: 1 };
      return { tekst: open.length ? plural(open.length, 'punt', 'punten') : 'klaar', let: fout, n: open.length };
    }
    if (id === 'sport') {
      const n = actief().length;
      return { tekst: n ? plural(n, 'sport', 'sporten') : 'nog geen sport', let: n === 0, n };
    }
    if (id === 'toernooi') {
      const zonder = zonderBediener().length;
      if (d.paused_all) return { tekst: 'op pauze', let: true, n: 0 };
      if (zonder) return { tekst: `${zonder} zonder bediener`, let: true, n: zonder };
      if (t.live > 0) return { tekst: `${t.live} live`, let: false, n: t.live };
      const kan = actief().filter(c => RG.stateOf(c).key === 'maak-schema').length;
      if (kan) return { tekst: plural(kan, 'schema te maken', 'schema’s te maken'), let: true, n: kan };
      return { tekst: t.total ? `${t.done}/${t.total} gespeeld` : 'nog geen schema', let: false, n: 0 };
    }
    if (id === 'mensen') {
      const pend = teams().filter(x => x.status === 'pending').length;
      if (pend) return { tekst: `${pend} ${pend === 1 ? 'wacht' : 'wachten'}`, let: true, n: pend };
      return { tekst: plural(t.approved || 0, 'team', 'teams'), let: false, n: 0 };
    }
    if (id === 'communicatie') return { tekst: d.mail_live ? 'mail staat aan' : 'mail in proefmodus', let: false, n: 0 };
    if (id === 'veiligheid') {
      const p = systeemPunten();
      return { tekst: p.length ? plural(p.length, 'punt', 'punten') : 'alles in orde', let: p.some(x => x.level === 'fout'), n: p.length };
    }
    return { tekst: '', let: false, n: 0 };
  }

  // Wat een onderwerp-tegel rechtsboven laat zien.
  function tStatus(t) {
    const d = R();
    if (!d) return null;
    const k = `${t.afd}/${t.id}`;
    const tm = teams();
    if (k === 'evenement/profiel') return { tekst: d.registration && d.registration.open ? 'aanmelden open' : 'aanmelden dicht' };
    if (k === 'evenement/klaar') { const o = checksLijst(); return o.length ? { tekst: plural(o.length, 'punt', 'punten'), let: o.some(c => c.level === 'fout') } : { tekst: 'geregeld', ok: true }; }
    if (k === 'evenement/afronden') return { tekst: 'nu', let: true };
    if (k === 'sport/sporten') return { tekst: `${actief().length} actief` };
    if (k === 'toernooi/wedstrijddag') { const z = zonderBediener().length; return d.paused_all ? { tekst: 'op pauze', let: true } : z ? { tekst: `${z} zonder bediener`, let: true } : d.totals.live ? { tekst: `${d.totals.live} live` } : null; }
    if (k === 'toernooi/schema') { const n = losse().filter(c => RG.stateOf(c).key === 'maak-schema').length; return n ? { tekst: plural(n, 'te maken', 'te maken'), let: true } : null; }
    if (k === 'mensen/teams') { const p = tm.filter(x => x.status === 'pending').length; return p ? { tekst: `${p} ${p === 1 ? 'wacht' : 'wachten'}`, let: true } : { tekst: `${tm.filter(x => x.status === 'approved').length} goedgekeurd` }; }
    if (k === 'mensen/aanmeldingen') { const n = ($('info-signups-count') || {}).textContent; return n && /^\d+$/.test(n) ? { tekst: n } : null; }
    if (k === 'mensen/checkin') { const ok = tm.filter(x => x.status === 'approved'); return ok.length ? { tekst: `${ok.filter(x => x.checked_in_at).length}/${ok.length} binnen` } : null; }
    if (k === 'mensen/crew') {
      if (!crew && !crewKort()) return null;
      const z = zonderBediener().length;
      return z ? { tekst: `${z} zonder bediener`, let: true } : { tekst: `${crewAantal()} actief` };
    }
    if (k === 'communicatie/mails') return { tekst: d.mail_live ? 'staat aan' : 'proefmodus' };
    if (k === 'veiligheid/systeem') { const p = systeemPunten(); return p.length ? { tekst: plural(p.length, 'punt', 'punten'), let: p.some(x => x.level === 'fout') } : { tekst: 'in orde', ok: true }; }
    if (k === 'veiligheid/backups') { const b = d.system && d.system.backups; return b && b.last ? { tekst: b.last } : null; }
    return null;
  }

  // Live wedstrijden zonder bediener die een seintje waard zijn. Het hoofdtoernooi telt
  // niet mee: dat bedienscherm meldt (nog) niet wie bedient, dus daar zou dit altijd
  // afgaan. En een wedstrijd die net is gestart krijgt een paar minuten de tijd.
  const ZONDER_NA_MS = 3 * 60 * 1000;
  const tijdMs = (v) => { if (!v) return NaN; const t = String(v); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`); };
  // Met profielen komt de volledige crewlijst (met namen) alleen binnen in Mensen of
  // Toernooien. Daarbuiten rekent de hub met de korte versie uit de regie (geen namen).
  const crewKort = () => { const d = R(); return d && d.crew && typeof d.crew === 'object' ? d.crew : null; };
  function zonderBediener() {
    const k = !crew ? crewKort() : null;
    const lijst = crew ? crew.unattended : k ? k.zonder_bediener : null;
    if (!Array.isArray(lijst)) return [];
    const m = hoofd(), nu = (crew && crew.server_now) || Date.now();
    return lijst.filter(x => {
      if (m && x.competition_id === m.id) return false;
      const s = tijdMs(x.started_at);
      return Number.isNaN(s) || nu - s >= ZONDER_NA_MS;
    });
  }
  function crewAantal() {
    if (!crew) { const k = crewKort(); return k ? Number(k.actief) || 0 : 0; }
    const wie = new Set();
    for (const s of (crew.sports || [])) {
      for (const p of (s.places || [])) for (const c of (p.crew || [])) wie.add(c.name);
      for (const c of (s.roaming || [])) wie.add(c.name);
    }
    return wie.size;
  }

  // Maximaal drie concrete acties, de dringendste eerst.
  function acties() {
    const d = R();
    if (!d) return [];
    const out = [];
    const t = d.totals || {};
    const zonder = zonderBediener();
    if (zonder.length) {
      const x = zonder[0];
      out.push({ titel: plural(zonder.length, 'wedstrijd loopt zonder bediener', 'wedstrijden lopen zonder bediener'),
        tekst: `${x.a || 'Nog onbekend'} – ${x.b || 'Nog onbekend'}${x.competition ? ` (${x.competition}${x.place ? `, ${x.place}` : ''})` : ''}${zonder.length > 1 ? ` en nog ${zonder.length - 1}` : ''}.`,
        knop: 'Bekijk de crew', afd: 'mensen', t: 'crew' });
    }
    if (d.paused_all) out.push({ titel: 'Alles staat op pauze', tekst: 'Niemand kan een wedstrijd starten tot je hervat.', knop: 'Naar wedstrijddag', afd: 'toernooi', t: 'wedstrijddag' });
    // Iemand staat buiten door te veel foute passen: wie in Veiligheid mag kan dat oplossen.
    const mij = metPas() ? PAS().ik() : null;
    if (mij && magIn('veiligheid')) for (const g of (Array.isArray(mij.geblokkeerd) ? mij.geblokkeerd : []).slice(0, 2)) {
      out.push({ titel: `${g.naam} is geblokkeerd`, tekst: 'Te veel foute passen. Jij kunt de blokkade opheffen of de pas opnieuw instellen.', knop: 'Naar het profiel', afd: 'veiligheid', t: 'profielen', na: () => toonProfiel(g.id) });
    }
    const wachten = teams().filter(x => x.status === 'pending');
    const pend = wachten.length;
    // Aangemeld met alleen een stad (geen e-mailadres): dan gaat er bij goedkeuren geen QR-mail uit.
    const zonderMail = wachten.filter(x => x.no_email).length;
    const pendTekst = !zonderMail ? 'Goedkeuren stuurt de captain meteen de check-in-QR.'
      : (zonderMail === pend ? 'Na goedkeuren zien ze hun QR en poule in Mijn team. Er gaat geen mail uit: deze teams hebben geen e-mailadres.'
        : 'Goedkeuren stuurt de captain meteen de check-in-QR. Teams zonder e-mailadres zien hem in Mijn team.');
    if (pend) out.push({ titel: plural(pend, 'aanmelding wacht op jou', 'aanmeldingen wachten op jou'), tekst: pendTekst, knop: 'Beoordeel', doe: () => A.showPendingTeams(), na: () => naarEerste('#teams-cards') });
    for (const c of actief()) {
      const st = RG.stateOf(c).key;
      if (st === 'maak-schema') out.push({ titel: `${c.name} kan een schema krijgen`, tekst: `${c.teams.approved} ${c.unit || 'teams'} goedgekeurd, nog geen wedstrijden.`, knop: 'Maak schema', doe: () => { A.selSport = c.id; ga('toernooi', c.is_default ? 'genereren' : 'schema'); } });
      else if ((st === 'schema-staat' || st === 'bezig') && RG.losVan(c) > 0) out.push({ titel: `${c.name}: ${plural(RG.losVan(c), c.solo ? 'deelnemer' : 'team', c.solo ? 'deelnemers' : 'teams')} buiten het schema`, tekst: 'Goedgekeurd nadat het schema is gemaakt. Zo spelen ze geen enkele wedstrijd.', knop: 'Bekijk schema', doe: () => { A.selSport = c.id; ga('toernooi', c.is_default ? 'genereren' : 'schema'); } });
    }
    const fout = checksOpen().filter(c => c.level === 'fout');
    if (fout.length) out.push({ titel: plural(fout.length, 'punt moet je oplossen', 'punten moet je oplossen'), tekst: fout[0].kort || fout[0].text, knop: 'Bekijk de controle', afd: 'evenement', t: 'klaar' });
    const laat = actief().filter(c => c.delay_min >= 10 && !c.finished && !c.paused).sort((a, b) => b.delay_min - a.delay_min);
    if (laat.length && t.live > 0) out.push({ titel: `${laat[0].name} loopt ${laat[0].delay_min} min uit`, tekst: laat.length > 1 ? `En nog ${plural(laat.length - 1, 'sport loopt', 'sporten lopen')} achter. Schuif de tijden op of laat het zo.` : 'Schuif de tijden op, of laat het zo.', knop: 'Naar wedstrijddag', afd: 'toernooi', t: 'wedstrijddag' });
    const af = RG.afrondenNu();
    if (af.show) out.push({ titel: af.allDone ? 'De dag zit erop' : 'De datum is voorbij', tekst: 'Bewaar de uitslagen, bedank iedereen en begin daarna schoon.', knop: 'Afronden', afd: 'evenement', t: 'afronden' });
    if (!actief().length) out.push({ titel: 'Nog geen sport actief', tekst: 'Voeg een sport toe; een voorinstelling vult het formulier voor je in.', knop: 'Sport toevoegen', afd: 'sport', t: 'sporten' });
    const open = checksOpen().filter(c => c.level !== 'fout');
    if (open.length) out.push({ titel: `Nog ${plural(open.length, 'ding', 'dingen')} na te lopen`, tekst: open[0].kort || open[0].text, knop: 'Bekijk de controle', afd: 'evenement', t: 'klaar' });
    return out;
  }
  // Op een smal scherm staat de kop van een lijst hoog: breng het eerste item in beeld.
  function naarEerste(selector) {
    const el = document.querySelector(selector);
    if (!el || window.innerWidth >= 1024) return;
    try { el.scrollIntoView({ block: 'start', behavior: rustig() ? 'auto' : 'smooth' }); } catch { /* oudere browser */ }
  }
  // Het profiel van iemand in beeld (Veiligheid > Profielen en passen). De lijst komt kort na
  // aankomst binnen, dus een paar keer proberen.
  function toonProfiel(id, poging = 0) {
    const li = root.querySelector(`.ah-pb[data-id="${CSS.escape(String(id))}"]`);
    if (li) { try { li.scrollIntoView({ block: 'center', behavior: rustig() ? 'auto' : 'smooth' }); } catch { /* oudere browser */ } flits(li); return; }
    if (poging < 12) setTimeout(() => { if (aan && route.afd === 'veiligheid' && route.t === 'profielen') toonProfiel(id, poging + 1); }, 300);
  }

  // Wedstrijddag-snelbalk: zodra de dag loopt staan de handelingen die onder druk gebeuren op het
  // startscherm, één tik van de plek waar je ze doet.
  const SNEL = {
    pauze: ['toernooi', 'wedstrijddag', '#rg-nood'], uitslag: ['toernooi', 'wedstrijddag', '#rg-h-uit'], uitloop: ['toernooi', 'wedstrijddag', '#rg-rijen'],
    niet: ['toernooi', 'wedstrijddag', '#rg-h-straks'], crew: ['mensen', 'crew', null], checkin: ['mensen', 'checkin', null],
  };
  function dagLoopt(d) {
    const t = d.totals || {};
    return t.live > 0 || !!d.paused_any || !!(d.event && d.event.is_today && t.total > 0 && t.done < t.total);
  }
  function snelbalk(d) {
    if (!dagLoopt(d)) return '';
    const zonder = zonderBediener().length;
    const tm = teams().filter(x => x.status === 'approved'), nog = tm.filter(x => !x.checked_in_at).length;
    const k = (id, label, extra) => (magIn(SNEL[id][0]) ? `<button type="button" class="ah-snel-k${extra ? ' is-let' : ''}" data-ah="snel" data-doel="${id}"><span>${label}</span>${extra ? `<em>${extra}</em>` : ''}</button>` : '');
    const knoppen = k('pauze', d.paused_all ? 'Hervat alles' : 'Pauzeer alles') + k('uitslag', 'Uitslag corrigeren') + k('uitloop', 'Tijden opschuiven')
      + k('niet', 'Team niet gekomen') + k('crew', 'Wie bedient wat', zonder ? `${zonder} zonder` : '') + (nog ? k('checkin', 'Inchecken') : '');
    return knoppen ? `<span class="ah-snel-kop"><i class="ah-snel-stip" aria-hidden="true"></i>Wedstrijddag</span><div class="ah-snel-rij">${knoppen}</div>` : '';
  }

  // ── Opbouw (één keer) ────────────────────────────────────────────────────
  function bouw() {
    if (el.klaar) return;
    el.klaar = true;
    const navA = (a) => `<a class="ah-nav-a" href="#/${a.id}" data-afd="${a.id}">
        <span class="ah-nav-i" aria-hidden="true"><img data-icoon="${a.id}" src="${esc(icoonVan(a.id))}" alt="" loading="lazy" decoding="async" /><i class="ah-nav-slot" hidden>${IC.slotje}</i></span>
        <span class="ah-nav-t"><span class="ah-nav-lang">${esc(a.naam)}</span><span class="ah-nav-kort">${esc(a.kort || a.naam)}</span></span>
        <span class="ah-nav-n" data-n="${a.id}"></span>
      </a>`;
    root.innerHTML = `
      <nav class="ah-nav" id="ah-nav" aria-label="Afdelingen">
        <a class="ah-nav-a ah-nav-hub" href="#/" data-afd=""><span class="ah-nav-i" aria-hidden="true">${IC.hub}</span><span class="ah-nav-t"><span class="ah-nav-lang">Admin Hub</span><span class="ah-nav-kort">Hub</span></span><span class="ah-nav-n"></span></a>
        ${AFD.map(navA).join('')}
      </nav>
      <div class="ah-main">
        <section class="ah-home" id="ah-home" aria-labelledby="ah-home-titel">
          <header class="ah-home-kop">
            <div class="card-eyebrow ah-oog">Admin Hub</div>
            <h2 class="rg-titel ah-titel" id="ah-home-titel" tabindex="-1">—</h2>
            <p class="rg-sub ah-sub" id="ah-home-sub"></p>
          </header>
          <nav class="ah-snel" id="ah-snel" aria-label="Wedstrijddag: snel naar" hidden></nav>
          <div class="ah-home-raster">
            <div class="ah-gebouw-wrap" id="ah-gebouw-wrap">
              <div id="ah-gebouw-plek"></div>
            </div>
            <aside class="ah-nu" aria-labelledby="ah-nu-titel">
              <h3 class="ah-nu-titel" id="ah-nu-titel">Wat moet je nu doen?</h3>
              <ol class="ah-nu-lijst" id="ah-nu-lijst"></ol>
              <div id="ah-profielstart"></div>
              <section class="ah-wie" id="ah-wie" aria-labelledby="ah-wie-titel" hidden></section>
              <div id="ah-home-slot"></div>
            </aside>
          </div>
          <h3 class="ah-tussenkop" id="ah-afd-kop">Afdelingen</h3>
          <div class="ah-afdelingen" id="ah-afdelingen"></div>
          <div id="ah-home-voet"></div>
          <div class="ah-stand" id="ah-stand" hidden></div>
        </section>
        <section class="ah-afd" id="ah-afd" hidden aria-labelledby="ah-afd-titel">
          <nav class="ah-kruimel" id="ah-kruimel" aria-label="Je bent hier"></nav>
          <header class="ah-afd-kopblok">
            <span class="ah-afd-beeld" id="ah-afd-lijst" aria-hidden="true"><img id="ah-afd-beeld" alt="" decoding="async" /></span>
            <div class="ah-afd-koptekst">
              <div class="card-eyebrow ah-oog" id="ah-afd-rol"></div>
              <h2 class="rg-titel ah-titel" id="ah-afd-titel" tabindex="-1">—</h2>
              <p class="rg-sub ah-sub" id="ah-afd-sub"></p>
            </div>
          </header>
          <div class="ah-poortbalk" id="ah-poortbalk" role="status" hidden></div>
          <div class="ah-cijfers" id="ah-cijfers"></div>
          <div class="ah-kopslot" id="ah-slot-mensen" data-afd="mensen"></div>
          <nav class="ah-onderwerpen" id="ah-onderwerpen" aria-label="Onderwerpen"></nav>
          <div class="ah-sportslot" id="ah-sportslot" hidden></div>
          <p class="ah-leeg" id="ah-sportleeg" hidden></p>
          <div class="ah-podium" id="ah-podium"></div>
        </section>
      </div>`;
    Object.assign(el, {
      nav: $('ah-nav'), home: $('ah-home'), afd: $('ah-afd'), podium: $('ah-podium'), onderwerpen: $('ah-onderwerpen'),
      sportslot: $('ah-sportslot'), cijfers: $('ah-cijfers'), gebouw: $('ah-gebouw-plek'),
    });
    for (const t of T) {
      const s = document.createElement('section');
      s.className = `ah-topic ah-t-${t.id}${t.kol ? ` ah-kol-${t.kol}` : ''}${t.breed ? ' ah-breed' : ''}`;
      s.id = `ah-t-${t.afd}-${t.id}`;
      s.dataset.afd = t.afd; s.dataset.t = t.id;
      s.hidden = true;
      s.setAttribute('aria-label', t.titel);
      if (t.slot) {
        s.innerHTML = `<div class="ah-slot" data-slot>
            <span class="ah-slot-i" aria-hidden="true">${IC.slot}</span>
            <h3>Dit kun je niet terugdraaien</h3>
            <p>Hier staan acties die gegevens voorgoed wissen. Bewaar eerst een back-up (Veiligheid, Back-ups &amp; exports).</p>
            <div class="ah-slot-k"><a class="rg-knop rg-knop-rustig ah-knop" href="#/veiligheid/backups">Eerst een back-up</a><button type="button" class="rg-knop rg-knop-rustig ah-knop ah-knop-let" data-ah="ontgrendel">Ik weet wat ik doe, laat zien</button></div>
          </div><div class="ah-slot-in" data-slot-in hidden></div>`;
      } else if (t.maak) {
        s.innerHTML = `<div class="section ah-kaart" data-maak></div>`;
      } else if (t.leeg) {
        s.innerHTML = `<p class="ah-leeg" data-leeg hidden>${esc(t.leeg)}</p>`;
      }
      t.el = s;
      el.podium.appendChild(s);
    }
    root.addEventListener('click', klik);
    laadGebouw();
  }

  // ── Verhuizen en terugzetten ─────────────────────────────────────────────
  function verhuis(node, doel) {
    if (!node || thuis.has(node) || !node.parentNode) return;
    const ph = document.createComment('ah-plek');
    node.parentNode.insertBefore(ph, node);
    const vouw = node.matches('details.section.fold');
    thuis.set(node, { ph, open: vouw ? node.open : undefined, vouw });
    doel.appendChild(node);
    if (vouw) {
      node.classList.add('ah-vast');
      const s = node.querySelector(':scope > summary');
      if (s) { s.setAttribute('tabindex', '-1'); s.setAttribute('aria-disabled', 'true'); }
      if (!node.__ahToggle) {
        node.__ahToggle = true;
        // In de hub is een vouw een vaste kaart: hij blijft open.
        node.addEventListener('toggle', () => { if (aan && thuis.has(node) && !node.open) node.open = true; });
        node.querySelector(':scope > summary')?.addEventListener('click', (e) => { if (aan && thuis.has(node)) e.preventDefault(); });
      }
    }
  }
  function verhuisAlles() {
    for (const t of T) {
      if (!t.pak) continue;
      const doel = t.slot ? t.el.querySelector('[data-slot-in]') : t.el;
      for (const node of t.pak()) verhuis(node, doel);
    }
    verhuis(document.querySelector('#tab-overview > .stats'), $('ah-slot-mensen'));
    verhuis($('attention-banner'), $('ah-slot-mensen'));
    verhuis($('jvs-tower'), $('ah-home-slot'));
    verhuis(document.querySelector('#tab-overview > details.help'), $('ah-home-voet'));
    verhuis($('rg-bar'), el.sportslot);
    // Kolomkoppen boven de teamlijst (op laptop staan de teams als rijen; zie admin-hub.css).
    const tc = $('teams-cards');
    if (tc && !$('ah-teamkop')) {
      const k = document.createElement('div');
      k.className = 'ah-teamkop'; k.id = 'ah-teamkop'; k.setAttribute('aria-hidden', 'true');
      k.innerHTML = '<span>Team</span><span>Captain</span><span>Details</span><span>Acties</span>';
      tc.parentNode.insertBefore(k, tc);
    }
    // Het programma-venster toont in hub-modus het bord van alle sporten.
    const fr = $('program-frame');
    if (fr && !fr.dataset.ahSrc) {
      fr.dataset.ahSrc = fr.getAttribute('src') || '';
      fr.setAttribute('src', '/sporten');
      document.querySelectorAll('.program-bar-actions a').forEach(a => {
        a.dataset.ahHref = a.getAttribute('href') || '';
        // Het bord van alle sporten heeft geen aparte tv-stand: die knop valt hier weg.
        if (/screen=1/.test(a.dataset.ahHref)) { a.hidden = true; return; }
        a.setAttribute('href', /wedstrijd/.test(a.dataset.ahHref) ? '/wedstrijd' : '/sporten');
      });
    }
  }
  function zetTerug() {
    for (const [node, m] of thuis) {
      if (m.ph.parentNode) { m.ph.parentNode.insertBefore(node, m.ph); m.ph.remove(); }
      if (m.vouw) {
        node.classList.remove('ah-vast');
        const s = node.querySelector(':scope > summary');
        if (s) { s.removeAttribute('tabindex'); s.removeAttribute('aria-disabled'); }
        node.open = !!m.open;
      }
    }
    thuis.clear();
    $('ah-teamkop')?.remove();
    const fr = $('program-frame');
    if (fr && fr.dataset.ahSrc) {
      fr.setAttribute('src', fr.dataset.ahSrc); delete fr.dataset.ahSrc;
      document.querySelectorAll('.program-bar-actions a').forEach(a => { a.hidden = false; if (a.dataset.ahHref) { a.setAttribute('href', a.dataset.ahHref); delete a.dataset.ahHref; } });
    }
  }

  // ── Aan / uit ────────────────────────────────────────────────────────────
  function zetAan() {
    if (aan) return;
    aan = true;
    bouw();
    verhuisAlles();
    root.hidden = false;
    document.body.classList.add('ah-aan');
    document.body.classList.remove('ah-wacht');
    bovenbalk(true);
    try { sessionStorage.setItem('jvo_admin_hub', '1'); } catch {}
    window.addEventListener('hashchange', opHash);
    window.addEventListener('popstate', opHash);
    route = { afd: null, t: null };
    leesHash(true);
    RG.herteken();     // de regie-blokken tekenen zich nu in hub-vorm
    verhuisAlles();    // blokken die de regie nu pas heeft gemaakt (Afronden) alsnog op hun plek
  }
  function zetUit() {
    if (!aan) return;
    aan = false;
    window.removeEventListener('hashchange', opHash);
    window.removeEventListener('popstate', opHash);
    zetTerug();
    bovenbalk(false);
    camWeg();
    root.hidden = true;
    document.body.classList.remove('ah-aan', 'ah-thuis', 'ah-wacht');
    try { sessionStorage.removeItem('jvo_admin_hub'); } catch {}
    syncTab = null;
    if (/^#\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    A.switchTab('overview', { vanHub: true });
  }

  // De bovenbalk in hub-modus: de regel "Ingelogd als …" (met je pasje en het vraagteken) schuift
  // de bovenbalk in; de oude links verdwijnen via de opmaak (body.ah-aan). Gaat hub-modus uit,
  // dan staat alles weer waar het stond.
  function bovenbalk(zet) {
    const dash = $('dash'), top = dash && dash.querySelector(':scope > .topbar'), wie = dash && dash.querySelector('.who');
    if (!top || !wie) return;
    if (zet) {
      if (wie.parentNode === top) return;
      el.wiePlek = document.createComment('ah-who');
      wie.parentNode.insertBefore(el.wiePlek, wie);
      top.appendChild(wie);
    } else if (el.wiePlek && el.wiePlek.parentNode) {
      el.wiePlek.parentNode.insertBefore(wie, el.wiePlek);
      el.wiePlek.remove(); el.wiePlek = null;
    }
  }

  // ── Adressen ─────────────────────────────────────────────────────────────
  const beschikbaar = (t) => !!t && (!t.als || t.als()) && (t.id !== 'schema' || losse().length > 0);
  const hashVan = (r) => `#/${r.afd || ''}${r.t ? `/${r.t}` : ''}`;
  // Zet de plek waar je staat (zonder camera) en teken hem.
  function zetRoute(afd, t, nieuw) {
    route = { afd: afd || null, t: afd ? (t || null) : null };
    toonRoute(nieuw);
    const P = PAS();
    if (P) P.zetPlek(route.afd);
  }
  function leesHash(eerste) {
    const m = /^#\/([a-z]+)?(?:\/([a-z0-9-]+))?\/?$/.exec(location.hash || '');
    let afd = m && m[1] && afdVan(m[1]) ? m[1] : null;
    let t = afd && m[2] && tVan(afd, m[2]) ? m[2] : null;
    if (t && !beschikbaar(tVan(afd, t))) t = null;
    const goed = `#/${afd || ''}${t ? `/${t}` : ''}`;
    if (location.hash !== goed && (eerste || location.hash)) history.replaceState(null, '', goed);
    else if (!location.hash) history.replaceState(null, '', goed);
    // Terug/vooruit terwijl de camera loopt: het paneel gaat dicht; daarna volgt de hub het adres.
    if (wisselBezig) {
      // Eén adreswijziging geeft twee seintjes (popstate en hashchange): het tweede, naar de
      // plek waar de camera al heen gaat, is geen reden om af te breken.
      if (goed === wisselDoel) return;
      wisselNa = true; breekAf(); const P = PAS(); if (P) P.sluitPaneel(); return;
    }
    if (afd === route.afd) { const zelfde = route.t === t; zetRoute(afd, t, !!eerste || !zelfde); return; }
    // Een andere afdeling (of het plein): het scherm waar je staat blijft tot je er echt bent.
    const oud = hashVan(route);
    if (eerste) { toonRoute(true); root.classList.add('ah-komt'); }
    wissel(afd, t, { eerste: !!eerste }).then((ok) => {
      root.classList.remove('ah-komt');
      if (!ok && !wisselNa && !volgendeKlik && location.hash === goed) history.replaceState(null, '', eerste ? '#/' : oud);
    });
  }
  function opHash() { if (aan) leesHash(false); }
  // Ga naar een afdeling/onderwerp. Binnen dezelfde afdeling meteen; naar een andere
  // afdeling zoomt de camera eerst in (en vraagt de poort zo nodig je pas). Het adres
  // verandert direct, zodat "terug" in de browser het inzoomen annuleert.
  // opts.na: loopt zodra je er staat (oplichten, scrollen). opts.bron: het aangetikte element.
  function ga(afd, t, opts) {
    if (!aan) return false;
    afd = afd && afdVan(afd) ? afd : null;
    let top = afd && t ? tVan(afd, t) : null;
    if (top && !beschikbaar(top)) top = null;
    const goed = `#/${afd || ''}${top ? `/${top.id}` : ''}`;
    const tId = top ? top.id : null;
    if (afd === route.afd) {
      const zelfde = route.t === tId;
      if (location.hash !== goed) { if (opts && opts.vervang) history.replaceState(null, '', goed); else history.pushState(null, '', goed); }
      zetRoute(afd, tId, !zelfde && !(opts && opts.stil));
      if (opts && opts.na) opts.na();
      return true;
    }
    if (wisselBezig) {
      // Nog onderweg naar een ander poortje: die beweging afbreken en daarna hierheen.
      if (!stopbaar) return false;
      volgendeKlik = { afd, t: tId, opts: opts || {} };
      breekAf();
      return true;
    }
    const oud = hashVan(route), duw = !(opts && opts.vervang);
    if (location.hash !== goed) { if (duw) history.pushState(null, '', goed); else history.replaceState(null, '', goed); }
    wissel(afd, tId, opts || {}).then((ok) => {
      if (ok) { if (opts && opts.na) opts.na(); return; }
      if (wisselNa || volgendeKlik || location.hash !== goed) return;   // de browser is zelf al teruggegaan, of de volgende klik neemt het adres over
      if (duw) history.back(); else history.replaceState(null, '', oud);
    });
    return true;
  }
  // Loopt de camera nog, dan wacht dit tot je er staat (admin.js: JVO Smart-sprongen).
  function naAankomst(fn) { if (typeof fn !== 'function') return; if (wisselBezig) naAankomstRij.push(fn); else fn(); }

  // ── Van afdeling wisselen: camera, poort, aankomst ───────────────────────
  // → true als je daarna op de gevraagde plek staat.
  async function wissel(afd, tId, opts) {
    if (wisselBezig) return false;
    wisselBezig = true; wisselNa = null;
    wisselDoel = hashVan({ afd, t: tId });
    stopbaar = false; gestopt = false;
    document.addEventListener('keydown', opEscape, true);
    root.setAttribute('aria-busy', 'true');
    const dash = $('dash');
    const wasInert = !!(dash && dash.inert);
    if (dash) dash.inert = true;
    let ok = false;
    try {
      ok = afd ? await betreed(afd, tId, opts || {}) : await naarPlein(opts || {});
    } catch (e) {
      // De camera mag de admin nooit vastzetten: bij een fout gewoon zonder beweging verder.
      camWeg();
      console.warn('admin-hub: wissel', e);
    } finally {
      if (dash && !wasInert) dash.inert = false;
      root.removeAttribute('aria-busy');
      document.removeEventListener('keydown', opEscape, true);
      stopbaar = false; stopNu = null; wisselDoel = null;
      wisselBezig = false;
    }
    if (aan) teken();      // de poortbalk en de lampjes horen bij de plek waar je nu echt staat
    const kop = ok ? (route.afd ? $('ah-afd-titel') : $('ah-home-titel')) : null;
    if (kop && !(opts && opts.eerste)) { try { kop.focus({ preventScroll: true }); } catch { /* geen focus */ } }
    else if (!ok && opts && opts.bron && opts.bron.isConnected) { try { opts.bron.focus({ preventScroll: true }); } catch { /* geen focus */ } }
    const rij = naAankomstRij.splice(0);
    for (const fn of rij) { try { fn(); } catch { /* een wachter mag de rest niet breken */ } }
    if (wisselNa) { wisselNa = null; volgendeKlik = null; setTimeout(() => { if (aan) leesHash(false); }, 0); }
    else if (volgendeKlik) {
      // De klik die de beweging afbrak: die neemt het adres van de afgebroken wissel over.
      const v = volgendeKlik;
      setTimeout(() => { volgendeKlik = null; if (aan && A.hasToken()) ga(v.afd, v.t, { ...v.opts, vervang: true }); }, 0);
    }
    return ok;
  }
  function breekAf() {
    if (!wisselBezig || !stopbaar || gestopt) return false;
    gestopt = true;
    if (stopNu) stopNu();
    return true;
  }
  function opEscape(e) {
    if (e.key !== 'Escape' || !stopbaar) return;      // staat het paneel er, dan handelt dat Escape zelf af
    if (breekAf()) { e.preventDefault(); e.stopPropagation(); }
  }
  // Wacht op een stuk camerabeweging, tenzij er intussen wordt afgebroken. → true = afgebroken.
  async function totStop(belofte) {
    if (gestopt) return true;
    stopbaar = true;
    await Promise.race([belofte, new Promise((r) => { stopNu = r; })]);
    stopbaar = false; stopNu = null;
    return gestopt;
  }
  // De sessie is intussen weg (ingetrokken of verlopen: het inlogscherm staat er al). Dan
  // hoort er niets meer over het scherm te bewegen.
  const sessieWeg = () => !A.hasToken();
  // Camera naar het poortje. Wordt er onderweg afgebroken, dan zet dit geen nieuwe beweging meer in.
  async function naarPoortje(afd, modus, metPaneel) {
    await camStart(afd, modus);
    if (gestopt) return;
    await camNaarPoort(afd, metPaneel);
  }
  async function betreed(afd, tId, opts) {
    const P = PAS(), A2 = A, naam = afdVan(afd).naam;
    const pas = metPas();
    // Bij een diepe link kan de stad nog onderweg zijn: daar heel even op wachten.
    if (opts.eerste && !gebouw && !gebouwMis) await Promise.race([gebouwKlaar, slaap(900)]);
    // De camera hoort bij de stap vanaf het plein. Wissel je vanuit een afdeling (zijbalk, onderbalk,
    // een knop) naar een andere, dan ga je er direct heen met een korte overgang.
    const vanWijk = !!route.afd && route.afd !== afd && !opts.eerste;
    const metCam = !!gebouw && !gebouwMis && !vanWijk;
    // 1. Geen toegang: de wijk blijft dicht, met uitleg bij het poortje.
    if (pas && !P.magIn(afd)) {
      if (opts.eerste) { root.classList.remove('ah-komt'); }
      if (metCam && await totStop(naarPoortje(afd, 'dicht', true))) { await camTerug(); return false; }
      const wie = await P.wieHelpt(afd);
      if (sessieWeg()) { camWeg(); return false; }
      await P.paneel({
        soort: 'bord', plaats: metCam ? 'poort' : 'venster', geenFocusTerug: true, knop: 'Terug',
        kop: `Je mag niet in ${naam}`,
        regel: wie.length ? `Vraag ${wie.join(' of ')} om toegang: dat wordt in Veiligheid geregeld.` : 'Vraag iemand van Veiligheid om toegang.',
      });
      if (sessieWeg()) camWeg(); else if (metCam) await camTerug();
      return false;
    }
    // 2. Sta je er volgens de server al, of is je pas nog warm? Dan komt er geen paneel: het
    //    poortje scant je pas zelf. De server beslist; het antwoord komt terwijl de camera al loopt.
    const vorige = pas ? P.inWijk() : null;
    const wasBinnen = pas && vorige === afd;
    const vraag = pas ? P.scan(afd) : Promise.resolve('binnen');       // → 'binnen' | 'gescand' | false
    let binnen = null, laad = null;
    const naScan = (b) => {
      binnen = b;
      if (pas && b === 'gescand' && vorige && vorige !== afd) A2.wisWijkData(vorige);   // namen van captains, aanmeldingen, logboek: weg uit het geheugen
      if (pas && b) laad = A2.laadWijk(afd);          // de gegevens van deze afdeling komen al binnen tijdens de camera
      return b;
    };
    if (opts.eerste) {
      if (naScan(await vraag)) { zetRoute(afd, tId, true); return true; }
      root.classList.remove('ah-komt');
    }
    if (sessieWeg()) return false;
    // De camera zoomt altijd eerst naar de wijk. Met een dichte poort blijft hij daar hangen
    // (naast het paneel); anders gaat hij in één beweging door.
    if (metCam) {
      const gestoptOnderweg = await totStop((async () => {
        await camStart(afd);
        if (wasBinnen) camOpen();                      // je stond hier al: het lampje is groen
        if (!opts.eerste) naScan(await vraag);
        if (gestopt) return;
        await camNaarPoort(afd, !binnen);
      })());
      if (gestoptOnderweg) {
        await camTerug();
        if (pas && P.terugNaarPlek) P.terugNaarPlek();   // de scan kan al gelukt zijn: terug naar waar je stond
        return false;
      }
    } else if (!opts.eerste) naScan(await vraag);
    if (sessieWeg()) { camWeg(); return false; }
    if (!binnen) {
      const ok = await P.poort(afd, { plaats: metCam ? 'poort' : 'venster', geenFocusTerug: true, geenScan: true, opOpen: () => camOpen() });
      if (!ok) { if (sessieWeg()) camWeg(); else if (metCam) await camTerug(); return false; }
      if (vorige && vorige !== afd) A2.wisWijkData(vorige);
      laad = A2.laadWijk(afd);
    } else if (binnen === 'gescand' && metCam) {
      // Het poortje scant je warme pas: lampje op groen, slagboom open, en door.
      camOpen();
      await slaap(rustig() ? 60 : 240);
    }
    // 3. De gegevens van deze afdeling (niet lang op wachten) en doorzoomen.
    if (laad) await Promise.race([laad, slaap(450)]);
    crew = null; crewAt = 0;
    zetRoute(afd, tId, true);
    if (metCam) await camDoor(afd);
    else if (vanWijk && !rustig()) { el.afd.classList.remove('ah-kort-in'); void el.afd.offsetWidth; el.afd.classList.add('ah-kort-in'); setTimeout(() => el.afd.classList.remove('ah-kort-in'), 320); }
    return true;
  }
  async function naarPlein(opts) {
    const van = route.afd;
    const metCam = !!gebouw && !gebouwMis && !!van && !opts.eerste;
    if (metCam) await camUit(van, () => zetRoute(null, null, true));
    else zetRoute(null, null, true);
    return true;
  }

  // Oude tabnaam → plek in de hub (admin.js: switchTab).
  function naarTab(name) {
    if (!aan) return false;
    const r = TABROUTE[name];
    if (!r) return false;
    let [afd, t] = r;
    if (name === 'tournament') {
      const c = comps().find(x => x.id === A.selSport);
      if (c && c.is_default && c.active) t = 'stand';
      else if (!losse().length) t = hoofdAan() ? 'stand' : null;
    }
    ga(afd, t);
    return true;
  }
  // Breng een bestaand blok in beeld: de afdeling en het onderwerp waar het nu staat.
  function toon(node) {
    if (!aan || !node) return false;
    const top = node.closest('.ah-topic');
    if (top) { ga(top.dataset.afd, top.dataset.t, { na: () => flits(top) }); return true; }
    if (node.closest('#ah-slot-mensen')) { ga('mensen', null); return true; }
    if (node.closest('#ah-home')) { ga(null, null); return true; }
    return false;
  }
  function flits(node) {
    if (!node) return;
    node.classList.remove('ah-flits');
    void node.offsetWidth;
    node.classList.add('ah-flits');
    clearTimeout(node.__ahFlits);
    node.__ahFlits = setTimeout(() => node.classList.remove('ah-flits'), 2200);
  }

  // ── Tonen ────────────────────────────────────────────────────────────────
  function toonRoute(nieuw) {
    const afd = route.afd ? afdVan(route.afd) : null;
    const top = afd && route.t ? tVan(afd.id, route.t) : null;
    document.body.classList.toggle('ah-thuis', !afd);
    el.home.hidden = !!afd;
    el.afd.hidden = !afd;
    // De oude tab-staat van admin.js gelijk houden (daar hangt het verversen aan).
    const tab = top ? top.tab : afd ? ({ evenement: 'overview', sport: 'overview', toernooi: 'tournament', mensen: 'teams', communicatie: 'tournament', veiligheid: 'audit' })[afd.id] : 'overview';
    if (tab !== syncTab) { syncTab = tab; A.switchTab(tab, { vanHub: true }); }
    // Overzicht en Toernooi blijven voor admin.js "open": JVO Smart en het
    // toernooi-dashboard verversen zo door, waar hun blokken ook staan.
    $('tab-overview')?.classList.add('active');
    $('tab-tournament')?.classList.add('active');

    // De sportkeuze geldt alleen waar de schakelaar zichtbaar is.
    const metSport = !!(top && top.sport);
    // De sport van "Schema per sport" wordt onthouden (ook na verversen). Lijsten met "Alle sporten"
    // (Teams) openen nooit stil op een oude sport: dan mis je de teams van de andere sporten.
    if (!metSport && A.selSport != null) { sportBewaard = A.selSport; onthoudSport(sportBewaard); A.selSport = null; }
    else if (metSport && top.sport === 'een') sportBijAankomst(top);

    for (const t of T) {
      const zicht = !!top && t === top;
      t.el.hidden = !zicht;
      if (!zicht && t.slot) vergrendel(t);
    }
    if (top) {
      // Vouwen in dit onderwerp zijn vaste kaarten: open (dat start ook hun eigen laden).
      top.el.querySelectorAll('details.ah-vast').forEach(d => { if (!d.open) d.open = true; });
    }
    root.classList.toggle('ah-open', !!top);
    root.dataset.afd = afd ? afd.id : '';
    root.dataset.t = top ? top.id : '';
    teken();
    if (top && top.id === 'crew') laadCrew(true);
    if (top && top.id === 'profielen') laadBeheer(true);
    // Evenement: de controle en het formulier tonen altijd de stand van nu, niet die van het inloggen.
    if (top && top.afd === 'evenement' && (top.id === 'klaar' || top.id === 'profiel') && A.laadEvenement) { A.laadEvenement({ zacht: true }); RG.refresh(); }
    if (!afd) laadAanwezig(true);
    if (nieuw) {
      window.scrollTo(0, 0);
      const kop = afd ? $('ah-afd-titel') : $('ah-home-titel');
      // Focus naar de kop van de nieuwe plek (niet bij de eerste keer laden: dan
      // staat de focus nog nergens en hoort hij niet te verspringen).
      if (kop && toonRoute.__eerder) kop.focus({ preventScroll: true });
    }
    toonRoute.__eerder = true;
  }
  // Aankomst op een onderwerp met precies één sport: zet de sport die daarbij hoort.
  // Hier wordt NOOIT doorgestuurd: wie op de tegel "Stand en pauze" tikt komt daar ook
  // uit, welke sport hij eerder ook koos (en andersom voor "Schema per sport").
  // Doorsturen gebeurt alleen als je daarna zelf op een sportchip tikt (kiesEen, via teken).
  function sportBijAankomst(top) {
    const m = hoofd(), lijst = losse();
    const cur = comps().find(c => c.id === A.selSport) || null;
    if (top.id === 'stand') {
      if (cur && !cur.is_default) sportBewaard = cur.id;
      const wil = m && m.active ? m.id : null;
      if (A.selSport !== wil) A.selSport = wil;
    } else if (top.id === 'schema') {
      if (cur && cur.active && !cur.is_default) { onthoudSport(cur.id); return; }
      // Geen sport gekozen: eerst de sport die nog een schema nodig heeft, anders de laatst bekeken.
      const moet = lijst.find(c => RG.stateOf(c).key === 'maak-schema');
      const vorige = lijst.find(c => c.id === sportBewaard);
      const b = (vorige && (!moet || RG.stateOf(vorige).key === 'maak-schema') ? vorige : moet) || vorige || lijst[0] || null;
      sportBewaard = null;
      if (b && A.selSport !== b.id) A.selSport = b.id;
      if (b) onthoudSport(b.id);
    }
  }
  // Onderwerpen die precies één sport nodig hebben: nooit "Alle sporten".
  function kiesEen(top) {
    const lijst = losse();
    const cur = comps().find(c => c.id === A.selSport) || null;
    if (top.id === 'schema') {
      if (cur && cur.is_default && cur.active) { ga('toernooi', 'stand', { vervang: true, stil: true }); return true; }
      if (!cur || !cur.active || cur.is_default) { if (lijst.length) A.selSport = lijst[0].id; }
    } else if (top.id === 'stand') {
      const m = hoofd();
      if (cur && !cur.is_default) { ga('toernooi', 'schema', { vervang: true, stil: true }); return true; }
      if (m && m.active && A.selSport !== m.id && lijst.length) A.selSport = m.id;
    }
    return false;
  }
  function vergrendel(t) {
    const voor = t.el.querySelector('[data-slot]'), inn = t.el.querySelector('[data-slot-in]');
    if (voor) voor.hidden = false;
    if (inn) inn.hidden = true;
  }

  // ── Tekenen (loopt mee met elke verversing) ──────────────────────────────
  function teken() {
    if (!aan || !R()) return;
    const d = R();
    const afd = route.afd ? afdVan(route.afd) : null;
    const top = afd && route.t ? tVan(afd.id, route.t) : null;
    // Het onderwerp waar je staat bestaat niet meer (bv. afronden is klaar) → de afdeling.
    if (top && !beschikbaar(top)) { ga(afd.id, null, { vervang: true }); return; }
    if (top && top.sport === 'een' && kiesEen(top)) return;
    document.body.classList.toggle('ah-hoofd-uit', !hoofdAan());

    // Navigatie (zijbalk / onderbalk)
    const st = {};
    for (const a of AFD) st[a.id] = afdStatus(a.id);
    el.nav.querySelectorAll('.ah-nav-a').forEach(a => {
      const id = a.dataset.afd, cur = (route.afd || '') === id;
      if (cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      if (!id) return;
      const s = st[id], n = a.querySelector('.ah-nav-n');
      const dicht = metPas() && !magIn(id);
      a.classList.toggle('is-let', s.let && !dicht);
      a.classList.toggle('is-dicht', dicht);
      const slotje = a.querySelector('.ah-nav-slot');
      if (slotje && slotje.hidden === dicht) slotje.hidden = !dicht;
      const txt = s.let && s.n && !dicht ? String(s.n) : '';
      if (n.textContent !== txt) n.textContent = txt;
      a.setAttribute('aria-label', `${afdVan(id).naam}: ${dicht ? 'geen toegang' : s.tekst}`);
    });

    if (!afd) tekenHome(d, st); else tekenAfd(d, afd, top, st);
  }

  function tekenHome(d, st) {
    const ev = d.event || {};
    const kop = ev.name || 'Evenement';
    if ($('ah-home-titel').textContent !== kop) $('ah-home-titel').textContent = kop;
    const t = d.totals || {};
    const stand = RG.weg() ? 'Geen verbinding: dit is de laatst bekende stand.'
      : d.paused_all ? 'Alles staat op pauze.'
      : t.live > 0 ? `${t.live} live, ${t.done} van ${t.total} gespeeld.`
      : t.total > 0 ? (t.done === t.total ? 'Alles is gespeeld.' : `${t.done} van ${t.total} wedstrijden gespeeld.`)
      : '';
    const sub = [ev.dateText || 'Datum volgt', ev.location].filter(Boolean).join(' · ') + (stand ? ` · ${stand}` : '');
    if ($('ah-home-sub').textContent !== sub) $('ah-home-sub').textContent = sub;

    // Wat moet je nu doen?
    const snel = snelbalk(d), snelEl = $('ah-snel');
    setHtml(snelEl, snel);
    if (snelEl.hidden !== !snel) snelEl.hidden = !snel;
    const act = acties();
    tekenHome.__act = act;
    // De eerste drie staan er altijd; de rest klapt uit, zodat er nooit iets stil buiten beeld valt.
    const meer = act.length - 3;
    setHtml($('ah-nu-lijst'), act.slice(0, actiesOpen ? act.length : 3).map((a, i) => `<li class="ah-actie">
        <span class="ah-actie-n" aria-hidden="true">${i + 1}</span>
        <div class="ah-actie-t"><b>${esc(a.titel)}</b><span>${esc(a.tekst)}</span></div>
        <button type="button" class="rg-knop ah-knop" data-ah="actie" data-i="${i}">${esc(a.knop)}${IC.pijl}</button>
      </li>`).join('') + (meer > 0 ? `<li class="ah-actie-meer"><button type="button" class="rg-link ah-meer" data-ah="acties-meer" aria-expanded="${actiesOpen}">${actiesOpen ? 'Toon alleen de eerste drie' : `Nog ${plural(meer, 'ding', 'dingen')}`}</button></li>` : '') || `<li class="ah-actie ah-actie-rust"><span class="ah-actie-n" aria-hidden="true">${IC.check}</span><div class="ah-actie-t"><b>Niets dat op je wacht</b><span>${d.totals.live > 0 ? 'Alles loopt. Kijk gerust mee bij Toernooien.' : 'Je bent bij. Zodra er iets is, staat het hier.'}</span></div></li>`);

    // Afdelingstegels (de betrouwbare weg; op telefoon staan ze direct onder het gebouw)
    const pas = metPas(), nuIn = pas ? PAS().inWijk() : null;
    setHtml($('ah-afdelingen'), AFD.map(a => {
      const s = st[a.id], dicht = pas && !magIn(a.id), open = nuIn === a.id;
      return `<a class="ah-tegel ah-tegel-afd${s.let && !dicht ? ' is-let' : ''}${dicht ? ' is-dicht' : ''}" href="#/${a.id}" data-afd="${a.id}">
        <span class="ah-tegel-beeld" aria-hidden="true"><img src="${esc(icoonVan(a.id))}" alt="" loading="lazy" decoding="async" /></span>
        <span class="ah-tegel-t"><span class="ah-tegel-rol">${esc(a.rol)}</span><b>${esc(a.naam)}</b><span class="ah-tegel-s">${dicht ? `<i class="ah-slotje" aria-hidden="true">${IC.slotje}</i>geen toegang` : `${s.let ? '<i class="ah-stip" aria-hidden="true"></i>' : ''}${esc(s.tekst)}`}</span>${open ? '<span class="ah-tegel-open"><i class="ah-lampje" data-staat="open" aria-hidden="true"></i>poort open</span>' : ''}</span>
      </a>`;
    }).join(''));
    // De eerste eigenaar: alleen zolang er nog geen profielen zijn (en de installatie ze kan starten).
    const mij = PAS() && PAS().ik();
    setHtml($('ah-profielstart'), mij && !mij.profielen_actief && !mij.profielen_uit && mij.kan_starten
      ? `<div class="ah-pstart"><div class="ah-actie-t"><b>Geef iedereen een eigen profiel</b><span>Nu logt iedereen in met dezelfde code en een naam die je zelf typt. Met profielen heeft elke beheerder een eigen pas van 4 cijfers, vraagt elke afdeling die pas bij de poort en bepaal jij wie waar in mag.</span></div><button type="button" class="rg-knop rg-knop-rustig ah-knop" data-ah="profiel-start">Start met profielen</button></div>` : '');
    // Terug naar de eenvoudige weergave (admin-eenvoudig.js). Alleen als de server zegt dat het kan:
    // bij de uitgebreide aanmelding en met profielen is de stand altijd volledig.
    const E = window.JVO_ADMIN_EENVOUDIG, standEl = $('ah-stand');
    const kanEenvoudig = !!(E && E.kanEenvoudig());
    setHtml(standEl, kanEenvoudig ? `<p>Dit is de volledige Admin Hub. Voor de dag zelf is de eenvoudige weergave genoeg: aanmeldingen, poules en schema, wedstrijddag en instellingen.</p>
        <button type="button" class="rg-knop rg-knop-rustig ah-knop" data-ah="stand-eenvoudig">Eenvoudige weergave</button>` : '');
    if (standEl.hidden !== !kanEenvoudig) standEl.hidden = !kanEenvoudig;
    tekenGebouw(st);
    tekenAanwezig();
    probeerLus();
  }

  function kerncijfers(d, afd) {
    const t = d.totals || {};
    const c = (v, k, cls = '') => ({ v, k, cls });
    if (afd.id === 'evenement') {
      const open = checksLijst();
      return [c(esc((d.event && d.event.dateText) || 'Volgt'), 'Datum', 'is-tekst'), { ...c(d.registration && d.registration.open ? 'Open' : 'Dicht', 'Aanmelden', 'is-tekst'), doe: 'aanmelden', hulp: 'Aanmelden open of dicht zetten' },
        c(open.length, 'Nog te regelen', open.some(x => x.level === 'fout') ? 'is-let' : ''), c(actief().length, actief().length === 1 ? 'Sport actief' : 'Sporten actief')];
    }
    if (afd.id === 'sport') {
      const a = actief();
      return [c(a.length, a.length === 1 ? 'Sport actief' : 'Sporten actief'), c(a.reduce((s, x) => s + (x.places || 0), 0), 'Velden en plekken'),
        c(t.approved || 0, 'Goedgekeurd'), c(a.filter(x => !x.matches.total).length, 'Zonder schema')];
    }
    if (afd.id === 'toernooi') {
      const a = actief().filter(x => !x.finished && x.matches.total);
      const uit = a.reduce((m, x) => Math.max(m, x.delay_min || 0), 0);
      const eind = a.map(x => x.expected_end).filter(Boolean).sort().pop();
      return [c(t.live || 0, 'Live', t.live ? 'is-live' : ''), c(t.total ? `${t.done}<small>/${t.total}</small>` : '–', 'Gespeeld'),
        c(uit ? `${uit}<small> min</small>` : '0', 'Grootste uitloop', uit >= 10 ? 'is-let' : ''), c(esc(eind || '–'), 'Klaar rond')];
    }
    if (afd.id === 'communicatie') {
      // Teams zonder e-mailadres (aangemeld met alleen een stad) krijgen geen mail: niet meetellen.
      const metAdres = (n) => { const ok = teams().filter(x => x.status === 'approved'); return ok.length ? ok.filter(x => !x.no_email).length : (((A.getConfig && A.getConfig()) || {}).signupForm === 'city' ? 0 : n); };
      return [c(d.mail_live ? 'Aan' : 'Proef', 'E-mail', 'is-tekst'), c(d.reminders_auto ? 'Auto' : 'Zelf', 'Herinneringen', 'is-tekst'), c(metAdres(t.approved || 0), 'Teams die mail krijgen')];
    }
    if (afd.id === 'veiligheid') {
      const p = systeemPunten(), b = (d.system && d.system.backups) || {};
      return [c(p.length, p.length === 1 ? 'Punt open' : 'Punten open', p.some(x => x.level === 'fout') ? 'is-let' : ''), c(d.system && d.system.production ? 'Echt' : 'Test', 'Omgeving', 'is-tekst'),
        c(esc(b.last ? b.last.slice(5).split('-').reverse().join('-') : '–'), 'Laatste back-up', 'is-tekst'), c(b.count || 0, 'Back-ups bewaard')];
    }
    return [];   // Mensen: de bestaande tegels (verhuisd) zijn de kerncijfers
  }

  function tekenAfd(d, afd, top, st) {
    const s = st[afd.id];
    setHtml($('ah-kruimel'), `<a href="#/">Admin Hub</a>${IC.chev}${top ? `<a href="#/${afd.id}">${esc(afd.naam)}</a>${IC.chev}<span aria-current="page">${esc(top.titel)}</span>` : `<span aria-current="page">${esc(afd.naam)}</span>`}`);
    zetKopBeeld(afd.id);
    // Poort: dicht (pas of wachtwoord nodig) of, bij Veiligheid, hoe lang hij nog open is.
    const balk = $('ah-poortbalk');
    let bh = '';
    if (metPas() && !wisselBezig) {
      const P = PAS(), nu = P.inWijk();
      if (nu !== afd.id) {
        const warm = afd.id !== 'veiligheid' && P.pasWarm();
        const koud = afd.id !== 'veiligheid' && P.pasStand() === 'kwartier' && !warm;
        bh = `<i class="ah-lampje" data-staat="dicht" aria-hidden="true"></i><span><b>${koud ? `Je pas is verlopen: de poort van ${esc(afd.naam)} is dicht.` : `De poort van ${esc(afd.naam)} is dicht.`}</b> ${koud ? 'Toets je pas in om verder te gaan.' : 'Wat bij deze afdeling hoort wordt pas weer geladen als hij open is.'}</span><button type="button" class="rg-knop ah-knop" data-ah="poort-open">${afd.id === 'veiligheid' ? 'Wachtwoord invullen' : warm ? 'Open de poort' : 'Pas intoetsen'}</button>`;
      } else if (afd.id === 'veiligheid') {
        const tot = (P.ik().sessie || {}).wijk_tot_ms || 0;
        const min = Math.max(1, Math.ceil((tot - P.nuServer()) / 60000));
        bh = `<i class="ah-lampje" data-staat="open" aria-hidden="true"></i><span><b>Veiligheid is nog ${min} min open.</b> Daarna vraagt hij het wachtwoord opnieuw.</span><button type="button" class="rg-knop rg-knop-rustig ah-knop" data-ah="poort-sluit">Vergrendel nu</button>`;
      }
    }
    setHtml(balk, bh);
    if (balk.hidden !== !bh) balk.hidden = !bh;
    if ($('ah-afd-rol').textContent !== afd.rol) $('ah-afd-rol').textContent = afd.rol;
    if ($('ah-afd-titel').textContent !== afd.naam) $('ah-afd-titel').textContent = afd.naam;
    const sub = `${afd.sub}${s.tekst ? ` Nu: ${s.tekst}.` : ''}`;
    if ($('ah-afd-sub').textContent !== sub) $('ah-afd-sub').textContent = sub;

    // Kerncijfers
    const kc = kerncijfers(d, afd);
    setHtml($('ah-cijfers'), kc.map(x => (x.doe
      ? `<button type="button" class="ah-cijfer ah-cijfer-knop ${x.cls}" data-ah="cijfer" data-doe="${x.doe}" aria-label="${esc(`${x.k}: ${String(x.v).replace(/<[^>]+>/g, '')}. ${x.hulp || ''}`)}"><div class="ah-cijfer-v">${x.v}</div><div class="ah-cijfer-k">${esc(x.k)}<span class="ah-cijfer-p" aria-hidden="true">${IC.pijl}</span></div></button>`
      : `<div class="ah-cijfer ${x.cls}"><div class="ah-cijfer-v">${x.v}</div><div class="ah-cijfer-k">${esc(x.k)}</div></div>`)).join(''));
    $('ah-cijfers').hidden = !kc.length;
    $('ah-slot-mensen').hidden = afd.id !== 'mensen';

    // Onderwerpen: tegels (geen onderwerp open) of een strook subtabs (wel één open)
    const mijn = T.filter(t => t.afd === afd.id && beschikbaar(t));
    const gewoon = mijn.filter(t => !t.hoofd), hfd = mijn.filter(t => t.hoofd);
    const tegel = (t) => {
      const x = tStatus(t), cur = top === t;
      return `<a class="ah-tegel${x && x.let ? ' is-let' : ''}" href="#/${afd.id}/${t.id}"${cur ? ' aria-current="page"' : ''}>
          <span class="ah-tegel-t"><b>${esc(t.titel)}</b><span class="ah-tegel-s">${esc(t.sub)}</span></span>
          ${x ? `<span class="ah-tegel-n${x.let ? ' is-let' : x.ok ? ' is-ok' : ''}">${x.let ? '<i class="ah-stip" aria-hidden="true"></i>' : ''}${esc(x.tekst)}</span>` : ''}
          <span class="ah-tegel-p" aria-hidden="true">${IC.pijl}</span>
        </a>`;
    };
    const m = hoofd();
    let h = `<div class="ah-tegels">${gewoon.map(tegel).join('')}</div>`;
    // Staat het hoofdtoernooi uit en heb je een ander onderwerp open, dan hoort de regel daarover
    // niet tussen de tabs en je werk in te staan: hij staat op het overzicht van de afdeling.
    if (hfd.length && (hoofdAan() || !top || top.hoofd)) {
      // Het hoofdtoernooi dat uit staat is geen sport: zijn blokken staan apart en rustig.
      h += hoofdAan()
        ? `<h3 class="ah-tussenkop">Alleen voor ${esc(m ? m.name : 'het hoofdtoernooi')}</h3><div class="ah-tegels">${hfd.map(tegel).join('')}</div>`
        : `<details class="ah-hoofduit"${top && top.hoofd ? ' open' : ''}><summary>Het hoofdtoernooi staat uit <span>${hfd.length} onderdelen die alleen daarvoor zijn</span></summary>
            <p class="rg-eerlijk ah-eerlijk">Deze blokken werken alleen voor het hoofdtoernooi. Aanzetten doe je bij <a href="#/sport/sporten">Sport</a>.</p>
            <div class="ah-tegels">${hfd.map(tegel).join('')}</div></details>`;
    }
    const open0 = el.onderwerpen.querySelector('.ah-hoofduit');
    const wasOpen = !!(open0 && open0.open);
    if (setHtml(el.onderwerpen, h) && wasOpen) { const n = el.onderwerpen.querySelector('.ah-hoofduit'); if (n) n.open = true; }

    // Sportschakelaar: alleen waar hij iets betekent.
    const metSport = !!(top && top.sport) && comps().length > 0;
    el.sportslot.hidden = !metSport;
    el.sportslot.classList.toggle('ah-sport-een', !!(top && top.sport === 'een'));
    const leeg = $('ah-sportleeg');
    const geenSport = !!(top && top.id === 'schema' && !losse().length);
    leeg.hidden = !geenSport;
    if (geenSport) leeg.textContent = 'Er is nog geen actieve sport. Voeg er eerst een toe bij Sport.';

    if (top) {
      if (top.leeg) {
        const blok = top.el.querySelector('#evc-checks-wrap');
        const p = top.el.querySelector('[data-leeg]');
        if (p) p.hidden = !(blok && blok.hidden);
      }
      if (top.maak) maak(top);
    }
  }

  // ── Het gebouw ───────────────────────────────────────────────────────────
  // Waar een labelspeld komt te staan wordt uitgerekend uit gebouw.json (plaatsSpelden),
  // niet uit vaste beeldpunten: zo klopt het ook als de render van het gebouw verandert
  // en op elk schermformaat. Regel: een speld dekt zo min mogelijk van een ANDERE
  // afdeling af, en nooit het midden ervan (daar tikt men op).
  const inVeelhoek = (p, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  // Rooster over de stad: per vakje welke wijk daar staat (één keer per gebouw.json). Daarmee
  // is "ligt deze speld over een andere wijk?" een opzoeking in plaats van rekenwerk.
  const CEL = 16;
  let rooster = null;
  function maakRooster() {
    const kol = Math.ceil(gebouw.w / CEL), rij = Math.ceil(gebouw.h / CEL);
    const cel = new Int8Array(kol * rij).fill(-1);
    AFD.forEach((a, i) => {
      const d = gebouw.afdelingen[a.id];
      if (!d) return;
      const xs = d.poly.map(q => q[0]), ys = d.poly.map(q => q[1]);
      const c0 = Math.max(0, Math.floor(Math.min(...xs) / CEL)), c1 = Math.min(kol - 1, Math.floor(Math.max(...xs) / CEL));
      const r0 = Math.max(0, Math.floor(Math.min(...ys) / CEL)), r1 = Math.min(rij - 1, Math.floor(Math.max(...ys) / CEL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (cel[r * kol + c] === -1 && inVeelhoek([(c + 0.5) * CEL, (r + 0.5) * CEL], d.poly)) cel[r * kol + c] = i;
      }
    });
    rooster = { kol, rij, cel };
  }
  const wijkOp = (x, y) => (x < 0 || y < 0 || x >= gebouw.w || y >= gebouw.h ? -1 : rooster.cel[Math.floor(y / CEL) * rooster.kol + Math.floor(x / CEL)]);
  // Elke speld bij zijn eigen wijk, zonder een andere speld of een buurwijk af te dekken. Moet
  // een speld uitwijken (er is boven het dak geen plek), dan loopt er een lijntje naar zijn wijk.
  // Op de telefoon is er boven en onder de stad een strook (--ah-band) waar spelden mogen staan,
  // zodat de stad zelf vrij blijft om op te tikken. Alles in de maten van gebouw.json.
  function plaatsSpelden(forceer) {
    const doos = $('ah-gebouw');
    if (!doos || !gebouw) return;
    const bw = doos.clientWidth;
    if (!bw) return;                                   // startscherm staat niet in beeld
    const W = gebouw.w, H = gebouw.h, f = W / bw, rand = 4 * f;
    const cs = getComputedStyle(doos);
    const band = Math.max(0, parseFloat(cs.getPropertyValue('--ah-band')) || 0) * f;            // strook boven de stad
    const bandOnder = Math.max(0, parseFloat(cs.getPropertyValue('--ah-band-onder')) || 0) * f;   // en eronder
    const items = [];
    AFD.forEach((a, i) => {
      const sp = doos.querySelector(`.ah-speld[data-afd="${a.id}"]`), d = gebouw.afdelingen[a.id];
      if (!sp || !d) return;
      const xs = d.poly.map(q => q[0]), ys = d.poly.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const mid = Array.isArray(d.midden) ? d.midden : [(x0 + x1) / 2, (y0 + y1) / 2];
      items.push({ i, id: a.id, sp, w: sp.offsetWidth * f, h: sp.offsetHeight * f, mid, ank: Array.isArray(d.anker) ? d.anker : [mid[0], y0], poort: Array.isArray(d.poort) ? d.poort : null, vak: null, lijn: null });
    });
    // Alleen opnieuw rekenen als er iets is veranderd (breedte, strook of de maat van een speld).
    const sleutel = `${bw}|${band.toFixed(0)}|${bandOnder.toFixed(0)}|${items.map(x => `${x.w.toFixed(0)}x${x.h.toFixed(0)}`).join(',')}`;
    if (!forceer && plaatsSpelden.vorig === sleutel) return;
    plaatsSpelden.vorig = sleutel;
    if (!rooster) maakRooster();
    const lucht = 7 * f, lijnVanaf = 7 * f;
    const raakt = (a, b) => a[0] < b[2] + lucht && b[0] < a[2] + lucht && a[1] < b[3] + lucht && b[1] < a[3] + lucht;
    const binnen = (k, q, m) => q[0] >= k[0] - m && q[0] <= k[2] + m && q[1] >= k[1] - m && q[1] <= k[3] + m;
    const dichtst = (k, q) => [Math.max(k[0], Math.min(k[2], q[0])), Math.max(k[1], Math.min(k[3], q[1]))];
    const afst = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Het lijntje van een vak: van de rand van de speld naar het dak (anker) of, als dat dichterbij is, het midden.
    const lijnVan = (it, k) => {
      const pa = dichtst(k, it.ank), pm = dichtst(k, it.mid);
      const da = afst(pa, it.ank), dm = afst(pm, it.mid);
      return da <= dm ? { van: pa, naar: it.ank, lang: da } : { van: pm, naar: it.mid, lang: dm };
    };
    const score = (it, k, anderen) => {
      const ln = lijnVan(it, k);
      let sc = ln.lang / it.h * 5;                     // hoe dichter bij de eigen wijk, hoe liever
      let eigen = 0, ander = 0;
      for (let ix = 0; ix <= 6; ix++) for (let iy = 0; iy <= 3; iy++) {
        const w = wijkOp(k[0] + (k[2] - k[0]) * ix / 6, k[1] + (k[3] - k[1]) * iy / 3);
        if (w === it.i) eigen++; else if (w >= 0) ander++;
      }
      sc += ander * 22 + eigen * 1.2;                  // een buurwijk afdekken is duur, de eigen wijk een beetje
      if (binnen(k, it.mid, 0)) sc += 30;              // niet midden op het eigen gebouw (daar kijkt en tikt men)
      if (it.poort && binnen(k, it.poort, rand)) sc += 30;
      const c = [(k[0] + k[2]) / 2, (k[1] + k[3]) / 2], eigenAf = afst(c, it.mid);
      for (const o of items) {
        if (o === it) continue;
        for (const q of [o.mid, o.ank, o.poort]) if (q && binnen(k, q, rand)) sc += 250;
        if (afst(c, o.mid) < eigenAf) sc += 120;        // een speld hoort bij het gebouw waar hij het dichtst bij staat
      }
      const metLijn = ln.lang > lijnVanaf;
      if (metLijn) for (let t = 1; t <= 8; t++) {
        const w = wijkOp(ln.van[0] + (ln.naar[0] - ln.van[0]) * t / 9, ln.van[1] + (ln.naar[1] - ln.van[1]) * t / 9);
        if (w >= 0 && w !== it.i) sc += 18;            // het lijntje loopt liever niet over een andere wijk
      }
      for (const g of anderen) {
        if (raakt(k, g.vak)) sc += 2000;
        if (metLijn) for (let t = 1; t <= 8; t++) if (binnen(g.vak, [ln.van[0] + (ln.naar[0] - ln.van[0]) * t / 9, ln.van[1] + (ln.naar[1] - ln.van[1]) * t / 9], rand)) { sc += 400; break; }
        if (g.lijn) for (let t = 1; t <= 8; t++) if (binnen(k, [g.lijn.van[0] + (g.lijn.naar[0] - g.lijn.van[0]) * t / 9, g.lijn.van[1] + (g.lijn.naar[1] - g.lijn.van[1]) * t / 9], rand)) { sc += 400; break; }
      }
      return sc;
    };
    const kies = (it) => {
      const anderen = items.filter(o => o !== it && o.vak);
      const xMin = rand, xMax = Math.max(rand, W - it.w - rand), yMin = -band, yMax = Math.max(-band, H + bandOnder - it.h);
      const vak = (l, t) => { const x = Math.max(xMin, Math.min(xMax, l)), y = Math.max(yMin, Math.min(yMax, t)); return [x, y, x + it.w, y + it.h]; };
      // De eerste keus: recht boven het dak. Daarna een raster over de hele stad (en de stroken).
      let best = vak(it.ank[0] - it.w / 2, it.ank[1] - it.h - 13 * f), bestS = score(it, best, anderen) - 4;
      const sx = Math.max(8, it.w / 5), sy = Math.max(8, it.h / 3);
      for (let y = yMin; y <= yMax + 0.5; y += sy) for (let x = xMin; x <= xMax + 0.5; x += sx) {
        const k = vak(x, y), sc = score(it, k, anderen);
        if (sc < bestS) { bestS = sc; best = k; }
      }
      it.vak = best;
      const ln = lijnVan(it, best);
      it.lijn = ln.lang > lijnVanaf ? ln : null;
    };
    // Drie rondes: in de eerste zoekt elke speld een plek tussen wie er al staat, daarna schuift
    // elk nog eens op met alle andere in beeld. Zo hangt de uitkomst niet aan de volgorde.
    for (let ronde = 0; ronde < 3; ronde++) for (const it of items) kies(it);
    for (const it of items) {
      const l = `${(it.vak[0] / W * 100).toFixed(2)}%`, t = `${(it.vak[1] / H * 100).toFixed(2)}%`;
      if (it.sp.style.left !== l) it.sp.style.left = l;
      if (it.sp.style.top !== t) it.sp.style.top = t;
      if (it.sp.style.visibility) it.sp.style.visibility = '';
      const lijn = doos.querySelector(`.ah-g-lijn[data-afd="${it.id}"]`), stip = doos.querySelector(`.ah-g-stip[data-afd="${it.id}"]`);
      if (!lijn || !stip) continue;
      if (!it.lijn) { lijn.setAttribute('visibility', 'hidden'); stip.setAttribute('visibility', 'hidden'); continue; }
      lijn.setAttribute('x1', it.lijn.van[0].toFixed(1)); lijn.setAttribute('y1', it.lijn.van[1].toFixed(1));
      lijn.setAttribute('x2', it.lijn.naar[0].toFixed(1)); lijn.setAttribute('y2', it.lijn.naar[1].toFixed(1));
      stip.setAttribute('cx', it.lijn.naar[0].toFixed(1)); stip.setAttribute('cy', it.lijn.naar[1].toFixed(1)); stip.setAttribute('r', (3.2 * f).toFixed(1));
      lijn.removeAttribute('visibility'); stip.removeAttribute('visibility');
    }
  }
  let gebouwKlaarZet = null;
  const gebouwKlaar = new Promise((r) => { gebouwKlaarZet = r; });
  async function laadGebouw() {
    try {
      const r = await fetch('/hub/gebouw.json', { cache: 'force-cache' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (!j || !j.w || !j.h || !j.afdelingen) throw new Error('vorm');
      for (const a of AFD) { const x = j.afdelingen[a.id]; if (!x || !Array.isArray(x.poly) || !x.laag) throw new Error(`ontbreekt: ${a.id}`); }
      gebouw = j;
      bouwGebouw();
      if (el.nav) el.nav.querySelectorAll('img[data-icoon]').forEach(i => { const u = icoonVan(i.dataset.icoon); if (i.getAttribute('src') !== u) i.setAttribute('src', u); });
      if (aan) teken();
    } catch (e) {
      geenGebouw();
    }
    gebouwKlaarZet();
  }
  function geenGebouw() {
    gebouw = null; gebouwMis = true;
    root.classList.add('ah-geen-gebouw');
    if (el.gebouw) el.gebouw.innerHTML = '';
  }
  function bouwGebouw() {
    const g = gebouw, W = g.w, H = g.h;
    const pct = (v, van) => `${(v / van * 100).toFixed(3)}%`;
    const volgorde = (Array.isArray(g.volgorde) ? g.volgorde : AFD.map(a => a.id)).filter(id => afdVan(id) && g.afdelingen[id]);
    for (const a of AFD) if (!volgorde.includes(a.id)) volgorde.push(a.id);
    const lagen = volgorde.map(id => { const l = g.afdelingen[id].laag; return `<img class="ah-g-laag" data-afd="${id}" src="/hub/${esc(bestand(l.src) || `aan-${id}.webp`)}" alt="" decoding="async" style="left:${pct(l.x, W)};top:${pct(l.y, H)};width:${pct(l.w, W)};height:${pct(l.h, H)}" />`; }).join('');
    // Wijken waar je niet in mag krijgen hun "dicht"-laag (het beeld laadt pas als het nodig is).
    const dichten = volgorde.map(id => { const d = g.afdelingen[id].dicht, f = d && bestand(d.src); return f ? `<img class="ah-g-dicht" data-dicht="${id}" data-src="/hub/${esc(f)}" alt="" decoding="async" style="left:${pct(d.x, W)};top:${pct(d.y, H)};width:${pct(d.w, W)};height:${pct(d.h, H)}" />` : ''; }).join('');
    // Het lampje bij elk poortje (alleen met profielen): rood = dicht, open-kleur = hier staat je sessie.
    const lampen = AFD.map(a => { const q = g.afdelingen[a.id].poort; return Array.isArray(q) ? `<i class="ah-g-lamp" data-lamp="${a.id}" data-staat="dicht" hidden style="left:${pct(q[0], W)};top:${pct(q[1], H)}"></i>` : ''; }).join('');
    // Het pad van het middelpunt naar de vleugel. Het eerste stuk loopt dwars over de
    // toren; daarom begint de lijn pas op een derde van het eerste stuk.
    const paden = Object.keys(g.paden || {}).filter(id => afdVan(id)).map(id => {
      const p = g.paden[id].map(q => q.slice());
      if (p.length > 1) { p[0] = [p[0][0] + (p[1][0] - p[0][0]) * 0.34, p[0][1] + (p[1][1] - p[0][1]) * 0.34]; }
      return `<polyline class="ah-g-pad" data-afd="${id}" pathLength="100" points="${p.map(q => q.map(n => Number(n).toFixed(1)).join(',')).join(' ')}" />`;
    }).join('');
    // De bouwdelen zijn een snelkoppeling voor muis en vinger. Ze staan in tekenvolgorde
    // (van achter naar voor), dus niet in de Tab-volgorde: de afdelingstegels eronder zijn
    // de route voor toetsenbord en schermlezer, in de logische volgorde.
    const vlakken = volgorde.map(id => `<a class="ah-g-vlak" data-afd="${id}" href="#/${id}" tabindex="-1"><polygon points="${g.afdelingen[id].poly.map(q => q.join(',')).join(' ')}" /></a>`).join('');
    // Het lijntje van een uitgeweken speld naar zijn wijk (plaatsSpelden zet de plek en toont het).
    const lijnen = AFD.map(a => `<line class="ah-g-lijn" data-afd="${a.id}" visibility="hidden" /><circle class="ah-g-stip" data-afd="${a.id}" visibility="hidden" />`).join('');
    // De spelden krijgen hun plek in plaatsSpelden() (tot dan onzichtbaar, zodat ze niet verspringen).
    const spelden = AFD.map(a => `<a class="ah-speld" data-afd="${a.id}" href="#/${a.id}" tabindex="-1" aria-hidden="true" style="left:0;top:0;visibility:hidden"><b>${esc(a.naam)}</b><span data-speld="${a.id}"></span></a>`).join('');
    el.gebouw.innerHTML = `<div class="ah-gebouw" id="ah-gebouw" style="aspect-ratio:${W}/${H};--ah-verh:${(W / H).toFixed(4)}">
        <img class="ah-g-basis" src="/hub/gebouw.webp" srcset="/hub/gebouw-klein.webp 800w, /hub/gebouw.webp 1600w" sizes="(min-width: 1240px) 70vw, 100vw" alt="" width="${W}" height="${H}" decoding="async" />
        ${lagen}${dichten}
        <svg class="ah-g-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${paden}${vlakken}<g class="ah-g-lijnen">${lijnen}</g></svg>
        ${lampen}
        <div class="ah-g-wie" id="ah-g-wie"></div>
        ${spelden}
      </div>`;
    const doos = $('ah-gebouw');
    doos.querySelector('.ah-g-basis').addEventListener('error', geenGebouw, { once: true });
    const zet = (id) => { if (id) doos.dataset.aan = id; else delete doos.dataset.aan; doos.querySelectorAll('[data-afd]').forEach(n => n.classList.toggle('is-aan', !!id && n.dataset.afd === id)); };
    doos.querySelectorAll('.ah-g-vlak, .ah-speld').forEach(n => {
      n.addEventListener('pointerenter', () => zet(n.dataset.afd));
      n.addEventListener('pointerleave', () => zet(doos.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.afd : null));
      n.addEventListener('focus', () => zet(n.dataset.afd));
      n.addEventListener('blur', () => zet(null));
    });
    plaatsSpelden(true);
    if (window.ResizeObserver && !doos.__ahRO) { doos.__ahRO = new ResizeObserver(() => { plaatsSpelden(); tekenAanwezig(); }); doos.__ahRO.observe(doos); }
    // Het lettertype van de spelden kan later binnenkomen dan de eerste meting.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => plaatsSpelden()).catch(() => { /* geen lettertype-melding: de ResizeObserver vangt het op */ });
  }
  // Het icoon van een afdeling (zijbalk, tegels, onderbalk): uit gebouw.json als het er staat.
  function icoonVan(id) {
    const d = gebouw && gebouw.afdelingen && gebouw.afdelingen[id];
    const f = d && bestand(d.icoon);
    return f ? `/hub/${f}` : `/hub/aan-${id}.webp`;
  }
  // Het bewegende beeld van de stad: kleine lagen uit gebouw.json ("lus": vlaggen, lopers, baken)
  // óver het scherpe stilstaande beeld. Ze laden alleen als "minder beweging" uit staat en het
  // toestel het aankan (geen dataspaarstand, geen trage verbinding, genoeg geheugen en kernen),
  // en pas nadat het startscherm er staat. Zet iemand "minder beweging" aan, dan gaan ze weg.
  function kanLus() {
    if (rustig()) return false;
    const c = navigator.connection;
    if (c && (c.saveData || /^(slow-2g|2g|3g)$/.test(String(c.effectiveType || '')))) return false;
    if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4) return false;
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency < 4) return false;
    return true;
  }
  let lusWacht = null;
  function probeerLus() {
    const doos = $('ah-gebouw');
    if (!doos || !gebouw || gebouwMis) return;
    const lus = gebouw.lus && typeof gebouw.lus === 'object' ? gebouw.lus : null;
    const lagen = lus && Array.isArray(lus.lagen) ? lus.lagen.filter(l => l && bestand(l.src) && [l.x, l.y, l.w, l.h].every(n => Number.isFinite(Number(n)))) : [];
    if (!lagen.length || !kanLus()) {
      clearTimeout(lusWacht); lusWacht = null;
      doos.querySelectorAll('.ah-g-luslaag').forEach(n => n.remove());
      return;
    }
    if (lusWacht || doos.querySelector('.ah-g-luslaag')) return;
    lusWacht = setTimeout(() => {
      lusWacht = null;
      const basis = doos.isConnected && doos.querySelector('.ah-g-basis');
      if (!basis || !kanLus() || doos.querySelector('.ah-g-luslaag')) return;
      const W = gebouw.w, H = gebouw.h, pct = (v, van) => `${(Number(v) / van * 100).toFixed(3)}%`;
      let na = basis;
      for (const l of lagen) {
        const img = new Image();
        img.className = 'ah-g-luslaag'; img.alt = ''; img.decoding = 'async';
        img.style.cssText = `left:${pct(l.x, W)};top:${pct(l.y, H)};width:${pct(l.w, W)};height:${pct(l.h, H)}`;
        img.onload = () => requestAnimationFrame(() => img.classList.add('is-aan'));
        img.onerror = () => img.remove();
        na.after(img); na = img;
        img.src = `/hub/${bestand(l.src)}`;
      }
    }, 900);
  }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const opWissel = () => { if (aan) probeerLus(); };
    if (mq.addEventListener) mq.addEventListener('change', opWissel); else if (mq.addListener) mq.addListener(opWissel);
  }
  function tekenGebouw(st) {
    const doos = $('ah-gebouw');
    if (!doos) return;
    const pas = metPas(), nuIn = pas ? PAS().inWijk() : null;
    for (const a of AFD) {
      const s = st[a.id], dicht = pas && !magIn(a.id);
      const tekst = dicht ? 'geen toegang' : s.tekst;
      const sp = doos.querySelector(`[data-speld="${a.id}"]`);
      if (sp && sp.textContent !== tekst) sp.textContent = tekst;
      doos.querySelectorAll(`[data-afd="${a.id}"]`).forEach(n => { n.classList.toggle('is-let', s.let && !dicht); n.classList.toggle('is-geen', dicht); });
      const dl = doos.querySelector(`[data-dicht="${a.id}"]`);
      if (dl) { if (dicht && !dl.getAttribute('src')) dl.setAttribute('src', dl.dataset.src); dl.classList.toggle('is-zicht', dicht); }
      const lamp = doos.querySelector(`[data-lamp="${a.id}"]`);
      if (lamp) { if (lamp.hidden === pas) lamp.hidden = !pas; const staat = dicht ? 'geen' : nuIn === a.id ? 'open' : 'dicht'; if (lamp.dataset.staat !== staat) lamp.dataset.staat = staat; }
    }
    plaatsSpelden();   // de tekst in een speld kan langer of korter zijn geworden (rekent alleen opnieuw als de maat verandert)
  }

  // ── Nieuwe kaarten (zonder oud blok) ─────────────────────────────────────
  function maak(top) {
    const doel = top.el.querySelector('[data-maak]');
    if (!doel) return;
    const k = top.id;
    if (k === 'checkin') return setHtml(doel, kaartCheckin());
    if (k === 'crew') return setHtml(doel, kaartCrew());
    if (k === 'omroep') return setHtml(doel, kaartOmroep());
    if (k === 'schermen') return setHtml(doel, kaartSchermen());
    if (k === 'profielen') return maakProfielen(doel);
    if (k === 'toegang') return setHtml(doel, kaartToegang());
    if (k === 'systeem') return setHtml(doel, kaartSysteem());
  }
  const kaartKop = (oog, titel, sub) => `<header class="ah-kaart-kop"><div class="card-eyebrow ah-oog">${esc(oog)}</div><h3>${esc(titel)}</h3>${sub ? `<p class="rg-sub ah-sub">${sub}</p>` : ''}</header>`;

  function kaartCheckin() {
    const tm = teams().filter(x => x.status === 'approved');
    const binnen = tm.filter(x => x.checked_in_at);
    const lijst = comps();
    const naam = (id) => { const c = lijst.find(x => x.id === (id || 1)); return c ? c.name : ''; };
    const perSport = lijst.filter(c => c.active).map(c => {
      const alle = tm.filter(x => (x.competition_id || 1) === c.id), ok = alle.filter(x => x.checked_in_at).length;
      return alle.length ? `<li><span class="ah-balk-n">${isIcon(c.icon_small) ? `<img src="${esc(c.icon_small)}" alt="" width="22" height="22" />` : ''}${esc(c.name)}</span><span class="ah-balk" role="img" aria-label="${ok} van ${alle.length} binnen"><i style="width:${Math.round(ok / alle.length * 100)}%"></i></span><b>${ok}/${alle.length}</b></li>` : '';
    }).join('');
    const nog = tm.filter(x => !x.checked_in_at);
    return kaartKop('Mensen', 'Check-in', 'Een team is binnen zodra de captain bij de ingang zijn QR-code laat scannen.')
      + `<div class="ah-scan"><a class="rg-knop ah-knop ah-knop-groot" href="/checkin" target="_blank" rel="noopener">Open het scanscherm ↗</a><span>Opent in een nieuw tabblad. Op de telefoon bij de ingang log je in met de crew-code.</span></div>
        <div class="ah-cijfers ah-cijfers-in"><div class="ah-cijfer"><div class="ah-cijfer-v">${binnen.length}<small>/${tm.length}</small></div><div class="ah-cijfer-k">Binnen</div></div>
          <div class="ah-cijfer"><div class="ah-cijfer-v">${nog.length}</div><div class="ah-cijfer-k">Nog verwacht</div></div></div>
        ${perSport ? `<ul class="ah-balken">${perSport}</ul>` : ''}
        <h4 class="ah-tussenkop">Nog niet binnen${nog.length ? ` (${nog.length})` : ''}</h4>
        ${tm.length === 0 ? '<p class="ah-leeg">Er zijn nog geen goedgekeurde teams.</p>'
          : nog.length === 0 ? '<p class="ah-leeg">Iedereen is binnen.</p>'
          : `<p class="ah-tekst ah-checkin-uitleg">Geen QR bij de hand? Tik op <b>Check in</b> bij het team.</p>
            <ul class="ah-namen ah-namen-ci">${nog.slice(0, 60).map(x => `<li><span class="ah-namen-t"><b>${esc(x.team_name)}</b><span>${esc([naam(x.competition_id), x.captain_name].filter(Boolean).join(' · '))}</span></span><button type="button" class="rg-mini ah-mini" data-ah="checkin" data-id="${esc(x.id)}" aria-label="Check ${esc(x.team_name)} in">Check in</button></li>`).join('')}</ul>${nog.length > 60 ? `<p class="rg-eerlijk ah-eerlijk">En nog ${nog.length - 60}. De hele lijst staat bij Teams.</p>` : ''}`}
        ${magIn('veiligheid') ? '<div class="ah-kaart-k"><button type="button" class="rg-knop rg-knop-rustig ah-knop" data-ah="log-checkin">Check-ins in het logboek</button></div>' : ''}`;
  }

  function kaartCrew() {
    if (!crew) return kaartKop('Mensen', 'Crew: wie bedient wat', '') + `<p class="ah-leeg">${crewMis ? 'De crew-gegevens laden lukte niet. Probeer het zo opnieuw.' : 'Laden…'}</p>`;
    const wed = (m) => `${esc(m.a || 'Nog onbekend')} <span class="ah-vs">–</span> ${esc(m.b || 'Nog onbekend')}`;
    const zonder = zonderBediener();
    const mHoofd = hoofd();
    let h = kaartKop('Mensen', 'Crew: wie bedient wat', `Crew kiest in de bediening zelf een plek. Een plek telt als bezet zolang dat toestel zich blijft melden (ongeveer ${Math.round((crew.ttl_seconds || 90) / 30) * 30} seconden).`);
    h += `<div class="ah-cijfers ah-cijfers-in"><div class="ah-cijfer"><div class="ah-cijfer-v">${crewAantal()}</div><div class="ah-cijfer-k">Crew actief</div></div>
        <div class="ah-cijfer${zonder.length ? ' is-let' : ''}"><div class="ah-cijfer-v">${zonder.length}</div><div class="ah-cijfer-k">Live zonder bediener</div></div></div>`;
    if (zonder.length) {
      h += `<div class="ah-crew-let" role="status"><h4>Deze ${zonder.length === 1 ? 'wedstrijd loopt' : 'wedstrijden lopen'} zonder bediener</h4><ul>${zonder.map(m => `<li><b>${wed(m)}</b><span>${esc([m.competition, m.place, m.where].filter(Boolean).join(' · '))}${m.last_operator ? ` · laatst bediend door ${esc(m.last_operator.name)}` : ''}</span></li>`).join('')}</ul>
        <a class="rg-knop ah-knop" href="/wedstrijd" target="_blank" rel="noopener">Open de bediening ↗</a></div>`;
    }
    h += (crew.sports || []).map(s => {
      const plekken = (s.places || []).map(p => {
        const live = p.live || [];
        const wie = (p.crew || []).map(c => `<span class="ah-crewlid" title="Sinds ${esc(hm(c.since))}">${esc(c.name)}</span>`).join('');
        const liveH = live.map(m => `<div class="ah-plek-w is-live"><span class="ah-live">live</span><span class="ah-plek-wn">${wed(m)}</span>
            ${m.operator ? `<span class="ah-plek-op">${esc(m.operator.name)} bedient${m.operator.is_admin ? ' (admin)' : ''}</span><button type="button" class="rg-mini ah-mini" data-ah="crew-vrij" data-id="${esc(m.match_id)}" aria-label="Geef de bediening van ${esc(m.a || '')} tegen ${esc(m.b || '')} vrij">Geef vrij</button>`
              : (mHoofd && s.competition_id === mHoofd.id) ? '' : '<span class="ah-plek-op is-let">niemand bedient</span>'}</div>`).join('');
        const next = p.next ? `<div class="ah-plek-w"><span class="ah-tijd">${esc(p.next.expected || '')}</span><span class="ah-plek-wn">${wed(p.next)}</span></div>` : '';
        return `<li class="ah-plek${live.length ? ' is-live' : ''}${!(p.crew || []).length ? ' is-leeg' : ''}">
            <div class="ah-plek-kop"><b>${esc(p.place)}</b><span class="ah-plek-crew">${wie || '<span class="ah-plek-niemand">geen crew</span>'}</span></div>
            ${liveH}${next}${!live.length && !p.next ? '<div class="ah-plek-w ah-plek-rust">Niets gepland</div>' : ''}
          </li>`;
      }).join('');
      const los = (s.roaming || []).map(c => esc(c.name)).join(', ');
      return `<section class="ah-crew-sport" aria-label="${esc(s.name)}">
          <h4>${isIcon(s.icon_small) ? `<img src="${esc(s.icon_small)}" alt="" width="26" height="26" />` : ''}${esc(s.name)}</h4>
          <ul class="ah-plekken">${plekken}</ul>
          ${los ? `<p class="rg-eerlijk ah-eerlijk">Zonder vaste plek: ${los}</p>` : ''}
          ${mHoofd && s.competition_id === mHoofd.id ? '<p class="rg-eerlijk ah-eerlijk">Het bedienscherm van het hoofdtoernooi meldt niet wie bedient. Daarom staat hier geen naam bij de wedstrijden.</p>' : ''}
        </section>`;
    }).join('') || '<p class="ah-leeg">Er zijn nog geen actieve sporten met plekken.</p>';
    h += `<div class="ah-kaart-k"><a class="rg-knop rg-knop-rustig ah-knop" href="/wedstrijd" target="_blank" rel="noopener">Open de bediening ↗</a></div>`;
    return h;
  }

  function kaartOmroep() {
    return kaartKop('Communicatie', 'Omroep', 'Een eigen scherm voor wie de microfoon heeft: wat er nu speelt, wie zo aan de beurt is en de laatste uitslagen, als zinnen om voor te lezen.')
      + `<ul class="ah-punten"><li>Het scherm ververst vanzelf en volgt alle actieve sporten.</li><li>Inloggen kan met de crew-code of de admincode.</li><li>Er is een stand met grote letters voor op afstand.</li></ul>
        <div class="ah-kaart-k"><a class="rg-knop ah-knop" href="/omroep" target="_blank" rel="noopener">Open de omroep ↗</a></div>`;
  }

  // ── Schermen en pagina's: alles wat je op een ander apparaat opent ───────
  // Het webadres voor "Kopieer link" en de QR: het publieke adres van de installatie als dat
  // goed staat, anders het adres waarop je nu zelf kijkt.
  function basisAdres() {
    const sy = (R() && R().system) || {};
    const b = sy.base_url_ok && /^https?:\/\//.test(String(sy.base_url || '')) ? String(sy.base_url).replace(/\/+$/, '') : location.origin;
    return b;
  }
  function schermen() {
    const lijst = [
      { id: 'aanmelden', pad: '/', naam: 'Aanmeldpagina', uitleg: 'Waar teams en bezoekers zich aanmelden. Deze link deel je.' },
      { id: 'bord', pad: '/sporten', naam: 'Live-bord', uitleg: 'Wat bezoekers zien: alle sporten, standen en uitslagen. Ook voor een groot scherm.' },
    ];
    if (mijnBestaat) lijst.push({ id: 'mijn', pad: '/mijn', naam: 'Mijn team', uitleg: 'Voor deelnemers: het eigen team, de eigen wedstrijden en de check-in-QR.' });
    lijst.push(
      { id: 'bediening', pad: '/wedstrijd', naam: 'Crew-bediening', uitleg: 'Voor de crew: wedstrijden starten, scores bijhouden en afsluiten. Vraagt de crew-code.' },
      { id: 'checkin', pad: '/checkin', naam: 'Check-in', uitleg: 'Bij de ingang: de QR-code van de captain scannen. Vraagt de crew-code.' },
      { id: 'omroep', pad: '/omroep', naam: 'Omroep', uitleg: 'Voor wie de microfoon heeft: zinnen om voor te lezen. Vraagt de crew-code.' },
    );
    const m = hoofd();
    if (m && m.active) lijst.push({ id: 'tv', pad: '/toernooi.html?screen=1', naam: `Tv-scherm ${m.name}`, uitleg: 'Het bord van het hoofdtoernooi in grote letters, voor een tv of beamer.' });
    for (const c of actief().filter(x => x.matches && x.matches.total > 0)) {
      lijst.push({ id: `print-${c.id}`, pad: c.is_default ? '/print' : `/print?competition=${encodeURIComponent(c.id)}`, naam: `Print ${c.name}`, uitleg: 'Het schema op papier, voor als het internet wegvalt.', print: true });
    }
    return lijst;
  }
  // QR als SVG (vendor/qrcode.min.js staat al op de pagina). Zonder die bibliotheek: geen QR-knop.
  function qrSvg(tekst) {
    try {
      if (typeof qrcode !== 'function') return '';
      const q = qrcode(0, 'M');
      q.addData(tekst); q.make();
      const n = q.getModuleCount(), rand = 3;
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + rand} ${r + rand}h1v1h-1z`;
      return `<svg class="ah-qr" viewBox="0 0 ${n + rand * 2} ${n + rand * 2}" role="img" aria-label="QR-code" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#06193A"/></svg>`;
    } catch { return ''; }
  }
  function kaartSchermen() {
    if (mijnBestaat === null) {
      mijnBestaat = false;
      fetch('/mijn', { method: 'HEAD' }).then(r => { if (r.ok) { mijnBestaat = true; if (aan && route.t === 'schermen') teken(); } }).catch(() => { /* geen pagina: de rij blijft weg */ });
    }
    const basis = basisAdres(), kanQr = typeof qrcode === 'function';
    const nuKopie = kopieKlaar && kopieKlaar.tot > Date.now() ? kopieKlaar.id : null;
    const rij = (x) => {
      const url = basis + x.pad, open = qrOpen === x.id;
      return `<li class="ah-scherm${open ? ' is-qr' : ''}">
          <div class="ah-scherm-t"><b>${esc(x.naam)}</b><span>${esc(x.uitleg)}</span><code>${esc(url.replace(/^https?:\/\//, ''))}</code></div>
          <div class="ah-scherm-k">
            <a class="rg-knop ah-knop" href="${esc(x.pad)}" target="_blank" rel="noopener" aria-label="${esc(x.naam)} openen in een nieuw tabblad">Openen ↗</a>
            <button type="button" class="rg-knop rg-knop-rustig ah-knop${nuKopie === x.id ? ' is-klaar' : ''}" data-ah="scherm-kopie" data-id="${esc(x.id)}" aria-label="Kopieer de link van ${esc(x.naam)}">${nuKopie === x.id ? `${IC.check} Gekopieerd` : 'Kopieer link'}</button>
            ${kanQr ? `<button type="button" class="rg-knop rg-knop-rustig ah-knop" data-ah="scherm-qr" data-id="${esc(x.id)}" aria-expanded="${open}" aria-label="QR-code van ${esc(x.naam)}">QR</button>` : ''}
          </div>
          ${open ? `<div class="ah-scherm-qr">${qrSvg(url)}<p><b>Scan met de camera van een andere telefoon.</b> Dan opent ${esc(x.naam)} daar meteen.</p></div>` : ''}
        </li>`;
    };
    const alle = schermen();
    const gewoon = alle.filter(x => !x.print), prints = alle.filter(x => x.print);
    return kaartKop('Evenement', 'Schermen en pagina’s', 'Open het juiste scherm op het juiste apparaat. “Openen” gaat naar een nieuw tabblad; met de link of de QR open je het op een ander toestel.')
      + `<ul class="ah-schermen">${gewoon.map(rij).join('')}</ul>
        <h4 class="ah-tussenkop">Print per sport</h4>
        ${prints.length ? `<ul class="ah-schermen">${prints.map(rij).join('')}</ul>` : '<p class="ah-leeg">Zodra een sport een schema heeft, staat hier de print ervan.</p>'}
        <p class="ah-sr" aria-live="polite" id="ah-scherm-live"></p>`;
  }
  async function kopieerLink(id) {
    const x = schermen().find(q => q.id === id);
    if (!x) return;
    const url = basisAdres() + x.pad;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {
      // Oudere browser of geen toestemming: via een tijdelijk tekstveld.
      try {
        const t = document.createElement('textarea');
        t.value = url; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove();
      } catch { ok = false; }
    }
    if (!ok) { A.showToast('Kopiëren lukte niet. Houd de link ingedrukt om hem zelf te kopiëren.', 'error'); return; }
    kopieKlaar = { id, tot: Date.now() + 1800 };
    teken();
    const live = $('ah-scherm-live');
    if (live) live.textContent = `De link van ${x.naam} is gekopieerd.`;
    const knop = root.querySelector(`[data-ah="scherm-kopie"][data-id="${CSS.escape(id)}"]`);
    if (knop) { try { knop.focus({ preventScroll: true }); } catch { /* geen focus */ } }
    setTimeout(() => { if (kopieKlaar && kopieKlaar.id === id && kopieKlaar.tot <= Date.now() + 50) { kopieKlaar = null; if (aan) teken(); } }, 1850);
  }

  function kaartToegang() {
    const s = (R() && R().system) || {};
    const wie = ($('who') || {}).textContent || '';
    return kaartKop('Veiligheid', 'Codes', 'Wat je met elke code kunt. De codes zelf staan hier bewust niet.')
      + `<ul class="ah-toegang">
          <li><b>Admincode</b><span>${metPas()
            ? 'Voor dit scherm. Met de code kom je bij de profielkiezer; zonder profiel en pas kun je verder niets. Deel hem alleen met het organisatieteam.'
            : 'Voor dit scherm. Wie hem heeft kan alles: goedkeuren, mailen, wissen. Deel hem alleen met het organisatieteam.'}</span></li>
          <li><b>Crew-code</b><span>Voor de bediening, de check-in en de omroep. Daarmee kun je geen teams beoordelen of iets wissen.${s.crew_code === false ? ' <em class="ah-let-tekst">Nu niet ingesteld: de crew heeft dan de admincode nodig.</em>' : ''}</span></li>
          <li><b>Captain-link</b><span>Elke captain heeft een eigen link om alleen het eigen team te zien. Daar hoort geen code bij.</span></li>
        </ul>
        <h4 class="ah-tussenkop">Een code wijzigen</h4>
        <p class="ah-tekst">Dat doe je niet hier, maar bij de hosting van deze installatie: de instellingen <code>ADMIN_SHARED_CODE</code> en <code>CREW_CODE</code>. Doe dat na elk evenement, en meteen als een code is uitgelekt.</p>
        <p class="ah-tekst">${wie ? `Je bent nu ingelogd als <b>${esc(wie)}</b>. ` : ''}${metPas() ? 'Het logboek noteert het profiel waarmee iemand werkt.' : 'Het logboek noteert de naam waarmee iemand inlogt.'}</p>
        ${metPas() ? '<p class="ah-tekst">Iemand echt buiten de deur zetten? Verwijder het profiel <b>en</b> wijzig de admincode. Met alleen de code kan iemand anders een nieuw profiel maken zolang dat open staat.</p>' : ''}
        <div class="ah-kaart-k">${metPas() ? '<a class="rg-knop ah-knop" href="#/veiligheid/profielen">Profielen en passen</a>' : ''}<a class="rg-knop rg-knop-rustig ah-knop" href="#/veiligheid/logboek">Bekijk het logboek</a>${(() => { const m = PAS() && PAS().ik(); return m && !m.profielen_actief && !m.profielen_uit && m.kan_starten ? '<button type="button" class="rg-knop rg-knop-rustig ah-knop" data-ah="profiel-start">Start met profielen</button>' : ''; })()}</div>`;
  }

  function kaartSysteem() {
    const rijen = systeemRijen();
    const lab = { ok: 'In orde', let: 'Let op', fout: 'Oplossen', info: 'Ter info' };
    return kaartKop('Veiligheid', 'Systeemcontrole', 'Staat de installatie goed? Dit zijn instellingen van de hosting; je wijzigt ze daar.')
      + (rijen.length ? `<ul class="ah-systeem">${rijen.map(r => `<li class="is-${r.level}"><span class="ah-sys-l"><i class="ah-stip" aria-hidden="true"></i>${lab[r.level]}</span><div><b>${esc(r.kop)}</b><span>${esc(r.tekst)}</span>${r.waar ? `<em>${esc(r.waar)}</em>` : ''}</div></li>`).join('')}</ul>` : '<p class="ah-leeg">Laden…</p>')
      + `<p class="rg-eerlijk ah-eerlijk">Wat het evenement zelf nog mist (datum, locatie, spelregels, schema’s) staat bij <a href="#/evenement/klaar">Evenement, Klaar voor de start?</a></p>`;
  }

  // ── De kop van een afdeling: de close-up van de wijk ─────────────────────
  // Het kader van een wijk = het stuk van het overzicht dat de close-up laat zien. Staat er
  // geen "dichtbij" in gebouw.json, dan wordt het afgeleid uit de laag van de wijk (met marge,
  // in dezelfde verhouding) en toont de kop die uitsnede van het overzicht zelf.
  function kaderVan(id) {
    const d = gebouw && gebouw.afdelingen[id];
    if (!d) return [0, 0, gebouw ? gebouw.w : 1, gebouw ? gebouw.h : 1];
    const k = d.dichtbij && d.dichtbij.kader;
    if (Array.isArray(k) && k.length === 4 && k.every(n => Number.isFinite(Number(n))) && k[2] > 0 && k[3] > 0) return k.map(Number);
    const l = d.laag, marge = 0.16, v = 5 / 3;
    let w = l.w * (1 + 2 * marge), h = l.h * (1 + 2 * marge);
    if (w / h < v) w = h * v; else h = w / v;
    return [l.x + l.w / 2 - w / 2, l.y + l.h / 2 - h / 2, w, h];
  }
  // Zet een kader in een doos op het scherm: passend (heel in beeld) of dekkend (vult de doos).
  const pasIn = (k, doos, dek) => {
    const sc = (dek ? Math.max : Math.min)(doos.width / k[2], doos.height / k[3]);
    return { s: sc, x: doos.left + doos.width / 2 - (k[0] + k[2] / 2) * sc, y: doos.top + doos.height / 2 - (k[1] + k[3] / 2) * sc };
  };
  function zetKopBeeld(id) {
    const img = $('ah-afd-beeld'), lijst = $('ah-afd-lijst');
    if (!img || !lijst) return;
    const d = gebouw && !gebouwMis ? gebouw.afdelingen[id] : null;
    const db = d && d.dichtbij && bestand(d.dichtbij.src);
    const soort = db ? 'dichtbij' : d ? 'uitsnede' : 'los';
    const src = db ? `/hub/${db}` : d ? '/hub/gebouw.webp' : `/hub/aan-${id}.webp`;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    if (lijst.dataset.soort !== soort) lijst.dataset.soort = soort;
    if (lijst.dataset.afd !== id) lijst.dataset.afd = id;
    if (soort === 'uitsnede') pasUitsnede(); else if (img.getAttribute('style')) img.removeAttribute('style');
    if (window.ResizeObserver && !lijst.__ahRO) { lijst.__ahRO = new ResizeObserver(() => pasUitsnede()); lijst.__ahRO.observe(lijst); }
  }
  function pasUitsnede() {
    const lijst = $('ah-afd-lijst'), img = $('ah-afd-beeld');
    if (!lijst || !img || lijst.dataset.soort !== 'uitsnede' || !gebouw) return;
    const bw = lijst.clientWidth, bh = lijst.clientHeight;
    if (!bw || !bh) return;
    const T = pasIn(kaderVan(lijst.dataset.afd), { left: 0, top: 0, width: bw, height: bh }, true);
    const st = `position:absolute;max-width:none;width:${(gebouw.w * T.s).toFixed(1)}px;height:${(gebouw.h * T.s).toFixed(1)}px;left:${T.x.toFixed(1)}px;top:${T.y.toFixed(1)}px;`;
    if (img.getAttribute('style') !== st) img.setAttribute('style', st);
  }

  // ── Camera: inzoomen op een wijk, hangen bij het poortje, door naar de afdeling ──
  // Een eigen laag over de pagina met de stad erin (dezelfde bestanden als het plein). De
  // stad-laag krijgt alleen `transform` en `opacity`: er verschuift dus niets in de pagina.
  // Elke maat komt uit gebouw.json. Bij "minder beweging" wordt er niet geschaald of
  // geschoven: de laag verschijnt en verdwijnt met een korte overgang.
  const cam = { el: null, stad: null, afd: null, begin: null };
  const camT = (T) => `translate3d(${T.x.toFixed(2)}px, ${T.y.toFixed(2)}px, 0) scale(${T.s.toFixed(5)})`;
  function camBouw() {
    if (cam.el) return;
    const d = document.createElement('div');
    d.id = 'ah-camera'; d.className = 'ah-cam'; d.hidden = true;
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = `<div class="ah-cam-achter"></div>
      <div class="ah-cam-stad" style="width:${Number(gebouw.w)}px;height:${Number(gebouw.h)}px">
        <img class="ah-cam-basis" src="/hub/gebouw.webp" alt="" width="${Number(gebouw.w)}" height="${Number(gebouw.h)}" decoding="async" />
        <img class="ah-cam-dichtbij" alt="" decoding="async" />
        <img class="ah-cam-dicht" alt="" decoding="async" />
        <img class="ah-cam-aan" alt="" decoding="async" />
        <i class="ah-cam-lamp" data-staat="dicht"></i>
      </div>`;
    d.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    d.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.body.appendChild(d);
    cam.el = d; cam.stad = d.querySelector('.ah-cam-stad');
  }
  function camKies(afd, modus) {
    const d = gebouw.afdelingen[afd], q = (c) => cam.el.querySelector(c);
    const zet = (img, o, src) => {
      if (!o || !src) { img.removeAttribute('src'); img.style.cssText = 'display:none'; return; }
      img.style.cssText = `left:${Number(o.x)}px;top:${Number(o.y)}px;width:${Number(o.w)}px;height:${Number(o.h)}px`;
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    };
    zet(q('.ah-cam-aan'), d.laag, `/hub/${bestand(d.laag.src) || `aan-${afd}.webp`}`);
    const df = d.dicht && bestand(d.dicht.src);
    zet(q('.ah-cam-dicht'), modus === 'dicht' && df ? d.dicht : null, df ? `/hub/${df}` : null);
    const k = kaderVan(afd), db = d.dichtbij && bestand(d.dichtbij.src);
    zet(q('.ah-cam-dichtbij'), db && modus !== 'dicht' ? { x: k[0], y: k[1], w: k[2], h: k[3] } : null, db ? `/hub/${db}` : null);
    const lamp = q('.ah-cam-lamp'), p = d.poort;
    lamp.style.display = metPas() && Array.isArray(p) ? '' : 'none';
    if (Array.isArray(p)) { lamp.style.left = `${Number(p[0])}px`; lamp.style.top = `${Number(p[1])}px`; }
    lamp.dataset.staat = modus === 'dicht' ? 'geen' : 'dicht';
    cam.afd = afd;
    cam.el.className = `ah-cam${modus === 'dicht' ? ' is-dicht' : ''}${db && modus !== 'dicht' ? ' heeft-dichtbij' : ''}`;
    cam.stad.style.opacity = '';
  }
  // Waar de camera begint: precies op de stad van het plein, op de kop van de afdeling
  // waar je staat, of (als geen van beide in beeld is) op het hele overzicht.
  function camBegin() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const doos = $('ah-gebouw');
    if (!route.afd && doos) {
      const r = doos.getBoundingClientRect();
      if (r.width > 40 && r.bottom > 60 && r.top < vh - 60) return { T: { s: r.width / gebouw.w, x: r.left, y: r.top }, soort: 'stad' };
    }
    const lijst = $('ah-afd-lijst');
    if (route.afd && lijst && gebouw.afdelingen[route.afd]) {
      const r = lijst.getBoundingClientRect();
      if (r.width > 20 && r.bottom > 0 && r.top < vh) return { T: pasIn(kaderVan(route.afd), r, true), soort: 'kop' };
    }
    return { T: pasIn([0, 0, gebouw.w, gebouw.h], { left: vw * 0.06, top: vh * 0.08, width: vw * 0.88, height: vh * 0.84 }, false), soort: 'los' };
  }
  // De ruimte voor de wijk terwijl het paneel open staat: links ervan (laptop) of erboven (telefoon).
  function poortDoos() {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (vw < 760) return { left: 0, top: 10, width: vw, height: Math.max(170, vh * 0.4 - 10) };
    const paneel = Math.min(372, vw) + Math.max(20, Math.min(56, vw * 0.04)) + 28;
    return { left: 24, top: 24, width: Math.max(240, vw - paneel - 24), height: vh - 48 };
  }
  function camZet(T, ms, curve, extra) {
    const st = cam.stad;
    cam.T = T;
    return new Promise((ok) => {
      if (!ms || rustig()) { st.style.transition = 'none'; st.style.transform = camT(T); requestAnimationFrame(() => ok()); return; }
      st.style.transition = `transform ${ms}ms ${curve || 'cubic-bezier(.3, .05, .15, 1)'}${extra ? `, ${extra}` : ''}`;
      void st.offsetWidth;
      st.style.transform = camT(T);
      setTimeout(ok, ms + 50);
    });
  }
  async function camStart(afd, modus) {
    camBouw();
    camKies(afd, modus);
    const b = camBegin();
    cam.begin = b;
    const st = cam.stad;
    st.style.transition = 'none';
    st.style.transform = camT(b.T);
    cam.T = b.T;
    st.style.opacity = b.soort === 'stad' ? '1' : '0';
    cam.el.hidden = false;
    void st.offsetWidth;
    cam.el.classList.add('is-zicht');
    if (b.soort !== 'stad') { st.style.transition = 'opacity 170ms ease'; st.style.opacity = '1'; if (!rustig()) await slaap(180); }
  }
  // metPaneel: de wijk komt naast (of boven) het cijferpaneel te staan en de camera wacht daar.
  // Zonder paneel is dit de eerste helft van één doorgaande beweging.
  async function camNaarPoort(afd, metPaneel) {
    const k = kaderVan(afd), lucht = 1.26, vw = window.innerWidth, vh = window.innerHeight;
    const groot = [k[0] - k[2] * (lucht - 1) / 2, k[1] - k[3] * (lucht - 1) / 2, k[2] * lucht, k[3] * lucht];
    const T = pasIn(groot, metPaneel ? poortDoos() : { left: vw * 0.06, top: vh * 0.06, width: vw * 0.88, height: vh * 0.88 }, false);
    cam.el.classList.add('is-poort');
    if (metPaneel) await camZet(T, 680);
    else await camZet(T, 460, 'cubic-bezier(.45, 0, .6, 1)');
  }
  function camOpen() { if (cam.el) { cam.el.classList.add('is-open'); const l = cam.el.querySelector('.ah-cam-lamp'); if (l) l.dataset.staat = 'open'; } }
  // Door de poort: de camera zoomt door tot de close-up precies op de kop van de afdeling
  // ligt; daar blijft hij staan (de laag lost op, het echte kopbeeld staat eronder).
  async function camDoor(afd) {
    if (!cam.el || cam.el.hidden) return;
    await beeldje();
    const lijst = $('ah-afd-lijst'), r = lijst ? lijst.getBoundingClientRect() : null;
    if (rustig() || !r || r.width < 20) { cam.el.classList.add('is-uit'); await slaap(rustig() ? 160 : 200); return camWeg(); }
    const eind = pasIn(kaderVan(afd), r, true), nu = cam.T;
    if (nu && eind.s < nu.s * 0.98) {
      // De kop van de afdeling is kleiner dan het beeld bij het poortje (brede schermen). Naar
      // die kop toe zou de camera UITzoomen, net na "poort open". Daarom gaat hij hier dóór de
      // poort: nog een stuk verder in, op het poortje gericht, en lost dan op in de afdeling.
      const ms = 520, d = gebouw.afdelingen[afd], k = kaderVan(afd);
      const punt = Array.isArray(d.poort) ? d.poort : [k[0] + k[2] / 2, k[1] + k[3] / 2];
      const s2 = nu.s * 1.5;
      // Het poortje schuift tijdens het inzoomen naar het midden van het scherm.
      const sx = nu.x + punt[0] * nu.s, sy = nu.y + punt[1] * nu.s;
      const mx = sx + (window.innerWidth / 2 - sx) * 0.55, my = sy + (window.innerHeight / 2 - sy) * 0.55;
      cam.el.style.setProperty('--cam-ms', `${ms}ms`);
      cam.el.classList.add('is-poort', 'is-door', 'is-doorheen');
      cam.stad.style.opacity = '0';
      await camZet({ s: s2, x: mx - punt[0] * s2, y: my - punt[1] * s2 }, ms, 'cubic-bezier(.4, 0, .7, .6)', `opacity ${Math.round(ms * 0.55)}ms ease ${Math.round(ms * 0.4)}ms`);
      return camWeg();
    }
    const ms = 620;
    cam.el.style.setProperty('--cam-ms', `${ms}ms`);
    cam.el.classList.add('is-poort', 'is-door');
    cam.stad.style.opacity = '0';
    await camZet(eind, ms, 'cubic-bezier(.3, .3, .15, 1)', `opacity ${Math.round(ms * 0.3)}ms ease ${Math.round(ms * 0.7)}ms`);
    camWeg();
  }
  // Geannuleerd of geen toegang: terug naar waar de camera begon.
  async function camTerug() {
    if (!cam.el || cam.el.hidden) return;
    cam.el.classList.remove('is-open', 'is-poort', 'is-dicht');
    const b = cam.begin;
    if (rustig() || !b || b.soort !== 'stad') { cam.el.classList.add('is-uit'); await slaap(rustig() ? 160 : 220); return camWeg(); }
    cam.el.classList.remove('is-zicht');
    await camZet(camBegin().T, 440);
    camWeg();
  }
  // Terug naar het plein = uitzoomen: van de kop van de afdeling naar de stad op het plein.
  async function camUit(van, zetPlein) {
    const lijst = $('ah-afd-lijst'), r = lijst ? lijst.getBoundingClientRect() : null;
    const zicht = !!r && r.width > 20 && r.bottom > 0 && r.top < window.innerHeight;
    if (rustig() || !gebouw.afdelingen[van]) { zetPlein(); return; }
    camBouw();
    camKies(van);
    const st = cam.stad, vw = window.innerWidth, vh = window.innerHeight;
    const T2 = zicht ? pasIn(kaderVan(van), r, true) : pasIn(kaderVan(van), { left: vw * 0.1, top: vh * 0.1, width: vw * 0.8, height: vh * 0.8 }, false);
    st.style.transition = 'none'; st.style.transform = camT(T2); st.style.opacity = '0';
    cam.el.classList.add('is-poort', 'is-snel');
    cam.el.hidden = false;
    void st.offsetWidth;
    st.style.transition = 'opacity 180ms ease'; st.style.opacity = '1';
    cam.el.classList.add('is-zicht');
    await slaap(200);
    zetPlein();                                     // het plein staat nu onder de laag
    await beeldje();
    const doos = $('ah-gebouw'), g = doos ? doos.getBoundingClientRect() : null;
    if (!g || g.width < 40) { cam.el.classList.add('is-uit'); await slaap(200); return camWeg(); }
    const ms = 700;
    cam.el.classList.remove('is-poort', 'is-snel');   // de close-up lost op in het overzicht
    setTimeout(() => { if (cam.el) cam.el.classList.remove('is-zicht'); }, ms * 0.4);
    await camZet({ s: g.width / gebouw.w, x: g.left, y: g.top }, ms, 'cubic-bezier(.5, 0, .15, 1)');
    st.style.transition = 'opacity 150ms ease'; st.style.opacity = '0';
    await slaap(160);
    camWeg();
  }
  function camWeg() {
    if (!cam.el) return;
    cam.el.hidden = true;
    cam.el.className = 'ah-cam';
    cam.stad.style.transition = 'none';
    cam.stad.style.opacity = '';
    cam.begin = null; cam.T = null;
  }

  // ── Wie is waar (alleen hoofden) ─────────────────────────────────────────
  // De server geeft de lijst alleen aan hoofden; anderen zien hier niets, ook zichzelf niet.
  async function laadAanwezig(nu) {
    const P = PAS();
    if (!aan || !P || !P.isHoofd() || route.afd) { if (!P || !P.isHoofd()) tekenAanwezig(); return; }
    if (!nu && Date.now() - aanwezigOp < 8000) return;
    aanwezigOp = Date.now();
    await P.laadAanwezig();
    if (aan && !route.afd) tekenAanwezig();
  }
  const klokTijd = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function tekenAanwezig() {
    const P = PAS(), blok = $('ah-wie'), laag = $('ah-g-wie');
    const mag = !!(P && P.isHoofd());
    const lijst = mag ? (P.aanwezig() || []) : [];
    const mij = mag && P.ik().profiel ? P.ik().profiel.id : null;
    if (blok) {
      const rij = (x) => `<li>${P.rondje(x)}<span class="ah-wie-t"><b>${esc(x.naam)}${x.pid === mij ? ' <i>(jij)</i>' : ''}</b><span>${esc(x.functie || '')}</span></span><span class="ah-wie-p">${x.plek && afdVan(x.plek) ? esc(afdVan(x.plek).naam) : 'op het plein'}${x.sinds_ms ? `<small>sinds ${klokTijd(x.sinds_ms)}</small>` : ''}</span></li>`;
      const sorteer = lijst.slice().sort((a, b) => (a.plek ? 0 : 1) - (b.plek ? 0 : 1) || String(a.naam).localeCompare(String(b.naam), 'nl'));
      setHtml(blok, mag ? `<h3 class="ah-wie-titel" id="ah-wie-titel">Wie is waar</h3>
        ${sorteer.length ? `<ul class="ah-wie-lijst">${sorteer.map(rij).join('')}</ul>` : `<p class="ah-wie-leeg">${P.aanwezigKlaar() ? 'Niemand heeft de admin nu open.' : 'Even kijken wie er is…'}</p>`}
        <p class="ah-wie-noot">Alleen hoofden zien dit. Het is geen geschiedenis: wie de admin sluit, is binnen een minuut uit beeld.</p>` : '');
      if (blok.hidden === mag) blok.hidden = !mag;
    }
    if (!laag || !gebouw) return;
    const doos = $('ah-gebouw'), bw = doos ? doos.clientWidth : 0;
    if (!mag || !bw) { setHtml(laag, ''); return; }
    const f = bw / gebouw.w, d = bw < 520 ? 22 : 26;
    const pct = (v, van) => `${(v / van * 100).toFixed(2)}%`;
    const nu = new Set();
    const html = AFD.map(a => {
      const wie = lijst.filter(x => x.plek === a.id);
      const alle = (gebouw.afdelingen[a.id] && gebouw.afdelingen[a.id].plekken) || [];
      if (!wie.length || !alle.length) return '';
      // Zoveel plekken als er passen: twee rondjes mogen elkaar net raken, niet bedekken.
      const vrij = [];
      for (const q of alle) if (Array.isArray(q) && vrij.every(g => Math.hypot((g[0] - q[0]) * f, (g[1] - q[1]) * f) >= d * 0.82)) vrij.push(q);
      const toon = wie.length > vrij.length ? Math.max(0, vrij.length - 1) : wie.length;
      const rest = wie.length - toon;
      const zin = `In ${a.naam}: ${wie.map(x => `${x.naam}${x.sinds_ms ? ` (sinds ${klokTijd(x.sinds_ms)})` : ''}`).join(', ')}`;
      let h = '';
      wie.slice(0, toon).forEach((x, i) => {
        const sleutel = `${x.pid}:${a.id}`;
        nu.add(sleutel);
        h += `<span class="ah-g-rond pf-rond pf-k-${P.KLEUREN.includes(x.kleur) ? x.kleur : 'grijs'}${aanwezigEerder.has(sleutel) ? '' : ' is-nieuw'}" style="left:${pct(vrij[i][0], gebouw.w)};top:${pct(vrij[i][1], gebouw.h)};--r:${d}px" title="${esc(`${x.naam}${x.functie ? `, ${x.functie}` : ''} · in ${a.naam}${x.sinds_ms ? ` sinds ${klokTijd(x.sinds_ms)}` : ''}`)}">${esc(x.initialen || '?')}</span>`;
      });
      if (rest > 0 && vrij.length) {
        const q = vrij[toon];
        h += `<span class="ah-g-rond ah-g-meer pf-rond" style="left:${pct(q[0], gebouw.w)};top:${pct(q[1], gebouw.h)};--r:${d}px" title="${esc(wie.slice(toon).map(x => x.naam).join(', '))}">+${rest}</span>`;
      }
      return `<span class="ah-g-groep" role="img" aria-label="${esc(zin)}">${h}</span>`;
    }).join('');
    setHtml(laag, html);
    aanwezigEerder = nu;
  }

  // ── Veiligheid: profielen en passen ──────────────────────────────────────
  async function laadBeheer(nu) {
    if (!aan || beheerBezig || !metPas() || PAS().inWijk() !== 'veiligheid') return;
    if (!nu && Date.now() - (laadBeheer.op || 0) < 9000) return;
    beheerBezig = true; laadBeheer.op = Date.now();
    try {
      const r = await A.api('/api/admin/profielen/beheer', { stil: true });
      if (r.ok) { beheer = await r.json(); beheerMis = false; }
      else { beheerMis = true; if (r.status === 403) beheer = null; }
    } catch { beheerMis = true; }
    beheerBezig = false;
    if (aan && route.afd === 'veiligheid' && route.t === 'profielen' && !A.userIsBusy()) teken();
  }
  function maakProfielen(doel) {
    const P = PAS();
    if (!doel.querySelector('[data-pb-lijst]')) {
      doel.__ah = null;
      doel.innerHTML = `${kaartKop('Veiligheid', 'Profielen en passen', 'Elke beheerder heeft een eigen profiel en een pas van 4 cijfers. Hier bepaal je wie in welke afdeling mag komen, en help je iemand die zijn pas kwijt is.')}
        <div data-pb-lijst></div><div data-pb-ww></div><div data-pb-nood></div>`;
    }
    const lijst = doel.querySelector('[data-pb-lijst]'), wwEl = doel.querySelector('[data-pb-ww]'), nood = doel.querySelector('[data-pb-nood]');
    const mij = P && P.ik() && P.ik().profiel;
    if (beheer && P && P.inWijk() !== 'veiligheid') beheer = null;      // poort dicht: de lijst gaat uit beeld
    if (!beheer) {
      setHtml(lijst, `<p class="ah-leeg">${P && P.inWijk() !== 'veiligheid' ? 'De poort van Veiligheid is dicht. Vul het wachtwoord in om de profielen te zien.' : beheerMis ? 'De profielen laden lukte niet. Probeer het zo opnieuw.' : 'Laden…'}</p>`);
    } else {
      const wijken = Array.isArray(beheer.wijken) && beheer.wijken.length ? beheer.wijken : AFD.map(a => a.id);
      const nu = (beheer.server_nu || Date.now());
      const eigenaar = beheer.profielen.find(x => x.is_eigenaar);
      const ikEig = !!(mij && mij.is_eigenaar);
      const geblokt = (x) => x.geblokkeerd_tot_ms > nu || x.ww_geblokkeerd_tot_ms > nu || x.poort_geblokkeerd_tot_ms > nu;
      const knoppen = (x, zelf, kanHoofd) => {
        const k = [
          // Wie hoofd is bepaalt alleen de eigenaar. Voor anderen staat de schakelaar er wel (je ziet de
          // stand), maar uitgeschakeld en met de reden erbij, in plaats van een foutmelding na het tikken.
          x.is_eigenaar ? '' : `<button type="button" class="ah-pb-schakel" role="switch" aria-checked="${!!x.is_hoofd}" data-ah="pb-hoofd" data-id="${esc(x.id)}"${kanHoofd ? '' : ` disabled aria-disabled="true" title="Alleen de eigenaar bepaalt wie hoofd is"`}><span class="ah-pb-schuif" aria-hidden="true"></span>Hoofd<span class="ah-pb-uitleg">${kanHoofd ? 'ziet wie waar is' : `alleen ${esc(eigenaar ? eigenaar.naam : 'de eigenaar')} kan dit wijzigen`}</span></button>`,
          geblokt(x) ? `<button type="button" class="rg-mini ah-mini ah-mini-let" data-ah="pb-vrij" data-id="${esc(x.id)}">Blokkade opheffen</button>` : '',
          // De pas van een hoofd opnieuw instellen of een hoofd (of de eigenaar) overal uitloggen kan alleen
          // de eigenaar: voor anderen staan die knoppen er niet (de server weigert het ook).
          x.is_eigenaar || zelf || (x.is_hoofd && !ikEig) ? '' : `<button type="button" class="rg-mini ah-mini" data-ah="pb-pas" data-id="${esc(x.id)}">Pas opnieuw instellen</button>`,
          x.sessies && !zelf && !((x.is_eigenaar || x.is_hoofd) && !ikEig) ? `<button type="button" class="rg-mini ah-mini" data-ah="pb-uit" data-id="${esc(x.id)}">Overal uitloggen</button>` : '',
          mij && mij.is_eigenaar && !x.is_eigenaar ? `<button type="button" class="rg-mini ah-mini" data-ah="pb-eigenaar" data-id="${esc(x.id)}">Maak eigenaar</button>` : '',
          x.is_eigenaar || zelf ? '' : `<button type="button" class="rg-mini ah-mini ah-mini-weg" data-ah="pb-weg" data-id="${esc(x.id)}">Verwijderen</button>`,
        ].join('');
        return k ? `<div class="ah-pb-k">${k}</div>` : '';
      };
      const rij = (x) => {
        const zelf = mij && mij.id === x.id;
        const labels = [x.is_eigenaar ? '<span class="ah-pb-l is-eig">Eigenaar</span>' : x.is_hoofd ? '<span class="ah-pb-l">Hoofd</span>' : '', zelf ? '<span class="ah-pb-l">Jij</span>' : '',
          x.geblokkeerd_tot_ms > nu ? `<span class="ah-pb-l is-let">pas geblokkeerd tot ${klokTijd(x.geblokkeerd_tot_ms - (nu - Date.now()))}</span>` : '',
          x.ww_geblokkeerd_tot_ms > nu ? `<span class="ah-pb-l is-let">wachtwoord geblokkeerd tot ${klokTijd(x.ww_geblokkeerd_tot_ms - (nu - Date.now()))}</span>` : '',
          x.poort_geblokkeerd_tot_ms > nu ? `<span class="ah-pb-l is-let">poort geblokkeerd tot ${klokTijd(x.poort_geblokkeerd_tot_ms - (nu - Date.now()))}</span>` : '',
          x.pas_moet_nieuw ? '<span class="ah-pb-l">tijdelijke pas</span>' : '',
          x.sessies ? `<span class="ah-pb-l is-stil">${plural(x.sessies, 'toestel ingelogd', 'toestellen ingelogd')}</span>` : ''].join('');
        const chips = wijken.filter(w => afdVan(w)).map(w => {
          const heeft = x.is_eigenaar || (x.toegang || []).includes(w);
          return `<button type="button" class="ah-pb-chip" data-ah="pb-wijk" data-id="${esc(x.id)}" data-wijk="${esc(w)}" aria-pressed="${heeft}"${x.is_eigenaar ? ' disabled' : ''}><span class="ah-pb-vink" aria-hidden="true">${heeft ? IC.check : ''}</span>${esc(afdVan(w).naam)}</button>`;
        }).join('');
        const kanHoofd = !x.is_eigenaar && !!(mij && mij.is_eigenaar);
        return `<li class="ah-pb" data-id="${esc(x.id)}">
          <div class="ah-pb-kop">${P.rondje(x, 'pf-rond-m')}<div class="ah-pb-wie"><b>${esc(x.naam)}</b><span>${esc(x.functie || '')}</span></div><div class="ah-pb-labels">${labels}</div></div>
          <div class="ah-pb-wijken" role="group" aria-label="Afdelingen waar ${esc(x.naam)} in mag">${chips}</div>
          ${x.is_eigenaar ? '<p class="ah-pb-noot">De eigenaar mag altijd overal in en is altijd hoofd.</p>' : ''}
          ${knoppen(x, zelf, kanHoofd)}
        </li>`;
      };
      const open = beheer.aanmaken !== 'dicht';
      const stand = ['elke_wijk', 'kwartier', 'inloggen'].includes(beheer.pas_vragen) ? beheer.pas_vragen : null;
      const min = Number(beheer.pas_warm_min) || 15;
      const PV = [
        ['elke_wijk', 'Bij elke afdeling', 'Elke afdeling vraagt de pas opnieuw. Het strengst, en het meeste typen.'],
        ['kwartier', min === 15 ? 'Na een kwartier stilstand' : `Na ${min} minuten stilstand`, `Na het intoetsen blijft de pas actief zolang je bezig bent: de poortjes scannen hem vanzelf. Wie ${min === 15 ? 'een kwartier' : `${min} minuten`} niets doet (of zijn telefoon vergrendelt) toetst hem opnieuw in.`],
        ['inloggen', 'Alleen bij inloggen', 'De pas wordt alleen bij het inloggen gevraagd; daarna gaan de poortjes vanzelf open tot je uitlogt. Kies dit alleen als iedereen zijn toestel vergrendelt.'],
      ];
      const aantal = Number.isFinite(Number(beheer.aantal)) ? Number(beheer.aantal) : beheer.profielen.length;
      const max = Number(beheer.max_profielen) || 0;
      setHtml(lijst, `${stand ? `<div class="ah-pb-pas"><h4 class="ah-tussenkop" id="ah-pb-pas-kop">Pas vragen</h4>
          <div class="ah-pb-keuze" role="group" aria-labelledby="ah-pb-pas-kop">${PV.map(([v, naam]) => `<button type="button" aria-pressed="${stand === v}" class="ah-pb-optie" data-ah="pb-pasvragen" data-stand="${v}">${esc(naam)}</button>`).join('')}</div>
          <p class="ah-tekst">${esc((PV.find(x => x[0] === stand) || PV[1])[2])} Veiligheid vraagt altijd het wachtwoord.</p></div>` : ''}
        <div class="ah-pb-top"><button type="button" class="ah-pb-schakel" role="switch" aria-checked="${open}" data-ah="pb-aanmaken"><span class="ah-pb-schuif" aria-hidden="true"></span>Nieuwe profielen toestaan</button>
          <span>${open ? 'Wie de admincode heeft, kan nu zelf een profiel maken. Dat profiel mag overal in behalve Veiligheid.' : 'Niemand kan nu een nieuw profiel maken. Zet dit open als er iemand bij moet.'}</span></div>
        <p class="ah-pb-tel"><b>${aantal}${max ? ` van ${max}` : ''} profielen</b>${max && aantal >= max ? ' · vol: verwijder er eerst een' : ''}</p>
        <ul class="ah-pb-lijst">${beheer.profielen.slice().sort((a, b) => (b.is_eigenaar ? 1 : 0) - (a.is_eigenaar ? 1 : 0) || String(a.naam).localeCompare(String(b.naam), 'nl')).map(rij).join('')}</ul>`);
      const ikEigenaar = !!(mij && mij.is_eigenaar);
      const wwVorm = ikEigenaar ? 'eigenaar' : `anders:${eigenaar ? eigenaar.naam : ''}`;
      if (wwEl.dataset.vorm !== wwVorm) {
        wwEl.dataset.vorm = wwVorm;
        wwEl.innerHTML = `<h4 class="ah-tussenkop">Wachtwoord van Veiligheid wijzigen</h4>` + (ikEigenaar
          ? `<form class="ah-pb-ww" data-pb-wwform novalidate autocomplete="off">
              <p class="ah-tekst">Deze afdeling gaat open met een wachtwoord in plaats van een pas. Na het wijzigen gaan alle andere beheerders die in Veiligheid staan terug naar het plein.</p>
              <div class="ah-pb-velden">
                <label>Huidig wachtwoord<input type="password" name="huidig" autocomplete="current-password" maxlength="100" /></label>
                <label>Nieuw wachtwoord (minstens 10 tekens)<input type="password" name="nieuw" autocomplete="new-password" maxlength="100" /></label>
                <label>Nieuw wachtwoord, nog een keer<input type="password" name="nieuw2" autocomplete="new-password" maxlength="100" /></label>
              </div>
              <p class="ah-pb-fout" role="alert" data-pb-wwfout></p>
              <div class="ah-kaart-k"><button type="submit" class="rg-knop ah-knop">Wijzig wachtwoord</button></div>
            </form>`
          : `<p class="ah-tekst">Dat kan alleen de eigenaar${eigenaar ? ` (<b>${esc(eigenaar.naam)}</b>)` : ''}.</p>`);
        const vorm = wwEl.querySelector('[data-pb-wwform]');
        if (vorm) vorm.addEventListener('submit', wijzigWachtwoord);
      }
    }
    setHtml(nood, `<h4 class="ah-tussenkop">Pas of wachtwoord vergeten?</h4>
      <ul class="ah-toegang">
        <li><b>Iemand is zijn pas vergeten</b><span>Tik hierboven op “Pas opnieuw instellen”. Je krijgt een tijdelijke pas te zien die je doorgeeft; bij het inloggen kiest diegene zelf een nieuwe.</span></li>
        <li><b>Iemand is geblokkeerd na te veel foute pogingen</b><span>Bij dat profiel staat dan “Blokkade opheffen”. De pas zelf blijft dezelfde.</span></li>
        <li><b>De eigenaar is zijn pas vergeten, of niemand weet het wachtwoord nog</b><span>Dat kan alleen via de server: het noodherstel. Vraag wie bij de hosting van deze installatie kan.</span></li>
        <li><b>Niemand weet meer wie de eigenaar is</b><span>Ook dat gaat via de server: alle profielen wissen, waarna de eerste die een profiel maakt eigenaar wordt. Voor de dag zelf is er een noodrem: dan werkt de admin weer met alleen de code.</span></li>
      </ul>
      <details class="ah-pb-hosting">
        <summary>Voor wie bij de hosting kan</summary>
        <ul class="ah-toegang">
          <li><b>Noodherstel</b><span>Zet tijdelijk <code>PROFIELEN_HERSTEL_PAS</code> (4 cijfers, voor de eigenaar) of <code>PROFIELEN_HERSTEL_WACHTWOORD</code> (minstens 10 tekens) en herstart. Haal de instelling daarna weer weg.</span></li>
          <li><b>Alles wissen</b><span>Met <code>PROFIELEN_WISSEN</code> verdwijnen alle profielen bij de herstart.</span></li>
          <li><b>Noodrem</b><span>Met <code>PROFIELEN_UIT=1</code> staan de profielen uit tot je de instelling weghaalt.</span></li>
        </ul>
        <p class="rg-eerlijk ah-eerlijk">De stappen staan uitgeschreven in <code>docs/ADMIN-PROFIELEN.md</code>.</p>
      </details>
      <p class="rg-eerlijk ah-eerlijk">Wie waar is geweest wordt nergens bewaard; het logboek noteert wel wie Veiligheid opende en wie een pas opnieuw instelde.</p>`);
  }
  async function stuurBeheer(method, pad, body, ok) {
    try {
      const r = await A.api(pad, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { A.showToast(j.error || 'Dat lukte niet.', 'error'); return null; }
      if (ok) A.showToast(ok);
      return j;
    } catch (e) {
      if (!e || e.message !== 'Sessie verlopen') A.showToast('Geen verbinding — probeer het zo opnieuw.', 'error');
      return null;
    } finally { laadBeheer(true); }
  }
  async function klikBeheer(b, act) {
    const P = PAS();
    if (!beheer || b.disabled) return;
    if (act === 'pb-aanmaken') {
      const open = b.getAttribute('aria-checked') === 'true';
      await stuurBeheer('PUT', '/api/admin/profielen/instellingen', { aanmaken: open ? 'dicht' : 'open' }, open ? 'Nieuwe profielen staan nu dicht.' : 'Nieuwe profielen staan nu open.');
      return;
    }
    if (act === 'pb-pasvragen') {
      const stand = b.dataset.stand;
      if (stand === beheer.pas_vragen) return;
      const zin = { elke_wijk: 'Elke afdeling vraagt nu de pas.', kwartier: 'De pas blijft nu actief zolang je bezig bent.', inloggen: 'De pas wordt nu alleen bij het inloggen gevraagd.' }[stand];
      const j = await stuurBeheer('PUT', '/api/admin/profielen/instellingen', { pas_vragen: stand }, zin);
      if (j) { await P.laadIk(); const knop = root.querySelector(`[data-ah="pb-pasvragen"][data-stand="${stand}"]`); if (knop) knop.focus({ preventScroll: true }); }
      return;
    }
    const id = Number(b.dataset.id);
    const x = beheer.profielen.find(q => q.id === id);
    if (!x) return;
    const pad = `/api/admin/profielen/${id}`;
    const zelf = P.ik().profiel && P.ik().profiel.id === id;
    b.disabled = true;
    try {
      if (act === 'pb-wijk') {
        const w = b.dataset.wijk, heeft = (x.toegang || []).includes(w);
        if (heeft && zelf && w === 'veiligheid' && !confirm('Je haalt je eigen toegang tot Veiligheid weg.\n\nDaarna kun je hier zelf niets meer wijzigen; iemand anders die in Veiligheid mag moet het je teruggeven.\n\nDoorgaan?')) return;
        const nieuw = heeft ? x.toegang.filter(q => q !== w) : [...(x.toegang || []), w];
        const j = await stuurBeheer('PUT', pad, { toegang: nieuw }, `${x.naam} mag ${heeft ? 'niet meer' : 'nu'} in ${afdVan(w).naam}.`);
        if (j && zelf) await P.laadIk();
      } else if (act === 'pb-hoofd') {
        const j = await stuurBeheer('PUT', pad, { is_hoofd: !x.is_hoofd }, x.is_hoofd ? `${x.naam} is geen hoofd meer.` : `${x.naam} is nu hoofd en ziet wie waar is.`);
        if (j && zelf) await P.laadIk();
      } else if (act === 'pb-vrij') {
        await stuurBeheer('POST', `${pad}/vrijgeven`, {}, `De blokkade van ${x.naam} is opgeheven. De pas zelf is niet gewijzigd.`);
      } else if (act === 'pb-pas') {
        if (!confirm(`De pas van ${x.naam} opnieuw instellen?\n\nDe oude pas werkt daarna niet meer en ${x.naam} wordt overal uitgelogd. Je krijgt een tijdelijke pas te zien om door te geven.`)) return;
        const j = await stuurBeheer('POST', `${pad}/pas-reset`, {});
        if (j && j.tijdelijke_pas) await P.paneel({ soort: 'bord', knop: 'Klaar', kop: `Tijdelijke pas voor ${x.naam}`, groot: String(j.tijdelijke_pas), regel: `Geef deze pas door aan ${x.naam}. Bij het inloggen kiest ${x.naam} zelf een nieuwe. Je ziet hem alleen nu.` });
      } else if (act === 'pb-uit') {
        const j = await stuurBeheer('DELETE', `${pad}/sessies`);
        if (j) A.showToast(`${x.naam} is uitgelogd op ${plural(j.beeindigd || 0, 'toestel', 'toestellen')}.`);
      } else if (act === 'pb-weg') {
        if (!confirm(`Het profiel van ${x.naam} verwijderen?\n\n${x.naam} wordt overal uitgelogd. Wie de admincode nog heeft kan een nieuw profiel maken zolang dat open staat: wijzig dus ook de code als iemand echt weg moet.`)) return;
        await stuurBeheer('DELETE', pad, undefined, `Het profiel van ${x.naam} is verwijderd.`);
      } else if (act === 'pb-eigenaar') {
        if (!confirm(`${x.naam} eigenaar maken?\n\n${x.naam} mag dan overal in en beheert het wachtwoord van Veiligheid. Jij blijft hoofd met toegang tot alles.`)) return;
        const ok = await P.paneel({
          soort: 'wachtwoord', lamp: false, knop: 'Maak eigenaar', kop: `Maak ${x.naam} eigenaar`, regel: 'Vul het wachtwoord van Veiligheid in om te bevestigen.',
          verstuur: async (ww) => {
            try {
              const r = await A.api(`${pad}/eigenaar`, { method: 'POST', body: JSON.stringify({ wachtwoord: ww }), stil: true });
              const j = await r.json().catch(() => ({}));
              if (r.ok) return { ok: true };
              if (j.code === 'geblokkeerd') return { blok: { tot_ms: j.tot_ms, server_nu: j.server_nu }, fout: j.error };
              return { fout: j.error || 'Dat lukte niet.' };
            } catch (e) { return e && e.message === 'Sessie verlopen' ? { sluit: true } : { fout: 'Geen verbinding. Probeer het opnieuw.', schud: false }; }
          },
        });
        if (ok) { A.showToast(`${x.naam} is nu eigenaar.`); await P.laadIk(); laadBeheer(true); }
      }
    } finally { if (b.isConnected) b.disabled = false; }
  }
  async function wijzigWachtwoord(e) {
    e.preventDefault();
    const f = e.currentTarget, fout = f.querySelector('[data-pb-wwfout]');
    const v = (n) => f.elements[n].value;
    fout.textContent = '';
    if (!v('huidig')) { fout.textContent = 'Vul het huidige wachtwoord in.'; f.elements.huidig.focus(); return; }
    if ([...v('nieuw')].length < 10) { fout.textContent = 'Het nieuwe wachtwoord moet minstens 10 tekens zijn.'; f.elements.nieuw.focus(); return; }
    if (v('nieuw') !== v('nieuw2')) { fout.textContent = 'De twee nieuwe wachtwoorden zijn niet gelijk.'; f.elements.nieuw2.focus(); return; }
    const knop = f.querySelector('button[type="submit"]');
    knop.disabled = true;
    try {
      const r = await A.api('/api/admin/veiligheid/wachtwoord', { method: 'POST', body: JSON.stringify({ huidig: v('huidig'), nieuw: v('nieuw'), nieuw2: v('nieuw2') }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { fout.textContent = j.error || 'Dat lukte niet.'; return; }
      f.reset();
      A.showToast('Het wachtwoord van Veiligheid is gewijzigd.');
    } catch (err) {
      if (!err || err.message !== 'Sessie verlopen') fout.textContent = 'Geen verbinding. Probeer het opnieuw.';
    } finally { knop.disabled = false; }
  }

  // ── Crew-gegevens ────────────────────────────────────────────────────────
  async function laadCrew(nu) {
    if (!aan || crewBezig || !A.hasToken()) return;
    if (metPas() && !['mensen', 'toernooi'].includes(PAS().inWijk())) { if (crew) { crew = null; if (!A.userIsBusy()) teken(); } return; }
    const opCrew = route.afd === 'mensen' && route.t === 'crew';
    if (!nu && Date.now() - crewAt < (opCrew ? 8000 : 20000)) return;
    crewBezig = true;
    try {
      const r = await A.api('/api/admin/crew-posts', { stil: true });
      if (r.ok) { crew = await r.json(); crewMis = false; }
      else { crewMis = true; if (r.status === 403) crew = null; }
    } catch { crewMis = true; }
    crewAt = Date.now();
    crewBezig = false;
    if (aan && !A.userIsBusy()) teken();
  }

  // ── Klikken in de hub ────────────────────────────────────────────────────
  async function klik(e) {
    const link = e.target.closest('a[href^="#/"]');
    if (link && root.contains(link) && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const m = /^#\/([a-z]+)?(?:\/([a-z0-9-]+))?\/?$/.exec(link.getAttribute('href') || '');
      if (m) { e.preventDefault(); ga(m[1] || null, m[2] || null, { bron: link }); return; }
    }
    const b = e.target.closest('[data-ah]');
    if (!b || !root.contains(b)) return;
    const act = b.dataset.ah;
    if (act === 'stand-eenvoudig') { const E = window.JVO_ADMIN_EENVOUDIG; if (E) E.zetStand('eenvoudig', b); return; }
    if (act === 'actie') {
      const a = (tekenHome.__act || [])[Number(b.dataset.i)];
      if (!a) return;
      const licht = () => { const top = route.afd && route.t ? tVan(route.afd, route.t) : null; if (top) flits(top.el); if (a.na) a.na(); };
      if (a.doe) { a.doe(); naAankomst(licht); } else ga(a.afd, a.t, { na: licht, bron: b });
      return;
    }
    if (act === 'acties-meer') {
      actiesOpen = !actiesOpen; teken();
      const k = root.querySelector('[data-ah="acties-meer"]');
      if (k) { try { k.focus({ preventScroll: true }); } catch { /* geen focus */ } }
      return;
    }
    if (act === 'snel') {
      const doel = SNEL[b.dataset.doel];
      if (!doel) return;
      ga(doel[0], doel[1], { bron: b, na: () => {
        const naar = doel[2] && document.querySelector(doel[2]);
        if (!naar) return;
        try { naar.scrollIntoView({ block: 'start', behavior: rustig() ? 'auto' : 'smooth' }); } catch { /* oudere browser */ }
        const focus = b.dataset.doel === 'pauze' ? ((R() && R().paused_all) ? $('rg-pauze-alles') : $('rg-reden')) : naar;
        if (focus) { try { focus.focus({ preventScroll: true }); } catch { /* geen focus */ } }
      } });
      return;
    }
    if (act === 'cijfer') {
      if (b.dataset.doe === 'aanmelden') ga('evenement', 'profiel', { bron: b, na: () => {
        const v = $('evc-registration');
        if (!v) return;
        try { v.scrollIntoView({ block: 'center' }); v.focus({ preventScroll: true }); } catch { /* geen focus */ }
        flits(v.closest('.evc-group') || v);
      } });
      return;
    }
    if (act === 'checkin') {
      const id = Number(b.dataset.id);
      if (!Number.isInteger(id) || !A.checkinTeam) return;
      b.disabled = true;
      const ok = await A.checkinTeam(id);
      if (!ok && b.isConnected) b.disabled = false;
      if (aan) teken();
      return;
    }
    if (act && act.startsWith('pb-')) return klikBeheer(b, act);
    if (act === 'scherm-kopie') return kopieerLink(b.dataset.id);
    if (act === 'scherm-qr') {
      const id = b.dataset.id;
      qrOpen = qrOpen === id ? null : id;
      teken();
      const knop = root.querySelector(`[data-ah="scherm-qr"][data-id="${CSS.escape(id)}"]`);
      if (knop) { try { knop.focus({ preventScroll: true }); } catch { /* geen focus */ } if (qrOpen) knop.closest('.ah-scherm')?.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (act === 'poort-open') { const P = PAS(); if (P && route.afd) { const afd = route.afd; if (await P.poort(afd, {})) { await A.laadWijk(afd); teken(); } } return; }
    if (act === 'poort-sluit') { const P = PAS(); if (P) { await P.sluitPoort(); A.wisWijkData('veiligheid'); ga(null, null); } return; }
    if (act === 'profiel-start') { const P = PAS(); if (P) P.startEerste(); return; }
    if (act === 'ontgrendel') {
      const top = b.closest('.ah-topic');
      top.querySelector('[data-slot]').hidden = true;
      const inn = top.querySelector('[data-slot-in]');
      inn.hidden = false;
      const eerste = inn.querySelector('h3, summary, button, input');
      if (eerste) { if (!eerste.hasAttribute('tabindex') && eerste.tagName === 'H3') eerste.setAttribute('tabindex', '-1'); eerste.focus({ preventScroll: true }); }
      return;
    }
    if (act === 'log-checkin') {
      ga('veiligheid', 'logboek');
      document.querySelector('[data-audit-filter="checkin"]')?.click();
      return;
    }
    if (act === 'crew-vrij') {
      const id = Number(b.dataset.id);
      if (!Number.isInteger(id)) return;
      // Eerlijk blijven: een toestel dat de wedstrijd nog open heeft meldt zich binnen een
      // halve minuut opnieuw en is dan weer de bediener (crewpost.js). Vrijgeven helpt dus
      // alleen bij een toestel dat weg is of vastzit.
      if (!confirm('De bediening van deze wedstrijd vrijgeven?\n\nDit is voor een toestel dat weg is of vastzit: een ander kan de wedstrijd dan meteen overnemen.\n\nLet op: staat de wedstrijd op dat toestel nog open, dan pakt het de bediening vanzelf weer terug.')) return;
      b.disabled = true;
      try {
        const r = await A.api(`/api/crew/match/${id}/release`, { method: 'POST', body: '{}' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) A.showToast(j.error || 'Vrijgeven lukte niet.', 'error');
        else A.showToast('Bediening vrijgegeven. Is dat toestel nog open, dan pakt het hem zo weer terug.');
      } catch (err) {
        if (!err || err.message !== 'Sessie verlopen') A.showToast('Geen verbinding — probeer het zo opnieuw.', 'error');
      }
      b.disabled = false;
      laadCrew(true);
    }
  }

  // ── Meelopen met admin.js ────────────────────────────────────────────────
  function tik() {
    // De eenvoudige stand (admin-eenvoudig.js) is een eigen schil: dan blijft de hub uit.
    const E = window.JVO_ADMIN_EENVOUDIG;
    const eenvoudig = !!(E && E.wil());
    const moet = RG.isOn() && !!R() && !eenvoudig;
    // Van eenvoudig naar volledig: eerst zet de schil zijn blokken terug, dan pakt de hub ze.
    if (moet && !aan && E && E.actief()) E.uit();
    if (moet && !aan) zetAan();
    else if (!moet && aan && (eenvoudig || !RG.isOn())) zetUit();
    if (!aan && (R() || eenvoudig)) document.body.classList.remove('ah-wacht');   // gegevens zijn er en de hub hoort uit: oude indeling tonen
    if (aan) { teken(); laadCrew(false); laadAanwezig(false); if (route.afd === 'veiligheid' && route.t === 'profielen') laadBeheer(false); }
    if (aan && route.afd === 'evenement' && (route.t === 'klaar' || route.t === 'profiel')) {
      // Dezelfde, net ververste lijst als de tellers: zo staat een opgelost punt er niet meer.
      if (route.t === 'klaar' && A.tekenChecks && R()) A.tekenChecks(R().checks);
      if (A.laadEvenement && A.evenementOud() > 20000 && !A.userIsBusy()) A.laadEvenement({ zacht: true });
    }
  }
  A.onRender(tik);
  // De hartslag meldt een gewijzigde toegang of een dichte poort: de hub tekent mee. Wie
  // de afdeling waar hij staat niet meer in mag, gaat terug naar het plein.
  if (PAS()) PAS().opIk((ik) => {
    if (!aan) return;
    const pid = ik && ik.profiel ? ik.profiel.id : null;
    if (pid !== laatstePid) { laatstePid = pid; beheer = null; }
    // De poort van de afdeling waar je staat is net dichtgegaan (de pas is afgekoeld, of Veiligheid
    // liep af): wat daarbij hoort gaat meteen uit beeld, niet pas bij de volgende verversing.
    const hierOpen = !!(route.afd && metPas() && PAS().inWijk() === route.afd);
    if (stondOpen && !hierOpen && route.afd && metPas() && !wisselBezig && A.hasToken()) { A.wisWijkData(route.afd); A.refreshAll(); }
    stondOpen = hierOpen;
    if (route.afd && metPas() && !magIn(route.afd) && !wisselBezig) {
      const naam = afdVan(route.afd).naam, wie = Array.isArray(ik && ik.vraag) ? ik.vraag : [];
      A.wisWijkData(route.afd);
      history.replaceState(null, '', '#/');
      zetRoute(null, null, true);
      PAS().paneel({
        soort: 'bord', knop: 'Terug naar het plein', kop: `Je mag niet meer in ${naam}`,
        regel: wie.length ? `Je toegang is zojuist ingetrokken. Vraag ${wie.join(' of ')} om toegang: dat wordt in Veiligheid geregeld.` : 'Je toegang is zojuist ingetrokken. Vraag iemand van Veiligheid om toegang.',
      });
      return;
    }
    if (!wisselBezig) teken();
  });

  // Uitleg voor de ?-knop (admin.js: openHelp): over de plek waar je nu staat, opgebouwd
  // uit dezelfde namen en zinnen als de tegels. Zo wijst de uitleg nooit naar een oude tab.
  function uitleg() {
    if (!aan) return null;
    const afd = route.afd ? afdVan(route.afd) : null;
    const top = afd && route.t ? tVan(afd.id, route.t) : null;
    const rij = (href, titel, sub) => `<li><a href="${href}" data-ah-uitleg><b>${esc(titel)}</b></a>: ${esc(sub)}</li>`;
    const ul = (rijen) => `<ul style="margin:8px 0 0; padding-left:18px;">${rijen.join('')}</ul>`;
    if (!afd) {
      return { title: 'Admin Hub', html: `<p>Dit is het startscherm. Het gebouw heeft zes afdelingen; tik op een deel van het gebouw of op een tegel eronder.</p>
        <p style="margin-top:8px;"><b>“Wat moet je nu doen?”</b> zet de dringendste dingen bovenaan. Een oranje stip betekent: hier wacht iets op jou.</p>
        ${ul(AFD.map(a => rij(`#/${a.id}`, a.naam, a.sub)))}` };
    }
    const mijn = T.filter(t => t.afd === afd.id && beschikbaar(t) && (!t.hoofd || hoofdAan()));
    if (!top) {
      return { title: afd.naam, html: `<p>${esc(afd.sub)}</p><p style="margin-top:8px;">Kies een onderwerp:</p>${ul(mijn.map(t => rij(`#/${afd.id}/${t.id}`, t.titel, t.sub)))}` };
    }
    const extra = top.slot ? '<p style="margin-top:8px;">Dit onderwerp zit achter een slot. Tik eerst op “Ik weet wat ik doe, laat zien”; pas daarna zie je de knoppen. Ga je weg, dan gaat het slot weer dicht.</p>'
      : top.sport ? '<p style="margin-top:8px;">Met de sportknoppen bovenaan kies je over welke sport het gaat.</p>' : '';
    const rest = mijn.filter(t => t !== top);
    return { title: top.titel, html: `<p>${esc(top.sub)}</p>${extra}
      ${rest.length ? `<p style="margin-top:8px;">Ook bij ${esc(afd.naam)}:</p>${ul(rest.map(t => rij(`#/${afd.id}/${t.id}`, t.titel, t.sub)))}` : ''}` };
  }

  window.JVO_ADMIN_HUB = {
    actief: () => aan,
    // Voor admin-eenvoudig.js: de hub zet zijn blokken terug voordat de eenvoudige schil ze pakt.
    uit: () => zetUit(),
    ga, toon, naarTab, uitleg, naAankomst, teken: () => { if (aan) teken(); }, dagLoopt: () => !!(aan && R() && dagLoopt(R())),
    route: () => ({ ...route }),
  };
})();
