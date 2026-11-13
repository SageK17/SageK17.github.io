// Teamlogo-renderer — gedeeld door het live-bord, de zelfservicepagina en de
// admin. Badges bestaan uitsluitend uit server-gevalideerde keuzes (vorm,
// 2 kleuren, icoon, initialen ≤3 tekens); deze renderer bouwt daar veilige
// inline-SVG van (alle vrije tekst ge-escaped). Foto-logo's zijn een <img>
// naar de eigen /team-logo/:id-route (alleen goedgekeurde foto's).
(function () {
  'use strict';
  const COLORS = {
    oranje: '#FF6B1A', goud: '#FFB347', blauw: '#59C3FF', nacht: '#12233B',
    groen: '#6CE3A0', rood: '#E5484D', paars: '#9D7BFF', wit: '#E8F4FF',
    zwart: '#161821', roze: '#FF7BAE',
    // uitbreiding — meer keuze, minder botsingen in de gelijkenis-check
    hemel: '#8FE0FF', limoen: '#A8E85C', turquoise: '#2FD4C4',
    bordeaux: '#7E1D2C', zilver: '#C9D8EA', koraal: '#FF7A5C',
  };
  // Badgevormen in een 64×64-viewBox. `null` = eigen primitief (zie hieronder).
  const SHAPES = {
    schild: 'M32 4 L56 12 V30 C56 46 46 56 32 61 C18 56 8 46 8 30 V12 Z',
    cirkel: null,   // <circle>
    ovaal: null,    // <ellipse>
    ruit: 'M32 4 L59 32 L32 60 L5 32 Z',
    zeshoek: 'M32 5 L55 18.5 L55 45.5 L32 59 L9 45.5 L9 18.5 Z',
    blok: null,     // afgeronde <rect>
  };
  // Iconen in een 24×24-viewBox (gevuld, eenvoudig en herkenbaar op klein formaat).
  const ICONS = {
    bal: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="CUR" stroke-width="2"/><path d="M12 8.6l3.2 2.3-1.2 3.8H10l-1.2-3.8z" fill="CUR"/><path d="M12 2.8v5.8M15.2 10.9l5.5-1.8M14 14.7l3.4 4.7M10 14.7l-3.4 4.7M8.8 10.9L3.3 9.1" stroke="CUR" stroke-width="1.6" fill="none"/>',
    ster: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1z" fill="CUR"/>',
    bliksem: '<path d="M13 2L3 14h8l-1 8L21 9.5h-8.5z" fill="CUR"/>',
    kroon: '<path d="M3 17.5h18L19.5 8l-4.7 4.2L12 4.8 9.2 12.2 4.5 8z" fill="CUR"/><rect x="4" y="18.6" width="16" height="2.4" rx="1" fill="CUR"/>',
    vuur: '<path d="M12 2c1.3 4.4-3.3 5.9-3.3 9.6a3.3 3.3 0 006.6 0c0-1.6-.8-2.7-.8-2.7 2.8 1 3.9 3.6 3.9 5.6a6.4 6.4 0 11-12.8 0C5.6 9.4 10.8 7.4 12 2z" fill="CUR"/>',
    poot: '<circle cx="7" cy="8" r="2.1" fill="CUR"/><circle cx="12" cy="6.4" r="2.1" fill="CUR"/><circle cx="17" cy="8" r="2.1" fill="CUR"/><path d="M12 11c3.4 0 5.8 2.4 5.8 5a3.6 3.6 0 01-3.7 3.6c-.8 0-1.5-.2-2.1-.6-.6.4-1.3.6-2.1.6A3.6 3.6 0 016.2 16c0-2.6 2.4-5 5.8-5z" fill="CUR"/>',
    raket: '<path d="M12 2.5c3.5 1.8 5 5.5 5 9l-2.5 2.5h-5L7 11.5c0-3.5 1.5-7.2 5-9z" fill="CUR"/><circle cx="12" cy="9" r="1.7" fill="BG"/><path d="M7.5 14L5 19l4-1.5M16.5 14L19 19l-4-1.5M12 15v6" stroke="CUR" stroke-width="1.8" fill="none"/>',
    golf: '<path d="M2 9.5c2.5-3.5 5-3.5 7.5 0s5 3.5 7.5 0 3.5-2.5 5-1M2 15.5c2.5-3.5 5-3.5 7.5 0s5 3.5 7.5 0 3.5-2.5 5-1" stroke="CUR" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
    hart: '<path d="M12 21S4 14.8 4 9.3C4 6.4 6.2 4.5 8.6 4.5c1.5 0 2.7.7 3.4 1.9.7-1.2 1.9-1.9 3.4-1.9 2.4 0 4.6 1.9 4.6 4.8C20 14.8 12 21 12 21z" fill="CUR"/>',
    beker: '<path d="M7 3.5h10V8a5 5 0 01-10 0z" fill="CUR"/><path d="M7 5H4.6a1.9 1.9 0 000 3.8H7M17 5h2.4a1.9 1.9 0 010 3.8H17" stroke="CUR" stroke-width="1.7" fill="none"/><path d="M10.6 12.5h2.8V16h-2.8z" fill="CUR"/><rect x="8" y="16" width="8" height="2.6" rx="1" fill="CUR"/>',
    muziek: '<path d="M9.5 18.2V5.5L20 3.5v12.7" stroke="CUR" stroke-width="2" fill="none"/><circle cx="7" cy="18.2" r="2.6" fill="CUR"/><circle cx="17.5" cy="16.2" r="2.6" fill="CUR"/>',
    // uitbreiding
    schoen: '<path d="M2 12.5c0-1.4 1-2.6 2.4-2.9V6.2c0-1 .9-1.7 1.9-1.4l2.2.7c.7.2 1.1.8 1.2 1.5l.4 2.9 9 2.4c1.5.4 2.5 1.7 2.5 3.2V19c0 .8-.6 1.4-1.4 1.4H3.6C2.7 20.4 2 19.7 2 18.8z" fill="CUR"/><path d="M6 20.4v1.6M9.5 20.4v1.6M13 20.4v1.6M16.5 20.4v1.6" stroke="BG" stroke-width="1.3" stroke-linecap="round"/>',
    doel: '<path d="M3 6h18v2.2H3z" fill="CUR"/><path d="M4.4 8.2V19M19.6 8.2V19M4.4 19h15.2" stroke="CUR" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M8 8.2V19M12 8.2V19M16 8.2V19M4.4 11.6h15.2M4.4 15h15.2" stroke="CUR" stroke-width="0.9" fill="none" opacity="0.6"/>',
    fluit: '<path d="M3 11c0-2 1.6-3.6 3.6-3.6H14l4-2.4v10.8L14 13.4h-1.1A6 6 0 1 1 3 11z" fill="CUR"/><circle cx="8.4" cy="13.6" r="1.7" fill="BG"/>',
    diamant: '<path d="M7 3h10l4.5 6L12 21.5 2.5 9z" fill="CUR"/><path d="M2.5 9h19M8 3L6 9l6 12.5M16 3l2 6-6 12.5" stroke="BG" stroke-width="0.9" fill="none" opacity="0.5"/>',
    zon: '<circle cx="12" cy="12" r="4.6" fill="CUR"/><g stroke="CUR" stroke-width="2" stroke-linecap="round"><path d="M12 1.5v3.2M12 19.3v3.2M1.5 12h3.2M19.3 12h3.2M4.2 4.2l2.3 2.3M17.5 17.5l2.3 2.3M19.8 4.2l-2.3 2.3M6.5 17.5l-2.3 2.3"/></g>',
    anker: '<circle cx="12" cy="4.4" r="2.3" fill="none" stroke="CUR" stroke-width="2"/><path d="M12 6.7V21M8.2 10.6h7.6" stroke="CUR" stroke-width="2" stroke-linecap="round"/><path d="M4 13.5a8 8 0 0 0 16 0" fill="none" stroke="CUR" stroke-width="2"/><path d="M4 13.5l-1.8 1.2M4 13.5l2.2.5M20 13.5l1.8 1.2M20 13.5l-2.2.5" stroke="CUR" stroke-width="2" stroke-linecap="round"/>',
    geen: '',
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Relatieve luminantie (sRGB) van een #rrggbb-hex → kiest een AA-veilige
  // ink-kleur op een gekleurde chip (donkere navy op licht, ijs-wit op donker).
  const hexLum = (h) => {
    const n = parseInt(String(h).slice(1), 16);
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };

  // Badge = vorm + icoon + initialen, waarbij icoon en tekst netjes GECENTREERD
  // en PASSEND in elke vorm staan. Per vorm een eigen middelpunt-y; tekst met
  // dominant-baseline central zodat de initialen echt in het hart zitten.
  let badgeUid = 0;   // unieke clip-id per badge (meerdere badges op één pagina)
  function badgeSvg(b, size) {
    const c1 = COLORS[b && b.c1] || COLORS.oranje;
    const c2 = COLORS[b && b.c2] || COLORS.goud;
    const shapeKey = (b && SHAPES.hasOwnProperty(b.shape)) ? b.shape : 'schild';
    const iconKey = (b && ICONS.hasOwnProperty(b.icon)) ? b.icon : 'geen';
    const initials = esc(String((b && b.initials) || '').toUpperCase().slice(0, 3));
    const hasIcon = iconKey !== 'geen';
    const hasText = initials.length > 0;
    const uid = 'jl' + (++badgeUid);

    // De vorm één keer beschrijven → hergebruikt als vulling én als clip-masker,
    // zodat icoon/initialen NOOIT buiten het figuur kunnen vallen.
    let shapeEl, clipEl;
    if (shapeKey === 'cirkel') {
      shapeEl = `<circle cx="32" cy="32" r="28" fill="${c1}" stroke="${c2}" stroke-width="3"/>`;
      clipEl = `<circle cx="32" cy="32" r="25.5"/>`;
    } else if (shapeKey === 'ovaal') {
      shapeEl = `<ellipse cx="32" cy="32" rx="24" ry="29" fill="${c1}" stroke="${c2}" stroke-width="3"/>`;
      clipEl = `<ellipse cx="32" cy="32" rx="21.5" ry="26.5"/>`;
    } else if (shapeKey === 'blok') {
      shapeEl = `<rect x="6" y="6" width="52" height="52" rx="13" fill="${c1}" stroke="${c2}" stroke-width="3"/>`;
      clipEl = `<rect x="8.5" y="8.5" width="47" height="47" rx="11"/>`;
    } else {
      shapeEl = `<path d="${SHAPES[shapeKey]}" fill="${c1}" stroke="${c2}" stroke-width="3" stroke-linejoin="round"/>`;
      // pad-vormen: iets naar binnen geschaald rond het middelpunt = veilige binnenrand
      clipEl = `<path d="${SHAPES[shapeKey]}" transform="translate(32 32) scale(0.9) translate(-32 -32)"/>`;
    }

    // Het schild loopt onderin taps toe → inhoud iets hoger; ruit is smal → compacter.
    const cy = shapeKey === 'schild' ? 30 : 32;
    const tight = shapeKey === 'ruit';
    // Beschikbare breedte op de hoogte waar de TEKST staat. Zit er een icoon boven,
    // dan zakt de tekst naar beneden — precies waar schild/ruit/zeshoek versmallen —
    // dus geldt daar een krappere maat. Empirisch nagemeten met isPointInFill.
    const W_MID = { ruit: 22, ovaal: 34, zeshoek: 38, schild: 38, cirkel: 42, blok: 44 };
    const W_LOW = { ruit: 16, ovaal: 30, zeshoek: 30, schild: 28, cirkel: 38, blok: 44 };
    const innerW = ((hasIcon && hasText) ? W_LOW : W_MID)[shapeKey] || 30;

    // Icoon (24×24) gecentreerd op (32, y) met schaal s.
    const iconAt = (y, s) => hasIcon
      ? `<g transform="translate(${(32 - 12 * s).toFixed(2)} ${(y - 12 * s).toFixed(2)}) scale(${s})">${ICONS[iconKey].replace(/CUR/g, c2).replace(/BG/g, c1)}</g>`
      : '';
    // Lettergrootte volgt de beschikbare breedte. 0.88em per teken = de BREEDSTE
    // hoofdletters (W/M) in Arial Black, niet het gemiddelde — zo passen ook
    // initialen als "WWW" binnen de vorm i.p.v. tegen de clip aan te lopen.
    // Staat er ook een icoon boven de initialen, dan delen ze de hoogte: de letters
    // blijven dan bewust kleiner (icoon is de blikvanger, initialen het bijschrift).
    const fontFor = (len) => {
      const byWidth = innerW / (Math.max(1, len) * 0.88);
      const cap = hasIcon
        ? (len <= 1 ? 16 : len === 2 ? 14 : 12)
        : (len <= 1 ? 25 : len === 2 ? 20 : 15);
      return Math.max(8.5, Math.min(cap, byWidth)).toFixed(1);
    };
    const textAt = (y) => hasText
      ? `<text x="32" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${fontFor(initials.length)}" letter-spacing="0.2" fill="${c2}">${initials}</text>`
      : '';

    let content = '';
    if (hasIcon && hasText) {
      // Icoon en tekst dicht om het hart houden: daar is elke vorm het breedst.
      const s = tight ? 0.56 : 0.76;
      content = iconAt(cy - (tight ? 6 : 8), s) + textAt(cy + (tight ? 7.5 : 10.5));
    } else if (hasIcon) {
      content = iconAt(cy, tight ? 0.92 : 1.18);
    } else if (hasText) {
      content = textAt(cy);
    }
    const clipped = content ? `<clipPath id="${uid}">${clipEl}</clipPath><g clip-path="url(#${uid})">${content}</g>` : '';
    return `<svg viewBox="0 0 64 64" width="${size | 0}" height="${size | 0}" role="img" aria-hidden="true">${shapeEl}${clipped}</svg>`;
  }

  window.jvoLogo = {
    COLORS, SHAPES: Object.keys(SHAPES), ICONS: Object.keys(ICONS), badgeSvg,
    // WC26-kleurkanvas — één bron van waarheid voor teamkleuren op het bord.
    // Geeft de twee gevalideerde badge-hexen + een AA-veilige ink-kleur
    // (luminantie-test) + een lichte tint. Foto/geen-logo → ember/goud-terugval.
    accent(logo) {
      const b = (logo && logo.badge) || {};
      const c1 = COLORS[b.c1] || COLORS.oranje, c2 = COLORS[b.c2] || COLORS.goud;
      return { c1, c2, ink: hexLum(c2) > 0.42 ? '#0A1628' : '#E8F4FF', tint: c2 + '22' };
    },
    // Closed-set-guard: alleen een gevalideerde paletsleutel geeft een hex terug
    // (anders null) → nooit rauwe gebruikersinput in een style-attribuut.
    colorHex(key) { return COLORS[key] || null; },
    // HTML-snippet voor een team-logo uit de payload (of '' als er geen is).
    html(logo, size = 22, cls = '') {
      if (!logo || !logo.kind) return '';
      if (logo.kind === 'badge' && logo.badge) {
        return `<span class="jvo-logo ${esc(cls)}">${badgeSvg(logo.badge, size)}</span>`;
      }
      if (logo.kind === 'photo' && typeof logo.url === 'string' && /^\/team-logo\/\d+/.test(logo.url)) {
        return `<span class="jvo-logo ${esc(cls)}"><img src="${esc(logo.url)}" width="${size | 0}" height="${size | 0}" alt="" loading="lazy" /></span>`;
      }
      return '';
    },
  };
})();
