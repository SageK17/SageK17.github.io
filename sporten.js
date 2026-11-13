// Sport-hub live-bord (/sporten): "Nu bezig" over alle sporten heen, met een tab
// "Alles" en een tab per competitie. Leest GET /api/hub (publiek) en ververst bij
// elk SSE-signaal van /api/tournament/stream (elke wijziging in welke sport dan
// ook stuurt daar een update), plus elke 20 s als vangnet.
// Regels: elke naam/tekst van de server gaat door esc() vóór innerHTML; geen
// sportnamen in deze code — alles komt uit de competitie-instellingen.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeIcon = (u) => (/^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || '')) ? u : '/sport/beker-klein.webp');
  let data = null;
  let tab = 'alles';
  let skew = 0;   // server_now - Date.now(), voor de live-minuut
  try { const t = sessionStorage.getItem('jvo_sporten_tab'); if (t) tab = t; } catch {}

  const tsMs = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + 'Z') : null);
  const setsLine = (sets) => (Array.isArray(sets) && sets.length ? sets.map(s => `${s[0]}–${s[1]}`).join(' · ') : '');
  const compOf = (id) => (data ? data.competitions.find(c => c.id === id) : null);

  function liveLabel(c) {
    if (c.status === 'done') return '<em class="klaar">Klaar</em>';
    if (c.status !== 'live') return c.expected ? `<em class="klaar">${esc(c.expected)}</em>` : '';
    if (c.model === 'sets') return `<em>Live set ${Array.isArray(c.sets) && c.sets.length ? c.sets.length : 1}</em>`;
    const st = tsMs(c.started_at);
    const min = st ? Math.max(0, Math.floor((Date.now() + skew - st) / 60000)) : 0;
    return `<em>Live ${min}′</em>`;
  }

  function kaart(c) {
    const where = [c.comp_name, c.where].filter(Boolean).map(esc).join(' · ');
    const sa = c.score_a == null ? '' : c.score_a, sb = c.score_b == null ? '' : c.score_b;
    const winA = c.status === 'done' && (c.score_a > c.score_b || (c.score_a === c.score_b && c.pens_a > c.pens_b));
    const winB = c.status === 'done' && (c.score_b > c.score_a || (c.score_a === c.score_b && c.pens_b > c.pens_a));
    const extra = setsLine(c.sets) || (c.pens_a != null && c.pens_b != null ? `n.p. ${c.pens_a}–${c.pens_b}` : '');
    const plek = c.field ? `${esc(c.place_noun)} ${esc(c.field)}` : '';
    return `<article class="kaart" aria-label="${esc(c.a || '?')} tegen ${esc(c.b || '?')}">
      <div class="l">
        <div class="k mono">${liveLabel(c)} ${where}</div>
        <div class="tm${winA ? ' win' : ''}"><span>${esc(c.a || 'Nog onbekend')}</span><b>${esc(sa)}</b></div>
        <div class="tm${winB ? ' win' : ''}"><span>${esc(c.b || 'Nog onbekend')}</span><b>${esc(sb)}</b></div>
        ${extra ? `<div class="sets">${esc(extra)}</div>` : ''}
      </div>
      <div class="r"><span class="badge"><img src="${esc(safeIcon(c.icon_small))}" alt="" /></span><span class="mono">${plek}</span></div>
    </article>`;
  }

  function straks(list) {
    if (!list.length) return '';
    return `<div class="lbl mono">Straks</div>` + list.map(c => `
      <div class="sr"><b>${esc(c.expected || '')}</b><img src="${esc(safeIcon(c.icon_small))}" alt="${esc(c.comp_name)}" />
        <span>${esc(c.a || 'Nog onbekend')} – ${esc(c.b || 'Nog onbekend')}</span>
        <i class="mono">${c.field ? `${esc(c.place_noun)} ${esc(c.field)}` : ''}</i></div>`).join('');
  }

  function standen(comp) {
    const ps = Object.keys(comp.poules || {}).sort();
    if (!ps.length) return '';
    const sets = comp.result_model === 'sets';
    return `<div class="lbl mono">Stand</div>` + ps.map(p => {
      const rows = comp.poules[p].standings || [];
      return `<section class="stand" aria-label="Stand poule ${esc(p)}">
        <h3>${ps.length > 1 ? `Poule ${esc(p)}` : 'Poule'}<i>${sets ? 'gs · pnt · sets' : 'gs · pnt · saldo'}</i></h3>
        <div class="srow kop" aria-hidden="true"><span>#</span><span>Naam</span><span class="n">Gs</span><span class="n">Pnt</span><span class="n">±</span></div>
        ${rows.map(s => `<div class="srow"><span>${esc(s.pos)}</span><em>${esc(s.name)}</em><span class="n">${esc(s.gp)}</span><b>${esc(s.pts)}</b><span class="n">${s.gd > 0 ? '+' : ''}${esc(s.gd)}</span></div>`).join('')}
      </section>`;
    }).join('');
  }

  function eindstand(comp) {
    const fs = comp.final_standing;
    if (!Array.isArray(fs) || !fs.length) return '';
    return `<div class="lbl mono">Eindstand</div><div class="podium">` + fs.slice(0, 4).map(t =>
      `<div class="plek p${esc(t.pos)}"><b>${esc(t.pos)}</b><span>${esc(t.name)}</span></div>`).join('') + `</div>`;
  }

  function knockout(comp) {
    const ko = comp.knockout || [];
    if (!ko.length) return '';
    const cards = ko.map(k => ({
      comp_id: comp.id, comp_name: '', icon_small: comp.icon_small, place_noun: comp.place_noun, model: comp.result_model,
      where: k.where, a: k.a ? (k.a.name || k.a.placeholder) : null, b: k.b ? (k.b.name || k.b.placeholder) : null,
      score_a: k.score_a, score_b: k.score_b, pens_a: k.pens_a, pens_b: k.pens_b, sets: k.sets, status: k.status,
      field: k.field, expected: k.expected, started_at: null,
    }));
    return `<div class="lbl mono">Knock-out</div><div class="list">${cards.map(kaart).join('')}</div>`;
  }

  function leeg(text) { return `<p class="leeg">${esc(text)}</p>`; }

  function renderTabs() {
    const comps = data.competitions;
    const tabs = [{ key: 'alles', label: 'Alles', icon: null }].concat(comps.map(c => ({ key: String(c.id), label: c.name, icon: c.icon_small })));
    if (!tabs.some(t => t.key === tab)) tab = 'alles';
    const strip = $('tabs');
    const scrollWas = strip.scrollLeft;
    $('tabs').innerHTML = tabs.map(t => `<button type="button" role="tab" class="tab${t.icon ? '' : ' alles'}" id="tab-${esc(t.key)}"
      aria-controls="paneel" aria-selected="${t.key === tab ? 'true' : 'false'}" tabindex="${t.key === tab ? '0' : '-1'}" data-tab="${esc(t.key)}">
      ${t.icon ? `<img src="${esc(safeIcon(t.icon))}" alt="" />` : ''}${esc(t.label)}</button>`).join('');
    $('paneel').setAttribute('aria-labelledby', 'tab-' + tab);
    // Eén sport: geen tabs nodig.
    $('tabs').hidden = comps.length < 2;
    // De strook houdt zijn plek bij het verversen; het gekozen tabblad schuift in beeld
    // (alleen horizontaal, de pagina zelf scrolt niet mee).
    strip.scrollLeft = scrollWas;
    const actief = strip.querySelector('[aria-selected="true"]');
    if (actief) {
      const l = actief.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
      const r = l + actief.offsetWidth;
      if (l < strip.scrollLeft) strip.scrollLeft = Math.max(0, l - 16);
      else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 16;
    }
  }

  function render() {
    if (!data) return;
    renderTabs();
    const live = tab === 'alles' ? data.now : data.now.filter(c => String(c.comp_id) === tab);
    const sportsLive = new Set(data.now.map(c => c.comp_id)).size;
    $('sub').textContent = `${data.now.length} ${data.now.length === 1 ? 'wedstrijd' : 'wedstrijden'} · ${sportsLive} ${sportsLive === 1 ? 'sport' : 'sporten'}`;
    const pill = $('pill');
    if (data.now.length) { pill.textContent = '● Live'; pill.classList.add('live'); pill.removeAttribute('href'); }
    else { pill.textContent = 'Aanmelden'; pill.classList.remove('live'); pill.setAttribute('href', '/'); }

    let html = '';
    if (tab === 'alles') {
      html += live.length ? `<div class="list" style="margin-top:22px">${live.map(kaart).join('')}</div>`
        : `<div style="margin-top:22px">${leeg(data.next.length ? 'Er wordt nu even niets gespeeld. Hieronder zie je wat er straks komt.' : 'Er wordt nu niets gespeeld.')}</div>`;
      html += straks(data.next.slice(0, 8));
      const done = data.competitions.filter(c => Array.isArray(c.final_standing) && c.final_standing.length);
      if (done.length) {
        html += `<div class="lbl mono">Kampioenen</div>` + done.map(c => `<div class="sr"><b>1</b><img src="${esc(safeIcon(c.icon_small))}" alt="${esc(c.name)}" /><span>${esc(c.final_standing[0].name)}</span><i class="mono">${esc(c.name)}</i></div>`).join('');
      }
    } else {
      const comp = compOf(Number(tab));
      if (!comp) return;
      html += live.length ? `<div class="list" style="margin-top:22px">${live.map(kaart).join('')}</div>`
        : `<div style="margin-top:22px">${leeg(comp.configured ? `Bij ${comp.name} wordt nu niets gespeeld.` : `Het schema van ${comp.name} komt hier zodra het klaar is.`)}</div>`;
      html += straks(data.next.filter(c => c.comp_id === comp.id).slice(0, 6));
      html += eindstand(comp);
      html += standen(comp);
      html += knockout(comp);
      if (comp.is_default) html += `<a class="meer" href="/toernooi">Het volledige bord van ${esc(comp.name)} →</a>`;
    }
    $('paneel').innerHTML = html;
    $('voet').textContent = data.multi ? `${data.competitions.length} sporten · ververst vanzelf` : 'Ververst vanzelf';
  }

  // Tabs: klik + pijltjestoetsen (ARIA-tabpatroon).
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    try { sessionStorage.setItem('jvo_sporten_tab', tab); } catch {}
    render();
  });
  $('tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btns = [...$('tabs').querySelectorAll('[data-tab]')];
    const i = btns.findIndex(b => b.dataset.tab === tab);
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    if (!next) return;
    tab = next.dataset.tab;
    render();
    $('tab-' + tab)?.focus();
  });

  let busy = false, again = false;
  async function load() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const r = await fetch('/api/hub', { cache: 'no-store' });
      if (r.ok) {
        data = await r.json();
        if (data.server_now) skew = data.server_now - Date.now();
        render();
      }
    } catch { /* offline: laatst getoonde stand blijft staan */ }
    busy = false;
    if (again) { again = false; load(); }
  }
  let t = null;
  const soon = () => { clearTimeout(t); t = setTimeout(load, 300); };
  try {
    const es = new EventSource('/api/tournament/stream');
    es.addEventListener('update', soon);
  } catch {}
  setInterval(load, 20000);
  setInterval(render, 15000);   // live-minuut bijwerken
  load();
})();
