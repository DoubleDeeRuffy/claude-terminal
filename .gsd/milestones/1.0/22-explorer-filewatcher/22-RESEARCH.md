# Phase 22: Explorer-Filewatcher - Research

**Researched:** 2026-02-27
**Domain:** File system watching in Electron main process with IPC bridge to renderer FileExplorer
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Watch scope:**
- Watch the entire project directory recursively — explorer always reflects reality, even for collapsed folders
- Watcher starts automatically when a project is opened, stops when project closes — no toggle or setting needed
- One active watcher at a time — stop old watcher on project switch, start new one for the active project
- Main process (Node.js) hosts the watcher, sends IPC events to renderer — follows existing IPC architecture pattern

**Technology:**
- Use chokidar for file watching — battle-tested, handles cross-platform edge cases, recursive watching, and deduplication out of the box

**Performance boundaries:**
- Auto-exclude heavy directories from watching — reuse existing IGNORE_PATTERNS from FileExplorer (node_modules, .git, __pycache__, bin/obj, etc.)
- Soft limit on watched paths (~10k) — show a notification warning if exceeded, suggesting the user close explorer or exclude folders

**Update behavior:**
- Debounced batch updates (~300-500ms) — collect changes and apply once to avoid UI thrashing during bulk operations (git checkout, npm install)
- Silent updates — no highlights, animations, or visual indicators when files change. Tree just reflects new state.
- Incremental patches — add/remove only changed items rather than re-reading entire directories. Faster, less I/O, preserves state naturally.
- Track all changes including collapsed folders — internal state is always current so expanding a folder shows reality immediately
- Deleted files silently disappear from tree — no special notification or handling
- Deleted expanded folders silently vanish with their children — consistent with silent update approach

**State preservation:**
- Expanded folders, scroll position, and selection remain intact during updates — incremental patches make this natural
- Builds on Phase 5/5.1 explorer state persistence patterns

### Claude's Discretion

- Exact debounce timing within 300-500ms range
- Chokidar configuration options (polling vs native, stabilityThreshold)
- IPC event format and batching strategy
- Soft limit threshold tuning
- How to handle rapid successive project switches during watcher startup/teardown

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 22 adds real-time file system watching to the integrated file explorer. When any file or directory changes in the project root (additions, deletions, renames), the explorer tree automatically updates without manual refresh. The implementation is architecturally clean: chokidar runs in the main process (Node.js), fires change events, the main process debounces and batches them, then sends a single IPC event to the renderer, which performs an incremental patch to the `expandedFolders` Map in FileExplorer.js.

The key insight is that FileExplorer.js already has all the infrastructure needed for incremental updates: `expandedFolders` is a Map from `folderPath -> { children, loaded }`, and `readDirectoryAsync()` can reload a single folder's children. For file additions/deletions, the incremental patch strategy is: find the parent folder in `expandedFolders`, re-read that directory, replace `entry.children`, call `render()`. For directory deletions, also remove the deleted path and all descendant paths from `expandedFolders`. For directory additions, just add them to the parent's children (they load lazily when expanded).

The watcher lifecycle ties directly to the existing project-switch flow in `renderer.js` (the `projectsState.subscribe` block that calls `FileExplorer.setRootPath()`). A new IPC channel (`explorer:startWatch` / `explorer:stopWatch`) carries this lifecycle, plus `explorer:changes` pushes batched change events back to the renderer.

