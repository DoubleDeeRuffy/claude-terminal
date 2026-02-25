/**
 * Cloud IPC Handlers
 * Bridge between renderer and CloudRelayClient for relay/cloud features.
 */

const { ipcMain } = require('electron');
const { cloudRelayClient } = require('../services/CloudRelayClient');

let mainWindow = null;

function registerCloudHandlers() {
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

  // Send message through relay
  ipcMain.on('cloud:send', (_event, data) => {
    cloudRelayClient.send(data);
  });

  // Forward relay messages to renderer
  cloudRelayClient.onMessage((msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cloud:message', msg);
    }
  });

  // Forward status changes to renderer
  cloudRelayClient.onStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cloud:status-changed', status);
    }
  });
}

function setCloudMainWindow(win) {
  mainWindow = win;
}

module.exports = { registerCloudHandlers, setCloudMainWindow };
