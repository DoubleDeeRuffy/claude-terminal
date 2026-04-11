---
phase: 3-rewrite-tab-system
plan: 01
type: execute
wave: 1
depends_on: [2-remove-split-pane]
files_modified:
  - src/renderer/state/terminals.state.js
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/services/TerminalSessionService.js
  - renderer.js
autonomous: true

must_haves:
  truths:
    - "All tab IDs in the renderer are strings (no Number(id) fallbacks)"
    - "terminals.state.js exposes activePerProject, setActiveTerminalForProject, getActiveTerminalForProject, setCurrentProject"
    - "TerminalManager.setActiveTerminal uses strict === comparisons"
    - "TerminalManager.updateTerminalTabName uses scoped #terminal-tabs querySelector with a warn-on-miss path"
    - "createTerminal never defaults an empty/null restored name to project.name — it falls back to 'Untitled'"
    - "terminal-sessions.json is written in version: 3 format with activeTabId (string) and tab.id"
    - "v2 terminal-sessions.json files auto-migrate to v3 on first load, including session-names.json merge"
    - "filterByProject was read, confirmed safe per memory note, and its else-branch was not modified"
    - "Renaming the active tab updates exactly that tab in DOM + state + disk"
    - "Renaming an inactive tab updates exactly that tab, leaving the active tab untouched"
    - "Cold-start restore reproduces all saved tabs with correct names (not project.name)"
    - "Cold-start restore sets the correct activeTabId per project from disk"
    - "Switching projects and back preserves per-project active tab"
    - "npm run build:renderer succeeds"
    - "npm test passes (existing tests + new v2→v3 migration test)"
  artifacts:
    - path: "src/renderer/state/terminals.state.js"
      provides: "string-keyed terminals Map + activePerProject + currentProjectId + helpers"
      contains: "activePerProject"
    - path: "src/renderer/services/TerminalSessionService.js"
      provides: "v3 write path + v2→v3 migration in loadSessionData"
      contains: "version: 3"
    - path: "tests/services/TerminalSessionService.test.js"
      provides: "unit test covering v2→v3 migration"
      contains: "version"
  key_links:
    - from: "TerminalManager.updateTerminalTabName"
      to: "document.querySelector('#terminal-tabs .terminal-tab[data-id=X]')"
      via: "scoped selector with warn-on-miss"
      pattern: "#terminal-tabs .terminal-tab\\[data-id"
    - from: "TerminalManager.setActiveTerminal"
      to: "setActiveTerminalForProject(projectId, id)"
      via: "single source of truth for per-project active"
      pattern: "setActiveTerminalForProject"
    - from: "renderer.js restore loop"
      to: "setActiveTerminalForProject(projectId, restoredIdByOldId.get(saved.activeTabId))"
      via: "string-ID-based active-tab restore"
      pattern: "restoredIdByOldId"
---

<objective>
Rebuild the tab system on a clean foundation — unified string IDs,
single source of truth for active tab, v3 persistence format with
migration, and the rename/restore/active-tab fixes — so the recurring
tab bugs stop regressing.

Purpose: after phase 3 merges, the three canonical failure modes
(rename wrong tab, wrong set of tabs on restore, wrong names on
restore) should be verifiably fixed AND the code should be cleaner
than before, not hackier. Specifically: no `terminals.get(id) ||
terminals.get(Number(id))` workarounds, no `lastActivePerProject`
closure map, no `tab.dataset.id == id` loose equality that disagrees
with `===` elsewhere, no silent fallback to `project.name` on restore.

Output:
- Updated `terminals.state.js`, `TerminalManager.js`,
  `TerminalSessionService.js`, `renderer.js`
- New unit test for v2 → v3 migration
- A single phase-3 commit (or a small stack of commits) on top of
  the phase-2 commit in the worktree
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md

**CRITICAL: this phase executes inside the worktree, NOT the main checkout.**

Before starting any work, cd into:
`C:/Users/uhgde/source/repos/claude-terminal-rewrite`

All paths in this plan are relative to that worktree. `git log` there
must show the phase 2 commit as a recent ancestor. If phase 2 isn't
committed yet, stop and ask the user.
</execution_context>