**Primary recommendation:** Use chokidar v4 (not v5 — project requires Node >=18, v5 requires Node >=20.19). Create a dedicated `src/main/ipc/explorer.ipc.js` for the watcher. Keep all chokidar logic in main; renderer only receives structured change patches via IPC.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `chokidar` | ^4.0.3 | Recursive directory watching with cross-platform reliability | Locked decision in CONTEXT.md. v4 is pure JS (no native bindings, no `electron-rebuild` needed), handles Windows FSEvent quirks, deduplicates rapid changes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `ipcMain` / `ipcRenderer` | (built-in Electron) | Main-to-renderer event push | Push batched changes from main to renderer |
| `debounce` from `../../utils/dom` | (in-repo) | Batch change events in renderer | Renderer-side debounce to coalesce rapid IPC events |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chokidar v4 | chokidar v5 | v5 is ESM-only and requires Node >=20.19; project requires Node >=18, so v5 is incompatible |
| chokidar v4 | Node.js `fs.watch` recursive | `fs.watch` with `recursive: true` works on Windows (Vista+) and macOS (10.7+) but NOT on Linux; also delivers raw OS events without deduplication, coalescing, or stabilityThreshold. chokidar adds all of this. |
| chokidar v4 | `chokidar` v3.6.0 | v3 has more dependencies (13 vs 1), includes optional `fsevents` native binding (requires `electron-rebuild`). v4 is simpler, pure JS. |
| Dedicated `explorer.ipc.js` | Adding to `dialog.ipc.js` | Phase 21 already adds `watchFile`/`unwatchFile` to `dialog.ipc.js` for single-file watching. Directory watching is a separate concern — own file keeps it clean |

**Installation:**
```bash
npm install chokidar@^4.0.3
```

No `electron-rebuild` step needed — chokidar v4 has zero native bindings. Only dependency is `readdirp@^4.0.1` (pure JS).

## Architecture Patterns

### Recommended Project Structure

New files:
```
src/main/ipc/explorer.ipc.js     # Chokidar watcher lifecycle + IPC handlers
```

Modified files:
```
src/main/ipc/index.js            # Register explorer IPC handlers
src/main/preload.js              # Expose explorer.startWatch, stopWatch, onChanges
src/renderer/ui/components/FileExplorer.js  # Apply incremental patches from IPC events
renderer.js                      # Wire startWatch/stopWatch to project switch subscriber
```

### Pattern 1: Watcher Lifecycle in Main Process

**What:** A single module-level `activeWatcher` variable holds the current chokidar instance. `startWatch(projectPath)` creates it; `stopWatch()` closes it. Called from IPC handlers.

**When to use:** One watcher at a time, lifecycle tied to active project.

```javascript
// src/main/ipc/explorer.ipc.js
const { ipcMain } = require('electron');
const chokidar = require('chokidar');

let mainWindow = null;
let activeWatcher = null;
let pendingChanges = [];   // batched change events
let debounceTimer = null;
const DEBOUNCE_MS = 350;   // within 300-500ms range per user decision

// Directories to exclude from watching (mirrors IGNORE_PATTERNS in FileExplorer.js)
const IGNORED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'vendor', '.cache', '.idea', '.vscode',
  '.DS_Store', 'Thumbs.db', '.env.local', 'coverage',
  '.nuxt', '.output', '.turbo', '.parcel-cache'
];

function makeIgnoredFn() {
  return (filePath) => {
    const segments = filePath.split(/[\\/]/);
    return segments.some(seg => IGNORED_DIRS.includes(seg));
  };
}

function stopWatch() {
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
  pendingChanges = [];
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
}

function flushChanges() {
  if (!pendingChanges.length || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('explorer:changes', pendingChanges);
  pendingChanges = [];
  debounceTimer = null;
}

function scheduleFlush() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushChanges, DEBOUNCE_MS);
}

function startWatch(projectPath) {
  stopWatch(); // Always stop previous watcher first

  activeWatcher = chokidar.watch(projectPath, {
    ignored: makeIgnoredFn(),
    persistent: false,      // Don't prevent process exit
    ignoreInitial: true,    // Only watch for changes, not initial scan
    depth: undefined,       // Recursive, no depth limit
    awaitWriteFinish: {
      stabilityThreshold: 200,   // Wait 200ms after last write before firing
      pollInterval: 100
    }
  });

  activeWatcher
    .on('add',       (p) => { pendingChanges.push({ type: 'add', path: p, isDirectory: false }); scheduleFlush(); })
    .on('addDir',    (p) => { pendingChanges.push({ type: 'add', path: p, isDirectory: true });  scheduleFlush(); })
    .on('unlink',    (p) => { pendingChanges.push({ type: 'remove', path: p, isDirectory: false }); scheduleFlush(); })
    .on('unlinkDir', (p) => { pendingChanges.push({ type: 'remove', path: p, isDirectory: true });  scheduleFlush(); })
    .on('error',     (err) => { /* silently ignore — e.g. permission denied on a subdir */ });
  // Note: 'change' events on files are intentionally not watched — Phase 22 only tracks tree structure
}

function registerExplorerHandlers(mw) {
  mainWindow = mw;
  ipcMain.on('explorer:startWatch', (event, projectPath) => startWatch(projectPath));
  ipcMain.on('explorer:stopWatch', () => stopWatch());
}

module.exports = { registerExplorerHandlers };
```

