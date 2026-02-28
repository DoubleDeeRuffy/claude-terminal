/**
 * Telemetry IPC Handlers
 */

const { ipcMain } = require('electron');
const telemetryService = require('../services/TelemetryService');

function registerTelemetryHandlers() {
  ipcMain.handle('telemetry:get-status', () => {
    return telemetryService.getStatus();
  });
}

module.exports = { registerTelemetryHandlers };
