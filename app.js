// Public registration form
//
// Alle evenement-teksten (naam, datum, locatie, sponsor, aantallen) staan al in de
// HTML: de server vult ze per request in uit het evenement-profiel ({{ev.…}}).
// Dit script houdt een (offline) gecachete pagina alleen nog vers via /api/config
// en regelt het formulier. Regels:
//   • nooit een lege waarde over een door de server gevulde waarde schrijven;
//   • config-/gebruikerswaarden alleen via textContent of DOM-nodes (geen innerHTML);
//   • elk element kan ontbreken (bv. het formulier als aanmelden dicht is) → overal guards.
(async () => {
  const $ = (id) => document.getElementById(id);
  const form = $('reg-form');
  const submitBtn = $('submit-btn');
  const alertBox = $('form-alert');
  const successBox = $('success');
  const teamFields = $('panel-team');
  const teamNameInput = $('team_name');
  const playersInput = $('expected_players');
  const toggle = document.querySelectorAll('.path-toggle button');
  const BASE_SUBMIT_LABEL = 'Aanmelding versturen →';
  let SUBMIT_LABEL = BASE_SUBMIT_LABEL;
  // Sport-hub: gekozen competitie (alleen bij meer dan één sport) + de lijst.
  let sports = [];
  let chosenSport = null;
  let path = 'visitor';
  // Player-count bounds — kept in sync with /api/config below; HTML attrs are the fallback.
  let minPlayers = parseInt(playersInput?.min, 10) || 7;
  let maxPlayers = parseInt(playersInput?.max, 10) || 12;
  // "de JVO Open Dag" / "het JVO Toernooi" — door de server op het formulier gezet.
  let eventWithArticle = (form && form.dataset.event) || '';

  const hasText = (v) => v != null && String(v).trim() !== '';
  const setText = (el, v) => { if (el && hasText(v)) el.textContent = String(v); };
  const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || ''));
  // Eigen pad (/logo.svg) of http(s)-adres — nooit javascript:/data: in een src.
  const isSafeSrc = (u) => isHttpUrl(u) || /^\/[^/\\]/.test(String(u || ''));

  // Locatie: "Sportpark X, Plaats" → twee regels. Opgebouwd met tekst-nodes (geen innerHTML).
  function renderLocation(str) {
    const el = $('meta-loc');
    if (!el || !hasText(str)) return;
    const parts = String(str).trim().split(', ');
    el.textContent = '';
    parts.forEach((part, i) => {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(part));
    });
  }
  // P1.14 — het adres is een aantikbare kaart-link.
  function renderAddress(str) {
    if (!hasText(str)) return;
    const address = String(str).trim();
    let el = $('meta-address');
    if (!el) {
      // Pagina is zonder adres gerenderd (oudere cache) → regel alsnog toevoegen.
      const meta = document.querySelector('.event-meta');
      if (!meta) return;
      el = document.createElement('div');
      el.id = 'meta-address';
      el.className = 'meta-address mono small';
      meta.insertAdjacentElement('afterend', el);
    }
    const a = document.createElement('a');
    a.href = 'https://maps.google.com/?q=' + encodeURIComponent(address);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.color = 'inherit';
    a.style.textDecoration = 'underline';
    a.textContent = address.replace(/, /g, ' · ');
    el.textContent = '';
    el.appendChild(a);
  }

  // Meteen (zonder op /api/config te wachten) de door de server gevulde waarden opmaken.
  renderLocation($('meta-loc')?.textContent);
  renderAddress($('meta-address')?.textContent);
  // Sponsor met logo maar zonder website: de logokaart mag dan geen (lege) link zijn.
  document.querySelectorAll('a.js-sponsor-url').forEach((a) => {
    if (!a.getAttribute('href')) { a.removeAttribute('href'); a.removeAttribute('target'); }
  });

  // --- Aanmelden open / dicht -------------------------------------------------
  // De server rendert de juiste kaart; dit past dezelfde staat toe als die tijdens
  // het bezoek verandert (of als de pagina uit de offline-cache komt).
  const CLOSED_COPY = {
    soon: { title: 'Binnenkort open.', hint: 'Zodra de datum bekend is, kun je je hier aanmelden.' },
    over: { title: 'Tot de volgende!', hint: 'Bedankt aan iedereen die erbij was.' },
    closed: { title: 'Nu dicht.', hint: 'Zodra aanmelden weer opengaat, zie je het hier.' },
  };
  function showClosed(reg) {
    const closed = $('reg-closed');
    if (!closed) return false;
    const open = $('reg-open');
    if (open) open.hidden = true;
    closed.hidden = false;
    const copy = reg && Object.prototype.hasOwnProperty.call(CLOSED_COPY, reg.reason) ? CLOSED_COPY[reg.reason] : null;
    if (copy) {
      setText($('reg-closed-title'), copy.title);
      setText($('reg-closed-hint'), copy.hint);
    }
    const msgEl = $('reg-closed-msg');
    setText(msgEl, reg && reg.message);
    if (msgEl && !hasText(msgEl.textContent)) msgEl.textContent = 'Aanmelden is op dit moment gesloten.';
    const cta = $('tournament-cta');
    if (cta) cta.hidden = true;
    // Stijl "sporthub": de oranje "Meld je team aan"-knop bovenaan wijst nu nergens meer heen.
    const shCta = document.querySelector('.sh-cta-rij');
    if (shCta) shCta.hidden = true;
    return true;
  }
  // Pagina is "dicht" gerenderd (geen formulier in de HTML) maar aanmelden is inmiddels open.
  function showReopened() {
    const closed = $('reg-closed');
    if (!closed || $('reg-open') || $('reg-reload-btn')) return;
    setText($('reg-closed-title'), 'Het is open!');
    setText($('reg-closed-msg'), 'Aanmelden kan vanaf nu.');
    setText($('reg-closed-hint'), 'Ververs de pagina om het formulier te zien.');
    const actions = closed.querySelector('.reg-closed-actions');
    if (!actions) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'reg-reload-btn';
    btn.className = 'btn full';
    btn.textContent = 'Naar het formulier →';
    btn.addEventListener('click', () => window.location.reload());
    actions.insertBefore(btn, actions.firstChild);
    actions.querySelectorAll('a.btn:not(.ghost)').forEach((a) => a.classList.add('ghost'));
  }
  function applyRegistration(reg) {
    if (!reg || typeof reg.open !== 'boolean') return;
    if (reg.open) showReopened();
    else showClosed(reg);
  }

  // --- Formulier --------------------------------------------------------------
  // Live email validation with debounce — feedback as you type, but only after typing stops
  const emailInput = $('email');
  const emailWrap = emailInput?.closest('.input-with-icon');
  const EMAIL_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;
  const isValidEmail = (s) => typeof s === 'string'
    && EMAIL_RE.test(s)
    && !s.includes('..')
    && !s.startsWith('.')
    && !s.endsWith('.')
    && s.length <= 254;
  let emailDebounce = null;
  if (emailInput && emailWrap) {
    emailInput.addEventListener('input', () => {
      // Clear validation state while user is still typing
      emailWrap.classList.remove('is-valid', 'is-invalid');
      clearTimeout(emailDebounce);
      const val = emailInput.value.trim();
      if (val.length === 0) return;
      // Wait 600ms after last keystroke before evaluating
      emailDebounce = setTimeout(() => {
        if (isValidEmail(val)) {
          emailWrap.classList.add('is-valid');
        } else if (val.includes('@')) {
          // Only show error icon if user has at least started an email shape
          emailWrap.classList.add('is-invalid');
        }
      }, 600);
    });
    // Final check on blur (user moved away from field)
    emailInput.addEventListener('blur', () => {
      clearTimeout(emailDebounce);
      const val = emailInput.value.trim();
      if (val.length === 0) {
        emailWrap.classList.remove('is-valid', 'is-invalid');
        return;
      }
      emailWrap.classList.toggle('is-valid', isValidEmail(val));
      emailWrap.classList.toggle('is-invalid', !isValidEmail(val));
    });
  }

  const clearAlert = () => { if (alertBox) alertBox.textContent = ''; };
  const resetSubmit = () => {
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.textContent = SUBMIT_LABEL;
  };
  function setPath(next) {
    path = next === 'team' ? 'team' : 'visitor';
    toggle.forEach((b) => {
      const on = b.dataset.path === path;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (teamFields) teamFields.style.display = (path === 'team') ? 'block' : 'none';
    // Make team fields required only when team path is selected
    if (teamNameInput) teamNameInput.required = (path === 'team');
    if (playersInput) playersInput.required = (path === 'team');
  }
  toggle.forEach((btn) => {
    btn.addEventListener('click', () => {
      setPath(btn.dataset.path);
      clearAlert();
    });
  });

  function showError(msg, fieldId = null) {
    if (alertBox) {
      // Fouttekst kan (via de server) gebruikersinvoer bevatten → textContent, nooit innerHTML.
      const box = document.createElement('div');
      box.className = 'alert error';
      box.textContent = msg;
      alertBox.textContent = '';
      alertBox.appendChild(box);
    }
    // Highlight the specific field if known
    document.querySelectorAll('.field.has-error').forEach(f => f.classList.remove('has-error'));
    if (fieldId) {
      const inputEl = $(fieldId);
      const field = inputEl?.closest('.field');
      if (field) {
        field.classList.add('has-error');
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // P2.6 — focus the input itself after scroll so user can type immediately.
        // Slight delay so the smooth-scroll doesn't fight the focus.
        setTimeout(() => {
          inputEl?.focus();
        }, 350);
      }
    }
  }
  // Clear field-level errors when user starts typing in any field
  ['full_name', 'email', 'team_name', 'expected_players'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => {
      el.closest('.field')?.classList.remove('has-error');
    });
  });

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const data = {
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      consent_age: form.consent_age.checked,
      consent_reminders: form.consent_reminders.checked,
      consent_future_marketing: form.consent_future_marketing.checked,
      register_team: path === 'team',
    };

    if (path === 'team') {
      if (sports.length > 1) {
        if (!chosenSport) { showError('Kies eerst je sport.', 'sport-kiezer'); return; }
        data.competition_id = chosenSport.id;
      }
      data.team_name = form.team_name.value.trim();
      data.expected_players = parseInt(form.expected_players.value, 10);
      // Mirror teamaantal.js — the form is novalidate, so range-check on the client.
      if (!data.expected_players || data.expected_players < minPlayers || data.expected_players > maxPlayers) {
        showError(`Een team bestaat uit ${minPlayers} tot ${maxPlayers} spelers.`, 'expected_players');
        return;
      }
    }

    if (!data.consent_age) {
      showError('Vink het verplichte leeftijds-vakje aan.');
      return;
    }
    if (!data.consent_reminders) {
      showError('Vink het verplichte vakje aan om herinneringen te kunnen ontvangen.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Versturen…';
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      // Een niet-JSON antwoord (bv. de rate-limiter) is geen netwerkfout.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        resetSubmit();
        // Aanmelden is (inmiddels) dicht: toon de kaart met de uitleg van de server
        // in plaats van een losse foutmelding boven een formulier dat niet meer werkt.
        if (res.status === 403 && json.closed) {
          if (showClosed({ reason: json.closed, message: json.error })) {
            $('reg-closed')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            showError(json.error || 'Aanmelden is op dit moment gesloten.');
          }
          return;
        }
        if (res.status === 429) {
          showError('Te veel pogingen achter elkaar. Wacht een paar minuten en probeer het dan opnieuw.');
          return;
        }
        // P2.5 — server now returns structured `field`. Fall back to string
        // detection only if it's missing (older servers).
        let fieldId = json.field || null;
        if (!fieldId) {
          const err = (json.error || '').toLowerCase();
          if (err.includes('email') || err.includes('e-mail') || err.includes('mail')) fieldId = 'email';
          else if (err.includes('team') && err.includes('naam')) fieldId = 'team_name';
          else if (err.includes('spelers') || err.includes('aantal')) fieldId = 'expected_players';
        }
        showError(json.error || 'Er ging iets mis. Probeer opnieuw.', fieldId);
        return;
      }
      form.style.display = 'none';
      if (successBox) {
        successBox.style.display = 'block';
        successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // A small celebratory burst — the only confetti left outside your followed
      // team, and toned down. (Goals/wins now fire only for the team you follow.)
      window.JVOFX?.confetti({ y: 0.4, count: 50, power: 12 });
      const msg = (path === 'team')
        ? `Je aanmelding én teamaanvraag voor "${data.team_name}" zijn ontvangen. Je krijgt apart bericht zodra het team is beoordeeld.`
        : `Je aanmelding${eventWithArticle ? ' voor ' + eventWithArticle : ''} is ontvangen. Check je inbox voor een bevestiging.`;
      setText($('success-msg'), msg);
    } catch (err) {
      showError('Netwerkfout. Probeer opnieuw.');
      resetSubmit();
    }
  });

  // "Nog iemand aanmelden" — reset form in-place, no page reload
  // (page reload causes a 30-60s wait if the Render free-tier service was sleeping)
  const resetBtn = $('reset-form-btn');
  if (resetBtn && form) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      clearAlert();
      if (successBox) successBox.style.display = 'none';
      form.style.display = 'block';
      resetSubmit();
      // Clear email-validation icon
      if (emailWrap) emailWrap.classList.remove('is-valid', 'is-invalid');
      // Reset path to default (visitor)
      setPath('visitor');
      // form.reset() zet het spelersaantal terug op de HTML-waarde; houd de config aan.
      if (playersInput) playersInput.value = minPlayers;
      // Scroll the form into view (so user immediately sees the empty form)
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Focus the name field
      setTimeout(() => form.full_name?.focus(), 300);
    });
  }

  // --- Evenement-config -------------------------------------------------------
  // Pas ná het koppelen van de formulier-handlers: een trage /api/config mag het
  // formulier nooit zonder submit-handler laten staan.
  try {
    const cfg = await (await fetch('/api/config')).json();
    const ev = cfg.event || {};
    const t = cfg.text || {};      // zelfde teksten als de server-side {{ev.…}}
    const f = cfg.flags || {};     // zelfde vlaggen als de server-side ev-if's
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    // Elke <… data-ev="sleutel"> volgt cfg.text[sleutel]; lege waarden slaan we over.
    document.querySelectorAll('[data-ev]').forEach((el) => {
      const key = el.dataset.ev;
      if (own(t, key)) setText(el, t[key]);
    });
    if (hasText(t.name)) document.title = `${t.name} — Aanmelden`;
    if (hasText(t.withArticle)) eventWithArticle = t.withArticle;

    // Eyebrow: datum (of "Datum volgt") · doelgroep · prijs — zelfde opbouw als de server.
    const eyebrow = $('meta-eyebrow');
    const dateLabel = hasText(t.dateText) ? t.dateText : ev.dateText;
    if (eyebrow && hasText(dateLabel)) {
      eyebrow.textContent = [dateLabel, ev.audience, ev.priceText].filter(hasText).join(' · ');
    }

    // Contact-e-mail (behoud een eventuele ?subject=… achter de mailto).
    if (hasText(cfg.contactEmail)) document.querySelectorAll('.js-contact-mail').forEach((a) => {
      const q = (a.getAttribute('href') || '').split('?')[1];
      a.href = 'mailto:' + cfg.contactEmail + (q ? '?' + q : '');
      a.textContent = cfg.contactEmail;
    });

    // Sponsor: naam/tagline/prijzen lopen al mee via data-ev; hier alleen aan/uit + links + logo.
    const sp = cfg.sponsor;
    if (sp && sp.enabled === false) {
      $('prize-callout')?.remove();
      $('meta-prize-item')?.remove();
    } else if (sp) {
      if (f.prizes === false) $('meta-prize-item')?.remove();
      if (isHttpUrl(sp.url)) document.querySelectorAll('.js-sponsor-url').forEach((a) => {
        a.href = sp.url;
        a.target = '_blank';
        a.rel = 'noopener';
      });
      const logo = document.querySelector('.js-sponsor-logo');
      if (logo && isSafeSrc(sp.logo)) {
        if (logo.getAttribute('src') !== sp.logo) logo.src = sp.logo;
        if (hasText(sp.name)) logo.alt = 'Logo van ' + sp.name;
      }
    }

    // Locatie + adres (t.location is "Locatie volgt" zolang er nog geen locatie is).
    renderLocation(hasText(t.location) ? t.location : ev.location);
    renderAddress(ev.address);

    // P1.11 — spelersaantallen uit de config; alleen geldige waarden overnemen.
    const lo = parseInt(ev.minPlayers, 10);
    const hi = parseInt(ev.maxPlayers, 10);
    if (lo > 0 && hi >= lo) {
      // Niet over een aantal heen schrijven dat de bezoeker al heeft ingevuld.
      const cur = playersInput ? parseInt(playersInput.value, 10) : NaN;
      const untouched = !Number.isFinite(cur) || cur === minPlayers || cur < lo || cur > hi;
      minPlayers = lo;
      maxPlayers = hi;
      if (playersInput) {
        playersInput.min = lo;
        playersInput.max = hi;
        if (untouched) playersInput.value = lo;
      }
    }

    applyRegistration(cfg.registration);
  } catch (e) {
    console.warn('Could not load /api/config', e);
  }

  // --- Sport-hub: sportkeuze --------------------------------------------------
  // Alleen bij meer dan één actieve sport (GET /api/competitions → multi). Met één
  // sport verandert er niets aan dit formulier. Alles via DOM-nodes/textContent.
  const kiezer = $('sport-kiezer');
  const tegels = $('sport-tegels');
  const kaartje = $('sport-kaartje');
  const playersField = playersInput ? playersInput.closest('.field') : null;
  const teamLabel = document.querySelector('label[for="team_name"]');
  const defaultTeamLabel = teamLabel ? teamLabel.textContent : '';
  const defaultTeamPh = teamNameInput ? teamNameInput.placeholder : '';
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const formatLine = (c) => [c.team_label, c.max_teams ? `${c.max_teams} ${c.unit}` : ''].filter(Boolean).join(' · ');

  function renderKaartje(c) {
    if (!kaartje) return;
    kaartje.textContent = '';
    const l = el('div', 'l');
    l.appendChild(el('div', 'k', 'Jouw kaartje'));
    l.appendChild(el('h3', null, c.name));
    const g = el('div', 'g');
    [['Start', c.start_time || '—'], ['Vorm', c.team_label || '—'], ['Plekken', c.max_teams ? `${c.max_teams} ${c.unit}` : '—']].forEach(([k, v]) => {
      const d = el('div'); d.appendChild(el('span', null, k)); d.appendChild(el('b', null, v)); g.appendChild(d);
    });
    l.appendChild(g);
    const r = el('div', 'r');
    const badge = el('span', 'sport-badge');
    if (isIcon(c.icon_small)) { const img = el('img'); img.src = c.icon_small; img.alt = ''; badge.appendChild(img); }
    r.appendChild(badge);
    if (c.team_label) r.appendChild(el('span', null, c.team_label));
    kaartje.appendChild(l);
    kaartje.appendChild(r);
    kaartje.hidden = false;
  }

  function chooseSport(c) {
    chosenSport = c;
    if (tegels) tegels.querySelectorAll('.sport-tegel').forEach((b) => {
      const on = Number(b.dataset.id) === c.id;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    renderKaartje(c);
    // Spelersaantal volgt de sport; bij 1 tegen 1 is er niets te kiezen.
    minPlayers = c.min_players; maxPlayers = c.max_players;
    if (playersInput) {
      playersInput.min = c.min_players; playersInput.max = c.max_players;
      const cur = parseInt(playersInput.value, 10);
      if (!(cur >= c.min_players && cur <= c.max_players)) playersInput.value = c.min_players;
    }
    setText($('player-range'), c.min_players === c.max_players ? String(c.min_players) : `${c.min_players}–${c.max_players}`);
    if (playersField) playersField.hidden = c.max_players === 1;
    if (teamLabel) teamLabel.textContent = c.solo ? 'Jouw naam op het bord' : (c.team_size === 2 ? 'Naam van jullie duo' : defaultTeamLabel);
    if (teamNameInput) teamNameInput.placeholder = c.solo ? 'Bijv. Noor' : defaultTeamPh;
    kiezer?.closest('.field')?.classList.remove('has-error');
    SUBMIT_LABEL = `Meld je aan voor ${String(c.name).toLowerCase()} →`;
    if (submitBtn && !submitBtn.disabled) submitBtn.textContent = SUBMIT_LABEL;
    heroVolgt(c);
  }

  // De hero bij meer dan één sport (stijl Sporthub), zoals het oorspronkelijke ontwerp:
  // een gecentreerde rode ring met álle sporticonen erop en de datum + kop erin,
  // daaronder "Kies je sport" als tegels, de oranje knop met je sport erin en het
  // kaartje (de strook boven het formulier) met je sport. De ring draait heel
  // langzaam; de iconen blijven rechtop en de ballen rollen om hun as (CSS + loops).
  const RING_ICONEN = ['voetbal', 'volleybal', 'basketbal', 'tafeltennis', 'badminton', 'hockey', 'padel', 'hardlopen'];
  const zachtAan = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Bij "databesparing" geen draai-loops (elk ±1,3 MB); de stilstaande iconen blijven.
  const spaarData = !!(navigator.connection && navigator.connection.saveData);
  let heroTegels = null;
  function ringOfSports() {
    const oud = document.querySelector('.hero-intro .sh-ring');
    if (!oud || document.querySelector('.sh-sportring')) return false;
    const ring = el('div', 'sh-sportring');
    ring.setAttribute('aria-hidden', 'true');
    ring.appendChild(el('span', 'sh-sr-cirkel'));
    const baan = el('div', 'sh-sr-baan');
    RING_ICONEN.forEach((naam, i) => {
      // gelijk verdeeld, beginnend bovenaan, met het midden van elk icoon óp de rode cirkel
      const rad = ((-90 + (360 * i) / RING_ICONEN.length) * Math.PI) / 180;
      const plek = el('span', 'sh-sr-plek');
      plek.style.left = `${50 + 38.5 * Math.cos(rad)}%`;
      plek.style.top = `${50 + 38.5 * Math.sin(rad)}%`;
      const img = el('img');
      img.src = `/sport/${naam}.webp`; img.alt = ''; img.decoding = 'async';
      plek.appendChild(img);
      // Ballen rollen rustig om hun eigen as (van links naar rechts): de draai-loop
      // uit de icoonstudio, alleen als die laadt en niet bij "minder beweging".
      if (zachtAan && !spaarData && /^(voetbal|volleybal|basketbal)$/.test(naam)) {
        const loop = new Image();
        loop.onload = () => { img.src = loop.src; };
        loop.src = `/sport/${naam}-draai-klein.webp`;
      }
      baan.appendChild(plek);
    });
    ring.appendChild(baan);
    // datum + kop gaan ín de ring
    const midden = el('div', 'sh-sr-midden');
    const eyebrow = document.getElementById('meta-eyebrow');
    const kop = document.querySelector('.hero-intro h1.h-display');
    if (eyebrow) midden.appendChild(eyebrow);
    if (kop) {
      // De kop gaat over alle sporten samen (geen evenement-specifieke tekst).
      kop.textContent = '';
      kop.append('Eén dag.', document.createElement('br'), 'Alle', document.createElement('br'), 'sporten');
      kop.appendChild(el('span', 'exclaim', '.'));
      midden.appendChild(kop);
    }
    ring.appendChild(midden);
    oud.replaceWith(ring);
    document.querySelector('.hero-intro')?.classList.add('sh-multi');
    return true;
  }

  // "Kies je sport" in de hero: dezelfde keuze als in het formulier (chooseSport).
  function heroKiezer(list) {
    const intro = document.querySelector('.hero-intro.sh-multi');
    if (!intro || intro.querySelector('.sh-kies')) return;
    const wrap = el('div', 'sh-kies');
    const lbl = el('div', 'sh-kies-lbl', 'Kies je sport'); lbl.id = 'sh-kies-lbl';
    wrap.appendChild(lbl);
    heroTegels = el('div', 'sh-kies-tegels');
    heroTegels.setAttribute('role', 'group'); heroTegels.setAttribute('aria-labelledby', 'sh-kies-lbl');
    list.forEach((c) => {
      const b = el('button', 'sh-kies-tegel');
      b.type = 'button'; b.dataset.id = String(c.id); b.setAttribute('aria-pressed', 'false');
      if (isIcon(c.icon_small)) { const img = el('img'); img.src = c.icon_small; img.alt = ''; b.appendChild(img); }
      const t = el('div');
      t.appendChild(el('b', null, c.name));
      t.appendChild(el('span', null, formatLine(c)));
      b.appendChild(t);
      b.addEventListener('click', () => chooseSport(c));
      heroTegels.appendChild(b);
    });
    wrap.appendChild(heroTegels);
    const lead = intro.querySelector('.lead');
    (lead || intro.querySelector('.sh-cta-rij'))?.after(wrap);
    // De knop neemt je sport mee naar het formulier (team-aanmelding).
    const cta = intro.querySelector('.sh-cta');
    if (cta) cta.addEventListener('click', () => { if (chosenSport) setPath('team'); });
  }

  // Knop + strook boven het formulier volgen de gekozen sport.
  function heroVolgt(c) {
    if (heroTegels) heroTegels.querySelectorAll('.sh-kies-tegel').forEach((b) => {
      b.setAttribute('aria-pressed', Number(b.dataset.id) === c.id ? 'true' : 'false');
    });
    const cta = document.querySelector('.hero-intro.sh-multi .sh-cta');
    const tekst = cta && [...cta.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (tekst) tekst.textContent = `Meld je aan voor ${String(c.name).toLowerCase()} `;
    const strook = document.querySelector('.sh-strook');
    if (!strook) return;
    const k = strook.querySelector('.sh-strook-k');
    if (k) k.textContent = 'Jouw kaartje';
    const g = strook.querySelector('.sh-strook-g');
    if (g) {
      let sport = g.querySelector('.sh-strook-sport');
      if (!sport) { sport = el('div', 'sh-strook-sport'); sport.appendChild(el('span', null, 'Sport')); sport.appendChild(el('b')); g.appendChild(sport); }
      sport.querySelector('b').textContent = c.name;
    }
    const img = strook.querySelector('.sh-badge img');
    if (img && isIcon(c.icon_small)) img.src = c.icon_small;
    let t = strook.querySelector('.sh-strook-t');
    if (!t) { t = el('span', 'sh-strook-t'); strook.querySelector('.sh-strook-r')?.appendChild(t); }
    t.textContent = c.team_label || '';
  }

  async function loadSports() {
    if (!kiezer || !tegels) return;
    try {
      const r = await fetch('/api/competitions');
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !j.multi || !Array.isArray(j.competitions)) return;
      sports = j.competitions;
      tegels.textContent = '';
      sports.forEach((c) => {
        const b = el('button', 'sport-tegel');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.dataset.id = String(c.id);
        if (isIcon(c.icon_small)) { const img = el('img'); img.src = c.icon_small; img.alt = ''; b.appendChild(img); }
        const t = el('div');
        t.appendChild(el('b', null, c.name));
        t.appendChild(el('span', null, formatLine(c)));
        b.appendChild(t);
        b.addEventListener('click', () => chooseSport(c));
        tegels.appendChild(b);
      });
      // Pijltjestoetsen binnen de radiogroep.
      tegels.addEventListener('keydown', (e) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
        e.preventDefault();
        const i = Math.max(0, sports.findIndex(s => chosenSport && s.id === chosenSport.id));
        const n = sports[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + sports.length) % sports.length];
        chooseSport(n);
        tegels.querySelector(`[data-id="${n.id}"]`)?.focus();
      });
      tegels.querySelector('.sport-tegel').tabIndex = 0;
      kiezer.hidden = false;
      if (ringOfSports()) { heroKiezer(sports); chooseSport(sports[0]); }
      // De feitjes bovenaan gaan nu over alle sporten samen.
      const feiten = document.querySelectorAll('.sh-feiten > div');
      if (feiten[0]) { setText(feiten[0].querySelector('span'), 'Sporten'); setText(feiten[0].querySelector('b'), sports.length); }
      if (feiten[1]) {
        const lo = Math.min(...sports.map(s => s.min_players)), hi = Math.max(...sports.map(s => s.max_players));
        setText(feiten[1].querySelector('b'), lo === hi ? lo : `${lo}–${hi}`);
      }
    } catch { /* geen sportkeuze → het formulier werkt zoals met één sport */ }
  }
  loadSports();
})();
