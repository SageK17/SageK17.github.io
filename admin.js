// JVO Admin — login, tabs, teams, filters, QR modal
(() => {
  const $ = (id) => document.getElementById(id);
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  // Inline stroke icons (currentColor) — replaces emoji for a cleaner look.
  const svg = (paths, size = 13) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; flex:none;" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    pencil: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 12),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.5"/>', 12),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    warn: svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    refresh: svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
    flag: svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', 18),
    play: svg('<polygon points="6 3 20 12 6 21 6 3"/>', 18),
    download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 14),
  };

  let token = localStorage.getItem('jvo_admin_token') || null;
  let adminName = localStorage.getItem('jvo_admin_name') || '';
  let teams = [];
  let signups = [];
  let auditLog = [];
  let cfg = null;
  let freezeInfo = { frozen: false, since: null };
  let countChangeEnabled = false;  // player-count self-service feature flag
  let currentFilter = 'all';
  let teamSearch = '';     // free-text filter for the Teams tab
  let signupSearch = '';   // free-text filter for the Aanmeldingen tab
  let lastSeenAuditTimestamp = null;  // for detecting new audit entries on auto-refresh
  let pollerHandle = null;
  let sessionExpiredNotified = false;  // "sessie verlopen" hoogstens één keer melden

  // Per-admin profile (email + notify toggles), keyed by admin name.
  // Stored in localStorage so it survives sessions but stays per-browser.
  function getProfile(name) {
    const empty = { email: '', notifySignups: false, notifyTeams: false,
                    notifyPushSignups: false, notifyPushTeams: false };
    if (!name) return empty;
    try {
      const raw = localStorage.getItem('jvo_admin_profile_' + name);
      if (!raw) return empty;
      return { ...empty, ...JSON.parse(raw) };
    } catch { return empty; }
  }
  function saveProfile(name, profile) {
    if (!name) return;
    localStorage.setItem('jvo_admin_profile_' + name, JSON.stringify(profile));
  }
  // Sync profile to server so it can be used for outgoing notifications
  async function syncProfileToServer(name, profile) {
    if (!name) return;
    try {
      await api('/api/admin/profile', {
        method: 'POST',
        body: JSON.stringify({ name, ...profile }),
      });
    } catch {}
  }

  // Toast notifications — non-blocking feedback in bottom-right
  function showToast(msg, kind = 'success') {
    let host = $('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${kind}`;
    t.textContent = msg;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-show'));
    setTimeout(() => {
      t.classList.remove('toast-show');
      setTimeout(() => t.remove(), 300);
    }, 4500);
  }

  // Toast with live countdown + undo button
  // Used when an admin action triggers a deferred mail (currently 8s window).
  // Returns the toast element so caller can dismiss it on success.
  function showUndoToast({ message, actionId, undoWindowMs, onUndo }) {
    let host = $('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast toast-undo';
    t.innerHTML = `
      <div class="toast-undo-message"></div>
      <button type="button" class="toast-undo-btn">
        Ongedaan maken <span class="toast-undo-counter">${Math.ceil(undoWindowMs / 1000)}</span>
      </button>
      <div class="toast-undo-progress"><div class="toast-undo-progress-bar"></div></div>
    `;
    t.querySelector('.toast-undo-message').textContent = message;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-show'));

    // Animate progress bar shrinking over the window
    const bar = t.querySelector('.toast-undo-progress-bar');
    bar.style.transition = `width ${undoWindowMs}ms linear`;
    requestAnimationFrame(() => { bar.style.width = '0%'; });

    // Live countdown text
    const counter = t.querySelector('.toast-undo-counter');
    const expiresAt = Date.now() + undoWindowMs;
    const countdownInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      counter.textContent = remaining;
      if (remaining <= 0) clearInterval(countdownInterval);
    }, 200);

    // Auto-dismiss after window expires (mail was sent server-side)
    const dismissHandle = setTimeout(() => {
      clearInterval(countdownInterval);
      t.classList.remove('toast-show');
      t.classList.add('toast-undo-expired');
      setTimeout(() => t.remove(), 400);
    }, undoWindowMs);

    // Undo button click
    t.querySelector('.toast-undo-btn').addEventListener('click', async () => {
      clearTimeout(dismissHandle);
      clearInterval(countdownInterval);
      t.querySelector('.toast-undo-btn').disabled = true;
      counter.textContent = '…';
      try {
        await onUndo(actionId);
        t.classList.add('toast-undo-success');
        t.querySelector('.toast-undo-message').textContent = 'Ongedaan gemaakt';
        setTimeout(() => {
          t.classList.remove('toast-show');
          setTimeout(() => t.remove(), 400);
        }, 1200);
      } catch (err) {
        t.querySelector('.toast-undo-message').textContent = 'Te laat — actie kan niet meer ongedaan worden';
        setTimeout(() => {
          t.classList.remove('toast-show');
          setTimeout(() => t.remove(), 400);
        }, 2000);
      }
    });
  }


  // ===== LOGIN ===================================================
  const loginForm = $('login-form');
  const loginAlert = $('login-alert');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.innerHTML = '';
    const name = $('admin-name').value.trim();
    const code = $('admin-code').value;
    if (!name || !code) {
      loginAlert.innerHTML = '<div class="alert error">Vul beide velden in.</div>';
      return;
    }
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code }),
      });
      const json = await res.json();
      if (!res.ok) {
        loginAlert.innerHTML = `<div class="alert error">${escape(json.error || 'Inloggen mislukt')}</div>`;
        return;
      }
      token = json.token;
      adminName = name;
      sessionExpiredNotified = false;   // nieuwe sessie → mag weer één keer melden
      localStorage.setItem('jvo_admin_token', token);
      localStorage.setItem('jvo_admin_name', adminName);
      enterDashboard();
    } catch (err) {
      loginAlert.innerHTML = '<div class="alert error">Netwerkfout.</div>';
    }
  });

  $('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('jvo_admin_token');
    token = null;
    stopPoller();
    // Keep adminName + localStorage so the name stays prefilled
    showLogin();
  });

  function showLogin() {
    $('login').style.display = 'grid';
    $('dash').style.display = 'none';
    if (adminName) {
      $('admin-name').value = adminName;
      // Focus password field directly if name is already known
      setTimeout(() => $('admin-code').focus(), 50);
    } else {
      setTimeout(() => $('admin-name').focus(), 50);
    }
  }

  // Re-enter dashboard if token already present, otherwise show login w/ name prefilled
  if (token) enterDashboard();
  else showLogin();

  async function enterDashboard() {
    $('login').style.display = 'none';
    $('dash').style.display = 'block';
    $('who').textContent = adminName;
    renderProfile();
    await Promise.all([loadConfig(), refreshAll()]);
    loadReminderStatus();
    loadEventConfig();   // evenement-profiel: checklist, sponsor-knop en namen op het scherm
    // Sync profile (in case admin updated email/toggles before this session)
    syncProfileToServer(adminName, getProfile(adminName));
    // Start auto-refresh poller (every 30s, silent background)
    startPoller();
  }

  function startPoller() {
    stopPoller();
    pollerHandle = setInterval(quietRefresh, 10 * 1000);
  }
  function stopPoller() {
    if (pollerHandle) { clearInterval(pollerHandle); pollerHandle = null; }
  }

  // True while the admin is mid-interaction — a focused field/dropdown or an open
  // modal (every modal sets a body scroll-lock). Used to defer the background
  // re-render so the poller can't wipe an open status <select>, a half-typed
  // field, or the schedule form while you're editing it.
  function userIsBusy() {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) return true;
    if (document.body.style.overflow === 'hidden') return true;   // a modal is open
    return false;
  }

  // U1: Escape closes the top-most open modal through its OWN close path (runs the
  // modal's cleanup closure, so handlers + scroll-lock are released properly).
  // Registered once — this IIFE runs once at load.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal-backdrop.show')].pop();
    if (!open) return;
    const closeBtn = open.querySelector('.modal-close');
    if (closeBtn) closeBtn.click();
    else open.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // fall back to backdrop-close
  });

  // Background refresh that detects new events without disrupting the user
  let refreshing = false;
  async function quietRefresh() {
    if (!token) return;
    if (document.hidden) return; // pause when tab is in background
    if (refreshing) return;      // FE1: never overlap a slow cycle with the next 10s tick
    refreshing = true;
    const liveStatus = $('live-status');
    if (liveStatus) liveStatus.classList.add('refreshing');
    const prevAuditLen = auditLog.length;
    // Key on the stable row id, not the 1-second-granularity timestamp — two rows
    // in the same second would otherwise collide and miscount the toast.
    const prevTopId = auditLog[0]?.id;
    try {
      await Promise.all([loadTeams(), loadSignups(), loadAudit()]);
      // Detect newly arrived audit entries
      const newCount = auditLog.findIndex(a => a.id === prevTopId);
      const added = newCount === -1 ? auditLog.length - prevAuditLen : newCount;
      if (added > 0 && prevTopId) {
        showToast(`${added} nieuwe ${added === 1 ? 'gebeurtenis' : 'gebeurtenissen'} in logboek`, 'info');
      }
      // F1/T4: fresh data is already in memory; only rebuild the DOM when the
      // admin isn't mid-interaction, so we don't wipe a selection/cursor.
      if (!userIsBusy()) renderAll();
    } catch {}
    finally {
      refreshing = false;
      if (liveStatus) setTimeout(() => liveStatus.classList.remove('refreshing'), 600);
    }
  }

  // Manual refresh button — for impatient admins
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const icon = btn.querySelector('.ri');
        const label = btn.querySelector('.rl');
        const original = label ? label.textContent : '';
        if (icon) icon.classList.add('spin');
        if (label) label.textContent = 'Vernieuwen…';
        // Explicit user action → force a full load+render via the UNGUARDED path,
        // so the 'Bijgewerkt' label never lies (quietRefresh's reentrancy +
        // userIsBusy gates can otherwise skip the render while still flipping it).
        try { await refreshAll(); if (label) label.textContent = 'Bijgewerkt'; }
        catch { if (label) label.textContent = 'Mislukt'; }
        if (icon) icon.classList.remove('spin');
        setTimeout(() => {
          if (label) label.textContent = original || 'Vernieuw';
          btn.disabled = false;
        }, 1500);
      });
    }
  });


  async function loadConfig() {
    try {
      const r = await fetch('/api/config');
      const data = await r.json();
      cfg = data.event || {};
      freezeInfo = data.freeze || { frozen: false, since: null };
      countChangeEnabled = !!data.countChangeEnabled;
      $('ov-max').textContent = ` / ${cfg.maxTeams}`;
      $('ov-team-sub').textContent = `Min ${cfg.minTeams} · Max ${cfg.maxTeams} voor toernooi`;
      renderFreezeBanner();
    } catch (e) { console.warn('loadConfig mislukt', e); }
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'x-admin-token': token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      localStorage.removeItem('jvo_admin_token'); token = null;
      showLogin();
      // Tell the admin WHY the screen just flipped — the generic catch at every
      // call site would otherwise label this a "Netwerkfout". Maar ÉÉN keer: bij
      // het openen lopen er meerdere calls parallel (teams/aanmeldingen/logboek),
      // en die gaven anders alledrie hun eigen foutmelding op het inlogscherm —
      // terwijl je nog niets had ingetypt.
      if (!sessionExpiredNotified) {
        sessionExpiredNotified = true;
        showToast('Je sessie is verlopen — log opnieuw in.', 'error');
      }
      throw new Error('Sessie verlopen');
    }
    return res;
  }

  async function refreshAll() {
    await Promise.all([loadTeams(), loadSignups(), loadAudit()]);
    renderAll();
  }

  // On a failed refresh keep the LAST-KNOWN data — resetting to [] would repaint
  // the whole dashboard as if the system were empty after one hiccup of the 10s
  // background poll.
  async function loadTeams() {
    try { teams = await (await api('/api/admin/teams')).json(); } catch (e) { /* keep last-known */ }
  }
  async function loadSignups() {
    try { signups = await (await api('/api/admin/registrations')).json(); } catch (e) { /* keep last-known */ }
  }
  async function loadAudit() {
    try { auditLog = await (await api('/api/admin/audit')).json(); } catch (e) { /* keep last-known */ }
  }

  // ===== TABS =====================================================
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Refresh the tournament dashboard the moment its tab opens (the periodic
    // refresh only runs while it's the active pane — see renderAll).
    if (name === 'tournament' && typeof renderTournDashboard === 'function') { renderTournDashboard(); if (typeof loadPushPrefs === 'function') loadPushPrefs(); if (typeof loadPushTexts === 'function') loadPushTexts(); }
    if (name === 'overview' && typeof renderOverviewLive === 'function') renderOverviewLive();
  }
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  $('attention-go').addEventListener('click', () => switchTab('teams'));

  // Jump from the "wacht op beoordeling" stat straight to the pending teams.
  $('ov-pending-card')?.addEventListener('click', () => {
    setFilter('pending');
    switchTab('teams');
  });

  // Live search inputs (Teams + Aanmeldingen)
  $('team-search')?.addEventListener('input', (e) => { teamSearch = e.target.value.trim(); renderTeams(); });
  $('signup-search')?.addEventListener('input', (e) => { signupSearch = e.target.value.trim(); renderSignups(); });

  function renderFreezeBanner() {
    const banner = $('freeze-banner');
    if (!banner) return;
    banner.style.display = freezeInfo.frozen ? 'flex' : 'none';
  }

  // ===== RENDER ===================================================
  function renderAll() {
    const counts = {
      all: teams.length,
      pending: teams.filter(t => t.status === 'pending').length,
      approved: teams.filter(t => t.status === 'approved').length,
      waitlist: teams.filter(t => t.status === 'waitlist').length,
      rejected: teams.filter(t => t.status === 'rejected').length,
    };
    // Animate the KPI numbers (count-up from 0 on first paint, tween on change,
    // snap if unchanged). Falls back to a plain set if fx.js isn't loaded.
    const setNum = (el, v) => { if (!el) return; if (window.JVOFX) window.JVOFX.countUp(el, v); else el.textContent = v; };
    Object.entries(counts).forEach(([k, v]) => setNum($('cnt-' + k), v));
    setNum($('ov-signups'), signups.length);
    setNum($('ov-approved'), counts.approved);
    setNum($('ov-pending'), counts.pending);
    setNum($('ov-checkedin'), teams.filter(t => t.checked_in_at).length);

    // Aanmeldingen-tab info cards
    const marketingCount = signups.filter(s => s.consent_future_marketing).length;
    if ($('info-signups-count')) $('info-signups-count').textContent = signups.length;
    if ($('info-marketing-count')) $('info-marketing-count').textContent = marketingCount;

    const badge = $('tab-teams-badge');
    badge.textContent = counts.pending;
    badge.style.visibility = counts.pending > 0 ? 'visible' : 'hidden';

    const banner = $('attention-banner');
    if (counts.pending > 0) {
      banner.style.display = 'flex';
      $('attention-title').textContent =
        `${counts.pending} ${counts.pending === 1 ? 'team wacht' : 'teams wachten'} op beoordeling`;
    } else {
      banner.style.display = 'none';
    }

    renderTeams();
    renderSignups();
    renderAudit();
    renderRecent();
    renderTournament();
    // Only refresh the live tournament dashboard while its tab is open — avoids a
    // wasted /api/tournament fetch every cycle when the admin is on another tab.
    if (typeof renderTournDashboard === 'function' && document.getElementById('tab-tournament')?.classList.contains('active')) renderTournDashboard();
    if (typeof renderOverviewLive === 'function' && document.getElementById('tab-overview')?.classList.contains('active')) renderOverviewLive();
  }

  const STATUS_NL = { approved: 'Goedgekeurd', pending: 'Wacht op beoordeling', waitlist: 'Wachtlijst', rejected: 'Afgewezen' };

  // Teamlogo op de kaart. Rendert via de gedeelde renderer (badge = SVG uit een
  // gesloten kleurenset, foto = /team-logo/<id>) — nooit rauwe invoer in HTML.
  // Wacht het logo nog op goedkeuring, dan krijgt het een subtiel wacht-merkje.
  function teamLogoHtml(t) {
    if (!t.logo || !window.jvoLogo) return '';
    const html = window.jvoLogo.html(t.logo, 30, 'tm-logo-img');
    if (!html) return '';
    const pending = t.logo.status && t.logo.status !== 'approved';
    return `<span class="tm-logo${pending ? ' pending' : ''}"${pending ? ' title="Logo wacht op goedkeuring"' : ''}>${html}</span>`;
  }

  function teamCard(t) {
    const waiting = [
      t.rename_requested_at ? `<button class="pill waiting-rename" data-act="rename-waiting" title="Wacht op naamswijziging — klik voor opties">${ICON.clock} wacht op naam</button>` : '',
      t.count_requested_at ? `<button class="pill waiting-count" data-act="count-waiting" title="Wacht op aantal spelers — klik voor opties">${ICON.clock} wacht op aantal</button>` : '',
      t.renames && t.renames.length ? `<button class="pill renamed" data-act="rename-info" title="Bekijk wat de captain heeft veranderd">${ICON.pencil} naam gewijzigd</button>` : '',
    ].join('');
    const actions = [
      t.status === 'approved' ? `<button class="btn-sm qr" data-act="qr">QR ↗</button>` : '',
      t.status !== 'rejected' ? `<button class="btn-sm btn-icon" data-act="adjust" title="Captain laten aanpassen (teamnaam of aantal spelers)">${ICON.pencil} Aanpassen</button>` : '',
      t.status !== 'approved' ? `<button class="btn-sm primary" data-act="approve">Goedkeuren</button>` : '',
      (t.status === 'pending' || t.status === 'rejected') ? `<button class="btn-sm" data-act="waitlist">Wachtlijst</button>` : '',
      t.status === 'approved' ? `<button class="btn-sm" data-act="revoke">Intrekken</button>` : '',
      t.status === 'pending' ? `<button class="btn-sm danger" data-act="reject">Afwijzen</button>` : '',
      t.status !== 'approved' ? `<button class="btn-sm danger btn-icon" data-act="delete" title="Definitief verwijderen" aria-label="Verwijderen">${ICON.trash}</button>` : '',
    ].join('');
    return `
      <div class="tm-card s-${t.status}" data-id="${t.id}" tabindex="0" role="button" aria-label="Open team ${escape(t.team_name)}">
        <div class="tm-card-head">
          ${teamLogoHtml(t)}
          <div class="tm-card-name">${escape(t.team_name)}</div>
          <span class="pill ${t.status}">${STATUS_NL[t.status] || t.status}</span>
        </div>
        <div class="tm-card-cap"><span class="nm">${escape(t.captain_name)}</span><span class="em">${escape(t.captain_email)}</span></div>
        <div class="tm-card-tags">
          <span class="tm-tag">${t.expected_players} spelers</span>
          ${window.JVO_HUB_NAMES && window.JVO_HUB_NAMES[t.competition_id] ? `<span class="tm-tag">${escape(window.JVO_HUB_NAMES[t.competition_id])}</span>` : ''}
          ${t.checked_in_at ? '<span class="tm-tag ci">' + ICON.check + ' ingecheckt</span>' : ''}
          ${waiting}
        </div>
        <div class="tm-card-actions" data-actions>${actions}</div>
      </div>`;
  }

  function renderTeams() {
    const wrap = $('teams-cards');
    if (!wrap) return;
    let visible = currentFilter === 'all' ? teams : teams.filter(t => t.status === currentFilter);
    if (teamSearch) {
      const q = teamSearch.toLowerCase();
      visible = visible.filter(t =>
        (t.team_name || '').toLowerCase().includes(q) ||
        (t.captain_name || '').toLowerCase().includes(q) ||
        (t.captain_email || '').toLowerCase().includes(q)
      );
    }
    if (visible.length === 0) {
      wrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${teamSearch ? `Geen teams gevonden voor "${escape(teamSearch)}".` : 'Geen teams in deze filter.'}</div>`;
      return;
    }
    wrap.innerHTML = visible.map(teamCard).join('');

    // Action buttons act in place; their clicks never bubble up to open the modal.
    wrap.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); handleAction(btn); });
    });
    // Clicking the card body (anywhere but a button) opens the team detail modal.
    wrap.querySelectorAll('.tm-card').forEach(card => {
      const open = () => openTeamModal(parseInt(card.dataset.id, 10));
      card.addEventListener('click', (e) => { if (!e.target.closest('button, a')) open(); });
      card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, a')) { e.preventDefault(); open(); } });
    });
  }

  // ===== TEAM DETAIL MODAL (click a team) — info + per-captain schedule mail ===
  let teamModalId = null;
  function openTeamModal(id) {
    const t = teams.find(x => x.id === id);
    if (!t) return;
    teamModalId = id;
    $('team-modal-name').textContent = t.team_name;
    $('team-modal-status').innerHTML =
      `<span class="pill ${t.status}">${STATUS_NL[t.status] || t.status}</span>` +
      (t.checked_in_at ? ' <span class="pill checked-in">ingecheckt</span>' : '');
    $('team-modal-captain').textContent = t.captain_name;
    $('team-modal-email').textContent = t.captain_email;
    $('team-modal-players').textContent = t.expected_players;
    $('team-modal-checkin').textContent = t.checked_in_at ? fmtTime(t.checked_in_at) : 'Nog niet';
    // Per-captain schedule only makes sense once a team is approved (+ generated).
    $('team-modal-schema').classList.toggle('off', t.status !== 'approved');
    $('team-modal-schema-result').textContent = '';
    $('team-modal-qr').style.display = t.status === 'approved' ? '' : 'none';
    $('team-modal-mailto').href = `mailto:${t.captain_email}`;
    $('team-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeTeamModal() { $('team-modal').classList.remove('show'); document.body.style.overflow = ''; teamModalId = null; }

  async function teamSchemaPreview() {
    if (!teamModalId) return;
    const res = $('team-modal-schema-result'); res.textContent = 'Laden…';
    try {
      const r = await api(`/api/admin/tournament/schedule-preview/${teamModalId}`);
      const j = await r.json();
      if (!r.ok) { res.innerHTML = `<span style="color:var(--gold-2)">${escape(j.error || 'Kon preview niet laden')}</span>`; return; }
      const w = window.open('', '_blank');
      if (w) { w.document.open(); w.document.write(j.html); w.document.close(); w.document.title = 'Schema-mail · ' + j.team; res.textContent = ''; }
      else res.innerHTML = '<span style="color:var(--gold-2)">Pop-up geblokkeerd — sta pop-ups toe voor deze site.</span>';
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout.</span>'; }
  }
  async function teamSchemaSend() {
    if (!teamModalId) return;
    const t = teams.find(x => x.id === teamModalId);
    if (!t) return;
    if (!confirm(`Het persoonlijke speelschema mailen naar ${t.captain_name} (${t.captain_email})?\n\nNa bevestigen heb je 8 seconden om dit ongedaan te maken.`)) return;
    const btn = $('team-modal-schema-send'); const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Versturen…';
    const res = $('team-modal-schema-result'); res.textContent = '';
    try {
      const r = await api(`/api/admin/tournament/send-schedule/${teamModalId}`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) res.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Versturen mislukt')}</span>`;
      else if (j.actionId && j.undoWindowMs) {
        res.innerHTML = `<span style="color:var(--gold-2)">Wordt over ${Math.round(j.undoWindowMs / 1000)}s verstuurd naar ${escape(j.to)} — annuleren kan via de melding.</span>`;
        showUndoToast({
          message: `Schema gaat naar ${j.captain}`,
          actionId: j.actionId,
          undoWindowMs: j.undoWindowMs,
          onUndo: async (actionId) => { const rr = await api(`/api/admin/undo/${actionId}`, { method: 'POST' }); if (!rr.ok) throw new Error('Undo failed'); },
        });
      } else { res.innerHTML = `<span style="color:var(--success)">${ICON.check} Schema verstuurd naar ${escape(j.to)}</span>`; showToast(`Schema gemaild naar ${j.captain}`); }
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; }
    finally { btn.disabled = false; btn.textContent = orig; }
  }
  $('team-modal-close')?.addEventListener('click', closeTeamModal);
  $('team-modal-close-2')?.addEventListener('click', closeTeamModal);
  $('team-modal')?.addEventListener('click', (e) => { if (e.target.id === 'team-modal') closeTeamModal(); });
  $('team-modal-schema-preview')?.addEventListener('click', teamSchemaPreview);
  $('team-modal-schema-send')?.addEventListener('click', teamSchemaSend);
  $('team-modal-qr')?.addEventListener('click', () => { const t = teams.find(x => x.id === teamModalId); if (t) { closeTeamModal(); openQR(t); } });

  // ===== TOERNOOI TAB ============================================
  let tournamentStatuses = []; // populated on first render via API

  async function loadTournamentStatuses() {
    if (tournamentStatuses.length > 0) return tournamentStatuses;
    try {
      const res = await api('/api/admin/tournament-statuses');
      tournamentStatuses = await res.json();
    } catch (e) {
      console.error('Could not load tournament statuses:', e);
      tournamentStatuses = [];
    }
    return tournamentStatuses;
  }

  async function renderTournament() {
    await loadTournamentStatuses();
    const approvedTeams = teams.filter(t => t.status === 'approved');
    const tbody = $('tournament-tbody');
    if (!tbody) return;
    if (approvedTeams.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Nog geen goedgekeurde teams. Keur teams eerst goed in het tabblad "Teams".</td></tr>`;
      return;
    }
    tbody.innerHTML = approvedTeams.map(t => {
      const currentStatus = t.tournament_status || 'group';
      const optionsHtml = tournamentStatuses.map(s =>
        `<option value="${s.key}"${s.key === currentStatus ? ' selected' : ''}>${escape(s.label)}</option>`
      ).join('');
      const statusCfg = tournamentStatuses.find(s => s.key === currentStatus);
      const sendsMail = statusCfg?.sendsMail;
      const alreadySent = t.tournament_mail_sent_for_status === currentStatus;
      // Did the automatic push for the CURRENT status already go out?
      const pushSent = t.tournament_push_sent_for_status === currentStatus;
      const notifTag = currentStatus === 'group'
        ? `<div class="small muted" style="margin-top:5px;">nog in groepsfase — geen melding</div>`
        : (pushSent
            ? `<div class="small" style="margin-top:5px; color:var(--success);">${ICON.check} melding automatisch gestuurd</div>`
            : `<div class="small muted" style="margin-top:5px;">geen melding (push staat uit of geen volgers)</div>`);
      let mailBtnLabel = '—';
      let mailBtnDisabled = '';
      let mailBtnClass = 'btn-sm';
      if (sendsMail && alreadySent) {
        mailBtnLabel = ICON.check + ' Verstuurd';
        mailBtnClass = 'btn-sm muted-btn';
      } else if (sendsMail) {
        mailBtnLabel = 'Mail los →';
        mailBtnClass = 'btn-sm';
      } else {
        mailBtnDisabled = 'disabled';
        mailBtnClass = 'btn-sm muted-btn';
      }
      return `
        <tr data-team-id="${t.id}">
          <td><b>${escape(t.team_name)}</b></td>
          <td>${escape(t.captain_name)}<br><span class="small muted">${escape(t.captain_email)}</span></td>
          <td>
            <select class="tournament-status-select" data-team-id="${t.id}" style="background: var(--midnight); border: 1px solid var(--line-strong); color: var(--ice); padding: 6px 8px; border-radius: 4px; font-size: 13px;">
              ${optionsHtml}
            </select>
            ${notifTag}
          </td>
          <td>
            <button class="${mailBtnClass} tournament-mail-btn" data-team-id="${t.id}" ${mailBtnDisabled}>${mailBtnLabel}</button>
          </td>
        </tr>
      `;
    }).join('');

    // Wire status-select changes (set status without mail)
    document.querySelectorAll('.tournament-status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const teamId = e.target.dataset.teamId;
        const newStatus = e.target.value;
        e.target.disabled = true; // prevent rapid changes racing while the POST is in flight
        try {
          const res = await api(`/api/admin/teams/${teamId}/tournament-status`, {
            method: 'POST',
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) {
            const err = await res.json();
            alert('Fout: ' + (err.error || 'onbekend'));
          }
          await refreshAll(); // re-render
        } catch (e) {
          alert('Netwerkfout: ' + e.message);
          await refreshAll(); // re-sync the dropdown to the saved value
        } finally {
          e.target.disabled = false;
        }
      });
    });

    // Wire mail-button clicks
    document.querySelectorAll('.tournament-mail-btn').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', async () => {
        const teamId = btn.dataset.teamId;
        const team = teams.find(t => t.id == teamId);
        const status = team?.tournament_status || 'group';
        const cfg = tournamentStatuses.find(s => s.key === status);
        if (!cfg?.sendsMail) return;

        const origLabel = btn.textContent;
        const origDisabled = btn.disabled;
        btn.disabled = true;
        btn.textContent = 'Versturen...';
        try {
          const res = await api(`/api/admin/teams/${teamId}/tournament-mail`, {
            method: 'POST',
            body: JSON.stringify({ status }),
          });
          const json = await res.json();

          if (!res.ok) {
            if (json.already_sent) {
              const force = confirm(`Mail is al verstuurd. Toch opnieuw versturen?`);
              if (force) {
                const res2 = await api(`/api/admin/teams/${teamId}/tournament-mail`, {
                  method: 'POST',
                  body: JSON.stringify({ status, force: true }),
                });
                const json2 = await res2.json();
                if (!res2.ok) {
                  alert('Fout: ' + json2.error);
                } else if (json2.actionId) {
                  showUndoToast({
                    message: `Mail "${cfg.label}" gaat naar ${team.captain_name}`,
                    actionId: json2.actionId,
                    undoWindowMs: json2.undoWindowMs,
                    onUndo: async (actionId) => {
                      const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
                      if (!r.ok) throw new Error('Undo failed');
                      await refreshAll();
                    },
                  });
                }
              }
            } else {
              alert('Fout: ' + (json.error || 'onbekend'));
            }
            await refreshAll();
            return;
          }

          // Success path with undo toast
          if (json.actionId && json.undoWindowMs) {
            showUndoToast({
              message: `Mail "${cfg.label}" gaat naar ${team.captain_name}`,
              actionId: json.actionId,
              undoWindowMs: json.undoWindowMs,
              onUndo: async (actionId) => {
                const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
                if (!r.ok) throw new Error('Undo failed');
                await refreshAll();
              },
            });
          }
          await refreshAll();
        } catch (e) {
          alert('Netwerkfout: ' + e.message);
          btn.disabled = origDisabled;
          btn.textContent = origLabel;
        }
      });
    });
  }

  let currentSignupsTab = 'all';

  function renderSignups() {
    let filtered = currentSignupsTab === 'marketing'
      ? signups.filter(r => r.consent_future_marketing)
      : signups;
    if (signupSearch) {
      const q = signupSearch.toLowerCase();
      filtered = filtered.filter(r =>
        (r.full_name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q)
      );
    }

    // Update counts in subtab pills
    if ($('subtab-count-all')) $('subtab-count-all').textContent = signups.length;
    if ($('subtab-count-marketing')) {
      $('subtab-count-marketing').textContent = signups.filter(r => r.consent_future_marketing).length;
    }

    // Update heading + sub
    if (currentSignupsTab === 'marketing') {
      $('signups-list-heading').textContent = 'Mailinglijst (toekomst)';
      $('signups-list-sub').textContent = 'Alleen aanmelders die toestemming gaven voor toekomstige communicatie. Klik op een naam voor details.';
    } else {
      $('signups-list-heading').textContent = 'Volledige aanmeldlijst';
      $('signups-list-sub').textContent = 'Alle aanmeldingen in chronologische volgorde. Klik op een naam voor details.';
    }

    $('signups-tbody').innerHTML = filtered.map(r => `
      <tr class="clickable" data-signup-id="${r.id}">
        <td class="mono small muted">${fmtTime(r.created_at)}</td>
        <td><a href="#" class="signup-name-link" data-signup-id="${r.id}">${escape(r.full_name)}</a></td>
        <td>${escape(r.email)}</td>
        <td>${r.consent_future_marketing ? `<span style="color:var(--success)">${ICON.check}</span>` : '—'}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" class="empty-state">${currentSignupsTab === 'marketing' ? 'Geen aanmeldingen op de mailinglijst.' : 'Nog geen aanmeldingen.'}</td></tr>`;
  }

  // ===== PERSON MODAL ===============================================
  let currentPersonId = null; // tracked for the delete button

  function openPersonModal(signupId) {
    const r = signups.find(s => s.id == signupId);
    if (!r) return;
    currentPersonId = r.id;
    $('person-modal-name').textContent = r.full_name;
    $('person-modal-email').textContent = r.email;
    $('person-modal-date').textContent = fmtTime(r.created_at);
    $('person-modal-marketing').innerHTML = r.consent_future_marketing
      ? `<span style="color:var(--success)">${ICON.check}</span> Ja — staat op mailinglijst voor toekomstige edities`
      : '— Nee, alleen dit evenement';
    // Find if this person is a captain of any team
    const team = teams.find(t => t.captain_email === r.email);
    const blocked = $('person-modal-blocked');
    const deleteBtn = $('person-modal-delete');
    if (team) {
      $('person-modal-team').innerHTML =
        `Captain van <b>${escape(team.team_name)}</b> (${team.expected_players} spelers, status: ${escape(STATUS_NL[team.status] || team.status)})`;
      // Block delete: show explanation, disable button
      if (blocked) {
        blocked.style.display = 'block';
        blocked.innerHTML =
          `${ICON.warn} Deze persoon kan niet verwijderd worden zolang team <b>${escape(team.team_name)}</b> bestaat. ` +
          `Verwijder of pas eerst het team aan via het Teams-tabblad.`;
      }
      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.title = 'Geblokkeerd — persoon is captain van een team';
      }
    } else {
      $('person-modal-team').textContent = '— Geen team, alleen bezoeker';
      if (blocked) blocked.style.display = 'none';
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.title = '';
      }
    }
    // mailto link
    const subject = encodeURIComponent(`Bericht van ${(cfg && cfg.name) || 'JVO'}`);
    const body = encodeURIComponent(`Hoi ${r.full_name.split(' ')[0]},\n\n`);
    $('person-modal-mailto').href = `mailto:${r.email}?subject=${subject}&body=${body}`;
    $('person-modal').classList.add('show');
  }

  function closePersonModal() {
    $('person-modal').classList.remove('show');
    currentPersonId = null;
  }

  async function deleteCurrentPerson() {
    if (!currentPersonId) return;
    const r = signups.find(s => s.id == currentPersonId);
    if (!r) return;

    const ok = confirm(
      `Weet je zeker dat je "${r.full_name}" (${r.email}) wilt verwijderen?\n\n` +
      `Je hebt 8 seconden om dit ongedaan te maken na bevestigen.`
    );
    if (!ok) return;

    const btn = $('person-modal-delete');
    btn.disabled = true;
    btn.textContent = 'Verwijderen…';
    try {
      const res = await api(`/api/admin/registrations/${currentPersonId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        alert('Fout: ' + (json.error || 'onbekend'));
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg> Verwijderen`;
        return;
      }
      closePersonModal();
      if (json.actionId && json.undoWindowMs) {
        showUndoToast({
          message: `${json.deleted.full_name} verwijderd`,
          actionId: json.actionId,
          undoWindowMs: json.undoWindowMs,
          onUndo: async (actionId) => {
            const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
            if (!r.ok) throw new Error('Undo failed');
            await refreshAll();
          },
        });
      }
      await refreshAll();
    } catch (e) {
      alert('Netwerkfout: ' + (e.message || 'onbekend'));
      btn.disabled = false;
    }
  }

  // Wire person modal events
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.signup-name-link');
    if (link) {
      e.preventDefault();
      openPersonModal(link.dataset.signupId);
    }
  });
  $('person-modal-close')?.addEventListener('click', closePersonModal);
  $('person-modal-close-2')?.addEventListener('click', closePersonModal);
  $('person-modal-delete')?.addEventListener('click', deleteCurrentPerson);
  $('person-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'person-modal') closePersonModal();
  });

  // Wire subtab clicks
  document.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSignupsTab = btn.dataset.signupsTab;
      document.querySelectorAll('.subtab').forEach(s => {
        const active = s === btn;
        s.classList.toggle('active', active);
        s.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderSignups();
    });
  });

  let currentAuditFilter = 'all';

  // Friendly Dutch labels for audit/recent rows. Unknown codes fall back to a
  // humanised version of the raw string so nothing ever shows as blank.
  const ACTION_LABELS = {
    login_success: 'Ingelogd',
    login_failed: 'Mislukte login',
    team_approved: 'Team goedgekeurd',
    team_rejected: 'Team afgewezen',
    team_waitlist: 'Team op wachtlijst',
    team_pending: 'Team teruggezet naar wachten',
    team_revoked: 'Goedkeuring ingetrokken',
    team_renamed: 'Teamnaam gewijzigd door captain',
    team_rename_requested: 'Naam-link gestuurd',
    team_rename_request_undone: 'Naam-link ongedaan gemaakt',
    team_rename_cancelled: 'Naam-verzoek geannuleerd',
    team_count_changed: 'Aantal spelers gewijzigd door captain',
    team_count_requested: 'Aantal-link gestuurd',
    team_count_request_undone: 'Aantal-link ongedaan gemaakt',
    team_count_cancelled: 'Aantal-verzoek geannuleerd',
    team_deleted: 'Team definitief verwijderd',
    team_delete_queued: 'Team verwijderd (undo-venster)',
    team_delete_undone: 'Team-verwijdering ongedaan gemaakt',
    team_checked_in: 'Team ingecheckt',
    registration_deleted: 'Aanmelding definitief verwijderd',
    registration_delete_queued: 'Aanmelding verwijderd (undo-venster)',
    registration_delete_undone: 'Verwijdering ongedaan gemaakt',
    action_undone: 'Actie ongedaan gemaakt',
    mail_sent: 'Mail verstuurd',
    tournament_generated: 'Toernooischema gegenereerd',
    tournament_score: 'Uitslag ingevoerd',
    tournament_match_start: 'Wedstrijd gestart',
    tournament_match_end: 'Wedstrijd beëindigd',
    tournament_match_score: 'Stand bijgewerkt',
    tournament_reset: 'Toernooi gewist',
    tournament_status_set: 'Toernooi-status gewijzigd',
    tournament_status_undone: 'Toernooi-status teruggedraaid',
    tournament_schedules_send_pending: 'Schema-mails gepland',
    tournament_schedules_send_cancelled: 'Schema-mails geannuleerd',
    tournament_schedule_send_cancelled: 'Schema-mail geannuleerd',
    prize_announce_sent: 'Sponsor-mails verstuurd',
    event_config_saved: 'Evenement-instellingen opgeslagen',
    rules_saved: 'Spelregels opgeslagen',
    wipe_all_data: 'Schone start — alle data gewist',
    program_info_sent: 'Programma-mails verstuurd',
    qr_mails_sent: 'QR-mails verstuurd',
    eventday_mails_sent: '\u2018Vandaag is de dag\u2019-mails verstuurd',
    data_export: 'Data-export gedownload',
    tournament_auto_shift_toggle: 'Auto-uitloop aan/uit gezet',
    feedback_mails_sent: 'Bedank/feedback-mails verstuurd',
    tournament_mail_failed: 'Toernooi-mail mislukt',
  };
  function actionLabel(action) {
    if (!action) return '—';
    if (ACTION_LABELS[action]) return ACTION_LABELS[action];
    if (action.endsWith('_undone')) return actionLabel(action.replace(/_undone$/, '')) + ' (ongedaan)';
    return action.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }

  // Categorize actions for the audit-tab filter pills
  function auditCategory(action) {
    if (!action) return 'other';
    if (action === 'team_checked_in') return 'checkin';
    if (action.startsWith('team_') || action.startsWith('action_')) return 'teams';
    if (action === 'mail_sent') return 'mail';
    return 'other';
  }

  function renderAudit() {
    const filtered = currentAuditFilter === 'all'
      ? auditLog
      : auditLog.filter(a => auditCategory(a.action) === currentAuditFilter);
    $('audit-tbody').innerHTML = filtered.map(a => `
      <tr>
        <td class="mono small muted">${fmtTime(a.timestamp)}</td>
        <td>${escape(a.actor_name)}</td>
        <td class="small"><b>${escape(actionLabel(a.action))}</b></td>
        <td class="small">${escape(a.target_type ? `${a.target_type} #${a.target_id}` : '—')}${a.details ? ` <span class="muted">— ${escape(a.details)}</span>` : ''}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" class="empty-state">Geen logregels in dit filter.</td></tr>`;
  }

  function renderRecent() {
    const recent = auditLog.slice(0, 5);
    $('recent-activity').innerHTML = recent.map(a => `
      <div class="recent-row">
        <div class="time">${fmtTime(a.timestamp)}</div>
        <div class="who">${escape(a.actor_name)}</div>
        <div class="action">${escape(actionLabel(a.action))}${a.target_type ? ` <span class="muted">→ ${escape(a.target_type)} #${a.target_id}</span>` : ''}</div>
      </div>
    `).join('') || `<div class="empty-state">Nog geen activiteit.</div>`;
  }

  // Render the per-admin profile card (email + notification toggles)
  function renderProfile() {
    const profile = getProfile(adminName);
    if ($('profile-email')) $('profile-email').value = profile.email || '';
    if ($('profile-notify-signups')) $('profile-notify-signups').checked = !!profile.notifySignups;
    if ($('profile-notify-teams')) $('profile-notify-teams').checked = !!profile.notifyTeams;
    if ($('profile-notify-push-signups')) $('profile-notify-push-signups').checked = !!profile.notifyPushSignups;
    if ($('profile-notify-push-teams')) $('profile-notify-push-teams').checked = !!profile.notifyPushTeams;
  }
  function attachProfileHandlers() {
    const save = () => {
      const profile = {
        email: $('profile-email').value.trim(),
        notifySignups: $('profile-notify-signups').checked,
        notifyTeams: $('profile-notify-teams').checked,
        notifyPushSignups: $('profile-notify-push-signups').checked,
        notifyPushTeams: $('profile-notify-push-teams').checked,
      };
      saveProfile(adminName, profile);
      syncProfileToServer(adminName, profile);
      showToast('Notificatie-voorkeuren opgeslagen');
    };
    if ($('profile-save')) $('profile-save').addEventListener('click', save);
  }
  attachProfileHandlers();

  // ===== REMINDER WAVES ==========================================
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : '—';

  function renderReminderWave(key, w) {
    const badge = $(`rem-${key}-badge`);
    const meta = $(`rem-${key}-meta`);
    const btn = $(`rem-${key}-send`);
    if (!badge || !meta) return;
    const done = w.eligible > 0 && w.remaining === 0;
    badge.innerHTML = done ? `${ICON.check} verstuurd` : (w.due ? 'nu gepland' : 'gepland');
    badge.className = 'reminder-badge' + (done ? ' done' : (w.due ? ' due' : ''));
    meta.innerHTML = `Gepland rond <b>${fmtDate(w.target)}</b>.<br/>Verstuurd: <b>${w.sent}</b> · nog te gaan: <b>${w.remaining}</b> van ${w.eligible}.`;
    if (btn) btn.textContent = w.remaining > 0 ? (key === 'week' ? 'Verstuur 1-week nu' : 'Verstuur 24-uur nu') : 'Opnieuw sturen (0 over)';
  }

  async function loadReminderStatus() {
    try {
      const res = await api('/api/admin/reminders/status');
      const json = await res.json();
      renderReminderWave('week', json.waves.week);
      renderReminderWave('day', json.waves.day);
    } catch (e) { /* niet kritisch */ }
  }

  async function sendReminderWave(key) {
    const label = key === 'week' ? '1-week' : '24-uur';
    const res = await api('/api/admin/reminders/status').then(r => r.json()).catch(() => null);
    const remaining = res?.waves?.[key]?.remaining ?? '?';
    if (!confirm(`De ${label}-herinnering nu versturen naar ${remaining} ${remaining === 1 ? 'persoon' : 'mensen'} die 'm nog niet had?\n\nMensen die deze golf al kregen, krijgen niks dubbel.`)) return;
    const btn = $(`rem-${key}-send`);
    if (btn) { btn.disabled = true; btn.textContent = 'Versturen…'; }
    try {
      const r = await api('/api/admin/reminders/send', { method: 'POST', body: JSON.stringify({ wave: key }) });
      const json = await r.json();
      if (!r.ok) { alert('Fout: ' + (json.error || r.status)); }
      else { showToast(`${label}-herinnering: ${json.sent} verstuurd${json.failed ? `, ${json.failed} mislukt` : ''}`); }
    } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    finally { if (btn) btn.disabled = false; await loadReminderStatus(); await refreshAll(); }
  }

  $('rem-week-send')?.addEventListener('click', () => sendReminderWave('week'));
  $('rem-day-send')?.addEventListener('click', () => sendReminderWave('day'));
  $('rem-test')?.addEventListener('click', async () => {
    const btn = $('rem-test');
    btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Versturen…';
    try {
      const r = await api('/api/admin/reminders/test', { method: 'POST', body: JSON.stringify({}) });
      const json = await r.json();
      if (!r.ok) alert('Fout: ' + (json.error || r.status));
      else showToast(`${json.sent} testmails verstuurd naar ${json.to}`);
    } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    finally { btn.disabled = false; btn.textContent = orig; }
  });

  // ===== TOURNAMENT SCHEMA =======================================
  const TOURN_POULES = ['A', 'B', 'C', 'D'];
  const TC_FMT = { '16': { poules: 4, size: 4 }, '18': { poules: 3, size: 6 }, '20': { poules: 4, size: 5 } };
  let selectedFormat = '16';
  let fmtInitialized = false;
  let schedInitialized = false;
  let setupFoldInit = false;

  function fillSchedForm(s) {
    if (!s) return;
    if ($('sched-start')) $('sched-start').value = s.start_time || '15:30';
    if ($('sched-fields')) $('sched-fields').value = s.fields ?? 5;
    if ($('sched-match')) $('sched-match').value = s.match_min ?? 10;
    if ($('sched-break')) $('sched-break').value = s.break_min ?? 5;
    renderFieldRoles(s.fields ?? 3, s.field_roles || {}, s.main_field);
    if ($('sched-fairness')) $('sched-fairness').checked = s.fairness !== false;
    if ($('sched-ko-block')) $('sched-ko-block').checked = !!s.ko_block;
    if ($('sched-ko-buffer')) $('sched-ko-buffer').value = String(s.ko_buffer_slots ?? 0);
    updateKoBufferHint();
  }

  // Toon de reserve in minuten (ronden × [wedstrijd + wisseltijd]) zodat de admin
  // ziet hoeveel speling een reserve-ronde oplevert.
  function updateKoBufferHint() {
    const hint = $('sched-ko-buffer-hint'); if (!hint) return;
    const slots = parseInt(($('sched-ko-buffer') || {}).value, 10) || 0;
    const per = (parseInt(($('sched-match') || {}).value, 10) || 0) + (parseInt(($('sched-break') || {}).value, 10) || 0);
    hint.textContent = slots ? `≈ ${slots * per} min speling` : 'geen speling';
  }

  // Veldrollen-dropdowns: één per veld, met precies één hoofdveld. Bij een
  // wijziging naar 'hoofdveld' zakt het vorige hoofdveld terug naar 'normaal'.
  // roleDraft onthoudt de rollen los van het DOM: tijdens het typen van het
  // veldenaantal (tijdelijk "1" onderweg naar "10") verdwijnen selects uit het
  // DOM — zonder draft zouden de rollen van veld 2+ dan stil verloren gaan.
  let roleDraft = {};
  function renderFieldRoles(n, roles, mainField) {
    const wrap = $('sched-roles');
    if (!wrap) return;
    const count = Math.max(1, Math.min(12, parseInt(n, 10) || 3));
    Object.assign(roleDraft, roles);
    const explicitMain = Object.values(roleDraft).includes('hoofdveld');
    const roleOf = (f) => roleDraft[String(f)] || ((!explicitMain && f === (mainField || 1)) ? 'hoofdveld' : 'normaal');
    wrap.innerHTML = Array.from({ length: count }, (_, i) => {
      const f = i + 1;
      const r = roleOf(f);
      return `<label>Veld ${f}<select data-role-field="${f}">
        <option value="hoofdveld"${r === 'hoofdveld' ? ' selected' : ''}>Hoofdveld</option>
        <option value="normaal"${r === 'normaal' ? ' selected' : ''}>Normaal</option>
        <option value="ontzien"${r === 'ontzien' ? ' selected' : ''}>Ontzien</option>
      </select></label>`;
    }).join('');
    // Zonder expliciet hoofdveld: veld 1 (of laagste niet-ontzien) tonen als hoofdveld.
    if (![...wrap.querySelectorAll('select')].some(s => s.value === 'hoofdveld')) {
      const first = [...wrap.querySelectorAll('select')].find(s => s.value !== 'ontzien') || wrap.querySelector('select');
      if (first) first.value = 'hoofdveld';
    }
  }
  $('sched-roles')?.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-role-field]');
    if (!sel) return;
    const all = [...$('sched-roles').querySelectorAll('select[data-role-field]')];
    if (sel.value === 'hoofdveld') {
      for (const s of all) if (s !== sel && s.value === 'hoofdveld') s.value = 'normaal';
    } else if (!all.some(s => s.value === 'hoofdveld')) {
      // het hoofdveld weggeklikt → dit veld was het; zet het laagste normale veld
      const first = all.find(s => s !== sel && s.value === 'normaal') || all.find(s => s !== sel);
      if (first) first.value = 'hoofdveld'; else sel.value = 'hoofdveld';
    }
    // draft bijwerken vanaf het DOM (alle zichtbare velden, ook terug naar normaal)
    for (const s of all) {
      if (s.value === 'normaal') delete roleDraft[s.dataset.roleField];
      else roleDraft[s.dataset.roleField] = s.value;
    }
  });
  // Meer/minder velden → rollen-grid meteen mee laten groeien. De rollen komen
  // uit roleDraft (niet alleen het DOM), zodat tijdelijk verborgen velden hun
  // rol behouden; ongeldige tussenwaarde tijdens het typen = niet her-renderen.
  $('sched-fields')?.addEventListener('input', () => {
    const v = parseInt(($('sched-fields') || {}).value, 10);
    if (!Number.isInteger(v) || v < 1 || v > 12) return;
    document.querySelectorAll('#sched-roles select[data-role-field]').forEach(s => {
      if (s.value === 'normaal') delete roleDraft[s.dataset.roleField];
      else roleDraft[s.dataset.roleField] = s.value;
    });
    renderFieldRoles(v, {}, null);
  });
  $('sched-ko-buffer')?.addEventListener('change', updateKoBufferHint);
  $('sched-match')?.addEventListener('input', updateKoBufferHint);
  $('sched-break')?.addEventListener('input', updateKoBufferHint);

  function approvedCount() { return teams.filter(t => t.status === 'approved').length; }
  // Recommend the smallest format that fits the approved-team count.
  function recommendedFormat(n) { return n <= 16 ? '16' : n <= 18 ? '18' : '20'; }

  function selectFormat(fmt) {
    if (!TC_FMT[fmt]) return;
    selectedFormat = fmt;
    document.querySelectorAll('#tc-formats .tc-fmt').forEach(b => b.classList.toggle('sel', b.dataset.fmt === fmt));
    updateFmtHint();
    renderVariantPicker();
  }

  // Knock-out-varianten per format (spiegel van BRACKET_VARIANTS in
  // tournament.js). Les van editie 1: de vrijloting van topseeds geeft ±65 min
  // wachttijd tussen poules en kwartfinale — de varianten zijn de echte knop
  // daarvoor. Alleen getoond bij formats met meer dan één variant.
  const TC_VARIANTS = {
    '18': [
      { key: 'standaard', label: 'Standaard — top 4 vrijgeloot', desc: 'top 3 + beste nr. 4 + play-off · topseeds wachten ±65 min op de kwartfinale' },
      { key: 'iedereen-ko', label: 'Iedereen-KO — achtste finales', desc: '16 van de 18 door · topseeds spelen direct na de poules (±45 min wachten) · dag ±15 min langer' },
      { key: 'compact-8', label: 'Compact — alleen top 8', desc: 'meteen kwartfinales · dag ±30 min korter · 4 KO-plekken minder' },
    ],
  };
  let selectedVariant = 'standaard';
  function renderVariantPicker() {
    const wrap = $('tc-variants'), lbl = $('tc-variant-label');
    if (!wrap) return;
    const list = TC_VARIANTS[selectedFormat] || [];
    const show = list.length > 1;
    wrap.hidden = !show;
    if (lbl) lbl.hidden = !show;
    if (!show) { selectedVariant = 'standaard'; wrap.innerHTML = ''; return; }
    if (!list.some(v => v.key === selectedVariant)) selectedVariant = 'standaard';
    wrap.innerHTML = list.map(v => `
      <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; margin:6px 0;">
        <input type="radio" name="tc-variant" value="${v.key}"${v.key === selectedVariant ? ' checked' : ''} style="margin-top:3px;" />
        <span><b>${v.label}</b> <span class="muted small">— ${v.desc}</span></span>
      </label>`).join('');
  }
  $('tc-variants')?.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'tc-variant') selectedVariant = e.target.value;
  });

  // Per-card "fit" line + recommended badge + the contextual hint below the cards.
  function updateFmtHint() {
    const n = approvedCount();
    const rec = recommendedFormat(n);
    document.querySelectorAll('#tc-formats .tc-fmt').forEach(b => {
      const cfg = TC_FMT[b.dataset.fmt];
      const fitEl = b.querySelector('[data-fit]');
      if (fitEl) {
        const per = n ? n / cfg.poules : cfg.size;
        fitEl.textContent = n ? `${cfg.poules} poules · ~${per % 1 === 0 ? per : per.toFixed(1)} per poule` : `${cfg.poules} poules van ${cfg.size}`;
      }
      let recEl = b.querySelector('.rec');
      if (n > 0 && b.dataset.fmt === rec) {
        if (!recEl) { recEl = document.createElement('div'); recEl.className = 'rec'; recEl.textContent = 'aanbevolen'; b.appendChild(recEl); }
      } else if (recEl) recEl.remove();
    });
    const hint = $('tc-fmt-hint');
    if (!hint) return;
    hint.className = 'tc-fmt-hint';
    if (n === 0) { hint.textContent = 'Nog geen goedgekeurde teams. Keur eerst teams goed op de Teams-tab, dan kun je het schema genereren.'; return; }
    const cfg = TC_FMT[selectedFormat];
    const base = Math.floor(n / cfg.poules), rem = n % cfg.poules;
    const split = rem ? `${rem}× ${base + 1} en ${cfg.poules - rem}× ${base}` : `${cfg.poules}× ${base}`;
    if (n === Number(selectedFormat)) {
      hint.classList.add('ok');
      hint.innerHTML = `<b>${n} goedgekeurde teams</b> — past perfect bij opzet ${selectedFormat}: ${cfg.poules} poules van ${base}.`;
    } else {
      hint.classList.add('warn');
      hint.innerHTML = `<b>${n} goedgekeurde teams</b> bij opzet ${selectedFormat} → poules van ${split}.` + (selectedFormat !== rec ? ` Aanbevolen voor dit aantal: <b>opzet ${rec}</b>.` : '');
    }
  }

  function tcTile(v, k, cls) { return `<div class="tc-tile"><div class="v ${cls || ''}">${escape(String(v))}</div><div class="k">${escape(k)}</div></div>`; }
  function tcBar(label, done, total, green) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `<div class="tc-bar-row"><div class="lbl"><span>${escape(label)}</span><b>${done}/${total}</b></div><div class="tc-bar ${green ? 'green' : ''}"><i style="width:${pct}%"></i></div></div>`;
  }
  function tcChampion(ko) {
    const fin = ko.find(k => k.label === 'Finale');
    if (!fin || fin.status !== 'done') return null;
    if (fin.score_a > fin.score_b) return fin.a.name;
    if (fin.score_b > fin.score_a) return fin.b.name;
    if (fin.pens_a != null && fin.pens_b != null) {
      // Mirror the server: equal pens means no decided champion yet.
      if (fin.pens_a > fin.pens_b) return fin.a.name;
      if (fin.pens_b > fin.pens_a) return fin.b.name;
      return null;
    }
    return null;
  }

  // Live tournament card on the Overzicht — a compact mirror of the control
  // center so the organisers see what's happening on the fields at a glance.
  // ---------- JVO Smart — admin control-tower ----------
  // Deterministisch: rekent de urgentste zaak uit de live-payload + de teamlijst,
  // toont hem bovenaan met één actieknop; de rest inklapbaar. Geen runtime-LLM.
  // De Duif — dezelfde getracede JVO-duif als het laadscherm (jvo-loader.js), viewBox 80×39
  const JVS_DOVE_ADMIN = '<svg viewBox="0 0 80 39" fill="currentColor" aria-hidden="true"><path d="M71.88 0.38 L75.13 0.63 L77.19 1.13 L78.06 1.88 L77.75 2.88 L76.25 4.13 L74.75 5.63 L73.25 7.38 L71.75 9.38 L70.25 11.63 L68.38 13.94 L66.13 16.31 L63.50 18.75 L60.50 21.25 L58.69 23.38 L58.06 25.13 L58.63 26.50 L60.38 27.50 L61.81 28.44 L62.94 29.31 L63.75 30.13 L64.25 30.88 L64.00 31.50 L63.00 32.00 L61.25 32.38 L58.75 32.63 L56.06 33.19 L53.19 34.06 L50.13 35.25 L46.88 36.75 L43.63 37.75 L40.38 38.25 L37.13 38.25 L33.88 37.75 L30.44 36.81 L26.81 35.44 L23.00 33.63 L19.00 31.38 L15.81 29.69 L13.44 28.56 L11.88 28.00 L11.13 28.00 L10.88 27.56 L11.13 26.69 L11.88 25.38 L13.13 23.63 L13.13 21.31 L11.88 18.44 L9.38 15.00 L5.63 11.00 L3.81 8.06 L3.94 6.19 L6.00 5.38 L10.00 5.63 L14.44 6.75 L19.31 8.75 L24.63 11.63 L30.38 15.38 L35.63 17.19 L40.38 17.06 L44.63 15.00 L48.38 11.00 L51.94 7.75 L55.31 5.25 L58.50 3.50 L61.50 2.50 L63.81 1.69 L65.44 1.06 L66.38 0.63 L66.63 0.38 L67.63 0.25 L69.38 0.25 Z"/></svg>';
  function smartAdminInsights(t) {
    const out = [];
    const now = t.server_now || Date.now();
    const matchMin = (t.schedule && t.schedule.match_min) || t.match_minutes || 10;
    // 0) smart schuift het schema zelf op (auto-opschuif staat uit) — lopend voorstel.
    // Eerlijk gemeld; de aftellende knoppen staan in Tijdschema (banner met veto).
    if (t.smart_shift && t.smart_shift.deadline) {
      const mins = t.smart_shift.minutes | 0;
      out.push({ sev: 'warn', prio: 96,
        title: `Ik schuif het schema ${mins} min op`,
        body: `Eerlijk: de dag loopt ~<b>${mins} min</b> achter. Ik pak het zelf op en schuif het schema zo ${mins} min op — de volgers licht ik in. Wil je me tegenhouden of het meteen doorvoeren? De knoppen staan in Tijdschema.`,
        cta: { label: 'Naar Tijdschema', pane: 'tournament', anchor: 'time-control-section' } });
    }
    // 1) haalbaarheid — loopt de dag uit?
    if (t.ends && t.ends.end_time && !t.ends.fits && t.ends.over_min > 0) {
      const over = t.ends.over_min;
      out.push({ sev: over > 15 ? 'warn' : 'info', prio: over > 15 ? 95 : 70,
        title: over > 15 ? `De dag loopt ${over} min uit` : `Krap in de tijd (~${over} min uit)`,
        body: `Eerlijk gezegd halen we de sluitingstijd zo niet: ik verwacht ons pas rond <b>${escape(t.ends.expected)}</b> klaar, terwijl de sluiting op ${escape(t.ends.end_time)} staat. Het schema opschuiven lost dit níét op — dat maakt ons later. Wat wél helpt: de wedstrijdduur inkorten of een ronde compacter plannen.`,
        cta: { label: 'Naar Tijdschema', pane: 'tournament', anchor: 'time-control-section' } });
    }
    // 2) vastgelopen wedstrijd — live maar veel te lang
    for (const m of (t.live || [])) {
      if (!m.started_at) continue;
      const st = Date.parse(String(m.started_at).replace(' ', 'T') + 'Z');
      if (!st) continue;
      const el = Math.floor((now - st) / 60000);
      if (el > matchMin + 15) out.push({ sev: 'warn', prio: el > matchMin + 30 ? 90 : 78,
        title: 'Wedstrijd duurt lang',
        body: `${escape(m.a)} – ${escape(m.b)}${m.field ? ` op veld ${escape(String(m.field))}` : ''} loopt al ${el} min. Nog niet afgefloten?`,
        cta: { label: 'Wedstrijdbediening', href: '/wedstrijd' } });
    }
    // 3) team niet ingecheckt vlak voor aftrap (+ aggregaat)
    const notIn = new Set((teams || []).filter(x => x.status === 'approved' && !x.checked_in_at).map(x => x.team_name));
    if (notIn.size) {
      let urgent = null;
      for (const p of Object.keys(t.poules || {})) for (const m of ((t.poules[p] && t.poules[p].matches) || [])) {
        if (m.status !== 'scheduled' || m.expMs == null) continue;
        const mins = Math.round((m.expMs - now) / 60000);
        if (mins < 0 || mins > 20) continue;
        const who = [m.a, m.b].filter(n => notIn.has(n));
        if (who.length && (!urgent || mins < urgent.mins)) urgent = { who, mins };
      }
      if (urgent) out.push({ sev: urgent.mins < 8 ? 'warn' : 'info', prio: urgent.mins < 8 ? 85 : 60,
        title: 'Team nog niet ingecheckt',
        body: `${escape(urgent.who.join(', '))} speelt over ~${urgent.mins} min maar is nog niet ingecheckt.`,
        cta: { label: 'Naar check-in', href: '/checkin' } });
      else out.push({ sev: 'info', prio: 45,
        title: `${notIn.size} ${notIn.size === 1 ? 'team' : 'teams'} nog niet ingecheckt`,
        body: 'Controleer de check-in zodra de teams binnen zijn.', cta: { label: 'Naar check-in', href: '/checkin' } });
    }
    // 4) poules klaar — knock-out kan beginnen
    const pouleList = TOURN_POULES.filter(p => t.poules[p]);
    const gm = pouleList.flatMap(p => t.poules[p].matches);
    const gDone = gm.filter(m => m.status === 'done').length;
    const ko = t.knockout || []; const koStarted = ko.some(k => k.status !== 'scheduled');
    if (gm.length && gDone === gm.length && ko.length && !koStarted) out.push({ sev: 'clinch', prio: 80,
      title: 'Poules klaar — de knock-out kan beginnen',
      body: 'Alle poulewedstrijden zijn gespeeld. Ik heb de knock-out alvast voor je klaargezet op basis van de eindstand (punten → onderling → doelsaldo → gescoord); hij staat klaar in de wedstrijdbediening.',
      cta: { label: 'Naar Toernooi', pane: 'tournament', anchor: 'tc-setup-fold' } });
    // 4b) net-admin-01: wachttijd poule→KO — de #1 klacht van juli 2026 (>1,5u gat).
    // Reken het verwachte gat uit tussen het einde van de laatste poulewedstrijd
    // (laatste geplande aftrap + wedstrijdduur) en de vroegste geplande KO-aftrap.
    // Deterministisch uit de al aanwezige expMs; alleen zinvol zolang de KO nog niet
    // is begonnen. Waarschuwt vóórdat het het ontevreden-makende gat van vorig jaar wordt.
    const GAP_INFO_MIN = 45, GAP_WARN_MIN = 75;   // >1,5u = 90 min → ruim ervoor waarschuwen
    // Toggle-baar: als de admin de learning net-admin-01 afwijst in "JVO Smart leert",
    // verdwijnt dit advies. Nog niet geladen → aan (default-AAN, beschermend), net als de
    // publieke smart-flags voor crew/bezoeker.
    const adminGapOn = !((smartLearnings || []).find(l => l.id === 'net-admin-01') || {}).dismissed;
    if (adminGapOn && ko.length && !koStarted) {
      const pouleExp = gm.map(m => m.expMs).filter(v => Number.isFinite(v));
      const koExp = ko.map(k => k.expMs).filter(v => Number.isFinite(v));
      if (pouleExp.length && koExp.length) {
        const lastPouleEnd = Math.max(...pouleExp) + matchMin * 60000;
        const gapMin = Math.round((Math.min(...koExp) - lastPouleEnd) / 60000);
        if (gapMin >= GAP_INFO_MIN) {
          const big = gapMin >= GAP_WARN_MIN;
          out.push({ sev: big ? 'warn' : 'info', prio: big ? 88 : 58,
            title: big ? `Lange wachttijd poule → knock-out (~${gapMin} min)` : `Ruim gat poule → knock-out (~${gapMin} min)`,
            body: `Tussen de laatste poulewedstrijd en de eerste knock-out zit nu ~<b>${gapMin} min</b> — vorig jaar was dit dé klacht. Trap de laatste poule-ronde gelijktijdig af over de velden en trek de knock-out naar voren, dan sluit het gat.`,
            cta: { label: 'Naar Tijdschema', pane: 'tournament', anchor: 'time-control-section' } });
        }
      }
    }
    // 4c) net-admin-03: voortgang poulefase + wanneer de knock-out begint.
    // Deterministisch uit de payload; toggle-baar via de learning (dismissed).
    const naOn = (id) => !((smartLearnings || []).find(l => l.id === id) || {}).dismissed;
    if (naOn('net-admin-03') && gm.length && gDone < gm.length && !koStarted) {
      const firstKo = ko.filter(k => Number.isFinite(k.expMs)).sort((a, b) => a.expMs - b.expMs)[0];
      const koWhen = firstKo ? (firstKo.expected || firstKo.time) : null;
      const remain = gm.length - gDone;
      out.push({ sev: 'info', prio: 40,
        title: `${gDone}/${gm.length} poulewedstrijden gespeeld`,
        body: `Nog <b>${remain}</b> te gaan in de poulefase${koWhen ? `; de knock-out begint naar mijn verwachting rond <b>${escape(String(koWhen))}</b>` : ''}. Ik houd het voor je in de gaten.`,
        cta: { label: 'Naar Toernooi', pane: 'tournament', anchor: 'tc-setup-fold' } });
    }
    // 4d) net-admin-02: waar gaan we naartoe in de knock-out — actieve ronde,
    // resterende KO-wedstrijden en de finale (tijd/veld). Escaleert als de finale bijna is.
    if (naOn('net-admin-02') && koStarted && ko.some(k => k.status !== 'done')) {
      const koRoundName = (l) => !l ? 'Knock-out'
        : l.startsWith('VR') ? 'Play-offs' : l.startsWith('A') ? 'Achtste finales'
        : l.startsWith('KF') ? 'Kwartfinales' : l.startsWith('HF') ? 'Halve finales'
        : l === 'Finale' ? 'Finale' : l === '3e/4e' ? 'Troostfinale' : 'Knock-out';
      const remainKo = ko.filter(k => k.status !== 'done').length;
      // Actieve ronde: een live tie eerst (die speelt écht 'nu'), anders de vroegst
      // geplande — dan is het label 'Volgende', niet 'Nu'.
      const active = ko.filter(k => k.status !== 'done').sort((a, b) => {
        const al = a.status === 'live' ? 0 : 1, bl = b.status === 'live' ? 0 : 1;
        return al !== bl ? al - bl : (a.slot ?? 99) - (b.slot ?? 99);
      })[0];
      const finale = ko.find(k => k.label === 'Finale');
      const finWhen = finale ? (finale.expected || finale.time) : null;
      const finVeld = finale && finale.field ? ` op veld ${escape(String(finale.field))}` : '';
      const finMs = finale && Number.isFinite(finale.expMs) ? finale.expMs : null;
      // 'Komt eraan' alleen als de finale nog moet beginnen (niet live, niet klaar).
      const soon = finMs != null && (finMs - now) <= 30 * 60000 && (finMs - now) > -60 * 60000 && finale.status === 'scheduled';
      const parts = [];
      if (active) parts.push(`${active.status === 'live' ? 'Nu' : 'Volgende'}: <b>${escape(koRoundName(active.label))}</b>`);
      parts.push(`nog <b>${remainKo}</b> knock-out-${remainKo === 1 ? 'wedstrijd' : 'wedstrijden'}`);
      const body = parts.join(' · ') + (finWhen ? `. Finale ~<b>${escape(String(finWhen))}</b>${finVeld}.` : '.');
      out.push({ sev: soon ? 'clinch' : 'info', prio: soon ? 76 : 42,
        title: soon ? 'Finale komt eraan' : 'Knock-out loopt',
        body, cta: { label: 'Naar Toernooi', pane: 'tournament', anchor: 'tc-setup-fold' } });
    }
    // 5) teams die op goedkeuring wachten
    const pending = (teams || []).filter(x => x.status === 'pending').length;
    if (pending) out.push({ sev: 'info', prio: 50,
      title: `${pending} ${pending === 1 ? 'team wacht' : 'teams wachten'} op beoordeling`,
      body: 'Goedkeuren stuurt automatisch een check-in-QR naar de captain.', cta: { label: 'Naar Teams', pane: 'teams', anchor: 'team-search' } });
    out.sort((a, b) => b.prio - a.prio);
    return out;
  }
  // ---------- JVO Smart als assistent — hij vóért veilige klusjes uit -------
  // Persona: een toegewijde assistent met het karakter van een gelovige — nederig,
  // trouw, zorgzaam, vredig en dankbaar. Spreekt je aan met 'je' (JVO is voor jongeren), in de ik-vorm. Hij
  // neemt alleen omkeerbare klusjes op zich (op één knik), meldt altijd terug en biedt
  // ongedaan-maken. E-mail verstuurt hij NOOIT uit zichzelf (werkwijze: mail = mens).
  function smartRefresh() { try { renderOverviewLive(); } catch { /* stil */ } }
  async function smartDo(path, body, report, undoBody) {
    try {
      const r = await api(path, { method: 'POST', body: JSON.stringify(body || {}) });
      if (!r.ok) { showToast('Het is mij niet gelukt — mag ik het zo nog eens proberen?', 'error'); return; }
      if (undoBody) {
        showUndoToast({ message: report, undoWindowMs: 12000, onUndo: async () => {
          try { await api(path, { method: 'POST', body: JSON.stringify(undoBody) }); } catch { /* stil */ }
          smartRefresh();
        } });
      } else { showToast(report, 'success'); }
      smartRefresh();
    } catch { /* api() meldt een verlopen sessie zelf */ }
  }
  // Breng je ECHT naar de plek: juiste tab, ingeklapte vouwen erboven opengeklapt
  // (anders scroll je naar iets onzichtbaars), in beeld, en even oplichten zodat
  // je ziet waar je terecht bent gekomen.
  const smartGoto = (pane, anchorId) => {
    switchTab(pane);
    if (!anchorId) return;
    setTimeout(() => {
      const el = document.getElementById(anchorId);
      if (!el) { console.warn('smartGoto: anker bestaat niet →', anchorId); return; }
      // elke <details> erboven openklappen (ook het element zelf als dat er een is)
      let d = el.closest('details');
      while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('jvs-target');
      clearTimeout(smartGoto.t);
      smartGoto.t = setTimeout(() => el.classList.remove('jvs-target'), 2400);
    }, 160);
  };
  // De diensten die JVO Smart nú kan verrichten, in zijn eigen woorden.
  function smartServices(t) {
    const s = [];
    if (!(t && t.configured && !t.offline)) return s;
    const shift = t.schedule_shift_min || 0;
    // Eerlijk over wie de tijd bewaakt: mét auto-opschuif doet de stille autopilot het;
    // zónder pak ík het zelf en zichtbaar op (seintje + 3 min bedenktijd vóór ik schuif).
    const guardLine = t.auto_shift === false
      ? 'Ik houd de tijd zélf in de gaten en schuif op zodra de dag achterloopt — je krijgt eerst een seintje met 3 minuten bedenktijd.'
      : 'Eerlijk: nu bewaakt de stille autopilot de tijd. Wil je dat ík het zichtbaar doe (met een seintje vooraf)? Zet de auto-opschuif dan uit in Tijdschema.';
    s.push({
      title: 'Het schema staat onder mijn hoede.',
      line: (shift ? `Op dit moment houd ik alles <b>${shift > 0 ? '+' : ''}${shift} min</b> verschoven. ` : '') + guardLine,
      acts: [
        { label: '+5 min', run: () => smartDo('/api/admin/tournament/schedule-shift', { delta: 5 }, 'Gedaan — het schema staat 5 minuten later. De volgers heb ik ingelicht.', { delta: -5 }) },
        { label: '+10 min', run: () => smartDo('/api/admin/tournament/schedule-shift', { delta: 10 }, 'Gedaan — het schema staat 10 minuten later. De volgers heb ik ingelicht.', { delta: -10 }) },
        ...(shift ? [{ label: 'Herstel', run: () => smartDo('/api/admin/tournament/schedule-shift', { reset: true }, 'Gedaan — ik heb de verschuiving voor je hersteld.') }] : []),
      ],
    });
    s.push({
      title: 'Een herinnering versturen?',
      line: 'Ik zet hem graag voor je klaar; versturen laat ik altijd aan jou.',
      acts: [{ label: 'Breng mij ernaartoe', run: () => smartGoto('overview', 'reminders-grid') }],
    });
    s.push({
      title: 'Staat een team te vaak op één veld?',
      line: 'Dan verdeel ik de velden op jouw teken wat eerlijker.',
      acts: [{ label: 'Naar de veldindeling', run: () => smartGoto('tournament', 'sched-roles') }],
    });
    return s;
  }

  function renderJvsTower(t) {
    const el = $('jvs-tower'); if (!el) return;
    const configured = t && t.configured && !t.offline;
    const ins = configured ? smartAdminInsights(t) : [];
    const services = smartServices(t);
    if (!ins.length && !services.length) { el.hidden = true; if (el.innerHTML) el.innerHTML = ''; renderJvsTower.last = ''; return; }
    const hero = ins[0], rest = ins.slice(1, 5);
    const sev = hero ? hero.sev : 'info';
    const cls = `jvs jvs-tower jvs--${sev}`;
    // Eerlijk én kritisch: bij een zorg legt hij het onomwonden voor; bij rust vleit
    // hij niet maar zegt de waarheid en belooft dat hij tijdig waarschuwt.
    const warnish = hero && (hero.sev === 'warn');
    const greet = hero
      ? (warnish ? 'Dit vraagt je aandacht:' : 'Dit zie ik op dit moment:')
      : 'Alles loopt op dit moment goed. Ik geef een seintje zodra er iets speelt.';
    const heroHtml = hero
      ? `<div class="jvs-hero"><div class="jvs-hero-txt"><h3>${escape(hero.title)}</h3><p>${hero.body}</p></div>${hero.cta ? `<button type="button" class="jvs-cta" id="jvs-hero-cta">${escape(hero.cta.label)}</button>` : ''}</div>`
      : '';
    const restHtml = rest.length
      ? `<details class="jvs-more"><summary>Nog ${rest.length} ${rest.length === 1 ? 'punt' : 'punten'} onder mijn aandacht</summary><ul class="jvs-list">${rest.map(r => `<li><b>${escape(r.title)}</b> — ${r.body}</li>`).join('')}</ul></details>`
      : '';
    const svcHtml = services.length
      ? `<div class="jvs-serve"><div class="jvs-serve-h">Waar kan ik je mee helpen?</div>${services.map((sv, i) => `
          <div class="jvs-serve-row">
            <div class="jvs-serve-txt"><b>${escape(sv.title)}</b> ${sv.line}</div>
            <div class="jvs-serve-acts">${sv.acts.map((a, j) => `<button type="button" class="jvs-serve-btn" data-svc="${i}" data-act="${j}">${escape(a.label)}</button>`).join('')}</div>
          </div>`).join('')}</div>`
      : '';
    // Compacte melding die je uitklapt: de kop is altijd zichtbaar (één regel),
    // de rest zit eronder. Zo neemt JVO Smart niet het hele Overzicht meer over —
    // vooral op een telefoon. De open/dicht-stand onthouden we per toestel.
    const punten = ins.length;
    const kort = hero ? hero.title : 'Alles loopt goed';
    const badge = punten > 1 ? `<span class="jvs-count">${punten}</span>` : '';
    const sumHtml = `<button type="button" class="jvs-sum" id="jvs-toggle" aria-expanded="false" aria-controls="jvs-body">
        <span class="jvs-mark sm">${JVS_DOVE_ADMIN}</span>
        <span class="jvs-sum-txt"><span class="jvs-sum-nm">JVO Smart</span><span class="jvs-sum-line">${escape(kort)}</span></span>
        ${badge}
        <svg class="jvs-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`;
    const html = sumHtml
      + `<div class="jvs-body" id="jvs-body">`
      + `<p class="jvs-greet">${greet}</p>`
      + heroHtml + restHtml + svcHtml
      + `<p class="jvs-serve-foot">Alles wat ik zelf oppak is terug te draaien, en ik laat altijd weten wat ik heb gedaan. Mail stuur ik nooit uit mezelf. Fijne wedstrijddag!</p>`
      + `</div>`;
    el.hidden = false;
    // Dedup: alleen herbouwen bij echte wijziging — anders herstart elke refresh de
    // duif-animatie en verspringen de knoppen onder je vinger.
    if (renderJvsTower.last === html && el.className === cls) return;
    renderJvsTower.last = html;
    if (el.className !== cls) el.className = cls;
    el.innerHTML = html;
    // open/dicht herstellen + koppelen. De klasse staat op de sectie zelf, dus de
    // stand overleeft de verversing elke 10s zonder te knipperen.
    const openKey = 'jvo_smart_open';
    const zetOpen = (open) => {
      el.classList.toggle('jvs-open', open);
      const t = $('jvs-toggle');
      if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    zetOpen(localStorage.getItem(openKey) === '1');
    $('jvs-toggle')?.addEventListener('click', () => {
      const open = !el.classList.contains('jvs-open');
      localStorage.setItem(openKey, open ? '1' : '0');
      zetOpen(open);
    });

    const cta = $('jvs-hero-cta');
    if (cta && hero && hero.cta) cta.onclick = () => {
      if (hero.cta.href) location.href = hero.cta.href;
      // via smartGoto: klapt vouwen open, scrollt en licht het doel even op
      else if (hero.cta.pane) smartGoto(hero.cta.pane, hero.cta.anchor);
    };
    el.querySelectorAll('.jvs-serve-btn').forEach(b => b.onclick = () => {
      const sv = services[+b.dataset.svc], a = sv && sv.acts[+b.dataset.act];
      if (a && a.run) a.run();
    });
  }

  // ---------- JVO Smart leert — het lerende geheugen ----------
  let smartLearnings = null;        // laatst geladen lijst (null = nog niet geladen)
  let smartFilter = 'alle';
  let smartEnrichAvail = false;
  const SL_SOURCES = [
    { key: 'internet', label: 'Uit internet-onderzoek' },
    { key: 'vorig-event', label: 'Uit vorige edities' },
    { key: 'werkwijze', label: 'Onze werkwijze' },
    { key: 'manual', label: 'Zelf toegevoegd' },
    { key: 'seed', label: 'Basis' },
  ];
  const SL_APPLIES = { schema: 'Schema', crew: 'Crew', bezoeker: 'Bezoeker', toegankelijkheid: 'Toegankelijkheid', admin: 'Admin' };
  const SL_KIND = { 'deterministisch-live': 'Veilig op de dag', 'ui': 'Interface', 'advies-pre-event': 'Advies vooraf' };

  async function loadSmartLearnings() {
    try {
      const d = await (await api('/api/admin/smart/learnings')).json();
      smartLearnings = Array.isArray(d.learnings) ? d.learnings : [];
      smartEnrichAvail = !!d.enrichAvailable;
    } catch { if (smartLearnings === null) smartLearnings = []; }
    renderSmartLearnings();
  }

  function renderSmartFilters() {
    const box = $('smart-learn-filters'); if (!box) return;
    const active = (smartLearnings || []).filter(l => !l.dismissed);
    const counts = active.reduce((a, l) => { a[l.appliesTo] = (a[l.appliesTo] || 0) + 1; return a; }, {});
    const chips = [['alle', 'Alle', active.length]].concat(
      Object.keys(SL_APPLIES).filter(k => counts[k]).map(k => [k, SL_APPLIES[k], counts[k]])
    );
    box.innerHTML = chips.map(([k, label, n]) =>
      `<button type="button" class="sl-chip ${smartFilter === k ? 'on' : ''}" data-f="${escape(k)}" role="tab" aria-selected="${smartFilter === k}">${escape(label)}<i>${n}</i></button>`
    ).join('');
    box.querySelectorAll('.sl-chip').forEach(b => b.onclick = () => { smartFilter = b.dataset.f; renderSmartLearnings(); });
  }

  function slCard(l) {
    const kindCls = l.kind === 'deterministisch-live' ? 'live' : (l.kind === 'advies-pre-event' ? 'advies' : '');
    const applied = l.applied && !l.dismissed;
    const status = applied ? `<span class="sl-status"><span class="dot"></span>Toegepast</span>` : '';
    const badges = `<div class="sl-badges">`
      + `<span class="sl-badge">${escape(SL_APPLIES[l.appliesTo] || l.appliesTo)}</span>`
      + `<span class="sl-badge ${kindCls}">${escape(SL_KIND[l.kind] || l.kind)}</span>`
      + `<span class="sl-badge sl-conf">${Math.round((Number(l.confidence) || 0) * 100)}% zeker</span>`
      + `</div>`;
    let src = '';
    if (l.sourceUrl) {
      const first = String(l.sourceUrl).split(/[;\s]+/).find(u => /^https?:\/\//i.test(u));
      if (first) { let host = first; try { host = new URL(first).host.replace(/^www\./, ''); } catch {} src = `<a class="sl-src" href="${escape(first)}" target="_blank" rel="noopener noreferrer">Bron: ${escape(host)} ↗</a>`; }
    }
    const change = l.concreteChange
      ? `<details class="sl-more"><summary>Wat dit concreet betekent</summary><p class="sl-change">${escape(l.concreteChange)}</p>${src}</details>`
      : (src ? `<div style="margin-top:8px;">${src}</div>` : '');
    const actions = l.dismissed
      ? `<div class="sl-actions"><button type="button" class="undo" data-act="apply" data-id="${escape(l.id)}">Terugzetten</button></div>`
      : `<div class="sl-actions">`
        + (applied
            ? `<button type="button" class="dismiss" data-act="dismiss" data-id="${escape(l.id)}">Ongedaan maken</button>`
            : `<button type="button" class="apply" data-act="apply" data-id="${escape(l.id)}">Toepassen</button><button type="button" class="dismiss" data-act="dismiss" data-id="${escape(l.id)}">Afwijzen</button>`)
        + `</div>`;
    return `<div class="sl-card ${applied ? 'applied' : ''} ${l.dismissed ? 'dismissed' : ''}">`
      + `<div class="sl-card-top"><div class="sl-card-txt"><p class="sl-card-title">${escape(l.text)}</p>${badges}</div>${status}</div>`
      + change + actions + `</div>`;
  }

  function renderSmartLearnings() {
    const wrap = $('smart-learn-groups'); if (!wrap) return;
    const btn = $('smart-enrich-btn'); if (btn) btn.hidden = !smartEnrichAvail;
    renderSmartFilters();
    const all = smartLearnings || [];
    if (!all.length) { wrap.innerHTML = `<div class="sl-empty">JVO Smart heeft nog geen learnings.</div>`; return; }
    const active = all.filter(l => !l.dismissed && (smartFilter === 'alle' || l.appliesTo === smartFilter));
    const dismissed = all.filter(l => l.dismissed);
    let html = '';
    for (const s of SL_SOURCES) {
      const items = active.filter(l => l.source === s.key).sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
      if (!items.length) continue;
      html += `<div class="sl-group"><div class="sl-group-h">${escape(s.label)}<span class="sl-count">${items.length}</span></div>${items.map(slCard).join('')}</div>`;
    }
    if (!html) html = `<div class="sl-empty">Geen learnings in dit filter.</div>`;
    if (dismissed.length) {
      html += `<details class="sl-group dismissed"><summary class="sl-group-h" style="cursor:pointer;">Afgewezen <span class="sl-count">${dismissed.length}</span></summary>${dismissed.map(slCard).join('')}</details>`;
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => smartAction(b.dataset.act, b.dataset.id, b));
  }

  async function smartAction(act, id, btn) {
    if (!id || (act !== 'apply' && act !== 'dismiss')) return;
    if (btn) btn.disabled = true;
    try {
      const res = await api(`/api/admin/smart/learnings/${encodeURIComponent(id)}/${act}`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || 'Kon niet opslaan', 'error'); if (btn) btn.disabled = false; return; }
      if (Array.isArray(d.learnings)) smartLearnings = d.learnings;
      renderSmartLearnings();
      showToast(act === 'apply' ? 'Toegepast — JVO Smart gebruikt dit.' : 'Afgewezen.', 'success');
    } catch { showToast('Netwerkfout — probeer opnieuw.', 'error'); if (btn) btn.disabled = false; }
  }

  async function smartEnrich() {
    const btn = $('smart-enrich-btn'); if (btn) btn.disabled = true;
    try {
      const res = await api('/api/admin/smart/enrich', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) showToast(d.error || 'Verrijken kan nu niet', 'error');
      else if (!d.proposals || !d.proposals.length) showToast(d.note || 'Geen nieuwe voorstellen.', 'success');
      else showToast(`${d.proposals.length} voorstellen ontvangen.`, 'success');
    } catch { showToast('Netwerkfout — probeer opnieuw.', 'error'); }
    if (btn) btn.disabled = false;
  }

  // Lazy laden zodra de fold opengaat (blijft van het dagelijkse dashboard af).
  (() => {
    const fold = $('smart-learn-fold');
    if (fold) fold.addEventListener('toggle', () => { if (fold.open) loadSmartLearnings(); });
    const eb = $('smart-enrich-btn');
    if (eb) eb.addEventListener('click', smartEnrich);
  })();

  async function renderOverviewLive() {
    const card = $('ov-live');
    if (!card) return;
    let t = null;
    try { t = await (await fetch('/api/tournament')).json(); } catch { /* keep last */ }
    // Laad de learnings één keer vroeg (niet pas als de "JVO Smart leert"-fold opengaat),
    // zodat het afwijzen van een tower-advies (net-admin-01/02/03) meteen wordt gerespecteerd.
    if (smartLearnings === null) loadSmartLearnings();
    renderJvsTower(t);
    if (!t || t.offline || !t.configured) { card.style.display = 'none'; return; }
    card.style.display = '';
    const pouleList = TOURN_POULES.filter(p => t.poules[p]);
    const groupMatches = pouleList.flatMap(p => t.poules[p].matches);
    const gDone = groupMatches.filter(m => m.status === 'done').length;
    const ko = t.knockout || [];
    const koDone = ko.filter(k => k.status === 'done').length;
    const liveN = (t.live || []).length;
    const champ = tcChampion(ko);
    const st = $('ov-live-state');
    if (st) {
      st.className = 'tc-statebadge on';
      st.innerHTML = champ ? `<span class="d"></span>Kampioen: ${escape(champ)}`
        : liveN ? `<span class="d"></span>${liveN} ${liveN === 1 ? 'wedstrijd' : 'wedstrijden'} nu live`
          : `<span class="d"></span>${escape(!t.group_complete ? 'poulefase' : 'knock-out')}`;
    }
    if ($('ov-live-stats')) $('ov-live-stats').innerHTML = [
      tcTile(liveN, 'Nu live', liveN ? 'live' : ''),
      tcTile(pouleList.length, 'Poules', 'gold'),
      tcTile(t.schedule ? t.schedule.fields : '–', 'Velden'),
      tcTile(groupMatches.length + ko.length, 'Wedstrijden'),
    ].join('');
    if ($('ov-live-progress')) $('ov-live-progress').innerHTML =
      tcBar('Poulefase', gDone, groupMatches.length, false) + tcBar('Knock-out', koDone, ko.length, true);
  }

  // The control-center dashboard: live state badge + stat tiles + progress bars.
  async function renderTournDashboard() {
    let t = null;
    try { t = await (await fetch('/api/tournament')).json(); } catch { t = null; }
    if (t && t.offline) {
      const s = $('tc-state');
      if (s && /Laden/.test(s.textContent)) { s.className = 'tc-statebadge off'; s.innerHTML = '<span class="d"></span>Offline — wachten op verbinding'; }
      return;
    }
    // Only seed the schedule inputs once — re-filling on every 10s refresh would
    // clobber what the admin is typing. sched-save re-fills deliberately.
    if (t && t.schedule && !schedInitialized) { fillSchedForm(t.schedule); schedInitialized = true; }
    if (t && t.ko_format && !fmtInitialized) {
      if (t.ko_variant) selectedVariant = t.ko_variant;   // vóór selectFormat: die rendert de kiezer
      selectFormat(t.ko_format);
      fmtInitialized = true;
    }
    // De opzet-fold staat vanzelf open zolang er geen toernooi is en klapt
    // daarna dicht — eenmalig bij laden, zodat handmatig openen blijft staan.
    if (t && !setupFoldInit) {
      const fold = $('tc-setup-fold');
      if (fold) fold.open = !t.configured;
      setupFoldInit = true;
    }
    // Estimated finish time of the whole tournament, shown under the Tijdschema.
    if ($('sched-ends')) {
      const e = t && t.ends;
      if (e && e.planned) {
        let html = `${ICON.flag} Geschat klaar rond <b>${escape(e.planned)}</b>`;
        if (e.expected && e.expected !== e.planned) html += ` · <span style="color:var(--gold-2)">nu verwacht ${escape(e.expected)} (+${e.delay} min uitloop)</span>`;
        // Haalbaarheids-signaal t.o.v. de sluitingstijd — het overzicht-signaal
        // dat editie 1 miste: zie vóóraf of de dag uitloopt en stuur bij.
        if (e.end_time) {
          const over = e.over_min || 0;
          const cls = e.fits ? 'feas-ok' : (over <= 15 ? 'feas-warn' : 'feas-crit');
          const label = e.fits ? `Past binnen de dag ✓ (voor ${escape(e.end_time)})`
            : (over <= 15 ? `Loopt ~${over} min uit`
              : `Loopt ${over} min UIT — kort de pauze in of zet een veld bij`);
          html += ` <span class="feas-pill ${cls}">${escape(label)}</span>`;
        }
        $('sched-ends').innerHTML = html;
        $('sched-ends').hidden = false;
      } else { $('sched-ends').hidden = true; $('sched-ends').innerHTML = ''; }
    }
    const stateEl = $('tc-state'), statsEl = $('tc-stats'), progEl = $('tc-progress');
    if (!t || !t.configured) {
      if (stateEl) { stateEl.className = 'tc-statebadge off'; stateEl.innerHTML = '<span class="d"></span>Niet gegenereerd'; }
      if (statsEl) statsEl.innerHTML = '';
      if (progEl) progEl.innerHTML = '';
      updateFmtHint();
      renderTimeControl(t);
      return;
    }
    const pouleList = TOURN_POULES.filter(p => t.poules[p]);
    const groupMatches = pouleList.flatMap(p => t.poules[p].matches);
    const gDone = groupMatches.filter(m => m.status === 'done').length;
    const ko = t.knockout || [];
    const koDone = ko.filter(k => k.status === 'done').length;
    const liveN = (t.live || []).length;
    const teamsN = pouleList.reduce((s, p) => s + t.poules[p].standings.length, 0);
    const champ = tcChampion(ko);

    if (stateEl) {
      stateEl.className = 'tc-statebadge on';
      if (champ) stateEl.innerHTML = `<span class="d"></span>Kampioen: ${escape(champ)}`;
      else if (liveN) stateEl.innerHTML = `<span class="d"></span>${liveN} ${liveN === 1 ? 'wedstrijd' : 'wedstrijden'} nu live`;
      else stateEl.innerHTML = `<span class="d"></span>Schema actief · ${escape(!t.group_complete ? 'poulefase' : 'knock-out')}`;
    }
    const worstWait = wmWorst(t.team_waits);
    if (statsEl) statsEl.innerHTML = [
      tcTile(teamsN, 'Teams'),
      tcTile(pouleList.length, 'Poules', 'gold'),
      tcTile(t.schedule ? t.schedule.fields : '–', 'Velden'),
      tcTile(liveN, 'Nu live', liveN ? 'live' : ''),
      tcTile(worstWait ? `${worstWait.minutes} min` : '–', 'Langste wacht', worstWait && worstWait.warn ? 'gold' : ''),
    ].join('');
    if (progEl) progEl.innerHTML = tcBar('Poulefase', gDone, groupMatches.length, false) + tcBar('Knock-out', koDone, ko.length, true);
    updateFmtHint();
    renderTimeControl(t);
    renderWaitMetrics(t);
    renderPullBanner(t);
    renderSmartShiftBanner(t);
  }

  // ===== TREK-NAAR-VOREN (2-min-veto-banner) =====
  // De server stelt voor het schema te vervroegen als de dag vóórloopt; zonder
  // reactie binnen 2 minuten gaat het automatisch door. De banner toont een
  // aftellende teller + "Nu vervroegen" / "Niet vervroegen".
  function renderPullBanner(t) {
    const el = $('tc-pull-banner');
    if (!el) return;
    const p = t && t.pull_forward;
    if (!p || !p.deadline) { el.hidden = true; el.innerHTML = ''; return; }
    // Server-klok als referentie (klokverschil met de client omzeilen).
    const remainMs = Math.max(0, p.deadline - (t.server_now || Date.now()));
    el.hidden = false;
    el.innerHTML = `⏩ <b>De dag loopt ~${p.minutes | 0} min vóór.</b> Het schema schuift automatisch <b>${p.minutes | 0} min naar voren</b> over <b id="tc-pull-secs" data-target="${Date.now() + remainMs}">${Math.round(remainMs / 1000)}</b>s — volgers krijgen een melding van de nieuwe tijd.
      <span style="display:inline-flex; gap:8px; margin-left:8px; vertical-align:middle;">
        <button type="button" class="btn-sm primary" id="tc-pull-apply">Nu vervroegen</button>
        <button type="button" class="btn-sm" id="tc-pull-cancel">Niet vervroegen</button>
      </span>`;
  }
  $('tc-pull-banner')?.addEventListener('click', (e) => {
    if (e.target.id === 'tc-pull-apply') tczPost('/api/admin/tournament/pull-forward', {}, 'Schema vervroegd');
    else if (e.target.id === 'tc-pull-cancel') tczPost('/api/admin/tournament/pull-forward', { cancel: true }, 'Vervroegen geannuleerd');
  });
  setInterval(() => {
    const s = $('tc-pull-secs');
    if (s && s.dataset.target) s.textContent = Math.max(0, Math.round((+s.dataset.target - Date.now()) / 1000));
  }, 1000);

  // ===== SMART-OPSCHUIVEN (3-min-veto-banner) =====
  // JVO Smart schuift het schema zélf op als de dag achterloopt (alleen als de
  // auto-opschuif uit staat). Zelfde veto-patroon als trek-naar-voren, maar de
  // andere kant op — en in zijn eigen, eerlijke stem.
  function renderSmartShiftBanner(t) {
    const el = $('tc-smart-banner');
    if (!el) return;
    const p = t && t.smart_shift;
    if (!p || !p.deadline) { el.hidden = true; el.innerHTML = ''; return; }
    const remainMs = Math.max(0, p.deadline - (t.server_now || Date.now()));
    el.hidden = false;
    el.innerHTML = `🕊️ <b>De dag loopt ~${p.minutes | 0} min achter.</b> Ik schuif het schema over <b id="tc-smart-secs" data-target="${Date.now() + remainMs}">${Math.round(remainMs / 1000)}</b>s <b>${p.minutes | 0} min op</b>, tenzij je me tegenhoudt — de volgers licht ik dan netjes in.
      <span style="display:inline-flex; gap:8px; margin-left:8px; vertical-align:middle;">
        <button type="button" class="btn-sm primary" id="tc-smart-apply">Nu opschuiven</button>
        <button type="button" class="btn-sm" id="tc-smart-cancel">Nog even niet</button>
      </span>`;
  }
  $('tc-smart-banner')?.addEventListener('click', (e) => {
    if (e.target.id === 'tc-smart-apply') tczPost('/api/admin/tournament/smart-shift', {}, 'Schema opgeschoven');
    else if (e.target.id === 'tc-smart-cancel') tczPost('/api/admin/tournament/smart-shift', { cancel: true }, 'Opschuiven tegengehouden');
  });
  setInterval(() => {
    const s = $('tc-smart-secs');
    if (s && s.dataset.target) s.textContent = Math.max(0, Math.round((+s.dataset.target - Date.now()) / 1000));
  }, 1000);

  // ===== WACHTTIJDEN PER TEAM (metrics uit team_waits) =====
  // Het slechtste gat over teams én nog-open bracket-plekken, voor de tegel en
  // de waarschuwing onder de genereer-knop.
  function wmWorst(tw) {
    if (!tw) return null;
    const warnAt = (tw.thresholds && tw.thresholds.wait_warn_min) || 45;
    let worst = null;
    const top = (tw.teams || [])[0];
    if (top && top.max_gap_planned > 0) {
      worst = { minutes: top.max_gap_planned, warn: top.max_gap_planned >= warnAt,
        text: `${top.name} · ${top.worst_between ? top.worst_between.join(' → ') : ''}` };
    }
    const seat = (tw.seats || [])[0];
    if (seat && (!worst || seat.wait_max > worst.minutes)) {
      worst = { minutes: seat.wait_max, warn: seat.wait_max >= warnAt,
        text: `wie ${seat.code} wordt · einde poulefase → ${seat.first_ko} (${seat.wait_min}–${seat.wait_max} min)` };
    }
    return worst;
  }
  function renderWaitMetrics(t) {
    const warnEl = $('tc-wait-warn'), body = $('wm-body');
    const tw = t && t.team_waits;
    if (warnEl) {
      const worst = wmWorst(tw);
      if (!worst) { warnEl.hidden = true; warnEl.innerHTML = ''; }
      else {
        warnEl.hidden = false;
        warnEl.style.background = worst.warn ? 'rgba(255,179,71,.08)' : 'transparent';
        warnEl.style.borderColor = worst.warn ? 'rgba(255,179,71,.35)' : 'var(--line)';
        warnEl.innerHTML = `${worst.warn ? '⚠ ' : ''}Langste wachttijd: <b>${worst.minutes} min</b> <span class="muted">(${escape(worst.text)})</span>` +
          (worst.warn ? ` <span class="muted">— zie de fold “Wachttijden per team”.</span>` : '');
      }
    }
    if (!body) return;
    if (!tw || (!tw.teams?.length && !tw.seats?.length)) {
      body.innerHTML = '<div class="tcz-empty">Genereer eerst een schema.</div>';
      return;
    }
    const warnAt = (tw.thresholds && tw.thresholds.wait_warn_min) || 45;
    const restAt = (tw.thresholds && tw.thresholds.rest_warn_min) || 10;
    const gapCell = (min, warn) => `<b style="${warn ? 'color:var(--gold-2);' : ''}">${min} min</b>`;
    let html = '';
    if (tw.seats && tw.seats.length) {
      html += `<div class="tcz-sub-label">Nog open bracket-plekken (bandbreedte tot de standen rond zijn)</div>`;
      html += tw.seats.map(s => `
        <div class="tcz-row"><div class="tcz-time">${gapCell(s.wait_max, s.wait_max >= warnAt)}</div>
        <div class="tcz-info"><div class="nm">Wie <b>${escape(s.code)}</b> wordt</div>
        <div class="meta">wacht ${s.wait_min}–${s.wait_max} min · einde poulefase → ${escape(s.first_ko)}</div></div></div>`).join('');
    }
    if (tw.teams && tw.teams.length) {
      html += `<div class="tcz-sub-label">Grootste gat per team</div>`;
      html += tw.teams.slice(0, 10).map(r => `
        <div class="tcz-row"><div class="tcz-time">${gapCell(r.max_gap_planned, r.max_gap_planned >= warnAt)}</div>
        <div class="tcz-info"><div class="nm">${escape(r.name)} <span class="muted small">· poule ${escape(r.poule || '?')}</span></div>
        <div class="meta">${r.worst_between ? escape(r.worst_between.join(' → ')) : '—'}${r.max_gap_expected !== r.max_gap_planned ? ` · nu verwacht ${r.max_gap_expected} min` : ''}${r.min_rest_planned != null && r.min_rest_planned < restAt ? ` · <span style="color:var(--gold-2)">kortste rust ${r.min_rest_planned} min</span>` : ''}</div></div></div>`).join('');
    }
    body.innerHTML = html || '<div class="tcz-empty">Nog geen metingen.</div>';
  }

  // ===== TIJDEN BIJSTUREN (admin time control) =====
  const KO_NICE_T = { VR1: 'Play-off 1', VR2: 'Play-off 2', A1: 'Achtste finale 1', A2: 'Achtste finale 2', A3: 'Achtste finale 3', A4: 'Achtste finale 4', A5: 'Achtste finale 5', A6: 'Achtste finale 6', A7: 'Achtste finale 7', A8: 'Achtste finale 8', KF1: 'Kwartfinale 1', KF2: 'Kwartfinale 2', KF3: 'Kwartfinale 3', KF4: 'Kwartfinale 4', HF1: 'Halve finale 1', HF2: 'Halve finale 2', Finale: 'Finale', '3e/4e': 'Troostfinale' };
  const tczName = (x) => x == null ? '—' : (typeof x === 'string' ? x : (x.name || x.placeholder || '—'));
  function renderTimeControl(t) {
    const list = $('tcz-list'), shiftEl = $('tcz-shift');
    if (!list) return;
    const g = (t && t.schedule_shift_min) || 0;
    if (shiftEl) { shiftEl.textContent = g === 0 ? 'Geen verschuiving' : `${g > 0 ? '+' : ''}${g} min`; shiftEl.classList.toggle('on', g !== 0); }
    // Don't rebuild the list while the admin is typing in one of its time fields
    // (the 10s auto-refresh would clobber the input). Global shift still updates.
    if (list.contains(document.activeElement)) return;
    if (!t || !t.configured || !t.poules) { list.innerHTML = '<div class="tcz-empty">Genereer eerst een schema op deze tab.</div>'; return; }
    // Only still-to-start matches can be moved — a live/finished match keeps its
    // time, so a change made during a match takes effect from the next one onward.
    const items = [];
    for (const p of TOURN_POULES.filter(p => t.poules[p])) for (const m of t.poules[p].matches) {
      if (m.status === 'scheduled' && m.slot != null) items.push({ id: m.id, slot: m.slot, field: m.field, time: m.time, a: m.a, b: m.b, where: `Poule ${p} · R${m.round}` });
    }
    for (const k of (t.knockout || [])) {
      if (k.status === 'scheduled' && k.slot != null) items.push({ id: k.id, slot: k.slot, field: k.field, time: k.time, a: k.a, b: k.b, where: KO_NICE_T[k.label] || k.label });
    }
    items.sort((x, y) => (x.slot - y.slot) || ((x.field || 0) - (y.field || 0)));
    if (!items.length) { list.innerHTML = '<div class="tcz-empty">Geen geplande wedstrijden meer om te verzetten.</div>'; return; }
    list.innerHTML = items.map(m => `
      <div class="tcz-row" data-id="${m.id}">
        <div class="tcz-time">${escape(m.time || '—')}</div>
        <div class="tcz-info"><div class="nm">${escape(tczName(m.a))} <span style="color:var(--ice-faint)">vs</span> ${escape(tczName(m.b))}</div><div class="meta">${escape(m.where)}${m.field ? ` · Veld ${m.field}` : ''}</div></div>
        <div class="tcz-acts">
          <button type="button" class="btn-sm" data-tcz-delta="5">+5</button>
          <button type="button" class="btn-sm" data-tcz-delta="10">+10</button>
          <input type="time" data-tcz-time aria-label="Exacte tijd voor deze wedstrijd" value="${escape(m.time || '')}" />
          <button type="button" class="btn-sm" data-tcz-set>Zet</button>
          <button type="button" class="btn-sm" data-tcz-reset>Herstel</button>
        </div>
      </div>`).join('');
  }
  async function tczPost(url, body, okMsg) {
    try {
      const r = await api(url, { method: 'POST', body: JSON.stringify(body) });
      if (r.ok) { showToast(okMsg); renderTournDashboard(); }
      else { const j = await r.json().catch(() => ({})); showToast(j.error || 'Aanpassen mislukt', 'error'); }
    } catch { showToast('Netwerkfout — probeer opnieuw.', 'error'); }
  }
  document.querySelectorAll('#time-control-section [data-shift]').forEach(b =>
    b.addEventListener('click', () => tczPost('/api/admin/tournament/schedule-shift', { delta: parseInt(b.dataset.shift, 10) }, 'Schema verschoven')));
  $('tcz-shift-reset')?.addEventListener('click', () => tczPost('/api/admin/tournament/schedule-shift', { reset: true }, 'Verschuiving hersteld'));
  // Slim uitloop-systeem: automatisch bijschuiven aan/uit
  (async () => {
    try { const t = await (await fetch('/api/tournament')).json(); const cb = $('tcz-auto-shift'); if (cb) cb.checked = t.auto_shift !== false; } catch {}
  })();
  $('tcz-auto-shift')?.addEventListener('change', async (e) => {
    try {
      const r = await api('/api/admin/tournament/auto-shift', { method: 'POST', body: JSON.stringify({ enabled: e.target.checked }) });
      if (!r.ok) throw new Error();
      showToast(e.target.checked ? 'Uitloop wordt automatisch verwerkt' : 'Automatisch verwerken staat uit');
    } catch { e.target.checked = !e.target.checked; alert('Kon de instelling niet opslaan.'); }
  });
  $('tcz-list')?.addEventListener('click', (e) => {
    const row = e.target.closest('.tcz-row'); if (!row) return;
    const id = parseInt(row.dataset.id, 10); if (!Number.isInteger(id)) return;
    if (e.target.matches('[data-tcz-delta]')) tczPost('/api/admin/tournament/match-time', { id, delta: parseInt(e.target.dataset.tczDelta, 10) }, 'Tijd aangepast');
    else if (e.target.matches('[data-tcz-reset]')) tczPost('/api/admin/tournament/match-time', { id, reset: true }, 'Tijd hersteld');
    else if (e.target.matches('[data-tcz-set]')) { const inp = row.querySelector('[data-tcz-time]'); if (inp && inp.value) tczPost('/api/admin/tournament/match-time', { id, time: inp.value }, 'Tijd gezet'); else showToast('Vul eerst een tijd in.'); }
  });

  // --- Push-notification preferences ---
  async function loadPushPrefs() {
    if (!$('pp-all')) return;
    try {
      const r = await api('/api/admin/push-prefs');
      if (!r.ok) return;
      const { prefs } = await r.json();
      const all = prefs.all !== false;
      $('pp-all').checked = all;
      document.querySelectorAll('#pp-types input[data-pp]').forEach(cb => {
        cb.checked = prefs[cb.dataset.pp] !== false;
        cb.disabled = !all;
      });
    } catch {}
  }
  async function savePushPrefs() {
    const all = !!($('pp-all') && $('pp-all').checked);
    const body = { all };
    document.querySelectorAll('#pp-types input[data-pp]').forEach(cb => { body[cb.dataset.pp] = cb.checked; });
    // A disabled (master-off) category visually greys out but its own value is preserved.
    document.querySelectorAll('#pp-types input[data-pp]').forEach(cb => { cb.disabled = !all; });
    const hint = $('pp-hint');
    try {
      const r = await api('/api/admin/push-prefs', { method: 'POST', body: JSON.stringify(body) });
      if (r.ok && hint) { hint.innerHTML = `Opgeslagen ${ICON.check}`; setTimeout(() => { if (hint) hint.textContent = ''; }, 2000); }
      else if (hint) hint.textContent = 'Opslaan mislukt — probeer opnieuw';
    } catch { if (hint) hint.textContent = 'Opslaan mislukt — probeer opnieuw'; }
  }
  $('pp-all')?.addEventListener('change', savePushPrefs);
  document.querySelectorAll('#pp-types input[data-pp]').forEach(cb => cb.addEventListener('change', savePushPrefs));

  // --- Editable push texts (templates + presets + live preview) ---
  const PT_META = [
    { key: 'upcoming',   label: 'Speelt zo (± 5 min vooraf)', vars: { team: 'FC Voorbeeld', opponent: 'De Uitdagers', where: 'Kwartfinale', minutes: 5 } },
    { key: 'tijdwijziging', label: 'Tijdwijziging (verwachte aftrap schuift ≥10 min of ander veld)', vars: { team: 'FC Voorbeeld', time: '15:35', where: 'veld 2', opponent: 'De Uitdagers', ronde: 'Kwartfinale' } },
    { key: 'kickoff',    label: 'Aftrap',                   vars: { team: 'FC Voorbeeld', opponent: 'De Uitdagers', where: 'Kwartfinale' } },
    { key: 'result',     label: 'Uitslag',                  vars: { team: 'FC Voorbeeld', opponent: 'De Uitdagers', score: '3–1', result: 'heeft gewonnen', where: 'Kwartfinale' } },
    { key: 'advance',    label: 'Door naar de volgende ronde', vars: { team: 'FC Voorbeeld', round: 'de kwartfinale' } },
    { key: 'placing',    label: 'Eindstand (voor elk team aan het eind)', vars: { team: 'FC Voorbeeld', place: 'als kampioen 🏆' } },
  ];
  let ptPresets = {}, ptPlaceholders = {};
  function ptEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function ptRenderTpl(str, vars) { return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '')).replace(/\s{2,}/g, ' ').trim(); }
  function ptUpdatePreview(meta) {
    const el = $(`pt-${meta.key}-preview`); if (!el) return;
    const title = ptRenderTpl(($(`pt-${meta.key}-title`) || {}).value, meta.vars);
    const body = ptRenderTpl(($(`pt-${meta.key}-body`) || {}).value, meta.vars);
    el.innerHTML = `<div style="display:flex; gap:10px; align-items:flex-start; background:rgba(232,244,255,.06); border:1px solid var(--line); border-radius:12px; padding:10px 12px; max-width:380px;">
      <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#FF6B1A,#FFB347);flex:none;"></div>
      <div style="min-width:0;">
        <div style="font-weight:600; font-size:14px; color:var(--ice); line-height:1.3;">${ptEsc(title) || '<span class="muted">(geen titel)</span>'}</div>
        ${body ? `<div style="font-size:13px; color:var(--ice-muted); margin-top:2px; line-height:1.35;">${ptEsc(body)}</div>` : ''}
        <div style="font-size:11px; color:var(--ice-faint); margin-top:4px;">JVO Toernooi · nu</div>
      </div></div>`;
  }
  const PT_STYLES = ['standaard', 'enthousiast', 'neutraal', 'kort'];
  const PT_STYLE_LABEL = { standaard: 'Standaard', enthousiast: 'Enthousiast', neutraal: 'Neutraal', kort: 'Kort' };
  function ptOptionCards(m) {
    return PT_STYLES.map(style => {
      const p = (ptPresets[style] || {})[m.key] || { title: '', body: '' };
      const title = ptRenderTpl(p.title, m.vars), body = ptRenderTpl(p.body, m.vars);
      return `<button type="button" class="pt-opt" data-cat="${m.key}" data-style="${style}"
        style="text-align:left; cursor:pointer; width:100%; border:1px solid var(--line); background:rgba(232,244,255,.04); border-radius:10px; padding:9px 11px; color:var(--ice);">
        <div class="muted small" style="margin-bottom:3px;">${PT_STYLE_LABEL[style]}</div>
        <div style="font-weight:600; font-size:13px; line-height:1.3;">${ptEsc(title)}</div>
        ${body ? `<div class="small" style="color:var(--ice-muted); margin-top:1px; line-height:1.3;">${ptEsc(body)}</div>` : ''}
      </button>`;
    }).join('');
  }
  function ptBuildRows() {
    const host = $('pt-cats'); if (!host) return;
    host.innerHTML = PT_META.map(m => {
      const ph = (ptPlaceholders[m.key] || []).map(p => `<code>{${p}}</code>`).join(' ');
      return `<div class="pt-cat" style="border-top:1px solid var(--line); padding:16px 0;">
        <div style="font-weight:600; margin-bottom:8px;">${ptEsc(m.label)}</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:8px;">${ptOptionCards(m)}</div>
        <div id="pt-${m.key}-preview" style="margin-top:10px;"></div>
        <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
          <button class="btn-sm" data-pttest="${m.key}">Test op mijn telefoon →</button>
          <details style="margin-left:auto;">
            <summary class="muted small" style="cursor:pointer;">Eigen tekst</summary>
            <div style="margin-top:8px; min-width:240px;">
              <label class="small muted" style="display:block; margin-bottom:6px;">Titel<input type="text" id="pt-${m.key}-title" maxlength="80" style="width:100%;" /></label>
              <label class="small muted" style="display:block;">Tekst <span class="muted">— velden: ${ph}</span><input type="text" id="pt-${m.key}-body" maxlength="160" style="width:100%;" /></label>
              <button class="btn-sm primary" data-ptsave="1" style="margin-top:8px;">Eigen tekst opslaan</button>
            </div>
          </details>
        </div>
      </div>`;
    }).join('');
    host.querySelectorAll('.pt-opt').forEach(b => b.addEventListener('click', () => ptChoose(b.dataset.cat, b.dataset.style)));
    host.querySelectorAll('[data-pttest]').forEach(b => b.addEventListener('click', () => testPushCat(b.dataset.pttest)));
    host.querySelectorAll('[data-ptsave]').forEach(b => b.addEventListener('click', () => savePushTexts()));
    PT_META.forEach(m => ['title', 'body'].forEach(f => $(`pt-${m.key}-${f}`)?.addEventListener('input', () => ptUpdatePreview(m))));
  }
  function ptHighlight() {
    PT_META.forEach(m => {
      const curT = ($(`pt-${m.key}-title`) || {}).value || '', curB = ($(`pt-${m.key}-body`) || {}).value || '';
      document.querySelectorAll(`.pt-opt[data-cat="${m.key}"]`).forEach(b => {
        const p = (ptPresets[b.dataset.style] || {})[m.key] || {};
        const sel = (p.title || '') === curT && (p.body || '') === curB;
        b.style.borderColor = sel ? 'var(--gold)' : 'var(--line)';
        b.style.background = sel ? 'rgba(255,179,71,.12)' : 'rgba(232,244,255,.04)';
      });
    });
  }
  async function ptChoose(cat, style) {
    const p = (ptPresets[style] || {})[cat]; if (!p) return;
    if ($(`pt-${cat}-title`)) $(`pt-${cat}-title`).value = p.title || '';
    if ($(`pt-${cat}-body`)) $(`pt-${cat}-body`).value = p.body || '';
    const m = PT_META.find(x => x.key === cat); if (m) ptUpdatePreview(m);
    await savePushTexts();   // saves all categories; the others keep their value
  }
  async function testPushCat(cat) {
    const hint = $('pt-hint');
    if (hint) hint.textContent = 'Opslaan en versturen…';
    await savePushTexts();   // test sends the currently-saved text
    try {
      const r = await api('/api/admin/push/test-tournament', { method: 'POST', body: JSON.stringify({ category: cat }) });
      const j = await r.json().catch(() => ({}));
      if (hint) hint.textContent = r.ok
        ? `Testmelding verstuurd naar ${j.sent}/${j.total} apparaat${j.total === 1 ? '' : 'en'}`
        : (j.error || 'Versturen mislukt');
    } catch { if (hint) hint.textContent = 'Versturen mislukt'; }
  }
  function ptFill(texts) {
    PT_META.forEach(m => {
      const t = texts[m.key] || {};
      if ($(`pt-${m.key}-title`)) $(`pt-${m.key}-title`).value = t.title || '';
      if ($(`pt-${m.key}-body`)) $(`pt-${m.key}-body`).value = t.body || '';
      ptUpdatePreview(m);
    });
    ptHighlight();
  }
  let ptBuilt = false;
  async function loadPushTexts() {
    if (!$('pt-cats')) return;
    try {
      const r = await api('/api/admin/push-texts');
      if (!r.ok) return;
      const data = await r.json();
      ptPresets = data.presets || {}; ptPlaceholders = data.placeholders || {};
      if (!ptBuilt) { ptBuildRows(); ptBuilt = true; }
      ptFill(data.texts || {});
    } catch {}
  }
  async function savePushTexts() {
    const texts = {};
    PT_META.forEach(m => { texts[m.key] = { title: ($(`pt-${m.key}-title`) || {}).value || '', body: ($(`pt-${m.key}-body`) || {}).value || '' }; });
    const hint = $('pt-hint');
    try {
      const r = await api('/api/admin/push-texts', { method: 'POST', body: JSON.stringify({ texts }) });
      if (r.ok) { const j = await r.json(); ptFill(j.texts || texts); if (hint) { hint.innerHTML = `Opgeslagen ${ICON.check}`; setTimeout(() => { if (hint) hint.textContent = ''; }, 1800); } }
      else if (hint) hint.textContent = 'Opslaan mislukt';
    } catch { if (hint) hint.textContent = 'Opslaan mislukt'; }
  }
  async function ptApplyAll(style) {
    const p = ptPresets[style]; if (!p) return;
    PT_META.forEach(m => {
      const t = p[m.key] || {};
      if ($(`pt-${m.key}-title`)) $(`pt-${m.key}-title`).value = t.title || '';
      if ($(`pt-${m.key}-body`)) $(`pt-${m.key}-body`).value = t.body || '';
    });
    await savePushTexts();
  }
  document.querySelectorAll('[data-ptall]').forEach(b => b.addEventListener('click', () => ptApplyAll(b.dataset.ptall)));

  // --- Context help: an info button (?) that explains the screen you're on ---
  const HELP_CONTENT = {
    overview: { title: 'Overzicht', html: `
      <p>Het dashboard. Hier zie je in één blik hoeveel teams en aanmeldingen er zijn, de status van de herinneringen, en een live toernooi-kaart.</p>
      <ul style="margin:8px 0 0; padding-left:18px;">
        <li>Onder <b>“Evenement”</b> stel je alles in wat per evenement verschilt: naam, datum, locatie, tijden, teksten en sponsor. Bovenaan staat <b>“Klaar voor de start?”</b> — loop die lijst na voordat je de link deelt.</li>
        <li>Onder <b>“Spelregels”</b> zet je je eigen regels op de spelregelpagina.</li>
        <li><b>“Schone start”</b> (helemaal onderaan) wist alle aanmeldingen, teams en het toernooi — voor testdata, of om een volgende editie te beginnen. Je instellingen blijven staan.</li>
        <li>Stel onder <b>“Mijn notificaties”</b> je e-mail in én zet <b>push aan op dit apparaat</b> — dan krijg je een seintje bij nieuwe aanmeldingen, én werkt de “Test op mijn telefoon”-knop bij de meldingen.</li>
      </ul>` },
    teams: { title: 'Teams', html: `
      <p>Alle teamaanmeldingen. Klik een team om te <b>beslissen</b> (goedkeuren / afwijzen / wachtlijst), het <b>schema te mailen</b> of de <b>QR</b> te tonen.</p>
      <ul style="margin:8px 0 0; padding-left:18px;">
        <li><b>Goedkeuren</b> stuurt de captain automatisch een mail met de QR-code én de knop om meldingen aan te zetten.</li>
        <li>Elke actie kun je <b>8 seconden ongedaan maken</b>.</li>
      </ul>` },
    tournament: { title: 'Toernooi', html: `
      <p>Het controlecentrum voor de toernooidag.</p>
      <ul style="margin:8px 0 0; padding-left:18px;">
        <li><b>Genereer schema</b> deelt de teams in en maakt de poules + knock-out.</li>
        <li><b>Tijdschema</b>: starttijd, velden en wedstrijdduur. Daaruit volgt voor elke wedstrijd een aftraptijd + veld.</li>
        <li><b>Pushmeldingen</b>: zet per soort melding aan/uit, en kies de tekst — <b>klikken = meteen opgeslagen</b>, geen typen nodig. “Test op mijn telefoon” stuurt 'm naar je eigen toestel.</li>
        <li><b>Toernooi-status &amp; meldingen</b>: zodra een wedstrijd is afgefloten gaat er <b>automatisch een push</b> naar de volgers. Bij elk team zie je een vinkje met “melding gestuurd”. <b>Je hoeft hier niets te doen</b> — corrigeer alleen de status als er iets niet klopt. “Mail los” is een optionele extra e-mail.</li>
      </ul>` },
    program: { title: 'Programma', html: `<p>De live-pagina (poules, schema, standen, knock-out) in een venster — precies wat bezoekers zien. Met links naar het <b>TV-scherm</b> en de <b>wedstrijdbediening</b> voor de crew.</p>` },
    signups: { title: 'Aanmeldingen', html: `<p>Alle losse aanmeldingen, óók bezoekers zonder team. Klik iemand voor de details. Zoek bovenaan op naam of e-mail.</p>` },
    audit: { title: 'Logboek', html: `<p>Wie deed wat, wanneer. Handig om terug te zien wat er is gebeurd — beslissingen, mails, statuswijzigingen.</p>` },
  };
  function openHelp() {
    const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'overview';
    const c = HELP_CONTENT[tab] || HELP_CONTENT.overview;
    if ($('help-modal-title')) $('help-modal-title').textContent = c.title;
    if ($('help-modal-body')) $('help-modal-body').innerHTML = c.html;
    const m = $('help-modal'); if (m) { m.classList.add('show'); document.body.style.overflow = 'hidden'; }
  }
  function closeHelp() { const m = $('help-modal'); if (m) m.classList.remove('show'); document.body.style.overflow = ''; }
  $('admin-help-fab')?.addEventListener('click', openHelp);
  $('help-modal-close')?.addEventListener('click', closeHelp);
  $('help-modal-close-2')?.addEventListener('click', closeHelp);
  $('help-modal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeHelp(); });

  $('sched-save')?.addEventListener('click', async () => {
    const fieldRoles = {};
    document.querySelectorAll('#sched-roles select[data-role-field]').forEach(s => {
      fieldRoles[s.dataset.roleField] = s.value;
    });
    const body = {
      start_time: ($('sched-start') || {}).value || '15:30',
      fields: parseInt(($('sched-fields') || {}).value, 10),
      match_min: parseInt(($('sched-match') || {}).value, 10),
      break_min: parseInt(($('sched-break') || {}).value, 10),
      field_roles: fieldRoles,
      fairness: !!($('sched-fairness') || {}).checked,
      ko_block: !!($('sched-ko-block') || {}).checked,
      ko_buffer_slots: parseInt(($('sched-ko-buffer') || {}).value, 10) || 0,
    };
    const btn = $('sched-save'); btn.disabled = true; btn.textContent = 'Opslaan…';
    if ($('sched-hint')) $('sched-hint').textContent = '';
    try {
      const r = await api('/api/admin/tournament/schedule-config', { method: 'POST', body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) { if ($('sched-hint')) $('sched-hint').textContent = json.error || 'Opslaan mislukt'; }
      else { fillSchedForm(json.schedule); showToast('Tijdschema opgeslagen — opnieuw ingepland'); renderTournDashboard(); }
    } catch (e) { if ($('sched-hint')) $('sched-hint').textContent = 'Netwerkfout — probeer opnieuw.'; }
    finally { btn.disabled = false; btn.textContent = 'Tijdschema opslaan'; }
  });
  $('tourn-generate')?.addEventListener('click', async () => {
    // If the pre-check itself fails we must assume a tournament EXISTS — the
    // POST below carries force:true, so skipping the confirmation on a fetch
    // hiccup could wipe live scores without any warning.
    const t = await fetch('/api/tournament').then(r => r.json()).catch(() => ({ configured: true, precheck_failed: true }));
    if (t.configured) {
      // Has any match already started or finished? Then a regenerate throws away
      // real, played results — ask for a much stronger confirmation.
      const pouleMatches = TOURN_POULES.filter(p => t.poules?.[p]).flatMap(p => t.poules[p].matches || []);
      const koMatches = t.knockout || [];
      const hasResults = t.precheck_failed === true   // unknown state → assume the worst
        || (t.live || []).length > 0
        || pouleMatches.some(m => m.status === 'live' || m.status === 'done')
        || koMatches.some(m => m.status === 'live' || m.status === 'done');
      if (hasResults) {
        const typed = prompt('LET OP: er zijn al wedstrijden bezig of gespeeld. Opnieuw genereren WIST alle live-standen en uitslagen onherroepelijk.\n\nType WIS om te bevestigen:');
        if ((typed || '').trim().toUpperCase() !== 'WIS') return;
      } else if (!confirm('Er is al een toernooi. Opnieuw genereren wist alle huidige uitslagen. Doorgaan?')) {
        return;
      }
    }
    const format = selectedFormat;
    const btn = $('tourn-generate'); btn.disabled = true; btn.textContent = 'Genereren…';
    try {
      const r = await api('/api/admin/tournament/generate', { method: 'POST', body: JSON.stringify({ force: true, format, variant: selectedVariant }) });
      const json = await r.json();
      if (!r.ok) alert('Fout: ' + (json.error || r.status));
      else showToast('Toernooischema gegenereerd');
    } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    finally { btn.disabled = false; btn.textContent = 'Genereer schema'; renderTournDashboard(); }
  });
  $('tourn-send')?.addEventListener('click', async () => {
    if (!confirm('Elke captain een mail sturen met z\'n persoonlijke schema + live-link?\n\nNa bevestigen heb je 8 seconden om dit ongedaan te maken.')) return;
    const btn = $('tourn-send'); btn.disabled = true; btn.textContent = 'Versturen…';
    try {
      const r = await api('/api/admin/tournament/send-schedules', { method: 'POST', body: JSON.stringify({}) });
      const json = await r.json();
      if (!r.ok) alert('Fout: ' + (json.error || r.status));
      else if (json.actionId && json.undoWindowMs) {
        showUndoToast({
          message: `${json.count} schema-mail${json.count === 1 ? '' : 's'} gaat naar de captains`,
          actionId: json.actionId,
          undoWindowMs: json.undoWindowMs,
          onUndo: async (actionId) => { const rr = await api(`/api/admin/undo/${actionId}`, { method: 'POST' }); if (!rr.ok) throw new Error('Undo failed'); },
        });
      } else showToast(`${json.sent ?? json.count ?? 0} schema-mails verstuurd${json.failed ? `, ${json.failed} mislukt` : ''}`);
    } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    finally { btn.disabled = false; btn.textContent = 'Mail schema\'s naar captains'; }
  });
  // Sponsor- & prijzen-aankondiging — preview + send live together in a modal, with
  // a real Send button (no confirm()/new-tab dialogs, which a backgrounded tab or a
  // "block more dialogs" browser would silently swallow). De sponsor komt uit het
  // evenement-profiel; staat de sponsor uit, dan antwoordt de server 409 met een
  // duidelijke melding en tonen we die hier.
  let prizePreviewHtml = null;
  async function openPrizeModal() {
    const m = $('prize-modal'); if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    const sub = $('prize-modal-sub'), send = $('prize-modal-send'), res = $('prize-modal-result'), prev = $('prize-modal-preview');
    res.textContent = ''; sub.textContent = 'Voorbeeld laden…'; send.disabled = true; send.textContent = 'Verstuur →'; prev.disabled = true; prizePreviewHtml = null;
    try {
      const r = await api('/api/admin/tournament/prize-announce/preview');
      const j = await r.json();
      if (!r.ok) { sub.innerHTML = `<span style="color:var(--gold-2)">${escape(j.error || 'Kon voorbeeld niet laden')}</span>`; return; }
      prizePreviewHtml = j.html; prev.disabled = false;
      const n = j.recipients;
      send.disabled = n < 1;
      send.textContent = `Verstuur naar ${n} team${n === 1 ? '' : 's'} →`;
      const who = evcSponsor.enabled && evcSponsor.name ? ` over <b>${escape(evcSponsor.name)}</b> en de prijzen` : '';
      sub.innerHTML = `Deze aankondiging${who} gaat naar <b>${n}</b> goedgekeurde team${n === 1 ? '' : 's'}. Bekijk eerst het voorbeeld, en verstuur dan. Teams die 'm al kregen, slaan we over.`;
    } catch { sub.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; }
  }
  function closePrizeModal() { $('prize-modal')?.classList.remove('show'); document.body.style.overflow = ''; }
  function prizeOpenPreview() {
    if (!prizePreviewHtml) return;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(prizePreviewHtml); w.document.close(); }
    else alert('Pop-up geblokkeerd — sta pop-ups toe voor deze site.');
  }
  async function prizeSend() {
    const send = $('prize-modal-send'), res = $('prize-modal-result'); const orig = send.textContent;
    send.disabled = true; send.textContent = 'Versturen…'; res.textContent = '';
    try {
      const r = await api('/api/admin/tournament/prize-announce/send', { method: 'POST', body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { res.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Versturen mislukt')}</span>`; send.disabled = false; send.textContent = orig; return; }
      const sent = Number(j.sent) || 0, failed = Number(j.failed) || 0, skipped = Number(j.skipped) || 0;
      const parts = [`${sent} sponsor-mail${sent === 1 ? '' : 's'} verstuurd`];
      if (skipped) parts.push(`${skipped} overgeslagen (had 'm al)`);
      if (failed) parts.push(`${failed} mislukt`);
      // Niets verstuurd omdat iedereen 'm al had = geen succes-vinkje, wel uitleg.
      if (!sent && skipped && !failed) {
        res.innerHTML = `<span style="color:var(--gold-2)">Niemand gemaild: ${skipped === 1 ? 'het ene team had' : `alle ${skipped} teams hadden`} deze mail al.</span>`;
        showToast('Geen nieuwe sponsor-mails — iedereen had \'m al', 'info');
        send.textContent = 'Al verstuurd';
      } else {
        res.innerHTML = `<span style="color:${failed ? 'var(--gold-2)' : 'var(--success)'}">${failed ? ICON.warn : ICON.check} ${parts.join(' · ')}</span>`;
        showToast(parts.join(' · '), failed ? 'info' : 'success');
        send.innerHTML = `${ICON.check} Verstuurd`;
      }
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; send.disabled = false; send.textContent = orig; }
  }
  $('tourn-prize')?.addEventListener('click', openPrizeModal);
  $('prize-modal-close')?.addEventListener('click', closePrizeModal);
  $('prize-modal-cancel')?.addEventListener('click', closePrizeModal);
  $('prize-modal-preview')?.addEventListener('click', prizeOpenPreview);
  $('prize-modal-send')?.addEventListener('click', prizeSend);
  $('prize-modal')?.addEventListener('click', (e) => { if (e.target.id === 'prize-modal') closePrizeModal(); });

  // Programma & tijdschema — same preview + send modal pattern as the sponsor
  // mail. Not a one-shot, so it can be re-sent (e.g. after a poule change).
  let programPreviewHtml = null;
  async function openProgramModal() {
    const m = $('program-modal'); if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    const sub = $('program-modal-sub'), send = $('program-modal-send'), res = $('program-modal-result'), prev = $('program-modal-preview');
    res.textContent = ''; sub.textContent = 'Voorbeeld laden…'; send.disabled = true; send.textContent = 'Verstuur →'; prev.disabled = true; programPreviewHtml = null;
    try {
      const r = await api('/api/admin/tournament/program-info/preview');
      const j = await r.json();
      if (!r.ok) { sub.innerHTML = `<span style="color:var(--gold-2)">${escape(j.error || 'Kon voorbeeld niet laden')}</span>`; return; }
      programPreviewHtml = j.html; prev.disabled = false;
      const n = j.recipients;
      send.disabled = n < 1;
      send.textContent = `Verstuur naar ${n} team${n === 1 ? '' : 's'} →`;
      sub.innerHTML = `Deze mail met dagprogramma, tijdschema en poule-indeling gaat naar <b>${n}</b> goedgekeurde team${n === 1 ? '' : 's'}. Bekijk eerst het voorbeeld, en verstuur dan.`;
    } catch { sub.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; }
  }
  function closeProgramModal() { $('program-modal')?.classList.remove('show'); document.body.style.overflow = ''; }
  function programOpenPreview() {
    if (!programPreviewHtml) return;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(programPreviewHtml); w.document.close(); }
    else alert('Pop-up geblokkeerd — sta pop-ups toe voor deze site.');
  }
  async function programSend() {
    const send = $('program-modal-send'), res = $('program-modal-result'); const orig = send.textContent;
    send.disabled = true; send.textContent = 'Versturen…'; res.textContent = '';
    try {
      const r = await api('/api/admin/tournament/program-info/send', { method: 'POST', body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { res.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Versturen mislukt')}</span>`; send.disabled = false; send.textContent = orig; return; }
      res.innerHTML = `<span style="color:var(--success)">${ICON.check} ${j.sent} programma-mail${j.sent === 1 ? '' : 's'} verstuurd${j.failed ? `, ${j.failed} mislukt` : ''}</span>`;
      showToast(`${j.sent} programma-mails verstuurd`);
      send.innerHTML = `${ICON.check} Verstuurd`;
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; send.disabled = false; send.textContent = orig; }
  }
  // QR-bulkmail — zelfde preview+verstuur-modal. Herverzendbaar (roteert niks:
  // de bestaande QR blijft geldig); elke mail bevat de QR-bijlage + teamcode.
  let qrmailPreviewHtml = null;
  async function openQrmailModal() {
    const m = $('qrmail-modal'); if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    const sub = $('qrmail-modal-sub'), send = $('qrmail-modal-send'), res = $('qrmail-modal-result'), prev = $('qrmail-modal-preview');
    res.textContent = ''; sub.textContent = 'Voorbeeld laden…'; send.disabled = true; send.textContent = 'Verstuur →'; prev.disabled = true; qrmailPreviewHtml = null;
    try {
      const r = await api('/api/admin/tournament/qr-mails/preview');
      const j = await r.json();
      if (!r.ok) { sub.innerHTML = `<span style="color:var(--gold-2)">${escape(j.error || 'Kon voorbeeld niet laden')}</span>`; return; }
      qrmailPreviewHtml = j.html; prev.disabled = false;
      const n = j.recipients;
      send.disabled = n < 1;
      send.textContent = `Verstuur naar ${n} team${n === 1 ? '' : 's'} →`;
      sub.innerHTML = `Elke captain krijgt (nogmaals) de <b>team-QR als bijlage</b> + de <b>teamcode</b> als reserve voor de handmatige check-in. Gaat naar <b>${n}</b> goedgekeurde team${n === 1 ? '' : 's'}; bestaande QR's blijven gewoon geldig.`;
    } catch { sub.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; }
  }
  function closeQrmailModal() { $('qrmail-modal')?.classList.remove('show'); document.body.style.overflow = ''; }
  function qrmailOpenPreview() {
    if (!qrmailPreviewHtml) return;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(qrmailPreviewHtml); w.document.close(); }
    else alert('Pop-up geblokkeerd — sta pop-ups toe voor deze site.');
  }
  async function qrmailSend() {
    const send = $('qrmail-modal-send'), res = $('qrmail-modal-result'); const orig = send.textContent;
    send.disabled = true; send.textContent = 'Versturen…'; res.textContent = '';
    try {
      const r = await api('/api/admin/tournament/qr-mails/send', { method: 'POST', body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { res.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Versturen mislukt')}</span>`; send.disabled = false; send.textContent = orig; return; }
      res.innerHTML = `<span style="color:var(--success)">${ICON.check} ${j.sent} QR-mail${j.sent === 1 ? '' : 's'} verstuurd${j.failed ? `, ${j.failed} mislukt` : ''}</span>`;
      showToast(`${j.sent} QR-mails verstuurd`);
      send.innerHTML = `${ICON.check} Verstuurd`;
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; send.disabled = false; send.textContent = orig; }
  }
  // "Vandaag is de dag" — event-ochtend-mail, zelfde preview+verstuur-modal.
  let eventdayPreviewHtml = null, eventdayVisitorHtml = null;
  async function openEventdayModal() {
    const m = $('eventday-modal'); if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    const sub = $('eventday-modal-sub'), send = $('eventday-modal-send'), res = $('eventday-modal-result'), prev = $('eventday-modal-preview');
    res.textContent = ''; sub.textContent = 'Voorbeeld laden…'; send.disabled = true; send.textContent = 'Verstuur →'; prev.disabled = true; eventdayPreviewHtml = null; eventdayVisitorHtml = null;
    const prevV = $('eventday-modal-preview-visitor'); if (prevV) prevV.disabled = true;
    try {
      const r = await api('/api/admin/tournament/eventday-mails/preview');
      const j = await r.json();
      if (!r.ok) { sub.innerHTML = `<span style="color:var(--gold-2)">${escape(j.error || 'Kon voorbeeld niet laden')}</span>`; return; }
      eventdayPreviewHtml = j.html; prev.disabled = false;
      eventdayVisitorHtml = j.visitor_html || null;
      if (prevV) prevV.disabled = !eventdayVisitorHtml;
      const n = j.recipients, nv = j.visitor_recipients || 0;
      send.disabled = (n + nv) < 1;
      send.textContent = `Verstuur naar ${n} teams + ${nv} bezoekers →`;
      sub.innerHTML = `De ochtend-mail voor de dag zelf, in twee versies: <b>${n} teams</b> krijgen de gepersonaliseerde mail (dagprogramma, wees-op-tijd, QR-bijlage + teamcode, persoonlijke app-link) en <b>${nv} bezoekers</b> de algemene versie (dagprogramma + volg het toernooi live in de app).`;
    } catch { sub.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; }
  }
  function closeEventdayModal() { $('eventday-modal')?.classList.remove('show'); document.body.style.overflow = ''; }
  function eventdayOpenPreview() {
    if (!eventdayPreviewHtml) return;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(eventdayPreviewHtml); w.document.close(); }
    else alert('Pop-up geblokkeerd — sta pop-ups toe voor deze site.');
  }
  function eventdayOpenVisitorPreview() {
    if (!eventdayVisitorHtml) return;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(eventdayVisitorHtml); w.document.close(); }
    else alert('Pop-up geblokkeerd — sta pop-ups toe voor deze site.');
  }
  async function eventdaySend() {
    const send = $('eventday-modal-send'), res = $('eventday-modal-result'); const orig = send.textContent;
    send.disabled = true; send.textContent = 'Versturen…'; res.textContent = '';
    try {
      const r = await api('/api/admin/tournament/eventday-mails/send', { method: 'POST', body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { res.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Versturen mislukt')}</span>`; send.disabled = false; send.textContent = orig; return; }
      const tot = (j.sent || 0) + (j.visitor_sent || 0), fail = (j.failed || 0) + (j.visitor_failed || 0);
      res.innerHTML = `<span style="color:var(--success)">${ICON.check} ${j.sent} team-mails + ${j.visitor_sent || 0} bezoekersmails verstuurd${fail ? `, ${fail} mislukt` : ''}</span>`;
      showToast(`${tot} 'vandaag is de dag'-mails verstuurd`);
      send.innerHTML = `${ICON.check} Verstuurd`;
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; send.disabled = false; send.textContent = orig; }
  }
  // Bedankt & feedback — preview + verstuur, zelfde patroon als eventday.
  let feedbackPreviewHtml = null, feedbackVisitorHtml = null;
  async function openFeedbackModal() {
    const m = $('feedback-modal'); if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    const sub = $('feedback-modal-sub'), send = $('feedback-modal-send'), res = $('feedback-modal-result');
    const prev = $('feedback-modal-preview'), prevV = $('feedback-modal-preview-visitor');
    res.textContent = ''; sub.textContent = 'Voorbeeld laden…'; send.disabled = true; send.textContent = 'Verstuur →'; prev.disabled = true; prevV.disabled = true;
    feedbackPreviewHtml = null; feedbackVisitorHtml = null;
    try {
      const r = await api('/api/admin/tournament/feedback-mails/preview');
      const j = await r.json();
      if (!r.ok) { sub.innerHTML = `<span style="color:var(--gold-2)">${escape(j.error || 'Kon voorbeeld niet laden')}</span>`; return; }
      feedbackPreviewHtml = j.html; prev.disabled = false;
      feedbackVisitorHtml = j.visitor_html || null; prevV.disabled = !feedbackVisitorHtml;
      const n = j.recipients, nv = j.visitor_recipients || 0;
      send.disabled = (n + nv) < 1;
      send.textContent = `Verstuur naar ${n} teams + ${nv} bezoekers →`;
      sub.innerHTML = `Bedankmail met de feedbackvraag (“beantwoord deze mail”): <b>${n} teams</b> gepersonaliseerd + <b>${nv} bezoekers</b> algemeen.`;
    } catch { sub.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; }
  }
  function closeFeedbackModal() { $('feedback-modal')?.classList.remove('show'); document.body.style.overflow = ''; }
  const openHtmlPreview = (html) => {
    if (!html) return;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else alert('Pop-up geblokkeerd — sta pop-ups toe voor deze site.');
  };
  async function feedbackSend() {
    const send = $('feedback-modal-send'), res = $('feedback-modal-result'); const orig = send.textContent;
    send.disabled = true; send.textContent = 'Versturen…'; res.textContent = '';
    try {
      const r = await api('/api/admin/tournament/feedback-mails/send', { method: 'POST', body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { res.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Versturen mislukt')}</span>`; send.disabled = false; send.textContent = orig; return; }
      const tot = (j.sent || 0) + (j.visitor_sent || 0), fail = (j.failed || 0) + (j.visitor_failed || 0);
      res.innerHTML = `<span style="color:var(--success)">${ICON.check} ${j.sent} team-mails + ${j.visitor_sent || 0} bezoekersmails verstuurd${fail ? `, ${fail} mislukt` : ''}</span>`;
      showToast(`${tot} bedank-mails verstuurd`);
      send.innerHTML = `${ICON.check} Verstuurd`;
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; send.disabled = false; send.textContent = orig; }
  }
  // Feedback-resultaten: tellingen per categorie als balkjes, plus cijfer,
  // terugkeer-intentie, veelgenoemde woorden en de vrije teksten.
  async function loadFbResults() {
    const el = $('fb-results'); if (!el) return;
    el.innerHTML = 'Laden…';
    try {
      const r = await api('/api/admin/feedback/summary');
      const j = await r.json();
      if (!r.ok) { el.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Kon niet laden')}</span>`; return; }
      if (!j.total) { el.innerHTML = 'Nog geen inzendingen — de teller start zodra de eerste enquête binnenkomt.'; return; }
      const bars = (items, color, max) => items.map(it => `
        <div style="display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:center; margin:5px 0;">
          <div>
            <div style="font-size:13px; color:var(--ice); margin-bottom:3px;">${escape(it.name)}</div>
            <div style="height:8px; border-radius:4px; background:var(--midnight); overflow:hidden;"><div style="height:100%; width:${Math.round((it.n / Math.max(1, max)) * 100)}%; background:${color}; border-radius:4px;"></div></div>
          </div>
          <b style="font-family:var(--mono); font-size:13px; color:var(--ice);">${it.n}×</b>
        </div>`).join('');
      const maxB = Math.max(1, ...(j.beter.map(x => x.n))), maxT = Math.max(1, ...(j.top.map(x => x.n)));
      const again = Object.fromEntries(j.again.map(x => [x.name, x.n]));
      const woorden = j.words.length ? j.words.map(w => `<span style="display:inline-block; background:var(--midnight); border:1px solid var(--line); border-radius:16px; padding:3px 10px; margin:0 5px 6px 0; font-size:12.5px; color:var(--ice);">${escape(w.name)} <b style="color:var(--gold-2)">${w.n}×</b></span>`).join('') : '<span class="muted">nog te weinig tekst</span>';
      const comments = j.comments.slice(0, 30).map(c => `<div style="border-top:1px dashed var(--line); padding:8px 0; font-size:13px; color:var(--ice);">${escape(c.text)}<div class="small muted" style="margin-top:2px;">${c.role ? escape(c.role) + ' · ' : ''}cijfer ${c.score ?? '–'}</div></div>`).join('');
      el.innerHTML = `
        <div style="display:flex; gap:18px; flex-wrap:wrap; margin-bottom:14px;">
          <div><div class="card-eyebrow">Inzendingen</div><b style="font-size:22px; color:var(--ice);">${j.total}</b></div>
          <div><div class="card-eyebrow">Gem. cijfer</div><b style="font-size:22px; color:var(--gold-2);">${j.avg_score ?? '–'}</b></div>
          <div><div class="card-eyebrow">Komt terug</div><b style="font-size:22px; color:var(--success);">${again.ja || 0}</b> <span class="muted small">ja · ${again.misschien || 0} misschien · ${again.nee || 0} nee</span></div>
        </div>
        <div class="card-eyebrow" style="margin-bottom:6px;">Wat kan beter — vaakst aangevinkt</div>
        ${bars(j.beter, 'linear-gradient(90deg, var(--ember), var(--gold))', maxB) || '<div class="muted small">nog niets aangevinkt</div>'}
        <div class="card-eyebrow" style="margin:16px 0 6px;">Wat was top</div>
        ${bars(j.top, 'rgba(108,227,160,.8)', maxT) || '<div class="muted small">nog niets aangevinkt</div>'}
        <div class="card-eyebrow" style="margin:16px 0 6px;">Veelgenoemde woorden (vrije tekst)</div>
        <div>${woorden}</div>
        <div class="card-eyebrow" style="margin:16px 0 2px;">Toelichtingen (${j.comments.length})</div>
        ${comments || '<div class="muted small">geen vrije tekst</div>'}`;
    } catch { el.innerHTML = '<span style="color:var(--danger)">Netwerkfout.</span>'; }
  }
  $('fb-fold')?.addEventListener('toggle', () => { if ($('fb-fold').open) loadFbResults(); });
  $('fb-refresh')?.addEventListener('click', loadFbResults);

  $('tourn-feedback-mail')?.addEventListener('click', openFeedbackModal);
  $('feedback-modal-close')?.addEventListener('click', closeFeedbackModal);
  $('feedback-modal-cancel')?.addEventListener('click', closeFeedbackModal);
  $('feedback-modal-preview')?.addEventListener('click', () => openHtmlPreview(feedbackPreviewHtml));
  $('feedback-modal-preview-visitor')?.addEventListener('click', () => openHtmlPreview(feedbackVisitorHtml));
  $('feedback-modal-send')?.addEventListener('click', feedbackSend);
  $('feedback-modal')?.addEventListener('click', (e) => { if (e.target.id === 'feedback-modal') closeFeedbackModal(); });

  // ===== TEAMLOGO'S — inzendingen goedkeuren/afkeuren + logo-mail ==========
  // Captains bouwen (of uploaden) een logo via hun persoonlijke link; het
  // verschijnt pas op het bord ná goedkeuring hier. De lijst ververst bij het
  // openen van de fold en na elke beslissing. Badges renderen we veilig via de
  // gedeelde renderer (window.jvoLogo); foto's komen als data-URL mee zodat we
  // ook nog-niet-goedgekeurd materiaal zien zonder publieke route.
  async function loadLogos() {
    const el = $('lg-admin-list'); if (!el) return;
    el.innerHTML = '<div class="tcz-empty">Laden…</div>';
    try {
      const r = await api('/api/admin/logos');
      const j = await r.json();
      if (!r.ok) { el.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Kon niet laden')}</span>`; return; }
      const logos = j.logos || [];
      if (!logos.length) { el.innerHTML = '<div class="tcz-empty">Nog geen inzendingen — captains maken hun logo via de mail-link.</div>'; return; }
      const pill = (st) => {
        const map = { pending: ['lg-pending', 'wacht op beoordeling'], approved: ['lg-approved', 'goedgekeurd'], rejected: ['lg-rejected', 'afgekeurd'] };
        const [cls, txt] = map[st] || ['lg-pending', st || '—'];
        return `<span class="lg-pill ${cls}">${escape(txt)}</span>`;
      };
      const visual = (it) => {
        if (it.kind === 'badge' && it.badge && window.jvoLogo) return `<span class="lg-thumb">${window.jvoLogo.badgeSvg(it.badge, 52)}</span>`;
        if (it.kind === 'photo' && it.data_url) return `<span class="lg-thumb"><img src="${escape(it.data_url)}" width="52" height="52" alt="" /></span>`;
        return '<span class="lg-thumb lg-thumb-missing" title="Afbeelding ontbreekt">?</span>';
      };
      el.innerHTML = logos.map(it => `
        <div class="lg-row" data-id="${it.team_id}">
          ${visual(it)}
          <div class="lg-info">
            <div class="lg-name">${escape(it.team_name)}</div>
            <div class="lg-meta">${it.kind === 'badge' ? 'Badge' : 'Foto'} · ${pill(it.status)}</div>
          </div>
          <div class="lg-acts">
            <button class="btn-sm primary" data-lg-act="approved"${it.status === 'approved' ? ' disabled' : ''}>Goedkeuren</button>
            <button class="btn-sm danger" data-lg-act="rejected"${it.status === 'rejected' ? ' disabled' : ''}>Afkeuren</button>
          </div>
        </div>`).join('');
      el.querySelectorAll('button[data-lg-act]').forEach(btn => btn.addEventListener('click', () => logoDecision(btn)));
    } catch { el.innerHTML = '<span style="color:var(--danger)">Netwerkfout.</span>'; }
  }
  async function logoDecision(btn) {
    const row = btn.closest('.lg-row'); if (!row) return;
    const id = row.getAttribute('data-id');
    const decision = btn.getAttribute('data-lg-act');
    row.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      const r = await api(`/api/admin/teams/${id}/logo-decision`, { method: 'POST', body: JSON.stringify({ decision }) });
      const j = await r.json();
      if (!r.ok) { showToast(j.error || 'Mislukt', 'error'); row.querySelectorAll('button').forEach(b => b.disabled = false); return; }
      showToast(decision === 'approved' ? 'Logo goedgekeurd — staat nu op het bord' : 'Logo afgekeurd');
      loadLogos();
    } catch { showToast('Netwerkfout — probeer opnieuw.', 'error'); row.querySelectorAll('button').forEach(b => b.disabled = false); }
  }
  $('tc-logos-fold')?.addEventListener('toggle', () => { if ($('tc-logos-fold').open) loadLogos(); });

  // Logo-uitnodiging mailen — zelfde preview + verstuur-modal als de sponsor-
  // /programma-mail. Herverzendbaar; de persoonlijke link blijft geldig.
  let logomailPreviewHtml = null;
  async function openLogomailModal() {
    const m = $('logomail-modal'); if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    const sub = $('logomail-modal-sub'), send = $('logomail-modal-send'), res = $('logomail-modal-result'), prev = $('logomail-modal-preview');
    res.textContent = ''; sub.textContent = 'Voorbeeld laden…'; send.disabled = true; send.textContent = 'Verstuur →'; prev.disabled = true; logomailPreviewHtml = null;
    try {
      const r = await api('/api/admin/logo-mails/preview');
      const j = await r.json();
      if (!r.ok) { sub.innerHTML = `<span style="color:var(--gold-2)">${escape(j.error || 'Kon voorbeeld niet laden')}</span>`; return; }
      logomailPreviewHtml = j.html; prev.disabled = false;
      const n = j.recipients;
      send.disabled = n < 1;
      send.textContent = `Verstuur naar ${n} team${n === 1 ? '' : 's'} →`;
      sub.innerHTML = `Elke captain krijgt een persoonlijke link om een teamlogo (badge of foto) te maken. Het verschijnt pas op het live-bord ná jouw goedkeuring (fold “Teamlogo's”). Gaat naar <b>${n}</b> goedgekeurde team${n === 1 ? '' : 's'}.`;
    } catch { sub.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; }
  }
  function closeLogomailModal() { $('logomail-modal')?.classList.remove('show'); document.body.style.overflow = ''; }
  async function logomailSend() {
    const send = $('logomail-modal-send'), res = $('logomail-modal-result'); const orig = send.textContent;
    send.disabled = true; send.textContent = 'Versturen…'; res.textContent = '';
    try {
      const r = await api('/api/admin/logo-mails/send', { method: 'POST', body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) { res.innerHTML = `<span style="color:var(--danger)">${escape(j.error || 'Versturen mislukt')}</span>`; send.disabled = false; send.textContent = orig; return; }
      res.innerHTML = `<span style="color:var(--success)">${ICON.check} ${j.sent} logo-mail${j.sent === 1 ? '' : 's'} verstuurd${j.failed ? `, ${j.failed} mislukt` : ''}</span>`;
      showToast(`${j.sent} logo-mails verstuurd`);
      send.innerHTML = `${ICON.check} Verstuurd`;
    } catch { res.innerHTML = '<span style="color:var(--danger)">Netwerkfout — probeer opnieuw.</span>'; send.disabled = false; send.textContent = orig; }
  }
  $('tourn-logo-mail')?.addEventListener('click', openLogomailModal);
  $('logomail-modal-close')?.addEventListener('click', closeLogomailModal);
  $('logomail-modal-cancel')?.addEventListener('click', closeLogomailModal);
  $('logomail-modal-preview')?.addEventListener('click', () => openHtmlPreview(logomailPreviewHtml));
  $('logomail-modal-send')?.addEventListener('click', logomailSend);
  $('logomail-modal')?.addEventListener('click', (e) => { if (e.target.id === 'logomail-modal') closeLogomailModal(); });

  // Post-event: back-up + geanonimiseerd resultaten-archief downloaden.
  async function downloadExport(kind, btnId) {
    const btn = $(btnId); if (btn) { btn.disabled = true; }
    try {
      const r = await api(`/api/admin/export/${kind}`);
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert('Export mislukt: ' + (j.error || r.status)); return; }
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (m && m[1]) || `jvo-export-${kind}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      showToast(kind === 'backup' ? 'Back-up gedownload' : 'Resultaten-archief gedownload');
    } catch { alert('Netwerkfout — probeer opnieuw.'); }
    finally { if (btn) btn.disabled = false; }
  }
  $('tourn-export-backup')?.addEventListener('click', () => downloadExport('backup', 'tourn-export-backup'));
  $('tourn-export-results')?.addEventListener('click', () => downloadExport('results', 'tourn-export-results'));

  $('tourn-eventday-mail')?.addEventListener('click', openEventdayModal);
  $('eventday-modal-close')?.addEventListener('click', closeEventdayModal);
  $('eventday-modal-cancel')?.addEventListener('click', closeEventdayModal);
  $('eventday-modal-preview')?.addEventListener('click', eventdayOpenPreview);
  $('eventday-modal-preview-visitor')?.addEventListener('click', eventdayOpenVisitorPreview);
  $('eventday-modal-send')?.addEventListener('click', eventdaySend);
  $('eventday-modal')?.addEventListener('click', (e) => { if (e.target.id === 'eventday-modal') closeEventdayModal(); });

  $('tourn-qr-mail')?.addEventListener('click', openQrmailModal);
  $('qrmail-modal-close')?.addEventListener('click', closeQrmailModal);
  $('qrmail-modal-cancel')?.addEventListener('click', closeQrmailModal);
  $('qrmail-modal-preview')?.addEventListener('click', qrmailOpenPreview);
  $('qrmail-modal-send')?.addEventListener('click', qrmailSend);
  $('qrmail-modal')?.addEventListener('click', (e) => { if (e.target.id === 'qrmail-modal') closeQrmailModal(); });

  $('tourn-program-mail')?.addEventListener('click', openProgramModal);
  $('program-modal-close')?.addEventListener('click', closeProgramModal);
  $('program-modal-cancel')?.addEventListener('click', closeProgramModal);
  $('program-modal-preview')?.addEventListener('click', programOpenPreview);
  $('program-modal-send')?.addEventListener('click', programSend);
  $('program-modal')?.addEventListener('click', (e) => { if (e.target.id === 'program-modal') closeProgramModal(); });
  $('tourn-reset')?.addEventListener('click', async () => {
    if (!confirm('Het hele toernooi wissen (teams-indeling + alle uitslagen)? Dit kan niet ongedaan worden gemaakt.')) return;
    try {
      const r = await api('/api/admin/tournament/reset', { method: 'POST' });
      if (r.ok) { showToast('Toernooi gewist'); renderTournDashboard(); refreshPauseBtn(); }
    } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
  });

  // Big pause / resume control.
  function setPauseBtn(paused) {
    const btn = $('tourn-pause'); if (!btn) return;
    btn.dataset.paused = paused ? '1' : '0';
    btn.classList.toggle('is-paused', paused);
    btn.innerHTML = paused
      ? `${ICON.play} <span>Hervat toernooi</span>`
      : `${ICON.pause} <span>Pauzeer toernooi</span>`;
    const hint = $('tourn-pause-hint');
    if (hint) hint.textContent = paused
      ? 'Het toernooi is GEPAUZEERD — er kan niets gestart worden en de crew zit op slot. Druk op Hervat om verder te gaan.'
      : 'Pauzeert alle wedstrijden: niemand kan een nieuwe wedstrijd starten en de crew kan niets meer aanpassen. Jij (admin) kunt nog wel standen bijwerken.';
  }
  async function refreshPauseBtn() {
    if (!$('tourn-pause')) return;
    try { const t = await (await fetch('/api/tournament')).json(); setPauseBtn(!!t.paused); } catch {}
  }
  $('tourn-pause')?.addEventListener('click', async () => {
    const btn = $('tourn-pause'); if (!btn) return;
    const paused = btn.dataset.paused === '1';
    const url = paused ? '/api/admin/tournament/resume' : '/api/admin/tournament/pause';
    btn.disabled = true;
    try {
      const message = paused ? undefined : (($('tourn-pause-msg') || {}).value || '').trim();
      const r = await api(url, { method: 'POST', body: JSON.stringify(message ? { message } : {}) });
      if (r.ok) { const j = await r.json().catch(() => ({})); setPauseBtn(!!j.paused); if (!j.paused && $('tourn-pause-msg')) $('tourn-pause-msg').value = ''; showToast(j.paused ? 'Toernooi gepauzeerd' : 'Toernooi hervat'); }
      else alert('Kon de pauzestatus niet wijzigen.');
    } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    finally { btn.disabled = false; }
  });

  // Format selector cards — manual pick overrides the auto-detected format.
  document.querySelectorAll('#tc-formats .tc-fmt').forEach(b => b.addEventListener('click', () => { fmtInitialized = true; selectFormat(b.dataset.fmt); }));
  selectFormat(selectedFormat);
  renderTournDashboard();
  refreshPauseBtn();

  // ===== PUSH NOTIFICATIONS ======================================
  // Web Push subscribe/unsubscribe/test for this device.
  const PUSH_SUPPORTED = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  // Convert a base64 VAPID key (URL-safe) into a Uint8Array as required by PushManager.subscribe()
  function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
    return output;
  }

  function setPushStatus(text, kind) {
    const el = $('push-status');
    const txt = $('push-status-text');
    if (!el || !txt) return;
    txt.textContent = text;
    el.classList.remove('active', 'warn', 'error');
    if (kind) el.classList.add(kind);
  }

  function showPushButtons({ enable, disable, test }) {
    if ($('push-enable-btn')) $('push-enable-btn').style.display = enable ? '' : 'none';
    if ($('push-disable-btn')) $('push-disable-btn').style.display = disable ? '' : 'none';
    if ($('push-test-btn')) $('push-test-btn').style.display = test ? '' : 'none';
  }

  async function refreshPushStatus() {
    if (!PUSH_SUPPORTED) {
      setPushStatus('Push wordt niet ondersteund door deze browser', 'warn');
      showPushButtons({});
      return;
    }
    if (Notification.permission === 'denied') {
      setPushStatus('Push is geblokkeerd. Wijzig in browser-instellingen om aan te zetten.', 'error');
      showPushButtons({});
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        setPushStatus('Push actief op dit apparaat', 'active');
        showPushButtons({ disable: true, test: true });
      } else {
        setPushStatus('Niet aangezet op dit apparaat', null);
        showPushButtons({ enable: true });
      }
    } catch (e) {
      console.error('refreshPushStatus failed:', e);
      setPushStatus('Status onbekend — probeer aanzetten', 'warn');
      showPushButtons({ enable: true });
    }
  }

  async function pushSubscribe() {
    if (!PUSH_SUPPORTED) {
      alert('Deze browser ondersteunt geen push-meldingen. Op iPhone: installeer de site eerst als app — tik rechtsonder op ••• → Deel → "Zet op beginscherm".');
      return;
    }
    setPushStatus('Toestemming vragen…', 'warn');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('Toestemming geweigerd', 'error');
        showPushButtons({ enable: true });
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const keyRes = await fetch('/api/push/public-key');
      const { publicKey } = await keyRes.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey),
      });
      const res = await api('/api/admin/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(sub),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // Default new subscriber to "team" notifications on (most useful signal)
      // unless they already explicitly set push toggles before.
      const profile = getProfile(adminName);
      if (!profile.notifyPushSignups && !profile.notifyPushTeams) {
        $('profile-notify-push-teams').checked = true;
        const updated = { ...profile, notifyPushTeams: true };
        saveProfile(adminName, updated);
        syncProfileToServer(adminName, updated);
      }
      showToast('Push aangezet — je krijgt nu meldingen op dit apparaat', 'success');
      await refreshPushStatus();
    } catch (e) {
      console.error('pushSubscribe failed:', e);
      setPushStatus('Aanzetten mislukt: ' + (e.message || 'onbekend'), 'error');
      showPushButtons({ enable: true });
    }
  }

  async function pushUnsubscribe() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api('/api/admin/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      showToast('Push uit op dit apparaat');
      await refreshPushStatus();
    } catch (e) {
      console.error('pushUnsubscribe failed:', e);
      alert('Uitzetten mislukt: ' + (e.message || 'onbekend'));
    }
  }

  async function pushTest() {
    try {
      const res = await api('/api/admin/push/test', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        alert('Test mislukt: ' + (json.error || 'onbekend'));
        return;
      }
      showToast(`Test verstuurd naar ${json.sent}/${json.total} apparaten`,
        json.sent === json.total ? 'success' : 'warn');
    } catch (e) {
      alert('Netwerkfout: ' + e.message);
    }
  }

  if ($('push-enable-btn')) $('push-enable-btn').addEventListener('click', pushSubscribe);
  if ($('push-disable-btn')) $('push-disable-btn').addEventListener('click', pushUnsubscribe);
  if ($('push-test-btn')) $('push-test-btn').addEventListener('click', pushTest);

  // Initial status check (and after login → re-check via attachProfileHandlers logic)
  if (PUSH_SUPPORTED) refreshPushStatus();

  // ===== EVENEMENT-INSTELLINGEN (Overzicht → fold "Evenement") ====
  // Het evenement-profiel: alles wat per evenement verschilt (naam, datum,
  // locatie, tijden, teksten, sponsor). GET/PUT /api/admin/event-config.
  // We sturen ALLEEN de gewijzigde velden; de server voegt samen, controleert het
  // geheel en geeft de nieuwe stand terug — daaruit vullen we het formulier
  // opnieuw, zodat je altijd ziet wat er écht is opgeslagen.
  const EVC_TEXT = ['name', 'shortName', 'audience', 'priceText', 'location', 'address',
    'tournamentName', 'tournamentShort', 'intro', 'calloutTitle', 'calloutText', 'sideProgram', 'cateringText'];
  const EVC_TIMES = ['teamArrivalTime', 'doorsTime', 'startTime', 'endTime'];
  const EVC_INTS = {
    minTeams: 'Teams minimaal', maxTeams: 'Teams maximaal',
    minPlayers: 'Spelers per team minimaal', maxPlayers: 'Spelers per team maximaal',
  };
  const EVC_SP_TEXT = { name: 'evc-sp-name', tagline: 'evc-sp-tagline', url: 'evc-sp-url', logo: 'evc-sp-logo' };
  const EVC_MAX_ACTS = 6;
  const EVC_THEMES = ['schemering', 'sporthub'];   // zelfde lijst als EVENT_THEMES in server.js
  const EVC_SPORT_ICONS = ['beker', 'voetbal', 'volleybal', 'basketbal', 'tafeltennis', 'badminton', 'hockey', 'padel', 'hardlopen'];   // = SPORT_ICONS in server.js
  // Status altijd als woord + stip — nooit alleen een kleur.
  const EVC_LEVELS = {
    fout: { cls: 'lv-fout', label: 'Oplossen', rank: 0 },
    'let-op': { cls: 'lv-let-op', label: 'Let op', rank: 1 },
    ok: { cls: 'lv-ok', label: 'In orde', rank: 2 },
  };
  const EVC_PROFILES = { neutraal: 'neutraal — verse installatie', opendag: 'opendag — eerste installatie' };
  let evcData = null;                                   // laatste stand van de server
  let evcSponsor = { enabled: false, name: '' };        // voor de sponsor-mail (knop + modal)
  let evcFirstRender = true;
  let evcLoading = false;
  let evcLoadedAt = 0;
  const evcNorm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const evcVal = (id) => { const el = $(id); return el ? el.value : ''; };

  // "2027-06-12" → "Zaterdag 12 juni 2027". Alleen voor het live voorbeeld tijdens
  // het typen; na opslaan toont het veld wat de server ervan heeft gemaakt.
  function evcDeriveDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    const d = new Date(`${iso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    try {
      const s = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
      return s.charAt(0).toUpperCase() + s.slice(1);
    } catch { return iso; }
  }

  function evcRegStatusText(reg) {
    if (!reg) return '';
    if (reg.open) return 'Nu: aanmelden staat open.';
    if (reg.reason === 'soon') return 'Nu: aanmelden is dicht, want er is nog geen datum.';
    if (reg.reason === 'over') return 'Nu: aanmelden is dicht, want de datum is voorbij.';
    return 'Nu: aanmelden is dicht (handmatig gesloten).';
  }

  // Activiteiten-rijen (kopje + tekst). Waarden gaan via escape() de HTML in.
  function evcReadActs() {
    return [...document.querySelectorAll('#evc-acts .evc-act')].map(row => ({
      label: row.querySelector('[data-act="label"]').value,
      text: row.querySelector('[data-act="text"]').value,
    }));
  }
  function evcRenderActs(list) {
    const wrap = $('evc-acts');
    if (!wrap) return;
    wrap.innerHTML = list.map((a, i) => `
      <div class="evc-act">
        <div class="evc-f"><label for="evc-act-label-${i}">Kopje ${i + 1}</label><input type="text" id="evc-act-label-${i}" data-act="label" maxlength="40" autocomplete="off" value="${escape(a.label)}" /></div>
        <div class="evc-f"><label for="evc-act-text-${i}">Tekst ${i + 1}</label><input type="text" id="evc-act-text-${i}" data-act="text" maxlength="160" autocomplete="off" value="${escape(a.text)}" /></div>
        <button type="button" class="btn-sm" data-act-del="${i}" aria-label="Activiteit ${i + 1} verwijderen">Verwijder</button>
      </div>`).join('');
    const add = $('evc-act-add');
    if (add) {
      const full = list.length >= EVC_MAX_ACTS;
      add.disabled = full;
      add.textContent = full ? `Maximaal ${EVC_MAX_ACTS} activiteiten` : '+ Activiteit toevoegen';
    }
  }

  function evcToggleSponsorFields() {
    const box = $('evc-sp-fields'), cb = $('evc-sp-enabled');
    if (!box || !cb) return;
    box.hidden = !cb.checked;
    box.querySelectorAll('input').forEach(i => { i.disabled = !cb.checked; });
  }

  // "Klaar voor de start?" — wat de server nog mist of wil laten nalopen.
  function evcRenderChecks(checks) {
    const list = (Array.isArray(checks) ? checks : []).filter(c => c && c.text);
    const wrap = $('evc-checks-wrap'), ul = $('evc-checks'), badge = $('evc-badge');
    if (!wrap || !ul) return;
    const lv = (c) => EVC_LEVELS[c.level] || EVC_LEVELS['let-op'];
    const sorted = list.map((c, i) => ({ c, i })).sort((a, b) => (lv(a.c).rank - lv(b.c).rank) || (a.i - b.i));
    ul.innerHTML = sorted.map(({ c }) => `
      <li class="evc-check ${lv(c).cls}">
        <span class="evc-check-tag"><span class="d" aria-hidden="true"></span>${lv(c).label}</span>
        <span>${escape(c.text)}</span>
      </li>`).join('');
    wrap.hidden = !list.length;
    const fouten = list.filter(c => c.level === 'fout').length;
    if (badge) {
      badge.hidden = !fouten;
      badge.textContent = fouten === 1 ? '1 punt oplossen' : `${fouten} punten oplossen`;
    }
    // Alleen de eerste keer vanzelf openklappen — daarna beslis jij.
    if (evcFirstRender && fouten && $('evc-fold')) $('evc-fold').open = true;
    evcFirstRender = false;
  }

  // Naam/sponsor op de rest van het scherm bijwerken (de HTML is bij het laden
  // door de server gevuld; dit houdt 'm actueel na een wijziging). Schrijft
  // nooit een lege waarde over een gevulde heen.
  function evcApplyChrome(d) {
    const ev = d.event || {}, sp = d.sponsor || {};
    evcSponsor = { enabled: !!sp.enabled, name: sp.name || '' };
    const vals = { name: ev.name, shortName: ev.shortName || ev.name, withArticle: ev.withArticle };
    document.querySelectorAll('[data-ev]').forEach(el => {
      const v = vals[el.dataset.ev];
      if (typeof v === 'string' && v.trim()) el.textContent = v;
    });
    if (typeof vals.shortName === 'string' && vals.shortName.trim()) document.title = `JVO Admin — ${vals.shortName}`;
    const pb = $('tourn-prize');
    if (pb) pb.hidden = !evcSponsor.enabled;
    const eb = $('prize-modal-eyebrow');
    if (eb) eb.textContent = evcSponsor.enabled && evcSponsor.name ? `${evcSponsor.name} · sponsor & prijzen` : 'Sponsor & prijzen';
  }

  function evcUpdatePreviews() {
    if (!evcData) return;
    const ev = evcData.event || {}, stored = evcData.stored || {};
    const art = evcVal('evc-article');
    const name = evcNorm(evcVal('evc-name')) || ev.name || '';
    if ($('evc-article-preview')) $('evc-article-preview').textContent = `${art ? art + ' ' : ''}${name}` || '—';

    const pv = $('evc-dateText-preview');
    if (pv) {
      const date = evcVal('evc-date'), own = evcNorm(evcVal('evc-dateText'));
      let txt = '';
      if (own) {
        txt = `Op de site komt: “${own}”.`;
        if (date !== (ev.date || '')) txt += ' Let op: je eigen tekst volgt de datum niet — klopt die nog?';
      } else if (!date) {
        txt = 'Zonder datum staat er “Datum volgt”.';
      } else {
        // Datum ongewijzigd en geen eigen tekst → de tekst die de server nu gebruikt.
        const auto = (date === (ev.date || '') && !evcNorm(stored.dateText) && ev.dateText) ? ev.dateText : evcDeriveDate(date);
        if (auto) txt = `Op de site komt: “${auto}”.`;
      }
      pv.textContent = txt;
    }

    const rs = $('evc-reg-status');
    if (rs) {
      const changed = evcVal('evc-registration') !== (ev.registration || 'auto');
      rs.textContent = evcRegStatusText(evcData.registration) + (changed ? ' Je nieuwe keuze gaat in zodra je opslaat.' : '');
    }
  }

  // Formulier vullen uit de stand van de server.
  function evcFill(d) {
    evcData = d;
    // Oude HTML uit de offline-cache met nieuwe JS (kort na een deploy): dan bestaat
    // het formulier nog niet. Wel de namen/sponsor-knop bijwerken, verder niets.
    if (!$('evc-form') || !$('evc-sp-prize3')) { evcApplyChrome(d); return; }
    const ev = d.event || {}, sp = d.sponsor || {}, stored = d.stored || {}, lim = d.limits || {};
    const limText = lim.text || {}, limInts = lim.ints || {};
    for (const k of EVC_TEXT) {
      const el = $('evc-' + k);
      if (!el) continue;
      el.value = ev[k] == null ? '' : String(ev[k]);
      if (limText[k]) el.maxLength = limText[k];
    }
    $('evc-article').value = ['de', 'het', ''].includes(ev.article) ? ev.article : '';
    $('evc-date').value = ev.date || '';
    // Datumtekst: alleen je EIGEN tekst staat in het veld; leeg = automatisch.
    $('evc-dateText').value = stored.dateText || '';
    if (limText.dateText) $('evc-dateText').maxLength = limText.dateText;
    for (const k of EVC_TIMES) $('evc-' + k).value = ev[k] || '';
    for (const k of Object.keys(EVC_INTS)) {
      const el = $('evc-' + k);
      el.value = ev[k] == null ? '' : String(ev[k]);
      if (Array.isArray(limInts[k])) { el.min = limInts[k][0]; el.max = limInts[k][1]; }
    }
    $('evc-registration').value = ['auto', 'open', 'closed'].includes(ev.registration) ? ev.registration : 'auto';
    // Stijl van de publiekspagina's (oude HTML uit de cache heeft dit veld nog niet).
    if ($('evc-theme')) $('evc-theme').value = EVC_THEMES.includes(ev.theme) ? ev.theme : 'schemering';
    if ($('evc-sportIcon')) $('evc-sportIcon').value = EVC_SPORT_ICONS.includes(ev.sportIcon) ? ev.sportIcon : 'beker';
    evcRenderActs((Array.isArray(ev.activities) ? ev.activities : []).map(a => ({ label: (a && a.label) || '', text: (a && a.text) || '' })));
    $('evc-ogImage').value = ev.ogImage || '';
    $('evc-sp-enabled').checked = !!sp.enabled;
    for (const [k, id] of Object.entries(EVC_SP_TEXT)) $(id).value = sp[k] || '';
    [1, 2, 3].forEach(i => { $('evc-sp-prize' + i).value = (sp.prizes || [])[i - 1] || ''; });
    evcToggleSponsorFields();

    evcRenderChecks(d.checks);
    const nStored = Object.keys(stored).length;
    $('evc-profile').textContent = `Profiel: ${EVC_PROFILES[d.profile] || d.profile || 'onbekend'}. `
      + (nStored ? `Je hebt ${nStored} ${nStored === 1 ? 'onderdeel' : 'onderdelen'} zelf aangepast.` : 'Je gebruikt overal nog de standaard.');
    $('evc-reset').disabled = !nStored;
    $('evc-error').textContent = '';
    $('evc-form').hidden = false;
    evcApplyChrome(d);
    evcUpdatePreviews();
    evcUpdateStatus();
  }

  // Wat is er t.o.v. de server gewijzigd? → { event, n, error }.
  // `error` = iets dat je eerst moet herstellen (de server controleert daarna alsnog alles).
  function evcDiff() {
    const d = evcData;
    if (!d) return { event: {}, n: 0, error: null };
    const ev = d.event || {}, sp = d.sponsor || {}, stored = d.stored || {}, limInts = (d.limits || {}).ints || {};
    const out = {};
    let n = 0, error = null;
    const fail = (msg) => { if (!error) error = msg; };

    for (const k of EVC_TEXT) {
      const v = evcNorm(evcVal('evc-' + k));
      if (v !== evcNorm(ev[k])) { out[k] = v; n++; }
    }
    if ('name' in out && out.name.length < 2) fail('Vul een naam voor het evenement in.');

    const art = evcVal('evc-article');
    if (art !== (ev.article || '')) { out.article = art; n++; }

    const dateEl = $('evc-date');
    if (dateEl && dateEl.validity && dateEl.validity.badInput) { fail('De datum is niet compleet ingevuld.'); n++; }
    else { const date = evcVal('evc-date'); if (date !== (ev.date || '')) { out.date = date; n++; } }

    const dt = evcNorm(evcVal('evc-dateText'));
    if (dt !== evcNorm(stored.dateText)) { out.dateText = dt; n++; }

    for (const k of EVC_TIMES) {
      const v = evcVal('evc-' + k).slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(v)) { fail('Vul alle vier de tijden in (bijvoorbeeld 15:30).'); n++; continue; }
      if (v !== ev[k]) { out[k] = v; n++; }
    }

    for (const [k, label] of Object.entries(EVC_INTS)) {
      const raw = evcVal('evc-' + k).trim();
      const r = Array.isArray(limInts[k]) ? limInts[k] : [1, 99];
      const v = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
      if (!(v >= r[0] && v <= r[1])) { fail(`${label}: kies een heel getal tussen ${r[0]} en ${r[1]}.`); if (raw !== String(ev[k])) n++; continue; }
      if (v !== ev[k]) { out[k] = v; n++; }
    }

    const reg = evcVal('evc-registration');
    if (reg !== (ev.registration || 'auto')) { out.registration = reg; n++; }

    if ($('evc-theme')) {
      const theme = evcVal('evc-theme');
      if (EVC_THEMES.includes(theme) && theme !== (EVC_THEMES.includes(ev.theme) ? ev.theme : 'schemering')) { out.theme = theme; n++; }
    }
    if ($('evc-sportIcon')) {
      const ic = evcVal('evc-sportIcon');
      if (EVC_SPORT_ICONS.includes(ic) && ic !== (EVC_SPORT_ICONS.includes(ev.sportIcon) ? ev.sportIcon : 'beker')) { out.sportIcon = ic; n++; }
    }

    const acts = evcReadActs().map(a => ({ label: evcNorm(a.label), text: evcNorm(a.text) })).filter(a => a.label || a.text);
    const curActs = (Array.isArray(ev.activities) ? ev.activities : []).map(a => ({ label: evcNorm(a && a.label), text: evcNorm(a && a.text) }));
    if (JSON.stringify(acts) !== JSON.stringify(curActs)) { out.activities = acts; n++; }

    const og = evcNorm(evcVal('evc-ogImage'));
    if (og !== (ev.ogImage || '')) { out.ogImage = og; n++; }

    const spo = {};
    const on = !!($('evc-sp-enabled') || {}).checked;
    if (on !== !!sp.enabled) spo.enabled = on;
    if (on) {
      for (const [k, id] of Object.entries(EVC_SP_TEXT)) {
        const v = evcNorm(evcVal(id));
        if (v !== evcNorm(sp[k])) spo[k] = v;
      }
      const prizes = [1, 2, 3].map(i => evcNorm(evcVal('evc-sp-prize' + i)));
      if (prizes.some((p, i) => p !== evcNorm((sp.prizes || [])[i]))) spo.prizes = prizes;
      if (!evcNorm(evcVal('evc-sp-name'))) fail('Vul de naam van de sponsor in, of zet de sponsor uit.');
    }
    const spN = Object.keys(spo).length;
    if (spN) { out.sponsor = spo; n += spN; }

    return { event: out, n, error };
  }
  const evcDirty = () => evcDiff().n > 0;

  function evcUpdateStatus() {
    const st = $('evc-status');
    if (!st || !evcData) return;
    const n = evcDiff().n;
    st.textContent = n ? `${n} wijziging${n === 1 ? '' : 'en'} nog niet opgeslagen` : '';
  }

  async function loadEventConfig(opts = {}) {
    if (evcLoading) return;
    evcLoading = true;
    const loadEl = $('evc-load'), retry = $('evc-retry');
    try {
      const r = await api('/api/admin/event-config');
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.event) throw new Error((j && j.error) || 'laden mislukt');
      evcLoadedAt = Date.now();
      if (opts.checksOnly && evcData) {
        // Alleen de checklist + aanmeldstatus verversen; het formulier (met je
        // eventuele niet-opgeslagen wijzigingen) blijft zoals het is.
        evcData.checks = j.checks;
        evcData.registration = j.registration;
        evcRenderChecks(j.checks);
        evcUpdatePreviews();
      } else {
        evcFill(j);
      }
      if (loadEl) loadEl.hidden = true;
      if (retry) retry.hidden = true;
    } catch (e) {
      if (!evcData && loadEl) {
        loadEl.hidden = false;
        loadEl.textContent = 'De evenement-instellingen konden niet geladen worden. Heb je verbinding?';
        if (retry) retry.hidden = false;
      }
    } finally { evcLoading = false; }
  }

  // Eén weg naar de server voor opslaan én terugzetten. Fout → in de alert-regio
  // naast de knop (role="alert"), nooit een stille mislukking.
  async function evcPut(body, okMsg, btn, busyLabel) {
    const errEl = $('evc-error');
    const orig = btn ? btn.textContent : '';
    if (errEl) errEl.textContent = '';
    if (btn) { btn.disabled = true; btn.textContent = busyLabel; }
    try {
      const r = await api('/api/admin/event-config', { method: 'PUT', body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.event) {
        if (errEl) errEl.textContent = j.error || `Opslaan mislukt (${r.status}). Er is niets gewijzigd — probeer het opnieuw.`;
        return false;
      }
      if (btn) { btn.disabled = false; btn.textContent = orig; }   // vóór evcFill: die zet de reset-knop zelf goed
      evcFill(j);
      showToast(okMsg);
      loadConfig();            // kerncijfers (max. teams) + wijzig-slot volgen het evenement
      loadReminderStatus();    // herinneringen hangen aan de datum
      return true;
    } catch (e) {
      if (errEl && !(e && e.message === 'Sessie verlopen')) errEl.textContent = 'Netwerkfout — er is niets opgeslagen. Probeer het opnieuw.';
      return false;
    } finally {
      if (btn && btn.textContent === busyLabel) { btn.disabled = false; btn.textContent = orig; }
    }
  }

  // Sponsorlogo / deelafbeelding uploaden. De server slaat het bestand op en zet
  // het pad zelf in de instellingen; hier vullen we alleen dát ene veld bij, zodat
  // wat je verder nog niet had opgeslagen in het formulier blijft staan.
  function evcUpload(kind, fileInput, pathInput) {
    const f = fileInput.files && fileInput.files[0];
    const errEl = $('evc-error');
    if (!f) return;
    if (errEl) errEl.textContent = '';
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { if (errEl) errEl.textContent = 'Kies een PNG-, JPG- of WebP-afbeelding.'; fileInput.value = ''; return; }
    if (f.size > 2 * 1024 * 1024) { if (errEl) errEl.textContent = 'De afbeelding mag maximaal 2 MB zijn.'; fileInput.value = ''; return; }
    const rd = new FileReader();
    rd.onerror = () => { if (errEl) errEl.textContent = 'Het bestand kon niet worden gelezen.'; };
    rd.onload = async () => {
      fileInput.disabled = true;
      try {
        const r = await api('/api/admin/event-media', { method: 'POST', body: JSON.stringify({ kind, image: rd.result }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.path) { if (errEl) errEl.textContent = j.error || `Uploaden mislukt (${r.status}).`; return; }
        pathInput.value = j.path;
        if (evcData) {
          if (kind === 'sponsor') evcData.sponsor = { ...(evcData.sponsor || {}), logo: j.path };
          else evcData.event = { ...(evcData.event || {}), ogImage: j.path };
          evcData.checks = j.checks;
          if (j.stored) evcData.stored = j.stored;
          const rb = $('evc-reset');
          if (rb) rb.disabled = !Object.keys(evcData.stored || {}).length;
        }
        evcRenderChecks(j.checks);
        evcUpdateStatus();
        showToast(kind === 'sponsor' ? 'Sponsorlogo geüpload' : 'Deelafbeelding geüpload');
      } catch (e) {
        if (errEl && !(e && e.message === 'Sessie verlopen')) errEl.textContent = 'Netwerkfout — de afbeelding is niet geüpload.';
      } finally {
        fileInput.disabled = false;
        fileInput.value = '';
      }
    };
    rd.readAsDataURL(f);
  }
  $('evc-sp-logo-file')?.addEventListener('change', (e) => evcUpload('sponsor', e.target, $('evc-sp-logo')));
  $('evc-ogImage-file')?.addEventListener('change', (e) => evcUpload('og', e.target, $('evc-ogImage')));

  async function evcSave() {
    if (!evcData) return;
    const diff = evcDiff();
    const errEl = $('evc-error');
    if (diff.error) { if (errEl) { errEl.textContent = ''; errEl.textContent = diff.error; } return; }
    if (!diff.n) { showToast('Er is niets gewijzigd', 'info'); return; }
    await evcPut({ event: diff.event }, 'Evenement opgeslagen', $('evc-save'), 'Opslaan…');
  }

  async function evcReset() {
    if (!evcData) return;
    const base = (evcData.base && evcData.base.event) || {};
    const closes = !base.date && base.registration !== 'open';
    const msg = 'Alle evenement-instellingen terugzetten naar de standaard?\n\n'
      + 'Je eigen naam, datum, locatie, tijden, teksten en sponsor vervallen. Aanmeldingen, teams en spelregels blijven staan.'
      + (closes ? '\n\nLet op: de standaard heeft geen datum, dus aanmelden gaat dan dicht.' : '');
    if (!confirm(msg)) return;
    await evcPut({ event: {}, reset: true }, 'Evenement teruggezet naar standaard', $('evc-reset'), 'Terugzetten…');
  }

  (() => {
    const fold = $('evc-fold');
    if (!fold) return;
    const onEdit = (e) => {
      if (!e.target.closest || !e.target.closest('#evc-form')) return;
      if ($('evc-error')) $('evc-error').textContent = '';
      evcUpdatePreviews();
      evcUpdateStatus();
    };
    $('evc-sp-enabled')?.addEventListener('change', evcToggleSponsorFields);   // vóór onEdit (target vóór bubble)
    fold.addEventListener('input', onEdit);
    fold.addEventListener('change', onEdit);
    // Bij openklappen de stand verversen — behalve als je net iets aan het wijzigen bent.
    fold.addEventListener('toggle', () => {
      if (!fold.open || evcLoading) return;
      if (!evcData) { loadEventConfig(); return; }
      if (Date.now() - evcLoadedAt > 5000 && !evcDirty()) loadEventConfig();
    });
    $('evc-act-add')?.addEventListener('click', () => {
      const list = evcReadActs();
      if (list.length >= EVC_MAX_ACTS) return;
      list.push({ label: '', text: '' });
      evcRenderActs(list);
      $(`evc-act-label-${list.length - 1}`)?.focus();
      evcUpdateStatus();
    });
    $('evc-acts')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act-del]');
      if (!b) return;
      const list = evcReadActs();
      list.splice(parseInt(b.dataset.actDel, 10), 1);
      evcRenderActs(list);
      $('evc-act-add')?.focus();
      evcUpdateStatus();
    });
    $('evc-save')?.addEventListener('click', evcSave);
    $('evc-reset')?.addEventListener('click', evcReset);
    $('evc-retry')?.addEventListener('click', () => loadEventConfig());
  })();

  // ===== SPELREGELS (Overzicht → fold "Spelregels") ================
  // Eigen regels voor /spelregels, met eenvoudige opmaak. GET/PUT /api/admin/rules.
  let rulesLoaded = false, rulesLoading = false, rulesSaved = '', rulesMax = 8000, rulesBuiltin = false;
  function rulesNote() {
    const el = $('rules-empty-note');
    if (!el) return;
    el.textContent = rulesBuiltin
      ? 'Laat je dit leeg, dan worden de ingebouwde 7v7-voetbalregels getoond.'
      : 'Laat je dit leeg, dan zegt de pagina “volgen binnenkort”.';
  }
  function rulesCount() {
    const ta = $('rules-text'), el = $('rules-count');
    if (!ta || !el) return;
    const n = ta.value.length, over = n > rulesMax;
    el.textContent = over ? `${n} / ${rulesMax} tekens — ${n - rulesMax} te veel` : `${n} / ${rulesMax} tekens`;
    el.classList.toggle('over', over);
    const st = $('rules-status');
    if (st && rulesLoaded) st.textContent = ta.value.trim() !== rulesSaved ? 'Nog niet opgeslagen' : '';
  }
  function rulesShowPreview(html) {
    const wrap = $('rules-preview-wrap'), box = $('rules-preview');
    if (!wrap || !box) return;
    if (typeof html !== 'string' || !html.trim()) { wrap.hidden = true; box.textContent = ''; return; }
    // BEWUSTE UITZONDERING op "nooit server-tekst rauw in innerHTML": `preview` is
    // HTML die de server zélf opbouwt uit de spelregeltekst (renderRulesHtml) en
    // waarin elke regel al ge-escaped is. Dit is de enige plek in de admin waar
    // server-gerenderde HTML direct de pagina in gaat — nooit doen met ruwe invoer.
    box.innerHTML = html;
    wrap.hidden = false;
  }
  async function loadRules() {
    if (rulesLoading) return;
    rulesLoading = true;
    const ta = $('rules-text'), st = $('rules-status'), btn = $('rules-save');
    if (st) st.textContent = 'Laden…';
    try {
      const r = await api('/api/admin/rules');
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error('laden mislukt');
      rulesSaved = typeof j.text === 'string' ? j.text : '';
      rulesBuiltin = !!j.builtin;
      if (Number(j.max) > 0) rulesMax = Number(j.max);
      rulesLoaded = true;
      if (ta) { ta.value = rulesSaved; ta.disabled = false; }
      if (btn) btn.disabled = false;
      if (st) st.textContent = '';
      rulesNote();
      rulesCount();
      rulesShowPreview(j.preview);   // alleen als de server er een meestuurt
    } catch (e) {
      if (st) st.textContent = 'De spelregels konden niet geladen worden — klap dit blok opnieuw open om het nog eens te proberen.';
    } finally { rulesLoading = false; }
  }
  async function saveRules() {
    const ta = $('rules-text'), btn = $('rules-save'), errEl = $('rules-error'), st = $('rules-status');
    if (!ta || !btn || !rulesLoaded) return;
    if (errEl) errEl.textContent = '';
    if (ta.value.trim().length > rulesMax) {
      if (errEl) errEl.textContent = `De spelregels zijn te lang: maximaal ${rulesMax} tekens. Kort ze ${ta.value.trim().length - rulesMax} tekens in.`;
      return;
    }
    btn.disabled = true; btn.textContent = 'Opslaan…';
    try {
      const r = await api('/api/admin/rules', { method: 'PUT', body: JSON.stringify({ text: ta.value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (errEl) errEl.textContent = j.error || `Opslaan mislukt (${r.status}) — probeer het opnieuw.`; return; }
      rulesSaved = typeof j.text === 'string' ? j.text : ta.value.trim();
      ta.value = rulesSaved;
      rulesCount();
      rulesShowPreview(j.preview);
      if (st) st.textContent = 'Opgeslagen';
      showToast(rulesSaved ? 'Spelregels opgeslagen'
        : (rulesBuiltin ? 'Spelregels leeggemaakt — de ingebouwde regels worden getoond' : 'Spelregels leeggemaakt — de pagina zegt “volgen binnenkort”'));
      loadEventConfig({ checksOnly: true });   // de checklist kijkt of er spelregels zijn
    } catch (e) {
      if (errEl && !(e && e.message === 'Sessie verlopen')) errEl.textContent = 'Netwerkfout — er is niets opgeslagen. Probeer het opnieuw.';
    } finally { btn.disabled = false; btn.textContent = 'Spelregels opslaan'; }
  }
  $('rules-fold')?.addEventListener('toggle', () => { if ($('rules-fold').open && !rulesLoaded) loadRules(); });
  $('rules-text')?.addEventListener('input', () => { if ($('rules-error')) $('rules-error').textContent = ''; rulesCount(); });
  $('rules-save')?.addEventListener('click', saveRules);

  // Niet-opgeslagen wijzigingen in Evenement of Spelregels → de browser vraagt
  // even na voordat je de pagina sluit of ververst.
  window.addEventListener('beforeunload', (e) => {
    const rulesDirty = rulesLoaded && $('rules-text') && $('rules-text').value.trim() !== rulesSaved;
    if (!token || !(rulesDirty || (evcData && evcDirty()))) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ===== SCHONE START (danger zone): alle evenement-data wissen ====
  // Voor twee momenten: testdata weg vóór je live gaat, of een volgende editie
  // beginnen. De server maakt eerst zelf een back-up-zip en wist pas daarna.
  function attachWipeHandlers() {
    const input = $('wipe-confirm');
    const btn = $('wipe-btn');
    const result = $('wipe-result');
    if (!input || !btn) return;
    const LABEL = 'Wis alles en begin opnieuw';

    input.addEventListener('input', () => {
      btn.disabled = input.value !== 'WIS ALLES';
    });

    btn.addEventListener('click', async () => {
      if (!confirm('Echt zeker?\n\nAlle aanmeldingen, teams (met logo\'s), het toernooi, volgers, feedback en het logboek worden gewist. Je evenement-instellingen, spelregels en admin-code blijven staan.\n\nDe server maakt eerst een back-up-zip.')) return;
      btn.disabled = true;
      btn.textContent = 'Bezig…';
      try {
        const res = await api('/api/admin/wipe-data', {
          method: 'POST',
          body: JSON.stringify({ confirm_phrase: input.value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          result.innerHTML = `<div class="alert error">${escape(data.error || `Wissen mislukt (${res.status}). Er is niets gewist.`)}</div>`;
          btn.disabled = false;
          btn.textContent = LABEL;
          return;
        }
        const b = data.before || {};
        const n = (v) => Number(v) || 0;
        const logos = n(data.logos_removed);
        const backupLine = data.backup
          ? `Back-up vooraf op de server bewaard als <b>${escape(data.backup)}</b>.`
          : 'Er stond niets om te bewaren, dus er is geen back-up gemaakt.';
        result.innerHTML = `<div class="alert success">
          <b>Schone start gelukt.</b> Gewist: ${n(b.registrations)} aanmelding${n(b.registrations) === 1 ? '' : 'en'},
          ${n(b.teams)} team${n(b.teams) === 1 ? '' : 's'}, ${n(b.matches)} wedstrijd${n(b.matches) === 1 ? '' : 'en'},
          ${n(b.feedback)} feedback-inzending${n(b.feedback) === 1 ? '' : 'en'}, ${n(b.audit)} logboekregel${n(b.audit) === 1 ? '' : 's'}
          en ${logos} teamlogo${logos === 1 ? '' : '\'s'}.<br/>${backupLine}
        </div>`;
        showToast('Schone start gelukt — alles is gewist');
        input.value = '';
        btn.textContent = LABEL;
        await refreshAll();
        loadReminderStatus();
        loadEventConfig({ checksOnly: true });   // "Klaar voor de start?" opnieuw nalopen
      } catch (e) {
        if (e && e.message === 'Sessie verlopen') return;
        result.innerHTML = `<div class="alert error">Netwerkfout — probeer opnieuw. Controleer eerst of er iets gewist is.</div>`;
        btn.disabled = false;
        btn.textContent = LABEL;
      }
    });
  }
  attachWipeHandlers();

  // ===== FILTERS ==================================================
  function setFilter(f) {
    currentFilter = f;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filter === f));
    renderTeams();
  }
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });

  document.querySelectorAll('.audit-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentAuditFilter = btn.dataset.auditFilter;
      document.querySelectorAll('.audit-filter-pill').forEach(p => {
        const active = p === btn;
        p.classList.toggle('active', active);
        p.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderAudit();
    });
  });

  // ===== ACTIONS ==================================================
  async function handleAction(btn) {
    const id = parseInt(btn.closest('[data-id]').dataset.id, 10);
    const act = btn.dataset.act;
    const team = teams.find(t => t.id === id);
    if (!team) return;

    if (act === 'qr') { openQR(team); return; }

    if (act === 'rename-info') { openRenameModal(team); return; }

    if (act === 'rename-waiting') { openWaitingModal(team); return; }

    if (act === 'count-waiting') { openCountWaitingModal(team); return; }

    if (act === 'delete') {
      const ok = confirm(
        `Definitief team "${team.team_name}" verwijderen?\n\n` +
        `De captain (${team.captain_name}) blijft staan als losse bezoeker in de aanmeldlijst.` +
        (team.status === 'waitlist' ? ` Let op: de captain krijgt hier géén mail over — wil je 'm iets laten weten, wijs het team dan eerst af.` : '') +
        `\n\nJe hebt 8 seconden om dit ongedaan te maken na bevestigen.`
      );
      if (!ok) return;
      btn.disabled = true; btn.textContent = '…';
      try {
        const res = await api(`/api/admin/teams/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok) {
          alert('Fout: ' + (json.error || 'onbekend'));
          btn.disabled = false; btn.innerHTML = ICON.trash;
          return;
        }
        if (json.actionId && json.undoWindowMs) {
          showUndoToast({
            message: `Team "${json.deleted.team_name}" verwijderd`,
            actionId: json.actionId,
            undoWindowMs: json.undoWindowMs,
            onUndo: async (actionId) => {
              const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
              if (!r.ok) throw new Error('Undo failed');
              await refreshAll();
            },
          });
        }
        await refreshAll();
      } catch (e) {
        alert('Netwerkfout: ' + (e.message || 'onbekend'));
        btn.disabled = false; btn.innerHTML = ICON.trash;
      }
      return;
    }

    if (act === 'adjust') { openAdjustModal(team); return; }

    const decision =
      act === 'approve'  ? 'approved'  :
      act === 'waitlist' ? 'waitlist'  :
      act === 'reject'   ? 'rejected'  :
      act === 'revoke'   ? 'pending'   : null;
    if (!decision) return;

    let reason = '', adminMessage = '';
    if (decision === 'rejected') {
      const result = await openRejectModal(team);
      if (result === null) return;  // cancelled
      reason = result.reason;
      adminMessage = result.adminMessage;
    } else if (act === 'revoke') {
      const ok = confirm(
        `Goedkeuring intrekken voor "${team.team_name}"?\n\n` +
        `De huidige QR-code werkt direct niet meer. De captain krijgt een mail dat de goedkeuring is ingetrokken.`
      );
      if (!ok) return;
    }

    btn.disabled = true; btn.textContent = '…';
    const scrollY = window.scrollY;
    try {
      const res = await api(`/api/admin/teams/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason, admin_message: adminMessage }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Fout: ' + (err.error || res.status));
        return;
      }
      const result = await res.json();
      await refreshAll();
      // Restore scroll so the user stays at the team they just acted on
      window.scrollTo(0, scrollY);

      // Toast feedback
      const wasApprovedBefore = team.status === 'approved';
      const labels = {
        approved: 'goedgekeurd',
        waitlist: 'op wachtlijst gezet',
        rejected: 'afgewezen',
        pending: wasApprovedBefore ? 'goedkeuring ingetrokken' : 'teruggezet naar pending',
      };
      const sendsMail = decision !== 'pending' || wasApprovedBefore;

      if (sendsMail && result.actionId && result.undoWindowMs) {
        // Show undo toast — mail is deferred until window expires
        showUndoToast({
          message: `Team "${team.team_name}" — ${labels[decision]}`,
          actionId: result.actionId,
          undoWindowMs: result.undoWindowMs,
          onUndo: async (actionId) => {
            const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
            if (!r.ok) throw new Error('Undo failed');
            await refreshAll();
            window.scrollTo(0, scrollY);
          },
        });
      } else {
        showToast(`Team "${team.team_name}" — ${labels[decision]}`);
      }
    } catch (e) {
      alert('Netwerkfout — probeer opnieuw.');
    }
  }

  // Rename-info modal — shows exactly what the captain changed, newest first
  function openRenameModal(team) {
    const m = $('rename-modal');
    $('rename-modal-title').textContent = team.team_name;
    const renames = (team.renames || []).slice().reverse();
    $('rename-modal-list').innerHTML = renames.map((r, i) => `
      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px;">
        <div class="card-eyebrow" style="margin-bottom: 10px;">${i === 0 ? 'Laatste wijziging' : 'Eerdere wijziging'} · ${fmtTime(r.at)}</div>
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <span style="text-decoration: line-through; color: var(--ice-muted); font-size: 15px;">${escape(r.from ?? '—')}</span>
          <span style="color: var(--ember); font-weight: 700;">→</span>
          <span style="color: var(--gold-2); font-weight: 600; font-size: 16px;">${escape(r.to ?? '—')}</span>
        </div>
      </div>
    `).join('');
    m.classList.add('show');
    document.body.style.overflow = 'hidden';

    const cleanup = () => {
      m.classList.remove('show');
      document.body.style.overflow = '';
      $('rename-modal-close').onclick = null;
      $('rename-modal-close-2').onclick = null;
      m.onclick = null;
    };
    $('rename-modal-close').onclick = cleanup;
    $('rename-modal-close-2').onclick = cleanup;
    m.onclick = (e) => { if (e.target.id === 'rename-modal') cleanup(); };
  }

  // Waiting-for-rename modal — manage the holding state (resend / stop waiting)
  function openWaitingModal(team) {
    const m = $('waiting-modal');
    $('waiting-modal-title').textContent = team.team_name;
    $('waiting-modal-text').textContent =
      `Je hebt ${team.captain_name} op ${fmtTime(team.rename_requested_at)} gevraagd de teamnaam aan te passen. ` +
      `Het team staat zolang in de wacht — de naam-optie onder "Aanpassen" is geblokkeerd zodat je niet per ongeluk opnieuw vraagt. ` +
      `Keur het team pas goed als de naam klopt.`;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';

    const cleanup = () => {
      m.classList.remove('show');
      document.body.style.overflow = '';
      $('waiting-modal-close').onclick = null;
      $('waiting-modal-close-2').onclick = null;
      $('waiting-modal-resend').onclick = null;
      $('waiting-modal-cancel').onclick = null;
      m.onclick = null;
    };

    $('waiting-modal-close').onclick = cleanup;
    $('waiting-modal-close-2').onclick = cleanup;
    m.onclick = (e) => { if (e.target.id === 'waiting-modal') cleanup(); };

    $('waiting-modal-resend').onclick = async () => {
      const adminMessage = prompt(
        `Stuur ${team.captain_name} dezelfde link nog een keer (bijv. als de eerste mail kwijt is).\n\n` +
        `Optioneel persoonlijk bericht:`, ''
      );
      if (adminMessage === null) return;
      cleanup();
      try {
        const res = await api(`/api/admin/teams/${team.id}/request-rename`, {
          method: 'POST',
          body: JSON.stringify({ admin_message: adminMessage.trim() || undefined }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { alert('Fout: ' + (json.error || res.status)); return; }
        await refreshAll();
        if (json.actionId && json.undoWindowMs) {
          showUndoToast({
            message: `Link opnieuw verstuurd naar ${team.captain_name}`,
            actionId: json.actionId,
            undoWindowMs: json.undoWindowMs,
            onUndo: async (actionId) => {
              const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
              if (!r.ok) throw new Error('Undo failed');
              await refreshAll();
            },
          });
        } else {
          showToast(`Link opnieuw verstuurd naar ${team.captain_name}`);
        }
      } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    };

    $('waiting-modal-cancel').onclick = async () => {
      if (!confirm(`Stoppen met wachten op een nieuwe naam voor "${team.team_name}"?\n\nDe verstuurde link werkt daarna niet meer en de naam-optie onder "Aanpassen" wordt weer beschikbaar.`)) return;
      cleanup();
      try {
        const res = await api(`/api/admin/teams/${team.id}/cancel-rename`, { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { alert('Fout: ' + (json.error || res.status)); return; }
        await refreshAll();
        showToast(`Niet meer in de wacht — "${team.team_name}"`);
      } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    };
  }

  // Waiting-for-count modal — reuses the same modal element, count endpoints
  function openCountWaitingModal(team) {
    const m = $('waiting-modal');
    $('waiting-modal-title').textContent = team.team_name;
    $('waiting-modal-text').textContent =
      `Je hebt ${team.captain_name} op ${fmtTime(team.count_requested_at)} gevraagd het aantal spelers door te geven. ` +
      `Het team staat zolang in de wacht — de aantal-optie onder "Aanpassen" is geblokkeerd zodat je niet per ongeluk opnieuw vraagt.`;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';

    const cleanup = () => {
      m.classList.remove('show');
      document.body.style.overflow = '';
      $('waiting-modal-close').onclick = null;
      $('waiting-modal-close-2').onclick = null;
      $('waiting-modal-resend').onclick = null;
      $('waiting-modal-cancel').onclick = null;
      m.onclick = null;
    };

    $('waiting-modal-close').onclick = cleanup;
    $('waiting-modal-close-2').onclick = cleanup;
    m.onclick = (e) => { if (e.target.id === 'waiting-modal') cleanup(); };

    $('waiting-modal-resend').onclick = async () => {
      const adminMessage = prompt(
        `Stuur ${team.captain_name} dezelfde link nog een keer (bijv. als de eerste mail kwijt is).\n\n` +
        `Optioneel persoonlijk bericht:`, ''
      );
      if (adminMessage === null) return;
      cleanup();
      try {
        const res = await api(`/api/admin/teams/${team.id}/request-count`, {
          method: 'POST',
          body: JSON.stringify({ admin_message: adminMessage.trim() || undefined }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { alert('Fout: ' + (json.error || res.status)); return; }
        await refreshAll();
        if (json.actionId && json.undoWindowMs) {
          showUndoToast({
            message: `Link opnieuw verstuurd naar ${team.captain_name}`,
            actionId: json.actionId,
            undoWindowMs: json.undoWindowMs,
            onUndo: async (actionId) => {
              const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
              if (!r.ok) throw new Error('Undo failed');
              await refreshAll();
            },
          });
        } else {
          showToast(`Link opnieuw verstuurd naar ${team.captain_name}`);
        }
      } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    };

    $('waiting-modal-cancel').onclick = async () => {
      if (!confirm(`Stoppen met wachten op het aantal spelers voor "${team.team_name}"?\n\nDe verstuurde link werkt daarna niet meer en de aantal-optie onder "Aanpassen" wordt weer beschikbaar.`)) return;
      cleanup();
      try {
        const res = await api(`/api/admin/teams/${team.id}/cancel-count`, { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { alert('Fout: ' + (json.error || res.status)); return; }
        await refreshAll();
        showToast(`Niet meer in de wacht — "${team.team_name}"`);
      } catch (e) { alert('Netwerkfout — probeer opnieuw.'); }
    };
  }

  // Self-service change requests — shared by the Adjust modal. kind: 'rename' | 'count'
  const CHANGE_CFG = {
    rename: {
      endpoint: id => `/api/admin/teams/${id}/request-rename`,
      promptIntro: t => `de teamnaam "${t.team_name}"`,
      toastWord: 'teamnaam aanpassen',
    },
    count: {
      endpoint: id => `/api/admin/teams/${id}/request-count`,
      promptIntro: t => `het aantal spelers van "${t.team_name}" (nu ${t.expected_players})`,
      toastWord: 'aantal spelers aanpassen',
    },
  };

  async function sendChangeRequest(team, kind) {
    const cfg = CHANGE_CFG[kind];
    const adminMessage = prompt(
      `Stuur "${team.captain_name}" een mail met een link om ${cfg.promptIntro(team)} zelf aan te passen.\n\n` +
      `Optioneel: een persoonlijk bericht. Laat leeg om alleen de standaardmail te sturen.`,
      ''
    );
    if (adminMessage === null) return;  // cancelled
    const scrollY = window.scrollY;
    try {
      const res = await api(cfg.endpoint(team.id), {
        method: 'POST',
        body: JSON.stringify({ admin_message: adminMessage.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert('Fout: ' + (json.error || res.status)); return; }
      await refreshAll();
      window.scrollTo(0, scrollY);
      if (json.actionId && json.undoWindowMs) {
        showUndoToast({
          message: `Mail naar ${team.captain_name} — ${cfg.toastWord}`,
          actionId: json.actionId,
          undoWindowMs: json.undoWindowMs,
          onUndo: async (actionId) => {
            const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
            if (!r.ok) throw new Error('Undo failed');
            await refreshAll();
            window.scrollTo(0, scrollY);
          },
        });
      } else {
        showToast(`Mail verstuurd naar ${team.captain_name} — ${cfg.toastWord}`);
      }
    } catch (e) {
      alert('Netwerkfout — probeer opnieuw.');
    }
  }

  // Adjust modal — pick which self-service change to ask the captain for
  function openAdjustModal(team) {
    const m = $('adjust-modal');
    $('adjust-modal-title').textContent = team.team_name;

    const renameBtn = $('adjust-rename');
    const countBtn = $('adjust-count');
    const renameWaiting = !!team.rename_requested_at;
    const countWaiting = !!team.count_requested_at;

    renameBtn.disabled = renameWaiting;
    // Player-count change is built but stays off until it gets the go-ahead.
    countBtn.disabled = countWaiting || !countChangeEnabled;
    $('adjust-rename-sub').textContent = renameWaiting
      ? 'Er loopt al een naam-verzoek — beheer via de badge in de lijst'
      : 'Captain kiest zelf een nieuwe teamnaam';
    $('adjust-count-sub').textContent = !countChangeEnabled
      ? 'Nog niet beschikbaar'
      : countWaiting
        ? 'Er loopt al een aantal-verzoek — beheer via de badge in de lijst'
        : 'Captain past zelf het aantal spelers aan';

    m.classList.add('show');
    document.body.style.overflow = 'hidden';

    const cleanup = () => {
      m.classList.remove('show');
      document.body.style.overflow = '';
      $('adjust-modal-close').onclick = null;
      $('adjust-modal-close-2').onclick = null;
      renameBtn.onclick = null;
      countBtn.onclick = null;
      m.onclick = null;
    };
    $('adjust-modal-close').onclick = cleanup;
    $('adjust-modal-close-2').onclick = cleanup;
    m.onclick = (e) => { if (e.target.id === 'adjust-modal') cleanup(); };
    renameBtn.onclick = () => { if (renameWaiting) return; cleanup(); sendChangeRequest(team, 'rename'); };
    countBtn.onclick = () => { if (countWaiting || !countChangeEnabled) return; cleanup(); sendChangeRequest(team, 'count'); };
  }

  // Reject modal — collects reason + optional personal message
  function openRejectModal(team) {
    return new Promise((resolve) => {
      const m = $('reject-modal');
      $('reject-team-name').textContent = team.team_name;
      $('reject-reason').value = '';
      $('reject-message').value = '';
      m.classList.add('show');
      document.body.style.overflow = 'hidden';
      setTimeout(() => $('reject-reason').focus(), 50);

      const cleanup = () => {
        m.classList.remove('show');
        document.body.style.overflow = '';
        $('reject-confirm').onclick = null;
        $('reject-cancel').onclick = null;
        m.onclick = null;
      };
      $('reject-confirm').onclick = () => {
        const reason = $('reject-reason').value.trim();
        const adminMessage = $('reject-message').value.trim();
        cleanup();
        resolve({ reason, adminMessage });
      };
      $('reject-cancel').onclick = () => { cleanup(); resolve(null); };
      m.onclick = (e) => { if (e.target.id === 'reject-modal') { cleanup(); resolve(null); } };
    });
  }

  // ===== PROGRAMMA TAB ============================================
  // The Programma tab embeds the live tournament app (/toernooi.html) via a
  // static iframe — no JS wiring needed.

  // ===== CSV EXPORT ===============================================
  $('export-marketing-btn').addEventListener('click', () => downloadCsv('/api/admin/marketing-list.csv', 'jvo-mailinglijst.csv'));
  if ($('export-backup-btn')) {
    $('export-backup-btn').addEventListener('click', async () => {
      try {
        const res = await api('/api/admin/backup.zip');
        if (!res.ok) throw new Error('Backup mislukt');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0,10);
        a.download = `jvo-backup-${date}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch { alert('Kon backup niet downloaden.'); }
    });
  }
  if ($('export-db-btn')) {
    $('export-db-btn').addEventListener('click', async () => {
      const btn = $('export-db-btn');
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Snapshot maken…';
      try {
        const res = await api('/api/admin/db-snapshot');
        if (!res.ok) throw new Error('Snapshot mislukt');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `database-${new Date().toISOString().slice(0,10)}.sqlite`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch { alert('Kon database-snapshot niet downloaden.'); }
      finally { btn.disabled = false; btn.textContent = orig; }
    });
  }

  async function downloadCsv(url, filename) {
    try {
      const res = await api(url);
      if (!res.ok) throw new Error('Export mislukt');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert('Kon CSV niet downloaden.');
    }
  }

  // ===== QR MODAL =================================================
  let modalTeam = null;

  function openQR(team) {
    if (!team.checkin_url) {
      alert('Dit team heeft nog geen QR. Goedkeuren maakt er een aan.');
      return;
    }
    modalTeam = team;
    $('modal-team-name').textContent = team.team_name;
    $('modal-url').textContent = team.checkin_url;

    const checkedIn = !!team.checked_in_at;
    $('modal-checkin-pill').style.display = checkedIn ? 'inline-block' : 'none';
    const info = $('modal-status-info');
    info.classList.toggle('checked', checkedIn);
    info.classList.toggle('pending', !checkedIn);
    $('modal-status-title').textContent = checkedIn
      ? `Ingecheckt om ${fmtTime(team.checked_in_at)}`
      : 'Nog niet ingecheckt';
    $('modal-status-detail').textContent = checkedIn
      ? 'Deze QR is al gebruikt. Een tweede scan zal "al ingecheckt" melden.'
      : 'Het team kan inchecken op de dag zelf met deze QR.';

    drawQR(team.checkin_url);
    $('qr-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function drawQR(url) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const cellSize = 6, margin = 2;
    const moduleCount = qr.getModuleCount();
    const size = (moduleCount + margin * 2) * cellSize;
    const canvas = $('qr-canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#E8F4FF'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#0A1628';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect((col + margin) * cellSize, (row + margin) * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  $('qr-close').addEventListener('click', closeModal);
  $('btn-modal-close-2').addEventListener('click', closeModal);
  $('qr-modal').addEventListener('click', (e) => { if (e.target.id === 'qr-modal') closeModal(); });
  function closeModal() {
    $('qr-modal').classList.remove('show');
    document.body.style.overflow = '';
    modalTeam = null;
  }

  $('btn-download-qr').addEventListener('click', () => {
    if (!modalTeam) return;
    const a = document.createElement('a');
    a.download = `team-${modalTeam.team_name.replace(/[^a-z0-9]/gi, '_')}-qr.png`;
    a.href = $('qr-canvas').toDataURL('image/png');
    a.click();
  });

  $('btn-resend-qr').addEventListener('click', async () => {
    if (!modalTeam) return;
    const teamId = modalTeam.id, teamName = modalTeam.team_name;
    const btn = $('btn-resend-qr');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Versturen…';
    try {
      const res = await api(`/api/admin/teams/${teamId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approved' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showToast('Kon mail niet versturen: ' + (json.error || res.status), 'error'); return; }
      closeModal();
      // The mail is DEFERRED behind the 8s undo window like every other mail
      // flow — so show the SAME undo toast instead of claiming it already went.
      if (json.actionId && json.undoWindowMs) {
        showUndoToast({
          message: `QR-mail naar ${teamName} wordt verstuurd`,
          actionId: json.actionId,
          undoWindowMs: json.undoWindowMs,
          onUndo: async (actionId) => {
            const r = await api(`/api/admin/undo/${actionId}`, { method: 'POST' });
            if (!r.ok) throw new Error('Undo failed');
            await refreshAll();
          },
        });
      } else {
        showToast(`QR-mail naar ${teamName} verstuurd`);
      }
    } catch { showToast('Netwerkfout — probeer opnieuw.', 'error'); }
    finally { btn.disabled = false; btn.textContent = original; }
  });
})();
