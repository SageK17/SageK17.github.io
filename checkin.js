// Check-in scanner — crew task (shares the crew login with /wedstrijd.html)
const TOKEN_KEY = 'jvo_crew_token';
const NAME_KEY  = 'jvo_crew_name';

const loginEl  = document.getElementById('login');
const scannerEl = document.getElementById('scanner');
const loginForm = document.getElementById('login-form');
const loginAlert = document.getElementById('login-alert');
const resultEl = document.getElementById('result');

// Rustende-duif placeholder in het resultaatvak zolang er nog niet gescand is
// (JVO Motion — <jvo-empty>, wordt bij een scan overschreven). Vaste NL-copy, geen input.
const SCAN_PLACEHOLDER = '<jvo-empty title="Nog geen scan" hint="Het resultaat verschijnt hier zodra je een QR scant."></jvo-empty>';
resultEl.innerHTML = SCAN_PLACEHOLDER;

// Lijst "gescand op dit toestel" (naast de scanner op een laptop). Alleen in deze
// tab bewaard (sessionStorage); alle tekst via escapeHtml.
const RECENT_KEY = 'jvo_checkin_recent';
const recentEl = document.getElementById('recent');
function loadRecent() { try { const l = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } }
function renderRecent() {
  if (!recentEl) return;
  const list = loadRecent();
  const tijd = (t) => { try { return new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  recentEl.innerHTML = `<h2 class="ci-recent-h">Gescand op dit toestel</h2>` + (list.length
    ? `<ul class="ci-recent-l">${list.map(x => `<li class="${x.kind === 'ok' ? 'ok' : (x.kind === 'error' ? 'error' : 'warn')}"><span class="tm">${escapeHtml(tijd(x.t))}</span><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.note)}</small></li>`).join('')}</ul>`
    : `<p class="ci-recent-leeg">Nog niets gescand. Elk team dat je incheckt komt hier te staan.</p>`);
}
function logScan(kind, name, note) {
  const list = loadRecent();
  list.unshift({ t: Date.now(), kind, name: String(name || ''), note: String(note || '') });
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch {}
  renderRecent();
}

let qrScanner = null;
let scanCooldown = false;

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getName()  { return localStorage.getItem(NAME_KEY); }
function setSession(token, name) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, name);
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
}

// fetch() with a hard timeout so a captive-portal / "online but unreachable"
// network fails fast into the offline queue instead of hanging.
function fetchWithTimeout(path, opts = {}, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(path, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers['x-admin-token'] = token;
  const res = await fetchWithTimeout(path, { ...opts, headers });
  if (res.status === 401) {
    // Expired/invalid crew session — NOT a network error. Tag it so the scan
    // path doesn't misfile it as "offline" and queue it (and so the flush loop
    // can stop early). The user is sent back to login.
    clearSession(); showLogin();
    const e = new Error('Sessie verlopen'); e.auth = true; throw e;
  }
  return res;
}

function showLogin() {
  loginEl.style.display = 'grid';
  scannerEl.style.display = 'none';
  if (qrScanner) { qrScanner.stop().catch(() => {}); }
}
function showScanner() {
  loginEl.style.display = 'none';
  scannerEl.style.display = 'block';
  document.getElementById('who').textContent = getName();
  startScanner();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginAlert.innerHTML = '';
  const name = document.getElementById('admin-name').value.trim();
  const code = document.getElementById('admin-code').value;
  try {
    const res = await fetch('/api/crew/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code }),
    });
    const json = await res.json();
    if (!res.ok) {
      loginAlert.innerHTML = `<div class="alert error">${escapeHtml(json.error || 'Inloggen mislukt')}</div>`;
      return;
    }
    setSession(json.token, name);
    showScanner();
    flushOfflineQueue();   // replay anything queued while logged out / after a 401
  } catch {
    loginAlert.innerHTML = `<div class="alert error">Netwerkfout.</div>`;
  }
});

document.getElementById('logout-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  clearSession();
  showLogin();
});

document.getElementById('restart-btn')?.addEventListener('click', () => {
  resultEl.innerHTML = SCAN_PLACEHOLDER;
  startScanner();
});

