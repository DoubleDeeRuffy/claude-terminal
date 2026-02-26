# Architecture Research

**Domain:** Electron + xterm.js terminal UX fixes (brownfield)
**Researched:** 2026-02-24
**Confidence:** HIGH — based on direct codebase inspection, not web search

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Renderer Process (Browser)                    │
│                                                                  │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │TerminalManager │  │  FileExplorer   │  │KeyboardShortcuts│   │
│  │  (component)   │  │  (component)    │  │   (feature)     │   │
│  └───────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│          │                   │                     │            │
│  ┌───────▼────────────────────▼─────────────────────▼────────┐   │
│  │              window.electron_api (preload bridge)          │   │
│  └───────┬────────────────────────────────────────────────────┘   │
└──────────┼──────────────────────────────────────────────────────┘
           │  IPC (ipcRenderer.invoke / ipcMain.handle)
┌──────────▼──────────────────────────────────────────────────────┐
│                     Main Process (Node.js)                       │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐   │
│  │  dialog.ipc.js  │  │  terminal.ipc.js │  │ node-pty PTY  │   │
│  │ (clipboard-read │  │  (create, input, │  │  (PowerShell) │   │
│  │  clipboard-writ)│  │   resize, kill)  │  │               │   │
│  └─────────────────┘  └──────────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Location |
|-----------|----------------|----------|
| `TerminalManager.js` | xterm.js lifecycle, tabs, key handling, clipboard, IPC routing | `src/renderer/ui/components/` |
| `FileExplorer.js` | File tree rendering, directory reads, git status badges | `src/renderer/ui/components/` |
| `KeyboardShortcuts.js` | Global document-level keyboard shortcut registry | `src/renderer/features/` |
| `dialog.ipc.js` | Electron `clipboard` module access (fallback for xterm context) | `src/main/ipc/` |
| `preload.js` | Bridge exposing `api.app.clipboardRead/Write` to renderer | `src/main/preload.js` |
| `index.html` | Static HTML: `.terminals-header`, `.terminals-filter`, `#terminals-tabs` | repo root |
| `renderer.js` | Top-level orchestrator wiring callbacks into TerminalManager | repo root |

---

## Fix 1: xterm.js Key Handlers (Word-Jump + Copy/Paste)

### Where the Code Lives

All xterm.js keyboard logic is consolidated in **`TerminalManager.js`**. There are two interception points that work in layered sequence:

**Layer A — DOM capture phase** (`setupClipboardShortcuts`, line ~459):
- Attached via `wrapper.addEventListener('keydown', ..., true)` (capture phase)
- Runs BEFORE xterm.js sees the event
- Currently handles `Ctrl+Shift+V` (paste) and `Ctrl+Shift+C` (copy)

**Layer B — xterm custom key handler** (`createTerminalKeyHandler`, line ~529):
- Attached via `terminal.attachCustomKeyEventHandler(fn)`
- Returning `false` prevents xterm from processing the key itself
- Currently handles: `Ctrl+Arrow` (tab switching), `Ctrl+W`, `Ctrl+,`, `Ctrl+Shift+T`, `Ctrl+Shift+C`, `Ctrl+Shift+V`

### What Is Missing

**Word-jump (Ctrl+Left / Ctrl+Right):** The existing `createTerminalKeyHandler` currently intercepts `Ctrl+Arrow` keys — but routes them to `onSwitchTerminal`/`onSwitchProject` (project/tab navigation), swallowing the keystroke. Word-jump ANSI sequences (`\x1b[1;5D` for backward, `\x1b[1;5C` for forward) are never sent to the PTY.

**Ctrl+C copy:** `Ctrl+C` (without Shift) is not intercepted at all. xterm.js sends it raw to the PTY as SIGINT. If there is a selection, the expected behavior is to copy it instead. The existing handlers only cover `Ctrl+Shift+C`.

**Ctrl+V paste:** `Ctrl+V` (without Shift) is not intercepted. xterm.js currently does nothing with it. The existing paste path only covers `Ctrl+Shift+V`.

**Right-click paste:** No `contextmenu` listener exists on terminal wrappers.

### How Each Fix Should Work

