// Kijk-kopie: geen server. Data komt uit /api/*.json; versturen kan niet.
(function () {
  var of = window.fetch.bind(window);
  window.fetch = function (u, o) {
    var s = typeof u === 'string' ? u : (u && u.url) || '';
    var m = ((o && o.method) || (u && u.method) || 'GET').toUpperCase();
    var p = s.replace(location.origin, '');
    if (p.indexOf('/api/') === 0) {
      if (m !== 'GET') return Promise.resolve(new Response(JSON.stringify({ error: 'Dit is een voorbeeld om te bekijken: aanmelden en wijzigen werkt hier niet.' }), { status: 403, headers: { 'content-type': 'application/json' } }));
      return of(p.split('?')[0].replace(/\/$/, '') + '.json', { cache: 'no-cache' });
    }
    return of(u, o);
  };
  function NepBron() { this.readyState = 1; }
  NepBron.prototype.addEventListener = function () {};
  NepBron.prototype.removeEventListener = function () {};
  NepBron.prototype.close = function () {};
  window.EventSource = NepBron;
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return new Promise(function () {}); }; } catch (e) {}
})();
