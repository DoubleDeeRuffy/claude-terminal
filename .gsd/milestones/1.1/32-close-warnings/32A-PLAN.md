---
phase: 32-close-warnings
plan: A
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/windows/MainWindow.js
  - src/main/windows/TrayManager.js
  - src/main/ipc/dialog.ipc.js
  - src/main/preload.js
  - src/renderer/events/index.js
  - src/renderer/i18n/locales/en.json
  - src/renderer/i18n/locales/fr.json
  - main.js
autonomous: true
requirements:
  - CLOSE-01
  - CLOSE-02
  - CLOSE-03
  - CLOSE-04

must_haves:
  truths:
    - "When Claude is actively working and user clicks tray Quit, a native confirmation dialog appears listing the active project(s) and tab name(s)"
    - "When Claude is actively working and user closes via before-quit, a native confirmation dialog appears"
    - "User can cancel the quit and return to the app"
    - "User can proceed with quit despite active work"
    - "When no Claude instance is active, quit proceeds immediately with no dialog"
  artifacts:
    - path: "src/main/windows/MainWindow.js"
      provides: "checkClaudeActivityBeforeQuit async function"
      contains: "checkClaudeActivityBeforeQuit"
    - path: "src/main/preload.js"
      provides: "IPC listener for check-claude-activity request"
      contains: "check-claude-activity"
    - path: "src/renderer/events/index.js"
      provides: "Handler responding to check-claude-activity with active terminal info"
      contains: "check-claude-activity"
  key_links:
    - from: "src/main/windows/TrayManager.js"
      to: "src/main/windows/MainWindow.js"
      via: "checkClaudeActivityBeforeQuit call"
      pattern: "checkClaudeActivityBeforeQuit"
    - from: "src/main/windows/MainWindow.js"
      to: "src/main/preload.js"
      via: "webContents.send + ipcRenderer response"
      pattern: "check-claude-activity"
    - from: "src/renderer/events/index.js"
      to: "src/renderer/state/claudeActivity.state.js"
      via: "isClaudeActive per terminal"
      pattern: "isClaudeActive"
---

<objective>
Add a confirmation dialog that warns the user before quitting when Claude is actively working in any terminal. The dialog lists affected project names and tab names so the user knows what will be interrupted.

Purpose: Prevent accidental loss of in-progress Claude work when closing the app.
Output: Native OS confirmation dialog on quit when Claude is active; silent quit when idle.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.gsd/PROJECT.md
@.gsd/ROADMAP.md
@.gsd/STATE.md
@.gsd/phases/32-close-warnings/32-CONTEXT.md
</context>

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/renderer/state/claudeActivity.state.js:
```javascript
function isClaudeActive(terminalId) // returns boolean — true if output within last 15s
function getClaudeActivityState()   // returns Map<terminalId, { lastActivity: number }>
```

From src/renderer/state/terminals.state.js:
```javascript
function getTerminals()  // returns Map<id, termData>
function getTerminal(id) // returns { terminal, name, project: { name, id }, projectIndex, isBasic, status, ... }
```

From src/main/windows/MainWindow.js:
```javascript
function setQuitting(quitting)  // sets isQuitting flag
function getMainWindow()        // returns BrowserWindow|null
// mainWindow.on('close', ...) — currently prevents close if !isQuitting (minimize to tray)
```

Close paths to intercept:
1. TrayManager.js Quit click: setQuitting(true) + app.quit()
2. main.js before-quit: setQuitting(true), sends 'app-will-quit' to renderer
3. dialog.ipc.js 'app-quit' IPC: setQuitting(true) + app.quit()
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add IPC bridge for Claude activity check and main-process quit gate</name>
  <files>src/main/windows/MainWindow.js, src/main/preload.js, src/renderer/events/index.js, src/renderer/state/claudeActivity.state.js</files>
  <action>
**1. Renderer side — respond to activity check (`src/renderer/events/index.js`):**

Add a listener at module init (alongside other lifecycle listeners) for `'check-claude-activity'`. When received:
- Import `isClaudeActive` from `claudeActivity.state.js` and `getTerminals` from `terminals.state.js`
- Iterate all terminals from `getTerminals()`
- For each terminal where `!termData.isBasic` and `isClaudeActive(terminalId)`:
  - Collect `{ terminalId, tabName: termData.name, projectName: termData.project?.name || 'Unknown' }`
- Send back via `electron_api.lifecycle.respondClaudeActivity(activeList)` (see preload step)

**2. Preload bridge (`src/main/preload.js`):**

In the `lifecycle` namespace (around line 422), add:
- `respondClaudeActivity: (data) => ipcRenderer.send('claude-activity-response', data)` — renderer sends active terminal list back to main
- Keep existing `onWillQuit` listener

**3. Main process — quit gate (`src/main/windows/MainWindow.js`):**

Add an async function `checkClaudeActivityBeforeQuit()` that:
- Gets `mainWindow` via `getMainWindow()`
- If no mainWindow or mainWindow is destroyed, return `true` (allow quit)
- Sends `'check-claude-activity'` to renderer via `mainWindow.webContents.send('check-claude-activity')`
- Waits for `'claude-activity-response'` IPC response with a 2-second timeout (use a Promise wrapping `ipcMain.once`)
- If response is empty array or timeout → return `true` (allow quit, CLOSE-04)
- If response has active terminals → show `dialog.showMessageBox` with:
  - `type: 'warning'`
  - `title: 'Claude is working'`
  - `message:` built from the active list, e.g. "Claude is actively working in:\n\n- ProjectName: TabName\n- ProjectName: TabName2\n\nAre you sure you want to quit?"
  - `buttons: ['Quit Anyway', 'Cancel']`
  - `defaultId: 1` (Cancel is default)
  - `cancelId: 1`
