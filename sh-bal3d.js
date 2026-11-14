/* ================================================================
   STIJL "SPORTHUB" — de draaiende bal (voetbal, basketbal, volleybal)
   ----------------------------------------------------------------
   Alleen geladen in de stijl 'sporthub' (via een
   <!--ev-if:themeSporthub--> blok); 'schemering' ziet dit bestand nooit.

   In plaats van een geanimeerde WebP (8 beelden per seconde, 1,3–2 MB
   per bal) tekent dit een bol in WebGL: elk schermbeeld opnieuw, met de
   draaihoek uit de klok. De look komt uit de icoonstudio
   (previews/icoon-studio: bak_bal.py → bak_licht.py → pak_bal.py):
     /sport/bal/<naam>[-klein].webp  vier grijze equirect-vakken onder
         elkaar: klasse (0 oranje · ½ naad · 1 wit), normaal-oost,
         normaal-noord (wortel-gecodeerd) en omgevingsschaduw
     /sport/bal/licht.webp           2×2 vakken: de belichting van een
         witte, een oranje en een naadkleurige bol in de studio, plus
         de contactschaduw op de vloer
   De fragment-shader volgt per pixel de straal van de studiocamera naar
   de bol, zoekt de verf en de (kussentjes-)normaal op, en haalt het
   licht uit de kaart op de plek waar een gladde bol díe normaal heeft.

   Gebruik:  shBal3d.kan()                 → mag en kan het hier?
             shBal3d.maak(img, naam, { groot: true })
   `img` is het stilstaande plaatje; het canvas komt er als buurman
   precies overheen (de ouder moet position hebben) en vloeit in zodra
   het eerste beeld getekend is. Lukt er iets niet (geen WebGL,
   bestanden niet geladen, context kwijt), dan blijft het plaatje staan.

   Regels:
   - Niet bij "minder beweging" of databesparing.
   - Eén gedeelde requestAnimationFrame-lus voor alle ballen; hij staat
     stil als het tabblad verborgen is of er geen bal in beeld is.
   - Tijd-gestuurd (15 s per slag, van links naar rechts): ook op 30 of
     120 beelden per seconde even snel.
   - Canvas hooguit 2 apparaatpixels per CSS-pixel.
   - De getallen (camera, kanteling, kleuren) horen bij pak_bal.py:
     samen aanpassen.
   ================================================================ */
