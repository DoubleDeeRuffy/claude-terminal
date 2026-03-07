---
phase: 34-tab-rename-contextmenu
plan: 01
subsystem: ui
tags: [context-menu, ai-rename, haiku, i18n]

requires:
  - phase: 27-rename-tabs-manually
    provides: tab context menu infrastructure (showTabContextMenu, showContextMenu)
provides:
  - AI Rename context menu item with async Haiku naming
affects: []

tech-stack:
  added: []
  patterns: [async context menu handler with loading indicator and error revert]

key-files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json

key-decisions:
  - "AI Rename item disabled (not hidden) when aiTabNaming setting is off for discoverability"
  - "Uses existing generateTabName IPC with terminal name as input, same as automatic naming"

patterns-established:
  - "Async context menu handler pattern: show loading indicator, call API, revert on failure"

requirements-completed: [TAB-RENAME-CTX-01]

duration: 1min
completed: 2026-03-07
---

# Phase 34 Plan 01: AI Rename Context Menu Item Summary

**AI Rename menu item in tab context menu using existing Haiku-based generateTabName with loading indicator and error revert**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-07T18:13:30Z
- **Completed:** 2026-03-07T18:14:45Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Added "AI Rename" menu item directly below "Rename" in tab context menu
- Implemented handleAiRename() with '...' loading indicator and automatic revert on failure
- Item is disabled (greyed out) when aiTabNaming setting is off
- Added i18n keys for both EN ("AI Rename") and FR ("Renommer par IA")

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AI Rename menu item and async handler** - `e7695375` (feat)

## Files Created/Modified
- `src/renderer/ui/components/TerminalManager.js` - Added handleAiRename() function and AI Rename context menu item
- `src/renderer/i18n/locales/en.json` - Added tabs.aiRename key
- `src/renderer/i18n/locales/fr.json` - Added tabs.aiRename key (French)

## Decisions Made
- AI Rename item is disabled (not hidden) when aiTabNaming setting is off -- shows the feature exists but is toggled off, making it discoverable
- No separator between Rename and AI Rename -- they are logically grouped together

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Feature is complete and ready for verification
- No blockers or concerns

---
*Phase: 34-tab-rename-contextmenu*
*Completed: 2026-03-07*