### Pattern 2: Preload Bridge Extension

**What:** Expose `startWatch`, `stopWatch`, and `onChanges` under the `explorer` namespace (or extend `dialog`).

```javascript
// In preload.js — new namespace
explorer: {
  startWatch: (projectPath) => ipcRenderer.send('explorer:startWatch', projectPath),
  stopWatch:  ()            => ipcRenderer.send('explorer:stopWatch'),
  onChanges:  (callback)    => createListener('explorer:changes')(callback)
}
```

### Pattern 3: Incremental Patch Application in FileExplorer.js

**What:** The renderer receives an array of change events. For each event, it patches only the affected parent folder's children array, then calls `render()` once after all patches.

**Key insight:** `expandedFolders` tracks ALL folders (including collapsed ones), so we can update any parent regardless of its visual state. The tree shows correct data when expanded.

```javascript
// In FileExplorer.js
async function applyChanges(changes) {
  const affectedParents = new Set();

  for (const change of changes) {
    const parentDir = path.dirname(change.path);

    if (change.type === 'add') {
      // Add the new item to the parent folder's children (if parent is tracked)
      const entry = expandedFolders.get(parentDir);
      if (entry && entry.loaded) {
        // Re-read the parent to get correct stat and sorted order
        affectedParents.add(parentDir);
      }
      // If parent is a collapsed/untracked folder, no action needed — it will
      // load fresh from disk when expanded

    } else if (change.type === 'remove') {
      const entry = expandedFolders.get(parentDir);
      if (entry && entry.loaded) {
        // Remove the deleted item from parent's children array
        entry.children = entry.children.filter(c => c.path !== change.path);
      }
      if (change.isDirectory) {
        // Also remove the deleted folder and ALL its descendants from expandedFolders
        for (const key of [...expandedFolders.keys()]) {
          if (key === change.path || key.startsWith(change.path + path.sep)) {
            expandedFolders.delete(key);
          }
        }
      }
      // Clean up selection state
      selectedFiles.delete(change.path);
      if (lastSelectedFile === change.path) lastSelectedFile = null;
    }
  }

  // Re-read affected parent directories for additions (to get sorted, stat-complete children)
  for (const parentDir of affectedParents) {
    const entry = expandedFolders.get(parentDir);
    if (entry) {
      entry.children = await readDirectoryAsync(parentDir);
    }
  }

  render();
}
```

### Pattern 4: Watcher Lifecycle Wired to Project Switch

**What:** In `renderer.js`, extend the existing `projectsState.subscribe` block to start/stop the watcher on project switch.

