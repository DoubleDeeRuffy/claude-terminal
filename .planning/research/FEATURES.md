# Feature Research

**Domain:** Electron desktop terminal emulator with integrated file explorer (xterm.js + node-pty)
**Researched:** 2026-02-24
**Confidence:** HIGH — findings grounded in xterm.js official API docs, VS Code terminal documentation, and verified GitHub issue threads

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken, not incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ctrl+C copies selected text | Every Windows terminal (Windows Terminal, VS Code, PuTTY) copies on Ctrl+C when text is selected | LOW | Use `attachCustomKeyEventHandler`: intercept Ctrl+C, if `terminal.hasSelection()` write to `navigator.clipboard`, return `false` to cancel xterm processing. Must not break Ctrl+C SIGINT when no text is selected. |
| Ctrl+V pastes clipboard | Same user expectation on Windows — muscle memory from all editors and terminals | LOW | Use `attachCustomKeyEventHandler`: intercept Ctrl+V, read `navigator.clipboard.readText()`, call `terminal.paste(text)`, return `false`. `navigator.clipboard` works in Electron renderer by default (no special permissions needed). |
| Right-click paste | PuTTY and many classic Windows SSH clients trained this behavior; common in Windows Terminal | LOW | Attach `contextmenu` event listener on the terminal container. Call `navigator.clipboard.readText()` then `terminal.paste(text)`. Suppress the browser context menu with `e.preventDefault()`. |
| Ctrl+Arrow word jump | Every shell on Windows (PowerShell, cmd) sends word-jump escape sequences via Ctrl+Left/Right; users expect cursor to skip words | MEDIUM | xterm.js does NOT handle this natively — it must be implemented by the embedder. Use `attachCustomKeyEventHandler`: intercept `Ctrl+ArrowLeft` and send `\x1b[1;5D` (backward word), intercept `Ctrl+ArrowRight` and send `\x1b[1;5C` (forward word) via `terminal.paste()`. These are standard ANSI escape sequences that PowerShell and bash interpret as word movement. |
| Dotfiles and dotfolders visible | Developers manage projects that contain `.planning/`, `.git/`, `.env`, `.github/`, `.husky/` etc. — hiding these makes the file explorer useless for project management | LOW | The current code has two filter lines: `if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;` — remove both. The `IGNORE_PATTERNS` set already handles the truly unwanted items (`.DS_Store`, `Thumbs.db`, etc.). No toggle needed per PROJECT.md scope. |
| "New Terminal" button always visible | Users expect a "+" or "New Terminal" button prominently placed near the terminal tab strip, not buried in a menu | LOW | PROJECT.md specifies placement: after the project name, above the tab control. This is the VS Code pattern (the `+` icon at top of the TERMINAL panel). Currently a global `Ctrl+T` shortcut exists, but no visible button at the terminal scope. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required for correctness, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Copy-on-select (auto-copy) | VS Code offers this as `terminal.integrated.copyOnSelection`. Power users who use mouse selection expect the selection to auto-copy to clipboard — no Ctrl+C needed | LOW | Add `terminal.onSelectionChange(() => { if (terminal.hasSelection()) navigator.clipboard.writeText(terminal.getSelection()); })`. Can be a setting, but is a strong default for developer tools. |
| Selection-aware Ctrl+C | When text is selected, Ctrl+C copies. When nothing is selected, Ctrl+C sends SIGINT. This is exactly what Windows Terminal does and feels natural | LOW | This is part of the table-stakes Ctrl+C implementation — the condition `if (terminal.hasSelection())` handles this automatically. Worth calling out as a differentiator from naive implementations that always copy. |
| Persistent dotfile visibility | Once dotfiles are shown, the state persists across explorer navigations and app restarts — no re-toggling per folder | LOW | Since the decision is to remove the filter entirely (not toggle), this is free. No state management needed. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Configurable dotfile toggle (show/hide dotfiles per project) | Users from VS Code expect a toggle button in the explorer panel | Adds state management overhead, requires UI for a toggle, exposes edge cases (partial visibility, sync across panels). PROJECT.md explicitly says "just removing the filter" — not building a toggle | Remove the filter entirely. Developers working in this app want all files visible. The `IGNORE_PATTERNS` set already excludes `node_modules`, `.DS_Store`, etc. |
| Terminal split panes | Common request from iTerm2 / tmux users | Out of scope per PROJECT.md. High complexity, requires significant layout engine changes, and the multi-terminal tab model already provides parallel shells | Use existing multi-terminal tabs (Ctrl+T) for parallel work |
| Configurable keybinding for copy/paste | Some users want Ctrl+Shift+C instead of Ctrl+C | Adds settings complexity for three users. The Windows convention (Ctrl+C with selection = copy) is correct for the primary target platform (Windows 10/11) | Implement the Windows Terminal convention (Ctrl+C copies when text selected, SIGINT when not). This satisfies the vast majority without configuration. |
| Custom key handler for every modifier combo | Implementing a full keybinding system inside xterm | High complexity, already handled by the app-level `KeyboardShortcuts.js`. Scope creep — the three terminal-specific shortcuts (copy, paste, word-jump) are all that's needed | Wire only the specific keys required: Ctrl+C, Ctrl+V, Ctrl+Left, Ctrl+Right, contextmenu |

