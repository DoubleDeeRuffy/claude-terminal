---
phase: 31-tab-splitview
plan: 31C
subsystem: ui
tags: [electron, splitview, context-menu, drag-drop, drop-overlay]

requires:
  - phase: 31B
    provides: "Pane-scoped activation, per-pane active tab tracking, focus handlers"
provides:
  - "Context menu Split Right, Move Right/Left, Move to Pane actions"
  - "Drag-to-split with VSCode-style semi-transparent drop overlay"
  - "Cross-pane tab-bar drag reordering"
  - "Automatic pane collapse when last tab closed"
  - "Max 3 panes enforced across all triggers"
affects: [31D]

tech-stack:
  added: []
  patterns:
    - "Content-area drag targets delegated on split-pane-area for current and future panes"
    - "Drag tab ID tracking via PaneManager.setDragTabId/clearDragTabId"
    - "color-mix() CSS for semi-transparent accent overlay"

key-files:
  created: []
  modified:
    - src/renderer/ui/components/PaneManager.js
    - src/renderer/ui/components/TerminalManager.js
    - renderer.js
    - styles/terminal.css
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json

key-decisions:
  - "unregisterTab returns paneId (not boolean) when pane is empty, enabling closeTerminal to know which pane to collapse"
  - "moveTabToPane returns boolean for source empty status, simplifying caller logic"
  - "Drop overlay covers right 50% of content area to prevent accidental splits during tab reorder"
  - "Drag targets delegated on split-pane-area so dynamically created panes get handlers automatically"

patterns-established:
  - "Context menu items use IIFE spread pattern for conditional items: ...(condition ? (() => { ... })() : [])"
  - "Cross-pane drag: tab-bar drops use stopPropagation to prevent content-area handler interference"

requirements-completed: [SPLIT-TRIGGER, SPLIT-MOVE, SPLIT-COLLAPSE, SPLIT-DROPZONE]

duration: 5min
completed: 2026-03-01
---

# Phase 31C: Split Triggers Summary

**Context menu Split Right/Move actions, drag-to-split with VSCode-style accent overlay, cross-pane tab reordering, and automatic pane collapse on last tab close**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T08:04:45Z
- **Completed:** 2026-03-01T08:09:16Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added Split Right, Move Right/Left, Move to Pane N context menu items with full pane-aware logic
- Implemented drag-to-split with semi-transparent accent-colored overlay (right 50% of content area)
- Added cross-pane tab-bar drag reordering with automatic source pane collapse
- Auto-collapse empty panes in closeTerminal() using updated unregisterTab (returns paneId)
- All i18n keys added for split actions in English and French

## Task Commits

Each task was committed atomically:

1. **Task 1: Context menu split/move actions and pane collapse** - `ec9da192` (feat)
2. **Task 2: Drag-to-split with VSCode-style drop zone overlay** - `0ed3133b` (feat)

## Files Created/Modified
- `src/renderer/ui/components/PaneManager.js` - Added setupPaneDropOverlay, setupPaneDragTargets, drag tracking (setDragTabId/clearDragTabId), overlay helpers, setOnTabMoved callback; updated unregisterTab to return paneId, moveTabToPane to return empty status
- `src/renderer/ui/components/TerminalManager.js` - Added Split Right/Move items to showTabContextMenu, wired drag tracking in setupTabDragDrop, cross-pane tab-bar drop handler, pane collapse in closeTerminal
- `renderer.js` - Wired setOnTabMoved callback for activating moved tabs
- `styles/terminal.css` - Added .split-drop-overlay CSS with accent color, dashed border, transition
- `src/renderer/i18n/locales/en.json` - Added splitRight, moveRight, moveLeft, moveToPane keys
- `src/renderer/i18n/locales/fr.json` - Added French translations for split actions

## Decisions Made
- unregisterTab returns paneId instead of boolean -- enables closeTerminal to collapse the correct pane without extra lookups
- Drop overlay only shows on right half of content area for same-pane drag to prevent accidental splits
- Drag targets use event delegation on split-pane-area so dynamically created panes inherit handlers
- For 2-pane mode: relative Move Right/Move Left; for 3-pane mode: specific "Move to Pane N" targets

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate dragover handler in setupTabDragDrop**
- **Found during:** Task 2
- **Issue:** The original dragover handler and the new one with stopPropagation were both present, causing duplicate event handling
- **Fix:** Removed the original dragover handler, kept only the updated one with stopPropagation
- **Files modified:** src/renderer/ui/components/TerminalManager.js
- **Committed in:** 0ed3133b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix to prevent duplicate event handlers. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Split triggers fully functional, ready for Plan 31D (divider resize and keyboard shortcuts)
- All 562 tests pass, renderer builds successfully
- Single-pane behavior unchanged (verified by test suite)

---
*Phase: 31-tab-splitview*
*Completed: 2026-03-01*