```javascript
// In renderer.js — extend existing projectsState.subscribe for FileExplorer
projectsState.subscribe(() => {
  const state = projectsState.get();
  const selectedFilter = state.selectedProjectFilter;
  const projects = state.projects;

  if (selectedFilter !== null && projects[selectedFilter]) {
    const project = projects[selectedFilter];
    const sessionData = loadSessionData();
    const explorerState = sessionData?.projects?.[project.id]?.explorer || null;
    FileExplorer.setRootPath(project.path, explorerState);

    // NEW: start watching the new project, stop the old one
    api.explorer.startWatch(project.path);
  } else {
    FileExplorer.hide();
    // NEW: stop watching when no project selected
    api.explorer.stopWatch();
  }
});
```

Also wire the `onChanges` listener once during initialization (not inside the subscriber, to avoid duplicate listeners):

```javascript
// In renderer.js — one-time setup during init
api.explorer.onChanges((changes) => {
  FileExplorer.applyChanges(changes);
});
```

### Pattern 5: Soft Limit Warning (Claude's Discretion)

**What:** After the watcher's `ready` event, check `watcher.getWatched()` for total path count. If above threshold (~10k), send a notification to renderer.

```javascript
activeWatcher.on('ready', () => {
  const watched = activeWatcher.getWatched(); // { dir: [files...] }
  const totalPaths = Object.values(watched).reduce((sum, files) => sum + files.length, 0);
  if (totalPaths > SOFT_LIMIT_THRESHOLD && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('explorer:watchLimitWarning', totalPaths);
  }
});
```

Renderer side: `api.explorer.onWatchLimitWarning` triggers `showToast()` with a warning message.

### Anti-Patterns to Avoid

- **Watching from renderer process:** Not possible — chokidar uses Node.js `fs` module, not available in sandboxed renderer. Must stay in main process.
- **Re-reading the entire tree on any change:** Defeats the purpose of incremental patches. Only re-read the specific parent directory that changed.
- **Not cleaning up the watcher on project switch:** Causes the old watcher to keep firing events for a project the user has left. Always call `stopWatch()` before `startWatch()`.
- **Watching inside IGNORED_DIRS:** Would cause massive event floods during `npm install` or git operations. Mirror `IGNORE_PATTERNS` from FileExplorer.js exactly.
- **Not setting `ignoreInitial: true`:** Would fire `add` events for every file in the project on startup, flooding the renderer with thousands of no-op changes.
- **Not setting `persistent: false`:** Would prevent Electron from exiting if the watcher is still running. Always use `persistent: false` in Electron main process.
- **Removing descendant `expandedFolders` entries with `String.startsWith`:** Must use `key.startsWith(change.path + path.sep)` (with separator) to avoid false matches like `/project/src` matching `/project/src-old`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform FS events | Custom `fs.watch` recursive wrapper | `chokidar` v4 | `fs.watch` recursive is macOS+Windows only (not Linux). chokidar normalizes all platforms, deduplicates, handles rename-based atomic writes, coalesces rapid events. |
| Event deduplication | Custom Set/Map tracking recent events | `chokidar`'s built-in deduplication + `awaitWriteFinish` | Editors use atomic save (write temp → rename), causing 2-4 FS events per save. chokidar's `awaitWriteFinish` handles this. |
| Debounce in main process | Custom timer per watcher | Module-level `debounceTimer` + `setTimeout` | Simple and sufficient. No external dependency needed. |

**Key insight:** chokidar's value is specifically in cross-platform normalization and event deduplication, not just "watching files". Rolling a custom solution would rediscover all the edge cases chokidar already handles.

## Common Pitfalls

### Pitfall 1: Watcher Not Cleaned Up on App Quit
**What goes wrong:** If the app quits while a chokidar watcher is running, the process may hang or produce error logs.
**Why it happens:** `persistent: false` mitigates this, but the watcher handle may still be open.
**How to avoid:** Add a `before-quit` listener in `main.js` (or in `explorer.ipc.js`) that calls `stopWatch()`.
**Warning signs:** Electron process doesn't exit cleanly after app close.