---

## Feature Dependencies

```
[Ctrl+C copy] ──requires──> [attachCustomKeyEventHandler installed on terminal]
[Ctrl+V paste] ──requires──> [attachCustomKeyEventHandler installed on terminal]
[Ctrl+Arrow word jump] ──requires──> [attachCustomKeyEventHandler installed on terminal]
[Right-click paste] ──requires──> [contextmenu listener on terminal container]

[attachCustomKeyEventHandler] ──must be installed in──> [mountTerminal() in TerminalService.js]

[Dotfiles visible] ──requires──> [remove filter lines in FileExplorer.js readDir() and collectAllFiles()]
    └── Two locations: line ~233 and line ~370 in FileExplorer.js

[New Terminal button] ──requires──> [HTML added to index.html near project name / terminal tab strip]
    └── [click handler wired to existing createTerminal() flow]

[Copy-on-select] ──enhances──> [Ctrl+C copy]
    └── Both write to navigator.clipboard; copy-on-select is additive

[Ctrl+C selection-aware] ──conflicts with──> [always-copy Ctrl+C]
    └── Must check hasSelection() — not intercept Ctrl+C unconditionally
```

### Dependency Notes

- **All keyboard features require `attachCustomKeyEventHandler`:** All three hotkey features (Ctrl+C, Ctrl+V, Ctrl+Arrow) must be wired in `mountTerminal()` in `TerminalService.js`. A single `attachCustomKeyEventHandler` call handles all three — not three separate calls.
- **Dotfiles and new terminal button are independent:** They touch different files (`FileExplorer.js` vs `index.html` + `TerminalService.js`). Can be implemented in parallel.
- **Right-click requires separate event listener:** `attachCustomKeyEventHandler` does not intercept mouse events. A `contextmenu` event listener on the terminal DOM container is required.
- **`navigator.clipboard` is async:** Both Ctrl+V paste and right-click paste call `navigator.clipboard.readText()` which returns a Promise. The `attachCustomKeyEventHandler` return value is synchronous — must return `false` immediately, then handle clipboard async.

---

## MVP Definition

### Launch With (This Milestone — all 6 active requirements from PROJECT.md)

- [x] Ctrl+C copies selected text in xterm.js — users cannot copy terminal output without this
- [x] Ctrl+V pastes clipboard — users cannot paste commands without this
- [x] Right-click paste — critical for Windows users accustomed to PuTTY/classic terminals
- [x] Ctrl+Arrow word jump — essential for editing long shell commands
- [x] Dotfiles visible in file explorer — project is unusable for managing `.planning/`, `.github/`, etc.
- [x] "New Terminal" button visible above tab strip — discoverability; Ctrl+T shortcut exists but is not obvious

### Add After Validation (v1.x — if user feedback requests)

- [ ] Copy-on-select — good differentiator, but not blocking anyone right now; add if users ask
- [ ] Visual indicator when text is copied (brief "Copied" toast) — polish, low friction to add later

### Future Consideration (v2+ — out of scope for this milestone)

- [ ] Terminal split panes — explicitly out of scope per PROJECT.md
- [ ] Configurable dotfile toggle per-project — out of scope per PROJECT.md
- [ ] Configurable hotkeys for terminal copy/paste — scope creep, not requested

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Ctrl+C copy (selection-aware) | HIGH | LOW | P1 |
| Ctrl+V paste | HIGH | LOW | P1 |
| Ctrl+Arrow word jump | HIGH | LOW | P1 |
| Right-click paste | HIGH | LOW | P1 |
| Dotfiles visible | HIGH | LOW | P1 |
| New Terminal button | MEDIUM | LOW | P1 |
| Copy-on-select | MEDIUM | LOW | P2 |
| Copied toast feedback | LOW | LOW | P3 |

All P1 items are LOW implementation cost because xterm.js provides the exact APIs needed (`attachCustomKeyEventHandler`, `getSelection`, `hasSelection`, `paste`) and the dotfile fix is a two-line deletion.

