---
phase: 06-resume-claude-sessions
plan: 02
subsystem: terminal
tags: [electron, session-resume, terminal, pty, watchdog]

# Dependency graph
requires:
  - phase: 06-01
    provides: claudeSessionId persisted per tab in terminal-sessions.json
provides:
  - resumeSessionId threading in createTerminal() to api.terminal.create()
  - startup restore loop reads claudeSessionId from saved tab data
  - 5-second resume failure watchdog with automatic fresh-session fallback
affects:
  - src/main/ipc/terminal.ipc.js (receives resumeSessionId, passes --resume to PTY)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional spread to avoid sending null resumeSessionId to IPC
    - setInterval polling of xterm buffer.active.length for data-received detection
    - Watchdog checks getTerminal(id) before acting to avoid acting on already-closed terminals

key-files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js
    - renderer.js

key-decisions:
  - "resumeSessionId conditional spread (...(resumeSessionId ? { resumeSessionId } : {})) prevents main process from attempting --resume null"
  - "Watchdog uses xterm buffer.active.length > 1 as data-received signal — valid resumes produce output immediately; failed resumes exit without output"
  - "Watchdog checks getTerminal(id) === null before acting — PTY exit already triggers closeTerminal(), so terminal is gone before watchdog fires; avoids double-close"
  - "Fallback createTerminal() call omits resumeSessionId — starts fresh Claude session, which will get a new session ID via Phase 06-01 SESSION_START capture"

patterns-established:
  - "Pattern: Conditional spread for optional IPC fields — ...(field ? { field } : {}) avoids null-valued keys in IPC calls"

requirements-completed: [SESS-01, SESS-02, SESS-03, SESS-04]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 06 Plan 02: resumeSessionId Threading and Resume Failure Watchdog Summary

**resumeSessionId threaded from saved tab data through createTerminal() to api.terminal.create(), with 5-second watchdog detecting stale session failures and falling back to fresh Claude sessions**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-25T07:35:41Z
- **Completed:** 2026-02-25T07:37:03Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `resumeSessionId` to `createTerminal()` options destructuring with null default
- Pass `resumeSessionId` to `api.terminal.create()` via conditional spread — avoids sending `null` to the IPC handler
- Added resume failure watchdog: 5-second timer that polls xterm buffer for received data; if no output arrives and terminal still exists, closes the stale terminal and spawns a fresh Claude session
- Updated startup restore loop in `renderer.js` to pass `tab.claudeSessionId` as `resumeSessionId` for non-basic tabs that have a saved session ID

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread resumeSessionId and add watchdog in TerminalManager.js** - `f6b4aeb` (feat)
2. **Task 2: Pass resumeSessionId from saved tab data in restore loop** - `1b931b1` (feat)

## Files Created/Modified

- `src/renderer/ui/components/TerminalManager.js` - resumeSessionId added to options destructuring, conditional spread to api.terminal.create(), and 5-second watchdog timer added after handler setup
- `renderer.js` - Startup restore loop now reads tab.claudeSessionId and passes as resumeSessionId to createTerminal()

## Decisions Made

- Conditional spread `...(resumeSessionId ? { resumeSessionId } : {})` prevents main process from attempting `claude --resume null` when no session ID was captured
- Watchdog uses `terminal.buffer.active.length > 1` as the data-received signal — xterm buffer grows when PTY writes output; a valid resume shows output immediately, a failed resume exits with a brief error then the PTY closes
- Watchdog guards on `getTerminal(id)` null-check before acting — `closeTerminal()` removes the terminal from state when PTY exits, so the watchdog finding `null` means the terminal already cleaned itself up
- Fallback `createTerminal()` omits `resumeSessionId` so it starts a fresh Claude session; Phase 06-01's `wireSessionIdCapture` will capture the new session ID for the next restart

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Phase Completion

Phase 06 is now fully complete:
- **Plan 06-01:** SESSION_START hooks events capture Claude session UUIDs per terminal, persist to terminal-sessions.json
- **Plan 06-02:** resumeSessionId threaded to PTY creation; startup restore passes saved session IDs; resume failure watchdog detects and recovers from stale sessions

On app restart, Claude terminals with saved session IDs will automatically resume their previous Claude sessions via `claude --resume <id>`. If a session ID is stale (session expired or deleted), the watchdog detects no output within 5 seconds and starts a fresh Claude session instead.

---
*Phase: 06-resume-claude-sessions*
*Completed: 2026-02-25*

## Self-Check: PASSED