<context>
@.gsd/PROJECT.md
@.gsd/ROADMAP.md
@.gsd/milestones/1.2/3-rewrite-tab-system/3-CONTEXT.md
@.gsd/milestones/1.2/2-remove-split-pane/2-CONTEXT.md

**Memory notes the executor MUST read before task 5 (filterByProject audit):**
- `~/.claude/projects/C--Users-uhgde-source-repos-claude-terminal/memory/feedback-filterByProject-danger.md`

<interfaces>
Read at execution time (do NOT paste contents inline — the phase 2
commit has reshaped the surrounding code):

- `src/renderer/state/terminals.state.js` — the full file, to plan the
  state extension
- `src/renderer/ui/components/TerminalManager.js` — `createTerminal`,
  `closeTerminal`, `setActiveTerminal`, `filterByProject`,
  `updateTerminalTabName`, `startRenameTab`, `handleAiRename`,
  `lastActivePerProject` closure, every `terminals.get(Number(id))`
  fallback, `openFileTab`, every type-console creator
- `src/renderer/services/TerminalSessionService.js` — `saveTerminalSessionsImmediate`,
  `loadSessionData`, and any remaining `paneLayout` / debug-dump code
- `renderer.js` — the restore loop (lines ~220-410 before phase 2,
  shifted after phase 2)
- `src/main/utils/paths.js` — to confirm the data-dir path for the
  session-names.json read
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend terminals.state.js with activePerProject + string-ID contract</name>
  <files>src/renderer/state/terminals.state.js</files>
  <action>
1. Extend the initial state:
   ```js
   const initialState = {
     terminals: new Map(),          // Map<string, TerminalData>
     activePerProject: new Map(),   // Map<projectId, tabId>
     currentProjectId: null,        // drives derived activeTerminal
     detailTerminal: null,
   };
   ```
2. Add these exported functions:
   - `setActiveTerminalForProject(projectId, tabId)` — updates
     `activePerProject`, triggers state notification.
   - `getActiveTerminalForProject(projectId)` — reads from
     `activePerProject`.
   - `setCurrentProject(projectId)` — updates `currentProjectId`.
   - `getCurrentProjectId()` — reads `currentProjectId`.
3. Rewrite `getActiveTerminal()` to derive from state:
   ```js
   function getActiveTerminal() {
     const s = terminalsState.get();
     return s.currentProjectId ? (s.activePerProject.get(s.currentProjectId) ?? null) : null;
   }
   ```
4. Keep `setActiveTerminal(terminalId)` as a backward-compatible wrapper
   that looks up the terminal's `project.id` and calls
   `setActiveTerminalForProject(projectId, terminalId)`. It should
   continue to work from callers that only know the terminal id.
5. Confirm all existing exported functions still exist:
   `getTerminals`, `getTerminal`, `addTerminal`, `updateTerminal`,
   `removeTerminal`, `countTerminalsForProject`,
   `getTerminalStatsForProject`, `getTerminalsForProject`,
   `killTerminalsForProject`, `clearAllTerminals`, `setDetailTerminal`,
   `getDetailTerminal`.
6. Update `removeTerminal(id)` to also clear the per-project entry if
   `activePerProject.get(projectId) === id` — in which case, pick the
   last remaining terminal for that project as the new active, or
   delete the entry if none remain.
  </action>
  <verify>
    <automated>grep -n "activePerProject\|setActiveTerminalForProject\|setCurrentProject" src/renderer/state/terminals.state.js</automated>
  </verify>
  <done>
    - New exports present
    - Existing exports unchanged
    - `getActiveTerminal()` derives from `currentProjectId` + `activePerProject`
  </done>
</task>

<task type="auto">
  <name>Task 2: Unify tab IDs as strings end-to-end in TerminalManager</name>
  <files>src/renderer/ui/components/TerminalManager.js</files>
  <action>
1. Add a `genTabId()` helper near the top of the module:
   ```js
   function genTabId() {
     return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
   }
   ```
