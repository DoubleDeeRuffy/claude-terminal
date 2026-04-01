---
phase: 30-support-nsis-silent
plan: 30A
type: execute
wave: 1
depends_on: []
files_modified:
  - build-assets/installer-custom.nsh
  - src/main/windows/SetupWizardWindow.js
autonomous: true
requirements:
  - SILENT-01
  - SILENT-02
  - SILENT-03

must_haves:
  truths:
    - "NSIS installer respects /S flag for silent install (no wizard UI)"
    - "Auto-updates via electron-updater work without showing wizard"
    - "First app launch after silent install skips setup wizard and applies defaults (hooks ON, startup OFF)"
    - "Marker file is cleaned up after first launch"
    - "Normal (non-silent) installs still show wizard as before"
    - "Updates do not write marker file or re-apply defaults"
  artifacts:
    - path: "build-assets/installer-custom.nsh"
      provides: "Silent install support with marker file"
      contains: "customInstall"
    - path: "src/main/windows/SetupWizardWindow.js"
      provides: "Silent install detection and default application"
      exports: ["isFirstLaunch", "createSetupWizardWindow"]
  key_links:
    - from: "build-assets/installer-custom.nsh"
      to: "src/main/windows/SetupWizardWindow.js"
      via: ".silent-install marker file in ~/.claude-terminal/"
      pattern: "\\.silent-install"
    - from: "src/main/windows/SetupWizardWindow.js"
      to: "src/main/services/HooksService.js"
      via: "fire-and-forget installHooks() call"
      pattern: "HooksService\\.installHooks"
---

<objective>
Make the NSIS installer respect the `/S` (silent) flag by removing the `SetSilent normal` override, and add silent install detection so the app skips the setup wizard and applies sensible defaults on first launch after a silent install.

Purpose: Enables scripted/enterprise deployment via `installer.exe /S` and fixes broken auto-updates (electron-updater passes `/S` which was being overridden back to wizard mode).
Output: Updated installer script and setup wizard detection logic.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.gsd/PROJECT.md
@.gsd/ROADMAP.md
@.gsd/STATE.md
@.gsd/phases/30-support-nsis-silent/30-CONTEXT.md
@.gsd/phases/30-support-nsis-silent/30-RESEARCH.md
@build-assets/installer-custom.nsh
@src/main/windows/SetupWizardWindow.js
@src/main/utils/paths.js

<interfaces>
<!-- From src/main/utils/paths.js -->
```javascript
const dataDir = path.join(homeDir, '.claude-terminal');  // line 12
const settingsFile = path.join(dataDir, 'settings.json'); // line 16
function ensureDataDir() { ... }  // creates dataDir if missing
module.exports = { ..., dataDir, settingsFile, ensureDataDir, ... };
```

<!-- From src/main/windows/SetupWizardWindow.js -->
```javascript
function isFirstLaunch() { ... }  // checks settings.setupCompleted
function createSetupWizardWindow({ onComplete, onSkip }) { ... }
function saveSetupSettings(wizardSettings) { ... }  // merges into settings.json
module.exports = { createSetupWizardWindow, closeSetupWizard, isFirstLaunch, getSetupWizardWindow };
```

<!-- From src/main/services/HooksService.js -->
```javascript
// installHooks() is async — returns a Promise
async function installHooks() { ... }
module.exports = { installHooks, ... };
```

