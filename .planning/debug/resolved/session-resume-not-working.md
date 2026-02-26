---
status: resolved
trigger: "Investigate why Claude session resume on app restart doesn't work (no errors, just doesn't reconnect)"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Root Cause Analysis

### PRIMARY ROOT CAUSE: Chat mode path silently drops `resumeSessionId`

**File:** `src/renderer/ui/components/TerminalManager.js`
**Lines:** 1300-1305

When `defaultTerminalMode` is set to `'chat'`, the `createTerminal` function routes to `createChatTerminal` but does NOT forward the `resumeSessionId` parameter:

```javascript
// Line 1300: mode is resolved from user settings, not from saved tab data
const mode = explicitMode || (runClaude ? (getSetting('defaultTerminalMode') || 'terminal') : 'terminal');

// Line 1303-1305: Chat branch drops resumeSessionId entirely
if (mode === 'chat' && runClaude) {
  const chatProject = overrideCwd ? { ...project, path: overrideCwd } : project;
  return createChatTerminal(chatProject, {
    skipPermissions, name: customName, parentProjectId, initialPrompt, initialImages,
    initialModel, initialEffort, onSessionStart
    // NOTE: resumeSessionId is NOT passed here!
  });
}
```

Meanwhile, the restore code in `renderer.js` (line 190-195) correctly reads `claudeSessionId` from saved data and passes it as `resumeSessionId`, but it never reaches the IPC call because the chat branch intercepts it.

### SECONDARY ROOT CAUSE: Saved tab mode is not restored

**File:** `src/renderer/services/TerminalSessionService.js`
**Lines:** 87-101

The save logic serializes `{ cwd, isBasic, claudeSessionId }` per tab but does NOT save the tab's `mode` property. On restore, the mode is derived from the current `defaultTerminalMode` setting (TerminalManager.js line 1300), not from the saved tab.

**File:** `renderer.js`
**Lines:** 188-195

The restore code does not pass `mode` or `explicitMode` to `createTerminal`:

```javascript
await TerminalManager.createTerminal(project, {
  runClaude: !tab.isBasic,
  cwd,
  skipPermissions: settingsState.get().skipPermissions,
  resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
  // Missing: mode: tab.mode or mode: 'terminal'
});
```

This means:
1. During previous session: terminal was in `terminal` mode, `claudeSessionId` captured and saved
2. On restore: if `defaultTerminalMode` changed to `'chat'`, mode resolves to `'chat'`
3. Chat branch runs, `resumeSessionId` is silently dropped
4. User sees fresh session with no errors

Even if the user has always been in chat mode, this bug still applies: chat-mode tabs are NOT saved (TerminalSessionService line 88: `if (termData.mode !== 'terminal') return;`), so only terminal-mode tabs with session IDs exist in the file. But on restore, they get recreated as chat-mode tabs.

### TERTIARY ISSUE: initClaudeEvents() runs after terminal restore

**File:** `renderer.js`
**Lines:** 175-229

Terminal sessions are restored at line 175-224, but `initClaudeEvents()` (which starts the HooksProvider) runs at line 229. This means:
- Resumed Claude sessions emit `SessionStart` events
- But HooksProvider isn't listening yet
- The new session ID from the resumed session is NOT captured
- On the NEXT app restart, `claudeSessionId` would be stale/null

This is a secondary issue that would cause session IDs to become stale across multiple restarts.

## Evidence

- timestamp: 2026-02-25
  checked: TerminalSessionService.saveTerminalSessionsImmediate (line 88)
  found: Only `mode === 'terminal'` tabs are serialized; mode is not saved in the tab object
  implication: Saved tabs are always terminal-mode, but restore doesn't enforce this

- timestamp: 2026-02-25
  checked: TerminalManager.createTerminal (lines 1300-1305)
  found: resumeSessionId is destructured but never passed to createChatTerminal in the chat branch
  implication: If defaultTerminalMode is 'chat', resume is silently skipped

- timestamp: 2026-02-25
  checked: renderer.js restore code (lines 188-195)
  found: No `mode` or `explicitMode` parameter is passed to createTerminal
  implication: Mode defaults to current setting, not saved tab's mode

- timestamp: 2026-02-25
  checked: renderer.js initialization order (lines 175-229)
  found: initClaudeEvents() (line 229) runs after terminal restore (line 175-224)
  implication: SessionStart events from resumed sessions are not captured by HooksProvider

- timestamp: 2026-02-25
  checked: Main process TerminalService.create (lines 66-76)
  found: --resume flag IS correctly passed to cmd.exe /c claude when resumeSessionId is provided
  implication: Backend plumbing is correct; issue is in renderer-side routing

## Suggested Fix

### Fix 1: Pass `resumeSessionId` in chat mode path (TerminalManager.js)

```javascript
// Line 1303-1305: Add resumeSessionId to createChatTerminal call
if (mode === 'chat' && runClaude) {
  const chatProject = overrideCwd ? { ...project, path: overrideCwd } : project;
  return createChatTerminal(chatProject, {
    skipPermissions, name: customName, parentProjectId,
    resumeSessionId,  // <-- ADD THIS
    initialPrompt, initialImages, initialModel, initialEffort, onSessionStart
  });
}
```

### Fix 2: Save and restore tab mode (TerminalSessionService.js + renderer.js)

In `saveTerminalSessionsImmediate`, add `mode` to saved tab:
```javascript
projectsMap[projectId].tabs.push({ cwd, isBasic, claudeSessionId, mode: termData.mode });
```

In `renderer.js` restore, force mode from saved data:
```javascript
await TerminalManager.createTerminal(project, {
  runClaude: !tab.isBasic,
  cwd,
  skipPermissions: settingsState.get().skipPermissions,
  resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
  mode: tab.mode || 'terminal',  // <-- ADD THIS (explicit mode from saved data)
});
```

### Fix 3: Move initClaudeEvents() before terminal restore (renderer.js)

```javascript
// Move this BEFORE the terminal restore block
initClaudeEvents();

// Restore terminal sessions from previous run
try {
  const sessionData = loadSessionData();
  ...
```

### Fix Priority
- Fix 1 is essential (resume broken in chat mode)
- Fix 2 is defensive (prevents mode mismatch on restore)
- Fix 3 prevents session ID staleness across multiple restarts

## Files Involved

| File | Issue |
|------|-------|
| `src/renderer/ui/components/TerminalManager.js:1303-1305` | Chat mode branch drops `resumeSessionId` |
| `src/renderer/services/TerminalSessionService.js:100` | Does not save tab `mode` |
| `renderer.js:190-195` | Does not pass `mode` on restore |
| `renderer.js:229` | `initClaudeEvents()` called after terminal restore |