(function () {
  'use strict';

  var html = document.documentElement;
  if (html.getAttribute('data-theme') !== 'sporthub') return;

  var SLAG_MS = 15000;          // één volle draai
  var AANLOOP_MS = 900;         // zacht op gang komen na de wissel plaatje → canvas
  var KANTEL_MS = 2400;         // het grote icoon: van rechtop naar de schuine spil
  var INVLOEI_MS = 300;
  var KANTEL = -8 * Math.PI / 180;
  // straal van de omtrek: de kussentjes bollen iets buiten de bol van 1
  var BALLEN = { voetbal: 1.0, basketbal: 1.007, volleybal: 1.0085 };

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var HOEK = [
    'attribute vec2 aP;',
    'varying vec2 vF;',
    'void main() {',
    '  vF = vec2(aP.x * 0.5 + 0.5, 0.5 - aP.y * 0.5);',   // beeldcoördinaat: (0,0) linksboven
    '  gl_Position = vec4(aP, 0.0, 1.0);',
    '}'
  ].join('\n');

  var PIXEL = [
    'precision highp float;',
    'uniform sampler2D uKaart;',
    'uniform sampler2D uLicht;',
    'uniform mat3 uS;',          // bal → wereld: Rz(θ) · Rx(kanteling)
    'uniform float uStraal;',
    'uniform float uStap;',      // één canvaspixel in beeldcoördinaten
    'uniform float uHalf;',      // een halve texel van één vak (verticaal)
    'varying vec2 vF;',
    // de camera van studio.opstelling(): (0, −7.3, 1.6) → (0, 0, −0.04), 110 mm op 36 mm
    'const vec3 CAM = vec3(0.0, -7.3, 1.6);',
    'const vec3 VOOR = vec3(0.0, 0.975681, -0.219194);',
    'const vec3 OP = vec3(0.0, 0.219194, 0.975681);',
    'const vec3 NAARCAM = vec3(0.0, -0.976813, 0.214096);',
    'const float CC = 55.85;',
    'const float TAN = 0.16363636;',
    'const float PI = 3.14159265;',
    'const float KMIN = 0.3;',
    'const float HT = 0.001953125;',                     // halve texel van een lichtvak (256)
    'const vec3 NAAD_TINT = vec3(0.50, 0.66, 0.86);',    // de naad ligt in een groef: donkerder
    'const float AO = 0.45;',
    'vec4 monster(vec2 f) {',
    '  vec3 dir = normalize(VOOR + vec3((2.0 * f.x - 1.0) * TAN, 0.0, 0.0) + OP * ((1.0 - 2.0 * f.y) * TAN));',
    '  float b = dot(dir, CAM);',
    '  float dwars = sqrt(max(CC - b * b, 0.0));',        // afstand van de straal tot het midden van de bal
    '  float dek = clamp((uStraal - dwars) / (uStap * 2.0 * TAN * 7.4733) + 0.5, 0.0, 1.0);',
    '  float sch = texture2D(uLicht, 0.5 + clamp(f, HT, 1.0 - HT) * 0.5).r;',
    '  if (dek <= 0.0) return vec4(0.0, 0.0, 0.0, sch);',
    '  vec3 n = normalize(CAM + dir * (-b - sqrt(max(uStraal * uStraal - dwars * dwars, 0.0))));',
    '  vec3 nb = n * uS;',                               // terug naar de bal (Sᵀ · n)
    '  float u = (atan(nb.y, nb.x) + PI) / (2.0 * PI);',
    '  float v = clamp(acos(clamp(nb.z, -1.0, 1.0)) / PI, uHalf, 1.0 - uHalf) * 0.25;',
    '  float kl = texture2D(uKaart, vec2(u, v)).r;',
    '  float eo = texture2D(uKaart, vec2(u, v + 0.25)).r * 2.0 - 1.0;',
    '  float en = texture2D(uKaart, vec2(u, v + 0.5)).r * 2.0 - 1.0;',
    '  float ao = texture2D(uKaart, vec2(u, v + 0.75)).r;',
    '  float to = eo * abs(eo);',
    '  float tn = en * abs(en);',
    '  vec3 oost = vec3(-nb.y, nb.x, 0.0);',
    '  oost /= max(length(oost), 0.00001);',
    '  vec3 noord = cross(nb, oost);',
    // de normaal mét kussentjes, terug in de wereld
    '  vec3 n2 = uS * (nb * sqrt(max(1.0 - to * to - tn * tn, 0.0)) + oost * to + noord * tn);',
    '  float k = dot(n2, NAARCAM);',
    '  if (k < KMIN) {',                                 // niet voorbij de rand van de lichtkaart zoeken
    '    vec3 tg = n2 - NAARCAM * k;',
    '    n2 = NAARCAM * KMIN + tg / max(length(tg), 0.00001) * sqrt(1.0 - KMIN * KMIN);',
    '  }',
    // waar ziet de camera op een gladde bol díe normaal? daar staat het licht
    '  vec3 q = n2 - CAM;',
    '  float z = dot(q, VOOR) * TAN;',
    '  vec2 m = clamp(vec2(0.5 + 0.5 * q.x / z, 0.5 - 0.5 * dot(q, OP) / z), HT, 1.0 - HT) * 0.5;',
    '  vec3 kleur = mix(texture2D(uLicht, m).rgb, texture2D(uLicht, m + vec2(0.5, 0.0)).rgb, step(kl, 0.5));',
    '  float naad = smoothstep(0.55, 0.92, 1.0 - abs(2.0 * kl - 1.0));',
    '  kleur = mix(kleur, texture2D(uLicht, m + vec2(0.0, 0.5)).rgb * NAAD_TINT, naad);',
    '  kleur *= 1.0 - AO + AO * ao;',
    '  return vec4(kleur * dek, dek + sch * (1.0 - dek));',   // voorvermenigvuldigd, bal over schaduw
    '}',
    'void main() {',
    // vier monsters per pixel (gedraaid rooster): de naden flikkeren niet en de rand kartelt niet
    '  gl_FragColor = 0.25 * (monster(vF + uStap * vec2(-0.375, -0.125)) + monster(vF + uStap * vec2(0.125, -0.375))',
    '    + monster(vF + uStap * vec2(0.375, 0.125)) + monster(vF + uStap * vec2(-0.125, 0.375)));',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------- mag het?
  var kanGl = null;
  function glKan() {
    if (kanGl !== null) return kanGl;
    kanGl = false;
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: false });
      if (gl) {
        var f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        kanGl = !!(f && f.precision >= 23) && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 1024;
        var weg = gl.getExtension('WEBGL_lose_context');
        if (weg) weg.loseContext();
      }
    } catch (e) { kanGl = false; }
    return kanGl;
  }
  function kan() {
    if (mq && mq.matches) return false;
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return false;
    return glKan();
  }

  // ---------------------------------------------------------------- plaatjes
  var plaatjes = {};
  function laad(url, klaar) {
    var p = plaatjes[url];
    if (!p) {
      p = plaatjes[url] = { img: new Image(), wacht: [], stand: 0 };
      p.img.decoding = 'async';
      p.img.onload = function () { p.stand = 1; p.wacht.splice(0).forEach(function (f) { f(p.img); }); };
      p.img.onerror = function () { p.stand = -1; p.wacht.splice(0).forEach(function (f) { f(null); }); };
      p.img.src = url;
    }
    if (p.stand === 1) klaar(p.img);
    else if (p.stand === -1) klaar(null);
    else p.wacht.push(klaar);
  }

  // ---------------------------------------------------------------- één bal
  var ballen = [];
  var lus = 0;

  function textuur(gl, eenheid, img, soort, rond) {
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + eenheid);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, soort, soort, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rond ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function bouw(bal, kaart, licht) {
    var gl = bal.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return false;
    function schaduwer(soort, bron) {
      var s = gl.createShader(soort);
      gl.shaderSource(s, bron); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = schaduwer(gl.VERTEX_SHADER, HOEK), fs = schaduwer(gl.FRAGMENT_SHADER, PIXEL);
    if (!vs || !fs) return false;
    var pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs);
    gl.bindAttribLocation(pr, 0, 'aP');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    // één grote driehoek die het hele doek dekt
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    textuur(gl, 0, kaart, gl.LUMINANCE, true);
    textuur(gl, 1, licht, gl.RGB, false);
    if (gl.getError() !== gl.NO_ERROR) return false;
    gl.uniform1i(gl.getUniformLocation(pr, 'uKaart'), 0);
    gl.uniform1i(gl.getUniformLocation(pr, 'uLicht'), 1);
    gl.uniform1f(gl.getUniformLocation(pr, 'uStraal'), BALLEN[bal.naam]);
    gl.uniform1f(gl.getUniformLocation(pr, 'uHalf'), 2 / kaart.naturalHeight);   // ½ texel van een vak (hoogte / 4)
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    bal.gl = gl;
    bal.uS = gl.getUniformLocation(pr, 'uS');
    bal.uStap = gl.getUniformLocation(pr, 'uStap');
    bal.S = new Float32Array(9);
    return true;
  }

  function maat(bal) {
    var css = bal.canvas.clientWidth || bal.img.clientWidth || 0;
    var px = Math.max(16, Math.min(1024, Math.round(css * Math.min(window.devicePixelRatio || 1, 2))));
    if (css && px !== bal.px) {
      bal.px = px;
      bal.canvas.width = bal.canvas.height = px;
      bal.gl.viewport(0, 0, px, px);
      bal.gl.uniform1f(bal.uStap, 1 / px);
      bal.vuil = true;
    }
    return !!css;
  }

  function teken(bal, hoek, kantel) {
    var c = Math.cos(hoek), s = Math.sin(hoek), ck = Math.cos(kantel), sk = Math.sin(kantel), S = bal.S;
    // Rz(θ) · Rx(kanteling), kolom voor kolom
    S[0] = c; S[1] = s; S[2] = 0;
    S[3] = -s * ck; S[4] = c * ck; S[5] = sk;
    S[6] = s * sk; S[7] = -c * sk; S[8] = ck;
    bal.gl.uniformMatrix3fv(bal.uS, false, S);
    bal.gl.drawArrays(bal.gl.TRIANGLES, 0, 3);
  }

  // Hoek uit de klok: eerst stil op de beginstand (zolang het canvas invloeit),
  // dan zacht op gang, daarna eenparig: één slag per SLAG_MS.
  function hoekOp(bal, nu) {
    var t = nu - bal.t0;
    if (!(t > 0)) return 0;
    var loop = t < AANLOOP_MS ? (t * t) / (2 * AANLOOP_MS) : t - AANLOOP_MS / 2;
    return 2 * Math.PI * ((loop % SLAG_MS) / SLAG_MS);
  }
  // De spil helt iets naar de kijker (zoals in de studio-lus). Het stilstaande icoon
  // /sport/<naam>.webp staat rechtop; het grote icoon begint daarom rechtop en kantelt
  // in de eerste tellen rustig naar de schuine spil — geen sprong bij de wissel.
  // De ring begint meteen schuin: zijn stilstaande beeld is beeld 0 van de lus.
  function kantelOp(bal, nu) {
    if (!bal.groot) return KANTEL;
    var x = (nu - bal.t0) / KANTEL_MS;
    if (!(x > 0)) return 0;
    if (x >= 1) return KANTEL;
    return KANTEL * x * x * (3 - 2 * x);
  }

  function terug(bal) {
    // terugval: het stilstaande plaatje weer tonen, het canvas weg
    var i = ballen.indexOf(bal);
    if (i >= 0) ballen.splice(i, 1);
    bal.img.style.visibility = '';
    bal.img.style.opacity = '';
    if (bal.canvas.parentNode) bal.canvas.parentNode.removeChild(bal.canvas);
    if (bal.io) bal.io.disconnect();
    if (bal.gl) {
      var weg = bal.gl.getExtension('WEBGL_lose_context');
      if (weg && !bal.kwijt) weg.loseContext();
    }
    bal.gl = null;
  }

  function beeld(nu) {
    lus = 0;
    if (document.hidden) return;
    var bezig = false;
    for (var i = ballen.length - 1; i >= 0; i--) {
      var bal = ballen[i];
      if (!bal.canvas.isConnected) { terug(bal); continue; }   // de pagina heeft het blok vervangen
      if (!bal.zicht) continue;
      bezig = true;
      if (!maat(bal)) continue;
      teken(bal, hoekOp(bal, nu), kantelOp(bal, nu));
    }
    if (bezig) lus = requestAnimationFrame(beeld);
  }
  function start() {
    if (!lus && !document.hidden && ballen.length) lus = requestAnimationFrame(beeld);
  }

  document.addEventListener('visibilitychange', start);
  window.addEventListener('pageshow', start);
  function minderBeweging() {
    if (mq && mq.matches) ballen.slice().forEach(terug);
  }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', minderBeweging);
    else if (mq.addListener) mq.addListener(minderBeweging);
  }

  // ---------------------------------------------------------------- maak
  function maak(img, naam, opties) {
    if (!img || !img.parentNode || !BALLEN[naam] || img.getAttribute('data-sh-bal3d') || !kan()) return false;
    img.setAttribute('data-sh-bal3d', '1');
    var groot = !!(opties && opties.groot);
    laad('/sport/bal/licht.webp', function (licht) {
      laad('/sport/bal/' + naam + (groot ? '' : '-klein') + '.webp', function (kaart) {
        if (!licht || !kaart || !img.isConnected || (mq && mq.matches)) return;
        var canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.className = 'sh-bal3d';
        var st = canvas.style;
        st.position = 'absolute'; st.left = '0'; st.top = '0'; st.width = '100%'; st.height = '100%';
        st.pointerEvents = 'none'; st.opacity = '0'; st.transition = 'opacity ' + INVLOEI_MS + 'ms linear';
        var bal = { img: img, naam: naam, groot: groot, canvas: canvas, px: 0, zicht: true, t0: Infinity, kwijt: false };
        canvas.addEventListener('webglcontextlost', function () { bal.kwijt = true; terug(bal); });
        img.parentNode.insertBefore(canvas, img.nextSibling);
        var goed = false;
        try { goed = bouw(bal, kaart, licht) && maat(bal); } catch (e) { goed = false; }
        if (!goed) { terug(bal); return; }
        // het eerste beeld (beginstand) tekenen, dan pas laten zien
        teken(bal, 0, groot ? 0 : KANTEL);
        if (bal.gl.isContextLost() || bal.gl.getError() !== bal.gl.NO_ERROR) { terug(bal); return; }
        ballen.push(bal);
        if (window.IntersectionObserver) {
          bal.io = new IntersectionObserver(function (items) {
            bal.zicht = items[items.length - 1].isIntersecting;
            if (bal.zicht) start();
          }, { rootMargin: '80px' });
          bal.io.observe(canvas);
        }
        requestAnimationFrame(function () {
          if (!bal.gl) return;
          st.opacity = '1';
          setTimeout(function () {
            if (!bal.gl) return;
            img.style.visibility = 'hidden';            // het plaatje blijft in de pagina (terugval)
            bal.t0 = performance.now();
          }, INVLOEI_MS + 40);
        });
        start();
      });
    });
    return true;
  }

  window.shBal3d = { kan: kan, maak: maak };
})();
