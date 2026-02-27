---
status: diagnosed
trigger: "file watcher performance - only watch expanded directories, not entire recursive tree"
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: Chokidar watches the entire project root recursively by default; the IGNORED_DIRS list filters only well-known noise dirs but still traverses every other subdirectory, creating one native fs.watch handle per directory.
test: N/A — code-read-only investigation
expecting: N/A
next_action: COMPLETE — findings written below

## Symptoms

expected: File watcher tracks only the directories visible in the explorer UI
actual: Chokidar watches the entire project tree from root, recursively, at startup
errors: none (no crash) — performance degradation only
reproduction: Open any large project (one with deeply nested source trees, e.g. a monorepo) as the selected project — chokidar immediately enumerates every non-ignored directory
started: Always (architectural choice, not a regression)

## Eliminated

(no hypotheses were investigated and ruled out — this is a read-only architecture analysis)

## Evidence

- timestamp: 2026-02-27
  checked: src/main/ipc/explorer.ipc.js lines 108-163
  found: |
    chokidar.watch(projectPath, { ... }) — no `depth` option, no `disableGlobbing`,
    no `usePolling`. Chokidar defaults to recursive native fs.watch.
    The `ignored` function filters known noisy directories (node_modules, .git, dist, etc.)
    but ALL other directories are traversed and have a native watch handle registered.
  implication: One native os-level fs.watch/inotify/kqueue descriptor is opened per
    non-ignored directory. A monorepo with 2,000 source directories consumes 2,000 handles.

- timestamp: 2026-02-27
  checked: src/main/ipc/explorer.ipc.js — IPC surface (lines 177-186)
  found: |
    Only two IPC channels exist:
      explorer:startWatch(projectPath)  — recursive watch from root
      explorer:stopWatch()              — close everything
    No channel exists for watching/unwatching individual directories.
  implication: The IPC layer must gain two new channels before the renderer can
    drive per-directory watch lifecycle.

- timestamp: 2026-02-27
  checked: src/renderer/ui/components/FileExplorer.js — toggleFolder (lines 1358-1370)
  found: |
    toggleFolder(folderPath):
      - expand: calls getOrLoadFolder(folderPath) which adds to expandedFolders Map
      - collapse: expandedFolders.delete(folderPath)
    No watcher calls on either branch. The expand/collapse cycle is
    entirely self-contained in the renderer; the main process is never notified.
  implication: This is the exact hook point for "start watch on expand, stop watch on
    collapse". Both branches need a single api.explorer.watchDir / api.explorer.unwatchDir
    call added.

- timestamp: 2026-02-27
  checked: src/renderer/ui/components/FileExplorer.js — collapse-all button (lines 1298-1313)
  found: |
    btnCollapse.onclick clears expandedFolders entirely (expandedFolders.clear()).
    btnRefresh.onclick also clears expandedFolders.
  implication: Both actions must also stop all per-directory watchers.
    A single api.explorer.stopAllDirWatchers() call (or iterating the current
    expandedFolders keys before clearing) is needed.

- timestamp: 2026-02-27
  checked: src/renderer/ui/components/FileExplorer.js — setRootPath (lines 195-250)
  found: |
    When switching projects, expandedFolders.clear() is called.
    Previously-expanded paths are then restored from savedExpandedPaths.
    The restored directories are re-expanded via readDirectoryAsync without
    registering any watchers.
  implication: On project switch, the new architecture must: (1) stop all old
    per-directory watchers, (2) start watchers for the restored expanded paths.

- timestamp: 2026-02-27
  checked: src/renderer/ui/components/FileExplorer.js — applyWatcherChanges (lines 480-519)
  found: |
    applyWatcherChanges already filters changes to only act on entries that exist
    in expandedFolders ("Only re-read parent if it's a tracked (loaded) folder").
    Directory removal also pruning expandedFolders for the deleted subtree.
  implication: The change-application logic already assumes per-directory semantics.
    It is compatible with the new architecture without modification — events from
    non-expanded directories will naturally be absent because those directories
    won't be watched.

- timestamp: 2026-02-27
  checked: src/main/preload.js lines 214-228
  found: |
    The `explorer` namespace is DUPLICATED — it appears twice in the preload object
    literal (lines 215-220 and 223-228 with identical content).
    In JavaScript, duplicate keys in an object literal silently overwrite the first;
    the second definition wins. Both are identical so there is no behavioural bug,
    but it is dead code that should be cleaned up.
  implication: Minor maintenance issue, not related to the performance problem.

