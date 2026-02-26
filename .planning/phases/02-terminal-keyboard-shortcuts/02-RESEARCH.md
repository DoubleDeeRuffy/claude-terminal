# Phase 2: Terminal Keyboard Shortcuts - Research

**Researched:** 2026-02-24
**Domain:** xterm.js key event handling, Electron clipboard IPC, Ctrl+Arrow remapping
**Confidence:** HIGH — all findings based on direct codebase inspection

## Summary

Phase 2 is a pure codebase modification task with no new libraries or external dependencies. All the infrastructure (xterm.js, clipboard IPC, key event handlers) is already present and working. The work is surgical: remap what triggers `switchTerminal()`, add Ctrl+C/Ctrl+V/Ctrl+Arrow word-jump as new key paths inside `createTerminalKeyHandler`, and wire a `contextmenu` listener for right-click paste.

The single most important finding is that **three separate mechanisms** handle keyboard input in the terminal, and all three must be considered when making changes:

1. **`before-input-event` in MainWindow.js** — main process, intercepts Ctrl+Arrow at the Electron level before the renderer sees them at all, forwards via `ctrl-arrow` IPC channel. This is why Ctrl+Arrow currently works even inside the xterm canvas.
2. **`createTerminalKeyHandler` in TerminalManager.js** — the `attachCustomKeyEventHandler` callback. Returns `false` to suppress xterm's default handling, returns `true` to let xterm handle it. This is where Ctrl+Arrow-to-switch is currently coded, and where word-jump must be added.
3. **`setupClipboardShortcuts` in TerminalManager.js** — a DOM-level `keydown` listener in capture phase on the wrapper, currently handling Ctrl+Shift+V paste and Ctrl+Shift+C copy.

The Ctrl+Tab/Ctrl+Shift+Tab wiring path is the most complex change because it spans all three layers: the `createTerminalKeyHandler` must yield Ctrl+Tab (not eat it), and the `ShortcutsManager.registerAllShortcuts()` must register those keys to call `switchTerminal`. Currently `registerCommonShortcuts` in `KeyboardShortcuts.js` already has `nextTerminal`/`prevTerminal` handler slots for Ctrl+Tab, but `ShortcutsManager.registerAllShortcuts()` never calls `registerCommonShortcuts` — it calls `registerShortcut` directly. The `nextTerminal`/`prevTerminal` shortcuts are not wired to `switchTerminal` anywhere today.

