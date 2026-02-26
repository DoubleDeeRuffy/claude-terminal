---
status: testing
phase: 17-on-update-installation-the-pinned-taskbar-icon-gets-lost-is-there-a-whole-uninstall-and-install-happening
source: 17-01-SUMMARY.md
started: 2026-02-26T12:00:00Z
updated: 2026-02-26T12:00:00Z
---

## Current Test

number: 3
name: Taskbar pin survives over-install update
expected: |
  Install a previous version, pin it to the taskbar. Then install the newly built version over it.
  After the update install completes and you relaunch, the taskbar pin should still be there — not lost or duplicated.
awaiting: user response

## Tests

### 1. NSIS build compiles cleanly
expected: Run `npm run build:win` — completes without NSIS compile errors. The `${isUpdated}` guard in `customUnInstall` should compile successfully.
result: pass

### 2. AppUserModelId is set on startup
expected: Launch the built app. Open DevTools (Ctrl+Shift+I or --dev flag). In the console, the app should be running normally with no errors related to AppUserModelId. The app title in the taskbar should group correctly with its icon.
result: skipped

### 3. Taskbar pin survives over-install update
expected: Install a previous version, pin it to the taskbar. Then install the newly built version over it. After the update install completes and you relaunch, the taskbar pin should still be there — not lost or duplicated.
result: [pending]

### 4. Desktop shortcut preserved on update install
expected: After the over-install update from test 3, the desktop shortcut "Claude Terminal" should still exist and work. It should NOT be duplicated (no second shortcut created).
result: [pending]

### 5. Clean uninstall removes shortcuts
expected: Uninstall the app via Windows Settings or Control Panel. The desktop shortcut and Start Menu entry should be removed. This confirms the `${isUpdated}` guard only skips deletion during updates, not during real uninstalls.
result: [pending]

## Summary

total: 5
passed: 1
issues: 0
pending: 3
skipped: 1
skipped: 0

## Gaps

[none yet]
