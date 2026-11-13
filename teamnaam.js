// Self-service team-name change page.
// Reads a JWT from the URL hash, validates it against the server, then lets
// the captain pick a new team name. Only team_name is ever changed.

const $ = (id) => document.getElementById(id);

function show(state) {
  for (const s of ['loading', 'error', 'form', 'success']) {
    const el = $(`state-${s}`);
    if (el) el.style.display = s === state ? '' : 'none';
  }
}

function showError(msg) {
  $('error-msg').textContent = msg || 'Deze link werkt niet meer.';
  show('error');
}

// Foutmelding via textContent: de tekst kan van de server komen (nooit als HTML).
function setAlert(msg) {
  const box = $('form-alert');
  box.textContent = '';
  if (!msg) return;
  const div = document.createElement('div');
  div.className = 'alert error';
  div.textContent = msg;
  box.appendChild(div);
}

// Token arrives in the hash (#<jwt>), so it never hits server logs as a query.
function getToken() {
  const h = (location.hash || '').replace(/^#/, '').trim();
  return h || null;
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = {};
  try { json = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, json };
}

let TOKEN = null;

async function init() {
  TOKEN = getToken();
  if (!TOKEN) {
    showError('Er zit geen geldige code in de link. Open de link uit de e-mail opnieuw.');
    return;
  }

  const { ok, json } = await postJson('/api/team/rename/validate', { token: TOKEN });
  if (!ok) {
    showError(json.error || 'Deze link is verlopen of ongeldig.');
    return;
  }

  $('current-name').textContent = json.team_name;
  const input = $('new_name');
  input.value = json.team_name;
  show('form');
  input.focus();
  input.select();
}

$('rename-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setAlert('');
  const btn = $('submit-btn');
  const newName = $('new_name').value.trim();

  if (newName.length < 2) {
    setAlert('Vul een teamnaam in van minimaal 2 tekens.');
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Bezig…';

  const { ok, json } = await postJson('/api/team/rename', { token: TOKEN, new_name: newName });

  if (!ok) {
    setAlert(json.error || 'Er ging iets mis. Probeer opnieuw.');
    btn.disabled = false;
    btn.textContent = original;
    return;
  }

  $('success-msg').textContent = `Je teamnaam is nu "${json.team_name}". JVO ziet de wijziging automatisch — je hoeft verder niks te doen.`;
  show('success');
});

init().catch(() => showError('Er ging iets mis bij het laden. Probeer de link opnieuw.'));

// Contact-e-mail: de server vult 'm al in de pagina; dit houdt een offline-
// gecachete pagina vers (per installatie instelbaar via EMAIL_REPLY_TO). Nooit
// een lege waarde over de server-tekst heen schrijven.
fetch('/api/config').then(r => r.json()).then(cfg => {
  if (!cfg || !cfg.contactEmail) return;
  document.querySelectorAll('.js-contact-mail').forEach(a => { a.href = 'mailto:' + cfg.contactEmail; a.textContent = cfg.contactEmail; });
}).catch(() => {});
