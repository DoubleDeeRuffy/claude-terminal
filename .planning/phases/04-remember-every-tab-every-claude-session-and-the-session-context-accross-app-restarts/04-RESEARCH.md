# Phase 4: Session Persistence - Research

**Researched:** 2026-02-24
**Domain:** Electron Renderer State Persistence — Terminal Tab Save/Restore across App Restarts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scope of persistence**
- Restore terminal tabs with their working directories — that's it
- No Claude chat session restore (explicitly excluded)
- No terminal scrollback/output history restore
- No scroll positions or minor UI state
- Tab renaming is not implemented, so not a concern

**Restoration behavior**
- Always auto-restore — no setting, no prompt, no toggle
- All projects restore their terminals at app startup (not lazily on project open)
- Terminals re-launch a fresh shell (PowerShell) in the saved working directory
- Restore the active/selected terminal tab per project
- Respect zero-terminal state: if a project had no terminals saved, don't auto-create one
- Also remember and restore the last opened project (app opens to that project)

**Save strategy**
- Save terminal state on every change (tab open, tab close) with debounce — crash-resilient
- No save-on-quit-only; continuous persistence ensures crash recovery works

**Per-project storage**
- Terminal state stored per-project (each project independently remembers its tabs)
- Auto-cleanup: when a project is deleted from the app, its saved terminal state is deleted too

**Edge cases**
- If a project's directory was deleted/moved since last session, skip its terminals silently (no error)
- No cap on number of terminals restored — restore all of them
- Crash recovery: always restore from last saved state, no fresh-start-after-crash logic

### Claude's Discretion
- Storage format and location (JSON file structure, where in ~/.claude-terminal/)
- Debounce timing for save operations
- Order of terminal restoration (sequential vs parallel spawning)
- How to detect working directory of existing terminals for save

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase adds persistence for terminal tabs: when the app starts, each project recreates the same set of terminal tabs it had at last shutdown, in the same working directories. The problem is entirely within the existing codebase — no new dependencies are needed. The solution requires three integration points: (1) a new persistence file `~/.claude-terminal/terminal-sessions.json` written on every tab open/close, (2) a restore pass at startup after projects are loaded but before the user can interact, and (3) cleanup hooks when a project is deleted.

The critical architectural constraint is that terminal CWD is known at creation time (`project.path` or `overrideCwd`), but is not tracked live after the PTY starts. The working directory the user `cd`'d into during a session is **not** recoverable without a separate OS-level query (e.g., `/proc/{pid}/cwd` on Linux or `NtQueryInformationProcess` on Windows — both are out of scope). Therefore the save data captures the **original creation CWD**, which is either the project root or an `overrideCwd` (worktree path). This is the right semantic: restoring to the project root is expected behavior.

The primary recommendation: store a single flat JSON file `~/.claude-terminal/terminal-sessions.json` keyed by `projectId`, follow the same atomic-write + debounce pattern already used in `projects.state.js`, and plug into the existing `createTerminal`/`closeTerminal` paths in `TerminalManager.js`.

**Primary recommendation:** One new file (`terminal-sessions.json`), two new hooks in TerminalManager (save-on-change, restore-at-startup), one deletion cleanup in `deleteProjectUI`. No new dependencies.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node `fs` (sync) | Built-in (via preload) | Read/write JSON persistence file | Already used for all other persistence files in the codebase |
| Electron preload bridge (`window.electron_nodeModules.fs`) | Existing | Renderer-side file I/O | Established pattern: `projects.state.js`, `settings.state.js`, `timetracking.json` all use this |

### Supporting

None required — this is pure codebase integration with no new dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flat JSON file in `~/.claude-terminal/` | Embed terminal data in `projects.json` | Mixing concerns; projects.json has its own save lifecycle and migration history — separate file is cleaner |
| Flat JSON file | Per-project JSON files (`~/.claude-terminal/sessions/{projectId}.json`) | Unnecessary complexity for the feature scope; one flat file with per-project keys is simpler |
| Renderer-side file write via preload | IPC handler in main process | Renderer already writes settings/projects directly via preload fs; consistent with existing pattern |

**Installation:** None required — no new packages.

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. One new file:

```
~/.claude-terminal/
└── terminal-sessions.json    # new — keyed by projectId
```

One new module (optional, could also inline into TerminalManager):

```
src/renderer/services/
└── TerminalSessionService.js   # load, save, clear per-project terminal sessions
```

### Pattern 1: Per-Project Session Data Shape