**Word-jump:** In `createTerminalKeyHandler`, detect `Ctrl+Left`/`Ctrl+Right` and send ANSI sequences to the PTY via `api.terminal.input()` instead of triggering tab-switch. The distinction from the current behavior: word-jump only applies when there is no active terminal-switch callback OR when the intent is text navigation. The simplest correct approach is to check if text is being edited (cursor is inside xterm) and send the ANSI escape.

The correct ANSI escape sequences are:
- `Ctrl+Left` → `\x1b[1;5D` (backward word)
- `Ctrl+Right` → `\x1b[1;5C` (forward word)

These are VT sequences recognized by bash/PowerShell readline. They must be written into the `api.terminal.input()` channel, not passed to xterm's renderer.

**Note:** Currently `Ctrl+Arrow` sends the user to a different terminal tab (via `callbacks.onSwitchTerminal`). The new behavior should instead send word-jump sequences to the active PTY. The tab-switching function should move to a different shortcut or be removed if not commonly needed. This is a behavioral change that affects the existing Ctrl+Arrow tab-switching feature — it must be noted in the plan.

**Ctrl+C copy:** In `createTerminalKeyHandler`, intercept `Ctrl+C` when `terminal.hasSelection()` is true. Write selection to clipboard via `navigator.clipboard.writeText()` with IPC fallback, then return `false` to prevent SIGINT. When no selection, return `true` to let xterm pass SIGINT to the PTY normally.

**Ctrl+V paste:** In `createTerminalKeyHandler`, intercept `Ctrl+V` (no Shift). Read clipboard via `navigator.clipboard.readText()` with IPC fallback, send text to PTY via `api.terminal.input()`, return `false`.

**Right-click paste:** Add `contextmenu` listener to terminal wrapper element. On right-click inside the terminal, call `navigator.clipboard.readText()` and send to PTY. Suppress the default browser context menu via `e.preventDefault()`.

### Clipboard Access Pattern (Existing, Established)

The codebase already has a two-path clipboard pattern. New clipboard code must follow the same pattern:

```javascript
// Read from clipboard — try Web API, fall back to Electron IPC
navigator.clipboard.readText()
  .then(text => api.terminal.input({ id: terminalId, data: text }))
  .catch(() => api.app.clipboardRead().then(text => api.terminal.input({ id: terminalId, data: text })));

// Write to clipboard — try Web API, fall back to Electron IPC
navigator.clipboard.writeText(selection)
  .catch(() => api.app.clipboardWrite(selection));
```

The IPC fallback path uses:
- `api.app.clipboardRead()` → `ipcRenderer.invoke('clipboard-read')` → `clipboard.readText()` in `dialog.ipc.js`
- `api.app.clipboardWrite(text)` → `ipcRenderer.invoke('clipboard-write', text)` → `clipboard.writeText(text)` in `dialog.ipc.js`

No new IPC handlers are needed for clipboard. The infrastructure is complete.

### Where to Add

All three key-handling additions go into **`src/renderer/ui/components/TerminalManager.js`**:
- Inside `createTerminalKeyHandler()` for Ctrl+C, Ctrl+V, and word-jump
- A new `contextmenu` listener added in `setupClipboardShortcuts()` or the same location where `setupPasteHandler()` is called (around line 1217)

`attachCustomKeyEventHandler` is called once per terminal instance at creation time — this means the updated `createTerminalKeyHandler` automatically applies to all terminal types (regular Claude terminals, basic terminals, FiveM, WebApp, debug terminals). All four call sites use the same function.

---

## Fix 2: FileExplorer Dotfile Filter Removal

### Where the Code Lives

**`src/renderer/ui/components/FileExplorer.js`**, `readDirectoryAsync()` function, lines ~232-233:

```javascript
// Current filter (to be removed):
if (IGNORE_PATTERNS.has(name)) continue;
if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;
```

The `IGNORE_PATTERNS` set (line ~42) covers: `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.next`, `vendor`, `.cache`, `.idea`, `.vscode`, `.DS_Store`, `Thumbs.db`, `.env.local`, `coverage`, `.nuxt`, `.output`, `.turbo`, `.parcel-cache`.

### What the Fix Is

