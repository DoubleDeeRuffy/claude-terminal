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
