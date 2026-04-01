---
phase: "32"
plan: "A"
subsystem: "lifecycle"
tags: [quit-warning, claude-activity, dialog, ipc]
dependency_graph:
  requires: []
  provides: [close-warning-dialog]
  affects: [MainWindow, TrayManager, dialog.ipc, preload, events/index]
tech_stack:
  added: []
  patterns: [ipc-bridge, native-dialog, activity-check]
key_files:
  created: []
  modified:
    - src/main/windows/MainWindow.js
    - src/main/windows/TrayManager.js
    - src/main/ipc/dialog.ipc.js
    - src/main/preload.js
    - src/renderer/events/index.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
decisions:
  - "Use terminalsState status==='working' instead of non-existent isClaudeActive function"
  - "i18n keys added but native dialog uses hardcoded English (main process has no access to renderer i18n)"
metrics:
  duration_minutes: 3
  completed: "2026-03-01T20:59:55Z"
---

# Phase 32 Plan A: Close Warnings Summary

Native quit confirmation dialog when Claude is actively working in any terminal tab.

## What Was Built

Added a confirmation dialog that intercepts quit actions (tray menu Quit, renderer app-quit IPC) when any terminal tab has `status === 'working'`. The dialog lists affected project names and tab names, with "Quit Anyway" and "Cancel" buttons.

### IPC Flow

1. Main process sends `check-claude-activity` to renderer via webContents.send
2. Renderer listener in `events/index.js` iterates all terminals, finds those with `status === 'working'`
3. Renderer responds via `claude-activity-response` IPC with list of active tabs
4. Main process shows native `dialog.showMessageBox` if any active tabs found
5. 2-second timeout if renderer doesn't respond (allows quit on error)

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | IPC bridge and quit gate function | 986ca923 | MainWindow.js, preload.js, events/index.js |
| 2 | Wire quit gate into close paths + i18n | 77779f68 | TrayManager.js, dialog.ipc.js, en.json, fr.json |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Non-existent isClaudeActive function**
- **Found during:** Task 1a
- **Issue:** Plan referenced `isClaudeActive` from `claudeActivity.state.js` which does not exist in the codebase
- **Fix:** Used `terminalsState.get().terminals` and checked `td.status === 'working'` instead, which is the actual activity tracking mechanism
- **Files modified:** src/renderer/events/index.js

## Verification

- `npm run build:renderer` -- PASSED
- `npm test` -- 14 suites, 281 tests passed
- `checkClaudeActivityBeforeQuit` exported from MainWindow.js -- VERIFIED
- `onCheckClaudeActivity` and `respondClaudeActivity` in preload lifecycle -- VERIFIED
- Activity listener wired in events/index.js -- VERIFIED
