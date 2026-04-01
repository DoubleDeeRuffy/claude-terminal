---
phase: 36-fix-terminal-flickering-buffer-loss-and-blackouts-caused-by-scroll-to-top-changes
plan: 01
subsystem: ui
tags: [terminal, xterm, scroll, flicker, buffer, TerminalManager]

# Dependency graph
requires: []
provides:
  - Debounced scroll preservation in writePreservingScroll (80ms settle timer)
  - Robust rapid-output detection guard preventing terminal.clear() during Claude TUI redraws
affects:
  - any future terminal rendering changes in TerminalManager.js
  - writePreservingScroll call sites (5 total)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WeakMap per-terminal debounce state for scroll restoration"
    - "Rapid-output flag with chunk-count hysteresis (3+ chunks < 150ms) + 500ms cooldown"

key-files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js

key-decisions:
  - "Debounce scroll restoration at 80ms (above 50ms flooding batch interval in TerminalService.js)"
  - "Suppress terminal.clear() entirely during rapid output — no debounced fallback"
  - "Rapid detection: 3+ consecutive chunks within 150ms gaps (not single-gap check)"
  - "No tab-switch recovery mechanism added (D-03 — prevention only)"

patterns-established:
  - "scrollRestoreState WeakMap: per-terminal { scrollRestoreTimer, savedOffset, savedBufType }"
  - "rapidOutputActive flag: activate on 3+ fast chunks, deactivate after 500ms silence"

requirements-completed: [FLICKER-01, FLICKER-02, FLICKER-03]

# Metrics
duration: 2min
completed: 2026-04-01
---

# Phase 36 Plan 01: Fix Terminal Flickering, Buffer Loss, and Blackouts Summary

**Debounced writePreservingScroll with WeakMap state and hysteresis-based rapid-output guard eliminating per-write viewport flicker and scrollback buffer loss during Claude TUI redraws**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-01T20:22:52Z
- **Completed:** 2026-04-01T20:24:40Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Replaced per-write `scrollLines()` calls with an 80ms debounced restore that fires only after output settles, eliminating viewport fighting during rapid Claude streaming
- Added `scrollRestoreState` WeakMap tracking per-terminal `{ scrollRestoreTimer, savedOffset, savedBufType }` — guards restoration against alternate-screen buffer transitions
- Replaced brittle `< 100ms` gap check with a robust `rapidOutputActive` flag that requires 3+ consecutive fast chunks before suppressing `terminal.clear()`, preventing both stray buffer wipes and false suppression of user `/clear` commands
- All 5 `writePreservingScroll` call sites remain unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace per-write scroll restoration with debounced approach (D-01)** - `c3580a53` (fix)
2. **Task 2: Tighten clear-screen detection to prevent buffer loss during rapid output (D-02)** - `8dda98d4` (fix)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/renderer/ui/components/TerminalManager.js` - writePreservingScroll debounced rewrite + tightened clear-screen guard

## Decisions Made

- **80ms debounce delay:** Chosen to be above the main-process flooding batch interval (50ms), ensuring rapid output consistently resets the timer before it fires
- **No synchronous scrollLines() after write:** During rapid output xterm.js handles the viewport natively; user position is only restored once output pauses
- **Buffer type guard in timer callback:** If `buffer.active.type` changes between save and restore (alternate screen transition), discard the saved offset to avoid mis-scrolling
- **Chunk-count hysteresis (3+ chunks at < 150ms):** Prevents a user typing `/clear` quickly (1-2 fast keystrokes then idle) from activating the rapid flag, while still catching sustained Claude TUI redraws reliably
- **500ms rapid cooldown:** Long enough to survive Claude's inter-output pauses, short enough to re-arm quickly after genuine idle periods

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Terminal rendering bug fixes are self-contained and complete
- The `scrollRestoreState` WeakMap pattern is available for future terminal phases that need per-terminal debounce state
- The `rapidOutputActive` pattern is documented and reusable for other output-rate-dependent guards

---
*Phase: 36-fix-terminal-flickering-buffer-loss-and-blackouts-caused-by-scroll-to-top-changes*
*Completed: 2026-04-01*

## Self-Check: PASSED

- FOUND: src/renderer/ui/components/TerminalManager.js
- FOUND: .gsd/milestones/1.1/36-fix-terminal-flickering-buffer-loss-and-blackouts-caused-by-scroll-to-top-changes/36-01-SUMMARY.md
- FOUND commit c3580a53: fix(36-01): replace per-write scroll restoration with debounced approach
- FOUND commit 8dda98d4: fix(36-01): tighten clear-screen guard to prevent buffer loss during rapid output
