// Enquêteformulier (/feedback). Vaste categorieën (server is de
// bron) zodat de admin exact kan tellen wat vaak genoemd wordt; vrije tekst als
// toelichting. Optionele persoonlijke token (?t=…) → opnieuw invullen
// overschrijft je eerdere antwoord i.p.v. dubbel te tellen.
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { score: null, top: new Set(), beter: new Set(), again: null, role: null };
  const token = new URLSearchParams(location.search).get('t') || '';

  // Cijfer 1–10
  const scoreWrap = $('fb-score');
  for (let i = 1; i <= 10; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = i; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
    b.addEventListener('click', () => {
      state.score = i;
      scoreWrap.querySelectorAll('button').forEach(x => { x.classList.toggle('on', +x.textContent === i); x.setAttribute('aria-checked', String(+x.textContent === i)); });
      $('fb-err').textContent = '';
    });
    scoreWrap.appendChild(b);
  }

  // Categorie-chips (top + beter) uit de server-meta
  function chips(wrapId, set) {
    const wrap = $(wrapId);
    return (cats) => {
      wrap.innerHTML = '';
      cats.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = c; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          if (set.has(c)) set.delete(c); else set.add(c);
          b.classList.toggle('on', set.has(c));
          b.setAttribute('aria-pressed', String(set.has(c)));
        });
        wrap.appendChild(b);
      });
    };
  }
  const fillTop = chips('fb-top', state.top), fillBeter = chips('fb-beter', state.beter);
  fetch('/api/feedback/meta').then(r => r.json()).then(m => {
    fillTop(m.categories); fillBeter(m.categories);
    // Naam + datum staan al server-gevuld in de pagina; alleen bijwerken als er
    // echt een waarde is (houdt een offline-gecachete pagina vers).
    if (m.event && m.event.name && $('fb-eyebrow-name')) $('fb-eyebrow-name').textContent = m.event.name;
    if (m.event && m.event.dateText && $('fb-eyebrow-date')) $('fb-eyebrow-date').textContent = ' · ' + m.event.dateText;
  }).catch(() => { $('fb-err').textContent = 'Kon de vragen niet laden — ververs de pagina.'; });
  // Footer-contact: server-gevuld; dit houdt een gecachete pagina vers (nooit leeg overschrijven).
  fetch('/api/config').then(r => r.json()).then(cfg => {
    if (!cfg || !cfg.contactEmail) return;
    document.querySelectorAll('.js-contact-mail').forEach(a => { a.href = 'mailto:' + cfg.contactEmail; a.textContent = cfg.contactEmail; });
  }).catch(() => {});

  // Radio-groepen (again + role)
  function radio(wrapId, key) {
    const wrap = $(wrapId);
    wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      state[key] = state[key] === b.dataset.v ? null : b.dataset.v;   // nog eens tikken = uitzetten
      wrap.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === state[key]));
    }));
  }
  radio('fb-again', 'again');
  radio('fb-role', 'role');

  $('fb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('fb-err');
    if (!state.score) { err.textContent = 'Kies eerst een cijfer (vraag 1).'; return; }
    const btn = $('fb-submit');
    btn.disabled = true; btn.textContent = 'Versturen…';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, score: state.score, top: [...state.top], better: [...state.beter],
          again: state.again, role: state.role, comment: $('fb-comment').value,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { err.textContent = j.error || 'Versturen mislukt — probeer het opnieuw.'; btn.disabled = false; btn.textContent = 'Verstuur mijn feedback →'; return; }
      $('fb-form').hidden = true;
      $('fb-done').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      err.textContent = 'Geen verbinding — probeer het zo nog eens.';
      btn.disabled = false; btn.textContent = 'Verstuur mijn feedback →';
    }
  });
})();
