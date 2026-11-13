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
    const veld = m.field ? `veld ${esc(String(m.field))}` : 'het veld';
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
        pushMoment(`${key}:g${newTot}`, 'headline', `${first ? 'EERSTE DOELPUNT' : 'DOELPUNT'} — ${esc(scorer)}! ${m.score_a}–${m.score_b} op veld ${esc(String(m.field || '?'))}`);
        const oldLead = Math.sign((p.score_a ?? 0) - (p.score_b ?? 0)), newLead = Math.sign((m.score_a ?? 0) - (m.score_b ?? 0));
        if (newLead !== 0 && newLead !== oldLead && oldTot > 0) pushMoment(`${key}:lead${newTot}`, 'lead', `${esc(newLead > 0 ? m.a : m.b)} komt op voorsprong — ${m.score_a}–${m.score_b}`);
      }
      if (m.ko && p.status !== 'live' && m.status === 'live') pushMoment(`${key}:start`, 'headline', `${roundSpeakPlain(m.where)} is begonnen op veld ${esc(String(m.field || '?'))}`);
      if (m.pens_a != null && p.pens_a == null) pushMoment(`${key}:pens`, 'headline', `STRAFSCHOPPEN — ${esc(m.a)} tegen ${esc(m.b)} op veld ${esc(String(m.field || '?'))}`);
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
    $('om-live-n').textContent = live.length ? `${live.length} veld${live.length === 1 ? '' : 'en'}` : '';
    $('om-live').innerHTML = live.map(m => `
      <div class="om-lv">
        <span class="veld">Veld ${esc(String(m.field || '?'))}</span>
        <div class="wie">${esc(m.a || '—')}<span class="sc">${m.score_a ?? 0}–${m.score_b ?? 0}</span>${esc(m.b || '—')}${(m.pens_a != null && m.pens_b != null) ? ` <span style="color:var(--success);font-family:var(--mono);font-size:13px;">n.p. ${m.pens_a}–${m.pens_b}</span>` : ''}
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
            <span class="veldchip">Veld ${esc(String(m.field || '?'))}</span>
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
      el.classList.toggle('extra', ms >= mins * 60000);
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
  if (window.JVONet) window.JVONet.subscribe((online) => { if (online) load(); });

  // presentator-modus: knop + herstel de laatste keuze
  setTv(isTv());
  $('om-tv-btn')?.addEventListener('click', () => setTv(!isTv()));

  load().then(connect);
})();
