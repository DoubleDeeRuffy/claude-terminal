# Resume Dialogs — Two Separate Implementations

There are **two independent resume dialog code paths** that must be kept in sync. Any change to session display, click handling, or name resolution must be applied to BOTH.

## 1. Empty-State Panel (TerminalManager.js)

- **Function:** `renderSessionsPanel()` (~line 2729)
- **When shown:** When a project has zero open terminals (empty state area)
- **Session preprocessing:** `preprocessSessions()` (~line 2547)
  - Reads `session-names.json` via `getSessionCustomName()`
  - Custom names (haiku AI, manual rename, slash command) take priority as `displayTitle`
- **Click handler:** Inline event delegation on `.sessions-list` (~line 2854)
  - Looks up `session.displayTitle` from `sessionMap`
  - Passes `name: sessionName` to `resumeSession()`

## 2. Lightbulb Modal (renderer.js)

- **Function:** `showSessionsModal()` (~line 1248)
- **When shown:** When user clicks the lightbulb icon in the terminal header toolbar
- **Session preprocessing:** `_preprocessModalSessions()` (~line 1180)
  - Reads `session-names.json` via `_loadModalSessionNames()`
  - Custom names take priority as `displayTitle` (added in phase 14.1 fix)
- **Click handler:** Inline event delegation on `.sessions-list` inside modal (~line 1316)
  - Looks up `session.displayTitle` from `sessionMap`
  - Passes `name: sessionName` to `TerminalManager.resumeSession()`

## Shared Downstream

Both dialogs call `TerminalManager.resumeSession()` which:
- Extracts `name` from `options` as `sessionName`
- Sets `termData.name = sessionName || t('terminals.resuming')`
- Calls `updateTerminalTabName(id, sessionName)` after `addTerminal()` if sessionName is truthy
- Creates the tab DOM with `sessionName || t('terminals.resuming')` as tab text

## Session ID Lifecycle & `/clear` Rotation

Session IDs are captured and persisted via two independent paths:

### Terminal mode (hooks path)
- `wireSessionIdCapture()` in `src/renderer/events/index.js` (~line 486)
- Listens for `SESSION_START` hook events, resolves terminal via `findTerminalForSessionId()`
- On **session rotation** (`/clear`): accepts the new session ID, resets tab name to project name
- The old session's name remains in `session-names.json` — fully resumable from either dialog

### Chat mode (SDK path)
- `handleAssistantMessage()` in `ChatView.js` (~line 3065)
- Captures `msg.session_id` from assistant messages, updates on change

### Two name persistence stores
- **`terminal-sessions.json`** — tab layout for app restart (has `name` + `claudeSessionId` per tab)
- **`session-names.json`** — keyed by session ID, used by both resume dialogs for `displayTitle`

`updateTerminalTabName()` writes to BOTH stores simultaneously (state + DOM + session-names.json + terminal-sessions.json).

## Key Lesson (Session Rotation Bug)

Before the fix, `wireSessionIdCapture()` had a guard that **blocked** any new session ID if the terminal already had one. This meant `/clear` was silently ignored — the old pre-`/clear` session ID stayed persisted, and app restart would resume the wrong (old) conversation. The fix flips the guard into a **rotation handler** that accepts the new ID and resets the tab name.

## Key Lesson (Phase 14.1)

Plans 01-03 only patched the empty-state panel. The lightbulb modal was missed because:
- It lives in `renderer.js` (entry point), not `TerminalManager.js`
- It has its own duplicate preprocessing (`_preprocessModalSessions` vs `preprocessSessions`)
- It has its own click handler that independently calls `resumeSession()`

The duplication also extends to: pin handling (`_loadModalPins` vs `isSessionPinned`), text cleaning (`_cleanModalSessionText` vs `cleanSessionText`), card HTML (`_buildModalCardHtml` vs `buildSessionCardHtml`).

## Checklist for Future Resume Dialog Changes

- [ ] Update `preprocessSessions()` in TerminalManager.js
- [ ] Update `_preprocessModalSessions()` in renderer.js
- [ ] Update click handler in `renderSessionsPanel()` (TerminalManager.js ~line 2854)
- [ ] Update click handler in `showSessionsModal()` (renderer.js ~line 1316)
- [ ] Rebuild renderer (`npm run build:renderer`)
- [ ] Test BOTH dialogs (empty-state AND lightbulb)
