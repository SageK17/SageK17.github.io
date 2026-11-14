// Papieren back-up — fetches the live tournament data and renders a clean,
// print-optimized programma + standen + knock-out schema. Kept as an external
// file because the site's CSP blocks inline scripts.
//
// Sport-hub: /print?competition=<id> prints ONE sport (schema op tijd met
// invulvakjes — per set bij een sets-sport —, standen per poule en de knock-out)
// uit GET /api/tournament?competition=<id>. Zonder parameter blijft dit het blad
// van het hoofdtoernooi; staat dat uit, dan opent de eerste actieve sport.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const ALL_POULES = ['A','B','C','D'];
  const KO_LABEL = { VR1:'Play-off 1', VR2:'Play-off 2', A1:'Achtste finale 1', A2:'Achtste finale 2', A3:'Achtste finale 3', A4:'Achtste finale 4', A5:'Achtste finale 5', A6:'Achtste finale 6', A7:'Achtste finale 7', A8:'Achtste finale 8', KF1:'Kwartfinale 1', KF2:'Kwartfinale 2', KF3:'Kwartfinale 3', KF4:'Kwartfinale 4', HF1:'Halve finale 1', HF2:'Halve finale 2', Finale:'Finale', '3e/4e':'Troostfinale (3e/4e)' };
  const KO_ROUNDS = [
    { title: 'Play-off', labels: ['VR1','VR2'] },
    { title: 'Achtste finales', labels: ['A1','A2','A3','A4','A5','A6','A7','A8'] },
    { title: 'Kwartfinales', labels: ['KF1','KF2','KF3','KF4'] },
    { title: 'Halve finales', labels: ['HF1','HF2'] },
    { title: 'Finale & troostfinale', labels: ['Finale','3e/4e'] },
  ];

  const when = (m) => [m.time || '', m.field ? 'Veld ' + m.field : ''].filter(Boolean).join(' · ') || '—';
  // A finished KO tie decided on penalties prints the shoot-out too — a bare
  // "2 – 2" on the paper backup gives no clue who advanced.
  const result = (m) => (m.score_a != null && m.score_b != null && m.status === 'done')
    ? `${m.score_a} – ${m.score_b}${(m.pens_a != null && m.pens_b != null) ? ` (n.p. ${m.pens_a}–${m.pens_b})` : ''}`
    : '____ – ____';

  function pouleBlock(p, pl) {
    const stand = (pl.standings || []).map(s => `
      <tr>
        <td class="c">${s.pos}</td><td>${esc(s.name)}</td>
        <td class="c">${s.gp}</td><td class="c">${s.w}-${s.d}-${s.l}</td>
        <td class="c">${s.gf}</td><td class="c">${s.ga}</td>
        <td class="c">${s.gd >= 0 ? '+' : ''}${s.gd}</td><td class="c"><b>${s.pts}</b></td>
      </tr>`).join('');
    const byRound = {};
    (pl.matches || []).forEach(m => { (byRound[m.round] = byRound[m.round] || []).push(m); });
    const matchRows = Object.keys(byRound).sort((a,b)=>a-b).flatMap(r => byRound[r].map(m => `
      <tr>
        <td class="t">${esc(when(m))}</td>
        <td>${esc(m.a || '—')} <span class="ph">vs</span> ${esc(m.b || '—')}</td>
        <td class="res c">${esc(result(m))}</td>
      </tr>`)).join('');
    return `
      <div class="poule">
        <h2>Poule ${esc(p)}</h2>
        <h3>Stand</h3>
        <table>
          <thead><tr><th class="c">#</th><th>Team</th><th class="c">G</th><th class="c">W-G-V</th><th class="c">DV</th><th class="c">DT</th><th class="c">DS</th><th class="c">Ptn</th></tr></thead>
          <tbody>${stand || '<tr><td colspan="8" class="empty">Geen teams.</td></tr>'}</tbody>
        </table>
        <h3>Wedstrijden</h3>
        <table>
          <thead><tr><th>Tijd · veld</th><th>Wedstrijd</th><th class="c">Uitslag</th></tr></thead>
          <tbody>${matchRows || '<tr><td colspan="3" class="empty">Nog geen wedstrijden.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function koBlock(knockout) {
    const byLabel = {};
    (knockout || []).forEach(k => byLabel[k.label] = k);
    const rounds = KO_ROUNDS.map(rd => {
      const ties = rd.labels.map(l => byLabel[l]).filter(Boolean);
      if (!ties.length) return '';
      const rows = ties.map(k => {
        const a = k.a.name || k.a.placeholder || '—', b = k.b.name || k.b.placeholder || '—';
        const aPh = !k.a.name, bPh = !k.b.name;
        return `<tr>
          <td>${esc(KO_LABEL[k.label] || k.label)}</td>
          <td class="t">${esc(when(k))}</td>
          <td><span class="${aPh ? 'ph' : ''}">${esc(a)}</span> <span class="ph">vs</span> <span class="${bPh ? 'ph' : ''}">${esc(b)}</span></td>
          <td class="res c">${esc(result(k))}</td>
        </tr>`;
      }).join('');
      return `<div class="ko-round"><h3>${esc(rd.title)}</h3>
        <table><thead><tr><th>Ronde</th><th>Tijd · veld</th><th>Wedstrijd</th><th class="c">Uitslag</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }).join('');
    return rounds ? `<h2>Knock-out</h2>${rounds}` : '';
  }

  function render(d) {
    const page = document.getElementById('page');
    if (!d || !d.configured) {
      page.innerHTML = `<div class="empty">Er is nog geen toernooischema gegenereerd.<br/>Genereer eerst het schema in het admin-paneel, kom dan hier terug.</div>`;
      return;
    }
    const ev = d.event || {};
    // Naam: uit de toernooi-data, anders wat de server in de pagina zette.
    const evName = ev.name || page.dataset.eventName || 'Toernooi';
    const present = ALL_POULES.filter(p => d.poules[p] && d.poules[p].standings.length);
    const stamp = new Date().toLocaleString('nl-NL');
    page.innerHTML = `
      <h1>${esc(evName)} — programma &amp; standen</h1>
      <div class="sub">${esc(ev.dateText || ev.date || '')}${d.schedule ? ` · start ${esc(d.schedule.start_time)} · ${d.schedule.fields} velden · ${d.schedule.match_min}+${d.schedule.break_min} min` : ''}</div>
      <div class="gen">Papieren back-up · gegenereerd ${esc(stamp)}</div>
      ${present.map(p => pouleBlock(p, d.poules[p])).join('')}
      ${koBlock(d.knockout)}
      <div class="note">De live-app is altijd leidend. Gebruik dit blad alleen als de wifi op locatie uitvalt: noteer de uitslagen met de hand en voer ze later in de app in.</div>`;
  }

  // ── Eén sport uit de sport-hub (andere vorm dan het hoofdtoernooi) ──────────
  const hm = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : 9999; };
  function compResult(m, sets, bestOf, ko, tiebreak) {
    const done = m.status === 'done' && m.score_a != null && m.score_b != null;
    if (sets) {
      if (done) return `<b>${esc(m.score_a)} – ${esc(m.score_b)}</b>${Array.isArray(m.sets) && m.sets.length ? ` <span class="setjes">(${esc(m.sets.map(x => `${x[0]}–${x[1]}`).join(' · '))})</span>` : ''}`;
      let h = '';
      for (let i = 1; i <= bestOf; i++) h += `<span class="vak"><i>Set ${i}</i>__ – __</span>`;
      return h + `<span class="vak tot"><i>Sets</i>__ – __</span>`;
    }
    if (done) return `<b>${esc(m.score_a)} – ${esc(m.score_b)}</b>${(m.pens_a != null && m.pens_b != null) ? ` <span class="setjes">(${esc(tiebreak)} ${esc(m.pens_a)}–${esc(m.pens_b)})</span>` : ''}`;
    return `<span class="vak">____ – ____</span>${ko ? `<span class="vak"><i>${esc(tiebreak)}</i>__ – __</span>` : ''}`;
  }
  function renderComp(d) {
    const page = document.getElementById('page');
    const c = d.competition || {};
    const evName = page.dataset.eventName || '';
    const title = [evName, c.name].filter(Boolean).join(' — ');
    document.title = `${c.name || 'Schema'} — papieren back-up`;
    if (!d.configured) {
      page.innerHTML = `<h1>${esc(title)}</h1><div class="empty">Voor ${esc(c.name || 'deze sport')} is nog geen schema gemaakt.<br/>Maak het eerst in de admin en kom dan hier terug.</div>`;
      return;
    }
    const sc = d.schedule || {};
    const noun = sc.place_noun || 'Veld';
    const sets = c.result_model === 'sets';
    const bestOf = [1, 3, 5, 7].includes(c.best_of) ? c.best_of : 3;
    const tiebreak = (d.vocab && d.vocab.tiebreak) || 'Beslissing';
    const nm = (v) => (v && typeof v === 'object' ? { text: v.name || v.placeholder || '—', ph: !v.name } : { text: v || '—', ph: !v });
    const all = [];
    const pouleKeys = Object.keys(d.poules || {}).sort();
    for (const p of pouleKeys) for (const m of (d.poules[p].matches || [])) all.push({ ...m, ko: false, round_label: pouleKeys.length > 1 ? `Poule ${p}` : 'Poule' });
    for (const k of (d.knockout || [])) all.push({ ...k, ko: true, round_label: k.where || k.label });
    all.sort((x, y) => hm(x.time) - hm(y.time) || (x.field || 99) - (y.field || 99) || (x.slot ?? 999) - (y.slot ?? 999));
    const rows = all.map(m => {
      const a = nm(m.a), b = nm(m.b);
      return `<tr>
        <td class="t">${esc(m.time || '—')}</td>
        <td class="c">${m.field ? esc(m.field) : '—'}</td>
        <td><span class="${a.ph ? 'ph' : ''}">${esc(a.text)}</span> <span class="ph">–</span> <span class="${b.ph ? 'ph' : ''}">${esc(b.text)}</span><div class="rl">${esc(m.round_label)}</div></td>
        <td class="uit">${compResult(m, sets, bestOf, m.ko, tiebreak)}</td>
      </tr>`;
    }).join('');
    const stand = pouleKeys.map(p => {
      const st = (d.poules[p].standings || []).map(s => `<tr>
          <td class="c">${esc(s.pos)}</td><td>${esc(s.name)}</td><td class="c">${esc(s.gp)}</td>
          <td class="c">${sets ? `${esc(s.w)}-${esc(s.l)}` : `${esc(s.w)}-${esc(s.d)}-${esc(s.l)}`}</td>
          <td class="c">${s.gd > 0 ? '+' : ''}${esc(s.gd)}</td><td class="c"><b>${esc(s.pts)}</b></td></tr>`).join('');
      return `<div class="poule"><h3>${pouleKeys.length > 1 ? `Poule ${esc(p)}` : 'Stand'}</h3>
        <table><thead><tr><th class="c">#</th><th>Naam</th><th class="c">G</th><th class="c">${sets ? 'W-V' : 'W-G-V'}</th><th class="c">${sets ? 'Sets ±' : 'Saldo'}</th><th class="c">Ptn</th></tr></thead>
        <tbody>${st || '<tr><td colspan="6" class="empty">Nog niemand.</td></tr>'}</tbody></table></div>`;
    }).join('');
    const stamp = new Date().toLocaleString('nl-NL');
    const info = [sc.start_time ? `start ${sc.start_time}` : '', sc.fields ? `${sc.fields}× ${String(noun).toLowerCase()}` : '',
      sc.match_min ? `${sc.match_min}+${sc.break_min || 0} min` : '', sets ? `best of ${bestOf}` : '', d.format_label || ''].filter(Boolean).join(' · ');
    page.innerHTML = `
      <h1>${esc(title)}</h1>
      <div class="sub">${esc(info)}</div>
      <div class="gen">Papieren back-up · gemaakt ${esc(stamp)} · tijden volgens het schema</div>
      <h2>Wedstrijdschema</h2>
      <table class="schema">
        <thead><tr><th>Tijd</th><th class="c">${esc(noun)}</th><th>Wedstrijd</th><th>Uitslag${sets ? ' (per set)' : ''}</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="empty">Nog geen wedstrijden.</td></tr>'}</tbody>
      </table>
      <h2>Standen</h2>
      ${stand}
      <div class="note">De live-app is altijd leidend. Gebruik dit blad alleen als het netwerk uitvalt: schrijf de uitslagen op${sets ? ' (per set)' : ''} en voer ze later in via de bediening.${all.some(m => m.ko) ? ' Namen in schuinschrift worden pas bekend als de ronde ervoor klaar is.' : ''}</div>`;
  }

  // Welke sport: ?competition=<id>; anders het hoofdtoernooi, of — als dat uit staat —
  // de eerste actieve sport.
  const DEFAULT_COMP = 1;
  let cid = null;
  try { const q = new URLSearchParams(location.search).get('competition'); if (q && /^\d+$/.test(q)) cid = Number(q); } catch {}
  let comps = null;
  async function loadComps() {
    try {
      const r = await fetch('/api/competitions');
      const j = r.ok ? await r.json() : null;
      comps = j && Array.isArray(j.competitions) ? j.competitions : null;
    } catch { comps = null; }
    if (!comps) return;
    if (cid == null && comps.length && !comps.some(c => c.id === DEFAULT_COMP)) cid = comps[0].id;
    const nav = document.getElementById('sporten');
    if (!nav || comps.length < 2) return;
    const cur = cid == null ? DEFAULT_COMP : cid;
    nav.innerHTML = comps.map(c => `<a href="${c.id === DEFAULT_COMP ? '/print' : `/print?competition=${esc(c.id)}`}"${c.id === cur ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`).join('');
    nav.hidden = false;
  }

  async function load() {
    try {
      const res = await fetch(cid == null ? '/api/tournament' : `/api/tournament?competition=${encodeURIComponent(cid)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json && json.offline) { return; }   // keep whatever is shown
      if (!res.ok) {
        document.getElementById('page').innerHTML = `<div class="empty">${esc(json && json.error ? json.error : 'Deze sport bestaat niet (meer).')}</div>`;
        return;
      }
      if (json && json.competition && cid != null && cid !== DEFAULT_COMP) renderComp(json); else render(json);
    } catch (e) {
      const page = document.getElementById('page');
      if (page.querySelector('.empty')) page.innerHTML = `<div class="empty">Kon het schema niet laden — controleer de verbinding en ververs.</div>`;
    }
  }

  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('refresh-btn').addEventListener('click', load);
  loadComps().then(load);
})();
