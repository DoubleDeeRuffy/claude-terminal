/**
 * Updater Service
 * Manages application auto-updates
 */

const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { settingsFile } = require('../utils/paths');

const CHECK_INTERVALS = {
  '30min': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  'startup': null,
  'manual': null
};

class UpdaterService {
  constructor() {
    this.mainWindow = null;
    this.isInitialized = false;
    this.checkInterval = null;
    this.lastKnownVersion = null;
    this.isDownloading = false;
    this.installAfterDownload = false;
  }

  /**
   * Set the main window reference for IPC communication
   * @param {BrowserWindow} window
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }

  /**
   * Safely send IPC message to main window
   */
  safeSend(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Clear stale updater cache if the app version already matches or exceeds the pending update.
   * Prevents old cached downloads from blocking detection of newer versions.
   */
  clearStalePendingCache() {
    try {
      const cacheDir = path.join(app.getPath('userData'), '..', 'claude-terminal-updater', 'pending');
      const infoPath = path.join(cacheDir, 'update-info.json');

      if (!fs.existsSync(infoPath)) return;

      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      const cachedFileName = info.fileName || '';
      const versionMatch = cachedFileName.match(/(\d+\.\d+\.\d+)/);
      if (!versionMatch) return;

      const cachedVersion = versionMatch[1];
      const currentVersion = app.getVersion();

      if (currentVersion >= cachedVersion) {
        console.debug(`Clearing stale updater cache (cached: ${cachedVersion}, current: ${currentVersion})`);
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          fs.unlinkSync(path.join(cacheDir, file));
        }
      }
    } catch (err) {
      console.error('Failed to clear stale updater cache:', err);
    }
  }

  /**
   * Load settings from settings.json
   */
  loadSettings() {
    try {
      if (!fs.existsSync(settingsFile)) return {};
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch { return {}; }
  }

  /**
   * Initialize the auto updater
   */
  initialize() {
    // Always re-read settings for download/install mode (user may change mid-session)
    const settings = this.loadSettings();
    const downloadMode = settings.updateDownloadMode || 'auto';
    const installMode = settings.updateInstallMode || 'auto';
    autoUpdater.autoDownload = (downloadMode === 'auto');
    autoUpdater.autoInstallOnAppQuit = (installMode === 'auto');

    if (this.isInitialized) return;

    // Force fresh update checks (don't use cached update info)
    autoUpdater.forceDevUpdateConfig = false;

    // Handle update available
    autoUpdater.on('update-available', (info) => {
      this.lastKnownVersion = info.version;
      const settings = this.loadSettings();
      const downloadMode = settings.updateDownloadMode || 'auto';
      if (downloadMode === 'auto') {
        this.isDownloading = true;
        this.safeSend('update-status', { status: 'available', version: info.version });
      } else {
        // Manual download mode - show banner with Download button
        this.safeSend('update-status', { status: 'available-manual', version: info.version });
      }
    });

    // Handle update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      this.lastKnownVersion = info.version;
      this.isDownloading = false;

      // If install was requested while downloading, proceed now
      if (this.installAfterDownload) {
        this.installAfterDownload = false;
        this.quitAndInstall();
        return;
      }

      // Re-check if an even newer version exists before showing banner
      this.verifyLatestBeforeNotify(info.version);
    });

    // Handle update not available
    autoUpdater.on('update-not-available', (info) => {
      this.isDownloading = false;
      // If we had a downloaded version but now there's nothing newer,
      // it means we're up to date (after an install)
      this.safeSend('update-status', { status: 'not-available' });
    });

    // Handle error
    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.isDownloading = false;
      this.safeSend('update-status', { status: 'error', error: err.message });
    });

    // Handle download progress
    autoUpdater.on('download-progress', (progressObj) => {
      this.safeSend('update-status', { status: 'downloading', progress: progressObj.percent });
    });

    this.isInitialized = true;
  }

  /**
   * Check for updates (only in production)
   * @param {boolean} isPackaged - Whether the app is packaged
   */
  checkForUpdates(isPackaged) {
    if (isPackaged) {
      this.clearStalePendingCache();
      this.initialize();

      const settings = this.loadSettings();
      const intervalKey = settings.updateCheckInterval || '30min';

      // 'manual' means no auto-checking at all - user must click button
      if (intervalKey !== 'manual') {
        autoUpdater.checkForUpdatesAndNotify();
      }

      // Start periodic check (will be no-op for startup/manual)
      this.startPeriodicCheck();
    }
  }

  /**
   * Start periodic update checks
   */
  startPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    const settings = this.loadSettings();
    const intervalKey = settings.updateCheckInterval || '30min';
    const intervalMs = CHECK_INTERVALS[intervalKey];

    // startup-only or manual = no periodic checks
    if (!intervalMs) return;

    this.checkInterval = setInterval(() => {
      if (!this.isDownloading) {
        console.debug('Periodic update check...');
        autoUpdater.checkForUpdates().catch(err => {
          console.error('Periodic update check failed:', err);
        });
      }
    }, intervalMs);
  }

  /**
   * Stop periodic update checks
   */
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Manually trigger update check
   */
  manualCheck() {
    this.initialize();
    return autoUpdater.checkForUpdates();
  }

  /**
   * After a download completes, verify no newer version exists on the server.
   * Only shows the banner if the downloaded version is truly the latest.
   * @param {string} downloadedVersion
   */
  async verifyLatestBeforeNotify(downloadedVersion) {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) {
        const serverVersion = result.updateInfo.version;
        if (serverVersion !== downloadedVersion) {
          console.debug(`Downloaded ${downloadedVersion} but ${serverVersion} is available, re-downloading...`);
          // autoDownload will handle downloading the newer version
          // Don't show the banner yet - wait for the new download
          this.safeSend('update-status', { status: 'downloading', progress: 0 });
          return;
        }
      }
    } catch (err) {
      console.error('Verify latest failed:', err);
    }

    // Downloaded version is the latest, show banner
    this.safeSend('update-status', { status: 'downloaded', version: downloadedVersion });
  }

  /**
   * Quit and install update
   */
  async quitAndInstall() {
    try {
      // Check if there's a newer version available
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) {
        const serverVersion = result.updateInfo.version;

        if (this.lastKnownVersion && serverVersion !== this.lastKnownVersion) {
          console.debug(`Newer version available: ${serverVersion} (was: ${this.lastKnownVersion}), re-downloading...`);
          // Flag to auto-install once the new download completes
          this.installAfterDownload = true;
          this.safeSend('update-status', { status: 'downloading', progress: 0 });
          return;
        }
      }
    } catch (err) {
      console.error('Check before install failed:', err);
      // Proceed with install anyway
    }

    // Force quit (bypass minimize to tray)
    const { setQuitting } = require('../windows/MainWindow');
    setQuitting(true);

    // Stop periodic checks before quitting
    this.stopPeriodicCheck();

    autoUpdater.quitAndInstall();
  }
}

// Singleton instance
const updaterService = new UpdaterService();

module.exports = updaterService;
