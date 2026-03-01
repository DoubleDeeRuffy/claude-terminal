---
phase: 31-tab-splitview
plan: 31A
subsystem: ui
tags: [electron, splitview, pane-manager, dom-refactor]

requires: []
provides:
  - "PaneManager module with pane CRUD, state tracking, container accessors"
  - "Updated DOM structure with split-pane-area wrapper and pane-scoped containers"
  - "CSS for split-pane layout (pane-tabs, pane-content, split-divider)"
  - "All 14 getElementById calls refactored to PaneManager accessors"
affects: [31B, 31C, 31D]

tech-stack:
  added: []
  patterns:
    - "PaneManager.getTabsContainer()/getContentContainer() for all DOM container access"
    - "PaneManager.registerTab()/unregisterTab() for tab lifecycle tracking"

key-files:
  created:
    - src/renderer/ui/components/PaneManager.js
  modified:
    - src/renderer/ui/components/TerminalManager.js
    - src/renderer/ui/components/ProjectList.js
    - src/renderer/services/TerminalSessionService.js
    - renderer.js
    - index.html
    - styles/terminal.css

key-decisions:
  - "PaneManager is a standalone module required directly, not exported through barrel index.js"
  - "Empty state div kept outside split-pane-area to overlay whole content region"
  - "Old .terminals-tabs and .terminals-container CSS kept as unused for now (no breakage)"

patterns-established:
  - "All tab container access routes through PaneManager, never direct getElementById"
  - "Tab drag-drop uses .closest('.pane-tabs') for pane-scoped reordering"
  - "Session save iterates PaneManager.getPaneOrder() for correct tab sequence"

requirements-completed: [SPLIT-INFRA]

duration: 12min
completed: 2026-03-01
---

# Phase 31A: PaneManager Infrastructure Summary

**PaneManager module with pane CRUD and container accessors, replacing all 14 hardcoded getElementById calls across TerminalManager, ProjectList, and TerminalSessionService**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-01T00:00:00Z
- **Completed:** 2026-03-01T00:12:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created PaneManager.js with full pane lifecycle API (init, create, collapse, register/unregister tabs, move tabs, container accessors)
- Replaced all 14 getElementById('terminals-tabs'/'terminals-container') calls in TerminalManager.js with PaneManager.getTabsContainer()/getContentContainer()
- Updated index.html DOM from flat terminals-tabs/terminals-container to split-pane-area > split-pane > pane-tabs + pane-content structure
- Added PaneManager.registerTab() at all 6 tab creation sites and unregisterTab() in closeTerminal()
- Updated TerminalSessionService to iterate panes for tab order persistence
- Updated ProjectList.js to show split-pane-area instead of old separate IDs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PaneManager module and update index.html DOM structure** - `7f12dba1` (feat)
2. **Task 2: Refactor all getElementById calls to use PaneManager** - `67022d03` (refactor)

## Files Created/Modified
- `src/renderer/ui/components/PaneManager.js` - New module: pane state, CRUD, container accessors (16 exported functions)
- `src/renderer/ui/components/TerminalManager.js` - Replaced 14 getElementById calls with PaneManager accessors, added register/unregister calls
- `src/renderer/ui/components/ProjectList.js` - Changed from showing terminals-container/terminals-tabs to split-pane-area
- `src/renderer/services/TerminalSessionService.js` - Iterates pane order for tab persistence
- `renderer.js` - Added PaneManager.initPanes() before session restore
- `index.html` - New DOM: split-pane-area > split-pane[data-pane-id=0] > pane-tabs + pane-content
- `styles/terminal.css` - Added CSS for split-pane-area, split-pane, split-divider, pane-tabs, pane-content

## Decisions Made
- PaneManager is required directly (not through barrel export) to avoid circular dependency issues
- Empty state overlay kept outside split-pane-area so it covers the whole terminal content region
- Old .terminals-tabs/.terminals-container CSS classes left in place (unused but harmless)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PaneManager infrastructure is complete and ready for Plan 31B (pane-aware activation and filtering)
- All container access is routed through PaneManager, so multi-pane routing in 31B will "just work"
- Build and all 562 tests pass

---
*Phase: 31-tab-splitview*
*Completed: 2026-03-01*
