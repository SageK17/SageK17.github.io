// JVO-laadscherm — de duif vliegt in en landt exact op zijn plek in het logo,
// completeert het, de rode ring tekent zich en de tagline verschijnt. Daarna
// vaagt het scherm weg en verschijnt de pagina. Zelfstandig, één keer per
// browsersessie, respecteert prefers-reduced-motion, en de animatie start pas
// NA de volledige load (op een vrije main-thread → vloeiend, geen hapering).
(function () {
  'use strict';
  try { if (sessionStorage.getItem('jvo_splashed')) return; } catch (e) {}
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}

  // Gevectoriseerde JVO-duif (getraced uit het echte logo) + landingspositie:
  // de duif hoort in het logo op x63 y189 (81×40) van 447 → percentages hieronder.
  var DOVE = 'M71.88 0.38 L75.13 0.63 L77.19 1.13 L78.06 1.88 L77.75 2.88 L76.25 4.13 L74.75 5.63 L73.25 7.38 L71.75 9.38 L70.25 11.63 L68.38 13.94 L66.13 16.31 L63.50 18.75 L60.50 21.25 L58.69 23.38 L58.06 25.13 L58.63 26.50 L60.38 27.50 L61.81 28.44 L62.94 29.31 L63.75 30.13 L64.25 30.88 L64.00 31.50 L63.00 32.00 L61.25 32.38 L58.75 32.63 L56.06 33.19 L53.19 34.06 L50.13 35.25 L46.88 36.75 L43.63 37.75 L40.38 38.25 L37.13 38.25 L33.88 37.75 L30.44 36.81 L26.81 35.44 L23.00 33.63 L19.00 31.38 L15.81 29.69 L13.44 28.56 L11.88 28.00 L11.13 28.00 L10.88 27.56 L11.13 26.69 L11.88 25.38 L13.13 23.63 L13.13 21.31 L11.88 18.44 L9.38 15.00 L5.63 11.00 L3.81 8.06 L3.94 6.19 L6.00 5.38 L10.00 5.63 L14.44 6.75 L19.31 8.75 L24.63 11.63 L30.38 15.38 L35.63 17.19 L40.38 17.06 L44.63 15.00 L48.38 11.00 L51.94 7.75 L55.31 5.25 L58.50 3.50 L61.50 2.50 L63.81 1.69 L65.44 1.06 L66.38 0.63 L66.63 0.38 L67.63 0.25 L69.38 0.25 Z';

  var css =
    '#jvo-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;' +
      'background:radial-gradient(circle at 50% 42%, #18294c, #0A1628 68%);opacity:1;transition:opacity .6s ease;}' +
    '#jvo-splash.hide{opacity:0;pointer-events:none;}' +
    '#jvo-splash .st{position:relative;width:190px;height:190px;display:flex;align-items:center;justify-content:center;}' +
    '#jvo-splash .em{width:150px;height:150px;border-radius:50%;overflow:hidden;background:url(/jvo-logo-nodove.jpg) center/cover;' +
      'opacity:0;box-shadow:0 12px 44px rgba(0,0,0,.55);}' +
    '#jvo-splash .rg{position:absolute;inset:0;transform:rotate(-90deg);}' +
    '#jvo-splash .rg circle{fill:none;stroke:#C4382E;stroke-width:3.2;stroke-linecap:round;stroke-dasharray:545;stroke-dashoffset:545;}' +
    '#jvo-splash .dv{position:absolute;left:21.6%;top:43.9%;width:14.3%;opacity:0;will-change:transform,opacity;}' +
    '#jvo-splash .dv svg{width:100%;height:auto;display:block;will-change:transform;transform-origin:50% 62%;}' +
    '#jvo-splash .tg{font-family:"Geist Mono",ui-monospace,monospace;font-size:11.5px;letter-spacing:.3em;color:#FFCD7A;text-transform:uppercase;opacity:0;}' +
    '@keyframes jvoEm{to{opacity:1;}}' +
    '@keyframes jvoDraw{to{stroke-dashoffset:0;}}' +
    '@keyframes jvoFly{0%{opacity:0;transform:translate3d(-230px,-72px,0) scale(2.9) rotate(-16deg);}14%{opacity:1;}100%{opacity:1;transform:translate3d(0,0,0) scale(1) rotate(0);}}' +
    '@keyframes jvoFlap{0%{transform:scaleY(.7);}9%{transform:scaleY(1.08);}19%{transform:scaleY(.66);}29%{transform:scaleY(1.07);}40%{transform:scaleY(.7);}52%{transform:scaleY(1.05);}65%{transform:scaleY(.78);}79%{transform:scaleY(1.03);}90%{transform:scaleY(.9);}100%{transform:scaleY(1);}}' +
    '@keyframes jvoTag{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}' +
    '#jvo-splash.go .em{animation:jvoEm .5s .15s forwards;}' +
    '#jvo-splash.go .rg circle{animation:jvoDraw 1.05s 1.05s cubic-bezier(.4,0,.2,1) forwards;}' +
    '#jvo-splash.go .dv{animation:jvoFly 1.9s .3s cubic-bezier(.16,.62,.24,1) both;}' +
    '#jvo-splash.go .dv svg{animation:jvoFlap 1.9s .3s ease-in-out 1 both;}' +
    '#jvo-splash.go .tg{animation:jvoTag .6s 1.55s forwards;}' +
    '@media (prefers-reduced-motion:reduce){#jvo-splash .em{opacity:1;}#jvo-splash .dv{opacity:1;}#jvo-splash .rg circle{stroke-dashoffset:0;}#jvo-splash .tg{opacity:1;}' +
      '#jvo-splash.go .em,#jvo-splash.go .dv,#jvo-splash.go .dv svg,#jvo-splash.go .rg circle,#jvo-splash.go .tg{animation:none;}}';

  var html =
    '<div class="st">' +
      '<svg class="rg" viewBox="0 0 190 190" aria-hidden="true"><circle cx="95" cy="95" r="86.5"/></svg>' +
      '<div class="em"></div>' +
      '<div class="dv"><svg viewBox="0 0 80 39" aria-hidden="true"><path d="' + DOVE + '" fill="#fff"/></svg></div>' +
    '</div>' +
    '<div class="tg">Jeugdgroep van Oranje</div>';

  var style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  var wrap = document.createElement('div');
  wrap.id = 'jvo-splash';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-label', 'Jeugdgroep van Oranje laadt');
  wrap.innerHTML = html;

  function mount() {
    (document.body || document.documentElement).appendChild(wrap);
    try { sessionStorage.setItem('jvo_splashed', '1'); } catch (e) {}
    var started = false;
    function start() {
      if (started) return; started = true;
      wrap.classList.add('go');
      var t = reduce ? 900 : 3400;
      setTimeout(function () { wrap.classList.add('hide'); }, t);
      setTimeout(function () { if (wrap.parentNode) wrap.remove(); if (style.parentNode) style.remove(); }, t + 700);
    }
    if (reduce) { start(); return; }
    var go = function () { setTimeout(start, 90); };   // kort ná load → vrije main-thread
    if (document.readyState === 'complete') go();
    else addEventListener('load', go, { once: true });
    setTimeout(start, 2000);                            // fallback: speelt sowieso af
  }
  mount(); // meteen (valt terug op <html> als <body> er nog niet is) → geen flits
})();
