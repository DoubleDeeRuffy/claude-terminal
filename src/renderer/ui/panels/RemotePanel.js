/**
 * RemotePanel
 * Redesigned connection hub — two clear zones: Local (Wi-Fi) and Cloud (Internet).
 * Guided flow with visual hierarchy, step numbering, and contextual help.
 */

const { t } = require('../../i18n');
const QRCode = require('qrcode');

let _ctx = null;
let _pinRefreshInterval = null;

function buildHtml(settings) {
  const remoteEnabled = settings.remoteEnabled || false;
  const remotePort = settings.remotePort || 3712;
  const showLocal = remoteEnabled ? '' : 'display:none';

  return `
    <!-- ═══ Master Toggle ═══ -->
    <div class="rp-master-toggle">
      <div class="rp-master-toggle-content">
        <div class="rp-master-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <div class="rp-master-text">
          <div class="rp-master-title">${t('remote.enable')}</div>
          <div class="rp-master-desc">${t('remote.enableDesc')}</div>
        </div>
      </div>
      <div class="rp-master-actions">
        <button class="rp-help-btn" id="rp-help-btn" type="button" title="${t('remote.helpTitle')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
        <label class="settings-toggle">
          <input type="checkbox" id="remote-enabled-toggle" ${remoteEnabled ? 'checked' : ''}>
          <span class="settings-toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- ═══ Help Guide Overlay ═══ -->
    <div class="rp-help-overlay" id="rp-help-overlay" style="display:none">
      <div class="rp-help-panel">
        <div class="rp-help-header">
          <h3 class="rp-help-heading">${t('remote.helpTitle')}</h3>
          <button class="rp-help-close" id="rp-help-close" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p class="rp-help-intro">${t('remote.helpIntro')}</p>

        <div class="rp-help-section">
          <div class="rp-help-section-icon rp-help-icon-local">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
          </div>
          <div class="rp-help-section-content">
            <h4>${t('remote.helpLocalTitle')}</h4>
            <ol class="rp-help-steps">
              <li>${t('remote.helpLocalStep1')}</li>
              <li>${t('remote.helpLocalStep2')}</li>
              <li>${t('remote.helpLocalStep3')}</li>
              <li>${t('remote.helpLocalStep4')}</li>
            </ol>
            <div class="rp-help-note">${t('remote.helpLocalNote')}</div>
          </div>
        </div>

        <div class="rp-help-section">
          <div class="rp-help-section-icon rp-help-icon-cloud">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            </svg>
          </div>
          <div class="rp-help-section-content">
            <h4>${t('remote.helpCloudTitle')}</h4>
            <ol class="rp-help-steps">
              <li>${t('remote.helpCloudStep1')}</li>
              <li>${t('remote.helpCloudStep2')}</li>
              <li>${t('remote.helpCloudStep3')}</li>
              <li>${t('remote.helpCloudStep4')}</li>
            </ol>
            <div class="rp-help-note">${t('remote.helpCloudNote')}</div>
          </div>
        </div>

        <div class="rp-help-section rp-help-section-security">
          <div class="rp-help-section-icon rp-help-icon-security">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div class="rp-help-section-content">
            <h4>${t('remote.helpSecurityTitle')}</h4>
            <ul class="rp-help-list">
              <li>${t('remote.helpSecurityPoint1')}</li>
              <li>${t('remote.helpSecurityPoint2')}</li>
              <li>${t('remote.helpSecurityPoint3')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Connection Modes ═══ -->
    <div id="rp-connection-zones" style="${showLocal}">

      <!-- ─── MODE TABS ─── -->
      <div class="rp-mode-tabs">
        <button class="rp-mode-tab active" data-mode="local">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          ${t('remote.modeLocal')}
        </button>
        <button class="rp-mode-tab" data-mode="cloud">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
          </svg>
          ${t('remote.modeCloud')}
        </button>
      </div>

      <!-- ═══ LOCAL ZONE ═══ -->
      <div class="rp-zone" id="rp-zone-local">

        <!-- How it works -->
        <div class="rp-info-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>${t('remote.localInfoBanner')}</span>
        </div>

        <!-- Server status + action -->
        <div class="rp-server-card">
          <div class="rp-server-header">
            <div class="rp-server-status-area">
              <span class="rp-status-indicator" id="remote-status-indicator"></span>
              <span class="rp-server-status-label" id="remote-status-text">${t('remote.serverStopped')}</span>
            </div>
            <button class="rp-server-btn" id="remote-toggle-server-btn">${t('remote.startServer')}</button>
          </div>
          <div class="rp-server-url" id="rp-server-url-display"></div>
        </div>

        <!-- QR + PIN side by side -->
        <div class="rp-pair-zone" id="rp-pair-zone" style="display:none">
          <div class="rp-pair-title">${t('remote.pairTitle')}</div>
          <div class="rp-pair-grid">

            <!-- QR Column -->
            <div class="rp-pair-col rp-qr-col">
              <div class="rp-pair-step-label">${t('remote.stepScan')}</div>
              <div class="rp-qr-wrapper">
                <canvas id="remote-qr-canvas"></canvas>
              </div>
              <div class="rp-qr-url-mini" id="remote-qr-url"></div>
            </div>

            <!-- Divider -->
            <div class="rp-pair-divider">
              <span>${t('remote.or')}</span>
            </div>

            <!-- PIN Column -->
            <div class="rp-pair-col rp-pin-col">
              <div class="rp-pair-step-label">${t('remote.stepPin')}</div>
              <div class="rp-pin-display" id="remote-pin-display">
                <span class="rp-pin-digit" id="pin-d0">-</span>
                <span class="rp-pin-digit" id="pin-d1">-</span>
                <span class="rp-pin-sep"></span>
                <span class="rp-pin-digit" id="pin-d2">-</span>
                <span class="rp-pin-digit" id="pin-d3">-</span>
              </div>
              <div class="rp-pin-countdown" id="remote-pin-countdown"></div>
              <button class="rp-pin-refresh" id="remote-pin-refresh-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                ${t('remote.pinRefresh')}
              </button>
            </div>

          </div>
        </div>

        <!-- Advanced settings (collapsed) -->
        <details class="rp-advanced">
          <summary>${t('remote.advancedSettings')}</summary>
          <div class="rp-advanced-body">
            <div class="rp-advanced-row">
              <div class="rp-advanced-label">${t('remote.port')}</div>
              <input type="number" id="remote-port-input" class="rp-input-sm" value="${remotePort}" min="1024" max="65535">
            </div>
            <div class="rp-advanced-row">
              <div class="rp-advanced-label">${t('remote.networkInterface')}</div>
              <select id="remote-iface-select" class="rp-select-sm">
                <option value="">${t('remote.networkInterfaceAuto')}</option>
              </select>
            </div>
          </div>
        </details>

      </div>

      <!-- ═══ CLOUD ZONE ═══ -->
      <div class="rp-zone" id="rp-zone-cloud" style="display:none">

        <!-- Info banner -->
        <div class="rp-info-banner rp-info-cloud">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span>${t('cloud.infoBanner')}</span>
        </div>

        <!-- Install command -->
        <div class="rp-cloud-install">
          <div class="rp-cloud-install-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="3"/><line x1="6" y1="9" x2="6" y2="9.01"/><line x1="10" y1="9" x2="18" y2="9"/></svg>
            <span>${t('cloud.installTitle')}</span>
          </div>
          <div class="rp-cloud-install-cmd">
            <code id="cloud-install-cmd">curl -fsSL https://raw.githubusercontent.com/Sterll/claude-terminal/main/cloud/install.sh | sudo bash</code>
            <button class="rp-cloud-install-copy" id="cloud-install-copy" title="${t('cloud.copyCmd')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          <div class="rp-cloud-install-hint">${t('cloud.installHint')}</div>
        </div>

        <!-- Connection form -->
        <div class="rp-cloud-card">
          <div class="rp-cloud-field">
            <label for="cloud-server-url">${t('cloud.serverUrl')}</label>
            <input type="text" id="cloud-server-url" class="rp-cloud-input" value="${settings.cloudServerUrl || ''}" placeholder="${t('cloud.serverUrlPlaceholder')}">
          </div>
          <div class="rp-cloud-field">
            <label for="cloud-api-key">${t('cloud.apiKey')}</label>
            <div class="rp-cloud-key-row">
              <input type="password" id="cloud-api-key" class="rp-cloud-input rp-cloud-key-input" value="${settings.cloudApiKey || ''}" placeholder="${t('cloud.apiKeyPlaceholder')}">
              <button class="rp-key-toggle" id="cloud-key-toggle" type="button" title="Toggle visibility">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
            <div class="rp-cloud-field-hint">${t('cloud.apiKeyDesc')}</div>
          </div>
        </div>

        <!-- Status + Actions -->
        <div class="rp-cloud-footer">
          <div class="rp-cloud-auto">
            <label class="settings-toggle rp-mini-toggle">
              <input type="checkbox" id="cloud-auto-connect" ${settings.cloudAutoConnect !== false ? 'checked' : ''}>
              <span class="settings-toggle-slider"></span>
            </label>
            <span class="rp-cloud-auto-label">${t('cloud.autoConnect')}</span>
          </div>
          <div class="rp-cloud-actions">
            <span class="rp-status-indicator" id="cloud-status-indicator"></span>
            <span class="rp-cloud-status-text" id="cloud-status-text">${t('cloud.disconnected')}</span>
            <button class="rp-server-btn" id="cloud-connect-btn">${t('cloud.connect')}</button>
          </div>
        </div>

        <!-- ═══ User Panel (visible when connected) ═══ -->
        <div class="rp-cloud-user-panel" id="rp-cloud-user-panel" style="display:none">
          <div class="rp-cloud-divider"></div>

          <!-- Profile -->
          <div class="rp-cloud-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span>${t('cloud.userTitle')}</span>
          </div>

          <div class="rp-cloud-card">
            <div class="rp-cloud-user-header">
              <span class="rp-cloud-user-name" id="cloud-user-display-name">\u2014</span>
              <span class="rp-badge" id="cloud-user-claude-badge">\u2014</span>
            </div>

            <div class="rp-cloud-field">
              <label for="cloud-user-git-name">${t('cloud.userGitName')}</label>
              <input type="text" id="cloud-user-git-name" class="rp-cloud-input" placeholder="John Doe">
            </div>
            <div class="rp-cloud-field">
              <label for="cloud-user-git-email">${t('cloud.userGitEmail')}</label>
              <input type="text" id="cloud-user-git-email" class="rp-cloud-input" placeholder="john@example.com">
            </div>
            <div class="rp-cloud-user-actions">
              <span class="rp-cloud-user-save-status" id="cloud-user-save-status"></span>
              <button class="rp-server-btn rp-btn-sm" id="cloud-user-save-btn">${t('cloud.userSave')}</button>
            </div>
          </div>

          <!-- Sessions -->
          <div class="rp-cloud-section-header" style="margin-top:16px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            <span>${t('cloud.sessionsTitle')}</span>
            <button class="rp-btn-icon" id="cloud-sessions-refresh" title="${t('cloud.sessionsRefresh')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          </div>
          <div id="cloud-sessions-list" class="rp-cloud-sessions-list">
            <div class="rp-cloud-sessions-empty">${t('cloud.sessionsEmpty')}</div>
          </div>

          <!-- Sync Changes -->
          <div class="rp-cloud-divider"></div>
          <div class="rp-cloud-section-header" style="margin-top:12px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span>${t('cloud.syncSectionTitle')}</span>
            <span class="rp-cloud-sync-badge" id="cloud-sync-badge" style="display:none">0</span>
          </div>
          <div class="rp-cloud-sync-area" id="cloud-sync-area">
            <div class="rp-cloud-sessions-empty" id="cloud-sync-empty">${t('cloud.syncNoChanges')}</div>
            <div id="cloud-sync-list" style="display:none"></div>
          </div>
          <button class="rp-server-btn rp-btn-sm rp-btn-full" id="cloud-sync-check-btn" style="margin-top:8px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            ${t('cloud.syncCheckBtn')}
          </button>
        </div>

      </div>

    </div>
  `;
}