Remove the second filter line (the dotfile check) entirely. The `IGNORE_PATTERNS` set already handles `.git`, `.DS_Store`, etc. explicitly. The generic `name.startsWith('.')` check is what hides `.planning`, `.claude`, `.github`, and other legitimate dotfiles.

The change is a single-line deletion in `readDirectoryAsync()`. No state, no IPC, no CSS changes needed.

### Data Flow

```
user opens folder in explorer
    ↓
FileExplorer.setRootPath(projectPath)
    ↓
render() → getOrLoadFolder(rootPath)
    ↓
readDirectoryAsync(dirPath)           ← ONLY change point
    fs.promises.readdir(dirPath)
    filter via IGNORE_PATTERNS.has(name)   ← keep this
    [REMOVE] filter via name.startsWith('.') ← this line is removed
    ↓
result.sort() + render tree nodes
```

No IPC is involved. `fs.promises.readdir` is accessed through `window.electron_nodeModules.fs`, which is synchronous `fs` shimmed in the preload. No main-process changes required.

---

## Fix 3: "New Terminal" Button

### Where the Code Lives

The terminal area header HTML is in **`index.html`**, lines ~272-399, inside `.terminals-panel > .terminals-header`.

The header currently contains:
- `#btn-toggle-explorer` (folder toggle button, far left)
- `#terminals-filter` (project name + git actions bar, conditionally shown)
- `.ci-status-bar` (CI status bar)
- `#terminals-tabs` (tab strip)
- `#terminals-container` (terminal panels)

The project name is displayed inside `#filter-project-name` (`<span class="filter-project">`), which is inside `#terminals-filter`. This is shown/hidden via `filterByProject()` in `TerminalManager.js`.

### Where the Button Goes

Per the requirement: "after project name, above the tab control." This means inside `#terminals-filter`, after `#filter-project-name` and before or alongside the git action buttons. The DOM location is `index.html` within the `.terminals-filter` div.

The button must call the same function as the existing "new terminal" triggers. The existing flow is:

```
user clicks "Claude Code" in project list
    ↓
renderer.js: createTerminalForProject(project)
    ↓
TerminalManager.createTerminal(project, options)
    ↓
api.terminal.create() → IPC → node-pty spawn
```

The `callbacks.onCreateTerminal` exists in `TerminalManager.js` (line 675) but checking whether it is wired in `renderer.js` is necessary. The quick-action "New Terminal" button in the toolbar is already wired via the QuickActions component. For the new button:

- **Option A:** Wire a click handler in `renderer.js` that calls `createTerminalForProject(currentProject)` — follows existing pattern
- **Option B:** Wire inside `TerminalManager.js` `filterByProject()` function when creating the filter bar — avoids touching `renderer.js`

Option A is cleaner since `renderer.js` already owns all wiring between components.

### Data Flow (New Terminal Button)

```
user clicks "#btn-new-terminal" (new button in .terminals-filter)
    ↓
renderer.js click handler
    ↓
createTerminalForProject(currentProject)
    [currentProject resolved from projectsState.get().selectedProjectFilter]
    ↓
TerminalManager.createTerminal(project, { skipPermissions })
    ↓
api.terminal.create() → IPC → TerminalService → node-pty
```

### Changes Required

1. **`index.html`** — add button element inside `#terminals-filter` after `#filter-project-name`
2. **`renderer.js`** (or `TerminalManager.js`) — wire click handler
3. **`styles/terminal.css`** — style the button (follow `.filter-git-btn` pattern)

---

## Component Boundary Map

| Fix | Files to Change | Files NOT to Change |
|-----|-----------------|---------------------|
| Word-jump (Ctrl+Arrow) | `TerminalManager.js` only | `KeyboardShortcuts.js`, `preload.js`, `dialog.ipc.js` |
| Ctrl+C copy | `TerminalManager.js` only | Same — clipboard IPC already exists |
| Ctrl+V paste | `TerminalManager.js` only | Same |
| Right-click paste | `TerminalManager.js` only | Same |
| Dotfile filter | `FileExplorer.js` only | No other files |
| New Terminal button | `index.html` + `renderer.js` (or `TerminalManager.js`) + `terminal.css` | No IPC changes |

