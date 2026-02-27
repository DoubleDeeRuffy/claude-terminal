---
phase: 23-remember-last-active-tab-on-tab-closing
plan: 01
subsystem: ui
tags: [terminal, tab-management, history-stack, ux]

# Dependency graph
requires:
  - phase: 20-bugfix-swap-projects-selected-tab
    provides: lastActivePerProject Map pattern for in-memory per-project tab tracking
provides:
  - tabActivationHistory Map in TerminalManager.js for browser-like tab-close behavior
  - Walk-back logic in closeTerminal to restore previously-active tab on close
affects: [TerminalManager, tab-close-behavior]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-project history stack as Map<projectId, number[]> with walk-back on close]

key-files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js

key-decisions:
  - "tabActivationHistory Map declared at module level alongside lastActivePerProject — follows Phase 20 in-memory tracking pattern"
  - "Push inside existing if (newProjectId) guard in setActiveTerminal — no separate guard needed"
  - "Walk-back skips closed tab (candidateId === id) as belt-and-suspenders in addition to getTerminal() null-check"
  - "Prune closed tab from history AFTER walk-back reads array — walk-back sees full history"
  - "Original forEach neighbor scan kept as fallback for empty history (tabs created before Phase 23)"
  - "No cleanup of tabActivationHistory in the existing cleanup block — same pattern as lastActivePerProject, stale IDs handled by getTerminal() null-check"

patterns-established:
  - "History stack pattern: Map<projectId, T[]> with push on activation, walk-back on close, prune after walk-back"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 23: Remember Last Active Tab on Tab Closing Summary

**Per-project tab activation history stack in TerminalManager.js so closing a tab returns to the previously-active tab (browser-like UX) instead of the first tab in insertion order**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T15:08:27Z
- **Completed:** 2026-02-27T15:10:27Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `tabActivationHistory` Map at module level (Map<projectId, number[]>) alongside existing `lastActivePerProject`
- Push activated tab ID into per-project history array on every `setActiveTerminal` call
- Replaced simple forEach scan in `closeTerminal` with history walk-back that finds the previously-active tab
- Kept original forEach scan as fallback for tabs created before Phase 23 (empty history edge case)
- All 281 tests pass; renderer builds without errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tabActivationHistory Map and push in setActiveTerminal** - `246dc4da` (feat)
2. **Task 2: Replace forEach scan in closeTerminal with history walk-back** - `abea6a1a` (feat)

## Files Created/Modified
- `src/renderer/ui/components/TerminalManager.js` - Added tabActivationHistory Map, push in setActiveTerminal, walk-back + prune in closeTerminal

## Decisions Made
- tabActivationHistory follows the same in-memory Map pattern as lastActivePerProject (Phase 20) — no persistence needed, history is rebuilt as user activates tabs during session
- Walk-back uses `getTerminal(candidateId)` null-check to skip stale IDs, same guard pattern established in Phase 20
- Pruning happens after walk-back reads the array to ensure the walk-back sees the full history including the just-closed tab (which serves as the "skip" target via `candidateId === id` check)
- Original forEach neighbor fallback retained unchanged for robustness

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tab close now behaves like a browser — closing Tab B (after visiting A then B) returns to Tab A
- Phase 20 project-switch restore (lastActivePerProject) continues to work unchanged
- Ready for PR creation

---
*Phase: 23-remember-last-active-tab-on-tab-closing*
*Completed: 2026-02-27*
