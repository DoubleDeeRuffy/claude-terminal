---
phase: 7-options-in-settings-for-hotkeys-from-phase-02
plan: 02
type: execute
wave: 2
depends_on: [7-01]
files_modified:
  - src/main/windows/MainWindow.js
  - src/main/preload.js
  - src/main/ipc/dialog.ipc.js
  - src/renderer/index.js
autonomous: true
requirements: [TERM-V2-01]

must_haves:
  truths:
    - "User can disable Ctrl+Tab tab-switching in settings and it stops working immediately (main process no longer intercepts)"
    - "User can re-enable Ctrl+Tab and it works again without restarting the app"
    - "On app startup, the Ctrl+Tab setting is synced to the main process before any user interaction"
  artifacts:
    - path: "src/main/windows/MainWindow.js"
      provides: "ctrlTabEnabled flag and setCtrlTabEnabled export"
      contains: "setCtrlTabEnabled"
    - path: "src/main/preload.js"
      provides: "setCtrlTabEnabled in terminal namespace"
      contains: "setCtrlTabEnabled"
    - path: "src/main/ipc/dialog.ipc.js"
      provides: "terminal:setCtrlTabEnabled IPC handler"
      contains: "terminal:setCtrlTabEnabled"
  key_links:
    - from: "src/renderer/index.js"
      to: "src/main/windows/MainWindow.js"
      via: "api.terminal.setCtrlTabEnabled IPC on startup and settings change"
      pattern: "setCtrlTabEnabled"
    - from: "src/main/ipc/dialog.ipc.js"
      to: "src/main/windows/MainWindow.js"
      via: "require and call setCtrlTabEnabled"
      pattern: "setCtrlTabEnabled"
---

<objective>
Wire the Ctrl+Tab enable/disable setting from the renderer to the main process via IPC, so that disabling Ctrl+Tab in settings actually stops the main-process before-input-event intercept. Also sync the initial setting value on app startup.

Purpose: Complete the Ctrl+Tab toggle — Plan 7-01 added the UI toggle but the main process still intercepts the key regardless. This plan closes the loop.
Output: Full IPC chain from renderer settings → main process flag, with startup sync.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/7-options-in-settings-for-hotkeys-from-phase-02/7-RESEARCH.md
@.planning/phases/7-options-in-settings-for-hotkeys-from-phase-02/7-01-SUMMARY.md
@src/main/windows/MainWindow.js
@src/main/preload.js
@src/main/ipc/dialog.ipc.js
@src/renderer/index.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add setCtrlTabEnabled IPC chain (MainWindow + preload + IPC handler)</name>
  <files>
    src/main/windows/MainWindow.js
    src/main/preload.js
    src/main/ipc/dialog.ipc.js
  </files>
  <action>
**MainWindow.js:**
1. Add a module-level flag: `let ctrlTabEnabled = true;`
2. Add an exported function:
```js
function setCtrlTabEnabled(enabled) {
  ctrlTabEnabled = !!enabled;
}
```
3. In the existing `before-input-event` handler, find the `if (input.key === 'Tab' ...)` branch that intercepts Ctrl+Tab. Wrap it with the flag check:
```js
if (input.key === 'Tab' && ctrlTabEnabled) {
  // existing event.preventDefault() and webContents.send('ctrl-tab', ...) logic
}
```
If `ctrlTabEnabled` is false, the key passes through to Chromium normally (which means xterm won't see it either, but that's expected — when disabled, Ctrl+Tab does nothing in the app).
4. Export `setCtrlTabEnabled` in the module.exports alongside `createMainWindow` and `getMainWindow`.

**preload.js:**
In the `terminal` namespace object, add:
```js
setCtrlTabEnabled: (enabled) => ipcRenderer.invoke('terminal:setCtrlTabEnabled', enabled)
```
This follows the exact pattern of other terminal namespace methods.

