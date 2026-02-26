/**
 * Cloud IPC Handlers
 * Bridge between renderer and CloudRelayClient for relay/cloud features.
 * Routes cloud relay messages through RemoteServer so cloud mobiles
 * get the same experience as local Wi-Fi clients.
 */

const { ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { cloudRelayClient } = require('../services/CloudRelayClient');
const remoteServer = require('../services/RemoteServer');
const { zipProject } = require('../utils/zipProject');
const { settingsFile } = require('../utils/paths');

let mainWindow = null;

function _loadSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function _getCloudConfig() {
  const settings = _loadSettings();
  const url = settings.cloudServerUrl;
  const key = settings.cloudApiKey;
  if (!url || !key) throw new Error('Cloud not configured');
  return { url: url.replace(/\/$/, ''), key };
}

function registerCloudHandlers() {
  // Wire callbacks once (they just register listeners, not start anything)
  cloudRelayClient.onMessage((msg) => {
    remoteServer.handleCloudMessage(msg);
  });

  cloudRelayClient.onStatusChange((status) => {
    if (status.connected) {
      remoteServer.sendInitToCloud();
      // Check for pending changes from headless sessions
      setImmediate(() => _checkPendingChangesOnReconnect());
    }
    // Note: we do NOT call setCloudClient(null) here on disconnect because
    // CloudRelayClient auto-reconnects. Only explicit cloud:disconnect clears it.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cloud:status-changed', status);
    }
  });

  // ── Relay connect/disconnect ──

  ipcMain.handle('cloud:connect', async (_event, { serverUrl, apiKey }) => {
    if (remoteServer.getServerInfo().running) {
      remoteServer.stop();
    }
    remoteServer.setCloudClient(cloudRelayClient);
    cloudRelayClient.connect(serverUrl, apiKey);
    return { ok: true };
  });

  ipcMain.handle('cloud:disconnect', async () => {
    cloudRelayClient.disconnect();
    remoteServer.setCloudClient(null);
    return { ok: true };
  });

  ipcMain.handle('cloud:status', async () => {
    return cloudRelayClient.getStatus();
  });

  ipcMain.on('cloud:send', (_event, data) => {
    cloudRelayClient.send(data);
  });

  // ── Project upload ──

  ipcMain.handle('cloud:upload-project', async (_event, { projectName, projectPath }) => {
    const { url, key } = _getCloudConfig();

    const zipPath = path.join(os.tmpdir(), `ct-upload-${Date.now()}.zip`);

    try {
      // Zip the project
      await zipProject(projectPath, zipPath, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cloud:upload-progress', progress);
        }
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloud:upload-progress', { phase: 'uploading', percent: 90 });
      }

      // Upload via multipart POST
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('name', projectName);
      formData.append('zip', fs.createReadStream(zipPath), { filename: `${projectName}.zip`, contentType: 'application/zip' });

      const http = url.startsWith('https') ? require('https') : require('http');
      const urlObj = new URL(`${url}/api/projects`);

      const result = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${key}`,
          },
        }, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(body));
            } else {
              let message;
              if (res.statusCode === 413) {
                const sizeMB = Math.round(fs.statSync(zipPath).size / 1024 / 1024);
                message = `Project too large (${sizeMB} MB). Increase server upload limit (nginx client_max_body_size).`;
              } else {
                // Try to extract text from HTML responses
                const textMatch = body.match(/<title>(.+?)<\/title>/i) || body.match(/<h1>(.+?)<\/h1>/i);
                message = textMatch ? `${res.statusCode} ${textMatch[1]}` : `HTTP ${res.statusCode}: ${body.substring(0, 200)}`;
              }
              reject(new Error(message));
            }
          });
        });
        req.on('error', reject);
        formData.pipe(req);
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloud:upload-progress', { phase: 'done', percent: 100 });
      }

      return { success: true, ...result };
    } finally {
      await fs.promises.unlink(zipPath).catch(() => {});
    }
  });

  // ── Cloud projects list ──

  ipcMain.handle('cloud:get-projects', async () => {
    const { url, key } = _getCloudConfig();
    const resp = await fetch(`${url}/api/projects`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json();
  });

  // ── Check pending changes from headless sessions ──

  ipcMain.handle('cloud:check-pending-changes', async () => {
    try {
      const { url, key } = _getCloudConfig();
      const headers = { 'Authorization': `Bearer ${key}` };

      const projectsResp = await fetch(`${url}/api/projects`, { headers });
      if (!projectsResp.ok) return { changes: [] };
      const { projects } = await projectsResp.json();

      const allChanges = [];
      for (const project of projects) {
        const changesResp = await fetch(`${url}/api/projects/${encodeURIComponent(project.name)}/changes`, { headers });
        if (!changesResp.ok) continue;
        const { changes } = await changesResp.json();
        if (changes.length > 0) {
          allChanges.push({ projectName: project.name, changes });
        }
      }
      return { changes: allChanges };
    } catch {
      return { changes: [] };
    }
  });

  // ── Download and apply changes ──

  ipcMain.handle('cloud:download-changes', async (_event, { projectName, localProjectPath }) => {
    const { url, key } = _getCloudConfig();
    const headers = { 'Authorization': `Bearer ${key}` };

    // Download changes zip
    const resp = await fetch(`${url}/api/projects/${encodeURIComponent(projectName)}/changes/download`, { headers });
    if (!resp.ok) throw new Error('Failed to download changes');

    const zipPath = path.join(os.tmpdir(), `ct-sync-${Date.now()}.zip`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    await fs.promises.writeFile(zipPath, buffer);

    // Extract to project dir (overwrite existing files)
    const extractZip = require('extract-zip');
    await extractZip(zipPath, { dir: localProjectPath });

    // Handle .DELETED markers
    await _handleDeletedMarkers(localProjectPath);

    // Acknowledge sync
    await fetch(`${url}/api/projects/${encodeURIComponent(projectName)}/changes/ack`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

    await fs.promises.unlink(zipPath).catch(() => {});
    return { success: true };
  });

  // ── Takeover a running cloud session ──

  ipcMain.handle('cloud:takeover-session', async (_event, { sessionId, projectName, localProjectPath }) => {
    const { url, key } = _getCloudConfig();
    const headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };

    // Interrupt the cloud session
    await fetch(`${url}/api/sessions/${encodeURIComponent(sessionId)}/interrupt`, {
      method: 'POST', headers,
    });

    // Download any file changes
    try {
      const changesResp = await fetch(`${url}/api/projects/${encodeURIComponent(projectName)}/changes`, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      const { changes } = await changesResp.json();

      if (changes && changes.length > 0 && localProjectPath) {
        const resp = await fetch(`${url}/api/projects/${encodeURIComponent(projectName)}/changes/download`, {
          headers: { 'Authorization': `Bearer ${key}` },
        });
        if (resp.ok) {
          const zipPath = path.join(os.tmpdir(), `ct-takeover-${Date.now()}.zip`);
          const buffer = Buffer.from(await resp.arrayBuffer());
          await fs.promises.writeFile(zipPath, buffer);

          const extractZip = require('extract-zip');
          await extractZip(zipPath, { dir: localProjectPath });
          await _handleDeletedMarkers(localProjectPath);
          await fs.promises.unlink(zipPath).catch(() => {});

          await fetch(`${url}/api/projects/${encodeURIComponent(projectName)}/changes/ack`, {
            method: 'POST', headers,
          });
        }
      }
    } catch (err) {
      console.warn('[Cloud] Failed to sync changes during takeover:', err.message);
    }

    // Close the cloud session
    await fetch(`${url}/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE', headers,
    });

    return { success: true };
  });
}

