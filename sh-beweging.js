/* ================================================================
   STIJL "SPORTHUB" — beweging
   ----------------------------------------------------------------
   Alleen geladen in de stijl 'sporthub' (via een
   <!--ev-if:themeSporthub--> blok in de pagina); de stijl
   'schemering' ziet dit bestand nooit. Hoort bij de laatste
   secties van thema-sporthub.css en thema-sporthub-bord.css.

   Eén bewegingstaal: dingen komen OMHOOG en komen tot rust
   (kop, kaartjes), de rode ring TEKENT zichzelf en draait daarna
   heel traag, het sport-icoon VALT met gewicht en blijft zweven.

   Regels waar alles hier aan voldoet:
   - Minder beweging (prefers-reduced-motion) → dit bestand doet
     niets; de pagina staat er al compleet.
   - De pagina is compleet in rust. Wat verborgen begint, verbergt
     de CSS pas zodra hier een klasse is gezet — en alléén voor een
     animatie die meteen loopt. Valt dit script weg of vuurt een
     observer nooit, dan blijft alles gewoon zichtbaar.
   - Alleen transform/opacity (en de boog van de ring) bewegen.
   ================================================================ */
(function () {
  'use strict';

  var html = document.documentElement;
  if (html.getAttribute('data-theme') !== 'sporthub') return;

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.matches) return;

  var body = document.body;
  if (!body) return;
  var BORD = body.classList.contains('tn');
  var TV = BORD && (body.classList.contains('screen') || /[?&]screen=1\b/.test(location.search));
  var AANMELDEN = body.classList.contains('pg-aanmelden');

  // ---------------------------------------------------------------- start
  // Het laadscherm (jvo-loader.js) speelt 1× per sessie ±3,5 s. De
  // openingsreeks wacht tot het weggaat, anders speelt hij er onzichtbaar
  // achter. Zonder laadscherm start hij meteen.
  function naLaadscherm(fn) {
    var s = document.getElementById('jvo-splash');
    if (!s) { fn(); return; }
    var klaar = false, mo;
    function go() { if (klaar) return; klaar = true; if (mo) mo.disconnect(); fn(); }
    mo = new MutationObserver(function () {
      if (!s.isConnected || s.classList.contains('hide')) go();
    });
    mo.observe(s, { attributes: true, attributeFilter: ['class'] });
    mo.observe(s.parentNode || body, { childList: true });
    setTimeout(go, 7000);   // vangnet
  }

  // ---------------------------------------------------------------- kop
  // De kop in woorden knippen (elk woord inline-block, zodat de regels precies
  // zo breken als zonder dit script) en elk woord zijn regelnummer geven: de
  // regels komen dan na elkaar omhoog. Het leesteken achter het laatste woord
  // blijft aan dat woord vast (nooit alleen op een nieuwe regel).
  function knipKop(h1) {
    if (!h1 || h1.getAttribute('data-sh-geknipt')) return;
    h1.setAttribute('data-sh-geknipt', '1');
    var tekst = [];
    (function loop(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) tekst.push(c);
        else if (c.nodeType === 1 && !c.classList.contains('exclaim') && c.tagName !== 'BR') loop(c);
      }
    })(h1);
    var woorden = [];
    tekst.forEach(function (t) {
      var delen = t.nodeValue.split(/(\s+)/);
      if (delen.length === 1 && !delen[0]) return;
      var frag = document.createDocumentFragment();
      delen.forEach(function (d) {
        if (!d) return;
        if (/^\s+$/.test(d)) { frag.appendChild(document.createTextNode(d)); return; }
        var w = document.createElement('span');
        w.className = 'sh-w';
        w.textContent = d;
        frag.appendChild(w);
        woorden.push(w);
      });
      t.parentNode.replaceChild(frag, t);
    });
    // leesteken (.exclaim) direct na een woord → in dat woord
    h1.querySelectorAll('.exclaim').forEach(function (p) {
      var v = p.previousSibling;
      if (v && v.nodeType === 1 && v.classList.contains('sh-w')) v.appendChild(p);
    });
    regelNummers(h1, woorden);
    return woorden;
  }
  function regelNummers(h1, woorden) {
    var top = null, r = -1;
    woorden.forEach(function (w) {
      var t = Math.round(w.offsetTop);
      if (top === null || Math.abs(t - top) > 4) { r++; top = t; }
      w.style.setProperty('--sh-r', r);
    });
    h1.style.setProperty('--sh-regels', Math.max(1, r + 1));
  }

  // ---------------------------------------------------------------- feiten tellen
  // "16" en "5–8" tellen één keer op vanaf 0, zodra hun vakje in beeld komt
  // (tot dan is het vakje nog onzichtbaar, zie sh-knop-op). Het doel lezen we
  // pas dán, zodat een verse waarde van app.js (config) meetelt. Schrijft iets
  // anders tussendoor in het vakje, dan stoppen we meteen en laten dat staan.
  function telOp(el, vertraging) {
    setTimeout(function () {
      var doel = (el.textContent || '').trim();
      if (!/^\d{1,3}(\s*[–-]\s*\d{1,3})?$/.test(doel)) return;
      var getallen = doel.match(/\d+/g).map(Number);
      var stukken = doel.split(/\d+/);
      var schrijf = function (f) {
        var s = '';
        for (var i = 0; i < getallen.length; i++) s += stukken[i] + Math.round(getallen[i] * f);
        return s + stukken[getallen.length];
      };
      var laatst = schrijf(0);
      el.textContent = laatst;
      var t0 = performance.now(), duur = 900;
      (function stap(nu) {
        if (el.textContent !== laatst) return;   // iemand anders schreef hier
        var t = Math.min(1, (nu - t0) / duur);
        laatst = t < 1 ? schrijf(1 - Math.pow(1 - t, 3)) : doel;
        el.textContent = laatst;
        if (t < 1) requestAnimationFrame(stap);
      })(t0);
      // vangnet (bv. rAF staat stil in een achtergrondtab): daarna staat er hoe dan ook het doel
      setTimeout(function () { if (el.textContent === laatst && laatst !== doel) el.textContent = doel; }, 1500);
    }, vertraging);
  }

  // ---------------------------------------------------------------- tonen bij scrollen
  // Kaartjes en blokken schuiven omhoog en kantelen terug naar vlak. In rust
  // zijn ze zichtbaar; de klasse sh-toon start de animatie (die zelf van
  // onzichtbaar begint). Wat bij de start al in beeld staat, komt mee in de
  // openingsreeks; de rest start net vóór het in beeld schuift.
  function toonBijScrollen(sel, basisVertraging) {
    var els = Array.prototype.slice.call(document.querySelectorAll(sel));
    if (!els.length) return;
    var vh = window.innerHeight || html.clientHeight;
    var inBeeld = 0;
    function kantel(el, i) { el.style.setProperty('--sh-kantel', (i % 2 ? 1.2 : -1.2) + 'deg'); }
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        e.target.style.setProperty('--sh-d', (n++ * 80) + 'ms');
        e.target.classList.add('sh-toon');
      });
    }, { rootMargin: '0px 0px 10% 0px', threshold: 0 }) : null;
    els.forEach(function (el, i) {
      kantel(el, i);
      // de adresregel hoort vast aan de locatietegel erboven: samen, zonder kanteling
      var maat = el.nextElementSibling;
      if (maat && maat.classList.contains('meta-address') && el.classList.contains('event-meta')) {
        el.style.setProperty('--sh-kantel', '0deg');
        maat.style.setProperty('--sh-kantel', '0deg');
        new MutationObserver(function () {
          if (el.classList.contains('sh-toon') && !maat.classList.contains('sh-toon')) {
            maat.style.setProperty('--sh-d', el.style.getPropertyValue('--sh-d'));
            maat.classList.add('sh-toon');
          }
        }).observe(el, { attributes: true, attributeFilter: ['class'] });
      }
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        el.style.setProperty('--sh-d', (basisVertraging + inBeeld++ * 90) + 'ms');
        el.classList.add('sh-toon');
      } else if (io) io.observe(el);
      // zonder observer: niets doen — het blok staat er al
    });
  }

  // ---------------------------------------------------------------- 3D-lus
  // Het grote sport-icoon krijgt de draaiende lus (/sport/<naam>-draai.webp)
  // zodra die echt geladen is; ontbreekt hij (nog), dan blijft het stilstaande
  // icoon gewoon staan. Niet bij databesparing.
  function draaiLus(img) {
    var sport = html.getAttribute('data-sport');
    if (!img || !sport || !/^[a-z0-9-]+$/.test(sport)) return;
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
    var lus = new Image();
    lus.decoding = 'async';
    lus.onload = function () {
      if (!lus.naturalWidth || (mq && mq.matches)) return;
      img.src = lus.src;
      img.classList.add('sh-draait');
    };
    lus.src = '/sport/' + sport + '-draai.webp';
  }

  // ---------------------------------------------------------------- veldlijnen
  // Sfeer op het blauw: de lijnen van een speelveld (buitenlijn, middenlijn,
  // middencirkel, twee doelgebieden), heel vaag, die zich traag tekenen en
  // daarna langzaam meedrijven. Eén vaste laag achter de inhoud; staat stil
  // als het tabblad niet zichtbaar is.
  function veldlijnen() {
    if (TV || document.querySelector('.sh-veld')) return;
    var breed = (window.innerWidth || 0) > (window.innerHeight || 0);
    var W = breed ? 1000 : 600, H = breed ? 600 : 1000;
    var d = [];
    var m = 40;
    d.push('M' + m + ' ' + m + 'H' + (W - m) + 'V' + (H - m) + 'H' + m + 'Z');
    if (breed) {
      d.push('M' + W / 2 + ' ' + m + 'V' + (H - m));
      d.push('M' + m + ' ' + (H / 2 - 130) + 'H' + (m + 120) + 'V' + (H / 2 + 130) + 'H' + m);
      d.push('M' + (W - m) + ' ' + (H / 2 - 130) + 'H' + (W - m - 120) + 'V' + (H / 2 + 130) + 'H' + (W - m));
    } else {
      d.push('M' + m + ' ' + H / 2 + 'H' + (W - m));
      d.push('M' + (W / 2 - 130) + ' ' + m + 'V' + (m + 120) + 'H' + (W / 2 + 130) + 'V' + m);
      d.push('M' + (W / 2 - 130) + ' ' + (H - m) + 'V' + (H - m - 120) + 'H' + (W / 2 + 130) + 'V' + (H - m));
    }
    var r = 95, cx = W / 2, cy = H / 2;
    d.push('M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0');
    var NS = 'http://www.w3.org/2000/svg';
    var laag = document.createElement('div');
    laag.className = 'sh-veld';
    laag.setAttribute('aria-hidden', 'true');
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('focusable', 'false');
    d.forEach(function (p, i) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', p);
      path.setAttribute('pathLength', '1');
      path.style.setProperty('--sh-i', i);
      svg.appendChild(path);
    });
    laag.appendChild(svg);
    body.insertBefore(laag, body.firstChild);
    document.addEventListener('visibilitychange', function () {
      laag.classList.toggle('sh-stil', document.hidden);
    });
  }

  // ---------------------------------------------------------------- het live-bord
  function bord() {
    // a) een nieuwe score: het cijfer rolt erin (toernooi.js zet .flip op
    //    precies het cijfer dat omhoog ging) en het kaartje licht kort op.
    var live = document.getElementById('tn-live');
    if (live) {
      var gezien = typeof WeakSet === 'function' ? new WeakSet() : null;
      var raak = function () {
        live.querySelectorAll('.tn-sb-score b.flip').forEach(function (b) {
          if (gezien) { if (gezien.has(b)) return; gezien.add(b); }
          var kaart = b.closest('.tn-sb');
          if (!kaart) return;
          kaart.classList.remove('sh-raak'); void kaart.offsetWidth; kaart.classList.add('sh-raak');
          var oud = kaart.querySelector('.sh-flits');
          if (oud) oud.remove();
          var f = document.createElement('span');
          f.className = 'sh-flits';
          f.setAttribute('aria-hidden', 'true');
          kaart.appendChild(f);
          setTimeout(function () { if (f.parentNode) f.remove(); }, 1200);
        });
      };
      new MutationObserver(raak).observe(live, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // b) "straks"-kaartjes die er NIEUW bij komen schuiven erin. Het bord wordt
    //    bij elke update opnieuw opgebouwd; we onthouden welke wedstrijden er al
    //    stonden, zodat alleen echt nieuwe kaartjes bewegen. De eerste opbouw
    //    en een tabwissel heeft toernooi.html al (pane-in).
    var inhoud = document.getElementById('tn-content');
    if (inhoud) {
      var bekend = null;
      var sleutel = function (el) { return (el.textContent || '').replace(/\s+/g, ' ').slice(0, 160); };
      var vorigePane = null;
      var scan = function () {
        if (!inhoud.querySelector('.tn-pane')) return;   // nog geen bord: niets te vergelijken
        var nu = new Set();
        inhoud.querySelectorAll('.tn-up').forEach(function (el) {
          var k = sleutel(el);
          nu.add(k);
          // alleen in de zichtbare tab, en niet tijdens een tabwissel (die beweegt al)
          if (bekend && !bekend.has(k) && el.closest('.tn-pane.active, .tn-pane.screen-on') && !el.closest('.pane-in')) {
            el.classList.add('sh-nieuw');
          }
        });
        bekend = nu;
        // richting van een tabwissel: naar rechts schuift de nieuwe pagina van rechts in
        var actief = inhoud.querySelector('.tn-pane.active');
        if (actief && actief !== vorigePane) {
          var panes = Array.prototype.slice.call(inhoud.querySelectorAll('.tn-pane'));
          var oudI = vorigePane ? panes.findIndex(function (p) { return p.dataset.pane === vorigePane.dataset.pane; }) : -1;
          var nieuwI = panes.indexOf(actief);
          if (oudI >= 0 && nieuwI >= 0) inhoud.style.setProperty('--sh-richting', nieuwI < oudI ? -1 : 1);
          vorigePane = actief;
        }
      };
      new MutationObserver(scan).observe(inhoud, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      scan();
    }
  }

  // ---------------------------------------------------------------- aan
  function start() {
    var kop = AANMELDEN ? document.querySelector('.hero-intro h1.h-display')
      : BORD ? null
      : document.querySelector('.shell h1.h-display');
    if (kop) knipKop(kop);

    html.classList.add('sh-beweeg');

    // regelnummers opnieuw als het lettertype later binnenkomt (andere breedtes)
    if (kop && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        var w = kop.querySelectorAll('.sh-w');
        if (w.length) regelNummers(kop, Array.prototype.slice.call(w));
      });
    }

    if (AANMELDEN) {
      document.querySelectorAll('.sh-feiten b').forEach(function (b, i) { telOp(b, 620 + i * 70); });
      draaiLus(document.querySelector('.sh-bal'));
      toonBijScrollen('#form-card, .tournament-hero, .prize-callout, .activity-cat, .meet-callout, .event-meta', 760);
    } else if (!BORD) {
      toonBijScrollen('.card, .rules-block, .rules-callout, .fb-card, .shell > details.help, .privacy-page .meta-block', 520);
    }
    if (BORD) bord();
    veldlijnen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { naLaadscherm(start); });
  } else {
    naLaadscherm(start);
  }
})();
