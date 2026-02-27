---
phase: 24-shift-return-race-condition
plan: 01
subsystem: ui
tags: [keyboard, event-handling, chat-input, css, shift-enter]

# Dependency graph
requires:
  - phase: none
    provides: n/a
provides:
  - shiftHeld closure variable tracking Shift key state in ChatView createChatView scope
  - keyup/blur listeners resetting shiftHeld for sticky-shift prevention
  - Enter handler uses shiftHeld instead of e.shiftKey for race-condition-free Shift+Enter
  - .chat-input line-height tightened to 1.4 for single-spaced multiline appearance
affects: [chat-input, keyboard-shortcuts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Track modifier key state via dedicated keydown/keyup listeners instead of relying on e.shiftKey in keydown handler"
    - "window blur listener resets tracked modifier state to prevent sticky-key after Alt+Tab"

key-files:
  created: []
  modified:
    - src/renderer/ui/components/ChatView.js
    - styles/chat.css

key-decisions:
  - "shiftHeld declared in createChatView closure and tracked via existing wrapperEl capture-phase keydown listener — no second listener added"
  - "window blur listener resets shiftHeld on focus loss to prevent sticky-shift after Alt+Tab"
  - "e.shiftKey retained in Ctrl+Arrow guard (line 472) — only the Enter handler was using the race-prone e.shiftKey; Ctrl+Arrow logic is unrelated"
  - "line-height changed from 1.5 to 1.4 (not lower) — balances tighter spacing with readability; aligns with chat bubble density"

patterns-established:
  - "Modifier key state: use closure boolean + keydown/keyup/blur rather than e.shiftKey when submitting on keydown"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-27
---

# Phase 24 Plan 01: Shift+Return Race Condition Summary

**shiftHeld closure variable with keydown/keyup/blur listeners replaces e.shiftKey in chat Enter handler, eliminating Shift+Enter race condition; .chat-input line-height tightened to 1.4**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-27T17:05:00Z
- **Completed:** 2026-02-27T17:13:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Declared `shiftHeld` boolean in `createChatView` closure scope
- Added Shift key tracking inside existing wrapperEl capture-phase keydown listener (no duplicate listener)
- Added `wrapperEl` keyup listener (capture phase) to reset `shiftHeld` on Shift release
- Added `window.addEventListener('blur', ...)` to reset `shiftHeld` on app focus loss (sticky-shift prevention after Alt+Tab)
- Replaced `!e.shiftKey` with `!shiftHeld` in Enter handler — eliminates timing window where e.shiftKey can be stale during fast Shift+Enter sequences
- Changed `.chat-input` `line-height` from `1.5` to `1.4` — produces tighter single-spaced multiline appearance (13px font: 19.5px → 18.2px per line)

## Task Commits

Each task was committed atomically:

1. **Task 1: Track Shift key state independently and replace e.shiftKey in Enter handler** - `5532d2ff` (fix)
2. **Task 2: Reduce line-height on .chat-input for tighter multiline spacing** - `0a784a41` (fix)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/renderer/ui/components/ChatView.js` - Added shiftHeld tracking variable, keyup + blur listeners, replaced e.shiftKey with shiftHeld in Enter handler
- `styles/chat.css` - Changed .chat-input line-height from 1.5 to 1.4

## Decisions Made
- `shiftHeld` tracked via existing capture-phase wrapperEl keydown listener — avoids creating a second keydown listener on wrapperEl as the plan explicitly required
- `e.shiftKey` retained in the `Ctrl+Arrow` guard (`!e.shiftKey && !e.altKey`) — that logic checks modifier presence at event time and is not subject to the race condition
- `line-height: 1.4` chosen over lower values — below 1.4 would look cramped for a text input; this is close to chat bubble density (1.5) while visibly tightening multiline text

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shift+Return in chat input is now race-condition-free
- Build and all 281 tests pass
- Ready for PR creation

## Self-Check: PASSED

- FOUND: src/renderer/ui/components/ChatView.js
- FOUND: styles/chat.css
- FOUND: commit 5532d2ff (fix: track Shift key state independently)
- FOUND: commit 0a784a41 (fix: reduce chat-input line-height to 1.4)

---
*Phase: 24-shift-return-race-condition*
*Completed: 2026-02-27*