function openManualModal() {
  const modal = document.getElementById('manual-modal');
  const code = document.getElementById('manual-code-input');
  const link = document.getElementById('manual-token-input');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';   // lock the page behind the modal
  if (code) code.value = '';
  if (link) link.value = '';
  updateManualState();
  setTimeout(() => (code || link)?.focus(), 50);
}
function closeManualModal() {
  document.getElementById('manual-modal').style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('manual-btn')?.addEventListener('click', openManualModal);
document.getElementById('manual-cancel')?.addEventListener('click', closeManualModal);
// Click on the dim backdrop (outside the content) closes the modal.
document.getElementById('manual-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeManualModal();
});

// Het code-veld formatteert zichzelf terwijl de crew typt: hoofdletters, alleen
// geldige tekens, en het streepje na 3 tekens komt vanzelf ("k7m3pa" → "K7M-3PA").
// De knop wordt pas actief bij 6 tekens (of een geplakte link) — nooit gokken.
function manualCodeRaw() {
  const el = document.getElementById('manual-code-input');
  return el ? el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';
}
function updateManualState() {
  const raw = manualCodeRaw();
  const link = (document.getElementById('manual-token-input')?.value || '').trim();
  const btn = document.getElementById('manual-submit');
  const hint = document.getElementById('manual-code-hint');
  if (btn) btn.disabled = !(raw.length === 6 || link);
  if (hint) hint.textContent = raw.length === 0 ? 'Nog 6 tekens'
    : raw.length < 6 ? `Nog ${6 - raw.length} teken${6 - raw.length === 1 ? '' : 's'}`
    : '✓ Klaar — tik op Check in';
}
document.getElementById('manual-code-input')?.addEventListener('input', (e) => {
  const raw = manualCodeRaw();
  e.target.value = raw.length > 3 ? raw.slice(0, 3) + '-' + raw.slice(3) : raw;
  updateManualState();
});
document.getElementById('manual-token-input')?.addEventListener('input', updateManualState);

document.getElementById('manual-submit')?.addEventListener('click', async () => {
  const raw = manualCodeRaw();
  const link = (document.getElementById('manual-token-input')?.value || '').trim();
  if (raw.length !== 6 && !link) return;
  closeManualModal();
  // NO scanCooldown gate here: the cooldown dedupes accidental camera rescans,
  // but a manual submission is a deliberate act — silently discarding it within
  // 2.5s of a scan loses the typed token with zero feedback. Do arm the cooldown
  // so the camera can't double-fire right after.
  scanCooldown = true;
  // Voorkeur: de check-in-code; anders de geplakte link/het token.
  await processToken(raw.length === 6 ? 'C:' + raw : extractToken(link));
  setTimeout(() => { scanCooldown = false; }, 2500);
});

// Enter = check in; Escape = annuleren (in beide velden)
['manual-code-input', 'manual-token-input'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('manual-submit').click();
    if (e.key === 'Escape') document.getElementById('manual-cancel').click();
  });
});

function extractToken(s) {
  // Tokens may arrive as a full URL with #token, or bare token
  if (!s) return null;
  if (s.includes('#')) return s.split('#').pop();
  return s.trim();
}

let scannerLoadAttempts = 0;
const MAX_SCANNER_LOAD_ATTEMPTS = 50; // ~10 seconds at 200ms intervals
let scannerStarting = false;          // re-entrancy guard (rapid restart / load-race)

