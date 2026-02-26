# Project Research Summary

**Project:** Claude Terminal — xterm.js UX Fixes (brownfield milestone)
**Domain:** Electron desktop terminal emulator — keyboard shortcuts, clipboard integration, file explorer filtering
**Researched:** 2026-02-24
**Confidence:** HIGH

## Executive Summary

This is a brownfield milestone targeting three UX gaps in an existing, mature Electron terminal application (v0.9.6). The gaps are: missing standard keyboard shortcuts in the xterm.js terminal (Ctrl+C copy, Ctrl+V paste, Ctrl+Arrow word-jump, right-click paste); a dotfile visibility filter in the file explorer that hides legitimate project files (.planning/, .github/, .claude/); and the absence of a visible "New Terminal" button above the tab strip. All three areas are self-contained and require no new npm packages — every API, pattern, and infrastructure piece needed already exists in the codebase.

The recommended approach is to implement all six changes as a single focused phase using established xterm.js APIs (`attachCustomKeyEventHandler`, `getSelection`, `hasSelection`, `paste`) and the existing two-path clipboard infrastructure (`navigator.clipboard` with `api.app.clipboardRead/Write` IPC fallback). The dotfile fix is a two-line deletion across two functions in `FileExplorer.js`. The button fix is a static HTML addition in `index.html` plus a click handler wire-up in `renderer.js`. All changes are localized to at most three files each with zero cross-change dependencies.

The primary risk is the Ctrl+Arrow key conflict: the existing `createTerminalKeyHandler` already intercepts Ctrl+Left/Right for terminal tab-switching, which is mutually exclusive with the word-jump behavior needed. This conflict must be resolved explicitly before writing code — the plan must declare which shortcut tab-switching moves to (recommended: Ctrl+Shift+Arrow) so that Ctrl+Arrow is freed for word-jump escape sequences. A secondary risk is that the dotfile filter appears in two separate functions in `FileExplorer.js`; removing it from only one causes silent inconsistency between the tree view and file search. Both must be removed in the same commit.

## Key Findings

### Recommended Stack

No new packages are required. This milestone is a pure implementation change against the existing stack. All three feature areas use APIs already present and verified in the codebase.

**Core technologies:**
- `@xterm/xterm` ^6.0.0: Terminal emulator — `attachCustomKeyEventHandler` (stable since v4), `getSelection()`, `hasSelection()`, `paste()` all confirmed in official API docs
- `navigator.clipboard` (Web API): Primary clipboard path — works in Electron renderer without extra permissions given `contextIsolation: false`
- `api.app.clipboardRead()` / `api.app.clipboardWrite()`: IPC clipboard fallback — already wired through `dialog.ipc.js` and `preload.js`; covers focus-loss edge cases
- `window.electron_nodeModules.fs`: Filesystem bridge — used by `FileExplorer.js` for directory reads; no IPC needed

### Expected Features

**Must have (table stakes) — all 6 are in scope for this milestone:**
- Ctrl+C copies selected text — every Windows terminal (Windows Terminal, VS Code, PuTTY) does this; absence makes terminal feel broken
- Ctrl+V pastes clipboard — muscle memory on Windows; absence is a hard usability blocker
- Right-click paste — PuTTY/classic Windows SSH clients trained this behavior; Windows Terminal does this by default
- Ctrl+Arrow word-jump — standard PowerShell/bash behavior; required for editing long commands
- Dotfiles visible in file explorer — project is practically unusable for managing .planning/, .github/, .claude/
- "New Terminal" button visible above tab strip — Ctrl+T shortcut exists but has zero discoverability; VS Code pattern confirms the `+` button is expected

**Should have (competitive differentiators — v1.x if user feedback requests):**
- Copy-on-select (auto-copy to clipboard on text selection) — VS Code offers this; additive enhancement
- Visual "Copied" toast feedback — polish, low effort to add post-launch

**Defer (v2+):**
- Terminal split panes — explicitly out of scope per PROJECT.md
- Configurable dotfile toggle per-project — out of scope; remove filter entirely
- Configurable terminal hotkeys — scope creep; Windows convention suffices

### Architecture Approach

All changes are confined to the renderer process with zero new IPC handlers. The keyboard fixes go entirely into `createTerminalKeyHandler()` inside `TerminalManager.js` — this single function is the correct interception layer because it has access to both the `terminal` instance (for `getSelection()`/`hasSelection()`) and `terminalId` (for IPC routing), and it already governs all four terminal types in the codebase (main, resume, basic, type consoles). The right-click paste handler is a `contextmenu` DOM listener added in the same file's mount sequence. The dotfile fix is isolated to `FileExplorer.js`. The button fix spans `index.html` (DOM), `renderer.js` (click handler wiring), and `terminal.css` (styling).

