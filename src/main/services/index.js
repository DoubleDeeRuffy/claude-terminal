/**
 * Main Process Services - Central Export
 */

const fs = require('fs');
const path = require('path');
const terminalService = require('./TerminalService');
const mcpService = require('./McpService');
const fivemService = require('./FivemService');
const webAppService = require('../../project-types/webapp/main/WebAppService');
const apiService = require('../../project-types/api/main/ApiService');
const updaterService = require('./UpdaterService');
const chatService = require('./ChatService');
const hooksService = require('./HooksService');
const hookEventServer = require('./HookEventServer');
const minecraftService = require('../../project-types/minecraft/main/MinecraftService');
const remoteServer = require('./RemoteServer');
const workflowService = require('./WorkflowService');
const databaseService = require('./DatabaseService');

/**
 * Initialize all services with main window reference
 * @param {BrowserWindow} mainWindow
 */
function initializeServices(mainWindow) {
  terminalService.setMainWindow(mainWindow);
  mcpService.setMainWindow(mainWindow);
  fivemService.setMainWindow(mainWindow);
  webAppService.setMainWindow(mainWindow);
  apiService.setMainWindow(mainWindow);
  updaterService.setMainWindow(mainWindow);
  chatService.setMainWindow(mainWindow);
  hookEventServer.setMainWindow(mainWindow);
  minecraftService.setMainWindow(mainWindow);
  remoteServer.setMainWindow(mainWindow); // auto-starts if remoteEnabled

  // Workflow service: inject deps + init scheduler
  workflowService.setMainWindow(mainWindow);
  workflowService.setDeps({ chatService });
  workflowService.init();

  // Provision unified MCP in global Claude settings
  databaseService.provisionGlobalMcp().catch(() => {});

  // Poll for quick action triggers from MCP
  _startQuickActionPoll(mainWindow);
}

let _qaPollTimer = null;

function _startQuickActionPoll(mainWindow) {
  const triggersDir = path.join(require('os').homedir(), '.claude-terminal', 'quickactions', 'triggers');
  _qaPollTimer = setInterval(() => {
    try {
      if (!fs.existsSync(triggersDir)) return;
      const files = fs.readdirSync(triggersDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(triggersDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          fs.unlinkSync(filePath);

          if (data.projectId && data.command) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('quickaction:run', data);
              console.log(`[Services] MCP quick action: ${data.actionName} on ${data.projectId}`);
            }
          }
        } catch (e) {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
      }
    } catch (_) {}
  }, 2000);
}

/**
 * Cleanup all services before quit
 */
function cleanupServices() {
  terminalService.killAll();
  mcpService.stopAll();
  fivemService.stopAll();
  webAppService.stopAll();
  apiService.stopAll();
  minecraftService.stopAll();
  chatService.closeAll();
  hookEventServer.stop();
  remoteServer.stop();
  workflowService.destroy();
  if (_qaPollTimer) clearInterval(_qaPollTimer);
}

module.exports = {
  terminalService,
  mcpService,
  fivemService,
  webAppService,
  apiService,
  updaterService,
  chatService,
  hooksService,
  hookEventServer,
  minecraftService,
  remoteServer,
  workflowService,
  initializeServices,
  cleanupServices
};
