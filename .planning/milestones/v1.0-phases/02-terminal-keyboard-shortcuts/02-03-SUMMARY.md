---
phase: 02-terminal-keyboard-shortcuts
plan: 03
subsystem: ui
tags: [electron, xterm, clipboard, contextmenu, terminal, paste]

# Dependency graph
requires:
  - phase: 02-02
    provides: Ctrl+V paste with debounce and inputChannel routing already wired
provides:
  - Right-click (contextmenu) paste in all terminal types via IPC clipboard path
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Right-click paste via contextmenu listener + api.app.clipboardRead() (IPC path, not navigator.clipboard)"
    - "Shared lastPasteTime/PASTE_DEBOUNCE_MS debounce prevents double-paste across all paste mechanisms"

key-files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js

key-decisions:
  - "Use api.app.clipboardRead() (IPC path) for right-click paste — navigator.clipboard.readText() silently fails on focus loss during right-click in some Electron versions"
  - "setupRightClickPaste placed after setupPasteHandler at all 5 call sites — consistent pattern with existing paste handlers"
  - "inputChannel routing matches the call site's existing channel (terminal-input / fivem-input / webapp-input) so FiveM and WebApp consoles receive paste correctly"

patterns-established:
  - "Pattern: reusable setupRightClickPaste() helper following same debounce + inputChannel routing shape as setupPasteHandler()"

requirements-completed: [TERM-04]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 02 Plan 03: Right-Click Paste Summary

**contextmenu paste listener added to all 5 terminal types using IPC clipboard path (api.app.clipboardRead) to avoid Electron focus-loss failures**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-24T15:21:28Z
- **Completed:** 2026-02-24T15:26:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Right-clicking in any terminal (regular, Claude resume, debug/prompt, FiveM/WebApp console, PTY) now pastes clipboard content
- Uses `api.app.clipboardRead()` (IPC path) instead of `navigator.clipboard.readText()` to avoid silent failures when window focus is uncertain during right-click
- Debounced via shared `lastPasteTime`/`PASTE_DEBOUNCE_MS` (500ms) — same variables used by `setupPasteHandler` and `createTerminalKeyHandler` — preventing double-paste
- Browser native context menu suppressed in all terminal elements
- Renderer builds cleanly, all 262 Jest tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add contextmenu paste listener to all terminal creation paths** - `170e0ee` (feat)

**Plan metadata:** (final docs commit follows)

## Files Created/Modified

- `src/renderer/ui/components/TerminalManager.js` - `setupRightClickPaste()` function added (lines 522-555); called at all 5 `setupPasteHandler` call sites (lines 1295, 1571, 2712, 2870, 3428)

## Decisions Made

- Used `api.app.clipboardRead()` (IPC path) for the contextmenu handler rather than `navigator.clipboard.readText()`. The STATE.md blocker note and plan explicitly called this out: `navigator.clipboard` can silently fail on focus loss, which is a common Electron behavior during right-click. IPC always succeeds regardless of focus state.
- Placed `setupRightClickPaste(wrapper, id, 'terminal-input')` immediately after each `setupPasteHandler(...)` call — keeps the pairing visually obvious and the comment "Prevent double-paste issue" above covers both.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

- `src/renderer/ui/components/TerminalManager.js` - FOUND
- `setupRightClickPaste` function definition at line 530 - FOUND
- `contextmenu` event listener - FOUND (2 occurrences)
- `clipboardRead` IPC path - FOUND (6 occurrences)
- 5 call sites of `setupRightClickPaste` matching 5 call sites of `setupPasteHandler` - CONFIRMED
- Commit `170e0ee` - FOUND
- Build: renderer bundle compiles with no errors
- Tests: 262/262 pass

## Next Phase Readiness

- All four TERM requirements (TERM-01 through TERM-04) are now complete
- Phase 2 (Terminal Keyboard Shortcuts) is fully done
- Phase 3 (New Terminal Button) can proceed independently

---
*Phase: 02-terminal-keyboard-shortcuts*
*Completed: 2026-02-24*