**Primary recommendation:** Modify `createTerminalKeyHandler` (single function, one edit location) for the remap and new shortcuts; add a `contextmenu` listener in each terminal creation code path for right-click paste; wire Ctrl+Tab in `ShortcutsManager.registerAllShortcuts()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TERM-01 | User can copy selected text with Ctrl+C; Ctrl+C with no selection sends SIGINT as before | `createTerminalKeyHandler` returns `true` (lets xterm handle) when no selection — add a branch that checks `terminal.getSelection()` and copies if non-empty, returns `false`; otherwise falls through to let xterm send SIGINT |
| TERM-02 | User can paste clipboard content with Ctrl+V | Add Ctrl+V branch in `createTerminalKeyHandler` mirroring existing Ctrl+Shift+V logic; use same `sendPaste` pattern with `navigator.clipboard.readText()` → `api.app.clipboardRead()` fallback |
| TERM-03 | User can jump by word with Ctrl+Left and Ctrl+Right inside terminal PTY | In `createTerminalKeyHandler`, when Ctrl+Left/Right fires AND we're no longer using it for tab-switching, send the VT escape sequences `\x1b[1;5D` (word-left) and `\x1b[1;5C` (word-right) via the input channel |
| TERM-04 | User can paste via right-click in terminal | Add `contextmenu` event listener on the wrapper element; call `api.app.clipboardRead()` directly (not `navigator.clipboard`) to avoid focus-loss failure; send via input channel |
| TERM-05 | Terminal tab switching remapped from Ctrl+Arrow to Ctrl+Tab/Ctrl+Shift+Tab | Remove Ctrl+Left/Right from `createTerminalKeyHandler` tab-switch branch; remove Ctrl+Arrow from `before-input-event` in MainWindow.js (or narrow it); add Ctrl+Tab and Ctrl+Shift+Tab to `ShortcutsManager.registerAllShortcuts()` wired to `switchTerminal` |
</phase_requirements>

## Standard Stack

### Core (no new dependencies)

| Component | Version | Purpose | Location |
|-----------|---------|---------|----------|
| xterm.js | ^6.0.0 | Terminal — `attachCustomKeyEventHandler`, `getSelection()`, `terminal.input()` via IPC | `@xterm/xterm` already installed |
| Electron IPC | (Electron 28) | `clipboard-read` / `clipboard-write` handlers, `before-input-event` | `src/main/ipc/dialog.ipc.js` lines 147-148 |
| `navigator.clipboard` | Browser API | Primary clipboard read/write; Electron exposes this in renderer | Already used throughout TerminalManager |

### No installation needed

```bash
# No new packages — this phase is pure code modification
```

## Architecture Patterns

### How xterm.js custom key events work

`terminal.attachCustomKeyEventHandler(fn)` registers a function that receives every keyboard event before xterm processes it. The function must return:
- `false` — suppress xterm's default handling (take over the key)
- `true` — let xterm handle it normally (pass through to PTY)

```js
// Source: TerminalManager.js lines 529-668 (createTerminalKeyHandler)
function createTerminalKeyHandler(terminal, terminalId, inputChannel = 'terminal-input') {
  return (e) => {
    // Return false = handle ourselves (suppress xterm)
    // Return true = pass to xterm (and then to PTY)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.type === 'keydown') {
      if (e.key === 'ArrowLeft') {
        callbacks.onSwitchTerminal('left');
        return false; // ← currently suppresses word-jump
      }
    }
    return true; // ← let xterm handle everything else
  };
}
```

### The Ctrl+C SIGINT/copy split — selection-gated pattern

The pattern already used for Ctrl+Shift+C should be adapted for Ctrl+C:

```js
// Pattern: check selection first, copy if present, else fall through to xterm (SIGINT)
if (e.ctrlKey && !e.shiftKey && e.key === 'C' && e.type === 'keydown') {
  const selection = terminal.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection)
      .catch(() => api.app.clipboardWrite(selection));
    return false; // suppress xterm — we copied
  }
  // No selection → return true → xterm sends SIGINT to PTY
  return true;
}
```

### The paste pattern — debounced, dual-path

The existing `sendPaste` helper pattern (already used in 3+ places) is the correct approach:

```js
// Pattern: primary = navigator.clipboard, fallback = IPC (avoids focus-loss failure)
const sendPaste = (text) => {
  if (!text) return;
  api.terminal.input({ id: terminalId, data: text });
};
const now = Date.now();
if (now - lastPasteTime < PASTE_DEBOUNCE_MS) return false;
lastPasteTime = now;
navigator.clipboard.readText()
  .then(sendPaste)
  .catch(() => api.app.clipboardRead().then(sendPaste));
