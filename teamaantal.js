// Self-service player-count change page.
// Reads a JWT from the URL hash, validates it against the server, then lets the
// captain update the expected player count. Only expected_players is changed.

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
// Teamgrootte komt uit het evenement-profiel: de server vult min/max in het
// invoerveld en stuurt ze bij het valideren van de link nog eens mee.
const numAttr = (el, name, fallback) => { const n = parseInt(el && el.getAttribute(name), 10); return Number.isInteger(n) && n > 0 ? n : fallback; };
let MIN = numAttr($('expected_players'), 'min', 1);
let MAX = numAttr($('expected_players'), 'max', 99);

async function init() {
  TOKEN = getToken();
  if (!TOKEN) {
    showError('Er zit geen geldige code in de link. Open de link uit de e-mail opnieuw.');
    return;
  }

  const { ok, json } = await postJson('/api/team/count/validate', { token: TOKEN });
  if (!ok) {
    showError(json.error || 'Deze link is verlopen of ongeldig.');
    return;
  }

  MIN = json.min ?? MIN;
  MAX = json.max ?? MAX;
  $('team-name').textContent = json.team_name;
  $('player-range').textContent = `${MIN}–${MAX}`;
  const input = $('expected_players');
  input.min = MIN;
  input.max = MAX;
  input.value = json.expected_players ?? MIN;
  show('form');
  input.focus();
  input.select();
}

$('count-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setAlert('');
  const btn = $('submit-btn');
  const count = parseInt($('expected_players').value, 10);

  if (!count || count < MIN || count > MAX) {
    setAlert(`Een team bestaat uit ${MIN} tot ${MAX} spelers.`);
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Bezig…';

  const { ok, json } = await postJson('/api/team/count', { token: TOKEN, expected_players: count });

  if (!ok) {
    setAlert(json.error || 'Er ging iets mis. Probeer opnieuw.');
    btn.disabled = false;
    btn.textContent = original;
    return;
  }

  $('success-msg').textContent = `Jullie staan nu genoteerd met ${json.expected_players} spelers. JVO ziet de wijziging automatisch — je hoeft verder niks te doen.`;
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
