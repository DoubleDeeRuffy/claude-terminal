# Phase 30 Context: Support-NSIS-Silent

## Phase Goal

Make the NSIS installer respect the `/S` (silent) flag for both install and uninstall, and fix the `SetSilent normal` override that currently forces wizard mode regardless of how the installer is invoked.

## Decisions

### 1. Silent Install Defaults & Behavior

- **Hooks:** ON by default (applied automatically, same as if user opted in during wizard)
- **Launch at startup:** OFF by default
- **Setup wizard:** SKIPPED entirely — mark `setupCompleted: true` and apply defaults without showing UI
- **Shortcuts:** Created (desktop + start menu), same as normal install
- **Post-install launch:** NO — install and exit quietly, do not start the app

### 2. Update Path / SetSilent Fix

- **Core issue:** `installer-custom.nsh` contains `SetSilent normal` in the `customInit` macro, which overrides the `/S` flag passed on the command line
- **Impact:** Silent install (`/S`) does not work at all. This also likely breaks electron-updater auto-updates, which invoke the new installer with `/S` for seamless upgrades
- **Fix:** Remove `SetSilent normal` so the installer respects whatever mode it was called with — wizard if invoked normally, silent if invoked with `/S`
- **Research needed:** Confirm whether electron-updater actually passes `/S` and whether this fix resolves auto-update issues

### 3. Silent Uninstall

- **Supported:** Yes, silent uninstall via `/S` flag
- **Behavior:** Removes app files only — `~/.claude-terminal/` and user settings are NOT touched (already the current behavior, no changes needed)
- **Desktop shortcut cleanup:** Same logic as normal uninstall (delete shortcut on real uninstall, preserve on update)

## Code Context

### Files to modify
- `build-assets/installer-custom.nsh` — Remove `SetSilent normal`, handle silent-mode defaults
- `src/main/windows/SetupWizardWindow.js` — Skip wizard when silent-installed (detect via flag or missing interaction)

### Key patterns
- `electron-builder.config.js`: `oneClick: false`, `perMachine: false`, `allowElevation: true`
- `customInit` macro in `.nsh` currently forces `SetSilent normal`
- `customUnInstall` macro checks `${isUpdated}` to distinguish update from real uninstall
- Setup wizard writes `setupCompleted`, `hooksEnabled`, `launchAtStartup` to `~/.claude-terminal/settings.json`
- `SetupWizardWindow.js` checks `settings.setupCompleted` to decide whether to show wizard

### Silent-mode setup wizard skip approach
When app launches for first time after silent install, `setupCompleted` won't exist in settings. The app needs to detect it was silently installed and auto-apply defaults (hooks on, startup off, setupCompleted true) without showing the wizard window.

**Detection options to research:**
- Command-line arg passed by NSIS (e.g., `--silent-install`)
- Registry key written by NSIS during silent install
- Environment variable set during install

## Deferred Ideas

None.

## Next Steps

Research, then plan.