**What:** The JSON file stores one record per project: the list of terminal CWDs in tab order, plus which tab index was active.

**When to use:** Every tab open and close event.

**Example:**
```json
{
  "project-1748000000000-abc123": {
    "tabs": [
      { "cwd": "C:\\Users\\user\\source\\repos\\my-project", "isBasic": false },
      { "cwd": "C:\\Users\\user\\source\\repos\\my-project\\worktree-branch", "isBasic": false }
    ],
    "activeTabIndex": 1
  },
  "project-1748000000001-def456": {
    "tabs": [],
    "activeTabIndex": null
  }
}
```

**Key fields per tab entry:**
- `cwd`: The effective working directory passed to `terminal-create` IPC. For project root tabs this is `project.path`; for worktree tabs this is `overrideCwd`.
- `isBasic`: Whether the terminal was created with `runClaude: false` (basic shell vs Claude terminal). Needed to restore correctly.

**What NOT to store:** terminal ID (ephemeral), xterm instance, scrollback, tab name (re-derived from project name or CWD on restore).

### Pattern 2: Save-on-Change with Debounce

**What:** After every `createTerminal` or `closeTerminal` call, trigger a debounced save (300–500ms). Mirrors the `saveProjects()` debounce in `projects.state.js`.

**When to use:** Always — never save-on-quit only (per user decision).

**Example (from projects.state.js for reference):**
```js
// Existing pattern — replicate for terminal sessions
let saveDebounceTimer = null;
const SAVE_DEBOUNCE_MS = 500;

function saveTerminalSessions() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => saveTerminalSessionsImmediate(), SAVE_DEBOUNCE_MS);
}
```

### Pattern 3: Atomic Write

**What:** Write to `.tmp` file, then `renameSync` to actual file. Prevents corruption on crash mid-write.

**When to use:** All persistence writes. Established in `projects.state.js` (`saveProjectsImmediate`).

**Example (from projects.state.js — same pattern to use):**
```js
const tempFile = `${sessionsFile}.tmp`;
fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
fs.renameSync(tempFile, sessionsFile);
```

### Pattern 4: Startup Restore Pass

**What:** After `initializeState()` loads projects, iterate all saved session data and call `TerminalManager.createTerminal()` for each project's saved tabs.

**When to use:** Once at startup, after projects are loaded.

**Integration point in `renderer.js`:**
```js
// (async () => {
//   ...
await initializeState();
// ADD: restore saved terminal sessions here
await TerminalSessionService.restoreAllSessions();
// ... rest of init
```

**Restore logic:**
1. Load `terminal-sessions.json`.
2. For each `projectId` in saved data:
   - Look up the project by ID in `projectsState.get().projects` — if not found, skip.
   - Check that `project.path` (the project root dir) still exists via `fs.existsSync` — if not, skip silently.
   - For each `tab` in `sessions[projectId].tabs`:
     - Check that `tab.cwd` still exists via `fs.existsSync` — if not, fall back to `project.path` (project root), or skip entirely if project root also missing.
     - Call `TerminalManager.createTerminal(project, { runClaude: !tab.isBasic, cwd: tab.cwd })`.
   - After all tabs for a project are restored, set the active tab to `activeTabIndex`.
3. After all projects restored, restore the last opened project (set `selectedProjectFilter`).

**Order of restoration:** Sequential per project, parallel across projects is fine too. Sequential is simpler and avoids PTY spawn flooding. Recommended: sequential with `await`.

### Pattern 5: Last Opened Project Persistence

**What:** Store `lastOpenedProjectId` in the same `terminal-sessions.json` (or a separate key at root).

**When to use:** Updated whenever `selectedProjectFilter` changes (user clicks a project in the sidebar).

**Shape:**
```json
{
  "lastOpenedProjectId": "project-1748000000000-abc123",
  "projects": { ... }
}
```

**Restore logic:** After the terminal restore pass, look up the project by `lastOpenedProjectId`, find its index, and call `setSelectedProjectFilter(projectIndex)` + `TerminalManager.filterByProject(projectIndex)`.

### Pattern 6: Deletion Cleanup

**What:** When a project is deleted, remove its entry from `terminal-sessions.json`.

**Integration point in `renderer.js` `deleteProjectUI`:**
```js
// Existing deleteProjectUI function — add after confirmed:
TerminalSessionService.clearProjectSessions(projectId);
```

### Anti-Patterns to Avoid