### Pitfall 2: Rapid Project Switching Race Condition
**What goes wrong:** User switches projects quickly. The old watcher fires events after the new watcher has started, corrupting the new project's tree.
**Why it happens:** Chokidar's `close()` is async internally; events in-flight may still fire.
**How to avoid:** Tag each watcher with a `watchId`. In the event handler, check that the event belongs to the current watcher before pushing to `pendingChanges`. Alternatively, `stopWatch()` sets `activeWatcher = null` before calling `.close()`, and event handlers check `if (activeWatcher === this)`.
**Warning signs:** Files from Project A appearing in Project B's tree after fast switching.

### Pitfall 3: `path.sep` vs `/` in StartsWith Checks
**What goes wrong:** On Windows, paths use `\` but JavaScript string operations may use `/`. A check like `key.startsWith('/project/src')` fails if `key` is `C:\project\src`.
**Why it happens:** FileExplorer.js uses `path.join()` (OS-native separator) for all paths.
**How to avoid:** Use `path.sep` in the startsWith check: `key.startsWith(change.path + path.sep)`. Also ensure the path passed from chokidar matches the format used in `expandedFolders` keys (both should be absolute, OS-native paths since chokidar returns absolute paths when given an absolute root).
**Warning signs:** Directory deletions not cleaning up descendant entries from `expandedFolders`.

### Pitfall 4: `ignoreInitial: false` Floods Renderer on Startup
**What goes wrong:** On project open, chokidar fires `add` events for every file in the project (could be thousands), flooding the renderer with change batches that all result in no-ops.
**Why it happens:** chokidar's default is `ignoreInitial: false`.
**How to avoid:** Always set `ignoreInitial: true` for the explorer watcher. The initial tree is built by FileExplorer.js's own `readDirectoryAsync`, not by chokidar.
**Warning signs:** Renderer receives thousands of `explorer:changes` events immediately after project switch.

### Pitfall 5: Chokidar v5 ESM Import Incompatibility
**What goes wrong:** `const chokidar = require('chokidar')` throws `ERR_REQUIRE_ESM` if chokidar v5 is installed.
**Why it happens:** Chokidar v5 is ESM-only. The main process uses CommonJS (`require()`).
**How to avoid:** Lock to `chokidar@^4.0.3` in `package.json`. V4 supports CommonJS `require()`.
**Warning signs:** `Error [ERR_REQUIRE_ESM]: require() of ES Module` in main process logs.

### Pitfall 6: IGNORED_DIRS Divergence Between Main and Renderer
**What goes wrong:** FileExplorer.js filters `node_modules` from display, but the watcher still watches inside it, causing massive event floods during `npm install`.
**Why it happens:** The `IGNORE_PATTERNS` Set in FileExplorer.js is only used for rendering, not for chokidar.
**How to avoid:** Mirror the exact `IGNORE_PATTERNS` list as the chokidar `ignored` function in `explorer.ipc.js`. Keep them in sync — if FileExplorer.js adds a new ignore, add it to the watcher too. (Consider extracting to a shared constant if it diverges frequently.)
**Warning signs:** Explorer freezes during `npm install` or git operations due to event flood.

## Code Examples

### Complete Watcher Module (explorer.ipc.js)

```javascript
// src/main/ipc/explorer.ipc.js
const { ipcMain } = require('electron');
const chokidar = require('chokidar');

let mainWindow = null;
let activeWatcher = null;
let watchId = 0;           // Incremented on each startWatch to detect stale events
let pendingChanges = [];
let debounceTimer = null;
const DEBOUNCE_MS = 350;
const SOFT_LIMIT = 10000;

// Mirror of IGNORE_PATTERNS in FileExplorer.js
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'vendor', '.cache', '.idea', '.vscode',
  '.DS_Store', 'Thumbs.db', '.env.local', 'coverage',
  '.nuxt', '.output', '.turbo', '.parcel-cache'
]);

