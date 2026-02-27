/**
 * CloudPanel
 * Dedicated Cloud tab — connection, profile, sessions, and file sync management.
 * Extracted from RemotePanel's cloud zone into its own first-class panel.
 */

const { t } = require('../../i18n');

let _ctx = null;
let _cloudSessionsInterval = null;
let _cloudSyncInterval = null;

function _escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(settings) {
  return `
    <div class="cloud-panel">

      <!-- Info banner -->
      <div class="cp-info-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
        </svg>
        <span>${t('cloud.infoBanner')}</span>
      </div>

      <!-- Install command -->
      <div class="cp-install">
        <div class="cp-install-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="3"/><line x1="6" y1="9" x2="6" y2="9.01"/><line x1="10" y1="9" x2="18" y2="9"/></svg>
          <span>${t('cloud.installTitle')}</span>
        </div>
        <div class="cp-install-cmd">
          <code id="cp-install-cmd">curl -fsSL https://raw.githubusercontent.com/Sterll/claude-terminal/main/cloud/install.sh | sudo bash</code>
          <button class="cp-install-copy" id="cp-install-copy" title="${t('cloud.copyCmd')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        <div class="cp-install-hint">${t('cloud.installHint')}</div>
      </div>

      <!-- Connection form -->
      <div class="cp-card">
        <div class="cp-field">
          <label for="cp-server-url">${t('cloud.serverUrl')}</label>
          <input type="text" id="cp-server-url" class="cp-input" value="${_escapeHtml(settings.cloudServerUrl || '')}" placeholder="${t('cloud.serverUrlPlaceholder')}">
        </div>
        <div class="cp-field">
          <label for="cp-api-key">${t('cloud.apiKey')}</label>
          <div class="cp-key-row">
            <input type="password" id="cp-api-key" class="cp-input cp-key-input" value="${_escapeHtml(settings.cloudApiKey || '')}" placeholder="${t('cloud.apiKeyPlaceholder')}">
            <button class="cp-key-toggle" id="cp-key-toggle" type="button" title="Toggle visibility">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <div class="cp-field-hint">${t('cloud.apiKeyDesc')}</div>
        </div>
      </div>

      <!-- Status + Actions -->
      <div class="cp-footer">
        <div class="cp-auto">
          <label class="settings-toggle rp-mini-toggle">
            <input type="checkbox" id="cp-auto-connect" ${settings.cloudAutoConnect !== false ? 'checked' : ''}>
            <span class="settings-toggle-slider"></span>
          </label>
          <span class="cp-auto-label">${t('cloud.autoConnect')}</span>
        </div>
        <div class="cp-actions">
          <span class="cp-status-indicator" id="cp-status-indicator"></span>
          <span class="cp-status-text" id="cp-status-text">${t('cloud.disconnected')}</span>
          <button class="rp-server-btn" id="cp-connect-btn">${t('cloud.connect')}</button>
        </div>
      </div>

      <!-- ═══ Connected Content (hidden when disconnected) ═══ -->
      <div id="cp-connected-content" style="display:none">
        <div class="cp-divider"></div>

        <!-- Profile -->
        <div class="cp-section-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span>${t('cloud.userTitle')}</span>
        </div>
        <div class="cp-card">
          <div class="cp-user-header">
            <span class="cp-user-name" id="cp-user-display-name">\u2014</span>
            <span class="cp-badge" id="cp-user-claude-badge">\u2014</span>
          </div>
          <div class="cp-field">
            <label for="cp-user-git-name">${t('cloud.userGitName')}</label>
            <input type="text" id="cp-user-git-name" class="cp-input" placeholder="John Doe">
          </div>
          <div class="cp-field">
            <label for="cp-user-git-email">${t('cloud.userGitEmail')}</label>
            <input type="text" id="cp-user-git-email" class="cp-input" placeholder="john@example.com">
          </div>
          <div class="cp-user-actions">
            <span class="cp-user-save-status" id="cp-user-save-status"></span>
            <button class="rp-server-btn cp-btn-sm" id="cp-user-save-btn">${t('cloud.userSave')}</button>
          </div>
        </div>

        <!-- Sessions -->
        <div class="cp-section-header" style="margin-top:16px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          <span>${t('cloud.sessionsTitle')}</span>
          <button class="cp-btn-icon" id="cp-sessions-refresh" title="${t('cloud.sessionsRefresh')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
        <div id="cp-sessions-list" class="cp-sessions-list">
          <div class="cp-sessions-empty">${t('cloud.sessionsEmpty')}</div>
        </div>

        <!-- Sync Changes -->
        <div class="cp-divider" style="margin-top:16px"></div>
        <div class="cp-section-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span>${t('cloud.syncSectionTitle')}</span>
          <span class="cp-sync-badge" id="cp-sync-badge" style="display:none">0</span>
        </div>
        <div class="cp-sync-area" id="cp-sync-area">
          <div class="cp-sessions-empty" id="cp-sync-empty">${t('cloud.syncNoChanges')}</div>
          <div id="cp-sync-list" style="display:none"></div>
        </div>
        <button class="rp-server-btn cp-btn-full" id="cp-sync-check-btn" style="margin-top:8px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          ${t('cloud.syncCheckBtn')}
        </button>
      </div>

    </div>
  `;
}


