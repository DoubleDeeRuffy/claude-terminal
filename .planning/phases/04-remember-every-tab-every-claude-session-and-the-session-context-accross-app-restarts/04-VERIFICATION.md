---
phase: 04-remember-every-tab-every-claude-session-and-the-session-context-accross-app-restarts
verified: 2026-02-24T17:00:00Z
status: passed
score: 9/9 must-haves verified
gaps:
  - truth: "The last opened project is selected and visible after restart"
    status: resolved
    reason: "saveTerminalSessions() reads openedProjectId from projectsState, which is set to null on every normal project click (setOpenedProjectId(null) is called in ProjectList.js line 765 and ProjectService.js selectProject). The subscription in renderer.js fires saveTerminalSessions() when selectedProjectFilter changes, but the save function captures openedProjectId=null — so lastOpenedProjectId is always written as null. On restore, findIndex returns -1 and no project is reselected."
    artifacts:
      - path: "src/renderer/services/TerminalSessionService.js"
        issue: "Line 114: reads projectsStateData.openedProjectId which is null after normal project selection. Should derive project ID from selectedProjectFilter index instead."
      - path: "renderer.js"
        issue: "Lines 294-300: subscription fires saveTerminalSessions() when selectedProjectFilter changes but the save reads openedProjectId (wrong field). The project at state.projects[state.selectedProjectFilter] is available inside the subscription but its ID is not passed to the save."
    missing:
      - "In saveTerminalSessionsImmediate (TerminalSessionService.js), change lastOpenedProjectId derivation: instead of reading projectsStateData.openedProjectId, compute it as: const idx = projectsStateData.selectedProjectFilter; const lastOpenedProjectId = (idx !== null && idx !== undefined && projectsStateData.projects[idx]) ? projectsStateData.projects[idx].id : null;"
      - "Alternatively: in the renderer.js subscription, pass the project ID directly to a new saveTerminalSessions variant, or call updateLastOpenedProject(project.id) which already exists in the service."
---

# Phase 04 Verification Report

**Phase Goal:** Terminal tabs persist across app restarts — each project recreates its tabs in the same working directories, and the last opened project is restored
**Verified:** 2026-02-24T17:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Terminal session data is saved to disk after every tab open or close | VERIFIED | `saveTerminalSessions()` called at TerminalManager.js:1238 (after addTerminal in createTerminal) and TerminalManager.js:1167 (end of closeTerminal) |
| 2 | Only regular terminal tabs (mode=terminal) are serialized — chat, file, and type console tabs are excluded | VERIFIED | TerminalSessionService.js:87 filters `if (termData.mode !== 'terminal') return;` |
| 3 | Each saved tab records its effective CWD (project root or overrideCwd for worktrees) | VERIFIED | TerminalManager.js:1232 stores `cwd: overrideCwd || project.path` in termData; TerminalSessionService.js:91 reads `termData.cwd || termData.project.path` |
| 4 | Save uses atomic write with debounce (crash-resilient) | VERIFIED | TerminalSessionService.js:31-32 writes to `.tmp` then `renameSync`; 300ms debounce at line 69 matches projects.state.js pattern |
| 5 | When the app restarts, each project's terminal tabs are re-created in the same working directories | VERIFIED | renderer.js:161-209 restore loop calls `TerminalManager.createTerminal(project, { runClaude: !tab.isBasic, cwd, ... })` for each saved tab after initializeState() |
| 6 | The last opened project is selected and visible after restart | FAILED | `saveTerminalSessions()` reads `projectsStateData.openedProjectId` (line 114) which is `null` after every normal project click — `setOpenedProjectId(null)` is called in ProjectList.js:765 and ProjectService.js:129. `lastOpenedProjectId` is always written as `null`. On restore, `findIndex` returns -1 and no project is reselected. |
| 7 | Projects whose directories no longer exist are silently skipped during restore | VERIFIED | renderer.js:171 `if (!fs.existsSync(project.path)) continue;` |
| 8 | When a project is deleted, its saved terminal session data is removed | VERIFIED | renderer.js:928 calls `clearProjectSessions(projectId)` immediately after `saveProjects()` in deleteProjectUI |
| 9 | Zero-terminal state is respected: projects with no saved tabs get no auto-created terminals | VERIFIED | renderer.js:172 `if (!saved.tabs || saved.tabs.length === 0) continue;` |

