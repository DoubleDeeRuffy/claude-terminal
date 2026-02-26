/**
 * Telemetry IPC Handlers
 */

const { ipcMain } = require('electron');
const telemetryService = require('../services/TelemetryService');

function registerTelemetryHandlers() {
  ipcMain.handle('telemetry:get-status', () => {
    return telemetryService.getStatus();
  });

  ipcMain.handle('telemetry:send-event', (_event, { eventType, metadata }) => {
    telemetryService.sendPing(eventType, metadata);
    return { success: true };
  });

  ipcMain.handle('telemetry:send-feature', (_event, { feature, metadata }) => {
    telemetryService.sendFeaturePing(feature, metadata);
    return { success: true };
  });
}

module.exports = { registerTelemetryHandlers };