- **Saving terminal IDs:** Terminal IDs are ephemeral integers assigned by `TerminalService.terminalId++` in the main process. They reset to 0 on restart. Never store them in the session file.
- **Saving the xterm instance or DOM refs:** These are in-memory only. The session file contains only serializable data.
- **Restoring during project-type-specific console creation:** The restore pass should only restore user-created terminal tabs (non-type-console tabs). Type consoles (FiveM, WebApp, API) have their own lifecycle and are not part of this feature.
- **Blocking the UI during restore:** Terminal creation is async. Use `Promise.all` for tabs within a project or sequential `await`. Do not block DOMContentLoaded.
- **Restoring chat-mode tabs:** The CONTEXT.md decision is clear: no chat session restore. If `mode === 'chat'` were stored, skip it. In practice, chat terminals also need `runClaude: true` but differ in mode; the simplest implementation is to only restore `runClaude: false` (basic) and `runClaude: true, mode: 'terminal'` tabs, skipping any `mode: 'chat'` entries.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file write | Custom write+verify | `writeFileSync` + `renameSync` (same pattern as `projects.state.js`) | Race conditions and partial writes are handled by atomic rename |
| Debounce | Custom timer | Simple `clearTimeout`/`setTimeout` pattern (already used in codebase) | Already battle-tested in this exact repo |
| CWD detection after PTY start | Shell command / OS API to query live PTY cwd | Store CWD at creation time | `NtQueryInformationProcess` (Windows) is fragile and overkill; user decision doesn't require live CWD |

**Key insight:** This phase has no "don't hand-roll" items in the external library sense — it is pure codebase integration reusing existing patterns.

---

## Common Pitfalls

### Pitfall 1: Stale ProjectId References

**What goes wrong:** The session file stores `projectId` strings. A project could have been deleted between runs while session data was not cleaned up (e.g., app crashed mid-deletion). Restore then tries to create a terminal for a non-existent project.

**Why it happens:** Save is decoupled from delete; crash can interrupt the delete flow.

**How to avoid:** At restore time, always cross-reference against `projectsState.get().projects`. If `projectId` is not found, silently skip and discard.

**Warning signs:** `getProject(projectId)` returns `undefined`.

### Pitfall 2: Deleted or Moved Working Directory

**What goes wrong:** `tab.cwd` points to a directory that no longer exists (deleted project repo, removed drive letter). `TerminalService.create()` in the main process already handles this gracefully (falls back to `os.homedir()`), but the user would see a terminal opening in the wrong directory.

**Why it happens:** File system changes between sessions.

**How to avoid:** Check `fs.existsSync(tab.cwd)` before restore. If missing:
- Try `project.path` as fallback (per CONTEXT.md: "skip its terminals silently" means skip entirely if project root is gone; if only the worktree cwd is gone but project root exists, fall back to project root).
- Log a console warning but do not show a toast/modal (silently as per user decision).

**Warning signs:** Terminal opens in `C:\Users\user` (homedir fallback from `TerminalService`).

### Pitfall 3: Race Between Projects Load and Session Restore

**What goes wrong:** `restoreAllSessions()` runs before `initializeState()` finishes loading projects, so `getProject(id)` returns `undefined` for all projects and nothing restores.

**Why it happens:** Async operations and incorrect ordering in the init sequence.

**How to avoid:** Only call `restoreAllSessions()` after `await initializeState()` completes. The current `renderer.js` init is a single `async ()` IIFE — insert the restore call in the correct sequence position (after `initializeState()`, before the UI render calls).

**Warning signs:** No terminals appear at startup despite session file having data.

### Pitfall 4: Type Console Tabs Included in Restore

**What goes wrong:** FiveM console tabs, WebApp dev server tabs, or API console tabs get serialized and attempted to restore, but they have different creation flows (`createTypeConsole` instead of `createTerminal`).

**Why it happens:** When serializing terminal state, iterating `terminalsState.get().terminals` without filtering.

**How to avoid:** When building the save data, filter to only `termData` entries where:
- `termData.type` is not `'fivem'`, `'webapp'`, `'api'`, or any registered type console
- `termData.mode !== 'chat'` (no chat session restore, per CONTEXT.md)
- `termData.isBasic !== undefined` — i.e., it's a regular terminal or basic terminal

Concretely: serialize only entries where `termData.mode === 'terminal'` (the default mode set at line 1229 in TerminalManager.js).

**Warning signs:** On restore, errors about missing FiveM server or WebApp dev server.

### Pitfall 5: Saving on Every Keystroke (Over-triggering)