---

## Data Flow: Keyboard Events Through Layers

```
User presses key while xterm.js has focus
          ↓
DOM capture phase (wrapper.addEventListener 'keydown', capture=true)
  → setupClipboardShortcuts: intercepts Ctrl+Shift+C, Ctrl+Shift+V
  → setupPasteHandler: intercepts paste events
          ↓
  (if not stopped in capture phase)
xterm.js internal key processing
          ↓
  attachCustomKeyEventHandler callback (createTerminalKeyHandler)
  → returns false  → xterm discards key, no PTY data sent
  → returns true   → xterm processes key normally (sends to PTY)
          ↓
  (if xterm decides to send to PTY)
xterm.js onData callback
  → api.terminal.input({ id, data })
  → IPC: ipcRenderer.invoke('terminal-input')
          ↓
Main process: TerminalService / node-pty
  → pty.write(data) → shell stdin
```

**New key events go into `createTerminalKeyHandler` (Layer B).** This is the correct layer because:
- It has access to both `terminal` (for `getSelection()`, `hasSelection()`) and `terminalId` (for IPC routing)
- Returning `false` cleanly stops xterm from treating Ctrl+C as SIGINT
- The existing clipboard pattern in this same handler confirms it is the right location

---

## Architectural Patterns in Use

### Pattern 1: Custom Key Event Handler (xterm.js)

**What:** `terminal.attachCustomKeyEventHandler(fn)` receives every keydown/keyup. Return `false` to suppress xterm processing, `true` (or nothing) to allow normal processing.

**When to use:** When you need to intercept keys that xterm would otherwise consume (SIGINT, paste, etc.) and replace their behavior with something custom.

**Example (existing):**
```javascript
function createTerminalKeyHandler(terminal, terminalId, inputChannel) {
  return (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'C' && e.type === 'keydown') {
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => api.app.clipboardWrite(selection));
      }
      return false; // suppress xterm default
    }
    return true; // allow xterm default for everything else
  };
}
```

### Pattern 2: DOM Capture Phase Interception

**What:** `element.addEventListener('keydown', handler, true)` runs before xterm's own listener.

**When to use:** When xterm's built-in processing would otherwise consume the event before the custom key handler gets a chance. Used as a backup layer for paste.

**Note:** Both layers exist in the codebase as defense-in-depth. New keyboard fixes should go into `createTerminalKeyHandler` (cleaner, has terminal reference). Only add capture-phase handlers if xterm's internal processing interferes.

### Pattern 3: Clipboard Dual Path

**What:** Try `navigator.clipboard` (Web API, async), fall back to `api.app.clipboardRead/Write` (Electron IPC).

**When to use:** All clipboard operations in the renderer. `navigator.clipboard` may fail in certain Electron contexts (focus, permissions). The IPC fallback always works.

### Pattern 4: fs via Preload Bridge

**What:** `window.electron_nodeModules.fs` exposes Node.js `fs` (sync + promises) to the renderer.

**When to use:** FileExplorer uses this for directory reads. No IPC needed for filesystem access in the renderer — it is pre-bridged.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding a New IPC Handler for Clipboard

**What people do:** Create a new `'terminal-clipboard-paste'` IPC handler to route clipboard content.

**Why it's wrong:** The `clipboard-read` and `clipboard-write` IPC handlers already exist in `dialog.ipc.js` and are exposed in `preload.js`. Duplicating this creates dead weight.

**Do this instead:** Use `api.app.clipboardRead()` / `api.app.clipboardWrite()` which already exist.

### Anti-Pattern 2: Registering Terminal Key Shortcuts in KeyboardShortcuts.js

**What people do:** Add Ctrl+C/Ctrl+V to the global `KeyboardShortcuts` registry (document-level `keydown`).

**Why it's wrong:** `KeyboardShortcuts.js` listens on `document`. When xterm has focus, the keys are consumed by xterm first and do not bubble to `document`. The interceptors must be inside `createTerminalKeyHandler` (xterm layer) or the capture-phase DOM handler.

**Do this instead:** Place all terminal-specific key handling inside `createTerminalKeyHandler` in `TerminalManager.js`.

