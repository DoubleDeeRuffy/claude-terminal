---
phase: 30-support-nsis-silent
plan: 30A
status: complete
---

# Plan 30A Summary: NSIS Silent Install Support

## What Changed

### `build-assets/installer-custom.nsh`
- **Removed** `SetSilent normal` from `customInit` macro — NSIS now respects `/S` flag
- **Added** `customInstall` macro that writes `.silent-install` marker to `~/.claude-terminal/` for first-time silent installs (guarded by `${Silent}` and `${andIfNot} ${isUpdated}`)
- `customUnInstall` unchanged

### `src/main/windows/SetupWizardWindow.js`
- **Added** `dataDir` import from paths utility
- **Added** `applySilentInstallDefaults()` — writes `setupCompleted: true`, `hooksEnabled: true`, `launchAtStartup: false` to settings, fire-and-forget hook installation
- **Modified** `isFirstLaunch()` — checks for `.silent-install` marker before settings check; if found, applies defaults, deletes marker, returns `false` to skip wizard

## Impact
- Silent installs (`installer.exe /S`) now work correctly
- Auto-updates via electron-updater no longer show wizard UI (the `/S` flag is no longer overridden)
- Normal wizard installs unaffected
- Updates do not write marker (guarded by `${isUpdated}`)

## Tests
All 1124 tests pass — no regressions.
