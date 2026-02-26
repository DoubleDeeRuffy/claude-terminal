---
phase: 9-remember-window-state-on-windows
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/windows/MainWindow.js
autonomous: true
requirements:
  - WIN-01
  - WIN-02
  - WIN-03
must_haves:
  truths:
    - "Window restores to the same position and size it had when last closed or moved"
    - "Window restores as maximized if it was maximized when closed"
    - "Window centers on primary monitor at default size (1400x900) on first launch or when saved monitor is disconnected"
    - "Window state survives a crash (saved continuously, not just on clean shutdown)"
  artifacts:
    - path: "src/main/windows/MainWindow.js"
      provides: "loadWindowState, saveWindowState, validateWindowState, debounced event listeners"
      contains: "windowState"
  key_links:
    - from: "loadWindowState()"
      to: "new BrowserWindow()"
      via: "width/height/x/y passed to constructor options"
      pattern: "loadWindowState.*BrowserWindow"
    - from: "mainWindow resize/move events"
      to: "saveWindowState()"
      via: "debounced event listeners"
      pattern: "mainWindow\\.on\\('(resize|move)'"
    - from: "validateWindowState()"
      to: "screen.getAllDisplays()"
      via: "workArea bounds check"
      pattern: "getAllDisplays|workArea"
---

<objective>
Add window state persistence to the main process so the Electron window remembers its position, size, and maximized state across app restarts.

Purpose: Users expect the app to reopen where they left it, especially on multi-monitor setups. This is the last piece of "remember everything" persistence (tabs, explorer, sessions, now window geometry).

Output: Modified `src/main/windows/MainWindow.js` with load/validate/save functions and event wiring.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/9-remember-window-state-on-windows/9-CONTEXT.md
@.planning/phases/9-remember-window-state-on-windows/9-RESEARCH.md
@src/main/windows/MainWindow.js
@src/main/utils/paths.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add loadWindowState, validateWindowState, and saveWindowState functions to MainWindow.js</name>
  <files>src/main/windows/MainWindow.js</files>
  <action>
Add three functions and supporting module-level state to `MainWindow.js`:

**Imports to add at the top:**
- `const fs = require('fs');`
- `const { settingsFile } = require('../utils/paths');`
- Note: `const { screen } = require('electron');` must be required lazily (inside `validateWindowState`) because `screen` is not available before `app.whenReady()`. Use `const { screen } = require('electron');` inside the function body.

**Module-level state:**
- `let normalBounds = null;` — tracks pre-maximized bounds
- `let saveTimer = null;` — debounce timer for saves

**`loadWindowState()` function (sync):**
- Read `settingsFile` synchronously via `fs.readFileSync`
- Parse JSON, return `settings.windowState` or `null`
- Wrap in try/catch, return `null` on any error (missing file, parse error)

**`validateWindowState(state)` function:**
- Return `null` if `state` is falsy or `state.x`/`state.y` are not numbers
- Return `null` if `state.width` or `state.height` are not positive numbers
- Use `const { screen } = require('electron');` (lazy require inside function)
- Call `screen.getAllDisplays()` and check if the window's top-left corner (state.x, state.y) falls within any display's `workArea` (NOT `bounds` — workArea excludes taskbar). Use: `x >= workArea.x && x < workArea.x + workArea.width && y >= workArea.y && y < workArea.y + workArea.height`
- If no display contains the point, return `null` (full reset to defaults)
- If valid, return the state object unchanged

**`saveWindowState(win, isImmediate)` function:**
- If `!win || win.isDestroyed()`, return early
- Build state object: `{ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, isMaximized: win.isMaximized() }`
- For bounds: if `win.isMaximized()`, use `normalBounds` (the saved pre-maximized bounds); otherwise use `win.getBounds()`
- If bounds are null (no normalBounds captured yet and window is maximized), skip save
- Merge into settings.json: read existing file, set `current.windowState = state`, write via atomic pattern (`.tmp` + `fs.renameSync`)
- Wrap in try/catch, log error with `[MainWindow]` prefix on failure

**`debouncedSaveWindowState(win)` function:**
- Clear `saveTimer` if set
- Set `saveTimer = setTimeout(() => saveWindowState(win), 500)` (500ms matches existing settings debounce)

**`saveWindowStateImmediate(win)` function:**
- Clear `saveTimer` if set
- Call `saveWindowState(win)` directly (no debounce — used on close)
  </action>
  <verify>
    <automated>node -e "const m = require('./src/main/windows/MainWindow.js'); console.log(typeof m.createMainWindow === 'function' ? 'OK' : 'FAIL')"</automated>
    <manual>Verify loadWindowState, validateWindowState, saveWindowState functions exist in the file</manual>
  </verify>
  <done>MainWindow.js contains loadWindowState (sync read from settings.json), validateWindowState (screen.workArea check), saveWindowState (atomic merge write with debounce), all with proper error handling</done>