function setupHandlers(context) {
  _ctx = context;

  const toggle = document.getElementById('remote-enabled-toggle');
  const zones = document.getElementById('rp-connection-zones');
  const portInput = document.getElementById('remote-port-input');
  const ifaceSelect = document.getElementById('remote-iface-select');
  const refreshBtn = document.getElementById('remote-pin-refresh-btn');

  if (!toggle) return;

  // ── Help guide ──
  const helpBtn = document.getElementById('rp-help-btn');
  const helpOverlay = document.getElementById('rp-help-overlay');
  const helpClose = document.getElementById('rp-help-close');

  if (helpBtn && helpOverlay) {
    helpBtn.addEventListener('click', () => {
      helpOverlay.style.display = '';
    });
  }
  if (helpClose && helpOverlay) {
    helpClose.addEventListener('click', () => {
      helpOverlay.style.display = 'none';
    });
  }
  if (helpOverlay) {
    helpOverlay.addEventListener('click', (e) => {
      if (e.target === helpOverlay) helpOverlay.style.display = 'none';
    });
  }

  // ── Mode tabs ──
  const modeTabs = document.querySelectorAll('.rp-mode-tab');
  const zoneLocal = document.getElementById('rp-zone-local');
  const zoneCloud = document.getElementById('rp-zone-cloud');
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      if (zoneLocal) zoneLocal.style.display = mode === 'local' ? '' : 'none';
      if (zoneCloud) zoneCloud.style.display = mode === 'cloud' ? '' : 'none';
    });
  });

  async function populateIfaceSelect() {
    if (!ifaceSelect) return;
    try {
      const info = await window.electron_api.remote.getServerInfo();
      const ifaces = info.networkInterfaces || [];
      const savedIp = _ctx.settingsState.get().remoteSelectedIp || '';
      while (ifaceSelect.options.length > 1) ifaceSelect.remove(1);
      for (const { ifaceName, address } of ifaces) {
        const opt = document.createElement('option');
        opt.value = address;
        opt.textContent = `${address} (${ifaceName})`;
        if (address === savedIp) opt.selected = true;
        ifaceSelect.appendChild(opt);
      }
      if (!savedIp) ifaceSelect.value = '';
    } catch (e) {}
  }

  // ── Master toggle ──
  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    _ctx.settingsState.setProp('remoteEnabled', enabled);
    _ctx.saveSettings();

    if (zones) zones.style.display = enabled ? '' : 'none';

    if (enabled) {
      await populateIfaceSelect();
      await refreshServerStatus();
      _startPinPolling();
    } else {
      _stopPinPolling();
    }
  });

  if (portInput) {
    portInput.addEventListener('change', () => {
      const port = parseInt(portInput.value) || 3712;
      _ctx.settingsState.setProp('remotePort', port);
      _ctx.saveSettings();
    });
  }

  if (ifaceSelect) {
    ifaceSelect.addEventListener('change', () => {
      const ip = ifaceSelect.value || null;
      _ctx.settingsState.setProp('remoteSelectedIp', ip);
      _ctx.saveSettings();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('spinning');
      await window.electron_api.remote.generatePin();
      await _loadAndShowPin();
      setTimeout(() => refreshBtn.classList.remove('spinning'), 400);
    });
  }

  const toggleServerBtn = document.getElementById('remote-toggle-server-btn');
  if (toggleServerBtn) {
    toggleServerBtn.addEventListener('click', async () => {
      toggleServerBtn.disabled = true;
      try {
        const info = await window.electron_api.remote.getServerInfo();
        if (info.running) {
          await window.electron_api.remote.stopServer();
        } else {
          await window.electron_api.remote.startServer();
        }
        await refreshServerStatus();
      } finally {
        toggleServerBtn.disabled = false;
      }
    });
  }

  if (_ctx.settingsState.get().remoteEnabled) {
    populateIfaceSelect();
    refreshServerStatus();
    _startPinPolling();
  }

  // Server status refresh every 10s
  const statusInterval = setInterval(() => {
    if (!document.getElementById('remote-enabled-toggle')) {
      clearInterval(statusInterval);
      _stopPinPolling();
      return;
    }
    if (_ctx.settingsState.get().remoteEnabled) refreshServerStatus();
  }, 10000);

  // ── Cloud Install copy ──
  const installCopyBtn = document.getElementById('cloud-install-copy');
  const installCmd = document.getElementById('cloud-install-cmd');
  if (installCopyBtn && installCmd) {
    installCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(installCmd.textContent).then(() => {
        installCopyBtn.classList.add('copied');
        setTimeout(() => installCopyBtn.classList.remove('copied'), 1500);
      });
    });
  }

  // ── Cloud Relay ──
  const cloudUrlInput = document.getElementById('cloud-server-url');
  const cloudKeyInput = document.getElementById('cloud-api-key');
  const cloudAutoToggle = document.getElementById('cloud-auto-connect');
  const cloudConnectBtn = document.getElementById('cloud-connect-btn');
  const cloudStatusIndicator = document.getElementById('cloud-status-indicator');
  const cloudStatusText = document.getElementById('cloud-status-text');
  const cloudKeyToggle = document.getElementById('cloud-key-toggle');

  // Key visibility toggle
  if (cloudKeyToggle && cloudKeyInput) {
    cloudKeyToggle.addEventListener('click', () => {
      const isPassword = cloudKeyInput.type === 'password';
      cloudKeyInput.type = isPassword ? 'text' : 'password';
      cloudKeyToggle.classList.toggle('revealed', isPassword);
    });
  }

  const cloudUserPanel = document.getElementById('rp-cloud-user-panel');
  let _cloudSessionsInterval = null;
  let _cloudSyncInterval = null;

  function updateCloudStatusUI(connected) {
    if (!cloudStatusIndicator || !cloudStatusText || !cloudConnectBtn) return;
    if (connected) {
      cloudStatusIndicator.classList.add('online');
      cloudStatusText.textContent = t('cloud.connected');
      cloudConnectBtn.textContent = t('cloud.disconnect');
      cloudConnectBtn.classList.add('rp-btn-danger');
      // Show user panel + load data
      if (cloudUserPanel) cloudUserPanel.style.display = '';
      _loadCloudUser();
      _loadCloudSessions();
      _startSessionsPolling();
      _checkCloudChanges();
      _startSyncPolling();
    } else {
      cloudStatusIndicator.classList.remove('online');
      cloudStatusText.textContent = t('cloud.disconnected');
      cloudConnectBtn.textContent = t('cloud.connect');
      cloudConnectBtn.classList.remove('rp-btn-danger');
      // Hide user panel
      if (cloudUserPanel) cloudUserPanel.style.display = 'none';
      _stopSessionsPolling();
      _stopSyncPolling();
      _updateSyncBadge(0);
    }
  }

  async function _loadCloudUser() {
    try {
      const user = await window.electron_api.cloud.getUser();
      const nameEl = document.getElementById('cloud-user-display-name');
      const badgeEl = document.getElementById('cloud-user-claude-badge');
      const gitNameInput = document.getElementById('cloud-user-git-name');
      const gitEmailInput = document.getElementById('cloud-user-git-email');
      if (nameEl) nameEl.textContent = user.name || '\u2014';
      if (badgeEl) {
        if (user.claudeAuthed) {
          badgeEl.textContent = t('cloud.userClaudeAuthed');
          badgeEl.className = 'rp-badge success';
        } else {
          badgeEl.textContent = t('cloud.userClaudeNotAuthed');
          badgeEl.className = 'rp-badge warning';
        }
      }
      if (gitNameInput) gitNameInput.value = user.gitName || '';
      if (gitEmailInput) gitEmailInput.value = user.gitEmail || '';
    } catch (e) {}
  }

  async function _loadCloudSessions() {
    const listEl = document.getElementById('cloud-sessions-list');
    if (!listEl) return;
    try {
      const { sessions } = await window.electron_api.cloud.getSessions();
      if (!sessions || sessions.length === 0) {
        listEl.innerHTML = `<div class="rp-cloud-sessions-empty">${t('cloud.sessionsEmpty')}</div>`;
        return;
      }
      listEl.innerHTML = sessions.map(s => {
        const statusClass = s.status === 'running' ? 'running' : s.status === 'error' ? 'error' : 'idle';
        const statusLabel = s.status === 'running' ? t('cloud.sessionRunning') : s.status === 'error' ? t('cloud.sessionError') : t('cloud.sessionIdle');
        const stopBtn = s.status === 'running'
          ? `<button class="rp-btn-sm rp-btn-danger rp-cloud-session-stop" data-id="${s.id}">${t('cloud.sessionStop')}</button>`
          : `<button class="rp-btn-sm rp-cloud-session-stop" data-id="${s.id}" title="Delete">\u2715</button>`;
        return `<div class="rp-cloud-session-item">
          <div class="rp-cloud-session-info">
            <span class="rp-cloud-session-project">${s.projectName}</span>
            <span class="rp-cloud-session-status ${statusClass}">${statusLabel}</span>
          </div>
          ${stopBtn}
        </div>`;
      }).join('');

      // Wire stop buttons
      listEl.querySelectorAll('.rp-cloud-session-stop').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await window.electron_api.cloud.stopSession({ sessionId: btn.dataset.id });
            await _loadCloudSessions();
          } catch (e) {
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      listEl.innerHTML = `<div class="rp-cloud-sessions-empty">${t('cloud.sessionsEmpty')}</div>`;
    }
  }

  function _startSessionsPolling() {
    _stopSessionsPolling();
    _cloudSessionsInterval = setInterval(() => {
      if (!document.getElementById('cloud-sessions-list')) { _stopSessionsPolling(); return; }
      _loadCloudSessions();
    }, 15000);
  }

  function _stopSessionsPolling() {
    if (_cloudSessionsInterval) { clearInterval(_cloudSessionsInterval); _cloudSessionsInterval = null; }
  }

  if (cloudUrlInput) {
    cloudUrlInput.addEventListener('change', () => {
      _ctx.settingsState.setProp('cloudServerUrl', cloudUrlInput.value.trim());
      _ctx.saveSettings();
    });
  }

  if (cloudKeyInput) {
    cloudKeyInput.addEventListener('change', () => {
      _ctx.settingsState.setProp('cloudApiKey', cloudKeyInput.value.trim());
      _ctx.saveSettings();
    });
  }

  if (cloudAutoToggle) {
    cloudAutoToggle.addEventListener('change', () => {
      _ctx.settingsState.setProp('cloudAutoConnect', cloudAutoToggle.checked);
      _ctx.saveSettings();
    });
  }

  if (cloudConnectBtn) {
    cloudConnectBtn.addEventListener('click', async () => {
      cloudConnectBtn.disabled = true;
      try {
        const status = await window.electron_api.cloud.status();
        if (status.connected) {
          await window.electron_api.cloud.disconnect();
          updateCloudStatusUI(false);
        } else {
          const url = cloudUrlInput?.value.trim();
          const key = cloudKeyInput?.value.trim();
          if (!url || !key) return;
          await window.electron_api.cloud.connect({ serverUrl: url, apiKey: key });
          cloudStatusText.textContent = t('cloud.connecting');
        }
      } finally {
        cloudConnectBtn.disabled = false;
      }
    });
  }

  // ── Cloud user profile save ──
  const cloudUserSaveBtn = document.getElementById('cloud-user-save-btn');
  const cloudUserSaveStatus = document.getElementById('cloud-user-save-status');
  if (cloudUserSaveBtn) {
    cloudUserSaveBtn.addEventListener('click', async () => {
      cloudUserSaveBtn.disabled = true;
      const gitName = document.getElementById('cloud-user-git-name')?.value.trim();
      const gitEmail = document.getElementById('cloud-user-git-email')?.value.trim();
      try {
        await window.electron_api.cloud.updateUser({ gitName, gitEmail });
        if (cloudUserSaveStatus) {
          cloudUserSaveStatus.textContent = t('cloud.userSaved');
          cloudUserSaveStatus.className = 'rp-cloud-user-save-status success';
          setTimeout(() => { cloudUserSaveStatus.textContent = ''; cloudUserSaveStatus.className = 'rp-cloud-user-save-status'; }, 2000);
        }
      } catch (e) {
        if (cloudUserSaveStatus) {
          cloudUserSaveStatus.textContent = t('cloud.userSaveError');
          cloudUserSaveStatus.className = 'rp-cloud-user-save-status error';
          setTimeout(() => { cloudUserSaveStatus.textContent = ''; cloudUserSaveStatus.className = 'rp-cloud-user-save-status'; }, 3000);
        }
      } finally {
        cloudUserSaveBtn.disabled = false;
      }
    });
  }

  // ── Cloud sessions refresh ──
  const cloudSessionsRefresh = document.getElementById('cloud-sessions-refresh');
  if (cloudSessionsRefresh) {
    cloudSessionsRefresh.addEventListener('click', async () => {
      cloudSessionsRefresh.classList.add('spinning');
      await _loadCloudSessions();
      setTimeout(() => cloudSessionsRefresh.classList.remove('spinning'), 400);
    });
  }

  // ── Cloud sync check ──
  const cloudSyncCheckBtn = document.getElementById('cloud-sync-check-btn');
  if (cloudSyncCheckBtn) {
    cloudSyncCheckBtn.addEventListener('click', async () => {
      cloudSyncCheckBtn.disabled = true;
      cloudSyncCheckBtn.classList.add('loading');
      try {
        await _checkCloudChanges();
      } finally {
        cloudSyncCheckBtn.disabled = false;
        cloudSyncCheckBtn.classList.remove('loading');
      }
    });
  }

  async function _checkCloudChanges() {
    const syncEmpty = document.getElementById('cloud-sync-empty');
    const syncList = document.getElementById('cloud-sync-list');
    if (!syncList) return;

    try {
      const result = await window.electron_api.cloud.checkPendingChanges();
      const changes = result.changes || [];

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
        const fileList = files.slice(0, 10).map(f => `<div class="rp-cloud-sync-file">${_escapeHtml(f)}</div>`).join('');
        const moreCount = files.length > 10 ? `<div class="rp-cloud-sync-more">+${files.length - 10} ${t('cloud.syncMoreFiles')}</div>` : '';
        return `<div class="rp-cloud-sync-project" data-project="${_escapeHtml(projectName)}">
          <div class="rp-cloud-sync-project-header">
            <span class="rp-cloud-sync-project-name">${_escapeHtml(projectName)}</span>
            <span class="rp-cloud-sync-count">${files.length} ${files.length === 1 ? 'file' : 'files'}</span>
            <button class="rp-btn-sm rp-cloud-sync-apply" data-project="${_escapeHtml(projectName)}">${t('cloud.syncApply')}</button>
          </div>
          <div class="rp-cloud-sync-files">${fileList}${moreCount}</div>
        </div>`;
      }).join('');

      _updateSyncBadge(totalFiles);

      // Wire apply buttons
      syncList.querySelectorAll('.rp-cloud-sync-apply').forEach(btn => {
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
            await window.electron_api.cloud.downloadChanges({ projectName: projName, localProjectPath: localProject.path });
            const Toast = require('../../ui/components/Toast');
            Toast.show(t('cloud.syncApplied'), 'success');
            await _checkCloudChanges(); // Refresh
          } catch (e) {
            const Toast = require('../../ui/components/Toast');
            Toast.show(t('cloud.syncError'), 'error');
            btn.disabled = false;
            btn.textContent = t('cloud.syncApply');
          }
        });
      });
    } catch (e) {
      if (syncEmpty) syncEmpty.style.display = '';
      syncList.style.display = 'none';
      _updateSyncBadge(0);
    }
  }

  function _updateSyncBadge(count) {
    const badge = document.getElementById('cloud-sync-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = String(count);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
    // Also update the Cloud mode tab badge
    const cloudTab = document.querySelector('.rp-mode-tab[data-mode="cloud"]');
    if (cloudTab) {
      let tabBadge = cloudTab.querySelector('.rp-tab-badge');
      if (count > 0) {
        if (!tabBadge) {
          tabBadge = document.createElement('span');
          tabBadge.className = 'rp-tab-badge';
          cloudTab.appendChild(tabBadge);
        }
        tabBadge.textContent = String(count);
      } else if (tabBadge) {
        tabBadge.remove();
      }
    }
  }

  function _startSyncPolling() {
    _stopSyncPolling();
    _cloudSyncInterval = setInterval(() => {
      if (!document.getElementById('cloud-sync-area')) { _stopSyncPolling(); return; }
      _checkCloudChanges();
    }, 30000); // Every 30s
  }

  function _stopSyncPolling() {
    if (_cloudSyncInterval) { clearInterval(_cloudSyncInterval); _cloudSyncInterval = null; }
  }

  function _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Listen for status changes from main process
  if (window.electron_api.cloud?.onStatusChanged) {
    window.electron_api.cloud.onStatusChanged((status) => {
      updateCloudStatusUI(status.connected);
    });
  }

  // Check initial cloud status
  window.electron_api.cloud.status().then(status => {
    updateCloudStatusUI(status.connected);
  }).catch(() => {});
}

