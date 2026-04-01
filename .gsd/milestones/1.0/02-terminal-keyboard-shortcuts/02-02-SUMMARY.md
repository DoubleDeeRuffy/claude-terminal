---
phase: 02-terminal-keyboard-shortcuts
plan: 02
subsystem: ui
tags: [electron, xterm, keyboard-shortcuts, clipboard, terminal]

# Dependency graph
requires:
  - phase: 02-01
    provides: Ctrl+Left/Right freed from tab-switching, passes through to xterm
provides:
  - Ctrl+C selection-gated copy — copies selection or sends SIGINT (no selection)
  - Ctrl+V paste with debounce and inputChannel routing (PTY / FiveM / WebApp)
  - Ctrl+Left word-jump backward via VT escape sequence \x1b[1;5D (PTY only)
  - Ctrl+Right word-jump forward via VT escape sequence \x1b[1;5C (PTY only)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Selection-gated Ctrl+C: return false (handled) vs return true (SIGINT passthrough) in xterm custom key handler"
    - "VT word-jump escape sequences \x1b[1;5D / \x1b[1;5C sent via api.terminal.input, not processed by xterm"
    - "inputChannel routing for paste: fivem-input / webapp-input / terminal-input (default)"

key-files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js

key-decisions:
  - "Ctrl+C checks e.key.toLowerCase() === 'c' (handles both 'c' and 'C' case variants across platforms)"
  - "Word-jump escape sequences only sent when inputChannel is 'terminal-input' — FiveM/WebApp consoles fall through to default"
  - "Ctrl+V in createTerminalKeyHandler uses same PASTE_DEBOUNCE_MS / lastPasteTime module-scope vars as existing paste handlers"

patterns-established:
  - "Pattern: selection-gated copy — return false when handled, return true to pass SIGINT through to PTY"

requirements-completed: [TERM-01, TERM-02, TERM-03]

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 02 Plan 02: Terminal Keyboard Shortcuts Summary

**Ctrl+C selection-gated copy, Ctrl+V paste, and Ctrl+Left/Right VT word-jump escape sequences added to createTerminalKeyHandler**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-24T15:10:00Z
- **Completed:** 2026-02-24T15:18:25Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Ctrl+C now copies selected text to clipboard when a selection exists; sends SIGINT to the PTY when there is no selection — Claude CLI interrupt (Ctrl+C to stop a running command) continues to work correctly
- Ctrl+V pastes from clipboard with 500ms debounce, routing through the correct IPC channel for PTY, FiveM, and WebApp terminals
- Ctrl+Left sends `\x1b[1;5D` (word-left) and Ctrl+Right sends `\x1b[1;5C` (word-right) to the PTY; FiveM/WebApp consoles fall through to default behavior
- Renderer build succeeds, all 262 Jest tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Ctrl+C copy, Ctrl+V paste, and Ctrl+Arrow word-jump to createTerminalKeyHandler** - `82db31d` (feat)

**Plan metadata:** (final docs commit follows)

## Files Created/Modified

- `src/renderer/ui/components/TerminalManager.js` - Three new key handling branches added inside the `if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.repeat && e.type === 'keydown')` block in `createTerminalKeyHandler`

## Decisions Made

- Used `e.key.toLowerCase() === 'c'` to match both `'c'` and `'C'` key variants — different OSes/keyboards can report different cases for Ctrl+C
- Word-jump escape sequences only sent via `api.terminal.input` when `inputChannel === 'terminal-input'`; FiveM/WebApp consoles return `true` to fall through, preserving any native behavior
- Retained existing `Ctrl+Shift+C` and `Ctrl+Shift+V` handlers unchanged — these continue to work alongside the new `Ctrl+C` and `Ctrl+V` handlers for users who prefer the Shift variants

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

- `src/renderer/ui/components/TerminalManager.js` - FOUND
- `getSelection` in createTerminalKeyHandler at line 557 - FOUND
- `\x1b[1;5D` at line 593 - FOUND
- `\x1b[1;5C` at line 600 - FOUND
- Commit `82db31d` - FOUND
- Build: renderer bundle compiles with no errors
- Tests: 262/262 pass

## Next Phase Readiness

- All three TERM requirements (TERM-01, TERM-02, TERM-03) complete
- Phase 2 is fully done — all terminal keyboard shortcuts (Ctrl+Tab, Ctrl+C, Ctrl+V, Ctrl+Arrow) now work as expected
- Phase 3 (New Terminal Button) can proceed independently

---
*Phase: 02-terminal-keyboard-shortcuts*
*Completed: 2026-02-24*