**Score:** 8/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderer/services/TerminalSessionService.js` | Load, save, clear session data for terminal tabs | VERIFIED | 155 lines, exports loadSessionData, saveTerminalSessions, clearProjectSessions, updateLastOpenedProject; contains atomic write and 300ms debounce |
| `src/renderer/ui/components/TerminalManager.js` | CWD stored in termData, save hooks after create/close | VERIFIED | Line 44 imports TerminalSessionService; line 1232 stores cwd in termData; lines 1238 and 1167 call saveTerminalSessions() |
| `renderer.js` | Restore pass at startup, last-opened-project subscription, deletion cleanup | PARTIAL | Restore loop VERIFIED; deletion cleanup VERIFIED; subscription fires correctly but last-opened-project capture FAILED (reads wrong state field) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| TerminalManager.js | TerminalSessionService.js | calls saveTerminalSessions() after createTerminal and closeTerminal | WIRED | Import at line 44; calls at lines 1238 and 1167 |
| TerminalSessionService.js | ~/.claude-terminal/terminal-sessions.json | atomic write (writeFileSync + renameSync) | WIRED | Lines 31-32: writeFileSync to .tmp path, renameSync to final path; pattern `terminal-sessions.json` present at line 10 |
| renderer.js | TerminalSessionService.js | calls loadSessionData at startup, clearProjectSessions on delete, subscribes for lastOpenedProject | PARTIAL | loadSessionData() called at line 163 (WIRED); clearProjectSessions(projectId) called at line 928 (WIRED); saveTerminalSessions() subscription at line 298 fires correctly but captures openedProjectId=null (BROKEN for SESS-02) |
| renderer.js restore loop | TerminalManager.js | calls TerminalManager.createTerminal for each saved tab | WIRED | Pattern `TerminalManager.createTerminal` at renderer.js:176 inside restore loop |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| SESS-01 | 04-01, 04-02 | Terminal tabs are restored with their working directories when the app restarts | SATISFIED | Save: TerminalManager.js:1232+1238 stores and triggers cwd save. Restore: renderer.js:174-181 recreates tabs with saved cwd |
| SESS-02 | 04-02 | The last opened project is restored when the app restarts | BLOCKED | saveTerminalSessions reads openedProjectId which is null after normal project selection; lastOpenedProjectId always saved as null; restore at renderer.js:199-205 finds no matching project |
| SESS-03 | 04-01 | Terminal session state is saved continuously (crash-resilient, not save-on-quit-only) | SATISFIED | Debounced save on every createTerminal and closeTerminal; atomic write ensures crash resilience |
| SESS-04 | 04-02 | When a project is deleted, its saved terminal session data is cleaned up | SATISFIED | renderer.js:928 clearProjectSessions(projectId) called synchronously after saveProjects() in deleteProjectUI |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/renderer/services/TerminalSessionService.js` | 114 | Reads `openedProjectId` which is semantically "project open in detail view", not "last selected project" | Blocker | lastOpenedProjectId always null — breaks SESS-02 |

### Human Verification Required

#### 1. Tab restore with multiple projects

**Test:** Start app, open two projects, create 2 terminals in project A and 1 in project B, close app, reopen
**Expected:** Project A shows 2 terminal tabs, project B shows 1 terminal tab with correct working directories
**Why human:** Cannot verify PTY spawn behavior and tab rendering programmatically

#### 2. Crash resilience

**Test:** Open app, create terminal tabs, kill process via Task Manager (not graceful shutdown), reopen
**Expected:** Tabs restored from last atomic write (no corruption, no lost data)
**Why human:** Requires real process kill, not programmable

#### 3. Worktree CWD restore

**Test:** Create a terminal with overrideCwd (worktree path), restart app
**Expected:** Terminal reopens in the worktree directory, not the project root
**Why human:** Requires actual worktree setup to test

### Gaps Summary

One gap blocking full goal achievement: SESS-02 (last opened project restored on restart) does not work.

**Root cause:** The `saveTerminalSessions()` function in TerminalSessionService.js (line 114) reads `projectsStateData.openedProjectId` to derive `lastOpenedProjectId`. However, `openedProjectId` is a "detail view" state field — it is set to `null` on every normal project click (ProjectList.js:765 `setOpenedProjectId(null)`, ProjectService.js:129 `setOpenedProjectId(null)`). Only `GitTabService.js:768` ever sets it to a real project ID, for the "open in detail" case.

The subscription in renderer.js correctly detects project selection changes via `selectedProjectFilter`, but because the save reads the wrong field, `lastOpenedProjectId` is always persisted as `null`. On startup, `sessionData.lastOpenedProjectId` is null and the restore block at renderer.js:199 silently does nothing.

**Fix required:** In `saveTerminalSessionsImmediate` (TerminalSessionService.js), change line 114 from:
```js
const lastOpenedProjectId = projectsStateData.openedProjectId || null;
```
to:
```js
const idx = projectsStateData.selectedProjectFilter;
const lastOpenedProjectId = (idx !== null && idx !== undefined && projectsStateData.projects[idx])
  ? projectsStateData.projects[idx].id
  : null;
```

This reads the currently-filtered project (the one the user last clicked in the sidebar) rather than the detail-view project, which matches the intended behavior.

All other 8 truths are fully verified. The persistence layer (SESS-01, SESS-03) and deletion cleanup (SESS-04) work correctly. Only SESS-02 requires this single-line fix.

---
_Verified: 2026-02-24T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
