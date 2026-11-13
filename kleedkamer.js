// Kleedkamer-borden — één groot bord per team (teamnaam + poule + plek om het
// kamernummer met de hand bij te schrijven), klaar om op de kleedkamerdeur te
// plakken. Externe file want de CSP blokkeert inline scripts.
//
// Bron van waarheid = de GOEDGEKEURDE teams, zodat het aantal borden ALTIJD
// gelijk is aan het aantal teams (ook vóór de poule-indeling gemaakt is). De
// poule wordt erover gelegd zodra het schema bestaat. Heeft dit tabblad geen
// admin-sessie, dan valt het terug op de publieke toernooi-data (werkt zodra het
// schema gegenereerd is).
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const ALL_POULES = ['A','B','C','D'];
  const token = (() => { try { return localStorage.getItem('jvo_admin_token') || ''; } catch { return ''; } })();

  // Lengte-klasse zodat een lange teamnaam altijd op het bord past.
  function lenClass(name) {
    const n = (name || '').length;
    if (n > 30) return 'len-xl';
    if (n > 20) return 'len-l';
    if (n > 13) return 'len-m';
    return '';
  }

  // teamId -> poule, uit het (eventueel) gegenereerde schema.
  function pouleMap(d) {
    const map = new Map();
    if (!d || !d.poules) return map;
    for (const p of ALL_POULES) {
      for (const s of ((d.poules[p] && d.poules[p].standings) || [])) map.set(s.id, p);
    }
    return map;
  }

  function signHtml(t, ev) {
    const pouleBadge = t.poule
      ? `<span class="sign-poule">Poule ${esc(t.poule)}</span>`
      : `<span class="sign-poule muted">Indeling volgt</span>`;
    return `
      <div class="sign">
        <div class="sign-band">
          <div class="sign-kicker">${esc(ev.name || '')}</div>
          <div class="sign-room">Kleedkamer</div>
        </div>
        <div class="sign-mid">
          ${pouleBadge}
          <div class="sign-name ${lenClass(t.name)}">${esc(t.name)}</div>
        </div>
        <div class="sign-foot">
          <div class="sign-write"><b>Veld / kamer:</b> <span class="sign-line">&nbsp;</span></div>
          <div class="sign-brand">${esc(ev.dateText || ev.date || '')}</div>
        </div>
      </div>`;
  }

  function setCount(n) {
    const el = document.getElementById('count');
    if (el) el.textContent = n ? `${n} bord${n === 1 ? '' : 'en'} · ${n} team${n === 1 ? '' : 's'}` : '';
  }

  function render(teams, ev, note) {
    const sheet = document.getElementById('sheet');
    setCount(teams.length);
    if (!teams.length) {
      sheet.innerHTML = `<div class="empty">${esc(note || 'Nog geen goedgekeurde teams. Keur eerst teams goed in het admin-paneel.')}</div>`;
      return;
    }
    const banner = note ? `<div class="note">${esc(note)}</div>` : '';
    sheet.innerHTML = banner + teams.map(t => signHtml(t, ev)).join('');
  }

  // Sorteer op poule (A,B,C,D, dan "geen poule"), daarna op naam.
  function sortTeams(teams) {
    const rank = (p) => p ? ALL_POULES.indexOf(p) : 99;
    return teams.slice().sort((a, b) => rank(a.poule) - rank(b.poule) || String(a.name).localeCompare(String(b.name)));
  }

  async function getJson(url, opts) {
    const res = await fetch(url, opts);
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
  }

  async function load() {
    // Event-tekst (datum/naam) komt altijd uit de publieke config.
    let ev = {};
    try { ev = (await getJson('/api/config')).body.event || {}; } catch {}
    // Config even niet bereikbaar? Dan de naam die de server in de pagina zette.
    if (!ev.name) ev = { ...ev, name: (document.getElementById('sheet').dataset.eventName || '') };
    // Poule-overlay uit het (eventueel) gegenereerde schema.
    let pmap = new Map();
    try { const t = (await getJson('/api/tournament')).body; if (t && !t.offline) pmap = pouleMap(t); } catch {}

    // PRIMAIR: de goedgekeurde teams (aantal borden == aantal teams).
    if (token) {
      try {
        const r = await getJson('/api/admin/teams', { headers: { 'x-admin-token': token } });
        if (r.ok && Array.isArray(r.body)) {
          const teams = r.body
            .filter(t => t.status === 'approved')
            .map(t => ({ id: t.id, name: t.team_name, poule: pmap.get(t.id) || null }));
          render(sortTeams(teams), ev,
            pmap.size ? '' : 'De poule-indeling is nog niet gemaakt — de borden tonen alle goedgekeurde teams; “Poule …” verschijnt zodra je het schema genereert.');
          return;
        }
        // 401/403 → token verlopen; val terug op publiek.
      } catch {}
    }

    // TERUGVAL (geen/verlopen admin-sessie): publieke toernooi-data.
    try {
      const t = (await getJson('/api/tournament')).body;
      if (t && t.configured) {
        const teams = [];
        for (const p of ALL_POULES) for (const s of ((t.poules[p] && t.poules[p].standings) || [])) teams.push({ id: s.id, name: s.name, poule: p });
        render(sortTeams(teams), ev,
          'Tip: open deze pagina via het admin-paneel (ingelogd) om óók vóór de indeling alle teams te zien.');
        return;
      }
    } catch {}
    render([], ev, 'Log in op het admin-paneel en open deze pagina daar vandaan, of genereer eerst het toernooischema.');
  }

  // 1 of 2 per pagina
  document.getElementById('per-page').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-n]');
    if (!btn) return;
    document.body.classList.toggle('two', btn.dataset.n === '2');
    document.querySelectorAll('#per-page button').forEach(b => b.classList.toggle('on', b === btn));
  });

  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('refresh-btn').addEventListener('click', load);
  load();
})();
