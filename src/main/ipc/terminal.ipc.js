/**
 * Terminal IPC Handlers
 * Handles terminal-related IPC communication
 */

const { ipcMain } = require('electron');
const terminalService = require('../services/TerminalService');
const { sendFeaturePing } = require('../services/TelemetryService');
const { setCtrlTabEnabled } = require('../windows/MainWindow');

/**
 * Register terminal IPC handlers
 */
function registerTerminalHandlers() {
  // Create terminal
  ipcMain.handle('terminal-create', (event, { cwd, runClaude, skipPermissions, resumeSessionId, cliTool }) => {
    try {
      sendFeaturePing('terminal:create');
      return terminalService.create({ cwd, runClaude, skipPermissions, resumeSessionId, cliTool });
    } catch (error) {
      console.error('[Terminal IPC] Create error:', error);
      return { success: false, error: error.message };
    }
  });

  // Terminal input
  ipcMain.on('terminal-input', (event, { id, data }) => {
    terminalService.write(id, data);
  });

  // Terminal resize
  ipcMain.on('terminal-resize', (event, { id, cols, rows }) => {
    terminalService.resize(id, cols, rows);
  });

  // Kill terminal
  ipcMain.on('terminal-kill', (event, { id }) => {
    terminalService.kill(id);
  });

  // Toggle Ctrl+Tab terminal switching
  ipcMain.on('set-ctrl-tab-enabled', (_, enabled) => {
    setCtrlTabEnabled(enabled);
  });
}

module.exports = { registerTerminalHandlers };