function makeIgnoredFn() {
  return (filePath) => {
    const segments = filePath.replace(/\\/g, '/').split('/');
    return segments.some(seg => IGNORED_DIRS.has(seg));
  };
}

function flushChanges(myWatchId) {
  if (myWatchId !== watchId) return; // Stale watcher — discard
  if (!pendingChanges.length) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('explorer:changes', pendingChanges);
  }
  pendingChanges = [];
  debounceTimer = null;
}

function stopWatch() {
  watchId++;  // Invalidate any in-flight debounce timers
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  pendingChanges = [];
  if (activeWatcher) {
    activeWatcher.close(); // async internally but fire-and-forget is safe here
    activeWatcher = null;
  }
}

function startWatch(projectPath) {
  stopWatch();
  const myWatchId = watchId;

  activeWatcher = chokidar.watch(projectPath, {
    ignored: makeIgnoredFn(),
    persistent: false,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });

  const pushChange = (type, filePath, isDirectory) => {
    if (myWatchId !== watchId) return; // Stale
    pendingChanges.push({ type, path: filePath, isDirectory });
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => flushChanges(myWatchId), DEBOUNCE_MS);
  };

  activeWatcher
    .on('add',       (p) => pushChange('add', p, false))
    .on('addDir',    (p) => pushChange('add', p, true))
    .on('unlink',    (p) => pushChange('remove', p, false))
    .on('unlinkDir', (p) => pushChange('remove', p, true))
    .on('ready', () => {
      if (myWatchId !== watchId || !activeWatcher) return;
      const watched = activeWatcher.getWatched();
      const total = Object.values(watched).reduce((s, f) => s + f.length, 0);
      if (total > SOFT_LIMIT && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('explorer:watchLimitWarning', total);
      }
    })
    .on('error', () => { /* silently ignore permission errors */ });
}

function registerExplorerHandlers(mw) {
  mainWindow = mw;
  ipcMain.on('explorer:startWatch', (event, projectPath) => {
    if (typeof projectPath === 'string' && projectPath.length > 0) {
      startWatch(projectPath);
    }
  });
  ipcMain.on('explorer:stopWatch', () => stopWatch());
}

module.exports = { registerExplorerHandlers, stopWatch };
```

### Incremental Patch in FileExplorer.js

```javascript
// New exported function in FileExplorer.js
async function applyWatcherChanges(changes) {
  const affectedParents = new Set();

  for (const change of changes) {
    const parentDir = path.dirname(change.path);

    if (change.type === 'add') {
      const entry = expandedFolders.get(parentDir);
      if (entry && entry.loaded) {
        affectedParents.add(parentDir);
      }
    } else if (change.type === 'remove') {
      // Remove from parent's children
      const entry = expandedFolders.get(parentDir);
      if (entry && entry.loaded) {
        entry.children = entry.children.filter(c => c.path !== change.path);
      }
      // Clean up directory and all descendants from expandedFolders
      if (change.isDirectory) {
        const prefix = change.path + path.sep;
        for (const key of [...expandedFolders.keys()]) {
          if (key === change.path || key.startsWith(prefix)) {
            expandedFolders.delete(key);
          }
        }
      }
      selectedFiles.delete(change.path);
      if (lastSelectedFile === change.path) lastSelectedFile = null;
    }
  }

  // Re-read affected parents to get updated, sorted children for additions
  for (const parentDir of affectedParents) {
    const entry = expandedFolders.get(parentDir);
    if (entry) {
      entry.children = await readDirectoryAsync(parentDir);
    }
  }

  render();
}