**dialog.ipc.js:**
Add a new IPC handler (near the other misc handlers):
```js
ipcMain.handle('terminal:setCtrlTabEnabled', (_, enabled) => {
  const { setCtrlTabEnabled } = require('../windows/MainWindow');
  setCtrlTabEnabled(!!enabled);
});
```
Use lazy require to avoid circular dependency issues (same pattern as Phase 04 decisions — lazy require inside function call).
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && npm run build:renderer 2>&amp;1 | tail -5</automated>
    <manual>Verify setCtrlTabEnabled exported from MainWindow.js, present in preload.js terminal namespace, and handler registered in dialog.ipc.js</manual>
  </verify>
  <done>setCtrlTabEnabled flag in MainWindow.js gates the before-input-event Ctrl+Tab intercept. IPC handler registered. Preload bridge exposes api.terminal.setCtrlTabEnabled. Renderer builds cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Sync Ctrl+Tab setting on startup and on settings change</name>
  <files>
    src/renderer/index.js
  </files>
  <action>
**Startup sync:**
In `src/renderer/index.js`, after the settings are loaded (after `initializeState()` or wherever settings are first available), add:
```js
// Sync Ctrl+Tab enabled state to main process
const ts = getSetting('terminalShortcuts') || {};
api.terminal.setCtrlTabEnabled(ts.ctrlTab?.enabled !== false);
```
This must run AFTER settings are loaded but BEFORE any terminal interaction. Place it near where other startup IPC calls happen (e.g., near the Phase 04 restore loop or after initializeState).

**Settings change sync:**
Subscribe to settings changes in `src/renderer/index.js` so that when the user toggles Ctrl+Tab in the ShortcutsManager panel, the main process is notified immediately. Add a `settingsState.subscribe()` listener that detects when `terminalShortcuts.ctrlTab.enabled` changes and fires the IPC call:
```js
// In renderer/index.js, after startup sync
let prevCtrlTabEnabled = ts.ctrlTab?.enabled !== false;
settingsState.subscribe(() => {
  const current = getSetting('terminalShortcuts')?.ctrlTab?.enabled !== false;
  if (current !== prevCtrlTabEnabled) {
    prevCtrlTabEnabled = current;
    api.terminal.setCtrlTabEnabled(current);
  }
});
```
IMPORTANT: This subscriber lives in `src/renderer/index.js` only. Do NOT modify ShortcutsManager.js in this plan (it is owned by Plan 7-01).

IMPORTANT: The `api` variable must be accessible. In renderer code, it's typically `window.electron_api` or aliased. Check the existing code for the correct reference pattern at the location where you place the call.

IMPORTANT: The startup call uses `!== false` (not `=== true`) so that if the setting is undefined/missing, it defaults to enabled (matching the defaultSettings where ctrlTab.enabled is true).
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && npm run build:renderer 2>&amp;1 | tail -5 && npm test 2>&amp;1 | tail -10</automated>
    <manual>Verify api.terminal.setCtrlTabEnabled is called in startup path and in the ctrlTab toggle handler</manual>
  </verify>
  <done>Ctrl+Tab enabled state synced to main process on startup. Toggling ctrlTab in ShortcutsManager immediately fires IPC to update main process flag. Disabling Ctrl+Tab in settings stops tab-switching; re-enabling restores it. Renderer builds and tests pass.</done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` succeeds
2. `npm test` passes
3. grep confirms `setCtrlTabEnabled` in MainWindow.js (definition + export), preload.js (bridge), dialog.ipc.js (handler)
4. grep confirms `api.terminal.setCtrlTabEnabled` in renderer code (startup call + settings change call)
5. grep confirms `ctrlTabEnabled` flag checked in before-input-event handler in MainWindow.js
</verification>

<success_criteria>
- Disabling Ctrl+Tab in settings stops tab-switching in the terminal
- Re-enabling Ctrl+Tab restores tab-switching without app restart
- On fresh startup, Ctrl+Tab state matches the saved setting
- All existing tests pass
- Renderer builds cleanly
</success_criteria>

<output>
After completion, create `.planning/phases/7-options-in-settings-for-hotkeys-from-phase-02/7-02-SUMMARY.md`
</output>
