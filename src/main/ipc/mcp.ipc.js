/**
 * MCP IPC Handlers
 * Handles MCP-related IPC communication
 */

const { ipcMain } = require('electron');
const mcpService = require('../services/McpService');
const { sendFeaturePing } = require('../services/TelemetryService');

/**
 * Register MCP IPC handlers
 */
function registerMcpHandlers() {
  // Start MCP process
  ipcMain.handle('mcp-start', async (event, { id, command, args, env }) => {
    sendFeaturePing('mcp:start');
    return mcpService.start({ id, command, args, env });
  });

  // Stop MCP process
  ipcMain.handle('mcp-stop', async (event, { id }) => {
    sendFeaturePing('mcp:stop');
    return mcpService.stop({ id });
  });
}

module.exports = { registerMcpHandlers };
