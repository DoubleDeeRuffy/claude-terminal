---
phase: 16-remember-tab-names-of-claude-sessions-through-app-restarts
plan: 01
subsystem: ui
tags: [terminal, session-persistence, tab-naming, TerminalSessionService, TerminalManager]

# Dependency graph
requires:
  - phase: 04-remember-every-tab-every-claude-session-and-the-session-context-accross-app-restarts
    provides: TerminalSessionService saveTerminalSessionsImmediate and restore loop in renderer.js
  - phase: 06-resume-claude-sessions
    provides: claudeSessionId persistence pattern and mode serialization in TerminalSessionService
provides:
  - Tab name field serialized in terminal-sessions.json alongside cwd/mode/claudeSessionId
  - Debounced save triggered on all four name-mutation paths (OSC, slash-command, user rename, AI haiku)
  - Restore loop passes saved name and mode to createTerminal for correct chat-mode name restoration
affects: [session-restore, tab-naming, chat-mode tabs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy require of TerminalSessionService inside event handlers (../../services/TerminalSessionService from ui/components)
    - Debounced save on name mutations (not immediate) — frequent changes, not crash-critical

key-files:
  created: []
  modified:
    - src/renderer/services/TerminalSessionService.js
    - src/renderer/ui/components/TerminalManager.js
    - renderer.js

key-decisions:
  - "Use saveTerminalSessions() (debounced 2000ms) not saveTerminalSessionsImmediate() for name changes — frequent mutations, not crash-critical"
  - "mode: tab.mode passed in restore loop — prerequisite for chat-mode tabs to route through createChatTerminal and receive customName"
  - "|| null fallback on both name and mode ensures old session files without these fields restore safely"
  - "Require path is ../../services/TerminalSessionService from ui/components (2 levels deep), not ../services/"

patterns-established:
  - "Lazy require ../../services/TerminalSessionService inside TerminalManager event handlers — same circular-dep avoidance as Phase 4/6"

requirements-completed: [TAB-PERSIST-01]

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 16 Plan 01: Remember Tab Names Summary

**Tab names persisted to terminal-sessions.json on all four rename paths and restored via createTerminal name+mode pass-through on startup**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-26T00:00:00Z
- **Completed:** 2026-02-26T00:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Tab names (user renames, AI haiku names, slash-command names, OSC names) now survive app restarts
- All four name-mutation paths trigger a debounced save via lazy-require of TerminalSessionService
- Restore loop passes both `name` and `mode` so chat-mode tabs correctly restore in chat mode with their saved name
- Backward compatible — old session files without name/mode fields restore normally via null fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add name to serialized tab and trigger save on all rename paths** - `1efad232` (feat)
2. **Task 2: Pass saved name and mode in restore loop** - `3e03677f` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/renderer/services/TerminalSessionService.js` - Added `name: td.name || null` to tab object in saveTerminalSessionsImmediate
- `src/renderer/ui/components/TerminalManager.js` - Added debounced save after updateTerminalTabName, finishRename, and onTabRename (3 sites)
- `renderer.js` - Added `mode: tab.mode || null` and `name: tab.name || null` to createTerminal call in restore loop

## Decisions Made
- Debounced save (not immediate) chosen for name mutations — name changes are frequent (AI haiku, OSC) and not crash-critical
- `mode` pass-through is a prerequisite for name restoration on chat tabs (without it, chat tabs restore as terminal-mode and never call createChatTerminal's customName path)
- Require path corrected to `../../services/TerminalSessionService` — TerminalManager.js is in `ui/components/`, 2 levels from `services/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected require path for TerminalSessionService**
- **Found during:** Task 1 (build verification)
- **Issue:** Plan specified `../services/TerminalSessionService` but TerminalManager.js is in `src/renderer/ui/components/`, so the correct relative path is `../../services/TerminalSessionService`
- **Fix:** Used `replace_all` to fix all three lazy require calls to the correct path
- **Files modified:** src/renderer/ui/components/TerminalManager.js
- **Verification:** `npm run build:renderer` succeeded after fix
- **Committed in:** 1efad232 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan's path specification)
**Impact on plan:** Necessary correction, build would have failed without it. No scope creep.

## Issues Encountered
- esbuild reported "Could not resolve ../services/TerminalSessionService" on first build — path in plan was wrong by one level. Diagnosed immediately by checking existing require patterns in TerminalManager.js (`../../services/ContextPromptService`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tab name persistence complete. All four name sources saved and restored.
- Phase 17 (taskbar pin loss on NSIS update) can proceed independently.

---
*Phase: 16-remember-tab-names-of-claude-sessions-through-app-restarts*
*Completed: 2026-02-26*
