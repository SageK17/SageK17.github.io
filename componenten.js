/* JVO Motion — showcase-wiring voor componenten.html.
   De custom elements zitten in jvo-motion.js; dit koppelt alleen de demo-knoppen.
   In de echte app roep je deze componenten vanuit je eigen JS aan
   (JVOGoal(), JVOToast(), <el>.play(), <el>.ok(), ...). */
(function () {
  'use strict';
  function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }

  function wire() {
    // De demo-kaart heeft auto="false" (jij bepaalt wanneer hij verschijnt);
    // in de showcase tonen we hem meteen zodat het component zichtbaar is.
    var card = document.getElementById('jvo-demo-card');
    if (card && card.show) requestAnimationFrame(function () { card.show(); });

    on('demo-goal', function () {
      if (window.JVOGoal) window.JVOGoal({ home: 'JVO', away: 'GST', score: '2-1', minute: '12' });
    });
    on('demo-toast', function () {
      if (window.JVOToast) window.JVOToast('Uitslag opgeslagen', 'clinch');
    });
    on('demo-card', function () {
      var c = document.getElementById('jvo-demo-card');
      if (c && c.hide && c.show) { c.hide(); setTimeout(function () { c.show(); }, 420); }
    });
    on('demo-loader-btn', function () {
      var l = document.getElementById('jvo-demo-loader');
      if (l && l.play) l.play(1900);
    });
    on('demo-scan', function () {
      var q = document.querySelector('jvo-qrscan');
      if (q && q.ok) q.ok();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
