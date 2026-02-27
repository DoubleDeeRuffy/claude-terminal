---
phase: 22-explorer-filewatcher
plan: 04
subsystem: ui
tags: [chokidar, file-watcher, ipc, electron, filetree]

requires:
  - phase: 22-03
    provides: persistent:true chokidar watcher with EPERM error handling and debounced change batching

provides:
  - Per-directory shallow (depth:0) chokidar watcher Map replacing single recursive watcher
  - watchDir/unwatchDir IPC methods in explorer namespace
  - FileExplorer.js wired to call watchDir/unwatchDir on expand/collapse/restore/refresh/collapse-all
  - renderer.js using shallow root-only watchDir on project select

affects: [explorer-filewatcher, FileExplorer, file-watch-performance]

tech-stack:
  added: []
  patterns:
    - "Per-directory watcher Map: dirWatchers Map<dirPath, {watcher, watchId}> allows independent lifecycle per expanded folder"
    - "Closure-based stale check: pushChange captures (myWatchId, watchedDir) and verifies dirWatchers.get(watchedDir).watchId === myWatchId before pushing"
    - "Shared debounce channel: all per-dir watchers feed through single pendingChanges/debounceTimer pipeline"

key-files:
  created: []
  modified:
    - src/main/ipc/explorer.ipc.js
    - src/main/preload.js
    - src/renderer/ui/components/FileExplorer.js
    - renderer.js

key-decisions:
  - "dirWatchers Map<dirPath, {watcher, watchId}> replaces single activeWatcher — enables independent start/stop per expanded directory"
  - "pushChange closure captures (myWatchId, watchedDir) for stale check: dirWatchers.get(watchedDir).watchId !== myWatchId discards events from closed watchers"
  - "flushChanges no longer checks global watchId — stale filtering moved entirely to per-event pushChange for per-dir model"
  - "stopWatch() delegates to stopAllDirWatchers() preserving existing export for app shutdown in main.js"
  - "startWatch kept as alias for watchDir in preload.js for backwards compatibility (no other callers after renderer.js is updated)"
  - "watchDir calls added only in .then() success branches of restoreState and setRootPath — no watcher for directories that fail to load"
  - "renderer.js project subscriber uses watchDir(project.path) for shallow root-only watch; expanded directories get watchers via FileExplorer.js expand/restore"

patterns-established:
  - "Expand->watchDir, collapse->unwatchDir: watcher lifecycle tied exactly to UI expand state"
  - "Batch unwatchDir before clear: collapse-all and refresh iterate expandedFolders.keys() to unwatch before clearing the Map"

requirements-completed: [EXPL-WATCH-01]

duration: 3min
completed: 2026-02-27
---

# Phase 22 Plan 04: Per-Directory Shallow Watcher Refactor Summary

**Replace single recursive chokidar watcher with Map-based per-directory depth:0 watchers wired to FileExplorer expand/collapse lifecycle, reducing OS file handles from thousands to 1-50**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-27T13:37:08Z
- **Completed:** 2026-02-27T13:40:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Replaced `activeWatcher` (single recursive FSWatcher) with `dirWatchers: Map<dirPath, {watcher, watchId}>` — each expanded directory gets its own depth:0 watcher
- Added `watchDir`/`unwatchDir`/`stopAllDirWatchers` functions with proper stale-event detection via per-entry watchId closure check
- Wired FileExplorer.js at all 5 required locations: toggleFolder expand/collapse, btnCollapse, btnRefresh, restoreState, setRootPath saved paths restore
- Updated preload.js: removed duplicate `explorer` namespace, added `watchDir`/`unwatchDir` methods, kept `startWatch` as alias for backwards compat
- Updated renderer.js: `startWatch(project.path)` -> `watchDir(project.path)` for shallow root-only watch on project select
- All 1405 tests pass, renderer bundle builds cleanly

## Task Commits

1. **Task 1: Refactor explorer.ipc.js to per-directory shallow watchers and update preload bridge** - `8a754742` (feat)
2. **Task 2: Wire FileExplorer.js and renderer.js to use per-directory watchers** - `9d9462c3` (feat)

## Files Created/Modified

- `src/main/ipc/explorer.ipc.js` - Full refactor: dirWatchers Map, watchDir/unwatchDir/stopAllDirWatchers, updated pushChange signature, removed startWatch/SOFT_LIMIT/ready handler
- `src/main/preload.js` - Removed duplicate explorer namespace, added watchDir/unwatchDir, startWatch re-routes to explorer:watchDir IPC channel
- `src/renderer/ui/components/FileExplorer.js` - watchDir on expand/restoreState/.then; unwatchDir on collapse/collapse-all/refresh
- `renderer.js` - Changed `api.explorer.startWatch(project.path)` to `api.explorer.watchDir(project.path)`

## Decisions Made

- `pushChange` stale check now uses per-entry `dirWatchers.get(watchedDir).watchId !== myWatchId` instead of global `watchId` — necessary for per-dir model since there is no longer a single global watchId
- `flushChanges` no longer checks global watchId — stale filtering happens entirely in `pushChange` at event time
- `watchDir` calls placed only in `.then()` success branches (not `.catch()`) — avoids watching directories that failed to load
- `startWatch` kept as backwards-compat alias in preload.js routing to `explorer:watchDir` channel — allows renderer.js update to be a single-line change

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Per-directory shallow watcher model fully implemented and wired
- OS handle count now scales with expanded directory count (1-50) instead of total project directory count (thousands for monorepos)
- Phase 22 gap closure for watcher performance blocker is complete

---
*Phase: 22-explorer-filewatcher*
*Completed: 2026-02-27*