---

## Competitor Feature Analysis

| Feature | VS Code Terminal | Windows Terminal | Our Current State | Our Plan |
|---------|-----------------|-----------------|-------------------|----------|
| Ctrl+C copy (with selection) | Yes (Windows default) | Yes (default) | Missing | Add via `attachCustomKeyEventHandler` |
| Ctrl+V paste | Yes | Yes | Missing | Add via `attachCustomKeyEventHandler` + `terminal.paste()` |
| Right-click paste | Configurable | Default on Windows | Missing | Add `contextmenu` event + `navigator.clipboard.readText()` |
| Ctrl+Arrow word jump | Yes (sends escape sequences) | Yes | Missing | Add via `attachCustomKeyEventHandler` + send `\x1b[1;5D/C` |
| Dotfiles visible | Configurable (default hidden) | N/A | Mostly hidden (only .env and .gitignore allowed) | Remove filter entirely |
| New Terminal button | Yes — `+` icon in toolbar | Yes — `+` tab button | Missing (only Ctrl+T shortcut) | Add button after project name above tab strip |

---

## Implementation Notes

### xterm.js API Confirmed (HIGH confidence — official docs at xtermjs.org)

- `terminal.attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean)` — runs before xterm processes the key; returning `false` cancels xterm's default handling
- `terminal.hasSelection()` — returns boolean; use to gate copy behavior on Ctrl+C
- `terminal.getSelection()` — returns string of selected text
- `terminal.paste(text: string)` — writes text to terminal, performing paste transformations
- `terminal.onSelectionChange(callback)` — fires when selection changes (for copy-on-select)

### Escape Sequences for Word Jump (MEDIUM confidence — verified via xterm.js issue #4538)

- `Ctrl+Left` (backward word): send `\x1b[1;5D`
- `Ctrl+Right` (forward word): send `\x1b[1;5C`
- PowerShell and bash both interpret these sequences as backward/forward word movement

### Clipboard API in Electron Renderer (HIGH confidence — Electron official docs + Doyensec security analysis)

- `navigator.clipboard.writeText(text)` — works in Electron renderer without extra permissions by default
- `navigator.clipboard.readText()` — works in Electron renderer by default
- Alternative: `window.electron_api.dialog` IPC call if clipboard permissions are restricted (unlikely needed given `contextIsolation: false` in this app)

### FileExplorer.js Filter Locations (HIGH confidence — read from codebase)

Two filter lines must be removed (same pattern in both `readDir()` and `collectAllFiles()`):
```js
// Line ~233 and ~370 — REMOVE both:
if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;
```
The `IGNORE_PATTERNS` set already excludes `.DS_Store`, `Thumbs.db`, and build artifacts. The `.env` and `.gitignore` allowlist exceptions become irrelevant after removal.

---

## Sources

- [xterm.js Terminal API — official docs](https://xtermjs.org/docs/api/terminal/classes/terminal/) — `attachCustomKeyEventHandler`, `getSelection`, `hasSelection`, `paste` (HIGH confidence)
- [xterm.js issue #2478 — Browser Copy/Paste documentation](https://github.com/xtermjs/xterm.js/issues/2478) — confirms `attachCustomKeyEventHandler` as the preferred copy/paste approach (HIGH confidence)
- [xterm.js issue #4538 — Remove alt→ctrl+arrow hack](https://github.com/xtermjs/xterm.js/issues/4538) — documents escape sequences `\x1b[1;5D` / `\x1b[1;5C` for word jump (MEDIUM confidence)
- [VS Code Terminal Basics docs](https://code.visualstudio.com/docs/terminal/basics) — Ctrl+C/V shortcuts on Windows, new terminal `+` button pattern (HIGH confidence)
- [Electron Clipboard API — official docs](https://www.electronjs.org/docs/latest/api/clipboard) — clipboard access in renderer process (HIGH confidence)
- [Doyensec — Electron Web API Permissions](https://blog.doyensec.com/2022/09/27/electron-api-default-permissions.html) — confirms renderer process gets clipboard access by default (MEDIUM confidence)
- [Windows Terminal issue #3337 — right-click context menu](https://github.com/microsoft/terminal/issues/3337) — right-click paste as expected UX in Windows terminal apps (MEDIUM confidence)
- [VS Code issue #98591 — Explorer UI toggle for hidden files](https://github.com/microsoft/vscode/issues/98591) — confirms dotfile toggle is a common request; deliberate decision to skip toggle here (MEDIUM confidence)

---

*Feature research for: Electron terminal UX fixes (xterm.js hotkeys, file explorer dotfiles, new terminal button)*
*Researched: 2026-02-24*