return false;
```

### Word-jump VT escape sequences

When the terminal is xterm-compatible (node-pty + PowerShell on Windows), Ctrl+Left and Ctrl+Right word-jump require sending VT escape sequences via the PTY input channel — not browser key events. The standard ANSI sequences are:

- Ctrl+Left (word back): `\x1b[1;5D`
- Ctrl+Right (word forward): `\x1b[1;5C`

```js
// In createTerminalKeyHandler, after removing the tab-switch branch:
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowLeft' && e.type === 'keydown') {
  api.terminal.input({ id: terminalId, data: '\x1b[1;5D' });
  return false;
}
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowRight' && e.type === 'keydown') {
  api.terminal.input({ id: terminalId, data: '\x1b[1;5C' });
  return false;
}
```

Note: PowerShell and bash both recognize these sequences. They may not work in all programs running inside the PTY, but they are the correct approach for a terminal emulator.

### Right-click paste — contextmenu listener

`navigator.clipboard.readText()` silently fails when the window loses focus (which happens on right-click in some Electron versions). The STATE.md blocker note explicitly flags this: **use IPC clipboard path directly**.

```js
// Add to each terminal creation code path, after wrapper is created
wrapper.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.app.clipboardRead().then((text) => {
    if (!text) return;
    const now = Date.now();
    if (now - lastPasteTime < PASTE_DEBOUNCE_MS) return;
    lastPasteTime = now;
    api.terminal.input({ id: terminalId, data: text });
  });
});
```

### Ctrl+Tab wiring across layers

Currently, Ctrl+Tab does NOT reach `createTerminalKeyHandler` because Chromium intercepts Ctrl+Tab at the browser level (tab cycling). However, in Electron with a frameless window and no native tab bar, the behavior may differ. Testing is required.

If Ctrl+Tab is eaten by Chromium: it must be intercepted in `before-input-event` in MainWindow.js (like Ctrl+Arrow currently is) and forwarded via a new IPC channel or the existing `ctrl-arrow` channel with new direction values.

If Ctrl+Tab reaches the renderer normally: `ShortcutsManager.registerAllShortcuts()` adding a `registerShortcut('Ctrl+Tab', ...)` call will work directly.

**Safe approach for the plan**: Intercept in `before-input-event` as a guaranteed path, forwarding to renderer via IPC. The `onCtrlArrow` listener in renderer.js already forwards to `switchTerminal` — a similar `onCtrlTab` listener can be added. Alternatively, extend the `ctrl-arrow` IPC message to also carry `tab-next` / `tab-prev` directions, though that is semantically awkward.

### Where Ctrl+Arrow removal happens (two places)

1. **`createTerminalKeyHandler`** (TerminalManager.js ~line 531-558): Remove the `isArrowKey` branch that calls `onSwitchTerminal` for Left/Right. Keep Up/Down for project switching OR remove all four and handle via IPC.

2. **`before-input-event`** (MainWindow.js lines 43-53): This intercepts ALL Ctrl+Arrow at the main process level. After the remap, this handler must either be removed entirely (if Ctrl+Arrow should reach xterm for word-jump) or narrowed to only forward Up/Down (for project switching).

**Critical**: If `before-input-event` is not modified, Ctrl+Left/Right will still be intercepted at the OS/Electron level and never reach `createTerminalKeyHandler`. The word-jump sequences will never be sent to the PTY. This is the most likely implementation pitfall.

### Anti-Patterns to Avoid

- **Checking `navigator.clipboard` for right-click paste**: Focus-loss causes silent failure. Use `api.app.clipboardRead()` (IPC path to Electron's `clipboard.readText()`).
- **Removing only one of the two Ctrl+Arrow interception points**: Must remove from both `createTerminalKeyHandler` AND `before-input-event`.
- **Returning `true` from key handler for Ctrl+C copy**: Must return `false` when selection exists, otherwise xterm will also process the event and send SIGINT to PTY.
- **Adding Ctrl+Tab to `registerCommonShortcuts` only**: That function is not called from `ShortcutsManager.registerAllShortcuts()` — shortcuts registered there won't be active.
- **Using `window.addEventListener('keydown')` for Ctrl+Tab**: Will not fire if Chromium intercepts it first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clipboard read | Custom clipboard polling | `api.app.clipboardRead()` → `ipcMain.handle('clipboard-read')` | Already implemented, handles cross-platform |
| Clipboard write | `document.execCommand('copy')` | `navigator.clipboard.writeText()` + IPC fallback | Already the established pattern in codebase |
| Key sequence debouncing | Custom timer | `lastPasteTime` / `PASTE_DEBOUNCE_MS` already defined as module-level vars | Reuse existing variables — they are already shared |
| Terminal input | Direct PTY write | `api.terminal.input({ id, data })` IPC call | PTY is in main process, must go through IPC |

**Key insight:** Every pattern needed already exists in the codebase. This phase is copy-adapt-wire, not build-new.

## Common Pitfalls

### Pitfall 1: before-input-event still eating Ctrl+Arrow
**What goes wrong:** Word-jump (TERM-03) appears wired in renderer but never fires. Tests in DevTools show the keydown event never arrives.
**Why it happens:** `before-input-event` in MainWindow.js runs in the main process and calls `event.preventDefault()` on all Ctrl+Arrow keys before they reach the renderer.
**How to avoid:** Narrow the `before-input-event` handler to only intercept Ctrl+Up and Ctrl+Down (for project switching) after this phase. Remove Left/Right from its interception list.
**Warning signs:** Setting a breakpoint in `createTerminalKeyHandler` for ArrowLeft never triggers while Ctrl+Left is pressed.

### Pitfall 2: Ctrl+Tab intercepted by Chromium
**What goes wrong:** `registerShortcut('Ctrl+Tab', ...)` is registered but never fires. The `keydown` listener on `document` never sees Ctrl+Tab.
**Why it happens:** Chromium's internal tab-cycling shortcut consumes Ctrl+Tab before it reaches JavaScript.
**How to avoid:** Intercept Ctrl+Tab in `before-input-event` (main process) and forward via IPC — same architecture as the existing Ctrl+Arrow forwarding.
**Warning signs:** Pressing Ctrl+Tab in DevTools console shows no keydown event logged on `document`.

### Pitfall 3: Double paste on right-click
**What goes wrong:** Right-click paste fires twice.
**Why it happens:** The existing `setupPasteHandler` listens on the `paste` DOM event, which may also fire when paste is triggered programmatically. The `contextmenu` handler and `paste` event handler can both fire for the same user action.
**How to avoid:** Use the shared `lastPasteTime` / `PASTE_DEBOUNCE_MS` guard — already used by all other paste paths, prevents double-paste within 500ms.
**Warning signs:** Two copies of pasted text appear in the terminal.

### Pitfall 4: Ctrl+C returning false when no selection breaks SIGINT
**What goes wrong:** Ctrl+C no longer sends SIGINT. Claude CLI stops being interruptible.
**Why it happens:** Handler returns `false` unconditionally instead of conditionally on selection.
**How to avoid:** Always check `terminal.getSelection()` before deciding to copy. If no selection (or empty string), return `true` to let xterm process it (which sends SIGINT through PTY).
**Warning signs:** Running `sleep 10` in terminal, pressing Ctrl+C does nothing.

### Pitfall 5: inputChannel routing for non-standard terminals
**What goes wrong:** Ctrl+V paste works in regular terminals but not in FiveM or WebApp consoles.
**Why it happens:** `createTerminalKeyHandler` takes an `inputChannel` parameter that routes input to `api.fivem.input`, `api.webapp.input`, or `api.terminal.input`. The right-click handler must use the same routing logic.
**How to avoid:** The `sendPaste` helper function pattern in `createTerminalKeyHandler` already has the three-way branch — replicate it for the right-click handler, or pass `sendPaste` as a closure.

## Code Examples

### createTerminalKeyHandler modifications (complete diff view)

```js
// BEFORE (lines 531-558 in TerminalManager.js):
if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.repeat && e.type === 'keydown') {
  const isArrowKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
  if (isArrowKey) {
    // ... debounce ...
    if (e.key === 'ArrowLeft' && callbacks.onSwitchTerminal) {
      callbacks.onSwitchTerminal('left');
      return false;
    }
    if (e.key === 'ArrowRight' && callbacks.onSwitchTerminal) {
      callbacks.onSwitchTerminal('right');
      return false;
    }
    if (e.key === 'ArrowUp' && callbacks.onSwitchProject) { ... }
    if (e.key === 'ArrowDown' && callbacks.onSwitchProject) { ... }
  }
}