2. Rewrite `createTerminal()`:
   - Generate `const id = genTabId()` BEFORE calling
     `api.terminal.create(...)`.
   - Store the IPC-returned numeric id as `termData.ptyId = result.id`.
   - `addTerminal(id, termData)` uses the string id.
   - `tab.dataset.id = id` (string, no conversion).
   - Change the name default to:
     ```js
     let tabName;
     if (customName !== undefined && customName !== null) {
       tabName = customName || 'Untitled';
     } else {
       tabName = isBasicTerminal ? 'Terminal' : project.name;
     }
     ```
   - All `api.terminal.input` / `api.terminal.resize` / `api.terminal.kill`
     calls inside `createTerminal` and its event handlers use
     `termData.ptyId` (resolved via `getTerminal(id).ptyId`), never `id`.
3. Grep for `terminals.get(Number(id))` in TerminalManager — delete
   every such fallback. If the callsite genuinely needs both, it's a
   bug; fix the upstream id type.
4. In `setActiveTerminal`:
   - Replace all loose `==` DOM toggle comparisons with strict `===`.
   - Delete the `lastActivePerProject` closure Map usage.
   - Replace it with `setActiveTerminalForProject(projectId, id)` from
     the state module.
   - Read the new active-tab per project via
     `getActiveTerminalForProject(projectId)` where the old closure
     was consulted.
5. `closeTerminal(id)` — `api.terminal.kill({ id: termData.ptyId })`
   instead of `id`.
6. `openFileTab()` — generate a string id with a different prefix
   (e.g., `f-${Date.now()}-${rand}`); ensure it uses `addTerminal` and
   stores `termData.type = 'file'` (already does).
7. Every type-console creator (`createTypeConsole`, `createFivemConsole`,
   `createWebAppConsole`, `createApiConsole`) — generate a string id
   with an appropriate prefix; ensure they don't keep numeric ids.
8. `handleAiRename(id)` + `startRenameTab(id)` — they already pass `id`
   through; just ensure it's a string throughout.
9. Run grep to confirm no remaining `terminals.get(Number`, no
   `tab.dataset.id == ` (loose equality), no `Number(terminalId)` in
   TerminalManager.js.
  </action>
  <verify>
    <automated>grep -n "Number(id)\|terminals\\.get(Number\|dataset\\.id ==\|lastActivePerProject" src/renderer/ui/components/TerminalManager.js</automated>
  </verify>
  <done>
    - Zero hits for any of the four patterns
    - `genTabId` function exists and is called in createTerminal
    - `createTerminal` stores `ptyId` and uses string `id`
    - All IPC calls route through `ptyId` where the main process expects a PTY id
    - Name default never falls back to `project.name` when called with an explicit empty/null name
  </done>
</task>

<task type="auto">
  <name>Task 3: Simplify updateTerminalTabName (the rename fix)</name>
  <files>src/renderer/ui/components/TerminalManager.js</files>
  <action>
Replace the current `updateTerminalTabName(id, name)` body with:

```js
function updateTerminalTabName(id, name) {
  if (name && name.length > 30) name = name.slice(0, 30) + '…';
  const termData = getTerminal(id);
  if (!termData) {
    console.warn(`[Rename] No terminal for id ${id}`);
    return;
  }

  // Slash-command rename protection (keep existing behavior)
  if (name && name.startsWith('/')) {
    slashRenameTimestamps.set(id, Date.now());
  }

  updateTerminal(id, { name });

  // Scoped DOM refresh — #terminal-tabs is the single tab bar
  const tab = document.querySelector(`#terminal-tabs .terminal-tab[data-id="${id}"]`);
  if (!tab) {
    console.warn(`[Rename] Tab element missing for id ${id}, skipping DOM update`);
  } else {
    const nameSpan = tab.querySelector('.tab-name');
    if (nameSpan) nameSpan.textContent = name;
  }

  // session-names.json — for resume dialog only
  if (name) {
    if (termData.claudeSessionId) {
      setSessionCustomName(termData.claudeSessionId, name);
    }
    if (termData.originalSessionId && termData.originalSessionId !== termData.claudeSessionId) {
      setSessionCustomName(termData.originalSessionId, name);
    }
  }

  const TerminalSessionService = require('../../services/TerminalSessionService');
  TerminalSessionService.saveTerminalSessions();
}
```

Key differences from the old version:
- `#terminal-tabs .terminal-tab[data-id="${id}"]` — scoped, not global
- Warn-on-miss branch — logs `[Rename] Tab element missing for id ...`
- All other behavior preserved (slash rename tracking, session-names
  writes, debounced disk save)
  </action>
  <verify>
    <automated>grep -n "#terminal-tabs .terminal-tab\\[data-id\|Tab element missing" src/renderer/ui/components/TerminalManager.js</automated>
  </verify>
  <done>
    - New scoped querySelector in place
    - Warn-on-miss branch exists
    - No `document.querySelector` using unscoped `.terminal-tab[data-id=...]` for rename
  </done>
