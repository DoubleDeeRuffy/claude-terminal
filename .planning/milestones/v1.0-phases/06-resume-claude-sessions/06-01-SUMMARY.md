---
phase: 06-resume-claude-sessions
plan: 01
subsystem: events
tags: [electron, session-persistence, hooks, event-bus, terminal]

# Dependency graph
requires:
  - phase: 04-session-persistence
    provides: TerminalSessionService with terminal-sessions.json serialization
  - phase: 05-remember-explorer-state
    provides: saveTerminalSessions debounce infrastructure
provides:
  - wireSessionIdCapture consumer that captures Claude session IDs from hooks events
  - findClaudeTerminalForProject helper (latest-terminal-ID heuristic)
  - claudeSessionId field persisted per tab in terminal-sessions.json
  - resumeSession() termData completeness (mode + cwd fields)
affects:
  - 06-02 (resume path uses claudeSessionId from terminal-sessions.json)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy require inside consumer callbacks to avoid circular deps (same as Phase 4/5)
    - Latest-terminal-ID heuristic for project-to-terminal correlation
    - Hooks-source guard (e.source !== 'hooks') prevents scraping events from polluting stored session IDs

key-files:
  created: []
  modified:
    - src/renderer/events/index.js
    - src/renderer/services/TerminalSessionService.js
    - src/renderer/ui/components/TerminalManager.js

key-decisions:
  - "findClaudeTerminalForProject uses latest-terminal-ID heuristic — monotonically increasing IDs make most-recent terminal unambiguous for single-terminal projects; multi-terminal edge case deferred as TODO"
  - "wireSessionIdCapture guards on e.source === 'hooks' — scraping provider emits sessionId: null, so only hooks events carry real session IDs"
  - "claudeSessionId: null in tab serialization is intentional — Plan 06-02 ignores null values (no --resume passed)"

patterns-established:
  - "Pattern: Lazy require inside consumer — require('../services/TerminalSessionService') inside the event callback, not at module top-level, to avoid circular deps"

requirements-completed: [SESS-01, SESS-02, SESS-03, SESS-04]

# Metrics
duration: 8min
completed: 2026-02-25
---

# Phase 06 Plan 01: Session ID Capture and Persistence Summary

**SESSION_START hooks events now capture Claude session UUIDs per terminal and persist them to terminal-sessions.json, with resumeSession() termData fixed to include mode and cwd**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-25T00:00:00Z
- **Completed:** 2026-02-25T00:08:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added `findClaudeTerminalForProject(projectId)` helper using latest-terminal-ID heuristic to correlate hooks events to the correct terminal
- Added `wireSessionIdCapture()` consumer that listens for hooks-sourced SESSION_START events, captures the session UUID, updates in-memory termData, and triggers a debounced save to disk
- Extended `TerminalSessionService.saveTerminalSessionsImmediate()` to include `claudeSessionId` (or null) in each serialized tab entry
- Fixed `resumeSession()` termData to include `mode: 'terminal'` and `cwd: project.path` so resumed sessions survive future restarts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add wireSessionIdCapture and findClaudeTerminalForProject** - `dfde118` (feat)
2. **Task 2: Serialize claudeSessionId in TerminalSessionService** - `fc1c330` (feat)
3. **Task 3: Fix resumeSession termData mode and cwd** - `bca4ab6` (fix)

## Files Created/Modified
- `src/renderer/events/index.js` - Added findClaudeTerminalForProject helper and wireSessionIdCapture consumer, wired into initClaudeEvents()
- `src/renderer/services/TerminalSessionService.js` - claudeSessionId field added to tab serialization in saveTerminalSessionsImmediate()
- `src/renderer/ui/components/TerminalManager.js` - resumeSession() termData extended with mode: 'terminal' and cwd: project.path

## Decisions Made
- `findClaudeTerminalForProject` uses latest-terminal-ID heuristic (monotonically incrementing IDs) — unambiguous for single-terminal projects; multi-terminal edge case left as TODO comment
- Source guard `e.source !== 'hooks'` ensures scraping-provider SESSION_START events (which have `sessionId: null`) never overwrite stored session IDs
- `claudeSessionId: null` in serialized tab data is intentional — Plan 06-02 checks for truthy value before passing `--resume`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Session ID capture infrastructure complete
- Plan 06-02 can now read `claudeSessionId` from `terminal-sessions.json` and pass `--resume <id>` when recreating terminals on startup
- No blockers

---
*Phase: 06-resume-claude-sessions*
*Completed: 2026-02-25*

## Self-Check: PASSED
