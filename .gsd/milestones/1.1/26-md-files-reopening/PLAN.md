# Phase 26: MD-Files-Reopening — Plan

## Goal
Persist and restore **all tabs** (terminal + file) across app restarts, preserving their exact ordering and active state.

## Plan 26A: Persist & Restore File Tabs with Full Tab Ordering

### Overview
Currently `saveTerminalSessionsImmediate()` only serializes terminal tabs. File tabs (opened via `openFileTab()`) are silently skipped because they lack `cwd`/`isBasic`/`mode` fields. This plan adds file tab serialization, interleaved restore, and proper active-tab tracking for both tab types.

### Changes

#### 1. Save: `src/renderer/services/TerminalSessionService.js`

In `saveTerminalSessionsImmediate()`, the loop at line 85 iterates `terminals` Map entries. Currently it builds a tab object with terminal-specific fields. Change this to detect file tabs and serialize them differently.

**Replace the tab serialization block (lines 93-99):**
```javascript
// Inside the for-loop, after projectId grouping:

let tab;
if (td.type === 'file') {
  tab = {
    type: 'file',
    filePath: td.filePath,
    name: td.name || null,
  };
} else {
  tab = {
    cwd: td.cwd || td.project.path,
    isBasic: td.isBasic || false,
    mode: td.mode || 'terminal',
    claudeSessionId: td.claudeSessionId || null,
    name: td.name || null,
  };
}
```

**Active tab tracking** (lines 103-107): Change `activeCwd` to also work for file tabs. Replace the active-tab block:
```javascript
if (id === activeTerminalId) {
  projectSessions[projectId].activeTabIndex = projectSessions[projectId].tabs.length - 1;
  // Keep activeCwd for backward compat with terminal tabs
  if (!td.type || td.type !== 'file') {
    projectSessions[projectId].activeCwd = tab.cwd;
  }
}
```

This ensures `activeTabIndex` is always set (works for both tab types), while `activeCwd` remains available as a legacy fallback for terminal tabs.

#### 2. Restore: `renderer.js` (lines 194-217)

Replace the restore loop to handle both tab types and use `activeTabIndex` as the primary active-tab mechanism.

**Replace the tab restore loop (lines 194-217):**
```javascript
const restoredIds = []; // Track all restored tab IDs in order

for (const tab of saved.tabs) {
  let restoredId = null;

  if (tab.type === 'file') {
    // File tab: check file exists, then open
    if (tab.filePath && fs.existsSync(tab.filePath)) {
      restoredId = await TerminalManager.openFileTab(tab.filePath, project);
    }
  } else {
    // Terminal tab: existing restore logic
    const cwd = fs.existsSync(tab.cwd) ? tab.cwd : project.path;
    restoredId = await TerminalManager.createTerminal(project, {
      runClaude: !tab.isBasic,
      cwd,
      mode: tab.mode || null,
      skipPermissions: settingsState.get().skipPermissions,
      resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
      name: tab.name || null,
    });
  }

  if (restoredId) {
    restoredIds.push(restoredId);
  }
}

// Restore active tab using activeTabIndex (works for all tab types)
if (saved.activeTabIndex != null && restoredIds[saved.activeTabIndex]) {
  TerminalManager.setActiveTerminal(restoredIds[saved.activeTabIndex]);
} else if (saved.activeCwd) {
  // Legacy fallback: match by cwd for terminal tabs
  const terminals = terminalsState.get().terminals;
  let activeId = null;
  terminals.forEach((td, id) => {
    if (td.project?.id === projectId && td.cwd === saved.activeCwd) {
      activeId = id;
    }
  });
  if (activeId) {
    TerminalManager.setActiveTerminal(activeId);
  }
}
```

**Key behavioral notes:**
- Missing files are skipped silently (per context decision)
- `openFileTab()` already deduplicates by filePath — safe to call
- Tab ordering is preserved because we iterate `saved.tabs` in order, and Map insertion order matches
- `activeTabIndex` is the primary mechanism; `activeCwd` is a fallback for sessions saved before this change

#### 3. Return value from `openFileTab()`

Check if `openFileTab()` in `TerminalManager.js` returns the terminal ID. If it doesn't, add `return terminalId;` at the end of the function. The restore loop needs this ID to track which tabs were created.

### Files Modified
| File | Change |
|------|--------|
| `src/renderer/services/TerminalSessionService.js` | Add file tab serialization + `activeTabIndex`-first tracking |
| `renderer.js` | Interleaved restore loop for terminal + file tabs |
| `src/renderer/ui/components/TerminalManager.js` | Ensure `openFileTab()` returns terminal ID (if not already) |

### Data Format Change
```json
{
  "version": 1,
  "projects": {
    "<projectId>": {
      "tabs": [
        { "cwd": "...", "isBasic": false, "mode": "terminal", "claudeSessionId": null, "name": null },
        { "type": "file", "filePath": "/path/to/file.md", "name": "file.md" },
        { "cwd": "...", "isBasic": true, "mode": "terminal", "claudeSessionId": null, "name": null }
      ],
      "activeCwd": "...",
      "activeTabIndex": 2,
      "explorer": { ... }
    }
  }
}
```

Backward compatible: existing sessions without `type` field default to terminal tabs (no `type` check = terminal).

### Verification
- [ ] Open a project with 3 terminal tabs and 2 file tabs in mixed order
- [ ] Restart the app → all 5 tabs restored in exact order
- [ ] Active tab (whether terminal or file) is restored correctly
- [ ] File tab pointing to deleted file is silently skipped
- [ ] `npm test` passes
- [ ] `npm run build:renderer` succeeds
