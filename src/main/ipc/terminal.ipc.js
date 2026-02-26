/**
 * Terminal IPC Handlers
 * Handles terminal-related IPC communication
 */

const { ipcMain } = require('electron');
const terminalService = require('../services/TerminalService');
const { setCtrlTabEnabled } = require('../windows/MainWindow');

/**
 * Register terminal IPC handlers
 */
function registerTerminalHandlers() {
  // Create terminal
  ipcMain.handle('terminal-create', (event, { cwd, runClaude, skipPermissions, resumeSessionId }) => {
    try {
      return terminalService.create({ cwd, runClaude, skipPermissions, resumeSessionId });
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

  // Enable/disable Ctrl+Tab terminal tab switching in main window
  ipcMain.handle('terminal:setCtrlTabEnabled', (event, enabled) => {
    setCtrlTabEnabled(enabled);
  });

  // Enable/disable Ctrl+Left/Right word-jump mode (vs tab-switch) in main window
  ipcMain.handle('terminal:setCtrlArrowWordJumpEnabled', (event, enabled) => {
    const { setCtrlArrowWordJumpEnabled } = require('../windows/MainWindow');
    setCtrlArrowWordJumpEnabled(enabled);
  });
}

module.exports = { registerTerminalHandlers };
