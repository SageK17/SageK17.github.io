// JVO omroep-/presentatorscherm. Eén blik: wie is bezig, wie roep je zo
// om (op VERWACHTE aftrap, schuift mee met uitloop), en welke uitslag meld je.
// Publieke read-only data (zelfde bron als het live-bord), geen login nodig.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  let DATA = null;
  let offset = 0;                       // serverNow - clientNow
  let lastServerNow = 0;
  const serverNow = () => Date.now() + offset;
  const parseTs = (s) => s ? new Date(s.replace(' ', 'T') + 'Z').getTime() : null;

  // Plek-naam van het toernooi (Veld / Baan / Tafel / Court): de competitie kiest
  // hoe een speelplek heet. Uit /api/competitions (competitie 1 = dit scherm),
  // gecachet voor offline. Standaard en bij een onbekende waarde blijft het
  // "Veld": één-sport-installaties zien en horen geen verschil.
  const PLEK_VORMEN = {
    Veld:  { mv: 'velden', het: 'het veld' },
    Baan:  { mv: 'banen',  het: 'de baan' },
    Tafel: { mv: 'tafels', het: 'de tafel' },
    Court: { mv: 'courts', het: 'het court' },
  };
  let plekNaam = 'Veld';
  try { const c = localStorage.getItem('jvo_omroep_plek'); if (c && PLEK_VORMEN[c]) plekNaam = c; } catch {}
  const plekKlein = () => plekNaam.toLowerCase();
  (async () => {
    try {
      const r = await fetch('/api/competitions');
      if (!r.ok) return;
      const d = await r.json();
      const c = d && Array.isArray(d.competitions) ? d.competitions.find(x => x.id === 1) : null;
      const n = c && PLEK_VORMEN[c.place_noun] ? c.place_noun : 'Veld';
      try { localStorage.setItem('jvo_omroep_plek', n); } catch {}
      if (n !== plekNaam) { plekNaam = n; try { if (DATA) render(); } catch {} }
      // Hub-modus (zelfde regel als de server: meer dan één actieve sport, of het
      // hoofdtoernooi staat uit) → dit scherm volgt alle sporten. Zie onderaan.
      if (d && Array.isArray(d.competitions)) {
        const hub = d.hub_mode != null ? !!d.hub_mode : (d.competitions.length > 1 || !d.competitions.some(x => x.id === 1));
        const was = hubFlag;
        hubFlag = hub ? '1' : '0';
        try { localStorage.setItem(HUB_KEY, hubFlag); } catch {}
        if (!started) start(hub);
        else if (hub !== startedHub && was !== hubFlag) location.reload();   // de opzet van de dag is veranderd
      }
    } catch { /* offline → cache */ }
    finally { if (!started) start(false); }
  })();

  // Welke wedstrijden al omgeroepen zijn (blijft staan na refresh, per toestel).
  const OMGEROEPEN_KEY = 'jvo_omroep_done';
  let announced = new Set();
  try { announced = new Set(JSON.parse(localStorage.getItem(OMGEROEPEN_KEY) || '[]')); } catch {}
  const saveAnnounced = () => localStorage.setItem(OMGEROEPEN_KEY, JSON.stringify([...announced].slice(-200)));

  const KO_NICE = { VR1:'Play-off 1', VR2:'Play-off 2', A1:'Achtste finale 1', A2:'Achtste finale 2', A3:'Achtste finale 3', A4:'Achtste finale 4', A5:'Achtste finale 5', A6:'Achtste finale 6', A7:'Achtste finale 7', A8:'Achtste finale 8', KF1:'Kwartfinale 1', KF2:'Kwartfinale 2', KF3:'Kwartfinale 3', KF4:'Kwartfinale 4', HF1:'Halve finale 1', HF2:'Halve finale 2', Finale:'FINALE', '3e/4e':'Troostfinale' };

  // ---------- presentator-modus (grote letters voor op afstand) ----------
  const TV_KEY = 'jvo_omroep_tv';
  const isTv = () => { try { return localStorage.getItem(TV_KEY) === '1'; } catch { return false; } };
  function setTv(on) { try { localStorage.setItem(TV_KEY, on ? '1' : '0'); } catch {} document.body.classList.toggle('om-tv', on); const b = $('om-tv-btn'); if (b) b.textContent = on ? '◱ Normaal' : '◲ Grote letters'; }

  // ---------- klaar-om-voor-te-lezen omroep-zin ----------
  // De presentator hoeft niets te bedenken: hij leest deze zin gewoon voor.
  const roundSpeak = (where) => {
    const w = String(where || '');
    if (w === 'FINALE') return 'de FINALE';
    if (/^Troostfinale/.test(w)) return 'de troostfinale om het brons';
    if (/^(Halve finale|Kwartfinale|Achtste finale|Play-off)/.test(w)) return 'de ' + w.toLowerCase();
    const poule = (w.match(/Poule\s+([A-Za-z])/) || [])[1];
    return poule ? `een poulewedstrijd (poule ${poule.toUpperCase()})` : 'de wedstrijd';
  };
  function announcePrompt(m) {
    const veld = m.field ? `${plekKlein()} ${esc(String(m.field))}` : PLEK_VORMEN[plekNaam].het;
    const a = esc(m.a || '—'), b = esc(m.b || '—');
    if (m.status === 'live') {
      const sc = (m.score_a || 0) + (m.score_b || 0) === 0 ? 'de bal rolt' : `de stand is ${m.score_a ?? 0}–${m.score_b ?? 0}`;
      return `Op ${veld}: <b>${a}</b> tegen <b>${b}</b> — ${roundSpeak(m.where.replace(/ · .*/, '') || m.where)}, ${sc}.`;
    }
    const rel = relLabel(m.expMs);
    const wanneer = rel === 'NU' ? 'nu' : rel ? `over ${rel.replace('~', 'ongeveer ')}` : (m.time ? `om ${esc(m.expected || m.time)}` : 'zo meteen');
    return `Dames en heren, ${wanneer} begint op <b>${veld}</b> ${roundSpeak(m.where)}: <b>${a}</b> tegen <b>${b}</b>.`;
  }

  // ---------- momenten-strook (hands-free: "roep dit om!") ----------
  const MOMENT_TTL = 14000;               // een moment blijft ~14s in de strook
  let moments = [];                        // {id, ts, sev, text}
  const momentSeen = new Set();
  let prevByKey = null, prevGroupDone = false, prevFinaleDone = false;
  function pushMoment(id, sev, text) {
    if (momentSeen.has(id)) return;
    momentSeen.add(id);
    moments.push({ id, ts: serverNow(), sev, text });
    if (moments.length > 40) moments = moments.slice(-40);
  }
  function detectMoments(all, d) {
    const cur = new Map(all.map(m => [m.key, m]));
    if (!prevByKey) { prevByKey = cur; prevGroupDone = !!(d && d.group_complete); prevFinaleDone = finaleDone(all); return; }
    for (const [key, m] of cur) {
      const p = prevByKey.get(key); if (!p) continue;
      const oldTot = (p.score_a ?? 0) + (p.score_b ?? 0), newTot = (m.score_a ?? 0) + (m.score_b ?? 0);
      if (m.status === 'live' && newTot > oldTot) {
        const scorer = (m.score_a ?? 0) > (p.score_a ?? 0) ? m.a : m.b;
        const first = oldTot === 0;
        pushMoment(`${key}:g${newTot}`, 'headline', `${first ? 'EERSTE DOELPUNT' : 'DOELPUNT'} — ${esc(scorer)}! ${m.score_a}–${m.score_b} op ${plekKlein()} ${esc(String(m.field || '?'))}`);
        const oldLead = Math.sign((p.score_a ?? 0) - (p.score_b ?? 0)), newLead = Math.sign((m.score_a ?? 0) - (m.score_b ?? 0));
        if (newLead !== 0 && newLead !== oldLead && oldTot > 0) pushMoment(`${key}:lead${newTot}`, 'lead', `${esc(newLead > 0 ? m.a : m.b)} komt op voorsprong — ${m.score_a}–${m.score_b}`);
      }
      if (m.ko && p.status !== 'live' && m.status === 'live') pushMoment(`${key}:start`, 'headline', `${roundSpeakPlain(m.where)} is begonnen op ${plekKlein()} ${esc(String(m.field || '?'))}`);
      if (m.pens_a != null && p.pens_a == null) pushMoment(`${key}:pens`, 'headline', `STRAFSCHOPPEN — ${esc(m.a)} tegen ${esc(m.b)} op ${plekKlein()} ${esc(String(m.field || '?'))}`);
      if (p.status === 'live' && m.status === 'done' && m.score_a != null) {
        const aw = m.score_a > m.score_b || (m.score_a === m.score_b && m.pens_a != null && m.pens_a > m.pens_b);
        const np = (m.pens_a != null && m.pens_b != null) ? ` (n.p. ${m.pens_a}–${m.pens_b})` : '';
        pushMoment(`${key}:end`, 'result', `Afgelopen: ${esc(m.a)} ${m.score_a}–${m.score_b} ${esc(m.b)}${np} — ${esc(aw ? m.a : m.b)} wint`);
      }
    }
    const gc = !!(d && d.group_complete);
    if (gc && !prevGroupDone) pushMoment('groupdone', 'headline', 'Groepsfase klaar — de knock-out volgt!');
    prevGroupDone = gc;
    const fd = finaleDone(all);
    if (fd && !prevFinaleDone) { const champ = champOf(all); if (champ) pushMoment('champ', 'headline', `KAMPIOEN: ${esc(champ)} 🏆`); }
    prevFinaleDone = fd;
    prevByKey = cur;
  }
  const roundSpeakPlain = (where) => KO_NICE.Finale === where ? 'De finale' : `De ${String(where).toLowerCase()}`;
  const finaleDone = (all) => { const f = all.find(m => m.key === 'kFinale'); return !!(f && f.status === 'done' && f.score_a != null); };
  function champOf(all) { const f = all.find(m => m.key === 'kFinale'); if (!f || f.score_a == null) return null;
    const aw = f.score_a > f.score_b || (f.score_a === f.score_b && f.pens_a != null && f.pens_a > f.pens_b); return aw ? f.a : f.b; }
  function renderMoments() {
    const host = $('om-moments'); if (!host) return;
    const now = serverNow();
    const live = moments.filter(m => now - m.ts < MOMENT_TTL).slice(-3).reverse();
    const html = live.map(m => `<div class="om-moment ${m.sev}">${m.text}</div>`).join('');
    if (host.innerHTML !== html) host.innerHTML = html;
    host.classList.toggle('has', live.length > 0);
  }

  // ---------- dataset opbouwen ----------
  function allMatches() {
    const out = [];
    if (!DATA || !DATA.configured) return out;
    for (const p of Object.keys(DATA.poules || {})) for (const m of DATA.poules[p].matches) {
      out.push({ key: 'g' + m.id, a: m.a, b: m.b, score_a: m.score_a, score_b: m.score_b, status: m.status,
        slot: m.slot, field: m.field, time: m.time, expected: m.expected, expMs: m.expMs,
        started_at: m.started_at, ended_at: m.ended_at, where: `Poule ${p} · Ronde ${m.round}` });
    }
    for (const k of (DATA.knockout || [])) {
      out.push({ key: 'k' + k.label, a: k.a.name || k.a.placeholder, b: k.b.name || k.b.placeholder,
        score_a: k.score_a, score_b: k.score_b, pens_a: k.pens_a, pens_b: k.pens_b, status: k.status,
        slot: k.slot, field: k.field, time: k.time, expected: k.expected, expMs: k.expMs,
        started_at: k.started_at, ended_at: k.ended_at, where: KO_NICE[k.label] || k.label, ko: true });
    }
    return out;
  }

  // ---------- relatieve tijd ("over ~4 min") ----------
  function relLabel(expMs) {
    if (!expMs) return null;                       // dag nog niet geankerd → alleen plantijd
    const diff = expMs - serverNow();
    if (diff <= 60000) return 'NU';
    return '~' + Math.round(diff / 60000) + ' min';
  }

  // ---------- render ----------
  function render() {
    const upd = $('om-updated');
    if (!DATA || !DATA.configured) {
      $('om-live').innerHTML = $('om-queue').innerHTML = $('om-done').innerHTML =
        '<div class="om-empty">Het toernooischema is nog niet klaar.</div>';
      return;
    }
    const all = allMatches();
    const mins = (DATA.schedule && DATA.schedule.match_min) || 10;

    // NU BEZIG — per veld, veldnummer prominent
    const live = all.filter(m => m.status === 'live').sort((x, y) => (x.field || 0) - (y.field || 0));
    $('om-live-n').textContent = live.length ? `${live.length} ${live.length === 1 ? plekKlein() : PLEK_VORMEN[plekNaam].mv}` : '';
    $('om-live').innerHTML = live.map(m => `
      <div class="om-lv">
        <span class="veld">${plekNaam} ${esc(String(m.field || '?'))}</span>
        <div class="wie"><span class="om-vs"><span class="na">${esc(m.a || '—')}</span><span class="sc">${m.score_a ?? 0}–${m.score_b ?? 0}</span><span class="nb">${esc(m.b || '—')}</span></span>${(m.pens_a != null && m.pens_b != null) ? ` <span style="color:var(--success);font-family:var(--mono);font-size:13px;">n.p. ${m.pens_a}–${m.pens_b}</span>` : ''}
          <span class="waar">${esc(m.where)}</span></div>
        <span class="klok clk" data-start="${esc(m.started_at || '')}">--:--</span>
      </div>`).join('') || '<div class="om-empty">Nog geen wedstrijden bezig.</div>';

    // Waarschuwingen: wie speelt nog / wie is net klaar (korte rust)
    const liveTeams = new Set();
    live.forEach(m => { if (m.a) liveTeams.add(m.a); if (m.b) liveTeams.add(m.b); });
    const lastEnd = new Map();   // teamnaam → laatste eind-epoch
    for (const m of all) {
      if (m.status !== 'done') continue;
      const e = parseTs(m.ended_at); if (!e) continue;
      for (const t of [m.a, m.b]) { if (t && (!lastEnd.has(t) || e > lastEnd.get(t))) lastEnd.set(t, e); }
    }
    const REST_MS = 12 * 60000;
    const warnFor = (team) => {
      if (!team) return '';
      if (liveTeams.has(team)) return `<span class="warn bezig">${esc(team)} speelt nog</span>`;
      const e = lastEnd.get(team);
      if (e && serverNow() - e < REST_MS) return `<span class="warn">korte rust: ${esc(team)}</span>`;
      return '';
    };

    // ZO OMROEPEN — gesorteerd op verwachte aftrap (fallback: slotvolgorde)
    const upcoming = all
      .filter(m => m.status !== 'live' && m.status !== 'done' && m.slot != null && m.a && m.b)
      .sort((x, y) => (x.expMs ?? (x.slot * 1e7)) - (y.expMs ?? (y.slot * 1e7)))
      .slice(0, 8);
    $('om-queue').innerHTML = upcoming.map((m, i) => {
      const rel = relLabel(m.expMs);
      // Bewust ZONDER drempel (het bord toont de pijl pas bij ≥3 min): de
      // omroeper is staf en wil elke minuut drift zien om goed te timen.
      const late = m.expected && m.expected !== m.time;
      const abs = m.time ? `${esc(m.time)}${late ? ' → ' + esc(m.expected) : ''}` : '—';
      const done = announced.has(m.key);
      return `
      <div class="om-q ${i === 0 && !done ? 'eerst' : ''} ${done ? 'gedaan' : ''}" data-key="${esc(m.key)}">
        <div class="when">
          <div class="rel ${rel === 'NU' ? 'nu' : ''}" data-expms="${m.expMs || ''}">${rel || 'gepland'}</div>
          <div class="abs">${abs}</div>
        </div>
        <div class="wie">
          <div class="teams">${esc(m.a)}<i>vs</i>${esc(m.b)}</div>
          <div class="meta">
            <span class="veldchip">${plekNaam} ${esc(String(m.field || '?'))}</span>
            <span class="waar">${esc(m.where)}</span>
            ${warnFor(m.a)}${warnFor(m.b)}
          </div>
        </div>
        <button class="ok" data-om="${esc(m.key)}">${done ? '✓ Omgeroepen' : 'Omgeroepen ✓'}</button>
      </div>`;
    }).join('') || '<div class="om-empty">Geen aankomende wedstrijden — alles is gespeeld of bezig.</div>';
    $('om-queue').querySelectorAll('[data-om]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.om;
      if (announced.has(k)) announced.delete(k); else announced.add(k);
      saveAnnounced(); render();
    }));

    // LEES DIT VOOR — de eerstvolgende nog-niet-omgeroepen wedstrijd, kant-en-klaar.
    const promptEl = $('om-prompt');
    if (promptEl) {
      const nextUp = upcoming.find(m => !announced.has(m.key)) || upcoming[0] || live[0];
      const html = nextUp ? `<div class="om-prompt-lbl">Lees dit voor</div><div class="om-prompt-txt">${announcePrompt(nextUp)}</div>` : '';
      if (promptEl.innerHTML !== html) promptEl.innerHTML = html;
      promptEl.classList.toggle('has', !!nextUp);
    }
    renderMoments();

    // NET KLAAR — nieuwste eerst, winnaar vet
    const done = all.filter(m => m.status === 'done' && m.score_a != null)
      .sort((x, y) => String(y.ended_at || '').localeCompare(String(x.ended_at || ''))).slice(0, 6);
    $('om-done-n').textContent = done.length ? 'nieuwste eerst' : '';
    $('om-done').innerHTML = done.map(m => {
      const aw = m.score_a > m.score_b || (m.score_a === m.score_b && m.pens_a != null && m.pens_a > m.pens_b);
      const bw = m.score_b > m.score_a || (m.score_a === m.score_b && m.pens_b != null && m.pens_b > m.pens_a);
      const np = (m.pens_a != null && m.pens_b != null) ? ` <span class="np">n.p. ${m.pens_a}–${m.pens_b}</span>` : '';
      return `<div class="om-d">
        <div class="wie"><span class="${aw ? 'w' : ''}">${esc(m.a)}</span><span class="sc">${m.score_a}–${m.score_b}</span><span class="${bw ? 'w' : ''}">${esc(m.b)}</span>${np}</div>
        <span class="waar">${esc(m.where)}</span>
      </div>`;
    }).join('') || '<div class="om-empty">Nog geen uitslagen.</div>';

    tick(mins);
  }

  // ---------- klokjes + relatieve tijden ----------
  function tick(minsOverride) {
    const mins = minsOverride || (DATA && DATA.schedule && DATA.schedule.match_min) || 10;
    const now = serverNow();
    document.querySelectorAll('.clk[data-start]').forEach(el => {
      const st = parseTs(el.dataset.start);
      if (!st) { el.textContent = '--:--'; return; }
      const ms = Math.max(0, now - st);
      el.textContent = `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
      el.classList.toggle('extra', ms >= (parseInt(el.dataset.min, 10) || mins) * 60000);
    });
    document.querySelectorAll('.rel[data-expms]').forEach(el => {
      const v = parseInt(el.dataset.expms, 10);
      if (!Number.isFinite(v)) return;
      const rel = relLabel(v);
      if (rel && el.textContent !== rel) { el.textContent = rel; el.classList.toggle('nu', rel === 'NU'); }
    });
    const c = $('om-clock');
    if (c) c.textContent = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    renderMoments();   // laat verlopen momenten vanzelf uit de strook lopen
  }
  setInterval(() => tick(), 1000);

  // ---------- data laden (SSE + vangnet-poll, zelfde patroon als het bord) ----------
  function apply(d) {
    const sn = d.server_now || 0;
    if (sn && sn < lastServerNow && (lastServerNow - sn) < 60000) return;
    DATA = d;
    offset = (d.server_now || Date.now()) - Date.now();
    if (sn) lastServerNow = sn;
    try { detectMoments(allMatches(), d); } catch { /* momenten mogen nooit de render breken */ }
    render();
    $('om-updated').textContent = 'Live · bijgewerkt ' + new Date().toLocaleTimeString('nl-NL');
  }
  async function load() {
    try {
      const res = await fetch('/api/tournament', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json && json.offline) { $('om-updated').textContent = 'Offline — laatst bekende stand'; return; }
      apply(json);
    } catch { $('om-updated').textContent = 'Offline — laatst bekende stand'; }
  }
  let pollTimer = null, pollEvery = 0;
  function startPolling(ms) {
    if (pollTimer && pollEvery === ms) return;
    clearInterval(pollTimer); pollEvery = ms;
    pollTimer = setInterval(load, ms);
  }
  function connect() {
    if (!('EventSource' in window)) { startPolling(10000); return; }
    startPolling(30000);
    try {
      const es = new EventSource('/api/tournament/stream');
      es.addEventListener('update', (e) => { try { apply(JSON.parse(e.data)); } catch {} startPolling(30000); });
      es.onerror = () => startPolling(10000);
    } catch { startPolling(10000); }
  }
  if (window.JVONet) window.JVONet.subscribe((online) => { if (online) { if (startedHub) hubSignal(); else load(); } });


  // ══════════ HUB-MODUS: alle sporten op één omroep-scherm ══════════
  // Bron: GET /api/hub (nu / straks / net klaar over alle sporten heen). Staat het
  // sportfilter aan, dan komt het volledige schema van juist die sporten erbij
  // (GET /api/tournament?competition=N), zodat een sport die later begint niet
  // buiten de gezamenlijke top-12 valt. Verversen: een seintje van de lichte
  // stream → ophalen op een willekeurig moment 0–1,5 s later, hooguit eens per
  // seconde; zonder stream elke 20 s. Met één sport + actief hoofdtoernooi wordt
  // niets hiervan gestart.
  const HUB_KEY = 'jvo_omroep_hub', SPORT_KEY = 'jvo_omroep_sporten';
  let hubFlag = null;
  try { hubFlag = localStorage.getItem(HUB_KEY); } catch {}
  let started = false, startedHub = false;
  function start(hub) {
    if (started) return;
    started = true; startedHub = !!hub;
    if (hub) hubStart(); else load().then(connect);
  }

  let HUB = null;                         // laatste /api/hub
  let hubDetail = null;                   // { ids: '2,5', cards: [...] } bij een actief filter
  let hubSel = new Set();                 // gekozen sporten (leeg = alle)
  try { hubSel = new Set((JSON.parse(localStorage.getItem(SPORT_KEY) || '[]') || []).map(Number).filter(Number.isInteger)); } catch {}
  const saveSel = () => { try { localStorage.setItem(SPORT_KEY, JSON.stringify([...hubSel])); } catch {} };

  const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  // "13:45" (tijd op de locatie) → epoch-ms van vandaag, los van de klok/tijdzone van dit toestel.
  function hmToMs(s) {
    const t = hm(s); if (t == null) return null;
    let nowSec;
    try {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(serverNow()));
      const g = (k) => parseInt((p.find(x => x.type === k) || {}).value, 10) || 0;
      nowSec = g('hour') * 3600 + g('minute') * 60 + g('second');
    } catch { const d = new Date(serverNow()); nowSec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); }
    const diff = t * 60 - nowSec;
    if (diff < -6 * 3600) return null;    // hoort niet bij "nu" (schema van een andere dag) → alleen de plantijd tonen
    return serverNow() + diff * 1000;
  }
  const plekVan = (c) => (c.field != null && c.field !== '' ? `${c.place_noun || 'Veld'} ${c.field}` : '');
  // Voor in de zin: "tafel 2 (Hal 2)" / zonder nummer "de tafel".
  function plekZin(c) {
    const noun = PLEK_VORMEN[c.place_noun] ? c.place_noun : 'Veld';
    const basis = c.field != null && c.field !== '' ? `${noun.toLowerCase()} ${esc(String(c.field))}` : PLEK_VORMEN[noun].het;
    return c.place_label ? `${basis} (${esc(c.place_label)})` : basis;
  }
  const setsTekst = (sets) => (Array.isArray(sets) && sets.length ? sets.map(s => `${s[0]}–${s[1]}`).join(' · ') : '');
  function rondeZin(c) {
    const w = String(c.where || '');
    if (c.phase === 'final' || /^finale$/i.test(w)) return 'de FINALE';
    if (c.phase && c.phase !== 'group') return 'de ' + esc(w.toLowerCase());
    const poule = (w.match(/Poule\s+([A-Za-z0-9]+)/) || [])[1];
    return poule ? `een poulewedstrijd (poule ${esc(poule.toUpperCase())})` : 'een poulewedstrijd';
  }
  const wint = (c) => {
    if (c.score_a == null || c.score_b == null) return null;
    if (c.score_a !== c.score_b) return c.score_a > c.score_b ? 'a' : 'b';
    if (c.pens_a != null && c.pens_b != null && c.pens_a !== c.pens_b) return c.pens_a > c.pens_b ? 'a' : 'b';
    return null;
  };
  function hubPrompt(c) {
    const a = esc(c.a || '—'), b = esc(c.b || '—'), sport = esc(c.comp_name || '');
    if (c.status === 'live') {
      const tot = (c.score_a || 0) + (c.score_b || 0);
      const lopend = Array.isArray(c.sets) && c.sets.length;
      const sc = c.model === 'sets'
        ? (tot === 0 && !lopend ? 'ze zijn net begonnen' : `het staat ${c.score_a ?? 0}–${c.score_b ?? 0} in sets`)
        : (tot === 0 ? 'het staat nog 0–0' : `de stand is ${c.score_a ?? 0}–${c.score_b ?? 0}`);
      return `<b>${sport}</b>, op ${plekZin(c)}: <b>${a}</b> tegen <b>${b}</b> — ${rondeZin(c)}, ${sc}.`;
    }
    const rel = relLabel(c.expMs);
    const wanneer = rel === 'NU' ? 'nu' : rel ? `over ${rel.replace('~', 'ongeveer ')}` : (c.expected || c.time ? `om ${esc(c.expected || c.time)}` : 'zo meteen');
    return `Dames en heren, <b>${sport}</b>: ${wanneer} begint op <b>${plekZin(c)}</b> ${rondeZin(c)}: <b>${a}</b> tegen <b>${b}</b>.`;
  }

  // Kaartjes uit het volledige schema van één sport (zelfde vorm als /api/hub).
  function cardsVan(data) {
    const c = data && data.competition; if (!c || !data.configured) return [];
    const base = { comp_id: c.id, comp_name: c.name, place_noun: c.place_noun, place_label: c.place_label, model: c.result_model };
    const nm = (v) => (v && typeof v === 'object' ? (v.name || v.placeholder || null) : v);
    const out = [];
    for (const p of Object.keys(data.poules || {})) for (const x of (data.poules[p].matches || [])) {
      out.push({ ...base, id: x.id, phase: 'group', where: x.where || `Poule ${p}`, a: nm(x.a), b: nm(x.b), score_a: x.score_a, score_b: x.score_b, pens_a: null, pens_b: null, sets: x.sets, status: x.status, started_at: x.started_at, ended_at: x.ended_at, field: x.field, time: x.time, expected: x.expected });
    }
    for (const k of (data.knockout || [])) {
      out.push({ ...base, id: k.id, phase: k.phase || 'ko', where: k.where || KO_NICE[k.label] || k.label, a: nm(k.a), b: nm(k.b), a_known: !!(k.a && k.a.id), b_known: !!(k.b && k.b.id), score_a: k.score_a, score_b: k.score_b, pens_a: k.pens_a, pens_b: k.pens_b, sets: k.sets, status: k.status, started_at: k.started_at, ended_at: k.ended_at, field: k.field, time: k.time, expected: k.expected });
    }
    return out;
  }

  // Wat staat er op het scherm: de sporten van het filter, met hun wedstrijden.
  function hubView() {
    const comps = HUB.competitions || [];
    const byId = new Map(comps.map(c => [c.id, c]));
    const on = (id) => hubSel.size === 0 || hubSel.has(id);
    const idsKey = [...hubSel].sort((x, y) => x - y).join(',');
    let live, next, recent;
    if (hubSel.size && hubDetail && hubDetail.ids === idsKey) {
      const all = hubDetail.cards;
      live = all.filter(c => c.status === 'live');
      next = all.filter(c => c.status === 'scheduled' && c.expected);
      recent = all.filter(c => c.status === 'done' && c.score_a != null)
        .sort((x, y) => (parseTs(y.ended_at) || 0) - (parseTs(x.ended_at) || 0) || y.id - x.id).slice(0, 8);
    } else {
      live = (HUB.now || []).filter(c => on(c.comp_id));
      next = (HUB.next || []).filter(c => on(c.comp_id));
      recent = (HUB.recent || []).filter(c => on(c.comp_id) && c.score_a != null);
    }
    const order = new Map(comps.map((c, i) => [c.id, i]));
    const rijk = (c) => { const k = byId.get(c.comp_id) || {}; return { ...c, key: 'm' + c.id, expMs: c.status === 'scheduled' ? hmToMs(c.expected) : null, stil: !!k.paused, mins: k.match_min || 10 }; };
    live = live.map(rijk).sort((x, y) => (order.get(x.comp_id) ?? 99) - (order.get(y.comp_id) ?? 99) || (x.field || 0) - (y.field || 0));
    next = next.filter(c => c.a && c.b && (c.phase === 'group' || (c.a_known && c.b_known))).map(rijk)
      .sort((x, y) => (hm(x.expected) ?? 9999) - (hm(y.expected) ?? 9999) || (order.get(x.comp_id) ?? 99) - (order.get(y.comp_id) ?? 99) || (x.field || 0) - (y.field || 0))
      .slice(0, 8);
    recent = recent.slice(0, 6).map(rijk);
    return { comps, zichtbaar: comps.filter(c => on(c.id)), live, next, recent };
  }

  // Momenten in hub-modus: uitslagen, de start van een knock-outwedstrijd en een
  // sport die stilgelegd of hervat wordt (geen "doelpunt": dat past niet bij elke sport).
  let hubPrev = null, hubPrevKey = null;
  function hubMoments(v) {
    const key = [...hubSel].sort((x, y) => x - y).join(',');
    const cur = new Map();
    for (const c of [...v.live, ...v.next, ...v.recent]) cur.set(c.key, c);
    const stil = new Map(v.zichtbaar.map(c => [c.id, !!c.paused]));
    if (!hubPrev || hubPrevKey !== key) { hubPrev = { cur, stil }; hubPrevKey = key; return; }
    for (const [k, c] of cur) {
      const p = hubPrev.cur.get(k); if (!p) continue;
      if (p.status !== 'live' && c.status === 'live' && c.phase && c.phase !== 'group') {
        pushMoment(`${k}:start`, 'headline', `${esc(c.comp_name)}: ${rondeZin(c).replace(/^de /, 'De ')} is begonnen op ${plekZin(c)}`);
      }
      if (p.status === 'live' && c.status === 'done' && c.score_a != null) {
        const w = wint(c);
        const extra = setsTekst(c.sets) || ((c.pens_a != null && c.pens_b != null) ? `n.p. ${c.pens_a}–${c.pens_b}` : '');
        pushMoment(`${k}:end`, 'result', `${esc(c.comp_name)} — afgelopen: ${esc(c.a)} ${c.score_a}–${c.score_b} ${esc(c.b)}${extra ? ` (${esc(extra)})` : ''}${w ? ` — ${esc(w === 'a' ? c.a : c.b)} wint` : ''}`);
      }
    }
    for (const c of v.zichtbaar) {
      const was = hubPrev.stil.get(c.id);
      if (was === false && c.paused) pushMoment(`p${c.id}:stil:${lastServerNow}`, 'lead', `${esc(c.name)} ligt even stil${c.pause_message ? ` — ${esc(c.pause_message)}` : ''}`);
      if (was === true && !c.paused) pushMoment(`p${c.id}:verder:${lastServerNow}`, 'lead', `${esc(c.name)} gaat weer verder`);
    }
    hubPrev = { cur, stil };
  }

  function renderHubFilter(v) {
    const host = $('om-filter'); if (!host) return;
    const toon = v.comps.length > 1;
    host.hidden = !toon;
    if (!toon) return;
    const chip = (id, label, aan, icon, stil) => `<button type="button" class="om-chip${stil ? ' stil' : ''}" data-sport="${esc(id)}" aria-pressed="${aan ? 'true' : 'false'}">${icon ? `<img src="${esc(icon)}" alt="" width="20" height="20" />` : ''}${esc(label)}${stil ? '<span class="om-chip-stil">pauze</span>' : ''}</button>`;
    const html = chip('', 'Alle sporten', hubSel.size === 0) + v.comps.map(c => chip(c.id, c.name, hubSel.has(c.id), c.icon_small, c.paused)).join('');
    if (host.dataset.html !== html) {
      host.innerHTML = html; host.dataset.html = html;
      // Op een telefoon schuift de rij: de gekozen sport moet in beeld staan.
      const aan = host.querySelector('.om-chip[aria-pressed="true"]');
      if (aan && host.scrollWidth > host.clientWidth) host.scrollLeft = Math.max(0, aan.offsetLeft - host.offsetLeft - 14);
    }
  }
  const opsom = (l) => (l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' en ' + l[l.length - 1]);

  function renderHub() {
    if (!HUB) return;
    const v = hubView();
    renderHubFilter(v);
    const meerdere = v.zichtbaar.length !== 1;      // bij één sport hoeft de naam niet op elke rij
    const sp = (c) => (meerdere ? `<b class="om-sp">${esc(c.comp_name)}</b> · ` : '');
    const waar = (c) => `${sp(c)}${esc(c.where || '')}${c.place_label ? ` · ${esc(c.place_label)}` : ''}`;

    // GEPAUZEERD — een sport die stilligt, met de reden
    const stil = v.zichtbaar.filter(c => c.paused);
    const pz = $('om-pauze');
    if (pz) {
      // Sporten met dezelfde reden samen in één melding (bv. "alles pauzeren").
      const groepen = new Map();
      for (const c of stil) { const k = c.pause_message || ''; if (!groepen.has(k)) groepen.set(k, []); groepen.get(k).push(c.name); }
      const html = [...groepen].map(([reden, namen]) => {
        const wie = namen.length > 1 && namen.length === v.zichtbaar.length
          ? (hubSel.size ? 'Al je sporten liggen even stil.' : 'Alle sporten liggen even stil.')
          : `${esc(opsom(namen))} ${namen.length > 1 ? 'liggen' : 'ligt'} even stil.`;
        return `<div class="om-pauze-rij"><span class="om-pauze-lbl">Gepauzeerd</span><div><b>${wie}</b> ${reden ? esc(reden) : (namen.length > 1 ? 'Roep voor deze sporten nu niets om.' : 'Roep voor deze sport nu niets om.')}</div></div>`;
      }).join('');
      if (pz.dataset.html !== html) { pz.innerHTML = html; pz.dataset.html = html; }
      pz.hidden = !stil.length;
    }

    // NU BEZIG
    const live = v.live;
    $('om-live-n').textContent = live.length ? `${live.length} ${live.length === 1 ? 'wedstrijd' : 'wedstrijden'}` : '';
    $('om-live').innerHTML = live.map(m => {
      const sets = m.model === 'sets' ? setsTekst(m.sets) : '';
      const np = (m.pens_a != null && m.pens_b != null) ? `n.p. ${m.pens_a}–${m.pens_b}` : '';
      return `
      <div class="om-lv">
        <span class="veld">${esc(plekVan(m) || m.comp_name || '')}</span>
        <div class="wie"><span class="om-vs"><span class="na">${esc(m.a || '—')}</span><span class="sc">${m.score_a ?? 0}–${m.score_b ?? 0}</span><span class="nb">${esc(m.b || '—')}</span></span>${sets || np ? ` <span class="om-sets">${esc(sets || np)}</span>` : ''}
          <span class="waar">${waar(m)}</span></div>
        <span class="klok clk" data-start="${esc(m.started_at || '')}" data-min="${esc(m.mins)}">--:--</span>
      </div>`;
    }).join('') || `<div class="om-empty">${(HUB.competitions || []).some(c => c.configured) ? 'Nog geen wedstrijden bezig.' : 'Er is nog geen schema voor de sporten.'}</div>`;

    // Waarschuwingen (per sport: dezelfde naam bij een andere sport is iemand anders)
    const tk = (m, t) => m.comp_id + '|' + t;
    const liveTeams = new Set();
    live.forEach(m => { if (m.a) liveTeams.add(tk(m, m.a)); if (m.b) liveTeams.add(tk(m, m.b)); });
    const lastEnd = new Map();
    for (const m of v.recent) {
      const e = parseTs(m.ended_at); if (!e) continue;
      for (const t of [m.a, m.b]) { if (t && (!lastEnd.has(tk(m, t)) || e > lastEnd.get(tk(m, t)))) lastEnd.set(tk(m, t), e); }
    }
    const REST_MS = 12 * 60000;
    const warnFor = (m, team) => {
      // Alleen voor wat binnenkort begint: over drie kwartier zegt "speelt nog" niets.
      if (!team || m.stil || (m.expMs && m.expMs - serverNow() > 20 * 60000)) return '';
      if (liveTeams.has(tk(m, team))) return `<span class="warn bezig">${esc(team)} speelt nog</span>`;
      const e = lastEnd.get(tk(m, team));
      if (e && serverNow() - e < REST_MS) return `<span class="warn">korte rust: ${esc(team)}</span>`;
      return '';
    };

    // ZO OMROEPEN
    const upcoming = v.next;
    const eerste = upcoming.find(m => !announced.has(m.key) && !m.stil);
    $('om-queue').innerHTML = upcoming.map((m) => {
      const rel = m.stil ? null : relLabel(m.expMs);
      const late = m.expected && m.time && m.expected !== m.time;
      const abs = m.time ? `${esc(m.time)}${late ? ' → ' + esc(m.expected) : ''}` : esc(m.expected || '—');
      const done = announced.has(m.key);
      return `
      <div class="om-q ${eerste && m.key === eerste.key ? 'eerst' : ''} ${done ? 'gedaan' : ''} ${m.stil ? 'stil' : ''}" data-key="${esc(m.key)}">
        <div class="when">
          <div class="rel ${rel === 'NU' ? 'nu' : ''}" ${m.stil ? '' : `data-expms="${m.expMs || ''}"`}>${m.stil ? 'pauze' : (rel || 'gepland')}</div>
          <div class="abs">${abs}</div>
        </div>
        <div class="wie">
          <div class="teams">${esc(m.a)}<i>vs</i>${esc(m.b)}</div>
          <div class="meta">
            <span class="veldchip">${esc(plekVan(m) || m.comp_name || '')}</span>
            <span class="waar">${waar(m)}</span>
            ${m.stil ? `<span class="warn">${esc(m.comp_name)} ligt stil</span>` : ''}${warnFor(m, m.a)}${warnFor(m, m.b)}
          </div>
        </div>
        <button class="ok" data-om="${esc(m.key)}">${done ? '✓ Omgeroepen' : 'Omgeroepen ✓'}</button>
      </div>`;
    }).join('') || '<div class="om-empty">Geen aankomende wedstrijden — alles is gespeeld of bezig.</div>';
    $('om-queue').querySelectorAll('[data-om]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.om;
      if (announced.has(k)) announced.delete(k); else announced.add(k);
      saveAnnounced(); renderHub();
    }));

    // LEES DIT VOOR
    const promptEl = $('om-prompt');
    if (promptEl) {
      const nextUp = eerste || upcoming.find(m => !m.stil) || live[0];
      const html = nextUp ? `<div class="om-prompt-lbl">Lees dit voor</div><div class="om-prompt-txt">${hubPrompt(nextUp)}</div>` : '';
      if (promptEl.innerHTML !== html) promptEl.innerHTML = html;
      promptEl.classList.toggle('has', !!nextUp);
    }
    renderMoments();

    // NET KLAAR
    const done = v.recent;
    $('om-done-n').textContent = done.length ? 'nieuwste eerst' : '';
    $('om-done').innerHTML = done.map(m => {
      const w = wint(m);
      const extra = setsTekst(m.sets) || ((m.pens_a != null && m.pens_b != null) ? `n.p. ${m.pens_a}–${m.pens_b}` : '');
      return `<div class="om-d">
        <div class="wie"><span class="${w === 'a' ? 'w' : ''}">${esc(m.a)}</span><span class="sc">${m.score_a}–${m.score_b}</span><span class="${w === 'b' ? 'w' : ''}">${esc(m.b)}</span>${extra ? ` <span class="np">${esc(extra)}</span>` : ''}</div>
        <span class="waar">${waar(m)}</span>
      </div>`;
    }).join('') || '<div class="om-empty">Nog geen uitslagen.</div>';

    tick();
  }

  let hubBusy = false, hubAgain = false, hubLast = 0;
  async function hubLoad() {
    if (hubBusy) { hubAgain = true; return; }
    hubBusy = true; hubLast = Date.now();
    try {
      const r = await fetch('/api/hub', { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      if (j && j.offline) { $('om-updated').textContent = 'Offline — laatst bekende stand'; }
      else if (j && Array.isArray(j.competitions) && Array.isArray(j.now)) {
        const stale = r.headers.get('X-JVO-Cache') === 'stale';
        const sn = j.server_now || 0;
        if (!(sn && sn < lastServerNow && (lastServerNow - sn) < 60000)) {
          // Een sport die niet meer meedoet uit het filter halen.
          const ids = new Set(j.competitions.map(c => c.id));
          let weg = false;
          for (const id of [...hubSel]) if (!ids.has(id)) { hubSel.delete(id); weg = true; }
          if (weg) saveSel();
          // Filter aan → het volledige schema van juist die sporten erbij.
          let detail = null;
          if (hubSel.size) {
            try {
              const lijst = [...hubSel].sort((x, y) => x - y);
              const rs = await Promise.all(lijst.map(id => fetch('/api/tournament?competition=' + encodeURIComponent(id), { cache: 'no-store' }).then(x => (x.ok ? x.json() : null))));
              if (rs.every(d => d && !d.offline && d.competition)) detail = { ids: lijst.join(','), cards: rs.flatMap(cardsVan) };
            } catch { /* dan de gezamenlijke lijst, gefilterd */ }
          }
          HUB = j; hubDetail = detail;
          if (!stale && sn) { offset = sn - Date.now(); lastServerNow = sn; }
          try { hubMoments(hubView()); } catch { /* momenten mogen nooit de render breken */ }
          renderHub();
          $('om-updated').textContent = stale ? 'Offline — laatst bekende stand' : 'Live · bijgewerkt ' + new Date().toLocaleTimeString('nl-NL');
        }
      }
    } catch { $('om-updated').textContent = 'Offline — laatst bekende stand'; }
    hubBusy = false;
    if (hubAgain) { hubAgain = false; hubSignal(); }
  }
  // Seintjes samenvoegen + spreiden.
  let hubSigTimer = null, hubPending = false;
  function hubSignal() {
    if (hubSigTimer) return;
    if (document.hidden) { hubPending = true; return; }
    const wait = Math.max(Math.random() * 1500, hubLast + 1000 - Date.now());
    hubSigTimer = setTimeout(() => { hubSigTimer = null; hubLoad(); }, wait);
  }
  let hubSse = false, hubRetryMs = 5000, hubRetryTimer = null, hubRetryWaiting = false;
  function hubConnect(lite) {
    if (typeof EventSource === 'undefined') return;
    let es, opened = false;
    try { es = new EventSource(lite ? '/api/tournament/stream?lite=1' : '/api/tournament/stream'); } catch { return; }
    es.addEventListener('open', () => { opened = true; hubSse = true; hubRetryMs = 5000; });
    es.addEventListener('update', hubSignal);
    es.addEventListener('error', () => {
      hubSse = false;
      if (es.readyState !== 2) return;                       // de browser probeert zelf opnieuw
      if (lite && !opened) { hubConnect(false); return; }    // geen lichte stream op deze server → de gewone
      try { es.close(); } catch {}
      if (hubRetryTimer || hubRetryWaiting) return;
      if (document.hidden) { hubRetryWaiting = true; return; }
      const wait = hubRetryMs + Math.random() * 5000;
      hubRetryMs = Math.min(60000, hubRetryMs * 2);
      hubRetryTimer = setTimeout(() => { hubRetryTimer = null; hubConnect(true); }, wait);
    });
  }
  function hubStart() {
    document.body.classList.add('om-hub');
    const t = document.querySelector('.om-top .t b'); if (t) t.textContent = 'Alle sporten';
    const qn = $('om-queue-n'); if (qn) qn.textContent = 'op verwachte starttijd — schuift mee met uitloop';
    $('om-filter')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sport]'); if (!b) return;
      const id = parseInt(b.dataset.sport, 10);
      if (!Number.isInteger(id)) hubSel.clear();
      else if (hubSel.has(id)) hubSel.delete(id); else hubSel.add(id);
      // Alles aangevinkt = gewoon alle sporten.
      if (HUB && hubSel.size && hubSel.size >= (HUB.competitions || []).length) hubSel.clear();
      saveSel();
      renderHub();          // meteen (uit de gezamenlijke lijst) …
      hubLoad();            // … en het volledige schema van deze sporten erbij
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (hubPending || Date.now() - hubLast > 20000) { hubPending = false; hubSignal(); }
      if (hubRetryWaiting && !hubRetryTimer) { hubRetryWaiting = false; hubConnect(true); }
    });
    // Vangnet: zonder stream elke 20 s, mét stream alleen als het een minuut stil was.
    setInterval(() => { if (!document.hidden && (!hubSse || Date.now() - hubLast > 60000)) hubLoad(); }, 20000);
    setInterval(() => { if (!document.hidden && HUB) renderHub(); }, 30000);   // "korte rust" en de zin laten meelopen
    window.addEventListener('online', hubSignal);
    hubLoad();
    hubConnect(true);
  }

  // presentator-modus: knop + herstel de laatste keuze
  setTv(isTv());
  $('om-tv-btn')?.addEventListener('click', () => setTv(!isTv()));

  // Welke modus? De laatst bekende meteen (ook offline); anders even wachten op
  // /api/competitions (zie boven), met een vangnet als dat antwoord uitblijft.
  if (hubFlag === '1') start(true);
  else if (hubFlag === '0') start(false);
  else setTimeout(() => { if (!started) start(false); }, 3000);
})();