</task>

<task type="auto">
  <name>Task 4: v3 persistence format + v2→v3 migration</name>
  <files>src/renderer/services/TerminalSessionService.js</files>
  <action>
1. Update `saveTerminalSessionsImmediate()`:
   - Iterate `#terminal-tabs .terminal-tab` (no more PaneManager — phase 2 already did this).
   - For each tab, look up `terminals.get(id)` with the string id.
   - Build each `tab` object as:
     ```js
     tab = {
       id,                      // persist renderer-side tab id
       name: td.name || null,
       cwd: td.cwd || td.project.path,
       isBasic: td.isBasic || false,
       claudeSessionId: td.claudeSessionId || null,
       ...(td.cliTool ? { cliTool: td.cliTool } : {}),
     };
     ```
     For file tabs:
     ```js
     tab = { id, type: 'file', filePath: td.filePath, name: td.name || null };
     ```
   - Replace `activeTabIndex` logic with `activeTabId`. Read
     `getActiveTerminalForProject(projectId)` from the state and set
     `session.activeTabId = <string>` directly. No position lookups.
   - Set `version: 3` in the final `sessionData` object.

2. Update `loadSessionData()`:
   - After `JSON.parse`, if `data.version !== 3`, run `_migrateV2ToV3(data)`
     before returning.
   - `_migrateV2ToV3(data)`:
     a. Load `~/.claude-terminal/session-names.json` once.
     b. For each project in `data.projects`:
        - Delete the `paneLayout` field if present (safety — phase 2
          should have stopped writing it).
        - For each tab, assign a new `id = genTabId()` (duplicate the
          generator from TerminalManager or import it from a shared
          util; inline is fine).
        - If `tab.name` is empty AND `tab.claudeSessionId` has an
          entry in `session-names.json`, set `tab.name` from the
          merged value.
        - Build `activeTabId` from the old `activeTabIndex` via
          position lookup into the new tabs array. If out of range,
          leave `activeTabId = null`.
        - Delete `session.activeTabIndex`, `session.activeCwd`.
     c. Set `data.version = 3`.
     d. Return the migrated object.

3. Update `_dumpSessionDebugFromData` to use `activeTabId` when
   highlighting the active tab. (Cosmetic — dev mode only.)

4. Confirm `setSessionCustomName` still exists and is still called from
   `updateTerminalTabName` — that's the resume-dialog bridge.

