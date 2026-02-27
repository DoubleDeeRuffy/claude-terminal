---
phase: 22-explorer-filewatcher
plan: 03
subsystem: ui
tags: [chokidar, file-watcher, ipc, electron, explorer, error-handling, windows, eperm]

# Dependency graph
requires:
  - phase: 22-explorer-filewatcher (Plan 02)
    provides: "applyWatcherChanges in FileExplorer.js, onChanges/onWatchLimitWarning wiring in renderer.js, watcher lifecycle on project switch"
provides:
  - Chokidar watcher with persistent:true and ignorePermissionErrors:true in explorer.ipc.js
  - Error-safe onChanges callback in renderer.js (.catch on async call)
  - Error-safe applyWatcherChanges in FileExplorer.js (top-level try-catch)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "persistent:true in chokidar activates native error listener (handler.js:175-198) that silently swallows EPERM from Windows directory deletion"
    - "ignorePermissionErrors:true as defense-in-depth for EACCES/EPERM from unreadable subdirectories"
    - ".catch on async IPC callbacks prevents unhandled rejections from surfacing as Electron error dialogs"
    - "Top-level try-catch in best-effort async functions: file watcher patches are idempotent, silently swallowing errors is correct"

key-files:
  created: []
  modified:
    - src/main/ipc/explorer.ipc.js
    - renderer.js
    - src/renderer/ui/components/FileExplorer.js

key-decisions:
  - "persistent:true chosen over persistent:false: watcher is explicitly managed via stopWatch() on project switch and app quit, so keeping process alive is safe and necessary for chokidar's EPERM workaround"
  - "catch block in applyWatcherChanges does NOT log: file watcher events are transient and stale-path errors are expected on rapid filesystem changes — logging would be noisy and confusing"
  - "existing .on('error', () => {}) handler on line 160-162 left as-is: provides third layer of error absorption in addition to persistent+ignorePermissionErrors"

patterns-established:
  - "Three-layer error absorption for file watchers: ignorePermissionErrors -> persistent-mode native handler -> .on('error') sink"
  - "Promise chain error handling: async IPC callbacks always need .catch() at call site in renderer.js"

requirements-completed: [EXPL-WATCH-01]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 22 Plan 03: Explorer Filewatcher — Gap Closure (Error Handling) Summary

**Chokidar file watcher patched with persistent:true and ignorePermissionErrors:true; renderer error paths wrapped with .catch() and try-catch to prevent EPERM/uncaught exception dialogs on Windows directory deletion**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-27T13:45:44Z
- **Completed:** 2026-02-27T13:47:11Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Changed `persistent: false` to `persistent: true` in `explorer.ipc.js` chokidar.watch options — activates chokidar's native FSWatcher error listener (handler.js:175-198) which silently swallows EPERM errors from watched directory deletions on Windows
- Added `ignorePermissionErrors: true` as defense-in-depth — chokidar silently ignores EACCES/EPERM from subdirectories the user lacks read access to
- Wrapped `FileExplorer.applyWatcherChanges(changes)` call in renderer.js with `.catch(() => {})` — prevents unhandled promise rejections from surfacing as Electron `dialog.showErrorBox`
- Wrapped entire `applyWatcherChanges` body in try-catch in FileExplorer.js — file watcher patches are best-effort; silently ignoring stale path errors on rapid filesystem changes is correct behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix chokidar persistent mode and add ignorePermissionErrors** - `c4ef1b9b` (fix)
2. **Task 2: Add error handling to renderer onChanges callback and applyWatcherChanges** - `18c52ae7` (fix)

**Plan metadata:** `7e894d6e` (docs: complete gap closure plan for filewatcher error handling)

## Files Created/Modified

- `src/main/ipc/explorer.ipc.js` — Changed: `persistent: false` -> `persistent: true`; Added: `ignorePermissionErrors: true`
- `renderer.js` — Changed: bare `applyWatcherChanges(changes)` call wrapped with `.catch(() => {})`
- `src/renderer/ui/components/FileExplorer.js` — Changed: entire `applyWatcherChanges` body wrapped in try-catch

## Decisions Made

- **persistent:true is safe here:** Unlike the Phase 21 markdown viewer which uses raw `fs.watch`, chokidar's watcher is explicitly managed via `stopWatch()` on project switch and app quit — there is no risk of keeping Electron alive unexpectedly.
- **Silent catch, no logging:** File watcher changes are transient. Stale-path errors during rapid filesystem activity (e.g., deleting a directory while watching it) are expected and harmless. Logging them would create noisy false-alarm console output.
- **Existing `.on('error', () => {})` left unchanged:** It provides a third layer of error absorption after `ignorePermissionErrors` and the persistent-mode native handler. Three layers ensures no EPERM path goes unhandled.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 22 is now fully complete: chokidar watcher (Plan 01) + renderer wiring (Plan 02) + error hardening (Plan 03)
- File explorer automatically reflects external filesystem changes on Windows without EPERM dialogs or uncaught exception popups
- All 281 tests pass; `npm run build:renderer` succeeds

## Self-Check: PASSED

- `src/main/ipc/explorer.ipc.js` — FOUND (`persistent: true` and `ignorePermissionErrors: true` confirmed)
- `renderer.js` — FOUND (`.catch(` in FILE WATCHER section confirmed)
- `src/renderer/ui/components/FileExplorer.js` — FOUND (`try {` in `applyWatcherChanges` at line 478 confirmed)
- Commit `c4ef1b9b` — FOUND
- Commit `18c52ae7` — FOUND

---
*Phase: 22-explorer-filewatcher*
*Completed: 2026-02-27*