- timestamp: 2026-02-27
  checked: renderer.js lines 1585-1595
  found: |
    Project selection state subscriber:
      api.explorer.startWatch(project.path)   — on project select
      api.explorer.stopWatch()                 — on project deselect / no project
    This is the only place startWatch/stopWatch are called.
  implication: This subscriber must be updated to NOT call startWatch for the whole
    root. Instead it should (a) start a shallow watch on the root dir only, and
    (b) let FileExplorer.setRootPath trigger per-directory watches for restored
    expanded folders.

- timestamp: 2026-02-27
  checked: src/main/ipc/explorer.ipc.js — SOFT_LIMIT check (lines 150-159)
  found: |
    SOFT_LIMIT = 10,000 paths. Checked once on 'ready', shows a toast.
    This is a symptom-mitigation measure, not a fix.
  implication: With per-directory watching this soft limit check becomes obsolete
    for the pathological case; it can be removed or repurposed.

## Resolution

root_cause: |
  chokidar.watch(projectPath, {...}) at line 113 of explorer.ipc.js uses no `depth`
  limit and no recursive=false option. Chokidar defaults to fully recursive native
  watching. Combined with the IGNORED_DIRS filter (which skips only ~15 well-known
  directories), every other directory in the project tree gets a native OS watch
  handle at startup — regardless of whether those directories are visible or
  expanded in the UI.

  The IPC layer has no mechanism to watch individual directories, and FileExplorer's
  toggleFolder() does not communicate expand/collapse events to the main process at all.

fix: NOT APPLIED (research-only mode)
verification: NOT APPLIED
files_changed: []

---

## Architecture Change Plan

### 1. Main Process — explorer.ipc.js

Replace the single-watcher model with a Map of per-directory non-recursive watchers.

#### New module state

```js
// Map<dirPath, { watcher: FSWatcher, watchId: number }>
const dirWatchers = new Map();
```

#### New function: watchDir(dirPath)

```js
function watchDir(dirPath) {
  if (dirWatchers.has(dirPath)) return; // already watching

  const myWatchId = ++watchId;
  const watcher = chokidar.watch(dirPath, {
    ignored: makeIgnoredFn(),
    persistent: true,
    ignoreInitial: true,
    ignorePermissionErrors: true,
    depth: 0,                 // NON-RECURSIVE — only direct children of dirPath
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });

  watcher
    .on('add',       (p) => pushChange('add',    p, false, myWatchId))
    .on('addDir',    (p) => pushChange('add',    p, true,  myWatchId))
    .on('unlink',    (p) => pushChange('remove', p, false, myWatchId))
    .on('unlinkDir', (p) => pushChange('remove', p, true,  myWatchId))
    .on('error',     () => {});

  dirWatchers.set(dirPath, { watcher, watchId: myWatchId });
}
```

#### New function: unwatchDir(dirPath)

```js
function unwatchDir(dirPath) {
  const entry = dirWatchers.get(dirPath);
  if (!entry) return;
  entry.watcher.close();
  dirWatchers.delete(dirPath);
}
```

#### New function: stopAllDirWatchers()

```js
function stopAllDirWatchers() {
  for (const { watcher } of dirWatchers.values()) {
    watcher.close();
  }
  dirWatchers.clear();
  pendingChanges = [];
  clearTimeout(debounceTimer);
  debounceTimer = null;
}
```

#### Updated IPC channels

```js
ipcMain.on('explorer:watchDir',   (_, dirPath) => watchDir(dirPath));
ipcMain.on('explorer:unwatchDir', (_, dirPath) => unwatchDir(dirPath));
ipcMain.on('explorer:stopWatch',  ()            => stopAllDirWatchers());
// explorer:startWatch can be removed (or kept as a shallow root watch — see below)
```

---

### 2. Preload Bridge — preload.js

Add two new IPC send methods, remove the duplicate `explorer` key:

```js
explorer: {
  // legacy — keep for compatibility or repurpose as "watch root dir only"
  startWatch:   (projectPath) => ipcRenderer.send('explorer:watchDir', projectPath),
  stopWatch:    ()             => ipcRenderer.send('explorer:stopWatch'),
  // new per-directory API
  watchDir:     (dirPath)      => ipcRenderer.send('explorer:watchDir', dirPath),
  unwatchDir:   (dirPath)      => ipcRenderer.send('explorer:unwatchDir', dirPath),
  onChanges:    createListener('explorer:changes'),
  onWatchLimitWarning: createListener('explorer:watchLimitWarning')
},
```