async function startScanner() {
  if (scannerStarting) return;        // a start is already in progress — don't open a 2nd camera
  scannerStarting = true;
  try {
    // P1.9 — HTTPS check (camera API requires secure context)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      resultEl.innerHTML = `<div class="checkin-result error">
        <h3>HTTPS vereist</h3>
        <p>De scanner werkt alleen op een beveiligde verbinding. Open
        <code>${location.origin.replace('http://', 'https://')}/checkin.html</code> in plaats van http://.</p>
      </div>`;
      return;
    }

    // P1.6 — bound the polling for the scanner library
    if (typeof Html5Qrcode === 'undefined') {
      if (++scannerLoadAttempts > MAX_SCANNER_LOAD_ATTEMPTS) {
        resultEl.innerHTML = `<div class="checkin-result error">
          <h3>Scanner niet beschikbaar</h3>
          <p>De scanner-bibliotheek kan niet worden geladen. Check je internet of gebruik
          <b>handmatig invoeren</b> via de knop onderaan.</p>
        </div>`;
        return;
      }
      scannerStarting = false;        // release so the scheduled retry can run
      setTimeout(startScanner, 200);
      return;
    }
    // Stop and fully release any existing camera stream before opening a new one.
    if (qrScanner) { try { await qrScanner.stop(); } catch {} }
    qrScanner = new Html5Qrcode('qr-reader');
    // P2.8 — qrbox shouldn't exceed viewport on small phones
    const qrSize = Math.min(280, window.innerWidth - 40);
    try {
      await qrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: qrSize, height: qrSize } },
        async (decoded) => {
          if (scanCooldown) return;
          scanCooldown = true;
          await processToken(extractToken(decoded));
          setTimeout(() => { scanCooldown = false; }, 2500);
        },
        () => {} // ignore per-frame errors
      );
    } catch (err) {
      // Friendlier, actionable messages for the common cases.
      const name = err && err.name;
      let msg = (err && err.message) || String(err);
      if (name === 'NotAllowedError' || name === 'SecurityError') msg = 'Geef camera-toegang in je browser (of via de instellingen) en probeer opnieuw — of gebruik handmatig invoeren.';
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') msg = 'Geen (geschikte) camera gevonden. Gebruik handmatig invoeren.';
      else if (name === 'NotReadableError') msg = 'De camera is in gebruik door een andere app. Sluit die en probeer opnieuw — of gebruik handmatig invoeren.';
      else msg = `${msg}. Gebruik handmatig invoeren.`;
      resultEl.innerHTML = `<div class="checkin-result error"><h3>Camera kan niet starten</h3><p>${escapeHtml(msg)}</p></div>`;
    }
  } finally {
    scannerStarting = false;
  }
}

// P1.10 — offline queue. If a check-in is attempted without network,
// queue locally + replay when 'online' event fires. Order matters less
// here than not losing the action entirely.
const OFFLINE_QUEUE_KEY = 'jvo_checkin_queue';
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
  catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  if (window.JVONet) window.JVONet.setQueued(q.length ? `${q.length} check-in${q.length > 1 ? 's' : ''} in wachtrij` : '');
}

window.addEventListener('online', flushOfflineQueue);

// Queue entries are either a raw QR token, or 'C:XXXXXX' for a typed check-in-code.
function checkinBody(entry) {
  return String(entry).startsWith('C:') ? { code: entry.slice(2) } : { token: entry };
}

let flushingCheckins = false;
async function flushOfflineQueue() {
  if (flushingCheckins) return;
  const queue = loadQueue();
  if (queue.length === 0) return;
  flushingCheckins = true;
  const remaining = [];
  const rejected = [];
  let synced = 0;
  try {
    for (let i = 0; i < queue.length; i++) {
      const token = queue[i];
      try {
        const res = await api('/api/checkin', { method: 'POST', body: JSON.stringify(checkinBody(token)) });
        if (res.ok) { synced++; continue; }
        // Permanent rejections (invalid/expired/replaced QR, not approved,
        // unknown team) will NEVER succeed on retry — drop them and surface to
        // the crew. Only transient failures (network / 5xx) get requeued, so one
        // bad token can't wedge the queue or mask the good check-ins.
        if (res.status >= 400 && res.status < 500) {
          const j = await res.json().catch(() => ({}));
          // Identify WHICH check-in was refused: the QR is a JWT, so its
          // team_id is decodable client-side — the crew can't act on a bare
          // count ("2 geweigerd") without knowing which teams to verify.
          let who = '';
          if (String(token).startsWith('C:')) who = `Code ${token.slice(2, 5)}-${token.slice(5)}: `;
          else try {
            const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (p && p.team_id) who = `Team #${p.team_id}: `;
          } catch {}
          rejected.push(who + (j.error || 'Geweigerd'));
        } else {
          remaining.push(token);
        }
      } catch (e) {
        // Session expired mid-flush: stop now (login screen is already showing),
        // keep this token AND the rest queued — the post-login flush retries.
        if (e && e.auth) { remaining.push(...queue.slice(i)); break; }
        remaining.push(token);   // network error — try again later
      }
    }
  } finally {
    flushingCheckins = false;
  }
  saveQueue(remaining);

  // Report successes and permanent rejections SEPARATELY.
  if (synced > 0 && window.JVONet) {
    window.JVONet.flash(`${synced} offline check-in${synced > 1 ? 's' : ''} gesynchroniseerd`, 'ok');
  }
  if (rejected.length > 0) {
    resultEl.innerHTML = `<div class="checkin-result error">
      <h3>${rejected.length} offline check-in${rejected.length > 1 ? 's' : ''} GEWEIGERD</h3>
      <p>Deze waren offline opgeslagen, maar de server wees ze af bij synchronisatie.
      Controleer deze teams handmatig:</p>
      <ul style="text-align:left; margin:8px 0 0; padding-left:20px;">
        ${rejected.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>
    </div>`;
    beep(false);
  } else if (synced > 0 && remaining.length === 0) {
    resultEl.innerHTML = `<div class="checkin-result success">
      <h3>Offline check-ins ingelopen</h3>
      <p>${synced} eerder gequeuede check-in${synced > 1 ? 's' : ''} ${synced > 1 ? 'zijn' : 'is'} nu doorgekomen.</p>
    </div>`;
  }
}

