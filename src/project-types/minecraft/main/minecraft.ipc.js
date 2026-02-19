/**
 * Minecraft IPC Handlers
 * Handles Minecraft server-related IPC communication
 */

const { ipcMain } = require('electron');
const minecraftService = require('./MinecraftService');

/**
 * Register Minecraft IPC handlers
 */
function registerHandlers() {
  // Start Minecraft server
  ipcMain.handle('minecraft-start', async (event, { projectIndex, projectPath, minecraftConfig }) => {
    return minecraftService.start({ projectIndex, projectPath, minecraftConfig });
  });

  // Stop Minecraft server
  ipcMain.handle('minecraft-stop', async (event, { projectIndex }) => {
    return minecraftService.stop({ projectIndex });
  });

  // Send input to Minecraft server console
  ipcMain.on('minecraft-input', (event, { projectIndex, data }) => {
    minecraftService.write(projectIndex, data);
  });

  // Resize Minecraft terminal
  ipcMain.on('minecraft-resize', (event, { projectIndex, cols, rows }) => {
    minecraftService.resize(projectIndex, cols, rows);
  });

  // Detect server setup from project directory
  ipcMain.handle('minecraft-detect', async (event, { projectPath }) => {
    const detected = minecraftService.detectServerSetup(projectPath);
    return { success: true, detected };
  });

  // Check server status
  ipcMain.handle('minecraft-get-status', async (event, { projectIndex }) => {
    return {
      isRunning: minecraftService.isRunning(projectIndex),
      playerCount: minecraftService.getPlayerCount(projectIndex)
    };
  });
}

module.exports = { registerHandlers, registerMinecraftHandlers: registerHandlers };