function setupHandlers(context) {
  _ctx = context;
  const api = window.electron_api;

  // ── Install copy ──
  const installCopyBtn = document.getElementById('cp-install-copy');
  const installCmd = document.getElementById('cp-install-cmd');
  if (installCopyBtn && installCmd) {
    installCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(installCmd.textContent).then(() => {
        installCopyBtn.classList.add('copied');
        setTimeout(() => installCopyBtn.classList.remove('copied'), 1500);
      });
    });
  }

  // ── Connection form ──
  const urlInput = document.getElementById('cp-server-url');
  const keyInput = document.getElementById('cp-api-key');
  const autoToggle = document.getElementById('cp-auto-connect');
  const connectBtn = document.getElementById('cp-connect-btn');
  const statusIndicator = document.getElementById('cp-status-indicator');
  const statusText = document.getElementById('cp-status-text');
  const keyToggle = document.getElementById('cp-key-toggle');
  const connectedContent = document.getElementById('cp-connected-content');

  // Key visibility toggle
  if (keyToggle && keyInput) {
    keyToggle.addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
      keyToggle.classList.toggle('revealed', isPassword);
    });
  }

  function _updateStatusUI(connected) {
    if (!statusIndicator || !statusText || !connectBtn) return;
    if (connected) {
      statusIndicator.classList.add('online');
      statusText.textContent = t('cloud.connected');
      connectBtn.textContent = t('cloud.disconnect');
      connectBtn.classList.add('rp-btn-danger');
      if (connectedContent) connectedContent.style.display = '';
      _loadCloudUser();
      _loadCloudSessions();
      _startSessionsPolling();
      _checkCloudChanges();
      _startSyncPolling();
    } else {
      statusIndicator.classList.remove('online');
      statusText.textContent = t('cloud.disconnected');
      connectBtn.textContent = t('cloud.connect');
      connectBtn.classList.remove('rp-btn-danger');
      if (connectedContent) connectedContent.style.display = 'none';
      _stopSessionsPolling();
      _stopSyncPolling();
      _updateSyncBadge(0);
    }
  }

  // Save URL/key on change
  if (urlInput) {
    urlInput.addEventListener('change', () => {
      _ctx.settingsState.setProp('cloudServerUrl', urlInput.value.trim());
      _ctx.saveSettings();
    });
  }
  if (keyInput) {
    keyInput.addEventListener('change', () => {
      _ctx.settingsState.setProp('cloudApiKey', keyInput.value.trim());
      _ctx.saveSettings();
    });
  }
  if (autoToggle) {
    autoToggle.addEventListener('change', () => {
      _ctx.settingsState.setProp('cloudAutoConnect', autoToggle.checked);
      _ctx.saveSettings();
    });
  }

  // Connect/Disconnect
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      try {
        const status = await api.cloud.status();
        if (status.connected) {
          await api.cloud.disconnect();
          _updateStatusUI(false);
        } else {
          const url = urlInput?.value.trim();
          const key = keyInput?.value.trim();
          if (!url || !key) return;
          await api.cloud.connect({ serverUrl: url, apiKey: key });
          statusText.textContent = t('cloud.connecting');
        }
      } finally {
        connectBtn.disabled = false;
      }
    });
  }

  // Listen for status changes (from auto-connect or other sources)
  if (api.cloud?.onStatusChanged) {
    api.cloud.onStatusChanged((status) => {
      _updateStatusUI(status.connected);
    });
  }

  // Initial status check
  (async () => {
    try {
      const status = await api.cloud.status();
      if (status.connected) {
        _updateStatusUI(true);
      }
    } catch { /* ignore */ }
  })();

  // ── User profile ──
  async function _loadCloudUser() {
    try {
      const user = await api.cloud.getUser();
      const nameEl = document.getElementById('cp-user-display-name');
      const badgeEl = document.getElementById('cp-user-claude-badge');
      const gitNameInput = document.getElementById('cp-user-git-name');
      const gitEmailInput = document.getElementById('cp-user-git-email');
      if (nameEl) nameEl.textContent = user.name || '\u2014';
      if (badgeEl) {
        if (user.claudeAuthed) {
          badgeEl.textContent = t('cloud.userClaudeAuthed');
          badgeEl.className = 'cp-badge success';
        } else {
          badgeEl.textContent = t('cloud.userClaudeNotAuthed');
          badgeEl.className = 'cp-badge warning';
        }
      }
      if (gitNameInput) gitNameInput.value = user.gitName || '';
      if (gitEmailInput) gitEmailInput.value = user.gitEmail || '';
    } catch { /* ignore */ }
  }

  const userSaveBtn = document.getElementById('cp-user-save-btn');
  const userSaveStatus = document.getElementById('cp-user-save-status');
  if (userSaveBtn) {
    userSaveBtn.addEventListener('click', async () => {
      userSaveBtn.disabled = true;
      const gitName = document.getElementById('cp-user-git-name')?.value.trim();
      const gitEmail = document.getElementById('cp-user-git-email')?.value.trim();
      try {
        await api.cloud.updateUser({ gitName, gitEmail });
        if (userSaveStatus) {
          userSaveStatus.textContent = t('cloud.userSaved');
          userSaveStatus.className = 'cp-user-save-status success';
          setTimeout(() => { userSaveStatus.textContent = ''; userSaveStatus.className = 'cp-user-save-status'; }, 2000);
        }
      } catch {
        if (userSaveStatus) {
          userSaveStatus.textContent = t('cloud.userSaveError');
          userSaveStatus.className = 'cp-user-save-status error';
          setTimeout(() => { userSaveStatus.textContent = ''; userSaveStatus.className = 'cp-user-save-status'; }, 3000);
        }
      } finally {
        userSaveBtn.disabled = false;
      }
    });
  }

  // ── Sessions ──
  async function _loadCloudSessions() {
    const listEl = document.getElementById('cp-sessions-list');
    if (!listEl) return;
    try {
      const { sessions } = await api.cloud.getSessions();
      if (!sessions || sessions.length === 0) {
        listEl.innerHTML = `<div class="cp-sessions-empty">${t('cloud.sessionsEmpty')}</div>`;
        return;
      }
      listEl.innerHTML = sessions.map(s => {
        const statusClass = s.status === 'running' ? 'running' : s.status === 'error' ? 'error' : 'idle';
        const statusLabel = s.status === 'running' ? t('cloud.sessionRunning') : s.status === 'error' ? t('cloud.sessionError') : t('cloud.sessionIdle');
        const stopBtn = s.status === 'running'
          ? `<button class="cp-btn-sm cp-btn-danger cp-session-stop" data-id="${s.id}">${t('cloud.sessionStop')}</button>`
          : `<button class="cp-btn-sm cp-session-stop" data-id="${s.id}" title="Delete">\u2715</button>`;
        return `<div class="cp-session-item">
          <div class="cp-session-info">
            <span class="cp-session-project">${_escapeHtml(s.projectName)}</span>
            <span class="cp-session-status ${statusClass}">${statusLabel}</span>
          </div>
          ${stopBtn}
        </div>`;
      }).join('');

      listEl.querySelectorAll('.cp-session-stop').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await api.cloud.stopSession({ sessionId: btn.dataset.id });
            await _loadCloudSessions();
          } catch {
            btn.disabled = false;
          }
        });
      });
    } catch {
      listEl.innerHTML = `<div class="cp-sessions-empty">${t('cloud.sessionsEmpty')}</div>`;
    }
  }

  function _startSessionsPolling() {
    _stopSessionsPolling();
    _cloudSessionsInterval = setInterval(() => {
      if (!document.getElementById('cp-sessions-list')) { _stopSessionsPolling(); return; }
      _loadCloudSessions();
    }, 15000);
  }

  function _stopSessionsPolling() {
    if (_cloudSessionsInterval) { clearInterval(_cloudSessionsInterval); _cloudSessionsInterval = null; }
  }

  const sessionsRefresh = document.getElementById('cp-sessions-refresh');
  if (sessionsRefresh) {
    sessionsRefresh.addEventListener('click', async () => {
      sessionsRefresh.classList.add('spinning');
      await _loadCloudSessions();
      setTimeout(() => sessionsRefresh.classList.remove('spinning'), 400);
    });
  }

  // ── Sync changes ──
  async function _checkCloudChanges() {
    const syncEmpty = document.getElementById('cp-sync-empty');
    const syncList = document.getElementById('cp-sync-list');
    if (!syncList) return;

    try {
      const result = await api.cloud.checkPendingChanges();
      const changes = result.changes || [];

      // Update per-project badges in ProjectList
      if (_ctx.updateProjectPendingChanges) {
        _ctx.updateProjectPendingChanges(changes);
      }

      if (changes.length === 0) {
        if (syncEmpty) syncEmpty.style.display = '';
        syncList.style.display = 'none';
        _updateSyncBadge(0);
        return;
      }

      if (syncEmpty) syncEmpty.style.display = 'none';
      syncList.style.display = '';

      let totalFiles = 0;
      syncList.innerHTML = changes.map(({ projectName, changes: fileChanges }) => {
        const files = fileChanges.flatMap(c => c.changedFiles || []);
        totalFiles += files.length;
        const fileList = files.slice(0, 10).map(f => `<div class="cp-sync-file">${_escapeHtml(f)}</div>`).join('');
        const moreCount = files.length > 10 ? `<div class="cp-sync-more">+${files.length - 10} ${t('cloud.syncMoreFiles')}</div>` : '';
        return `<div class="cp-sync-project" data-project="${_escapeHtml(projectName)}">
          <div class="cp-sync-project-header">
            <span class="cp-sync-project-name">${_escapeHtml(projectName)}</span>
            <span class="cp-sync-count">${files.length} ${files.length === 1 ? 'file' : 'files'}</span>
            <button class="rp-server-btn cp-btn-sm cp-sync-apply" data-project="${_escapeHtml(projectName)}">${t('cloud.syncApply')}</button>
          </div>
          <div class="cp-sync-files">${fileList}${moreCount}</div>
        </div>`;
      }).join('');

      _updateSyncBadge(totalFiles);

      // Wire apply buttons
      syncList.querySelectorAll('.cp-sync-apply').forEach(btn => {
        btn.addEventListener('click', async () => {
          const projName = btn.dataset.project;
          btn.disabled = true;
          btn.textContent = '...';
          try {
            const projects = _ctx.projectsState?.get()?.projects || [];
            const localProject = projects.find(p =>
              p.name === projName || p.path?.replace(/\\/g, '/').split('/').pop() === projName
            );
            if (!localProject) {
              const Toast = require('../../ui/components/Toast');
              Toast.show(t('cloud.syncNoLocalProject', { project: projName }), 'warning');
              btn.disabled = false;
              btn.textContent = t('cloud.syncApply');
              return;
            }
            await api.cloud.downloadChanges({ projectName: projName, localProjectPath: localProject.path });
            const Toast = require('../../ui/components/Toast');
            Toast.show(t('cloud.syncApplied'), 'success');
            await _checkCloudChanges();
          } catch {
            const Toast = require('../../ui/components/Toast');
            Toast.show(t('cloud.syncError') || t('cloud.uploadError'), 'error');
            btn.disabled = false;
            btn.textContent = t('cloud.syncApply');
          }
        });
      });
    } catch {
      if (syncEmpty) syncEmpty.style.display = '';
      if (syncList) syncList.style.display = 'none';
      _updateSyncBadge(0);
    }
  }

  function _updateSyncBadge(count) {
    const badge = document.getElementById('cp-sync-badge');
    if (!badge) return;
    if (count > 0) {
      badge.style.display = '';
      badge.textContent = String(count);
    } else {
      badge.style.display = 'none';
    }
  }

  function _startSyncPolling() {
    _stopSyncPolling();
    _cloudSyncInterval = setInterval(() => {
      if (!document.getElementById('cp-sync-list')) { _stopSyncPolling(); return; }
      _checkCloudChanges();
    }, 30000);
  }

  function _stopSyncPolling() {
    if (_cloudSyncInterval) { clearInterval(_cloudSyncInterval); _cloudSyncInterval = null; }
  }

  const syncCheckBtn = document.getElementById('cp-sync-check-btn');
  if (syncCheckBtn) {
    syncCheckBtn.addEventListener('click', async () => {
      syncCheckBtn.disabled = true;
      syncCheckBtn.classList.add('loading');
      try {
        await _checkCloudChanges();
      } finally {
        syncCheckBtn.disabled = false;
        syncCheckBtn.classList.remove('loading');
      }
    });
  }
}


function cleanup() {
  _stopSessionsPolling();
  _stopSyncPolling();
}

function _stopSessionsPolling() {
  if (_cloudSessionsInterval) { clearInterval(_cloudSessionsInterval); _cloudSessionsInterval = null; }
}

function _stopSyncPolling() {
  if (_cloudSyncInterval) { clearInterval(_cloudSyncInterval); _cloudSyncInterval = null; }
}


module.exports = { buildHtml, setupHandlers, cleanup };
