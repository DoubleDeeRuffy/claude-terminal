/**
 * RemotePanel
 * Settings UI for the Remote Control feature (mobile PWA, PIN auth).
 */

const { t } = require('../../i18n');
const QRCode = require('qrcode');

let _ctx = null;
let _pinRefreshInterval = null;

function buildHtml(settings) {
  const remoteEnabled = settings.remoteEnabled || false;
  const remotePort = settings.remotePort || 3712;

  return `
    <div class="settings-group">
      <div class="settings-group-title">${t('remote.sectionGeneral')}</div>
      <div class="settings-card">
        <div class="settings-toggle-row">
          <div class="settings-toggle-label">
            <div>${t('remote.enable')}</div>
            <div class="settings-toggle-desc">${t('remote.enableDesc')}</div>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="remote-enabled-toggle" ${remoteEnabled ? 'checked' : ''}>
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row" id="remote-port-row" style="${remoteEnabled ? '' : 'display:none'}">
          <div class="settings-label">
            <div>${t('remote.port')}</div>
            <div class="settings-desc">${t('remote.portDesc')}</div>
          </div>
          <input type="number" id="remote-port-input" class="remote-port-input" value="${remotePort}" min="1024" max="65535">
        </div>
        <div class="settings-row" id="remote-iface-row" style="${remoteEnabled ? '' : 'display:none'}">
          <div class="settings-label">
            <div>${t('remote.networkInterface')}</div>
            <div class="settings-desc">${t('remote.networkInterfaceDesc')}</div>
          </div>
          <select id="remote-iface-select" class="remote-iface-select">
            <option value="">${t('remote.networkInterfaceAuto')}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="settings-group" id="remote-server-group" style="${remoteEnabled ? '' : 'display:none'}">
      <div class="settings-group-title">${t('remote.sectionStatus')}</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-label">
            <div>${t('remote.serverStatus')}</div>
          </div>
          <div class="remote-status-row">
            <span class="remote-status-badge" id="remote-status-badge">
              <span class="remote-status-dot"></span>
              <span id="remote-status-text">${t('remote.serverStopped')}</span>
            </span>
            <button class="btn-sm btn-primary" id="remote-toggle-server-btn">${t('remote.startServer')}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-group" id="remote-qr-group" style="${remoteEnabled ? '' : 'display:none'}">
      <div class="settings-group-title">${t('remote.sectionQrCode') || 'QR Code'}</div>
      <div class="settings-card">
        <div class="remote-qr-block">
          <canvas id="remote-qr-canvas"></canvas>
          <div class="remote-qr-url" id="remote-qr-url"></div>
          <div class="remote-qr-hint">${t('remote.qrHint') || 'Scan with your phone to connect'}</div>
        </div>
      </div>
    </div>

    <div class="settings-group" id="remote-pin-group" style="${remoteEnabled ? '' : 'display:none'}">
      <div class="settings-group-title">${t('remote.sectionPin')}</div>
      <div class="settings-card">
        <div class="remote-pin-block">
          <div class="remote-pin-label">${t('remote.pinLabel')}</div>
          <div class="remote-pin-display" id="remote-pin-display">
            <span class="remote-pin-digit" id="pin-d0">-</span>
            <span class="remote-pin-digit" id="pin-d1">-</span>
            <span class="remote-pin-sep">·</span>
            <span class="remote-pin-digit" id="pin-d2">-</span>
            <span class="remote-pin-digit" id="pin-d3">-</span>
          </div>
          <div class="remote-pin-countdown" id="remote-pin-countdown"></div>
          <div class="remote-pin-hint">${t('remote.pinHint')}</div>
          <button class="btn-sm btn-secondary" id="remote-pin-refresh-btn">${t('remote.pinRefresh')}</button>
        </div>
      </div>
    </div>

  `;
}


function setupHandlers(context) {
  _ctx = context;

  const toggle = document.getElementById('remote-enabled-toggle');
  const portInput = document.getElementById('remote-port-input');
  const portRow = document.getElementById('remote-port-row');
  const ifaceRow = document.getElementById('remote-iface-row');
  const ifaceSelect = document.getElementById('remote-iface-select');
  const serverGroup = document.getElementById('remote-server-group');
  const qrGroup = document.getElementById('remote-qr-group');
  const pinGroup = document.getElementById('remote-pin-group');
  const refreshBtn = document.getElementById('remote-pin-refresh-btn');

  if (!toggle) return;

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

  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    _ctx.settingsState.setProp('remoteEnabled', enabled);
    _ctx.saveSettings();

    portRow.style.display = enabled ? '' : 'none';
    ifaceRow.style.display = enabled ? '' : 'none';
    serverGroup.style.display = enabled ? '' : 'none';
    if (qrGroup) qrGroup.style.display = enabled ? '' : 'none';
    pinGroup.style.display = enabled ? '' : 'none';

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
      await window.electron_api.remote.generatePin();
      await _loadAndShowPin();
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
}

async function _startPinPolling() {
  _stopPinPolling();
  // Generate a fresh PIN when the panel becomes visible
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
    // If PIN expired or was used (and replaced), auto-refresh display
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
  const badge = document.getElementById('remote-status-badge');
  const statusText = document.getElementById('remote-status-text');
  const toggleBtn = document.getElementById('remote-toggle-server-btn');
  if (!badge || !statusText) return;
  try {
    const info = await window.electron_api.remote.getServerInfo();
    if (info.running) {
      badge.classList.add('running');
      badge.classList.remove('stopped');
      statusText.textContent = info.address || t('remote.serverRunning');
      if (toggleBtn) toggleBtn.textContent = t('remote.stopServer');
      _renderQrCode(info.address);
    } else {
      badge.classList.remove('running');
      badge.classList.add('stopped');
      statusText.textContent = t('remote.serverStopped');
      if (toggleBtn) toggleBtn.textContent = t('remote.startServer');
      _renderQrCode(null);
    }
  } catch (e) {
    statusText.textContent = t('remote.serverStopped');
    if (toggleBtn) toggleBtn.textContent = t('remote.startServer');
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
    width: 180,
    margin: 2,
    color: { dark: '#e0e0e0', light: '#00000000' },
    errorCorrectionLevel: 'M',
  }).catch(() => {});
}

module.exports = { buildHtml, setupHandlers };