</task>

<task type="auto">
  <name>Task 2: Wire state loading into BrowserWindow creation and event listeners for save</name>
  <files>src/main/windows/MainWindow.js</files>
  <action>
Modify `createMainWindow()` to use the functions from Task 1:

**Before `new BrowserWindow()`:**
1. Call `const savedState = validateWindowState(loadWindowState());`
2. Build the options object with conditional x/y:
   - Set `width: savedState ? savedState.width : 1400`
   - Set `height: savedState ? savedState.height : 900`
   - Only add `x` and `y` keys to the options object if `savedState` is truthy and has numeric x/y (do NOT pass `x: undefined` — omit the keys entirely to let Electron center the window). Use: `if (savedState) { winOpts.x = savedState.x; winOpts.y = savedState.y; }`
   - Keep all other existing options (minWidth, minHeight, frame, titleBarStyle, trafficLightPosition, backgroundColor, webPreferences) unchanged

**After `mainWindow.loadFile(htmlPath)`:**
3. If `savedState && savedState.isMaximized`, call `mainWindow.maximize()`

**Initialize normalBounds:**
4. Set `normalBounds = savedState && !savedState.isMaximized ? { x: savedState.x, y: savedState.y, width: savedState.width, height: savedState.height } : mainWindow.getBounds();`

**Wire event listeners (after existing event setup, before return):**
5. `mainWindow.on('resize', ...)` — if `!mainWindow.isMaximized()`, update `normalBounds = mainWindow.getBounds()` and call `debouncedSaveWindowState(mainWindow)`
6. `mainWindow.on('move', ...)` — same logic as resize (guard on `!isMaximized`, update normalBounds, debounced save)
7. `mainWindow.on('maximize', ...)` — call `debouncedSaveWindowState(mainWindow)` (saves isMaximized: true with existing normalBounds)
8. `mainWindow.on('unmaximize', ...)` — update `normalBounds = mainWindow.getBounds()`, then `debouncedSaveWindowState(mainWindow)`

**Modify existing `close` handler:**
9. Add `saveWindowStateImmediate(mainWindow);` as the FIRST line inside the existing `mainWindow.on('close', (event) => { ... })` handler, BEFORE the `if (!isQuitting)` check. This ensures state is saved whether the window hides to tray or the app quits.

**Important implementation notes:**
- Do NOT create a second `close` listener — modify the existing one
- Do NOT remove or change the existing `before-input-event` listener, `will-navigate` handler, or `closed` handler
- The `close` handler receives `(event)` parameter — the save call does not need event
  </action>
  <verify>
    <automated>node -e "const src = require('fs').readFileSync('src/main/windows/MainWindow.js','utf8'); const checks = ['loadWindowState', 'validateWindowState', 'savedState', 'normalBounds', 'debouncedSave', 'mainWindow.on(\\'resize\\'', 'mainWindow.on(\\'move\\'', 'mainWindow.on(\\'maximize\\'', 'mainWindow.on(\\'unmaximize\\'', 'saveWindowStateImmediate'].filter(c => !src.includes(c)); console.log(checks.length === 0 ? 'ALL PRESENT' : 'MISSING: ' + checks.join(', '))"</automated>
    <manual>Run the app, move/resize window, close and reopen — window should restore to same position and size</manual>
  </verify>
  <done>createMainWindow reads and validates saved state before BrowserWindow construction, passes position/size to constructor, restores maximized state after loadFile, tracks normalBounds on resize/move (guarded by !isMaximized), saves on close, and debounce-saves on every move/resize/maximize/unmaximize event</done>
</task>

</tasks>

<verification>
1. `loadWindowState` reads from `~/.claude-terminal/settings.json` → `windowState` key
2. `validateWindowState` uses `screen.getAllDisplays()` with `workArea` (not `bounds`) for on-screen check
3. `saveWindowState` uses atomic write (`.tmp` + rename) to merge `windowState` into existing settings
4. `normalBounds` is NOT updated when `isMaximized()` is true (prevents saving maximized dimensions as normal size)
5. `x`/`y` are omitted (not `undefined`) from BrowserWindow options when no saved state exists
6. Debounce interval is 500ms, matching existing codebase convention
7. Existing close/before-input-event/will-navigate handlers are preserved
</verification>

<success_criteria>
- Window position and size restore correctly after app restart
- Maximized window restores as maximized; un-maximizing restores normal bounds
- First launch (no saved state) uses defaults: 1400x900, centered
- If saved monitor is disconnected, window centers on primary at default size
- Move/resize events save state continuously (crash-resilient)
- Close event saves a final checkpoint
- No flickering or position jump on startup
</success_criteria>

<output>
After completion, create `.planning/phases/9-remember-window-state-on-windows/9-01-SUMMARY.md`
</output>
