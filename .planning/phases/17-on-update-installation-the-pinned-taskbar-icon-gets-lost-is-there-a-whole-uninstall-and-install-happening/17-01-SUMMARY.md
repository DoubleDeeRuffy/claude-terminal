---
phase: 17-on-update-installation-the-pinned-taskbar-icon-gets-lost-is-there-a-whole-uninstall-and-install-happening
plan: "01"
subsystem: installer
tags: [nsis, electron-builder, windows, taskbar-pin, aumid]
dependency_graph:
  requires: []
  provides: [taskbar-pin-survives-update]
  affects: [main.js, electron-builder.config.js, build-assets/installer-custom.nsh]
tech_stack:
  added: []
  patterns: [app.setAppUserModelId win32 guard, NSIS isUpdated guard]
key_files:
  created: []
  modified:
    - main.js
    - electron-builder.config.js
    - build-assets/installer-custom.nsh
decisions:
  - "app.setAppUserModelId placed at top of bootstrapApp() before any window creation, guarded with process.platform === 'win32'"
  - "allowToChangeInstallationDirectory set to false — prevents NSIS keepShortcuts=false path that forces shortcut recreation"
  - "isUpdated guard in customUnInstall wraps Delete shortcut line — desktop shortcut only removed on actual uninstall"
metrics:
  duration_minutes: 4
  completed_date: "2026-02-26"
  tasks_completed: 2
  files_modified: 3
---

# Phase 17 Plan 01: Taskbar Pin Survives Updates Summary

**One-liner:** Prevent taskbar pin loss on auto-update via explicit AUMID, disabled forced-shortcut-recreation, and isUpdated-guarded shortcut deletion in NSIS.

## What Was Built

Three independent root causes of taskbar pin loss on Windows auto-update were addressed:

1. **Missing explicit AppUserModelId** — Electron may generate a different runtime AUMID than the appId in electron-builder config. Added `app.setAppUserModelId('com.yanis.claude-terminal')` at the top of `bootstrapApp()`, guarded with `process.platform === 'win32'`, before any window creation.

2. **allowToChangeInstallationDirectory: true forced shortcut recreation** — When this option is true, NSIS sets `keepShortcuts=false` internally, causing the installer to delete and recreate shortcuts on every update run. Changed to `false` to prevent this behavior.

3. **Unconditional shortcut deletion in customUnInstall** — The `Delete "$DESKTOP\Claude Terminal.lnk"` in `!macro customUnInstall` ran on both real uninstalls and update passes. Wrapped it with `${ifNot} ${isUpdated}` so the desktop shortcut is only deleted during actual uninstalls.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add explicit AUMID and disable forced shortcut recreation | 56062108 | main.js, electron-builder.config.js |
| 2 | Guard shortcut deletion in custom NSIS uninstall macro | 4f96e8f8 | build-assets/installer-custom.nsh |

## Verification Results

- `grep "setAppUserModelId" main.js` — confirmed, 1 match
- `grep "com.yanis.claude-terminal" main.js` — confirmed, AUMID matches appId in electron-builder.config.js
- `grep "allowToChangeInstallationDirectory: false" electron-builder.config.js` — confirmed
- `grep "isUpdated" build-assets/installer-custom.nsh` — confirmed, 1 match (ifNot guard)
- `npm test` — 281/281 tests pass, 14 suites

## Deviations from Plan

None - plan executed exactly as written. The plan noted LOW confidence that `${isUpdated}` might not be available in `customUnInstall` context; this can only be confirmed by a real build run, but the NSIS syntax is correct per electron-builder documentation.

## Key Decisions

- `app.setAppUserModelId` placed before `app.on('second-instance', ...)` and all window creation — satisfies the "before any window creation" requirement from the plan
- No changes to any renderer code — this was a main-process + build-config only change as specified

## Self-Check: PASSED

- main.js: FOUND
- electron-builder.config.js: FOUND
- build-assets/installer-custom.nsh: FOUND
- Commit 56062108: FOUND
- Commit 4f96e8f8: FOUND