**What goes wrong:** If the save is wired to terminal state changes that happen too frequently, performance degrades. However, the actual trigger events (tab open, tab close) are low-frequency and already have debounce.

**How to avoid:** Trigger save only from `createTerminal()` and `closeTerminal()` completion — not from terminal data events or status changes. A 300–500ms debounce (matching `projects.state.js`) prevents rapid-fire scenarios (user opens 5 tabs quickly).

### Pitfall 6: ActiveTerminal Index vs ID

**What goes wrong:** `activeTabIndex` stored in JSON is an array index into `tabs[]`, but the terminals are re-created in order and assigned new IDs. If any tab fails to restore (CWD missing), the index is off.

**How to avoid:** Rather than storing an integer index, store the `cwd` of the active tab. On restore, after all tabs are created, set active to the tab whose `cwd` matches the saved active CWD. If not found (tab was skipped), default to the last tab.

---

## Code Examples

Verified patterns from official sources (codebase inspection):

### Save: Building Session Data from TerminalManager State

```js
// In TerminalSessionService.js (new) — called after createTerminal / closeTerminal
function buildSessionData() {
  const sessions = {};
  const terminals = terminalsState.get().terminals;

  terminals.forEach((termData, id) => {
    // Only persist regular user terminals, not type consoles or chat
    if (termData.mode !== 'terminal') return;
    if (!termData.project?.id) return;

    const projectId = termData.project.id;
    if (!sessions[projectId]) {
      sessions[projectId] = { tabs: [], activeCwd: null };
    }

    sessions[projectId].tabs.push({
      cwd: termData.project.path,   // creation-time CWD (project.path or overrideCwd)
      isBasic: termData.isBasic === true
    });

    // Track active tab
    if (id === terminalsState.get().activeTerminal) {
      sessions[projectId].activeCwd = termData.project.path;
    }
  });

  return sessions;
}
```

**Note on CWD source:** `termData.project.path` is the project root (`project.path`). For worktree terminals created with `overrideCwd`, the effective CWD differs. Looking at `createTerminal` in TerminalManager.js (line 1172), `overrideCwd` is passed to `api.terminal.create({ cwd: overrideCwd || project.path })` but the `termData` stored at line 1220 only stores `project` (the parent project object). The `overrideCwd` is NOT stored in `termData`.

