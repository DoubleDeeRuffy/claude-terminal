/**
 * Cloud IPC Handlers
 * Bridge between renderer and CloudRelayClient for relay/cloud features.
 * Routes cloud relay messages through RemoteServer so cloud mobiles
 * get the same experience as local Wi-Fi clients.
 */

const { ipcMain } = require('electron');
const { cloudRelayClient } = require('../services/CloudRelayClient');
const remoteServer = require('../services/RemoteServer');

let mainWindow = null;

function registerCloudHandlers() {
  // Wire callbacks once (they just register listeners, not start anything)
  cloudRelayClient.onMessage((msg) => {
    remoteServer.handleCloudMessage(msg);
  });

  cloudRelayClient.onStatusChange((status) => {
    if (status.connected) {
      remoteServer.sendInitToCloud();
    }
    // Note: we do NOT call setCloudClient(null) here on disconnect because
    // CloudRelayClient auto-reconnects. Only explicit cloud:disconnect clears it.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cloud:status-changed', status);
    }
  });

  // Connect to cloud relay — inject client into RemoteServer on demand
  ipcMain.handle('cloud:connect', async (_event, { serverUrl, apiKey }) => {
    remoteServer.setCloudClient(cloudRelayClient);
    cloudRelayClient.connect(serverUrl, apiKey);
    return { ok: true };
  });

  // Disconnect from cloud relay
  ipcMain.handle('cloud:disconnect', async () => {
    cloudRelayClient.disconnect();
    remoteServer.setCloudClient(null);
    return { ok: true };
  });

  // Get connection status
  ipcMain.handle('cloud:status', async () => {
    return cloudRelayClient.getStatus();
  });

  // Send message through relay (direct, bypasses RemoteServer)
  ipcMain.on('cloud:send', (_event, data) => {
    cloudRelayClient.send(data);
  });
}

function setCloudMainWindow(win) {
  mainWindow = win;
}

module.exports = { registerCloudHandlers, setCloudMainWindow };
