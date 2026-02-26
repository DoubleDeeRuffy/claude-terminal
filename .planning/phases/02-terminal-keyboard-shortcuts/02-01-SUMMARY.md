---
phase: 02-terminal-keyboard-shortcuts
plan: 01
subsystem: ui
tags: [electron, ipc, keyboard-shortcuts, xterm, terminal]

# Dependency graph
requires: []
provides:
  - Ctrl+Tab / Ctrl+Shift+Tab switch terminal tabs via main-process IPC (ctrl-tab channel)
  - Ctrl+Left / Ctrl+Right pass through to xterm (no longer intercepted for tab-switching)
  - Ctrl+Up / Ctrl+Down still switch projects via ctrl-arrow IPC
affects: [02-02-word-jump]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Main-process IPC forwarding for keyboard shortcuts that Chromium normally suppresses (Ctrl+Tab)"
    - "before-input-event handler in MainWindow intercepts OS-level shortcuts before renderer sees them"

key-files:
  created: []
  modified:
    - src/main/windows/MainWindow.js
    - src/main/preload.js
    - renderer.js
    - src/renderer/ui/components/TerminalManager.js

key-decisions:
  - "Ctrl+Tab intercepted at before-input-event level (not renderer) because Chromium natively handles Tab focus traversal and would not fire keyboard events to xterm"
  - "onCtrlArrow left/right branches removed from renderer — handler now only processes up/down for project switching"
  - "callbacks.onSwitchTerminal retained in TerminalManager callbacks object — still used by delegated embedded terminals via IPC path"

patterns-established:
  - "Pattern: OS-suppressed shortcuts (Ctrl+Tab, Ctrl+Arrow) must be intercepted in before-input-event in main process, then IPC-forwarded to renderer"

requirements-completed: [TERM-05]

# Metrics
duration: 15min
completed: 2026-02-24
---

# Phase 02 Plan 01: Terminal Keyboard Shortcuts Summary

**Ctrl+Tab / Ctrl+Shift+Tab terminal tab switching via main-process IPC, freeing Ctrl+Left/Right for word-jump**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-24T15:00:00Z
- **Completed:** 2026-02-24T15:13:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Ctrl+Tab and Ctrl+Shift+Tab now switch terminal tabs, forwarded from main process via `ctrl-tab` IPC channel with `'next'`/`'prev'` direction
- Ctrl+Left and Ctrl+Right no longer intercepted for tab-switching — they pass through to the renderer (and xterm) for word-jump in plan 02-02
- Ctrl+Up and Ctrl+Down project switching unchanged — still forwarded via `ctrl-arrow` IPC
- Renderer build succeeds with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remap before-input-event and add Ctrl+Tab IPC channel** - `1424987` (feat)
2. **Task 2: Remove Ctrl+Left/Right tab-switch from createTerminalKeyHandler** - `ab69902` (feat)

**Plan metadata:** (final docs commit follows)

## Files Created/Modified

- `src/main/windows/MainWindow.js` - before-input-event handler narrowed to Up/Down; Ctrl+Tab intercepted and forwarded via `ctrl-tab` IPC
- `src/main/preload.js` - `onCtrlTab: createListener('ctrl-tab')` added to `window` namespace alongside `onCtrlArrow`
- `renderer.js` - `onCtrlArrow` handler stripped of left/right branches; `onCtrlTab` listener wired to `switchTerminal`
- `src/renderer/ui/components/TerminalManager.js` - `createTerminalKeyHandler` ArrowLeft/Right branches removed; isArrowKey narrowed to `['ArrowUp', 'ArrowDown']`

## Decisions Made

- Ctrl+Tab intercepted at `before-input-event` level (main process) rather than renderer keyboard events, because Chromium natively consumes Tab for focus traversal and xterm would never see it
- `onCtrlArrow` renderer handler simplified to only handle `up`/`down` — the `left`/`right` branches were removed since those no longer arrive via IPC
- `callbacks.onSwitchTerminal` property retained in the TerminalManager callbacks object — it is still wired for embedded terminal contexts (delegated via lines 3181, 3259) and receives direction from the IPC path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Ctrl+Left/Right now pass through cleanly to xterm — plan 02-02 can implement word-jump via `attachCustomKeyEventHandler` without any conflict
- The `ctrl-tab` IPC channel and `onCtrlTab` bridge are in place; plan 02-02 has no dependency on this plan's IPC changes but benefits from the freed shortcuts

---
*Phase: 02-terminal-keyboard-shortcuts*
*Completed: 2026-02-24*
