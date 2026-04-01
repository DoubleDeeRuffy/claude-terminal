---
phase: 20-bugfix-swap-projects-selected-tab
plan: 01
subsystem: ui
tags: [electron, terminal, tabs, project-switching, scroll-position]

# Dependency graph
requires:
  - phase: 6.3-remember-active-task-on-project-scope
    provides: disk-based activeTabIndex fallback in filterByProject
provides:
  - in-memory per-project last-active tab tracking (lastActivePerProject Map)
  - scroll position save/restore on tab switch (savedScrollPositions Map)
affects: [TerminalManager, project-switching, tab-restoration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - in-memory Map as primary restore source, disk as secondary fallback

key-files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js

key-decisions:
  - "20-01: lastActivePerProject Map tracks last-active terminal ID per project in-memory — no disk I/O, within-session only"
  - "20-01: savedScrollPositions Map captures scroll at leave-time and restores via requestAnimationFrame to defer until DOM is visible"
  - "20-01: filterByProject uses in-memory Map as primary restore, disk-based activeTabIndex as secondary fallback (app restart path)"
  - "20-01: closeTerminal deletes from savedScrollPositions but NOT from lastActivePerProject — stale IDs handled by getTerminal(savedId) null guard"
  - "20-01: tabsById Map (already indexed in filterByProject) used for O(1) tab lookup in disk fallback path"

patterns-established:
  - "In-memory Map before disk lookup: primary source is fastest (no I/O), disk is fallback for cold-start"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 20 Plan 01: Bugfix Swap Projects Selected Tab Summary

**In-memory lastActivePerProject and savedScrollPositions Maps in TerminalManager restore the last-active tab and scroll position when switching between projects**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-26T11:12:06Z
- **Completed:** 2026-02-26T11:14:03Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added two module-level Maps: `lastActivePerProject` (projectId -> terminalId) and `savedScrollPositions` (terminalId -> scroll state)
- `setActiveTerminal` now captures scroll position of the outgoing terminal (chat `.scrollTop`, xterm `viewportY`) and restores it for the incoming terminal via `requestAnimationFrame`
- `filterByProject` now uses the in-memory `lastActivePerProject` Map as primary restore source before falling back to disk-based `activeTabIndex` (Phase 6.3 path)
- `closeTerminal` cleans up `savedScrollPositions` to prevent memory leaks

## Task Commits

Each task was committed atomically:

1. **Task 1: Add in-memory Maps and wire capture/restore in setActiveTerminal and closeTerminal** - `5cc03ae3` (feat)
2. **Task 2: Use in-memory Map as primary tab restore source in filterByProject** - `218ecbe6` (feat)

## Files Created/Modified
- `src/renderer/ui/components/TerminalManager.js` - Added Maps, scroll capture/restore in setActiveTerminal, updated filterByProject

## Decisions Made
- `lastActivePerProject` not cleared on `closeTerminal` — stale IDs handled gracefully by the `getTerminal(savedId)` null guard in `filterByProject`
- `savedScrollPositions` uses `requestAnimationFrame` for restoration to ensure DOM is rendered/visible before applying scroll
- Disk fallback in `filterByProject` now uses the already-indexed `tabsById` Map (O(1)) instead of `document.querySelector` (was O(n)) for consistency and performance

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bug fix complete; project switching now restores the correct tab and scroll position
- No blockers or concerns

---
*Phase: 20-bugfix-swap-projects-selected-tab*
*Completed: 2026-02-26*
