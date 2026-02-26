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
  // Inject cloud client into RemoteServer for bidirectional bridging
  remoteServer.setCloudClient(cloudRelayClient);

  // Route cloud relay messages → RemoteServer message handler
  // (mobile → cloud relay → desktop → RemoteServer._handleClientMessage)
  cloudRelayClient.onMessage((msg) => {
    remoteServer.handleCloudMessage(msg);
  });

  // On cloud connect/disconnect, send init data + notify renderer UI
  cloudRelayClient.onStatusChange((status) => {
    if (status.connected) {
      remoteServer.sendInitToCloud();
    }
    // Forward to renderer for Remote Panel UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cloud:status-changed', status);
    }
  });

  // Connect to cloud relay
  ipcMain.handle('cloud:connect', async (_event, { serverUrl, apiKey }) => {
    cloudRelayClient.connect(serverUrl, apiKey);
    return { ok: true };
  });

  // Disconnect from cloud relay
  ipcMain.handle('cloud:disconnect', async () => {
    cloudRelayClient.disconnect();
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
