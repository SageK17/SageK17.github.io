// Kijk-kopie: geen server. Gegevens komen uit /api/*.json; wijzigen kan niet.
(function () {
  var BEKEND = ["admin_audit","admin_competitions","admin_event-config","admin_feedback_summary","admin_logos","admin_push-prefs","admin_push-texts","admin_regie","admin_registrations","admin_reminders_status","admin_rules","admin_smart_learnings","admin_teams","admin_tournament-statuses","competitions","config","crew_me","hub","smart_flags","tournament","tournament_competition_2","tournament_competition_3","tournament_competition_4","tournament_competition_5","tournament_competition_6","tournament_competition_7"];
  var of = window.fetch.bind(window);
  function json(obj, status) { return Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } })); }
  function sleutel(pq) { return pq.replace(/^\/api\//, '').replace(/[^A-Za-z0-9._-]+/g, '_'); }
  try { ['jvo_admin', 'jvo_crew', 'jvo_checkin'].forEach(function (k) { if (!localStorage.getItem(k + '_token')) { localStorage.setItem(k + '_token', 'voorbeeld'); localStorage.setItem(k + '_name', 'Voorbeeld'); } }); localStorage.setItem('jvo_crew_install_seen', '1'); } catch (e) {}
  window.fetch = function (u, o) {
    var s = typeof u === 'string' ? u : (u && u.url) || '';
    var m = ((o && o.method) || (u && u.method) || 'GET').toUpperCase();
    var p = s.replace(location.origin, '');
    if (p.indexOf('/api/') !== 0) return of(u, o);
    if (m !== 'GET') {
      if (/\/login$/.test(p.split('?')[0])) return json({ token: 'voorbeeld', name: 'Voorbeeld' });
      return json({ error: 'Dit is een voorbeeld om te bekijken: opslaan en wijzigen werkt hier niet.' }, 403);
    }
    var k = sleutel(p), k2 = sleutel(p.split('?')[0]);
    var kies = BEKEND.indexOf(k) >= 0 ? k : (BEKEND.indexOf(k2) >= 0 ? k2 : null);
    if (!kies) return json({});
    return of('/api/' + kies + '.json', { cache: 'no-cache' });
  };
  function NepBron() { this.readyState = 1; }
  NepBron.prototype.addEventListener = function () {}; NepBron.prototype.removeEventListener = function () {}; NepBron.prototype.close = function () {};
  window.EventSource = NepBron;
  try { if (navigator.serviceWorker) { navigator.serviceWorker.register = function () { return new Promise(function () {}); };
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }); } } catch (e) {}
  // een smalle balk bovenaan de werkschermen: dit is een voorbeeld
  document.addEventListener('DOMContentLoaded', function () {
    if (!/admin|wedstrijd|checkin|omroep|print/.test(location.pathname)) return;
    var b = document.createElement('div');
    b.textContent = 'Voorbeeld met testgegevens · wijzigen werkt hier niet';
    b.setAttribute('style', 'position:sticky;top:0;z-index:9999;background:#FF6B1A;color:#06193A;font:600 12px/1.3 system-ui,sans-serif;padding:7px 12px;text-align:center');
    document.body.insertBefore(b, document.body.firstChild);
  });
})();