// AFTER (02-01: remap tab-switching; 02-02: add copy/paste/word-jump):
// Tab switching now via Ctrl+Tab/Ctrl+Shift+Tab — handled in ShortcutsManager
// Ctrl+Up/Down project switching remains in before-input-event

// Ctrl+C: selection-gated copy, fallthrough to SIGINT
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'C' && e.type === 'keydown') {
  const selection = terminal.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection).catch(() => api.app.clipboardWrite(selection));
    return false;
  }
  return true; // no selection → let xterm send SIGINT
}

// Ctrl+V: paste
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'V' && e.type === 'keydown') {
  const now = Date.now();
  if (now - lastPasteTime < PASTE_DEBOUNCE_MS) return false;
  lastPasteTime = now;
  const sendPaste = (text) => { if (!text) return; api.terminal.input({ id: terminalId, data: text }); };
  navigator.clipboard.readText().then(sendPaste).catch(() => api.app.clipboardRead().then(sendPaste));
  return false;
}

// Ctrl+Left: word-jump back
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowLeft' && e.type === 'keydown') {
  api.terminal.input({ id: terminalId, data: '\x1b[1;5D' });
  return false;
}

// Ctrl+Right: word-jump forward
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowRight' && e.type === 'keydown') {
  api.terminal.input({ id: terminalId, data: '\x1b[1;5C' });
  return false;
}
```

### MainWindow.js before-input-event narrowing

```js
// BEFORE: intercepts Left/Right/Up/Down
const dir = { Left: 'left', ArrowLeft: 'left', Right: 'right', ArrowRight: 'right',
               Up: 'up', ArrowUp: 'up', Down: 'down', ArrowDown: 'down' }[input.key];

