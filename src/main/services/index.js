/**
 * Main Process Services - Central Export
 */

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