async function _startPinPolling() {
  _stopPinPolling();
  await window.electron_api.remote.generatePin();
  _loadAndShowPin();
  _pinRefreshInterval = setInterval(() => {
    if (!document.getElementById('remote-pin-display')) { _stopPinPolling(); return; }
    _loadAndShowPin();
  }, 5000);
}

function _stopPinPolling() {
  if (_pinRefreshInterval) { clearInterval(_pinRefreshInterval); _pinRefreshInterval = null; }
}

async function _loadAndShowPin() {
  try {
    const result = await window.electron_api.remote.getPin();
    if (!result.success) return;
    if (!result.pin || Date.now() >= result.expiresAt) {
      await window.electron_api.remote.generatePin();
      const fresh = await window.electron_api.remote.getPin();
      if (fresh.success) _showPin(fresh.pin, fresh.expiresAt);
      return;
    }
    _showPin(result.pin, result.expiresAt);
  } catch (e) {}
}

function _showPin(pin, expiresAt) {
  const pinStr = String(pin).padStart(4, '0');
  ['pin-d0', 'pin-d1', 'pin-d2', 'pin-d3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = pinStr[i] || '-';
  });

  const countdown = document.getElementById('remote-pin-countdown');
  if (!countdown) return;
  const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  if (remaining <= 0) {
    countdown.textContent = t('remote.pinExpired');
    countdown.classList.add('expired');
  } else {
    countdown.textContent = t('remote.pinExpires', { seconds: remaining });
    countdown.classList.remove('expired');
  }
}

