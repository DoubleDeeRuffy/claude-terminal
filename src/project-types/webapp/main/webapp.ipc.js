/**
 * Web App IPC Handlers
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const webAppService = require('./WebAppService');

let _axeSourceCache = null;

function registerHandlers() {
  ipcMain.handle('webapp-get-axe-source', async () => {
    if (_axeSourceCache) return _axeSourceCache;
    const candidates = [
      path.join(process.resourcesPath, 'scripts', 'axe-core.min.js'),
      path.join(__dirname, '..', '..', '..', '..', 'resources', 'scripts', 'axe-core.min.js')
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          _axeSourceCache = fs.readFileSync(p, 'utf8');
          return _axeSourceCache;
        }
      } catch (e) { /* skip */ }
    }
    return null;
  });

  ipcMain.handle('webapp-start', async (event, { projectIndex, projectPath, devCommand }) => {
    return webAppService.start({ projectIndex, projectPath, devCommand });
  });

  ipcMain.handle('webapp-stop', async (event, { projectIndex }) => {
    return webAppService.stop({ projectIndex });
  });

  ipcMain.on('webapp-input', (event, { projectIndex, data }) => {
    webAppService.write(projectIndex, data);
  });

  ipcMain.on('webapp-resize', (event, { projectIndex, cols, rows }) => {
    webAppService.resize(projectIndex, cols, rows);
  });

  ipcMain.handle('webapp-detect-framework', async (event, { projectPath }) => {
    return webAppService.detectFramework(projectPath);
  });

  ipcMain.handle('webapp-get-port', async (event, { projectIndex }) => {
    return webAppService.getDetectedPort(projectIndex);
  });
}

module.exports = { registerHandlers, registerWebAppHandlers: registerHandlers };