**Major components:**
1. `TerminalManager.js` (`src/renderer/ui/components/`) — owns all xterm.js lifecycle, key handling, and clipboard integration; all keyboard fixes land here
2. `FileExplorer.js` (`src/renderer/ui/components/`) — owns directory reads and search indexing; dotfile filter removal touches two functions in this file only
3. `index.html` + `renderer.js` + `terminal.css` — static HTML button, click handler wiring, and button styling for the New Terminal button

### Critical Pitfalls

1. **Ctrl+C suppresses SIGINT if not selection-gated** — the handler MUST check `terminal.getSelection()` and only intercept when selection is non-empty; unconditional interception breaks Ctrl+C as interrupt for running processes. Guard: `if (selection.length > 0) { copy; return false; } return true;`

2. **Ctrl+Arrow conflict with existing tab-switching** — `createTerminalKeyHandler` already uses Ctrl+Left/Right for `callbacks.onSwitchTerminal`. Adding word-jump to the same keys silently breaks tab-switching. Resolution must be declared in the plan before any code is written: move tab-switch to Ctrl+Shift+Arrow, free Ctrl+Arrow for PTY escape sequences (`\x1b[1;5D` / `\x1b[1;5C`).

3. **Dotfile filter exists in two code paths** — `readDirectoryAsync()` line ~233 controls the tree view; `collectAllFiles()` line ~370 controls file search (Ctrl+P). Remove both or dotfiles appear in tree but not search results. Grep for all `startsWith('.')` occurrences before editing.

4. **Module-level debounce variables break multi-terminal paste** — `lastPasteTime` is declared at module scope in `TerminalManager.js`. Any new paste handler that uses this shared variable will silently drop pastes in a second terminal opened within 500ms of the first. Use per-terminal state (stored in the terminals Map) for all new clipboard handlers.

5. **`navigator.clipboard` fails silently on focus loss** — the right-click contextmenu event fires during transitional focus state. Skip `navigator.clipboard` for the right-click handler and call `api.app.clipboardRead()` (IPC fallback) directly. For Ctrl+V, additionally check for empty string resolve (not just rejection) before falling back.

## Implications for Roadmap

Based on research, the three fixes are fully independent with no cross-change dependencies. The architecture confirms they touch different files. Suggested phase structure:

### Phase 1: Dotfile Filter Removal
**Rationale:** Smallest change, zero risk, zero dependencies. A one-line deletion in `readDirectoryAsync()` and `collectAllFiles()` in `FileExplorer.js`. Immediately verifiable by running the app. Confirms the development loop (edit → `npm run build:renderer` → test) works before tackling more complex changes.
**Delivers:** All dotfiles and dotfolders (.planning, .claude, .github, etc.) visible in file tree and file search; .git remains hidden via IGNORE_PATTERNS.
**Addresses:** "Dotfiles visible" (table stakes feature)
**Avoids:** Split-path pitfall — must remove from both `readDirectoryAsync` and `collectAllFiles` in the same commit; verify with Ctrl+P search after change.

### Phase 2: Terminal Keyboard Shortcuts
**Rationale:** Most impactful and most risk-bearing changes. Requires resolving the Ctrl+Arrow conflict with existing tab-switching before writing code. All four keyboard behaviors (Ctrl+C copy, Ctrl+V paste, right-click paste, Ctrl+Arrow word-jump) land in `createTerminalKeyHandler()` in `TerminalManager.js` — bundled together to avoid multiple rebuilds and to reason about the complete key-handler state at once.
**Delivers:** Ctrl+C copies selection (SIGINT preserved when no selection); Ctrl+V pastes; right-click pastes; Ctrl+Left/Right jumps words in PTY.
**Uses:** `attachCustomKeyEventHandler`, `getSelection`, `hasSelection`, `api.terminal.input()` for PTY escape sequences, dual-path clipboard pattern
**Avoids:**
- Ctrl+C SIGINT breakage — selection guard required
- Ctrl+Arrow conflict — tab-switch must move to Ctrl+Shift+Arrow first
- Module-level debounce interference — use per-terminal state for all new handlers
- `navigator.clipboard` focus-loss silent failure — direct IPC fallback for right-click