async function refreshServerStatus() {
  const indicator = document.getElementById('remote-status-indicator');
  const statusText = document.getElementById('remote-status-text');
  const toggleBtn = document.getElementById('remote-toggle-server-btn');
  const urlDisplay = document.getElementById('rp-server-url-display');
  const pairZone = document.getElementById('rp-pair-zone');
  if (!indicator || !statusText) return;
  try {
    const info = await window.electron_api.remote.getServerInfo();
    if (info.running) {
      indicator.classList.add('online');
      statusText.textContent = t('remote.serverRunning');
      if (toggleBtn) {
        toggleBtn.textContent = t('remote.stopServer');
        toggleBtn.classList.add('rp-btn-danger');
      }
      if (urlDisplay) urlDisplay.textContent = info.address || '';
      if (pairZone) pairZone.style.display = '';
      _renderQrCode(info.address);
    } else {
      indicator.classList.remove('online');
      statusText.textContent = t('remote.serverStopped');
      if (toggleBtn) {
        toggleBtn.textContent = t('remote.startServer');
        toggleBtn.classList.remove('rp-btn-danger');
      }
      if (urlDisplay) urlDisplay.textContent = '';
      if (pairZone) pairZone.style.display = 'none';
      _renderQrCode(null);
    }
  } catch (e) {
    statusText.textContent = t('remote.serverStopped');
    if (toggleBtn) {
      toggleBtn.textContent = t('remote.startServer');
      toggleBtn.classList.remove('rp-btn-danger');
    }
    if (urlDisplay) urlDisplay.textContent = '';
    if (pairZone) pairZone.style.display = 'none';
    _renderQrCode(null);
  }
}

let _lastQrUrl = null;
function _renderQrCode(url) {
  const canvas = document.getElementById('remote-qr-canvas');
  const urlEl = document.getElementById('remote-qr-url');
  if (!canvas) return;

  if (!url) {
    canvas.style.display = 'none';
    if (urlEl) urlEl.textContent = '';
    _lastQrUrl = null;
    return;
  }

  if (url === _lastQrUrl) return;
  _lastQrUrl = url;

  canvas.style.display = 'block';
  if (urlEl) urlEl.textContent = url;

  QRCode.toCanvas(canvas, url, {
    width: 150,
    margin: 2,
    color: { dark: '#e0e0e0', light: '#00000000' },
    errorCorrectionLevel: 'M',
  }).catch(() => {});
}

module.exports = { buildHtml, setupHandlers };