### Anti-Pattern 3: Filtering Dotfiles in Two Places

**What people do:** Add a setting or toggle for dotfile visibility alongside removing the hardcoded filter.

**Why it's wrong:** The requirement is explicit — remove the filter entirely, no toggle. Adding configuration complexity for a simple deletion is wasteful and goes out of scope.

**Do this instead:** Delete the one line `if (name.startsWith('.') && ...) continue;` from `readDirectoryAsync()`.

### Anti-Pattern 4: Word-Jump via Global Keyboard Shortcut

**What people do:** Register `Ctrl+Left`/`Ctrl+Right` in `KeyboardShortcuts.js` and send PTY data from there.

**Why it's wrong:** `KeyboardShortcuts.js` does not have access to the active terminal ID or the `api.terminal.input` routing. It also runs at the document level, not within xterm's event model.

**Do this instead:** Handle in `createTerminalKeyHandler`. The `terminalId` and `inputChannel` are already closure variables there.

---

## Build Order (Dependencies Between the 3 Fixes)

The three fixes are **independent** — each touches different files and has no shared code path:

```
Fix A: xterm.js key handlers
  └─ TerminalManager.js (createTerminalKeyHandler)
  └─ No dependencies on Fix B or Fix C

Fix B: Dotfile filter removal
  └─ FileExplorer.js (readDirectoryAsync, one line)
  └─ No dependencies on Fix A or Fix C

Fix C: New Terminal button
  └─ index.html (DOM element)
  └─ renderer.js or TerminalManager.js (click handler)
  └─ terminal.css (styling)
  └─ No dependencies on Fix A or Fix B
```

**Suggested build order:** Fix B → Fix A → Fix C

Rationale:
1. **Fix B first** — smallest change (one line deletion), lowest risk, zero dependencies, verifiable immediately by running the app and checking for dotfiles
2. **Fix A second** — contained within one function in one file, but involves behavioral nuance (Ctrl+Arrow currently switches tabs; the new behavior sends ANSI sequences instead). Needs careful testing of all four key variants
3. **Fix C last** — touches three files (HTML + JS wiring + CSS), smallest risk but most files, best done after the other two are stable

There is one behavioral coupling to note: **Fix A (word-jump) changes the meaning of Ctrl+Arrow.** Currently Ctrl+Left/Right switches tabs. After Fix A, it navigates words. If the Ctrl+Arrow tab-switching is considered a dependency for any feature, it must be addressed in the same phase. The PROJECT.md does not mention tab-switching as a required feature, and the CLAUDE.md codebase notes say Ctrl+Left/Right are used for terminal switching in `MainWindow.js` at the global shortcut level as well — verify before removing the renderer-side handler.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| TerminalManager ↔ xterm.js | Direct JS API (`attachCustomKeyEventHandler`, `getSelection`, `onData`) | In-process, no IPC |
| TerminalManager ↔ Electron clipboard | `navigator.clipboard` (Web API) + `api.app.clipboardRead/Write` (IPC fallback) | Dual-path, existing |
| FileExplorer ↔ filesystem | `window.electron_nodeModules.fs.promises.readdir` | Pre-bridged in preload, no IPC |
| New Terminal button ↔ PTY creation | `TerminalManager.createTerminal()` → `api.terminal.create()` → IPC → node-pty | Existing IPC chain |

### External Services

None of the three fixes require external service calls, network access, or new dependencies.

---

## Sources

- Direct inspection of `src/renderer/ui/components/TerminalManager.js` (lines 74-80, 451-519, 529-609, 1217-1222)
- Direct inspection of `src/renderer/ui/components/FileExplorer.js` (lines 42-47, 222-273)
- Direct inspection of `src/renderer/features/KeyboardShortcuts.js` (lines 77-100)
- Direct inspection of `src/main/ipc/dialog.ipc.js` (lines 146-148)
- Direct inspection of `src/main/preload.js` (lines 221-225)
- Direct inspection of `index.html` (lines 270-408)
- `.planning/codebase/ARCHITECTURE.md` — layered IPC analysis

---
*Architecture research for: Electron terminal UX fixes (xterm.js key handlers, dotfile filter, new terminal button)*
*Researched: 2026-02-24*