- If user picks "Quit Anyway" (index 0) → return `true`
- If user picks "Cancel" (index 1) → return `false`

Export `checkClaudeActivityBeforeQuit` from the module.

**4. Also in `src/renderer/state/claudeActivity.state.js`:**

No changes needed — the existing `isClaudeActive(terminalId)` and `getClaudeActivityState()` are sufficient. The renderer event handler will use them directly.
  </action>
  <verify>
    <automated>npm run build:renderer && node -e "const m = require('./src/main/windows/MainWindow.js'); console.log(typeof m.checkClaudeActivityBeforeQuit === 'function' ? 'PASS' : 'FAIL')"</automated>
  </verify>
  <done>
- `checkClaudeActivityBeforeQuit` exported from MainWindow.js
- Preload exposes `respondClaudeActivity` in lifecycle namespace
- Renderer listens for `check-claude-activity` and responds with active terminal list
- Native dialog shown with project/tab names when active work detected
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire quit gate into all close paths and add i18n keys</name>
  <files>src/main/windows/TrayManager.js, src/main/ipc/dialog.ipc.js, main.js, src/renderer/i18n/locales/en.json, src/renderer/i18n/locales/fr.json</files>
  <action>
**1. TrayManager.js — Quit menu item:**

Change the Quit click handler from:
```javascript
click: () => {
  setQuitting(true);
  const { app } = require('electron');
  app.quit();
}
```
To:
```javascript
click: async () => {
  const { checkClaudeActivityBeforeQuit } = require('./MainWindow');
  const canQuit = await checkClaudeActivityBeforeQuit();
  if (!canQuit) return;
  setQuitting(true);
  const { app } = require('electron');
  app.quit();
}
```

**2. dialog.ipc.js — `app-quit` handler:**

Change the `app-quit` handler from sync to async:
```javascript
ipcMain.on('app-quit', async () => {
  const { checkClaudeActivityBeforeQuit, setQuitting: setQ } = require('../windows/MainWindow');
  // Note: for renderer-initiated quit, still check activity
  const canQuit = await checkClaudeActivityBeforeQuit();
  if (!canQuit) return;
  const { setQuitting } = require('../windows/MainWindow');
  setQuitting(true);
  app.quit();
});
```

**3. main.js — `before-quit` handler:**

The `before-quit` event fires when the OS or app.quit() triggers shutdown. Since we gate at the source (tray click, app-quit IPC), the before-quit handler does NOT need the check — it runs after the decision is already made. Keep it as-is. This avoids double-prompting.

However, for the edge case where quit is triggered externally (OS shutdown, Ctrl+C in dev), before-quit fires without our gate. In this case, we accept the quit without warning (OS shutdown should not be blocked by our dialog).

**4. i18n keys (`en.json` and `fr.json`):**

Note: The native `dialog.showMessageBox` does not use i18n (it takes raw strings). However, add keys for potential future use and consistency:

In `en.json`, add under a new `"closeWarning"` section (at the top level, after `"common"`):
```json
"closeWarning": {
  "title": "Claude is working",
  "message": "Claude is actively working in:",
  "confirmQuit": "Are you sure you want to quit?",
  "quitAnyway": "Quit Anyway",
  "cancel": "Cancel"
}
```

In `fr.json`, add:
```json
"closeWarning": {
  "title": "Claude est en cours de travail",
  "message": "Claude travaille activement dans :",
  "confirmQuit": "Voulez-vous vraiment quitter ?",
  "quitAnyway": "Quitter quand meme",
  "cancel": "Annuler"
}
```

Note: Use proper UTF-8 for French: "meme" should be "meme" with accent -> actually use "Quitter quand m\u00eame" if writing via script, but since we write directly to JSON, use "Quitter quand m\u00eame". Actually, the i18n JSON files already contain French accents directly (UTF-8 files), so write `"Quitter quand m\u00eame"` — wait, just use the literal accent character: `"Quitter quand m\u00eame"`. The instruction says use proper UTF-8, so write: `"Quitter quand même"`.

**5. Update `checkClaudeActivityBeforeQuit` to use i18n strings if renderer is available:**

Actually, `dialog.showMessageBox` runs in main process which has no access to renderer i18n. Keep using hardcoded English strings in the dialog (this is standard for Electron native dialogs). The i18n keys are added for completeness and future custom dialog migration.
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>
- Tray Quit checks Claude activity before quitting
- Renderer-initiated app-quit checks Claude activity before quitting
- Dialog shows "Quit Anyway" / "Cancel" when Claude is active
- Quit proceeds immediately when no Claude work is active (CLOSE-04)
- i18n keys added to both en.json and fr.json
  </done>
</task>

</tasks>

<verification>
1. Start app, open a project terminal, trigger Claude work (so activity is recent)
2. Click tray icon -> Quit -> confirmation dialog should appear with project/tab name
3. Click Cancel -> app should NOT quit
4. Click Quit Anyway -> app should quit
5. Wait for Claude to go idle (15s no output), click Quit -> should quit without dialog
6. With no terminals open, click Quit -> should quit without dialog
</verification>

<success_criteria>
- Native confirmation dialog appears on quit when Claude is actively working (CLOSE-01, CLOSE-02)
- Dialog lists project name(s) and tab name(s) of active terminals
- "Cancel" prevents quit, "Quit Anyway" proceeds (CLOSE-03)
- No dialog when all terminals are idle or no terminals exist (CLOSE-04)
- All three quit paths covered: tray Quit, renderer app-quit IPC, external quit
</success_criteria>

<output>
After completion, create `.gsd/phases/32-close-warnings/32A-SUMMARY.md`
</output>
