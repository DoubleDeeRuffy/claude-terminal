---
phase: 8-rename-app-title-to-current-selected-project
plan: 01
subsystem: ui
tags: [electron, settings, i18n, ipc, window-title]

# Dependency graph
requires:
  - phase: 4-session-persistence
    provides: selectedProjectFilter state mutation on startup restore (fires subscriber automatically)
  - phase: 5-remember-explorer-state
    provides: projectsState.subscribe pattern for project switch reactions
provides:
  - Window title updates to "Claude Terminal - {name}" on project switch
  - Settings toggle to enable/disable feature (default: enabled)
  - i18n keys in EN and FR for toggle label and description
  - Immediate title reset to "Claude Terminal" when toggle disabled
affects: [settings, i18n, renderer-initialization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getSetting() === false guard for safe feature default — undefined !== false means missing key enables feature"
    - "projectsState.subscribe() for reacting to project selection changes"

key-files:
  created: []
  modified:
    - src/renderer/state/settings.state.js
    - src/renderer/ui/panels/SettingsPanel.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
    - renderer.js

key-decisions:
  - "8-01: Use getSetting('updateTitleOnProjectSwitch') === false (not === true) so undefined/missing key defaults to enabled — safe upgrade behavior"
  - "8-01: Update both document.title and api.window.setTitle() — document.title for DOM, IPC setTitle for OS taskbar"
  - "8-01: Do NOT update .titlebar-title DOM element — managed by SettingsService.updateWindowTitle() for chat context"
  - "8-01: Immediate title reset in saveSettingsHandler when toggle disabled — no async delay"

patterns-established:
  - "Toggle default pattern: use !== false check so undefined (missing key on upgrade) behaves as true"

requirements-completed: [TITLE-01, TITLE-02]

# Metrics
duration: 8min
completed: 2026-02-25
---

# Phase 8 Plan 01: Rename App Title to Current Selected Project Summary

**projectsState subscriber updates OS taskbar title to "Claude Terminal - {name}" on project switch, controlled by a settings toggle with EN/FR i18n, defaulting to enabled for existing users**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-25T08:21:00Z
- **Completed:** 2026-02-25T08:29:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `updateTitleOnProjectSwitch: true` to defaultSettings with safe `!== false` guard
- Wired `projectsState.subscribe` in renderer.js to call `api.window.setTitle()` and `document.title` on project switch
- Added toggle UI row in Settings > General (System card), after terminalContextMenu, with immediate title reset on disable
- Added EN and FR i18n keys for label and description

## Task Commits

Each task was committed atomically:

1. **Task 1: Add updateTitleOnProjectSwitch setting, toggle UI, and i18n keys** - `f34e98f` (feat)
2. **Task 2: Wire projectsState subscriber for window title updates** - `b7a4c07` (feat)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified
- `src/renderer/state/settings.state.js` - Added `updateTitleOnProjectSwitch: true` to defaultSettings
- `src/renderer/ui/panels/SettingsPanel.js` - Added toggle HTML row, saveSettingsHandler read/persist/reset
- `src/renderer/i18n/locales/en.json` - Added EN i18n keys for label and description
- `src/renderer/i18n/locales/fr.json` - Added FR i18n keys for label and description
- `renderer.js` - Added projectsState.subscribe block for title updates

## Decisions Made
- Used `=== false` guard (not `!== true`) so missing key on existing user upgrade defaults to enabled
- Update both `document.title` and `api.window.setTitle()` — former for DOM, latter for OS taskbar via IPC
- Do NOT touch `.titlebar-title` DOM element — managed separately by SettingsService for chat context
- Subscriber placed before the FileExplorer subscriber in renderer.js (Phase 8 comment block)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 8 complete — window title now reflects active project in OS taskbar
- Phase 9 (Remember Window State On Windows) can proceed independently

---
*Phase: 8-rename-app-title-to-current-selected-project*
*Completed: 2026-02-25*
