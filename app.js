// Public registration form
//
// Alle evenement-teksten (naam, datum, locatie, sponsor, aantallen) staan al in de
// HTML: de server vult ze per request in uit het evenement-profiel ({{ev.…}}).
// Dit script houdt een (offline) gecachete pagina alleen nog vers via /api/config
// en regelt het formulier. Regels:
//   • nooit een lege waarde over een door de server gevulde waarde schrijven;
//   • config-/gebruikerswaarden alleen via textContent of DOM-nodes (geen innerHTML);
//   • elk element kan ontbreken (bv. het formulier als aanmelden dicht is) → overal guards.
// Twee aanmeldvormen (evenement-profiel › Aanmelden): "uitgebreid" (#reg-form: naam, e-mail,
// team, toestemmingen) of "alleen stad" (#stad-form: categorie + één veld, zonder e-mail).
// De server tekent er precies één; alles wat de vorm of de woorden bepaalt (label, lijst,
// categorie/sport) komt uit /api/config en /api/competitions, niets staat hier vast.
(async () => {
  const $ = (id) => document.getElementById(id);
  const form = $('reg-form');
  const stadForm = $('stad-form');
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

  // --- De kop van de voordeur ---------------------------------------------------
  // De regels komen uit het evenement-profiel (server: {{ev.heroLine1..3}}). Hier alleen de
  // afwerking: geen dubbele punt als een regel zelf al op een leesteken eindigt, en een
  // kleinere letter als de langste regel niet in de breedte past (elke regel blijft heel).
  const kopEl = () => document.querySelector('.hero-intro h1.h-display');
  // De tekst van één regel, zonder de oranje punt die wij er zelf achter zetten.
  const regelTekst = (r) => { const p = r.querySelector('.exclaim'); const t = r.textContent; return (p ? t.slice(0, t.length - p.textContent.length) : t).trim(); };
  const LEESTEKEN = /[.!?\u2026:;,]$/;
  function kopPunt() {
    const kop = kopEl();
    if (!kop || !kop.classList.contains('sh-kop')) return;
    kop.querySelectorAll('.exclaim').forEach(p => p.remove());
    const regels = [...kop.querySelectorAll('.sh-kop-regel')].filter(r => r.textContent.trim());
    const laatste = regels[regels.length - 1];
    if (!laatste || LEESTEKEN.test(laatste.textContent.trim())) return;
    const p = document.createElement('span'); p.className = 'exclaim'; p.textContent = '.';
    laatste.appendChild(p);
  }
  function pasKop() {
    const kop = kopEl();
    if (!kop) return;
    const regels = kop.querySelectorAll('.sh-kop-regel, .sh-sr-regel');
    if (!regels.length) return;
    kop.style.removeProperty('font-size');
    const ruimte = (kop.closest('.sh-sr-midden') || kop).clientWidth;
    if (!(ruimte > 0)) return;
    for (let i = 0; i < 3; i++) {
      let breedst = 0;
      regels.forEach((r) => { breedst = Math.max(breedst, r.scrollWidth); });
      if (breedst <= ruimte + 1) return;
      const nu = parseFloat(getComputedStyle(kop).fontSize) || 32;
      kop.style.setProperty('font-size', Math.max(12, Math.floor((nu * ruimte / breedst) * 10) / 10) + 'px', 'important');
    }
  }
  // De titel in de kaart "Op het programma" (stijl sporthub): één lang woord mag nooit midden
  // in het woord afbreken. Past het langste woord niet, dan krimpt de letter tot het wel past.
  function pasTitel() {
    if (document.documentElement.dataset.theme !== 'sporthub') return;
    const h = document.querySelector('.tournament-headline h2');
    if (!h) return;
    h.style.removeProperty('font-size');
    const ruimte = h.clientWidth;
    const woord = String(h.textContent || '').trim().split(/\s+/).sort((x, y) => y.length - x.length)[0];
    if (!(ruimte > 0) || !woord) return;
    const maat = document.createElement('span');
    maat.style.cssText = 'position:absolute; visibility:hidden; white-space:nowrap; left:0; top:0;';
    maat.textContent = woord;
    h.appendChild(maat);
    const breed = maat.offsetWidth;
    h.removeChild(maat);
    if (breed <= ruimte) return;
    const nu = parseFloat(getComputedStyle(h).fontSize) || 22;
    h.style.setProperty('font-size', Math.max(13, Math.floor((nu * ruimte / breed) * 10) / 10) + 'px', 'important');
  }
  // De bovenregel bij "alleen stad" (datum · doelgroep · prijs) staat smal naast de bal. Valt
  // een puntje aan het eind van een regel, dan verbergen we het: geen loshangende " ·".
  function pasBovenregel() {
    const delen = document.querySelectorAll('#meta-eyebrow .eb-deel');
    delen.forEach((d, i) => {
      const punt = d.querySelector('.eb-punt');
      if (!punt) return;
      const volgende = delen[i + 1];
      punt.style.visibility = volgende && volgende.offsetTop > d.offsetTop + 2 ? 'hidden' : '';
    });
  }
  const pasAlles = () => { pasKop(); pasTitel(); pasBovenregel(); };
  kopPunt();
  pasAlles();
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(pasAlles); } catch { /* geen font-API */ }
  window.addEventListener('load', pasAlles, { once: true });
  let pasTimer = null;
  window.addEventListener('resize', () => { clearTimeout(pasTimer); pasTimer = setTimeout(pasAlles, 120); });

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
    // Alleen stad: de zin "Vul je … in en je doet mee" klopt niet meer als aanmelden dicht is.
    document.querySelectorAll('.st-lead-open').forEach((z) => { z.textContent = 'Aanmelden kan nu niet.'; });
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
  ['full_name', 'email', 'team_name', 'expected_players', 'stad'].forEach(id => {
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
        if (!chosenSport) { showError(`Kies eerst je ${labels.one}.`, 'sport-kiezer'); return; }
        data.competition_id = chosenSport.id;
      }
      data.team_name = form.team_name.value.trim();
      // 1 tegen 1: het veld is je eigen naam, dus niet de teamnaam-melding van de server.
      if (chosenSport && chosenSport.solo && !data.team_name) { showError('Vul je naam in zoals die op het bord komt.', 'team_name'); return; }
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
      // Team of speler: de server geeft de persoonlijke sleutel mee → je zit direct in Mijn team.
      const solo = !!(path === 'team' && chosenSport && chosenSport.solo);
      const inMijn = path === 'team' && showMijn(json, data, solo);
      const msg = solo
        ? `Je aanmelding voor ${String(chosenSport.name).toLowerCase()} is ontvangen. ${inMijn ? 'De status zie je vanaf nu bij je aanmelding in de app; het besluit krijg je ook per mail.' : 'Je krijgt apart bericht zodra die is beoordeeld.'}`
        : (path === 'team')
        ? `Je aanmelding én teamaanvraag voor "${data.team_name}" zijn ontvangen. ${inMijn ? 'De status zie je vanaf nu in Mijn team; het besluit krijg je ook per mail.' : 'Je krijgt apart bericht zodra het team is beoordeeld.'}`
        : `Je aanmelding${eventWithArticle ? ' voor ' + eventWithArticle : ''} is ontvangen. Check je inbox voor een bevestiging.`;
      setText($('success-msg'), msg);
      setText($('success-heading'), inMijn ? 'Je bent aangemeld.' : SUCCESS_HEADING);
      // Een bezoeker heeft geen Mijn team (geen kaart, geen code, geen link): de ingang
      // daarheen hoort dan niet onder "Tot dan!" te staan, tenzij dit toestel al een sleutel heeft.
      const ingang = $('mijn-ingang');
      if (ingang) ingang.hidden = path !== 'team' && !heeftSleutel();
    } catch (err) {
      showError('Netwerkfout. Probeer opnieuw.');
      resetSubmit();
    }
  });

  // --- Mijn team ---------------------------------------------------------------
  // Na een team-/spelersaanmelding geeft POST /api/register `mijn: { key, team_code }` terug.
  // Het toestel onthoudt de sleutel (zelfde opslag als mijn.js: jvo_mijn), het scherm toont de
  // knop "Open Mijn team" en de code. De sleutel komt nooit als tekst in beeld; hij reist alleen
  // achter de # van de knop mee als dit toestel niets kan bewaren.
  const SUCCESS_HEADING = $('success-heading') ? $('success-heading').textContent : '';
  const isKey = (k) => typeof k === 'string' && k.length < 2000 && /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(k);
  function rememberMijn(key, teamId) {
    try {
      const o = JSON.parse(localStorage.getItem('jvo_mijn') || 'null');
      const keys = o && Array.isArray(o.keys) ? o.keys.filter(x => x && x.k !== key) : [];
      keys.unshift({ k: key, kind: 'own', scope: 'team', since: Date.now(), teams: Number.isInteger(teamId) ? [teamId] : [] });
      localStorage.setItem('jvo_mijn', JSON.stringify({ v: 1, keys: keys.slice(0, 6) }));
      return true;
    } catch { return false; }
  }
  let mijnLink = '';
  function showMijn(json, data, solo) {
    const box = $('success-mijn');
    const m = json && json.mijn;
    if (!box || !m || !isKey(m.key)) return false;
    const teamId = Number.isInteger(json.team_id) ? json.team_id : null;
    const kept = rememberMijn(m.key, teamId);
    if (solo) soloNet = true; else heeftTeamNet = true;
    // De sleutel staat al op dit toestel: dan hoort hij niet óók in het adres (en zo in de
    // browsergeschiedenis). Alleen als bewaren niet lukte reist hij achter de # mee.
    const pad = '/mijn' + (teamId != null ? '?team=' + teamId : '') + (kept ? '' : '#k=' + m.key);
    mijnLink = window.location.origin + '/mijn#k=' + m.key;
    const open = $('success-mijn-open');
    if (open) { open.href = pad; open.textContent = solo ? 'Open mijn aanmelding →' : 'Open Mijn team →'; }
    setText($('success-mijn-lbl'), solo ? 'Jouw code' : 'Jullie teamcode');
    const code = $('success-mijn-code');
    if (code) code.textContent = hasText(m.team_code) ? String(m.team_code) : '';
    const codeBox = code ? code.closest('.mijn-code') : null;
    if (codeBox) codeBox.hidden = !hasText(m.team_code);
    setText($('success-mijn-tip'), solo
      ? 'Maak een schermafbeelding van deze code. Daarmee open je je aanmelding op elk toestel.'
      : 'Maak een schermafbeelding van deze code. Daarmee open je Mijn team op elk toestel, en je teamgenoten kunnen ermee meekijken.');
    setText($('success-mijn-app'), `Tip: ${solo ? 'bij je aanmelding' : 'in Mijn team'} lees je hoe je de app op je beginscherm zet.`);
    const mail = $('success-mijn-mail');
    if (mail) mail.textContent = `We hebben je link ook gemaild naar ${data.email}.` + (kept ? '' : ' Dit toestel kan niets bewaren: gebruik de knop hierboven of de link in je mail.');
    box.hidden = false;
    refreshIngang();
    return true;
  }
  const copyBtn = $('success-mijn-kopieer');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const mail = $('success-mijn-mail');
    if (!mijnLink) return;
    try {
      await navigator.clipboard.writeText(mijnLink);
      if (mail) mail.textContent = 'Je link is gekopieerd. Bewaar hem voor jezelf: wie de link heeft, ziet je aanmelding.';
    } catch {
      if (mail) mail.textContent = 'Kopiëren lukte niet op dit toestel. De link staat ook in je mail.';
    }
  });
  // De voordeur: staat er al een sleutel op dit toestel, dan zeggen we dat ook.
  function heeftSleutel() {
    try { const o = JSON.parse(localStorage.getItem('jvo_mijn') || 'null'); return !!(o && Array.isArray(o.keys) && o.keys.length); } catch { return false; }
  }
  function refreshIngang() {
    if (!heeftSleutel()) return;
    setText($('mijn-ingang-tekst'), 'Je aanmelding staat op dit toestel.');
    // Alleen 1-tegen-1-aanmeldingen op dit toestel: dan heet het geen "team".
    let solo = false;
    try { const o = JSON.parse(localStorage.getItem('jvo_mijn_kaarten') || 'null'); solo = !!(o && Array.isArray(o.cards) && o.cards.length && o.cards.every(c => c && c.solo)); } catch {}
    if (!solo && soloNet) solo = !heeftTeamNet;
    const a = $('mijn-ingang-link');
    if (a) a.textContent = solo ? 'Open mijn aanmelding →' : 'Open Mijn team →';
  }
  let soloNet = false, heeftTeamNet = false;   // wat er in dit bezoek is aangemeld
  refreshIngang();

  // "Nog iemand aanmelden" — reset form in-place, no page reload
  // (page reload causes a 30-60s wait if the Render free-tier service was sleeping)
  const resetBtn = $('reset-form-btn');
  if (resetBtn && form) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      clearAlert();
      if (successBox) successBox.style.display = 'none';
      const mijnBox = $('success-mijn');
      if (mijnBox) mijnBox.hidden = true;
      const ingang = $('mijn-ingang');
      if (ingang) ingang.hidden = false;
      mijnLink = '';
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

  // --- Gedeelde hulpjes voor de keuze (sport of categorie) -----------------------
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  // De woorden voor de keuze: "sport/sporten" bij verschillende sporten, of wat de server
  // geeft als alle competities dezelfde sport zijn (bv. categorie/categorieën).
  let labels = { one: 'sport', many: 'sporten', choose: 'Kies je sport', all: 'Alle sporten' };
  const hoofd = (t) => { const x = String(t || ''); return x.charAt(0).toUpperCase() + x.slice(1); };
  function neemLabels(j) {
    const l = j && j.labels;
    if (!l || typeof l !== 'object') return;
    const uit = {};
    for (const k of ['one', 'many', 'choose', 'all']) uit[k] = hasText(l[k]) ? String(l[k]) : labels[k];
    labels = uit;
  }

  // --- Alleen stad ------------------------------------------------------------
  // Eén veld (vrije tekst, of een keuzelijst als de organisatie een lijst heeft ingevuld) en,
  // bij meer dan één competitie, de categorie als grote knoppen. Geen naam, geen e-mail.
  // De server beslist alles (toelaten of wachtlijst, het volgnummer bij een dubbele naam, de
  // poule); dit scherm toont het antwoord. De sleutel voor Mijn team blijft op het toestel en
  // de teamcode staat groot in beeld: er is geen mail als reserve.
  const STAD_OPSLAG = 'jvo_stad';   // [{ id, name, comp, cat, at }] wat er op dit toestel is aangemeld
  const BASIS_STAD_KNOP = submitBtn && stadForm ? submitBtn.textContent : '';
  let stadComps = [];
  let stadComp = null;
  let stadBezig = false;
  let stadGeladen = false;      // competities binnen (of het ophalen is mislukt): pas dan kan er aangemeld worden
  let stadVraagGehad = false;
  const nieuwePoging = () => {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch { /* geen veilige context */ }
    let x = '';
    try { const a = new Uint8Array(16); crypto.getRandomValues(a); a.forEach(b => { x += b.toString(16).padStart(2, '0'); }); } catch { x = String(Date.now()) + String(Math.random()).slice(2); }
    return 'p-' + x.slice(0, 40);
  };
  let stadPoging = nieuwePoging();
  const stadWoord = () => (hasText(cfgText.cityLabelLower) ? String(cfgText.cityLabelLower) : ((stadForm && stadForm.dataset.labelKlein) || ''));
  const stadVeld = () => $('stad');
  const stadWaarde = () => { const v = stadVeld(); return v ? String(v.value || '').replace(/\s+/g, ' ').trim() : ''; };
  const autoToelaten = () => !cfgSignup || cfgSignup.autoApprove !== false;
  const isVol = (c) => !!(c && autoToelaten() && c.max_teams > 0 && c.approved >= c.max_teams);

  function leesStad() {
    try { const a = JSON.parse(localStorage.getItem(STAD_OPSLAG) || '[]'); return Array.isArray(a) ? a.filter(x => x && Number.isInteger(x.id) && typeof x.name === 'string').slice(0, 12) : []; } catch { return []; }
  }
  function bewaarStad(lijst) {
    try { if (lijst.length) localStorage.setItem(STAD_OPSLAG, JSON.stringify(lijst.slice(0, 12))); else localStorage.removeItem(STAD_OPSLAG); } catch { /* geen opslag */ }
  }
  const opsomming = (namen) => (namen.length <= 1 ? namen.join('') : namen.slice(0, -1).join(', ') + ' en ' + namen[namen.length - 1]);

  // Het veld: keuzelijst (met de lijst van de organisatie) of vrije tekst. De pagina is al in
  // de goede vorm getekend; hier komen de opties erin, en klopt de vorm niet meer met de
  // instellingen (oude kopie van de pagina), dan wisselen we het veld om.
  function bouwStadVeld() {
    const oud = stadVeld();
    if (!oud) return;
    const lijst = cfgSignup && Array.isArray(cfgSignup.cities) ? cfgSignup.cities.filter(hasText).map(String) : null;
    if (!lijst) return;   // geen antwoord van /api/config: laten staan wat de server tekende
    const woord = stadWoord();
    const was = stadWaarde();
    if (lijst.length) {
      let sel = oud;
      if (oud.tagName !== 'SELECT') {
        sel = el('select'); sel.id = 'stad'; sel.name = 'city'; sel.required = true; sel.setAttribute('autocomplete', 'off');
        oud.replaceWith(sel);
        sel.addEventListener('input', () => sel.closest('.field')?.classList.remove('has-error'));
      }
      sel.textContent = '';
      const eerste = el('option', null, `Kies je ${woord}…`); eerste.value = '';
      sel.appendChild(eerste);
      lijst.forEach((naam) => { const o = el('option', null, naam); o.value = naam; sel.appendChild(o); });
      if (was && lijst.includes(was)) sel.value = was;
    } else if (oud.tagName === 'SELECT') {
      const inp = el('input'); inp.type = 'text'; inp.id = 'stad'; inp.name = 'city'; inp.required = true; inp.maxLength = 56;
      inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocapitalize', 'words'); inp.setAttribute('autocorrect', 'off'); inp.spellcheck = false;
      inp.setAttribute('enterkeyhint', 'send'); inp.placeholder = `Typ je ${woord}`;
      oud.replaceWith(inp);
      inp.addEventListener('input', () => inp.closest('.field')?.classList.remove('has-error'));
    }
    const v = stadVeld();
    if (v && !v.dataset.knop) { v.dataset.knop = '1'; v.addEventListener('input', stadKnop); v.addEventListener('change', stadKnop); }
  }

  // De knop zegt wat er gebeurt: "Meld <naam> aan", of de wachtlijst als de categorie vol zit.
  function stadKnop() {
    if (!stadForm) return;
    const naam = stadWaarde();
    const begonnen = !!(stadComp && stadComp.signup_state === 'started');
    const vol = !begonnen && isVol(stadComp);
    const kort = naam && naam.length <= 22 ? naam : '';
    SUBMIT_LABEL = begonnen ? 'Aanmelden kan niet meer' : vol ? (kort ? `Zet ${kort} op de wachtlijst →` : 'Zet me op de wachtlijst →') : (kort ? `Meld ${kort} aan →` : (BASIS_STAD_KNOP || 'Meld je aan →'));
    if (submitBtn && (!submitBtn.disabled || submitBtn.dataset.begonnen)) submitBtn.textContent = SUBMIT_LABEL;
    if (submitBtn) {
      if (begonnen) { submitBtn.disabled = true; submitBtn.dataset.begonnen = '1'; }
      else if (submitBtn.dataset.begonnen) { submitBtn.disabled = false; delete submitBtn.dataset.begonnen; }
    }
    // JVO Smart: hooguit één regel van de server die bij deze keuze helpt. Al begonnen of vol gaat
    // voor (dat bepaalt of en hoe je meedoet), dan de gekozen naam ("je wordt … 2"), dan de rest.
    // Stuurt de server niets mee (helper uit), dan staan hieronder de eigen teksten van deze pagina.
    const G = window.JVO_GIDS, smartEl = $('stad-smart');
    let regel = null;
    if (G && smartEl && stadComp) {
      const s = stadComp.smart && hasText(stadComp.smart.tekst) ? stadComp.smart : null;
      const perNaam = stadComp.smart_stad && typeof stadComp.smart_stad === 'object' && naam && Object.prototype.hasOwnProperty.call(stadComp.smart_stad, naam) ? stadComp.smart_stad[naam] : null;
      regel = s && (s.id === 'begonnen' || s.id === 'vol') ? s : (hasText(perNaam) ? { tekst: String(perNaam), ernst: 'info' } : s);
    }
    if (smartEl) {
      smartEl.hidden = !regel;
      const sleutel = regel ? regel.ernst + '|' + regel.tekst : '';
      if (smartEl.dataset.sleutel !== sleutel) {
        smartEl.dataset.sleutel = sleutel;
        smartEl.className = 'jvs jvs-deur' + (regel ? ' ' + G.ernstKlas(regel.ernst) : '');
        smartEl.innerHTML = regel ? G.mark(true) + '<span><span class="jvs-sr">JVO Smart: </span>' + G.esc(regel.tekst) + '</span>' : '';
      }
    }
    const noot = $('stad-vol');
    if (noot) {
      noot.hidden = !!regel || !(vol || begonnen);
      if (begonnen) noot.textContent = `${stadComps.length > 1 ? `${stadComp.name} is al begonnen.` : 'Het toernooi is al begonnen.'} Aanmelden kan niet meer; vraag het de organisatie.`;
      else if (vol) noot.textContent = `${stadComps.length > 1 ? `${stadComp.name} zit vol.` : 'Alle plekken zijn vergeven.'} Je komt op de wachtlijst en schuift vanzelf door als er een plek vrijkomt.`;
    }
  }
  function plekTekst(c) {
    if (c.signup_state === 'started') return 'Al begonnen';
    if (!autoToelaten() || !(c.max_teams > 0)) return c.team_label || '';
    const vrij = c.max_teams - (Number(c.approved) || 0);
    return vrij <= 0 ? 'Vol · wachtlijst' : `Nog ${vrij} ${vrij === 1 ? 'plek' : 'plekken'}`;
  }
  // `stil` = de lijst wordt alleen opnieuw getekend (niet door de bezoeker gekozen): een
  // melding die er net staat blijft dan staan.
  function kiesStadComp(c, focus, stil) {
    stadComp = c;
    const wrap = $('stad-cats');
    if (wrap) wrap.querySelectorAll('.st-knop').forEach((b) => {
      const on = !!c && Number(b.dataset.id) === c.id;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on || (!c && b === wrap.firstElementChild) ? 0 : -1;
      if (on && focus) b.focus();
    });
    if (!stil) { $('stad-cat')?.classList.remove('has-error'); clearAlert(); }
    stadKnop();
  }
  function tekenStadCats() {
    const vak = $('stad-cat'), wrap = $('stad-cats');
    if (!vak || !wrap) return;
    const meer = stadComps.length > 1;
    vak.hidden = !meer;
    setText($('stad-cat-lbl'), labels.choose);
    wrap.textContent = '';
    if (!meer) { stadComp = stadComps[0] || null; stadKnop(); return; }
    wrap.classList.toggle('een', stadComps.length === 1);
    // De keuze blijft staan als de lijst ververst (na een aanmelding).
    const gekozen = stadComp ? stadComps.find(c => c.id === stadComp.id) || null : null;
    stadComps.forEach((c) => {
      const b = el('button', 'st-knop');
      b.type = 'button'; b.dataset.id = String(c.id);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
      b.appendChild(el('b', null, c.name));
      const plek = plekTekst(c);
      if (plek) b.appendChild(el('span', null, plek));
      b.addEventListener('click', () => kiesStadComp(c));
      wrap.appendChild(b);
    });
    kiesStadComp(gekozen, false, true);
  }
  async function haalStadComps() {
    try {
      const r = await fetch('/api/competitions', { cache: 'no-store' });
      if (!r.ok) return false;
      const j = await r.json();
      if (!j || !Array.isArray(j.competitions)) return false;
      neemLabels(j);
      stadComps = j.competitions.filter(c => c && Number.isInteger(c.id) && hasText(c.name));
      return true;
    } catch { return false; }
  }

  // Wie doet er al mee: per categorie de namen (zelfde gegevens als het live-bord).
  async function tekenWie() {
    const vak = $('stad-wie');
    if (!vak) return;
    try {
      const r = await fetch('/api/hub', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const comps = j && Array.isArray(j.competitions) ? j.competitions.filter(c => c && c.active !== false) : [];
      if (!comps.length) return;
      vak.textContent = '';
      comps.forEach((c) => {
        const namen = (Array.isArray(c.teams) ? c.teams : []).map(t => t && t.name).filter(hasText).map(String).sort((a, b) => a.localeCompare(b, 'nl'));
        const blok = el('div');
        const k = el('div', 'st-wie-k');
        k.appendChild(el('span', null, comps.length > 1 ? c.name : 'Doet mee'));
        k.appendChild(el('i', null, c.max_teams > 0 ? `${namen.length} van ${c.max_teams}` : String(namen.length)));
        blok.appendChild(k);
        if (namen.length) { const ul = el('ul'); namen.forEach(n => ul.appendChild(el('li', null, n))); blok.appendChild(ul); }
        else blok.appendChild(el('p', null, 'Nog niemand. Wees de eerste.'));
        vak.appendChild(blok);
      });
      vak.hidden = false;
    } catch { /* geen lijst: het blok blijft weg */ }
  }

  // "Je hebt hier al … aangemeld": eerst vragen, zodat niemand per ongeluk twee keer aanmeldt.
  function toonAl() {
    const vak = $('stad-al');
    if (!vak || !stadForm) return;
    const lijst = leesStad();
    const klaar = $('stad-klaar');
    const toon = lijst.length > 0 && heeftSleutel() && !stadVraagGehad && !(klaar && !klaar.hidden);
    vak.hidden = !toon;
    stadForm.hidden = toon || !!(klaar && !klaar.hidden);
    if (!toon) return;
    const namen = lijst.map(x => (hasText(x.cat) ? `${x.name} (${x.cat})` : x.name));
    setText($('stad-al-kop'), lijst.length === 1 ? `${lijst[0].name} is al aangemeld.` : 'Je bent al aangemeld.');
    const tekst = $('stad-al-tekst');
    if (tekst) tekst.textContent = `Op dit toestel ${lijst.length === 1 ? 'staat' : 'staan'} ${opsomming(namen)}. Je poule, je wedstrijden en je QR-code vind je in Mijn team.`;
    setText($('stad-al-nog'), `Nog een ${stadWoord() || 'aanmelding'} aanmelden`);
  }
  // Bestaat wat hier bewaard staat nog? (Verwijderd door de organisatie, of een nieuwe editie:
  // dan hoort de vraag hierboven weg.) Alleen bij een duidelijk antwoord van de server.
  async function controleerStad() {
    const lijst = leesStad();
    if (!lijst.length) return;
    let alle = [];
    try { const o = JSON.parse(localStorage.getItem('jvo_mijn') || 'null'); alle = o && Array.isArray(o.keys) ? o.keys.filter(k => k && isKey(k.k)) : []; } catch { return; }
    // Alleen de sleutels die bij deze aanmeldingen horen (een sleutel zonder teamlijst telt mee). Is een
    // aanmelding weg, dan verdwijnt hij hier uit de lijst en vragen we er bij een volgend bezoek niet
    // meer naar; de sleutel zelf ruimt Mijn team op, met uitleg erbij.
    const ids = new Set(lijst.map(x => x.id));
    const keys = alle.filter(k => !Array.isArray(k.teams) || !k.teams.length || k.teams.some(id => ids.has(id)));
    if (!keys.length) { bewaarStad([]); toonAl(); return; }
    const levend = new Set();
    let zeker = true;
    await Promise.all(keys.map(async (k) => {
      try {
        const r = await fetch('/api/mijn', { headers: { Authorization: 'Bearer ' + k.k }, cache: 'no-store' });
        if (r.status === 200) {
          const j = await r.json();
          (j && Array.isArray(j.cards) ? j.cards : []).forEach((c) => { if (c && Number.isInteger(c.team_id) && c.status !== 'rejected' && c.status !== 'revoked') levend.add(c.team_id); });
        } else if (r.status === 401 || r.status === 404) {
          const j = await r.json().catch(() => ({}));
          if (!(j && (j.code === 'key_invalid' || j.code === 'gone'))) zeker = false;
        } else zeker = false;
      } catch { zeker = false; }
    }));
    if (!zeker) return;
    const rest = lijst.filter(x => levend.has(x.id));
    if (rest.length !== lijst.length) { bewaarStad(rest); toonAl(); }
  }

  function stadKlaar(json) {
    const naam = String(json.team_name || '');
    const stad = String(json.city || naam);
    const cat = json.competition && hasText(json.competition.name) && stadComps.length > 1 ? String(json.competition.name) : '';
    const status = json.team_status;
    const kept = rememberMijn(json.mijn.key, json.team_id);
    heeftTeamNet = true;
    if (Number.isInteger(json.team_id)) {
      const lijst = leesStad().filter(x => x.id !== json.team_id);
      lijst.unshift({ id: json.team_id, name: naam, comp: json.competition ? json.competition.id : null, cat, at: Date.now() });
      bewaarStad(lijst);
    }
    const catEl = $('stad-klaar-cat');
    if (catEl) { catEl.textContent = cat; catEl.hidden = !cat; }
    const kop = $('stad-klaar-kop');
    if (kop) kop.textContent = status === 'approved' ? `${naam} doet mee.` : (status === 'waitlist' ? `${naam} staat op de wachtlijst.` : `${naam} is aangemeld.`);
    const sub = $('stad-klaar-sub');
    if (sub) {
      const zinnen = [];
      if (json.numbered) zinnen.push(`Er was al een aanmelding uit ${stad}. Jullie heten daarom ${naam}.`);
      if (status === 'waitlist') zinnen.push('Er is nu geen plek. Komt er een plek vrij, dan schuif je vanzelf door: je ziet het in Mijn team.');
      else if (status !== 'approved') zinnen.push('De organisatie bekijkt je aanmelding. Het besluit zie je in Mijn team.');
      sub.textContent = zinnen.join(' ');
    }
    // De poule: wat de server nu weet. Vier toestanden, of geen blok (wachtlijst).
    const d = json.draw && typeof json.draw === 'object' ? json.draw : null;
    const vak = $('stad-klaar-poule'), pNaam = $('stad-klaar-poule-naam'), mates = $('stad-klaar-mates'), noot = $('stad-klaar-poule-noot');
    if (vak && pNaam && mates && noot) {
      mates.textContent = '';
      vak.hidden = !d;
      if (d && d.state === 'ready' && hasText(d.poule)) {
        pNaam.textContent = `Poule ${d.poule}`;
        const anderen = Array.isArray(d.mates) ? d.mates.filter(hasText).map(String) : [];
        mates.appendChild(el('li', 'ik', naam));
        anderen.forEach(n => mates.appendChild(el('li', null, n)));
        noot.textContent = (anderen.length ? '' : 'Je bent de eerste in deze poule. ') + (d.can_change ? 'De indeling kan nog veranderen tot de start. In Mijn team zie je altijd de laatste stand.' : '');
      } else if (d && d.state === 'few') {
        pNaam.textContent = 'Volgt nog';
        noot.textContent = 'Je poule volgt zodra er genoeg aanmeldingen zijn.';
      } else if (d && d.state === 'outside') {
        pNaam.textContent = 'Nog niet ingedeeld';
        noot.textContent = 'Het schema staat al vast. De organisatie deelt je in; je ziet het in Mijn team.';
      } else if (d) {
        pNaam.textContent = 'Schema volgt';
        noot.textContent = 'De organisatie maakt het schema. Zodra het klaar is, staat je poule in Mijn team.';
      }
    }
    const code = $('stad-klaar-code'), codeVak = $('stad-klaar-codebox');
    if (code) code.textContent = hasText(json.mijn.team_code) ? String(json.mijn.team_code) : '';
    if (codeVak) codeVak.hidden = !hasText(json.mijn.team_code);
    // "Wat nu?" van JVO Smart: de stap van nu uit het antwoord van de server, met de twee
    // volgende klein erbij. Geen gids in het antwoord (helper uit): het scherm is zoals het was.
    klaarGids = json.gids && Number.isInteger(json.team_id) ? { gids: json.gids, id: json.team_id, naam, code: hasText(json.mijn.team_code) ? String(json.mijn.team_code) : '' } : null;
    tekenKlaarGids();
    const open = $('stad-klaar-open');
    // De sleutel staat op dit toestel; alleen als bewaren niet lukte reist hij achter de # mee.
    if (open) open.href = '/mijn' + (Number.isInteger(json.team_id) ? '?team=' + json.team_id : '') + (kept ? '' : '#k=' + json.mijn.key);
    setText($('stad-klaar-nog'), `Nog een ${stadWoord() || 'aanmelding'} aanmelden`);
    const klaar = $('stad-klaar');
    if (klaar) klaar.classList.toggle('wacht', status !== 'approved');   // klokje in plaats van het vinkje
    stadForm.hidden = true;
    const al = $('stad-al'); if (al) al.hidden = true;
    if (klaar) {
      klaar.hidden = false;
      try { klaar.scrollIntoView({ behavior: 'smooth', block: 'center' }); klaar.focus({ preventScroll: true }); } catch { /* geen focus */ }
    }
    stadPoging = nieuwePoging();
    refreshIngang();
    // De tellers op de knoppen en de lijst "wie doet er mee" lopen mee.
    haalStadComps().then((ok) => { if (ok) tekenStadCats(); });
    tekenWie();
  }
  let klaarGids = null;
  function tekenKlaarGids() {
    const G = window.JVO_GIDS, vak = $('stad-klaar-gids'), codeVak = $('stad-klaar-codebox');
    if (!vak) return;
    const html = G && klaarGids ? G.strook(klaarGids.gids, { teamId: klaarGids.id, wie: klaarGids.code || klaarGids.id, straks: 2, kan: { deel: !!klaarGids.code } }) : '';
    if (vak.dataset.html !== html) { vak.dataset.html = html; vak.innerHTML = html; }
    // De strook zegt bij de eerste stap al dat je de code moet bewaren: dan niet twee keer.
    const stap = html ? G.stapVanNu(klaarGids.gids, String(klaarGids.code || klaarGids.id)) : null;
    if (codeVak) codeVak.classList.toggle('met-gids', !!stap && stap.id === 'code');
  }
  function stadOpnieuw() {
    stadVraagGehad = true;
    const klaar = $('stad-klaar'); if (klaar) klaar.hidden = true;
    const al = $('stad-al'); if (al) al.hidden = true;
    stadForm.hidden = false;
    clearAlert();
    const v = stadVeld(); if (v) v.value = '';
    kiesStadComp(stadComps.length > 1 ? null : (stadComps[0] || null));
    resetSubmit();
    try { stadForm.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* geen scroll */ }
    setTimeout(() => { const eerst = (stadComps.length > 1 && $('stad-cats') && $('stad-cats').querySelector('.st-knop')) || stadVeld(); if (eerst) eerst.focus(); }, 300);
  }

  async function stadStart() {
    SUBMIT_LABEL = BASIS_STAD_KNOP || SUBMIT_LABEL;
    bouwStadVeld();
    await haalStadComps();
    stadGeladen = true;
    tekenStadCats();
    toonAl();
    controleerStad();
    tekenWie();
  }

  if (stadForm) {
    // Pijltjestoetsen binnen de radiogroep (zelfde patroon als de sportkeuze).
    $('stad-cats')?.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key) || !stadComps.length) return;
      e.preventDefault();
      // Vanaf de knop waar de focus op staat (er hoeft nog niets gekozen te zijn).
      const knoppen = [...e.currentTarget.querySelectorAll('.st-knop')];
      const hier = knoppen.indexOf(document.activeElement);
      const i = hier >= 0 ? hier : (stadComp ? stadComps.findIndex(c => c.id === stadComp.id) : 0);
      const stap = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      kiesStadComp(stadComps[(i + stap + stadComps.length) % stadComps.length], true);
    });
    $('stad-klaar-gids')?.addEventListener('click', (e) => {
      const G = window.JVO_GIDS;
      if (!G || !klaarGids) return;
      const zeg = (t) => { const el = document.querySelector('#stad-klaar-gids [data-jg-zeg]'); if (el) el.textContent = t; };
      G.klik(e, { opnieuw: tekenKlaarGids, deel: () => G.deelCode(klaarGids.naam, klaarGids.code, zeg) });
    });
    $('stad-al-nog')?.addEventListener('click', stadOpnieuw);
    $('stad-klaar-nog')?.addEventListener('click', stadOpnieuw);
    const v0 = stadVeld();
    if (v0) { v0.dataset.knop = '1'; v0.addEventListener('input', stadKnop); v0.addEventListener('change', stadKnop); }

    stadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (stadBezig) return;
      clearAlert();
      if (!stadGeladen) { showError('De pagina is nog aan het laden. Probeer het zo nog een keer.'); return; }
      if (stadComps.length > 1 && !stadComp) { showError(`${labels.choose}.`, 'stad-cat'); return; }
      const city = stadWaarde();
      const woord = stadWoord();
      if (!city) { showError(stadVeld() && stadVeld().tagName === 'SELECT' ? `Kies je ${woord}.` : `Vul je ${woord} in.`, 'stad'); return; }
      const body = { city, attempt: stadPoging, website: $('website') ? $('website').value : '' };
      if (stadComp) body.competition_id = stadComp.id;
      stadBezig = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Aanmelden…'; }
      try {
        const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          resetSubmit();
          if (res.status === 403 && json.closed) {
            if (showClosed({ reason: json.closed, message: json.error })) $('reg-closed')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else showError(json.error || 'Aanmelden is op dit moment gesloten.');
            return;
          }
          if (res.status === 429) { showError(hasText(json.error) ? json.error : 'Te veel pogingen achter elkaar. Wacht een paar minuten en probeer het dan opnieuw.'); return; }
          const veld = json.field === 'competition_id' ? 'stad-cat' : ((res.status === 400 || res.status === 409) ? 'stad' : null);
          showError(json.error || 'Er ging iets mis. Probeer het opnieuw.', veld);
          // Vol of al bezet: de tellers op de knoppen kloppen dan niet meer.
          if (res.status === 409) haalStadComps().then((ok) => { if (ok) tekenStadCats(); });
          return;
        }
        if (!Number.isInteger(json.team_id) || !json.mijn || !isKey(json.mijn.key)) {
          // Geen team terug (het onzichtbare veld was gevuld, bv. door automatisch invullen).
          resetSubmit();
          const lok = $('website'); if (lok) lok.value = '';
          showError('Dat lukte niet. Probeer het nog een keer.');
          return;
        }
        resetSubmit();
        stadKlaar(json);
      } catch (err) {
        showError('Geen verbinding. Aanmelden lukt alleen met internet; probeer het zo opnieuw.');
        resetSubmit();
      } finally { stadBezig = false; }
    });
  }


  // --- Evenement-config -------------------------------------------------------
  // Pas ná het koppelen van de formulier-handlers: een trage /api/config mag het
  // formulier nooit zonder submit-handler laten staan.
  let cfgText = {};       // cfg.text, ook voor de sportkeuze en de vorm "alleen stad" hieronder
  let cfgSignup = null;   // cfg.signup: { form, cityLabel, cities, cityMulti, autoApprove, autoDraw }
  try {
    const cfg = await (await fetch('/api/config')).json();
    const ev = cfg.event || {};
    const t = cfg.text || {};      // zelfde teksten als de server-side {{ev.…}}
    const f = cfg.flags || {};     // zelfde vlaggen als de server-side ev-if's
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    cfgText = t;
    cfgSignup = cfg.signup && typeof cfg.signup === 'object' ? cfg.signup : null;

    // De pagina is in een andere aanmeldvorm getekend dan de server nu heeft (een oudere kopie
    // uit de cache): één keer verversen, anders vult iemand een formulier in dat niet meer geldt.
    const vorm = cfgSignup && cfgSignup.form;
    if (cfg.registration && cfg.registration.open && ((vorm === 'city' && form && !stadForm) || (vorm === 'full' && stadForm && !form))) {
      let al = false;
      try { al = sessionStorage.getItem('jvo_vorm_ververst') === '1'; sessionStorage.setItem('jvo_vorm_ververst', '1'); } catch { al = true; }
      if (!al && navigator.onLine !== false) { window.location.reload(); return; }
    } else { try { sessionStorage.removeItem('jvo_vorm_ververst'); } catch { /* geen opslag */ } }

    // De kopregels: alleen bijwerken als de tekst echt anders is (de bewegingslaag heeft de
    // woorden dan al in stukjes geknipt; die laten we met rust).
    let kopAnders = false;
    document.querySelectorAll('.sh-kop [data-kop]').forEach((el) => {
      // Een lege regel 2 of 3 mag wél leeg worden (de kop is dan korter geworden); regel 1 nooit.
      if (!own(t, el.dataset.kop)) return;
      const v = String(t[el.dataset.kop] == null ? '' : t[el.dataset.kop]).trim();
      if (!v && (el.dataset.kop === 'heroLine1' || !hasText(t.heroLine1))) return;
      if (regelTekst(el) !== v) { el.textContent = v; kopAnders = true; }
    });
    if (kopAnders) { kopPunt(); pasKop(); }

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
      const delen = [dateLabel, ev.audience, ev.priceText].filter(hasText).map(String);
      // (alleen in de stijl sporthub: in de andere stijl is de regel een flex-rij en zouden de
      // losse stukken niet meer afbreken, waardoor de pagina breder wordt dan het scherm)
      if ((stadForm || document.body.classList.contains('pg-stad')) && document.documentElement.dataset.theme === 'sporthub') {
        // Alleen stad: de regel staat smal naast de bal. Elk deel blijft heel (geen "15-" / "30 jaar").
        eyebrow.textContent = '';
        // Het puntje hoort bij het deel ervóór, zodat een nieuwe regel nooit met een los puntje begint.
        delen.forEach((d, i) => {
          if (i) eyebrow.appendChild(document.createTextNode(' '));
          const deel = document.createElement('span'); deel.className = 'eb-deel'; deel.style.whiteSpace = 'nowrap'; deel.textContent = d;
          if (i < delen.length - 1) { const punt = document.createElement('span'); punt.className = 'eb-punt'; punt.textContent = ' ·'; deel.appendChild(punt); }
          eyebrow.appendChild(deel);
        });
        pasBovenregel();
      } else eyebrow.textContent = delen.join(' · ');
    }
    pasTitel();

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
  // 1 tegen 1: ook het kopje en de uitleg praten dan over "je", niet over een team.
  const teamHelp = $('team-help'), teamEyebrow = $('team-eyebrow');
  const defaultTeamHelp = teamHelp ? teamHelp.textContent : '';
  const defaultTeamEyebrow = teamEyebrow ? teamEyebrow.textContent : '';
  // Bij 1 tegen 1 vullen we "naam op het bord" voor met je eigen naam — alleen in een
  // leeg veld, en alleen zolang je het zelf niet hebt aangepast.
  let autoName = null;
  function soloNaam() {
    if (!teamNameInput || !form || !form.full_name) return;
    const solo = !!(chosenSport && chosenSport.solo);
    const mag = teamNameInput.value === '' || (autoName != null && teamNameInput.value === autoName);
    if (!mag) { autoName = null; return; }
    if (!solo) { if (autoName != null) teamNameInput.value = ''; autoName = null; return; }
    autoName = form.full_name.value.trim().slice(0, 60);
    teamNameInput.value = autoName;
    if (autoName) teamNameInput.closest('.field')?.classList.remove('has-error');
  }
  if (form && form.full_name) form.full_name.addEventListener('input', () => { if (chosenSport && chosenSport.solo) soloNaam(); });
  const isIcon = (u) => /^\/sport\/[a-z]+(-klein)?\.webp$/.test(String(u || ''));
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
    if (teamEyebrow) teamEyebrow.textContent = c.solo ? 'Jouw deelname' : defaultTeamEyebrow;
    if (teamHelp) teamHelp.textContent = c.solo ? 'JVO bekijkt elke aanmelding. Bij goedkeuring krijg je per e-mail je eigen QR-code voor de check-in op locatie.' : defaultTeamHelp;
    soloNaam();
    kiezer?.closest('.field')?.classList.remove('has-error');
    SUBMIT_LABEL = `Meld je aan voor ${String(c.name).toLowerCase()} →`;
    if (submitBtn && !submitBtn.disabled) submitBtn.textContent = SUBMIT_LABEL;
    heroVolgt(c);
  }

  // De hero bij meer dan één sport (stijl Sporthub), zoals het oorspronkelijke ontwerp:
  // een gecentreerde rode ring met álle sporticonen erop en de datum + kop erin,
  // daaronder "Kies je sport" als tegels, de oranje knop met je sport erin en het
  // kaartje (de strook boven het formulier) met je sport. De ring draait heel
  // langzaam; de iconen blijven rechtop en de ballen rollen om hun as (CSS + sh-bal3d.js).
  const RING_ICONEN = ['voetbal', 'volleybal', 'basketbal', 'tafeltennis', 'badminton', 'hockey', 'padel', 'hardlopen'];
  const RING_BALLEN = /^(voetbal|volleybal|basketbal)$/;
  // Ballen rollen rustig om hun eigen as (van links naar rechts): een realtime bol uit
  // sh-bal3d.js, die zelf beslist of het mag (niet bij "minder beweging", databesparing
  // of zonder WebGL — dan blijft het stilstaande plaatje staan). Dat script laadt met
  // `defer`; is het er nog niet, dan wachten we op het laden van de pagina.
  function balDraait(img, naam) {
    const go = () => { if (window.shBal3d) window.shBal3d.maak(img, naam); };
    if (window.shBal3d || document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }
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
      // de draaier draait precies even hard terug als de baan: het icoon blijft rechtop
      const draaier = el('span', 'sh-sr-draaier');
      const img = el('img');
      img.alt = ''; img.decoding = 'async';
      if (RING_BALLEN.test(naam)) {
        // Bal: het stilstaande beeld is de beginstand van de draaiende bol (zelfde bake),
        // zodat de wissel plaatje → canvas niet verspringt; de slagschaduw is een los
        // plaatje eronder (geen filter op een laag die elk beeld verandert).
        draaier.classList.add('sh-sr-bal');
        const schaduw = el('img', 'sh-sr-schaduw');
        schaduw.alt = ''; schaduw.decoding = 'async'; schaduw.src = '/sport/bal/schaduw-ring.webp';
        draaier.appendChild(schaduw);
        img.src = `/sport/bal/${naam}-stil.webp`;
        draaier.appendChild(img);
        balDraait(img, naam);
      } else {
        img.src = `/sport/${naam}.webp`;
        draaier.appendChild(img);
      }
      plek.appendChild(draaier);
      baan.appendChild(plek);
    });
    ring.appendChild(baan);
    // datum + kop gaan ín de ring
    const midden = el('div', 'sh-sr-midden');
    const eyebrow = document.getElementById('meta-eyebrow');
    const kop = document.querySelector('.hero-intro h1.h-display');
    if (eyebrow) midden.appendChild(eyebrow);
    if (kop) {
      // De kop bij meerdere sporten komt uit het evenement-profiel (heroTitleMulti →
      // heroLine1..3): eerst wat /api/config nu zegt, anders wat de server in de pagina zette.
      // Staat er nergens een eigen kop, dan blijft de kop zoals hij is.
      let regels = ['heroLine1', 'heroLine2', 'heroLine3'].map(k => (hasText(cfgText[k]) ? String(cfgText[k]).trim() : '')).filter(Boolean);
      if (!regels.length) regels = [...kop.querySelectorAll('[data-kop]')].map(regelTekst).filter(Boolean);
      if (regels.length) {
        kop.textContent = '';
        // Elke regel is een eigen blok: zo blijft de kop op zijn regels staan, ook als het
        // thema <br> verbergt of de bewegingslaag de woorden in losse stukjes knipt.
        regels.forEach((regel, i, alle) => {
          const r = el('span', 'sh-sr-regel', regel);
          r.style.display = 'block'; r.style.whiteSpace = 'nowrap';   // niet afhankelijk van een (mogelijk oud gecachet) stylesheet
          if (i === alle.length - 1 && !LEESTEKEN.test(regel)) r.appendChild(el('span', 'exclaim', '.'));
          kop.appendChild(r);
        });
      }
      midden.appendChild(kop);
    }
    ring.appendChild(midden);
    oud.replaceWith(ring);
    document.querySelector('.hero-intro')?.classList.add('sh-multi');
    pasKop();
    return true;
  }

  // "Kies je sport" in de hero: dezelfde keuze als in het formulier (chooseSport).
  function heroKiezer(list) {
    const intro = document.querySelector('.hero-intro.sh-multi');
    if (!intro || intro.querySelector('.sh-kies')) return;
    const wrap = el('div', 'sh-kies');
    const lbl = el('div', 'sh-kies-lbl', labels.choose); lbl.id = 'sh-kies-lbl';
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
      if (!sport) { sport = el('div', 'sh-strook-sport'); sport.appendChild(el('span', null, hoofd(labels.one))); sport.appendChild(el('b')); g.appendChild(sport); }
      sport.querySelector('b').textContent = c.name;
    }
    const img = strook.querySelector('.sh-badge img');
    if (img && isIcon(c.icon_small)) img.src = c.icon_small;
    let t = strook.querySelector('.sh-strook-t');
    if (!t) { t = el('span', 'sh-strook-t'); strook.querySelector('.sh-strook-r')?.appendChild(t); }
    t.textContent = c.team_label || '';
  }

  async function loadSports() {
    if (stadForm) { await stadStart(); return; }
    if (!kiezer || !tegels) return;
    try {
      const r = await fetch('/api/competitions');
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !j.multi || !Array.isArray(j.competitions)) return;
      neemLabels(j);
      setText($('sport-kiezer-lbl'), labels.choose);
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
      // Verschillende sporten: de ring met alle sporten en de keuze in de hero. Allemaal dezelfde
      // sport (bv. twee categorieën): de ene grote bal en de kop uit het profiel blijven staan,
      // de keuze staat in het formulier en heet naar de competitie.
      if (!j.same_sport && ringOfSports()) { heroKiezer(sports); chooseSport(sports[0]); }
      // De feitjes bovenaan gaan nu over alle sporten (of categorieën) samen.
      const feiten = document.querySelectorAll('.sh-feiten > div');
      if (feiten[0]) { setText(feiten[0].querySelector('span'), hoofd(labels.many)); setText(feiten[0].querySelector('b'), sports.length); }
      if (feiten[1]) {
        const lo = Math.min(...sports.map(s => s.min_players)), hi = Math.max(...sports.map(s => s.max_players));
        setText(feiten[1].querySelector('b'), lo === hi ? lo : `${lo}–${hi}`);
      }
    } catch { /* geen sportkeuze → het formulier werkt zoals met één sport */ }
  }
  loadSports();
})();
