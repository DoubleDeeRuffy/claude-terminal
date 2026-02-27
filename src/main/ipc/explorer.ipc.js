/**
 * Explorer IPC Handlers - File Watcher Service
 * Watches a project directory for filesystem changes using chokidar,
 * and pushes debounced, batched change events to the renderer process.
 */

const { ipcMain } = require('electron');
const chokidar = require('chokidar');

// ==================== MODULE STATE ====================

/** BrowserWindow reference set by registerExplorerHandlers */
let mainWindow = null;

/** Current chokidar FSWatcher instance */
let activeWatcher = null;

/**
 * Incremented on each startWatch call to invalidate in-flight debounce timers
 * from a previous watcher. Stale events whose capturedWatchId !== watchId are discarded.
 */
let watchId = 0;

/** Batched change events pending the next flush */
let pendingChanges = [];

/** setTimeout handle for the debounce flush */
let debounceTimer = null;

/** Debounce window in milliseconds — within the 300-500ms range per decision */
const DEBOUNCE_MS = 350;

/** Soft limit on the total number of watched paths */
const SOFT_LIMIT = 10000;

// ==================== IGNORE PATTERNS ====================

/**
 * Mirror of IGNORE_PATTERNS from FileExplorer.js.
 * Used by chokidar to skip high-noise directories.
 */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'vendor', '.cache', '.idea', '.vscode',
  '.DS_Store', 'Thumbs.db', '.env.local', 'coverage',
  '.nuxt', '.output', '.turbo', '.parcel-cache'
]);

/**
 * Returns a function for chokidar's `ignored` option.
 * Returns true if any path segment is in IGNORED_DIRS.
 * Splits on both '\\' and '/' for cross-platform compatibility.
 */
function makeIgnoredFn() {
  return (filePath) => {
    if (!filePath) return false;
    const segments = filePath.split(/[\\/]/);
    return segments.some(seg => IGNORED_DIRS.has(seg));
  };
}

// ==================== CHANGE BATCHING ====================

/**
 * Flushes pendingChanges to the renderer via IPC.
 * Discards the call if myWatchId no longer matches the current watchId (stale watcher).
 * @param {number} myWatchId - watchId captured when the watcher was created
 */
function flushChanges(myWatchId) {
  if (myWatchId !== watchId) return; // stale watcher — discard
  if (pendingChanges.length === 0) return;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('explorer:changes', pendingChanges.slice());
  }

  pendingChanges = [];
  debounceTimer = null;
}

// ==================== WATCHER LIFECYCLE ====================

/**
 * Stops the current watcher and cancels any pending flush.
 * Increments watchId to invalidate in-flight debounce timers.
 */
function stopWatch() {
  watchId++; // invalidate any pending debounce callbacks from the old watcher

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  pendingChanges = [];

  if (activeWatcher) {
    activeWatcher.close(); // fire-and-forget — safe, chokidar handles this internally
    activeWatcher = null;
  }
}

/**
 * Starts watching projectPath for filesystem changes.
 * Any previously active watcher is stopped first.
 * @param {string} projectPath - Absolute path to the project directory
 */
function startWatch(projectPath) {
  stopWatch(); // stop any existing watcher and bump watchId

  const myWatchId = watchId; // capture the new watchId for this watcher's closures

  activeWatcher = chokidar.watch(projectPath, {
    ignored: makeIgnoredFn(),
    persistent: false,        // don't prevent the process from exiting
    ignoreInitial: true,      // only report changes, not the initial directory scan
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  /**
   * Pushes a single change event and (re)schedules the debounce flush.
   * Drops the event silently if this watcher has become stale.
   * @param {'add'|'remove'} type - Change type
   * @param {string} filePath - Absolute path of the changed entry
   * @param {boolean} isDirectory - Whether the entry is a directory
   */
  function pushChange(type, filePath, isDirectory) {
    if (myWatchId !== watchId) return; // stale watcher — discard

    pendingChanges.push({ type, path: filePath, isDirectory });

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => flushChanges(myWatchId), DEBOUNCE_MS);
  }

  activeWatcher
    .on('add',       (p) => pushChange('add',    p, false))
    .on('addDir',    (p) => pushChange('add',    p, true))
    .on('unlink',    (p) => pushChange('remove', p, false))
    .on('unlinkDir', (p) => pushChange('remove', p, true))
    .on('ready', () => {
      if (myWatchId !== watchId) return;
      // Check soft limit — sum the length of all watched path arrays
      const watched = activeWatcher.getWatched();
      const totalPaths = Object.values(watched).reduce((acc, arr) => acc + arr.length, 0);
      if (totalPaths > SOFT_LIMIT) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('explorer:watchLimitWarning', {
            count: totalPaths,
            limit: SOFT_LIMIT
          });
        }
      }
    })
    .on('error', () => {
      // Silently ignore errors (e.g. permission denied on subdirectories)
    });
}

// ==================== IPC REGISTRATION ====================

/**
 * Registers IPC handlers for the file explorer watcher.
 * Must be called with a reference to the main BrowserWindow.
 * @param {BrowserWindow} mw - The main application window
 */
function registerExplorerHandlers(mw) {
  mainWindow = mw;

  // Fire-and-forget: start watching a project directory
  ipcMain.on('explorer:startWatch', (event, projectPath) => {
    if (!projectPath || typeof projectPath !== 'string') return;
    startWatch(projectPath);
  });

  // Fire-and-forget: stop any active watcher
  ipcMain.on('explorer:stopWatch', () => {
    stopWatch();
  });
}

module.exports = { registerExplorerHandlers, stopWatch };