// Add to module.exports:
// applyWatcherChanges
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fs.watch` recursive (Node built-in) | chokidar (wrapper) | chokidar ~2014 | Cross-platform reliability, deduplication |
| chokidar v3 (fsevents native binding) | chokidar v4 (pure JS, 1 dep) | Sep 2024 | No `electron-rebuild` needed |
| chokidar v4 (CJS+ESM) | chokidar v5 (ESM-only) | Nov 2025 | v5 incompatible with project (Node >=20 req) |

**Deprecated/outdated:**
- chokidar v3: Has optional `fsevents` native binding, requiring `electron-rebuild`. Use v4 instead.
- chokidar v5: ESM-only, requires Node >=20.19.0. Project requires Node >=18. Not usable.

## Open Questions

1. **Phase 21 dependency: does `explorer.ipc.js` need `setMainWindow` or can it receive it at registration time?**
   - What we know: Phase 21 adds `watchFile`/`unwatchFile` to `dialog.ipc.js` which already has `mainWindow`. Phase 22 creates a separate `explorer.ipc.js`.
   - What's unclear: Phase 21 may or may not be complete when Phase 22 is implemented. The `registerAllHandlers(mainWindow)` in `index.js` already passes `mainWindow` to some handlers.
   - Recommendation: Pass `mainWindow` into `registerExplorerHandlers(mainWindow)` at registration time, same pattern as `dialog.ipc.js`. This is independent of Phase 21.

2. **Should `applyWatcherChanges` be debounced in the renderer, or trust the main process debounce?**
   - What we know: Main process already debounces at 350ms and batches all changes. The renderer receives one array per flush.
   - What's unclear: Whether extremely rapid changes (e.g., git checkout of 1000 files) might cause the debounce to fire many times in quick succession.
   - Recommendation: Trust the main-process debounce for now. If UI thrashing is observed during testing, add a renderer-side debounce as a secondary guard using the existing `debounce` utility from `utils/dom`.

3. **How does the soft limit warning surface to the user?**
   - What we know: The codebase has a `Toast` component and a `showToast` function used elsewhere.
   - What's unclear: The exact i18n key structure and whether `showToast` is accessible from `renderer.js`.
   - Recommendation: Use the existing `showToast` mechanism with a new i18n key `explorer.watchLimitWarning`. One-time notification (don't show again after first warning for the same project).

## Validation Architecture

nyquist_validation is not set in config.json — skip this section.

## Sources

### Primary (HIGH confidence)
- Chokidar GitHub README (fetched 2026-02-27) — API surface, options, events, v4/v5 differences
- npm registry: `chokidar@4.0.3` engines `{ node: '>= 14.16.0' }`, deps `{ readdirp: '^4.0.1' }` — version compatibility confirmed
- npm registry: `chokidar@5.0.0` engines `{ node: '>= 20.19.0' }` — v5 incompatibility confirmed
- Codebase analysis: `src/renderer/ui/components/FileExplorer.js` — IGNORE_PATTERNS, expandedFolders Map structure, readDirectoryAsync, setRootPath, render() patterns
- Codebase analysis: `renderer.js` lines 1568-1583 — project switch subscriber, FileExplorer.setRootPath call site
- Codebase analysis: `src/main/preload.js` — dialog namespace, createListener pattern
- Codebase analysis: `src/main/ipc/dialog.ipc.js` — registerDialogHandlers pattern, mainWindow usage
- Codebase analysis: `package.json` — `node: >=18`, `electron: ^28.0.0`, no chokidar present, no fsevents

### Secondary (MEDIUM confidence)
- Phase 21 RESEARCH.md — file watcher analysis (fs.watch vs chokidar for single-file watching; confirms chokidar not yet installed)
- Phase 21 02-PLAN.md — IPC channel naming conventions (`watch-file`, `unwatch-file`, `file-changed`) as reference for Phase 22 naming

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — chokidar v4 locked by user decision; version compatibility verified against project's Node engine requirement
- Architecture: HIGH — based on direct codebase analysis; IPC patterns copied from existing dialog.ipc.js and preload.js
- Pitfalls: HIGH — most derived from direct code analysis (IGNORE_PATTERNS, path.sep, watchId race condition); one (app quit cleanup) is common Electron practice

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (stable domain — chokidar v4 API is stable)