// AFTER: only intercept Up/Down for project switching; Left/Right pass through for word-jump
// AND intercept Tab for terminal tab switching
if (input.key === 'Tab') {
  // Forward as ctrl-tab or ctrl-shift-tab
  event.preventDefault();
  mainWindow.webContents.send('ctrl-tab', input.shift ? 'prev' : 'next');
  return;
}
const dir = { Up: 'up', ArrowUp: 'up', Down: 'down', ArrowDown: 'down' }[input.key];
```

### ShortcutsManager.registerAllShortcuts addition (for Ctrl+Tab via IPC)

The cleanest approach: keep the IPC pattern established by `ctrl-arrow` and add a new `ctrl-tab` channel. In renderer.js:

```js
// Add alongside the existing onCtrlArrow listener:
api.window.onCtrlTab((dir) => {
  if (dir === 'next') switchTerminal('right');
  else if (dir === 'prev') switchTerminal('left');
});
```

And in preload.js, add to the `window` namespace:
```js
onCtrlTab: createListener('ctrl-tab')
```

### Right-click contextmenu handler

```js
// Add in each terminal creation path after setupPasteHandler call:
wrapper.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const now = Date.now();
  if (now - lastPasteTime < PASTE_DEBOUNCE_MS) return;
  lastPasteTime = now;
  // Use IPC path directly — navigator.clipboard fails on focus loss
  api.app.clipboardRead().then((text) => {
    if (!text) return;
    if (inputChannel === 'fivem-input') {
      api.fivem.input({ projectIndex: terminalId, data: text });
    } else if (inputChannel === 'webapp-input') {
      api.webapp.input({ projectIndex: terminalId, data: text });
    } else {
      api.terminal.input({ id: terminalId, data: text });
    }
  });
});
```

## Key Files to Modify

| File | Change | Plan |
|------|--------|------|
| `src/renderer/ui/components/TerminalManager.js` | `createTerminalKeyHandler`: remove Ctrl+Left/Right tab-switch; add Ctrl+C copy-gated, Ctrl+V paste, Ctrl+Arrow word-jump; add `contextmenu` listener in each terminal creation path | 02-01 (remove) + 02-02 (add) + 02-03 (right-click) |
| `src/main/windows/MainWindow.js` | `before-input-event`: narrow to only Up/Down (remove Left/Right); add Ctrl+Tab interception | 02-01 |
| `src/main/preload.js` | Add `onCtrlTab: createListener('ctrl-tab')` to `window` namespace | 02-01 |
| `renderer.js` | Add `api.window.onCtrlTab(...)` listener wired to `switchTerminal` | 02-01 |

## Open Questions

1. **Does Ctrl+Tab reach the renderer without `before-input-event` interception?**
   - What we know: Chromium internally uses Ctrl+Tab for tab cycling; Electron frameless windows may or may not suppress this
   - What's unclear: Whether Electron 28 with `frame: false` still eats Ctrl+Tab in the renderer process
   - Recommendation: The plan should use `before-input-event` as the guaranteed interception point, same as Ctrl+Arrow. This eliminates the uncertainty.

2. **Does xterm.js 6.x internally handle Ctrl+V in any way?**
   - What we know: xterm.js has a `rightClickSelectsWord` option and some built-in clipboard handling that varies by version; the existing `setupClipboardShortcuts` already intercepts Ctrl+Shift+V in capture phase precisely because xterm 6.x fails in Electron
   - What's unclear: Whether xterm 6.x also intercepts plain Ctrl+V internally (triggering a paste that conflicts with our handler)
   - Recommendation: The `createTerminalKeyHandler` runs before xterm processes the key (that is its purpose), so returning `false` from it will prevent any xterm-internal Ctrl+V behavior. Safe to proceed.

3. **Word-jump escape sequences in PowerShell vs CMD vs bash (WSL)?**
   - What we know: `\x1b[1;5D` / `\x1b[1;5C` are standard ANSI sequences recognized by bash readline and PowerShell's PSReadLine
   - What's unclear: Whether the default Windows CMD (if someone runs it instead of PowerShell) handles these sequences
   - Recommendation: This is acceptable — cmd.exe does not support word-jump regardless. Plan as "best effort for supported shells."

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `src/renderer/ui/components/TerminalManager.js` — `createTerminalKeyHandler` (lines 529-668), `setupClipboardShortcuts` (lines 459-494), `setupPasteHandler` (lines 497-519), all 5 terminal creation call sites
- Direct inspection of `src/main/windows/MainWindow.js` — `before-input-event` handler (lines 42-53)
- Direct inspection of `src/main/preload.js` — `onCtrlArrow`, `clipboardRead`, `clipboardWrite` (lines 215, 224-225)
- Direct inspection of `renderer.js` — `switchTerminal` (lines 1317-1348), `api.window.onCtrlArrow` listener (lines 1395-1399)
- Direct inspection of `src/renderer/ui/panels/ShortcutsManager.js` — `registerAllShortcuts` (lines 262-312)
- Direct inspection of `.planning/STATE.md` — explicit blocker notes for Phase 2

### Secondary (MEDIUM confidence)
- ANSI escape sequences `\x1b[1;5D` / `\x1b[1;5C` for Ctrl+Arrow word-jump: well-established terminal standard, used by xterm-compatible terminals universally

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, existing APIs confirmed in source
- Architecture: HIGH — implementation patterns verified directly from existing working code
- Pitfalls: HIGH — two pitfalls (before-input-event, Ctrl+Tab Chromium) are flagged in STATE.md as known blockers; others derived from direct code reading

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable codebase, no fast-moving dependencies)
