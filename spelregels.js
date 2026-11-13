// De spelregelpagina wordt door de server al gevuld uit het evenement-profiel
// (naam, datum, wedstrijdduur, contactadres). Dit script houdt een offline-
// gecachete pagina vers: het leest dezelfde velden uit /api/config en schrijft
// ze alleen over als er écht een waarde is (nooit leeg over server-tekst heen).
fetch('/api/config')
  .then(r => r.json())
  .then(cfg => {
    const ev = (cfg && cfg.event) || {};

    // Datum in de eyebrow (staat er alleen als het evenement een datum heeft).
    if (ev.dateText) document.querySelectorAll('.js-event-date').forEach(el => { el.textContent = ev.dateText; });

    // Wedstrijduur: elke plek die 'm toont — de ingebouwde regels (#match-mins,
    // #match-mins-2) én eigen regels van de organisator ({minuten} →
    // <span class="js-match-mins">) — zodat de pagina zichzelf nooit tegenspreekt.
    const m = ev.matchMinutes;
    if (m) {
      const spots = new Set(document.querySelectorAll('.js-match-mins'));
      ['match-mins', 'match-mins-2'].forEach(id => { const el = document.getElementById(id); if (el) spots.add(el); });
      spots.forEach(el => { el.textContent = m; });
    }

    // Contact-e-mail (per installatie instelbaar via EMAIL_REPLY_TO).
    if (cfg && cfg.contactEmail) {
      document.querySelectorAll('.js-contact-mail').forEach(a => { a.href = 'mailto:' + cfg.contactEmail; a.textContent = cfg.contactEmail; });
    }
  })
  .catch(() => {});
