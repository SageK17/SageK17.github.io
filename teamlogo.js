// Teamlogo-zelfservice: badge bouwen (vaste keuzes → live SVG-preview) of een
// foto uploaden (client-side verkleind naar max 640px, dan als data-URL naar
// de server). Token uit de mail-link (#<jwt>); alles blijft aanpasbaar tot de
// organisatie goedkeurt.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const token = (location.hash || '').replace(/^#/, '');

  const SHAPE_LABEL = { schild: 'Schild', cirkel: 'Cirkel', ovaal: 'Ovaal', ruit: 'Ruit', zeshoek: 'Zeshoek', blok: 'Blok' };
  const ICON_LABEL = { bal: 'Bal', ster: 'Ster', bliksem: 'Bliksem', kroon: 'Kroon', vuur: 'Vuur', poot: 'Poot', raket: 'Raket', golf: 'Golf', hart: 'Hart', beker: 'Beker', muziek: 'Muziek', schoen: 'Schoen', doel: 'Goal', fluit: 'Fluitje', diamant: 'Diamant', zon: 'Zon', anker: 'Anker', geen: 'Geen' };

  let mode = 'badge';
  const badge = { shape: 'schild', c1: 'oranje', c2: 'goud', icon: 'bal', initials: '' };
  let photoDataUrl = null;

  function show(state) {
    for (const s of ['loading', 'error', 'form', 'success']) {
      const el = $('state-' + s);
      if (el) el.style.display = s === state ? '' : 'none';
    }
  }
  function setAlert(msg) {
    const el = $('form-alert');
    if (!el) return;
    el.textContent = msg || '';
    el.className = msg ? 'alert error' : '';
  }
  function preview() {
    const el = $('logo-preview');
    if (!el) return;
    if (mode === 'photo' && photoDataUrl) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.src = photoDataUrl;
      img.width = 72; img.height = 72;
      img.style.borderRadius = '12px';
      img.alt = '';
      el.appendChild(img);
    } else {
      el.innerHTML = window.jvoLogo.badgeSvg(badge, 72);
    }
  }

  // Keuzeknoppen renderen (vorm / kleuren / icoon) uit de renderer-whitelists.
  function renderOpts() {
    const opt = (host, values, get, set, labelOf, swatch) => {
      const el = $(host);
      if (!el) return;
      el.innerHTML = '';
      for (const v of values) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = get() === v ? 'on' : '';
        b.setAttribute('aria-pressed', get() === v ? 'true' : 'false');
        if (swatch) {
          const s = document.createElement('span');
          s.className = 'lg-swatch';
          s.style.background = window.jvoLogo.COLORS[v];
          b.appendChild(s);
          b.title = v;
          b.setAttribute('aria-label', v);
        } else if (host === 'opt-icon' && v !== 'geen') {
          b.innerHTML = window.jvoLogo.badgeSvg({ shape: 'cirkel', c1: 'nacht', c2: badge.c2, icon: v, initials: '' }, 26) + `<span>${labelOf[v]}</span>`;
        } else {
          b.textContent = labelOf ? labelOf[v] : v;
        }
        b.addEventListener('click', () => { set(v); renderOpts(); preview(); });
        el.appendChild(b);
      }
    };
    opt('opt-shape', window.jvoLogo.SHAPES, () => badge.shape, (v) => { badge.shape = v; }, SHAPE_LABEL);
    opt('opt-c1', Object.keys(window.jvoLogo.COLORS), () => badge.c1, (v) => { badge.c1 = v; }, null, true);
    opt('opt-c2', Object.keys(window.jvoLogo.COLORS), () => badge.c2, (v) => { badge.c2 = v; }, null, true);
    opt('opt-icon', window.jvoLogo.ICONS, () => badge.icon, (v) => { badge.icon = v; }, ICON_LABEL);
  }

  function setMode(m) {
    mode = m;
    $('tab-badge').classList.toggle('on', m === 'badge');
    $('tab-photo').classList.toggle('on', m === 'photo');
    $('tab-badge').setAttribute('aria-selected', m === 'badge' ? 'true' : 'false');
    $('tab-photo').setAttribute('aria-selected', m === 'photo' ? 'true' : 'false');
    $('pane-badge').style.display = m === 'badge' ? '' : 'none';
    $('pane-photo').style.display = m === 'photo' ? '' : 'none';
    preview();
  }

  // Foto: client-side verkleinen (max 640px, JPEG ~0.85) — houdt de upload
  // klein en gooit en passant EXIF-metadata weg.
  function handleFile(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setAlert('Kies een JPG-, PNG- of WebP-afbeelding.');
      return;
    }
    const img = new Image();
    img.onload = () => {
      const max = 640;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      photoDataUrl = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      const prev = $('photo-prev');
      prev.src = photoDataUrl;
      prev.style.display = 'block';
      setAlert('');
      preview();
    };
    img.onerror = () => setAlert('Deze afbeelding kon niet worden gelezen.');
    img.src = URL.createObjectURL(file);
  }

  // Statusbanner — maakt glashelder of het logo al is ingediend (en of het
  // wacht / goedgekeurd / afgekeurd is), met een duidelijke kop + icoon.
  function renderStatus(status) {
    const el = $('logo-status');
    if (!el) return;
    if (!status) { el.innerHTML = ''; return; }
    const CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    const WARN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>';
    const map = {
      pending: ['pending', CHECK, 'Ingediend — wacht op goedkeuring', 'Jullie logo staat klaar bij de organisatie; je hoeft verder niets te doen. Iets aanpassen mag altijd — de nieuwste versie telt.'],
      approved: ['approved', CHECK, 'Goedgekeurd — staat op het bord', 'Jullie logo staat live op het scorebord. Een nieuwe versie insturen kan; die wacht dan weer op goedkeuring.'],
      rejected: ['rejected', WARN, 'Afgekeurd', 'Jullie vorige logo is afgekeurd door de organisatie. Maak gerust een nieuwe en stuur opnieuw in.'],
    };
    const m = map[status];
    if (!m) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="lg-status ${m[0]}">
      <div style="display:flex; align-items:center; gap:8px; font-weight:700;">${m[1]}<span>${m[2]}</span></div>
      <div style="margin-top:5px; font-size:13px; opacity:.9;">${m[3]}</div>
    </div>`;
  }

  async function boot() {
    if (!token) {
      $('error-msg').textContent = 'Deze pagina werkt alleen via de persoonlijke link uit je mail.';
      show('error');
      return;
    }
    try {
      const r = await fetch('/api/team/logo/validate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const j = await r.json();
      if (!r.ok) {
        $('error-msg').textContent = j.error || 'Deze link werkt niet (meer).';
        show('error');
        return;
      }
      $('team-name').textContent = j.team_name;
      renderStatus(j.status);
      if (j.logo && j.logo.kind === 'badge' && j.logo.badge) {
        Object.assign(badge, j.logo.badge);
        if ($('initials')) $('initials').value = badge.initials || '';
      }
      renderOpts();
      preview();
      show('form');
    } catch {
      $('error-msg').textContent = 'Geen verbinding — probeer het zo opnieuw.';
      show('error');
    }
  }

  $('tab-badge')?.addEventListener('click', () => setMode('badge'));
  $('tab-photo')?.addEventListener('click', () => setMode('photo'));
  $('initials')?.addEventListener('input', (e) => {
    badge.initials = e.target.value.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase().slice(0, 3);
    e.target.value = badge.initials;
    preview();
  });
  $('photo-drop')?.addEventListener('click', () => $('photo-file').click());
  $('photo-drop')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('photo-file').click(); } });
  $('photo-file')?.addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0]));

  $('submit-btn')?.addEventListener('click', async () => {
    setAlert('');
    const body = { token };
    if (mode === 'badge') {
      if (badge.c1 === badge.c2) { setAlert('Kies twee verschillende kleuren.'); return; }
      body.kind = 'badge';
      body.badge = badge;
    } else {
      if (!photoDataUrl) { setAlert('Kies eerst een foto of afbeelding.'); return; }
      body.kind = 'photo';
      body.image = photoDataUrl;
    }
    const btn = $('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Insturen…';
    try {
      const r = await fetch('/api/team/logo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) { setAlert(j.error || 'Insturen mislukt — probeer opnieuw.'); return; }
      show('success');
    } catch {
      setAlert('Netwerkfout — probeer het zo opnieuw.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Logo insturen ter goedkeuring →';
    }
  });

  boot();

  // Contact-e-mail: de server vult 'm al in de pagina; dit houdt een offline-
  // gecachete pagina vers. Nooit een lege waarde over de server-tekst heen schrijven.
  fetch('/api/config').then(r => r.json()).then(cfg => {
    if (!cfg || !cfg.contactEmail) return;
    document.querySelectorAll('.js-contact-mail').forEach(a => { a.href = 'mailto:' + cfg.contactEmail; a.textContent = cfg.contactEmail; });
  }).catch(() => {});
})();
