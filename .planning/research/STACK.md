# Stack Research

**Domain:** Electron + xterm.js UX fixes (keyboard shortcuts, file filtering, UI button)
**Researched:** 2026-02-24
**Confidence:** HIGH — all three feature areas verified against existing codebase + official xterm.js docs

---

## Overview

This is a brownfield milestone. No new packages are needed. All three UX fixes use APIs already present in the codebase. The research documents the exact APIs, patterns, and constraints for each fix.

---

## Feature 1: xterm.js Keyboard Shortcut Handling

### API: `attachCustomKeyEventHandler`

**Confidence: HIGH** — Verified via official xterm.js API docs (https://xtermjs.org/docs/api/terminal/classes/terminal/)

```typescript
terminal.attachCustomKeyEventHandler(
  (event: KeyboardEvent) => boolean
): void
```

- Called **before** xterm.js processes the key event
- Return `false` to consume the event (xterm does NOT send it to PTY)
- Return `true` to let xterm handle normally (event flows to PTY)
- Receives both `keydown` and `keyup` events — filter with `event.type === 'keydown'`

**Critical semantics:** `return false` is how you prevent xterm from acting. This is the correct interception point for all terminal-level shortcuts.

### Already in Use

The codebase uses `attachCustomKeyEventHandler` via `createTerminalKeyHandler()` at:
- `src/renderer/ui/components/TerminalManager.js`, line 529
- Applied to all terminal types: main terminals (line 1222), resume sessions (line 2637), basic terminals (line 2794), type consoles (line 1510)

### Pattern 1: Ctrl+C Copy vs. Interrupt (with selection guard)

**Confidence: HIGH** — Pattern confirmed in xterm.js GitHub issue #2478 (official maintainer recommendation)

```javascript
terminal.attachCustomKeyEventHandler((e) => {
  if (e.ctrlKey && !e.shiftKey && e.key === 'c' && e.type === 'keydown') {
    const selection = terminal.getSelection();
    if (selection) {
      // Text is selected → copy it, consume the event
      navigator.clipboard.writeText(selection)
        .catch(() => api.app.clipboardWrite(selection));
      return false; // Prevent \x03 SIGINT from being sent
    }
    // No selection → fall through, xterm sends \x03 (SIGINT) as normal
  }
  return true;
});
```

**Key insight:** `getSelection()` returns empty string `""` when nothing is selected. The guard `if (selection)` cleanly separates copy intent from interrupt intent. Ctrl+C with no selection behaves as normal terminal interrupt.

### API: `terminal.getSelection()`

**Confidence: HIGH** — Verified via official docs

```typescript
terminal.getSelection(): string
```

Returns the current text selection as a plain string. Returns `""` if nothing is selected.

### Pattern 2: Ctrl+V Paste (non-Shift variant)

**Confidence: HIGH** — Pattern observed in existing `createTerminalKeyHandler()` implementation

The existing code handles `Ctrl+Shift+V` for paste. The requirement adds `Ctrl+V` (without Shift) as an alternative. Implementation adds a parallel branch in `attachCustomKeyEventHandler`:

```javascript
if (e.ctrlKey && !e.shiftKey && e.key === 'v' && e.type === 'keydown') {
  e.preventDefault();
  const now = Date.now();
  if (now - lastPasteTime < PASTE_DEBOUNCE_MS) return false;
  lastPasteTime = now;
  navigator.clipboard.readText()
    .then(sendPaste)
    .catch(() => api.app.clipboardRead().then(sendPaste));
  return false;
}
```

**Why both Ctrl+V and Ctrl+Shift+V:** `Ctrl+V` is the Windows/macOS standard. `Ctrl+Shift+V` is the Linux terminal convention. Supporting both covers all users.

**Anti-spam:** The existing `lastPasteTime` + `PASTE_DEBOUNCE_MS = 500` debounce guards against the Electron double-paste issue (xterm + OS both triggering paste). Reuse this pattern.

### Pattern 3: Right-Click Paste

**Confidence: MEDIUM** — Pattern inferred from codebase DOM event handling + xterm.js issue #3185

xterm.js does not expose a built-in `onContextMenu` hook. The correct approach is a DOM `contextmenu` event listener on the terminal wrapper element (the `.terminal-wrapper` div), attached before xterm captures events:

```javascript
wrapper.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  // Paste clipboard content into PTY
  navigator.clipboard.readText()
    .then(sendPaste)
    .catch(() => api.app.clipboardRead().then(sendPaste));
}, true); // capture phase
```

**Why capture phase (`true`):** xterm.js attaches its own contextmenu handler to suppress the browser default. Using capture phase ensures our handler runs first.

**Existing `rightClickSelectsWord` option:** The xterm.js `ITerminalOptions` has a `rightClickSelectsWord` property (defaults to `true` on macOS, `false` elsewhere). On Windows this option does not conflict — right-click does NOT select words by default, so intercepting contextmenu for paste is safe without disabling this option.

### Pattern 4: Ctrl+Arrow Word-Jump

**Confidence: HIGH** — Pattern confirmed in xterm.js issue #4538 and existing `createTerminalKeyHandler()` code

The current `createTerminalKeyHandler()` intercepts `Ctrl+Arrow` and calls `callbacks.onSwitchTerminal()` / `callbacks.onSwitchProject()` (tab/project navigation). This is the **conflict**: the same keys need to do word-jump when the cursor is inside the terminal shell.

The fix is NOT tab-switching — it's sending PTY escape sequences for word movement. The sequences:

| Action | Escape Sequence | Human Readable |
|--------|----------------|----------------|
| Word left | `\x1b[1;5D` | ESC [ 1 ; 5 D |
| Word right | `\x1b[1;5C` | ESC [ 1 ; 5 C |

These are the standard VT220/xterm sequences for Ctrl+Left and Ctrl+Right.

**Implementation choice:** The existing handler should send these sequences to PTY and return `false` (consume event, do not bubble to the tab-switching logic):

```javascript
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.type === 'keydown') {
  if (e.key === 'ArrowLeft') {
    api.terminal.input({ id: terminalId, data: '\x1b[1;5D' });
    return false;
  }
  if (e.key === 'ArrowRight') {
    api.terminal.input({ id: terminalId, data: '\x1b[1;5C' });
    return false;
  }
}
```

**Removal of tab-switch for Ctrl+Arrow:** The existing `callbacks.onSwitchTerminal('left'/'right')` call in `createTerminalKeyHandler()` must be removed or remapped to a different shortcut (e.g., `Ctrl+Shift+Arrow`).

**Why not `Alt+Arrow`:** xterm.js had a historical hack mapping Alt+arrow to Ctrl+arrow sequences (issue #4538). This hack was removed. Do not rely on Alt+arrow — use `attachCustomKeyEventHandler` to send the escape sequence directly.

---

## Feature 2: File Explorer Dotfile Visibility

### Current Filter Location

**Confidence: HIGH** — Direct codebase inspection

File: `C:/Users/uhgde/source/repos/claude-terminal/src/renderer/ui/components/FileExplorer.js`

The dotfile filter appears in **two functions**:

**1. `readDirectoryAsync()` (line 233):**
```javascript
if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;
```

**2. `collectAllFiles()` (line 370, used for search):**
```javascript
if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;
```

### Fix

Remove the dotfile guard in both functions. The `IGNORE_PATTERNS` set (line 42) already handles the truly-unwanted directories:
```javascript
const IGNORE_PATTERNS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'vendor', '.cache', '.idea', '.vscode',
  '.DS_Store', 'Thumbs.db', '.env.local', 'coverage',
  '.nuxt', '.output', '.turbo', '.parcel-cache'
]);
```

After removing the dotfile guard, dotfiles and dotfolders (`.planning`, `.claude`, `.env`, `.gitignore`, `.github`, etc.) will appear. The `.git` directory remains hidden via `IGNORE_PATTERNS`.

**No new APIs needed.** This is a one-line deletion in two places.

---

## Feature 3: "New Terminal" Button Placement

### Current UI Structure

**Confidence: HIGH** — Direct inspection of `index.html`

The terminals panel header (`div.terminals-header`) contains:
- A file explorer toggle button (`btn-toggle-explorer`)
- A `div.terminals-filter` (shown when a project is selected) containing: project name span, git action buttons, branch selector, actions/prompts dropdowns, and a clear/show-all button

The **project name span** is `<span class="filter-project" id="filter-project-name">` (line 277).

### Button Placement

The requirement: "New Terminal button positioned after project name, above the tab control."

The correct insertion point is immediately after `#filter-project-name` inside `div.terminals-filter`. The TerminalManager component controls this area dynamically. The button triggers `callbacks.onNewTerminal` or the equivalent keyboard shortcut handler.

### Implementation

The button is a DOM element injected by `TerminalManager.js` when rendering the header, or defined statically in `index.html` with conditional visibility. The simpler approach (no JS rebuild complexity) is to add it statically in `index.html` inside `.terminals-filter`, hidden by default, shown/hidden alongside `.terminals-filter`.

**CSS pattern:** The existing `.btn-icon` and `.filter-git-btn` classes provide the correct visual style. A new terminal button uses the `+` icon (plus icon SVG) matching the existing tab creation affordance.

**No new APIs needed.** The click handler calls the existing `createTerminal()` flow already wired to `Ctrl+T` / `Ctrl+Shift+T`.

---

## Clipboard API Summary

**Confidence: HIGH** — Verified in preload bridge + dialog IPC handler

The clipboard fallback chain used throughout `TerminalManager.js`:

```javascript
// Read (paste)
navigator.clipboard.readText()
  .then(sendPaste)
  .catch(() => api.app.clipboardRead().then(sendPaste));

// Write (copy)
navigator.clipboard.writeText(text)
  .catch(() => api.app.clipboardWrite(text));
```

- `navigator.clipboard` — Web Clipboard API, works in Electron's renderer when page is focused
- `api.app.clipboardRead()` / `api.app.clipboardWrite()` — IPC fallback via `clipboard-read` / `clipboard-write` handlers in `dialog.ipc.js` using Electron's `clipboard` module
- Both paths already exist and work. New code reuses this pattern identically.

---

## Recommended Stack (No Changes)

| Technology | Version | Role | Status |
|------------|---------|------|--------|
| `@xterm/xterm` | ^6.0.0 | Terminal emulator | Existing — use `attachCustomKeyEventHandler` + `getSelection()` |
| `@xterm/addon-webgl` | ^0.19.0 | GPU rendering | Existing — no change |
| `@xterm/addon-fit` | ^0.11.0 | Auto-fit | Existing — no change |
| Electron `clipboard` | built-in | IPC clipboard fallback | Existing — already in `dialog.ipc.js` |
| `navigator.clipboard` | Web API | Primary clipboard | Existing — already used in `TerminalManager.js` |

**No new npm packages required.** All fixes are implementation changes to existing code.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `terminal.onKey` event | Fires after xterm processes the key; cannot prevent PTY send | `attachCustomKeyEventHandler` (fires before) |
| `document.execCommand('copy')` | Deprecated, inconsistent in Electron | `navigator.clipboard.writeText()` with `api.app.clipboardWrite()` fallback |
| Electron `Menu.buildFromTemplate` for right-click | Requires main process round-trip, adds latency | DOM `contextmenu` event in renderer with direct PTY write |
| `Alt+Arrow` for word-jump | xterm.js removed Alt→Ctrl mapping hack (issue #4538) | Send `\x1b[1;5D` / `\x1b[1;5C` directly via `api.terminal.input()` |

---

## Version Compatibility

| Package | Constraint | Notes |
|---------|------------|-------|
| `@xterm/xterm` ^6.0.0 | `attachCustomKeyEventHandler` stable since v4 | No breaking changes for these APIs in v6 |
| `@xterm/xterm` ^6.0.0 | `getSelection()` stable since v3 | No breaking changes |
| Electron 28 (Chromium 120) | `navigator.clipboard` available | Requires user gesture or focused frame; IPC fallback covers edge cases |

---

## Sources

- xterm.js Terminal class API: https://xtermjs.org/docs/api/terminal/classes/terminal/ (HIGH confidence — official docs)
- xterm.js issue #2478 — Browser copy/paste with `attachCustomKeyEventHandler` + `getSelection()` pattern (HIGH confidence — maintainer recommendation)
- xterm.js issue #4538 — Ctrl+Arrow escape sequences, removal of Alt→Ctrl hack (HIGH confidence — official issue)
- xterm.js issue #3185 — Right-click contextmenu in custom terminal embedders (MEDIUM confidence — community discussion)
- Existing codebase: `src/renderer/ui/components/TerminalManager.js` — `createTerminalKeyHandler()`, `setupClipboardShortcuts()`, `setupPasteHandler()` (HIGH confidence — direct source)
- Existing codebase: `src/renderer/ui/components/FileExplorer.js` — `readDirectoryAsync()`, `collectAllFiles()` (HIGH confidence — direct source)
- Existing codebase: `src/main/ipc/dialog.ipc.js` — `clipboard-read`, `clipboard-write` IPC handlers (HIGH confidence — direct source)
- Existing codebase: `index.html` — `div.terminals-header`, `#filter-project-name` (HIGH confidence — direct source)

---

*Stack research for: Electron + xterm.js UX fixes*
*Researched: 2026-02-24*
