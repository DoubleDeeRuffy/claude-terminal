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

## Bug: OSC Title Overwrites Restored Tab Names (Recurring)

**Symptom:** The rightmost tab of every project gets restored with the default project folder name instead of the saved custom session name.

**Root cause:** When Claude resumes with `--resume`, it emits an OSC title change (`✳ <project-folder-name>`) once replay finishes. `handleClaudeTitleChange()` (~line 395) processes this and calls `updateTerminalTabName(id, parsed.taskName)` — unconditionally overwriting the restored custom name with the project's working directory basename.

**Why "rightmost tab":** The last-created tab finishes PTY replay last. The debounced `saveTerminalSessions()` (2s) fires while earlier tabs have already been overwritten but the last tab hasn't yet. On the next restart, the last tab's name is whatever was captured in the final save — the project folder name.

**Existing protection:** `shouldSkipOscRename()` only protected tabs renamed by slash commands (`slashRenameTimestamps` map + `tabRenameOnSlashCommand` setting). Restored session names had no protection.

**First fix (2025-03):** Added `restoreRenameTimestamps` map with 30s cooldown. **Failed** — long session replays exceed 30s, so the OSC title fires after the cooldown expires and still overwrites the name.

**Second fix (2026-03):** Replaced time-based cooldown with flag-based `restoreNameProtected` Set. Protection is:
- **Set** when a terminal is created/resumed with a custom name (3 places: `createTerminal`, `createChatTerminal`, `resumeSession`)
- **Cleared** on first user Enter keypress (`data === '\r'` in `terminal.onData`) — signals user started a new interaction, so future OSC task names should be allowed
- **Checked** in `shouldSkipOscRename()` before the slash-command check (independent of `tabRenameOnSlashCommand` setting)

This means: restored tab names survive indefinitely through PTY replay, but once the user sends a new prompt, `aiTabNaming` works normally again.

**Third fix (2026-03):** The second fix missed a different overwrite path. When Claude resumes with `--resume`, it can emit a SESSION_START hook with a **different session ID** than the one passed to `--resume`. The `wireSessionIdCapture()` rotation handler (`events/index.js:499`) sees `td.claudeSessionId !== e.data.sessionId` and treats it as a `/clear` rotation, resetting `td.name` to the project name via `updateTerminal()` (bypassing `shouldSkipOscRename` entirely). This also calls `saveTerminalSessionsImmediate()`, persisting the wrong name immediately. `session-names.json` is unaffected because `updateTerminal()` doesn't touch it — explaining the data divergence.

Fix has two parts:
1. **Root cause** (`events/index.js`): The rotation handler now checks `isRestoreNameProtected(terminalId)` before resetting the name. If the terminal has restore protection, it accepts the new session ID but preserves the tab name.
2. **Safety net** (`renderer.js`): During restore, tab names are resolved by preferring `session-names.json` over `terminal-sessions.json` — so even if `terminal-sessions.json` was previously corrupted by the rotation handler, the correct name is recovered.

## Checklist for Future Resume Dialog Changes

- [ ] Update `preprocessSessions()` in TerminalManager.js
- [ ] Update `_preprocessModalSessions()` in renderer.js
- [ ] Update click handler in `renderSessionsPanel()` (TerminalManager.js ~line 2854)
- [ ] Update click handler in `showSessionsModal()` (renderer.js ~line 1316)
- [ ] Rebuild renderer (`npm run build:renderer`)
- [ ] Test BOTH dialogs (empty-state AND lightbulb)