async function processToken(token) {
  if (!token) return;

  // Offline path — queue and inform. We cannot verify the QR offline (the
  // approval/validity checks live server-side), so be honest that this is
  // provisional and only confirmed once we reconnect.
  if (!navigator.onLine) {
    const q = loadQueue();
    if (!q.includes(token)) q.push(token);   // dedupe rescans of the same team
    saveQueue(q);
    resultEl.innerHTML = `<div class="checkin-result warn">
      <h3>Offline — opgeslagen</h3>
      <p>Geen internet. De check-in wordt pas <b>gecontroleerd en bevestigd</b> zodra
      de verbinding terug is. (${q.length} in wachtrij)</p>
    </div>`;
    logScan('warn', 'Offline bewaard', 'Wordt gecontroleerd zodra er verbinding is');
    beep(true);
    return;
  }

  try {
    const res = await api('/api/checkin', {
      method: 'POST',
      body: JSON.stringify(checkinBody(token)),
    });
    const json = await res.json();
    if (!res.ok) {
      resultEl.innerHTML = `<div class="checkin-result error">
        <h3>Geweigerd</h3>
        <p>${escapeHtml(json.error || 'Onbekende fout')}</p>
      </div>`;
      logScan('error', 'Geweigerd', json.error || 'Onbekende fout');
      beep(false);
      return;
    }
    const t = json.team;
    const cls = json.already_checked_in ? 'warn' : 'success';
    const head = json.already_checked_in ? 'Al ingecheckt' : 'Welkom!';
    logScan(json.already_checked_in ? 'warn' : 'ok', t.name, json.already_checked_in ? 'Was al ingecheckt' : 'Ingecheckt');
    resultEl.innerHTML = `<div class="checkin-result ${cls}">
      <h3>${head}</h3>
      <h2 class="h-display" style="font-size:48px; margin-bottom:16px;">${escapeHtml(t.name)}</h2>
      <dl>
        <dt>Captain</dt><dd>${escapeHtml(t.captain_name)}</dd>
        <dt>Spelers</dt><dd>${t.expected_players}</dd>
        <dt>Tijd</dt><dd class="mono small">${formatDate(t.checked_in_at)}</dd>
      </dl>
    </div>`;
    beep(true);
  } catch (e) {
    // Expired session (401) is NOT offline — api() already sent us to login.
    // Don't queue it as a network failure; the scan can be redone after re-login.
    if (e && e.auth) return;
    // Network failure mid-flight — queue too (deduped).
    const q = loadQueue();
    if (!q.includes(token)) q.push(token);
    saveQueue(q);
    resultEl.innerHTML = `<div class="checkin-result warn">
      <h3>Verbinding verbroken</h3>
      <p>Check-in opgeslagen voor later — wordt bij synchronisatie gecontroleerd. (${q.length} in wachtrij)</p>
    </div>`;
  }
}

// On page load, reflect any leftover queue in the status bar and try to flush.
if (window.JVONet) {
  const q = loadQueue();
  window.JVONet.setQueued(q.length ? `${q.length} check-in${q.length > 1 ? 's' : ''} in wachtrij` : '');
}
if (navigator.onLine) flushOfflineQueue();

// Tiny audio feedback
function beep(success) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = success ? 880 : 220;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, success ? 120 : 280);
  } catch {}
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'medium' });
}

renderRecent();
if (getToken() && getName()) {
  showScanner();
  // Validate the stored session in the background: a 12h-old token would
  // otherwise present a fully working-LOOKING scanner that fails on the first
  // real scan of the day. api() handles the 401 (clears session → login).
  api('/api/crew/me').catch(() => {});
} else {
  showLogin();
}