### Phase 3: New Terminal Button
**Rationale:** Lowest complexity but touches three files (HTML, JS, CSS). Best done after the terminal keyboard changes are stable so the terminal panel state is well understood. The button click wires into the same `createTerminal()` flow already serving Ctrl+T — zero new logic needed.
**Delivers:** Visible "+" button inside `#terminals-filter` (after project name, above tab strip), styled with existing `.filter-git-btn` pattern, functional across all project types.
**Addresses:** "New Terminal button" (discoverability table stakes)
**Avoids:** Button must be visible in all project types (general, FiveM, WebApp, Python) — test with non-default project types; FiveM and WebApp panels can override the standard terminal UI.

### Phase Ordering Rationale

- Dotfile fix first because it is a purely additive change with no behavioral side effects and confirms the build loop
- Keyboard shortcuts second because they carry the most pitfall risk (Ctrl+C SIGINT, Ctrl+Arrow conflict, debounce state) and need focused implementation attention
- Button last because it is the most files but least logic; touching the stable UI after terminal behavior is confirmed reduces risk of breaking anything

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Dotfile Filter):** Confirmed change location, confirmed `IGNORE_PATTERNS` handles .git. No unknowns.
- **Phase 3 (New Terminal Button):** Confirmed DOM location, confirmed click handler wiring path via `renderer.js`. Standard HTML + CSS work.

Phases likely needing pre-implementation declaration (not additional research, but planning clarity):
- **Phase 2 (Keyboard Shortcuts):** The Ctrl+Arrow conflict resolution must be explicitly stated in the PLAN.md before any code is written. The plan must document: (a) tab-switching moves to Ctrl+Shift+Arrow, (b) word-jump uses `\x1b[1;5D` / `\x1b[1;5C` via `api.terminal.input()`, (c) the right-click handler uses IPC-direct clipboard path. These are decisions, not research gaps.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new packages; all APIs verified against official xterm.js docs and existing codebase — zero uncertainty |
| Features | HIGH | All 6 requirements grounded in VS Code Terminal docs, Windows Terminal behavior, and official xterm.js issues; priorities are clear |
| Architecture | HIGH | Based on direct codebase inspection; exact file lines, function names, and insertion points identified |
| Pitfalls | HIGH | Critical pitfalls (SIGINT, Ctrl+Arrow conflict, two-path filter, module debounce, clipboard focus) all backed by official issue threads + codebase inspection |

**Overall confidence:** HIGH

### Gaps to Address

- **Ctrl+Arrow tab-switch shortcut fate:** Research confirms the conflict exists but the specific reassignment (Ctrl+Shift+Arrow vs. removal vs. other) is a product decision. The plan must declare this. Recommend Ctrl+Shift+Arrow as the replacement to preserve discoverability.

- **Right-click behavior in FiveM/WebApp terminal panels:** Project-type panels can substitute the standard terminal UI. The `New Terminal` button placement (Phase 3) and right-click paste handler (Phase 2) should be verified in at least one non-default project type.

- **`collectAllFiles()` exact line number:** ARCHITECTURE.md cites line ~370; PITFALLS.md cites line 370. Verify exact line at implementation time with a grep before editing.

## Sources

### Primary (HIGH confidence)
- xterm.js Terminal class API: https://xtermjs.org/docs/api/terminal/classes/terminal/ — `attachCustomKeyEventHandler`, `getSelection`, `hasSelection`, `paste`
- xterm.js issue #2478 — copy/paste via `attachCustomKeyEventHandler` + `getSelection`; official maintainer recommendation
- xterm.js issue #4538 — Ctrl+Arrow escape sequences (`\x1b[1;5D`, `\x1b[1;5C`); removal of Alt→Ctrl hack
- VS Code Terminal Basics docs — Ctrl+C/V shortcuts on Windows; `+` button pattern for new terminals
- Electron Clipboard API — `clipboard` module in main process; unconditional clipboard access
- Direct codebase inspection: `TerminalManager.js` (lines 75–80, 459–519, 529–610, 1217–1222), `FileExplorer.js` (lines 42–47, 233, 370), `dialog.ipc.js`, `preload.js`, `index.html`

### Secondary (MEDIUM confidence)
- xterm.js issue #3185 — right-click contextmenu in custom terminal embedders (community discussion; capture phase approach)
- Doyensec Electron Web API Permissions analysis — confirms renderer clipboard access by default with `contextIsolation: false`
- Windows Terminal issue #3337 — right-click paste as expected UX in Windows terminal applications

### Tertiary (LOW confidence — needs implementation-time verification)
- xterm.js issue #724 — `hasSelection()` bug with empty string (fixed in v2.8.0; use `getSelection().length > 0` as belt-and-suspenders)
- Electron issue #23328 — `navigator.clipboard` permission "unknown" (fixed in modern Electron; IPC fallback covers the residual risk)

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