Also fix the duplicate `explorer` key bug (second copy at lines 223-228 should be removed).

---

### 3. Renderer — FileExplorer.js

#### toggleFolder — add watchDir / unwatchDir calls

```js
function toggleFolder(folderPath) {
  const entry = expandedFolders.get(folderPath);
  if (entry && entry.loaded) {
    // COLLAPSE
    expandedFolders.delete(folderPath);
    api.explorer.unwatchDir(folderPath);   // <-- NEW
    render();
  } else if (!entry) {
    // EXPAND
    getOrLoadFolder(folderPath);
    api.explorer.watchDir(folderPath);     // <-- NEW
    render();
  }
  _triggerSave();
}
```

#### collapse-all / refresh buttons — stop all watchers

```js
btnCollapse.onclick = () => {
  for (const p of expandedFolders.keys()) {
    api.explorer.unwatchDir(p);            // <-- NEW: unwatch each before clearing
  }
  expandedFolders.clear();
  selectedFiles.clear();
  lastSelectedFile = null;
  render();
};

btnRefresh.onclick = () => {
  for (const p of expandedFolders.keys()) {
    api.explorer.unwatchDir(p);            // <-- NEW
  }
  expandedFolders.clear();
  render();
  refreshGitStatus();
};
```

#### setRootPath — start watchers for restored expanded paths

In the project-switch path, after restoring saved expanded paths and loading their children, call watchDir for each:

```js
// After restoring savedExpandedPaths for the new rootPath:
for (const folderPath of savedPaths) {
  api.explorer.watchDir(folderPath);       // <-- NEW: watch each restored dir
}
```

---

### 4. renderer.js — project selection subscriber

The subscriber at lines 1585-1595 should watch only the root directory (so top-level adds/removes are detected), not the full tree. FileExplorer's setRootPath will then add deeper dir watchers as folders are expanded:

```js
// BEFORE:
api.explorer.startWatch(project.path);  // recursive watch from root

// AFTER:
api.explorer.watchDir(project.path);    // shallow watch on root only
// (FileExplorer.setRootPath handles watchers for restored expanded dirs)
```

On deselect, api.explorer.stopWatch() already stops everything — no change needed there.

---

## Performance Impact Analysis

### Current (recursive chokidar watch)

| Project type          | Typical non-ignored dirs | Native OS handles |
|-----------------------|--------------------------|-------------------|
| Simple Node app       | ~50–200                  | 50–200            |
| React/Angular SPA     | ~300–800                 | 300–800           |
| Monorepo (Nx/Turborepo)| 2,000–8,000             | 2,000–8,000       |
| .NET solution (Server)| ~500–2,000               | 500–2,000         |

All handles are allocated immediately at startWatch regardless of what is visible.

### After (per-directory non-recursive watch)

Watchers are created only for directories the user has explicitly expanded.

| Typical usage               | Directories watched |
|-----------------------------|---------------------|
| Just opened a project       | 1 (root only)       |
| Expanded 3 source folders   | 4                   |
| Deep navigation of one path | 6–10                |
| Power user with many open   | 20–50               |

**Reduction factor:** 50x–400x fewer OS handles for typical developer usage on a large project.

### Windows-specific benefit

Windows imposes a system-wide limit on fs.watch handles (~8,192 by default via
`FSEventStreamCreate`). Large projects can exhaust this, causing the watcher to silently
stop working. Per-directory watching eliminates this risk entirely for normal usage.

### CPU/startup impact

Chokidar's 'ready' event fires after the initial directory scan. For a large project
this scan itself is expensive (stat() call per entry). With non-recursive per-dir
watches there is no upfront scan — watches are attached lazily as the user navigates.

---

## Files That Need Changes (summary)

| File | Change type | Description |
|------|-------------|-------------|
| `src/main/ipc/explorer.ipc.js` | Refactor | Replace single recursive watcher with Map of non-recursive per-dir watchers; add watchDir/unwatchDir IPC handlers; remove stopWatch (or keep as stopAll) |
| `src/main/preload.js` | Extend + fix | Add watchDir/unwatchDir to explorer namespace; remove duplicate explorer key |
| `src/renderer/ui/components/FileExplorer.js` | Augment | Call watchDir on expand, unwatchDir on collapse, unwatchDir in collapse-all/refresh, watchDir for restored paths in setRootPath |
| `renderer.js` | Update | Change startWatch(project.path) → watchDir(project.path) in project selection subscriber |

No changes needed to `applyWatcherChanges` — it already handles per-visible-folder semantics.
