/**
 * Setup Wizard Window Manager
 * Manages the first-launch setup wizard window
 */

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { settingsFile, ensureDataDir, dataDir } = require('../utils/paths');

let setupWizardWindow = null;

/**
 * Create the setup wizard window
 * @param {Object} options
 * @param {Function} options.onComplete - Called when wizard completes with settings
 * @param {Function} options.onSkip - Called when wizard is skipped
 * @returns {BrowserWindow}
 */
function createSetupWizardWindow({ onComplete, onSkip }) {
  if (setupWizardWindow) {
    setupWizardWindow.show();
    setupWizardWindow.focus();
    return setupWizardWindow;
  }

  setupWizardWindow = new BrowserWindow({
    width: 900,
    height: 650,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '..', 'preload.js')
    }
  });

  const htmlPath = path.join(__dirname, '..', '..', '..', 'setup-wizard.html');
  setupWizardWindow.loadFile(htmlPath);

  setupWizardWindow.once('ready-to-show', () => {
    setupWizardWindow.show();
    setupWizardWindow.focus();
  });

  setupWizardWindow.on('closed', () => {
    setupWizardWindow = null;
  });

  // Register IPC handlers for this wizard session
  registerSetupHandlers(onComplete, onSkip);

  return setupWizardWindow;
}

/**
 * Register IPC handlers for the setup wizard
 */
function registerSetupHandlers(onComplete, onSkip) {
  // Handle wizard completion with settings
  const completeHandler = async (event, settings) => {
    saveSetupSettings(settings);

    // Install hooks if user opted in
    if (settings.hooksEnabled) {
      try {
        const HooksService = require('../services/HooksService');
        await HooksService.installHooks();
      } catch (e) {
        console.error('Failed to install hooks:', e);
      }
    }

    closeSetupWizard();
    if (onComplete) onComplete(settings);
    return { success: true };
  };

  // Handle wizard skip
  const skipHandler = () => {
    // Mark setup as completed even when skipped
    saveSetupSettings({ setupCompleted: true });
    closeSetupWizard();
    if (onSkip) onSkip();
  };

  // Remove previous handlers if any
  ipcMain.removeHandler('setup-wizard-complete');
  ipcMain.removeAllListeners('setup-wizard-skip');

  ipcMain.handle('setup-wizard-complete', completeHandler);
  ipcMain.on('setup-wizard-skip', skipHandler);
}

/**
 * Save wizard settings to settings.json
 * @param {Object} wizardSettings
 */
function saveSetupSettings(wizardSettings) {
  ensureDataDir();

  let existing = {};
  try {
    if (fs.existsSync(settingsFile)) {
      existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch (e) {
    // Ignore read errors
  }

  const merged = {
    ...existing,
    ...wizardSettings,
    setupCompleted: true
  };

  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2));
}

/**
 * Close the setup wizard window
 */
function closeSetupWizard() {
  if (setupWizardWindow && !setupWizardWindow.isDestroyed()) {
    setupWizardWindow.close();
  }
  setupWizardWindow = null;
}

/**
 * Apply default settings for silent installs (hooks ON, startup OFF, wizard skipped)
 */
function applySilentInstallDefaults() {
  ensureDataDir();
  const defaults = {
    setupCompleted: true,
    hooksEnabled: true,
    launchAtStartup: false
  };

  let existing = {};
  try {
    if (fs.existsSync(settingsFile)) {
      existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch (e) { /* ignore corrupt settings */ }

  // Only apply if not already set up (safety guard)
  if (!existing.setupCompleted) {
    fs.writeFileSync(settingsFile, JSON.stringify({ ...existing, ...defaults }, null, 2));
  }

  // Fire-and-forget hook installation (async, but we don't block on it)
  try {
    const HooksService = require('../services/HooksService');
    HooksService.installHooks().catch(e => {
      console.error('Failed to install hooks after silent install:', e);
    });
  } catch (e) {
    console.error('Failed to load HooksService after silent install:', e);
  }
}

/**
 * Check if this is the first launch (setup not completed)
 * @returns {boolean}
 */
function isFirstLaunch() {
  try {
    // Check for silent install marker first
    const silentMarker = path.join(dataDir, '.silent-install');
    if (fs.existsSync(silentMarker)) {
      applySilentInstallDefaults();
      try { fs.unlinkSync(silentMarker); } catch (e) { /* ignore */ }
      return false; // Skip wizard
    }

    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      return !settings.setupCompleted;
    }
  } catch (e) {
    // If we can't read settings, treat as first launch
  }
  return true;
}

/**
 * Get the setup wizard window instance
 * @returns {BrowserWindow|null}
 */
function getSetupWizardWindow() {
  return setupWizardWindow;
}

module.exports = {
  createSetupWizardWindow,
  closeSetupWizard,
  isFirstLaunch,
  getSetupWizardWindow
};
