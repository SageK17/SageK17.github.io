// Papieren back-up — fetches the live tournament data and renders a clean,
// print-optimized programma + standen + knock-out schema. Kept as an external
// file because the site's CSP blocks inline scripts.
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

  async function load() {
    try {
      const res = await fetch('/api/tournament', { cache: 'no-store' });
      const json = await res.json();
      if (json && json.offline) { return; }   // keep whatever is shown
      render(json);
    } catch (e) {
      const page = document.getElementById('page');
      if (page.querySelector('.empty')) page.innerHTML = `<div class="empty">Kon het schema niet laden — controleer de verbinding en ververs.</div>`;
    }
  }

  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('refresh-btn').addEventListener('click', load);
  load();
})();
