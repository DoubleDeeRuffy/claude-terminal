---
phase: 7-options-in-settings-for-hotkeys-from-phase-02
plan: 02
subsystem: ui
tags: [electron, ipc, keyboard-shortcuts, main-process, before-input-event]

# Dependency graph
requires:
  - phase: 7-01
    provides: ctrlTab toggle in ShortcutsManager UI with terminalShortcuts.ctrlTab.enabled setting
provides:
  - IPC chain from renderer settings to main process for Ctrl+Tab enable/disable
  - setCtrlTabEnabled exported from MainWindow.js with ctrlTabEnabled flag
  - terminal:setCtrlTabEnabled IPC handler in dialog.ipc.js
  - Startup sync of ctrlTab setting on app launch
  - Immediate main-process flag update on settings change via settingsState subscriber
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [lazy-require in ipcMain handler for main-window access without circular deps]

key-files:
  created: []
  modified:
    - src/main/windows/MainWindow.js
    - src/main/preload.js
    - src/main/ipc/dialog.ipc.js
    - renderer.js

key-decisions:
  - "Startup sync uses !== false default so undefined/missing ctrlTab setting defaults to enabled, matching defaultSettings"
  - "settingsState subscriber compares prevCtrlTabEnabled to avoid redundant IPC calls on unrelated settings changes"
  - "Lazy require of MainWindow inside ipcMain handler follows established Phase 04 pattern to avoid circular deps"

patterns-established:
  - "Lazy require inside ipcMain handler for cross-module window access without circular dependency"

requirements-completed: [TERM-V2-01]

# Metrics
duration: 8min
completed: 2026-02-25
---

# Phase 7 Plan 02: Wire Ctrl+Tab IPC to Main Process Summary

**Full IPC chain from renderer settings to main-process before-input-event intercept — disabling Ctrl+Tab in settings now stops tab-switching immediately without app restart**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-25T00:00:00Z
- **Completed:** 2026-02-25T00:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `ctrlTabEnabled` module-level flag in MainWindow.js that gates the Ctrl+Tab before-input-event intercept
- Created full IPC chain: `api.terminal.setCtrlTabEnabled()` in preload -> `terminal:setCtrlTabEnabled` handler in dialog.ipc.js -> `setCtrlTabEnabled()` in MainWindow.js
- Startup sync reads `terminalShortcuts.ctrlTab.enabled` from settings after `initializeState()` and fires IPC to main process before first terminal interaction
- `settingsState.subscribe()` listener detects ctrlTab toggle changes and immediately syncs to main process

## Task Commits

Each task was committed atomically:

1. **Task 1: Add setCtrlTabEnabled IPC chain (MainWindow + preload + IPC handler)** - `df45695` (feat)
2. **Task 2: Sync Ctrl+Tab setting on startup and on settings change** - `517d8c4` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified

- `src/main/windows/MainWindow.js` - Added `ctrlTabEnabled` flag, `setCtrlTabEnabled()` function, flag check in before-input-event handler, export
- `src/main/preload.js` - Added `setCtrlTabEnabled` to terminal namespace IPC bridge
- `src/main/ipc/dialog.ipc.js` - Added `terminal:setCtrlTabEnabled` IPC handler with lazy require
- `renderer.js` - Added startup sync after `initializeState()` and `settingsState.subscribe()` listener

## Decisions Made

- Startup sync uses `!== false` (not `=== true`) so that if the setting is undefined/missing, it defaults to enabled — consistent with defaultSettings where ctrlTab.enabled is true
- `settingsState.subscribe()` tracks `_prevCtrlTabEnabled` to avoid IPC calls on unrelated settings changes
- Lazy `require('../windows/MainWindow')` inside the ipcMain handler follows the established Phase 04 pattern for avoiding circular dependencies

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 7 is now fully complete: Ctrl+Tab toggle in settings (Plan 7-01) is wired to the main process (Plan 7-02) and takes effect immediately
- Ready for Phase 8 (Rename App Title) or Phase 9 (Remember Window State)

---
*Phase: 7-options-in-settings-for-hotkeys-from-phase-02*
*Completed: 2026-02-25*
