---
phase: 22-explorer-filewatcher
plan: 01
subsystem: ui
tags: [chokidar, file-watcher, ipc, electron, filewatcher, explorer]

# Dependency graph
requires: []
provides:
  - Chokidar file watcher service in main process with debounced event batching
  - IPC handlers for explorer:startWatch and explorer:stopWatch
  - Preload bridge explorer namespace with startWatch, stopWatch, onChanges, onWatchLimitWarning
affects:
  - 22-explorer-filewatcher (Plan 02 will consume this API from renderer)

# Tech tracking
tech-stack:
  added: ["chokidar@^4.0.3 (pure JS, no electron-rebuild required)"]
  patterns:
    - "watchId guard pattern for stale debounce timers across watch cycles"
    - "fire-and-forget ipcMain.on (not ipcMain.handle) for lifecycle control messages"
    - "createListener() for push-event channels following terminal.onData pattern"

key-files:
  created:
    - src/main/ipc/explorer.ipc.js
  modified:
    - src/main/ipc/index.js
    - src/main/preload.js

key-decisions:
  - "chokidar@^4 chosen over v3 — pure JS avoids electron-rebuild; installed with --ignore-scripts to bypass better-sqlite3 native rebuild"
  - "DEBOUNCE_MS=350ms within 300-500ms plan range — balances UI responsiveness against event storm suppression"
  - "persistent: false on chokidar watcher — does not prevent the Electron process from exiting"
  - "ignoreInitial: true — watcher only reports changes, not the initial directory scan"
  - "watchId integer guard on pushChange and flushChanges discards stale events from closed watchers without needing weak refs"
  - "SOFT_LIMIT=10000 paths triggers explorer:watchLimitWarning IPC message — renderer decides what to do"
  - "error events silently ignored — permission-denied subdirs are expected and non-fatal"

patterns-established:
  - "watchId guard: increment on stopWatch(), capture myWatchId at startWatch() entry, check before any state mutation"

requirements-completed: [EXPL-WATCH-01]

# Metrics
duration: 12min
completed: 2026-02-27
---

# Phase 22 Plan 01: Explorer Filewatcher — Main Process Service Summary

**Chokidar v4 file watcher in main process with debounced 350ms batching, watchId stale-event guard, and preload bridge exposing startWatch/stopWatch/onChanges to renderer**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-02-27T10:33:00Z
- **Completed:** 2026-02-27T10:45:09Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Installed chokidar@^4.0.3 (pure JS, no electron-rebuild needed) with `--ignore-scripts` workaround for better-sqlite3
- Created `explorer.ipc.js` with full watcher lifecycle: `startWatch`, `stopWatch`, watchId stale-event guard, IGNORED_DIRS mirror of FileExplorer.js, 350ms debounce batching, and SOFT_LIMIT warning
- Registered `registerExplorerHandlers(mainWindow)` in `src/main/ipc/index.js`
- Added `explorer` namespace to `window.electron_api` in preload bridge with 4 methods

## Task Commits

Each task was committed atomically:

1. **Task 1: Create explorer.ipc.js with chokidar watcher and IPC handlers** - `e0a23d42` (feat)
2. **Task 2: Register explorer handlers in IPC index and expose via preload bridge** - `95596f81` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `src/main/ipc/explorer.ipc.js` — New: chokidar watcher service, stopWatch/startWatch, pushChange debounce, flushChanges IPC send, registerExplorerHandlers
- `src/main/ipc/index.js` — Added: require('./explorer.ipc') and registerExplorerHandlers(mainWindow) call
- `src/main/preload.js` — Added: explorer namespace with startWatch, stopWatch, onChanges, onWatchLimitWarning

## Decisions Made

- **chokidar v4 over v3:** Pure JS removes need for electron-rebuild; installed with `--ignore-scripts` to avoid triggering better-sqlite3 native compilation during install
- **watchId integer guard:** Incremented on every `stopWatch()` call; each watcher captures its `myWatchId` at creation time; any debounce callback or pushChange from a closed watcher is discarded without error
- **persistent: false:** Does not keep the Electron process alive if all windows close
- **ignoreInitial: true:** Watcher reports only changes after startup, not the full initial scan — renderer already has the directory tree from FileExplorer.js
- **350ms debounce:** Within the plan's specified 300-500ms range; balances responsiveness against event storm on large renames
- **SOFT_LIMIT=10000:** Fires `explorer:watchLimitWarning` IPC message; renderer will handle what to show
- **Silent error handler:** Permission-denied errors on subdirectories are expected on Windows and treated as non-fatal

## Deviations from Plan

**1. [Rule 3 - Blocking] Used `--ignore-scripts` flag to install chokidar**
- **Found during:** Task 1 (npm install chokidar)
- **Issue:** `npm install chokidar@^4.0.3` without flags triggered electron-rebuild for `better-sqlite3`, which fails due to missing ClangCL toolset in Visual Studio 2022
- **Fix:** Used `npm install chokidar@^4.0.3 --ignore-scripts` — chokidar v4 is pure JS and does not require native compilation; only native addons need scripts
- **Files modified:** package.json, package-lock.json
- **Verification:** `node -e "require('chokidar'); console.log('OK')"` passes
- **Committed in:** e0a23d42 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Install flag difference only; chokidar is fully installed and functional. No behavior change.

## Issues Encountered

- better-sqlite3 native rebuild triggered by bare `npm install` — resolved by `--ignore-scripts` since chokidar v4 is pure JS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Main process watcher backend is complete and tested (562 tests passing, build:renderer passing)
- Plan 02 can now subscribe to `electron_api.explorer.onChanges` in the renderer to react to file system events and refresh the FileExplorer tree automatically

---
*Phase: 22-explorer-filewatcher*
*Completed: 2026-02-27*