// ── Helpers ──

async function _handleDeletedMarkers(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.DELETED')) {
      const markerPath = path.join(entry.parentPath || entry.path, entry.name);
      const originalPath = markerPath.replace(/\.DELETED$/, '');
      await fs.promises.unlink(originalPath).catch(() => {});
      await fs.promises.unlink(markerPath).catch(() => {});
    }
  }
}

async function _checkPendingChangesOnReconnect() {
  try {
    const { url, key } = _getCloudConfig();
    const headers = { 'Authorization': `Bearer ${key}` };

    // Check for active headless sessions
    const sessionsResp = await fetch(`${url}/api/sessions`, { headers });
    if (sessionsResp.ok) {
      const { sessions } = await sessionsResp.json();
      const activeSessions = sessions.filter(s => s.status === 'running');
      if (activeSessions.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloud:headless-active', { sessions: activeSessions });
      }
    }

    // Check for pending file changes
    const projectsResp = await fetch(`${url}/api/projects`, { headers });
    if (projectsResp.ok) {
      const { projects } = await projectsResp.json();
      const allChanges = [];
      for (const project of projects) {
        const changesResp = await fetch(`${url}/api/projects/${encodeURIComponent(project.name)}/changes`, { headers });
        if (!changesResp.ok) continue;
        const { changes } = await changesResp.json();
        if (changes.length > 0) {
          allChanges.push({ projectName: project.name, changes });
        }
      }
      if (allChanges.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloud:pending-changes', { changes: allChanges });
      }
    }
  } catch (err) {
    console.warn('[Cloud] Failed to check pending changes on reconnect:', err.message);
  }
}

function setCloudMainWindow(win) {
  mainWindow = win;
}

module.exports = { registerCloudHandlers, setCloudMainWindow };