5. Cross-reference: `saveTerminalSessions` debounce is unchanged.
  </action>
  <verify>
    <automated>grep -n "version: 3\|_migrateV2ToV3\|activeTabId\|activeTabIndex" src/renderer/services/TerminalSessionService.js</automated>
  </verify>
  <done>
    - Save writes `version: 3`
    - Load auto-migrates v2 → v3 including session-names.json merge
    - No more references to `activeTabIndex` in save path (legacy
      read may still exist inside the migration helper — that's fine)
  </done>
</task>

<task type="auto">
  <name>Task 5: Audit filterByProject (read-only) + rewrite renderer.js restore loop</name>
  <files>renderer.js, src/renderer/ui/components/TerminalManager.js</files>
  <action>
**5a. filterByProject audit — READ ONLY, do not modify the function body in this task.**

Open `TerminalManager.js` and read `filterByProject(selectedFilter)` in
full. Confirm that:
- When a project IS selected (the main branch), only wrappers belonging
  to the selected project have `display` cleared; all others get
  `display = 'none'` set on their style.
- When NO project is selected (the else-branch), the function does NOT
  call `style.removeProperty('display')` on every wrapper.

If the function already satisfies both invariants, leave it alone and
note "filterByProject audited — safe" in the phase summary.

If the function violates the memory-documented rule (e.g., the
else-branch has a `document.querySelectorAll('.terminal-wrapper').forEach(w => w.style.removeProperty('display'))`),
STOP. Do not silently fix it here. Write the violation into the phase
summary and ask the user whether to fix it in this phase or add a
follow-up phase.

**5b. Restore loop rewrite in renderer.js.**

Replace the restore loop with this structure (adapt to the exact
surrounding code after phase 2):

```js
const sessionData = loadSessionData(); // auto-migrates v2 → v3
if (sessionData?.projects) {
  const projects = projectsState.get().projects;

  for (const projectId of Object.keys(sessionData.projects)) {
    const saved = sessionData.projects[projectId];
    const project = projects.find(p => p.id === projectId);
    if (!project || !fs.existsSync(project.path)) continue;
    if (!saved.tabs?.length) continue;

    const restoredIdByOldId = new Map();

    for (const tab of saved.tabs) {
      // Ghost session filter (unchanged)
      if (tab.type !== 'file' && !tab.isBasic && tab.claudeSessionId && isGhostSession(project.path, tab.claudeSessionId)) {
        continue;
      }

      let restoredId = null;
      if (tab.type === 'file') {
        if (tab.filePath && fs.existsSync(tab.filePath)) {
          restoredId = TerminalManager.openFileTab(tab.filePath, project);
        }
      } else {
        const cwd = fs.existsSync(tab.cwd) ? tab.cwd : project.path;
        const isGsdResume = tab.cliTool === 'gsd' && !tab.isBasic;
        restoredId = await TerminalManager.createTerminal(project, {
          runClaude: !tab.isBasic,
          cwd,
          skipPermissions: settingsState.get().skipPermissions,
          resumeSessionId: isGsdResume
            ? 'gsd-continue'
            : ((!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null),
          name: tab.name || null, // never fall back to project.name
          ...(tab.cliTool ? { cliTool: tab.cliTool } : {}),
        });
      }

      if (restoredId && tab.id) {
        restoredIdByOldId.set(tab.id, restoredId);
      }
    }

    // Restore this project's active tab via per-project state
    if (saved.activeTabId) {
      const newActiveId = restoredIdByOldId.get(saved.activeTabId);
      if (newActiveId) {
        setActiveTerminalForProject(projectId, newActiveId);
      }
    }
  }

  // Switch to last-opened project — filterByProject picks up state
  if (sessionData.lastOpenedProjectId) {
    const idx = projects.findIndex(p => p.id === sessionData.lastOpenedProjectId);
    if (idx !== -1) {
      setSelectedProjectFilter(idx);
      TerminalManager.filterByProject(idx);
    }
  }

  // Schedule silence-based scroll for restored terminals (unchanged)
  terminalsState.get().terminals.forEach((td, id) => {
    if (td.terminal && typeof td.terminal.scrollToBottom === 'function') {
      TerminalManager.scheduleScrollAfterRestore(id);
    }
  });
}
```

Notes:
- `isGhostSession` is the existing local helper in the restore block
  (defined in the same file). Keep its implementation.
- `setSelectedProjectFilter` is the existing projects-state helper.
- `setActiveTerminalForProject` is imported from the state module
  (add the import at the top of the restore block or reuse the existing
  state import).
- Leave `setSkipExplorerCapture(true)` / `setSkipExplorerCapture(false)`
  exactly as-is around this block.
  </action>
  <verify>
    <automated>grep -n "restoredIdByOldId\|setActiveTerminalForProject\|activeTabId" renderer.js</automated>
  </verify>
  <done>
    - filterByProject audited (read-only). Result recorded in summary.
    - Restore loop uses `restoredIdByOldId` Map and `setActiveTerminalForProject`
    - `createTerminal` is called with `name: tab.name || null`
    - No references to `saved.activeTabIndex` in the restore path (the
      migration helper may still reference it internally)
  </done>
</task>

<task type="auto">
  <name>Task 6: Write v2→v3 migration unit test</name>
  <files>tests/services/TerminalSessionService.test.js</files>
  <action>
1. If the test file doesn't exist, create it. Pattern from existing
   tests in `tests/services/` — mock `fs`, mock
   `src/main/utils/paths`, load the service after mocks.
2. Test cases:
   - **v2 load returns v3 shape.** Feed a v2 fixture:
     ```js
     {
       version: 2,
       projects: {
         'proj-a': {
           tabs: [
             { cwd: 'C:/a', isBasic: false, claudeSessionId: 'sess-1', name: 'My tab' },
             { cwd: 'C:/a', isBasic: true, name: null },
           ],
           activeTabIndex: 1,
         }
       },
       lastOpenedProjectId: 'proj-a'
     }
     ```
     Expect the returned object to have `version: 3`, each tab to
     have a fresh `id` starting with `t-`, `activeTabId` to equal the
     id of the second tab (position 1), `activeTabIndex` to be gone.
   - **session-names.json merge.** Feed a v2 file with an empty
     `tab.name` and a matching entry in the mocked
     `session-names.json`. Expect `tab.name` to come from
     session-names.json after migration.
   - **session-names.json precedence.** Feed a v2 file with
     `tab.name: 'from-disk'` AND a session-names.json entry with a
     different value. Expect `tab.name: 'from-disk'` to WIN (the v2
     file value is authoritative; session-names.json only fills gaps).
   - **v3 passthrough.** Feed a valid v3 file. Expect it to round-trip
     unchanged.
   - **paneLayout stripped on migration.** Feed a v2 file with a
     `paneLayout` block. Expect `paneLayout` to be gone after migration.
3. Confirm the test passes in isolation and as part of `npm test`.
  </action>
  <verify>
    <automated>npm test -- tests/services/TerminalSessionService.test.js 2>&1 | tail -10</automated>
  </verify>
  <done>
    - Test file exists (or is extended)
    - All 5 cases pass
    - `npm test` overall still 450+ passing, +N new
  </done>
</task>

<task type="auto">
  <name>Task 7: Full verification + commit</name>
  <files>.</files>
  <action>
1. Grep sweep:
   ```bash
   grep -rn "terminals\\.get(Number\|dataset\\.id ==\|lastActivePerProject\|activeTabIndex" src/
   ```
   Expected: zero hits outside the migration helper in
   TerminalSessionService.js (which may still mention `activeTabIndex`
   in the v2-read path — that's fine).

2. Build + tests:
   ```bash
   npm run build:renderer
   npm test
   ```

3. **Manual E2E checklist** (only if the app can launch — if
   better-sqlite3 won't rebuild in the worktree, note this as deferred
   to merge-back):

   1. Rename the active tab. Open a project → create 3 terminals →
      make tab 2 active → right-click tab 2 → Rename → type "FooBar"
      → Enter → confirm tab 2 shows "FooBar" and tabs 1/3 are unchanged.
   2. Rename an inactive tab. Make tab 1 active → right-click tab 3
      → Rename → "Baz" → confirm tab 3 is renamed, tab 1 stays active
      and unchanged.
   3. Double-click rename. Double-click tab 2's name → type → Enter →
      confirm updated.
   4. AI Rename. Right-click → AI Rename → confirm tab name updates
      (exercises `api.tabName.generate`).
   5. Restore count. 3 renamed terminals in project A, 2 in project B
      → quit → relaunch → all 5 come back with correct names (not
      "project A" / "project B"), in order, in their projects.
   6. Restore active. Before quit, tab 2 of project A was active →
      relaunch → switch to project A → confirm tab 2 is active.
   7. Per-project active memory. Project A: tab 2 active. Switch to
      project B → tab X becomes active. Switch back to A → tab 2 is
      active again.
   8. Workflow agent node. Run a workflow with a Claude agent node →
      confirm it executes via `claudeCliPromptService` (phase 1 path).
   9. Top-bar git status refresh still works (unrelated to rewrite,
      confirms no regression).
   10. Close all terminals, quit, relaunch → no ghost tabs.

4. Commit with this message (single commit preferred):
   ```
   phase 3: rewrite tab system — string IDs, v3 format, rename+restore fixes

   Rebuilds the tab subsystem on a clean foundation to fix the three
   recurring regressions (rename wrong tab, wrong tabs on restore,
   wrong names on restore).

   Core changes:

   - All tab IDs are now renderer-generated strings (genTabId).
     TerminalManager no longer holds numeric PTY ids as tab keys;
     instead termData.ptyId stores the main-process PTY id separately,
     used only for terminal.input/resize/kill IPC. Every
     terminals.get(Number(id)) workaround is gone.

   - terminals.state.js gains activePerProject + currentProjectId +
     setActiveTerminalForProject / getActiveTerminalForProject as the
     single source of truth for active tab. The in-memory
     lastActivePerProject closure in TerminalManager is deleted.

   - terminal-sessions.json is now version: 3 with activeTabId (string)
     and authoritative tab.name. v2 files auto-migrate on load,
     merging session-names.json into tab.name only where tab.name is
     empty. session-names.json continues to be written on rename for
     the Claude resume dialog.

   - updateTerminalTabName uses a #terminal-tabs-scoped querySelector
     with a warn-on-miss path — can no longer hit a stale tab element.

   - setActiveTerminal uses strict === comparisons and writes to
     setActiveTerminalForProject instead of the old closure map.

   - createTerminal's default name logic no longer falls back to
     project.name when called with an explicit empty/null name from
     restore — it uses 'Untitled' instead.

   - filterByProject was audited (read only) against the memory
     feedback rule. See summary for result.

   Includes a new tests/services/TerminalSessionService.test.js suite
   covering v2→v3 migration: shape, session-names merge, session-names
   precedence, v3 passthrough, paneLayout stripping.

   npm test: 45N passed. build:renderer: clean.
   This is phase 3 of 3 in the tab system rewrite.
   ```

5. Write `.gsd/milestones/1.2/3-rewrite-tab-system/3-01-SUMMARY.md` with:
   - Commit hash
   - `git diff --stat`
   - filterByProject audit result (safe / violation / N/A)
   - Which of the 10 E2E checks were performed vs deferred (if the
     app couldn't launch in the worktree)
   - Any deviations from the plan
  </action>
  <verify>
    <automated>npm run build:renderer 2>&1 | tail -5 && npm test 2>&1 | tail -5 && git log --oneline -5</automated>
  </verify>
  <done>
    - Build clean, tests green
    - Phase 3 commit on top of phase 2 commit
    - Summary file written
    - Worktree is ready for merge back into main
  </done>
</task>

</tasks>

<verification>
- `grep -rn "terminals\\.get(Number\|dataset\\.id ==\|lastActivePerProject" src/` → 0 hits
- `grep -n "activeTabIndex" src/renderer/services/TerminalSessionService.js` — ok if hits only appear in the migration helper
- `npm run build:renderer` → clean
- `npm test` → all passing (450 baseline + new migration test count)
- `git log --oneline` → 3 phase commits on top of phase-37 WIP:
  phase 1 (d9395d6f), phase 2, phase 3
- Manual E2E (if app can launch) or explicit deferred-to-merge-back note
</verification>

<success_criteria>
- Three tab bugs fixed:
  - rename affects the right tab
  - restore reproduces the right set of tabs per project
  - restored tab names are correct (not project.name)
- Renderer builds, tests pass
- No new bugs introduced
- filterByProject safety invariant preserved (audited, result documented)
- v2 → v3 migration tested
- Worktree ready for merge-back: three clean phase commits on top of
  the phase-37 WIP commit
</success_criteria>

<output>
After completion, create `.gsd/milestones/1.2/3-rewrite-tab-system/3-01-SUMMARY.md`.
Then update `.gsd/STATE.md` in the worktree to reflect milestone 1.2
completion (optional — can also be deferred to merge-back).
</output>
