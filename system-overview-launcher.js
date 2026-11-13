// Launcher for system-overview.html — fetches the protected document
// using the admin token from localStorage. Lives as external JS to
// satisfy the page's CSP (no 'unsafe-inline' allowed).
(async () => {
  const status = document.getElementById('status');
  const message = document.getElementById('message');
  const token = localStorage.getItem('jvo_admin_token');

  if (!token) {
    status.textContent = 'Toegang vereist';
    message.textContent = 'Log eerst in op het admin-paneel om dit document te bekijken.';
    return;
  }

  try {
    const res = await fetch('/api/admin/system-overview', {
      headers: { 'x-admin-token': token },
    });
    if (res.status === 401) {
      status.textContent = 'Sessie verlopen';
      message.textContent = 'Log opnieuw in op het admin-paneel.';
      return;
    }
    if (!res.ok) {
      status.textContent = 'Fout (' + res.status + ')';
      message.textContent = 'Server gaf een fout. Probeer opnieuw of log opnieuw in.';
      return;
    }
    const html = await res.text();
    // Replace entire page with protected content
    document.open();
    document.write(html);
    document.close();
  } catch (e) {
    console.error('System-overview launcher error:', e);
    status.textContent = 'Fout';
    message.textContent = 'Er ging iets mis bij het laden: ' + (e.message || 'onbekend');
  }
})();