**Resolution (Claude's discretion):** Store `overrideCwd` in `termData` during `createTerminal`. Add `cwd: overrideCwd || project.path` to the `termData` object at line 1232. This is the one small addition to TerminalManager needed to make the CWD serializable.

### Restore: Startup Sequence Insertion Point

```js
// In renderer.js, inside the async IIFE, after initializeState():
await initializeState();

// Restore terminal sessions from previous run
const { TerminalSessionService } = require('./src/renderer/services/TerminalSessionService');
await TerminalSessionService.restoreAllSessions({
  createTerminal: (project, opts) => TerminalManager.createTerminal(project, opts),
  setActiveTerminal: (id) => TerminalManager.setActiveTerminal(id),
  setSelectedProjectFilter,
  filterByProject: (idx) => TerminalManager.filterByProject(idx),
  projectsState,
  fs
});

// ... rest of init (render project list, etc.)
```

### Restore: Core Logic Sketch

```js
async function restoreAllSessions({ createTerminal, setSelectedProjectFilter, filterByProject, projectsState, fs }) {
  const data = loadSessionFile(); // returns { lastOpenedProjectId, projects: { ... } }
  if (!data) return;

  const projects = projectsState.get().projects;

  for (const projectId of Object.keys(data.projects)) {
    const saved = data.projects[projectId];
    const project = projects.find(p => p.id === projectId);
    if (!project) continue;                          // project deleted — skip
    if (!fs.existsSync(project.path)) continue;     // project root gone — skip

    for (const tab of saved.tabs) {
      const cwd = fs.existsSync(tab.cwd) ? tab.cwd : project.path;
      await createTerminal(project, {
        runClaude: !tab.isBasic,
        cwd,
        // skipPermissions comes from settings, createTerminal reads it internally
      });
    }
    // Active tab restoration: handled inside createTerminal sequence
    // (last created tab is active by default; override below)
    // ... set active terminal for this project to the one matching saved.activeCwd
  }

  // Restore last opened project
  if (data.lastOpenedProjectId) {
    const idx = projects.findIndex(p => p.id === data.lastOpenedProjectId);
    if (idx !== -1) {
      setSelectedProjectFilter(idx);
      filterByProject(idx);
    }
  }
}
```

### Delete Cleanup Hook

```js
// In deleteProjectUI (renderer.js), after confirmed:
TerminalSessionService.clearProjectSessions(projectId);
```

```js
// In TerminalSessionService.js:
function clearProjectSessions(projectId) {
  const data = loadSessionFile() || { projects: {} };
  delete data.projects[projectId];
  saveSessionFile(data);  // atomic write, no debounce needed on delete
}
```

### Last Opened Project — Save Hook

The user's "last opened project" is set when `selectedProjectFilter` changes in `renderer.js`. There are many call sites. The cleanest hook is subscribing to `projectsState` changes:

```js
// In TerminalSessionService.init() or at end of renderer.js init:
projectsState.subscribe((state) => {
  if (state.selectedProjectFilter !== null) {
    const project = state.projects[state.selectedProjectFilter];
    if (project) {
      updateLastOpenedProjectId(project.id); // debounced save
    }
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Save-on-quit | Continuous debounced save | This phase | Crash resilience: state survives unexpected shutdowns |
| No persistence | JSON file per data category | Existing pattern | Terminal sessions follow the same pattern as projects/settings |

**Deprecated/outdated:**
- None — this is a new feature, no migration of old data needed.

---

## Open Questions

1. **Should `overrideCwd` be stored in `termData` to support worktree tab restore?**
   - What we know: `overrideCwd` is used at creation time (`api.terminal.create({ cwd: overrideCwd || project.path })`), but `termData` at line 1220 only stores `project` (the parent project). The `overrideCwd` value is lost from in-memory state after `createTerminal` returns.
   - What's unclear: Whether users frequently have worktree tabs they'd want restored to the worktree directory vs. the project root.
   - Recommendation: Add `cwd: overrideCwd || project.path` to the `termData` object in `createTerminal`. This is a one-line addition and enables accurate restore for worktree tabs. Without it, worktree tabs restore to the project root instead of the worktree directory — still functional, not ideal.

2. **What's the correct debounce delay?**
   - What we know: `projects.state.js` uses 500ms. Tab events are low-frequency (user action required).
   - Recommendation: Use 300ms — slightly tighter than projects.json since terminal tab changes are more discrete user actions and less likely to batch-fire.

3. **Sequential vs parallel terminal restoration?**
   - What we know: `TerminalService.create()` in main process is synchronous within itself (no async PTY ops that block). IPC calls are async but fast.
   - Recommendation: Sequential within a project (preserves tab order as stored), parallel across projects (independent). This is:
     ```js
     await Promise.all(projectIds.map(async (projectId) => {
       for (const tab of saved.projects[projectId].tabs) {
         await createTerminal(project, opts);
       }
     }));
     ```

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `src/renderer/ui/components/TerminalManager.js` — verified `termData` shape, `createTerminal` signature, `closeTerminal` flow, mode values
- Codebase inspection: `src/renderer/state/terminals.state.js` — verified `terminalsState` Map structure, `addTerminal`/`removeTerminal` APIs
- Codebase inspection: `src/renderer/state/projects.state.js` — verified atomic write + debounce pattern (exact code to replicate)
- Codebase inspection: `src/renderer/utils/paths.js` — verified `dataDir = ~/.claude-terminal/`, confirmed naming convention for data files
- Codebase inspection: `src/main/services/TerminalService.js` — verified `cwd` validation logic (falls back to `os.homedir()` if missing), confirms silent recovery is already handled at main process level
- Codebase inspection: `renderer.js` lines 156–240 — verified async init sequence, confirmed `await initializeState()` is the correct insertion point
- Codebase inspection: `renderer.js` `deleteProjectUI` (line 838) — confirmed this is the single deletion hook; no secondary cleanup mechanism exists

### Secondary (MEDIUM confidence)

- Pattern inference from existing codebase: The `projects.json` per-project state file is the canonical model for how this app stores per-entity state. The same pattern is used for `settings.json`, `timetracking.json`, `marketplace.json`. Terminal sessions follow naturally.

### Tertiary (LOW confidence)

- None — all findings are from direct codebase inspection.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new deps, all patterns verified in codebase
- Architecture: HIGH — integration points verified by reading actual source files
- Pitfalls: HIGH — derived from reading actual implementation (CWD not stored in termData, type console filtering needed, async ordering)

**Research date:** 2026-02-24
**Valid until:** 2026-03-30 (codebase patterns are stable; valid until major refactor)