<!-- main.js initializeApp() flow (lines 134-151) -->
```javascript
function initializeApp() {
  if (isFirstLaunch()) {
    createSetupWizardWindow({ onComplete: (settings) => { ... launchMainApp(); }, onSkip: () => { launchMainApp(); } });
  } else {
    launchMainApp();
  }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix NSIS installer for silent mode support</name>
  <files>build-assets/installer-custom.nsh</files>
  <action>
Rewrite the `customInit` and add `customInstall` macro in `build-assets/installer-custom.nsh`:

1. **`customInit` macro:** Remove `SetSilent normal`. Replace with a comment explaining why it was removed:
   ```nsis
   !macro customInit
     ; No-op: let NSIS respect whatever mode was requested (/S for silent, normal otherwise)
     ; Previously had "SetSilent normal" which broke silent installs and auto-updates
   !macroend
   ```

2. **Add `customInstall` macro** (place it between `customInit` and `customUnInstall`):
   ```nsis
   !macro customInstall
     ; Write marker file for first-time silent installs (not updates)
     ; so the app can skip the setup wizard and apply defaults
     ${if} ${Silent}
     ${andIfNot} ${isUpdated}
       CreateDirectory "$PROFILE\.claude-terminal"
       FileOpen $0 "$PROFILE\.claude-terminal\.silent-install" w
       FileWrite $0 "1"
       FileClose $0
     ${endif}
   !macroend
   ```

3. **`customUnInstall` macro:** Leave completely unchanged.

4. **All MUI defines** (welcome page, finish page, abort warning, uninstaller text): Leave completely unchanged.

Key details:
- `${Silent}` is an NSIS built-in that is true when `/S` flag was passed
- `${isUpdated}` is electron-builder generated, true when `--updated` was passed (auto-update path)
- `$PROFILE` maps to `%USERPROFILE%` which equals `os.homedir()` in Node.js
- `customInstall` runs AFTER files are installed (correct timing for file writes)
- The guard `${andIfNot} ${isUpdated}` prevents marker file on auto-updates
  </action>
  <verify>
    <automated>grep -c "SetSilent normal" build-assets/installer-custom.nsh | grep -q "^0$" && grep -q "customInstall" build-assets/installer-custom.nsh && grep -q "silent-install" build-assets/installer-custom.nsh && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>`SetSilent normal` removed. `customInstall` macro writes `.silent-install` marker only for fresh silent installs (not updates). `customUnInstall` unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Add silent install detection to SetupWizardWindow</name>
  <files>src/main/windows/SetupWizardWindow.js</files>
  <action>
Modify `src/main/windows/SetupWizardWindow.js` to detect the `.silent-install` marker file and apply defaults:

1. **Add `dataDir` import** — update the existing require from paths:
   ```javascript
   const { settingsFile, ensureDataDir, dataDir } = require('../utils/paths');
   ```

2. **Add `applySilentInstallDefaults()` function** (before `isFirstLaunch()`):
   ```javascript
   function applySilentInstallDefaults() {
     ensureDataDir();
     const defaults = {
       setupCompleted: true,
       hooksEnabled: true,
       launchAtStartup: false
     };

     let existing = {};
     try {
       if (fs.existsSync(settingsFile)) {
         existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
       }
     } catch (e) { /* ignore corrupt settings */ }

     // Only apply if not already set up (safety guard)
     if (!existing.setupCompleted) {
       fs.writeFileSync(settingsFile, JSON.stringify({ ...existing, ...defaults }, null, 2));
     }

     // Fire-and-forget hook installation (async, but we don't block on it)
     try {
       const HooksService = require('../services/HooksService');
       HooksService.installHooks().catch(e => {
         console.error('Failed to install hooks after silent install:', e);
       });
     } catch (e) {
       console.error('Failed to load HooksService after silent install:', e);
     }
   }
   ```

3. **Modify `isFirstLaunch()`** to check for silent install marker BEFORE checking settings:
   ```javascript
   function isFirstLaunch() {
     try {
       // Check for silent install marker first
       const silentMarker = path.join(dataDir, '.silent-install');
       if (fs.existsSync(silentMarker)) {
         applySilentInstallDefaults();
         try { fs.unlinkSync(silentMarker); } catch (e) { /* ignore */ }
         return false; // Skip wizard
       }

       if (fs.existsSync(settingsFile)) {
         const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
         return !settings.setupCompleted;
       }
     } catch (e) {}
     return true;
   }
   ```

Key details:
- `isFirstLaunch()` is synchronous and called from `initializeApp()` in `main.js` — no changes needed to main.js
- When marker is found: apply defaults, delete marker, return `false` so `initializeApp()` goes straight to `launchMainApp()`
- `HooksService.installHooks()` is async — use `.catch()` for fire-and-forget pattern (hooks can be manually installed later if this fails)
- The `require('../services/HooksService')` is deferred (inside function body) to avoid circular dependency issues — same pattern used in `registerSetupHandlers()`
- Marker deletion uses try/catch since the file might already be gone (race condition safety)
- The `!existing.setupCompleted` guard prevents overwriting user settings if somehow both marker and settings exist
  </action>
  <verify>
    <automated>grep -q "applySilentInstallDefaults" src/main/windows/SetupWizardWindow.js && grep -q "silent-install" src/main/windows/SetupWizardWindow.js && grep -q "dataDir" src/main/windows/SetupWizardWindow.js && grep -q "installHooks" src/main/windows/SetupWizardWindow.js && npm test 2>&1 | tail -5 && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
`isFirstLaunch()` detects `.silent-install` marker, applies defaults (hooks ON, startup OFF, setupCompleted true), deletes marker, and returns false to skip wizard. Hook installation is fire-and-forget async. Normal installs unaffected — marker only exists after NSIS silent install.
  </done>
</task>

</tasks>

<verification>
1. `SetSilent normal` no longer appears in `build-assets/installer-custom.nsh`
2. `customInstall` macro exists and writes `.silent-install` marker with proper `${Silent}` and `${isUpdated}` guards
3. `customUnInstall` macro is unchanged
4. `SetupWizardWindow.js` checks for `.silent-install` marker before checking settings
5. Silent install defaults match CONTEXT.md decisions: hooks ON, startup OFF, setupCompleted true
6. Marker file is deleted after detection
7. `npm test` passes (no regressions)
</verification>

<success_criteria>
- NSIS installer no longer overrides `/S` flag
- Silent installs write `.silent-install` marker to `~/.claude-terminal/`
- Auto-updates (which pass `--updated /S`) do NOT write marker (guarded by `${isUpdated}`)
- App detects marker on first launch, applies defaults, deletes marker, skips wizard
- Normal wizard-based installs continue to work as before
- All existing tests pass
</success_criteria>

<output>
After completion, create `.gsd/phases/30-support-nsis-silent/30A-SUMMARY.md`
</output>
