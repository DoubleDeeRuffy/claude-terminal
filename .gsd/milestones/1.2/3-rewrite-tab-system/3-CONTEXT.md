# Phase 3: Rewrite Tab System - Context

**Gathered:** 2026-04-11
**Status:** Ready for execution
**Part of:** Tab System Rewrite (phases 1→3)
**Depends on:** Phase 1 ghost (commit `d9395d6f`) + Phase 2 commit.

<domain>
## Phase Boundary

Fix the three recurring tab-system bugs at their root cause by rebuilding
the tab subsystem on a clean foundation. The three bugs:

1. **Rename affects the wrong tab** — right-clicking tab B while tab A
   is active visually renames tab A (or nothing), and manual rename of
   the active tab silently updates the wrong tab.
2. **Restore creates the wrong set of tabs** — on cold start, the
   number of restored tabs / their association with projects is off.
3. **Restored tab names are wrong** — tabs come back showing the
   project name instead of the custom name the user set.

**Root causes (verified from reading the pre-rewrite code directly):**

- **ID type confusion.** Main process (`TerminalService.js`) allocates
  numeric PTY IDs (`++this.terminalId`). DOM stores them as strings
  (`tab.dataset.id`). The save path uses
  `terminals.get(id) || terminals.get(Number(id))` as a workaround.
  Critically, `TerminalSessionService.js:~128` uses
  `id === activeTerminalId` — strict equality between string (from DOM
  iteration) and number (from state) — so `activeTabIndex` is almost
  never set correctly during save. That alone explains the "active tab
  lost on restore" symptom.
- **Name fallback defaults to `project.name`.** `TerminalManager.createTerminal`
  defaults `tabName = customName || project.name` (~line 2267 in the
  phase-1 file state; line number shifts after phase 2). If
  `session-names.json` lookup fails during restore and the fallback
  `tab.name` is empty, the restored tab gets the project name instead
  of "Untitled" — exactly the "names wrong on restore" symptom.
- **Active-tab tracking split across three places.**
  `terminalsState.activeTerminal` (global),
  `lastActivePerProject` in-memory `Map` (TerminalManager closure),
  and (before phase 2) `PaneManager.pane.activeTab` per pane. Cold
  start can't populate the in-memory map, so active-tab is re-derived
  through different code paths on cold start vs project filter switch,
  and they disagree.
- **Rename uses `document.querySelector` by id** while state writes go
  through a different code path. Combined with loose `==` comparisons
  in `setActiveTerminal` DOM toggles but strict `===` elsewhere, the
  visual vs state active-tab drifts apart after drag-reorder or rename.

This phase rebuilds:

- **String tab IDs end-to-end** (renderer-generated UUIDs, PTY numeric
  ID stored separately as `ptyId`).
- **Single source of truth for active tab per project** — moves
  `activePerProject` + `currentProjectId` into `terminals.state.js`.
- **v3 persistence format** — `activeTabId` (string) instead of
  `activeTabIndex`, `tab.name` authoritative, `tab.id` persisted for
  diagnostics, migrated from v2 on first load.
- **Simplified `updateTerminalTabName`** — scoped
  `#terminal-tabs` querySelector with warn-on-miss.
- **Simplified `setActiveTerminal`** — strict `===` throughout, single
  tab bar scope.
- **`filterByProject` safety invariant audit** — must NOT call
  `style.removeProperty('display')` blanket on all wrappers in the
  else-branch (see the feedback memory note).
- **New `createTerminal` name defaulting** — brand-new tabs default to
  `project.name` for Claude or `"Terminal"` for basic, but tabs
  restored from disk with an explicit empty / null name fall back to
  `"Untitled"`, never `project.name`.
</domain>

<decisions>
## Implementation Decisions

### C1 — Unified string IDs
- Renderer-side ID generator:
  ```js
  function genTabId() {
    return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  ```
- `createTerminal()` allocates `const id = genTabId()` BEFORE calling
  `api.terminal.create(...)`. The IPC response's `result.id` (a number
  from the main-process counter) becomes `termData.ptyId`.
- All IPC calls that target a PTY (`api.terminal.input`,
  `api.terminal.resize`, `api.terminal.kill`) use `ptyId`, never the
  renderer `id`.
- `tab.dataset.id = id` (string). `terminals.get(id)` always uses the
  string key. Every `terminals.get(Number(id))` fallback is deleted.

### C2 — Single source of truth for active tab
Extend `src/renderer/state/terminals.state.js`:
```js
const initialState = {
  terminals: new Map(),            // Map<string, TerminalData>
  activePerProject: new Map(),     // Map<projectId, tabId>
  currentProjectId: null,          // drives derived activeTerminal
  detailTerminal: null,            // kept for FiveM console
};
```
New functions:
- `setActiveTerminalForProject(projectId, tabId)`
- `getActiveTerminalForProject(projectId)`
- `setCurrentProject(projectId)`
- `getActiveTerminal()` — returns `activePerProject.get(currentProjectId) ?? null`

Delete the `lastActivePerProject` closure `Map` from `TerminalManager.js`.
All reads/writes go through the new state functions.

Cold-start restore populates `activePerProject` directly from disk so
there's no in-memory divergence.

### C3 — v3 persistence format
New shape (file: `~/.claude-terminal/terminal-sessions.json`):
```json
{
  "version": 3,
  "savedAt": "2026-04-11T...",
  "lastOpenedProjectId": "proj-abc",
  "projects": {
    "proj-abc": {
      "tabs": [
        {
          "id": "t-1712345678-xyz",
          "name": "My custom name",
          "cwd": "C:/path",
          "isBasic": false,
          "claudeSessionId": "abc-123",
          "cliTool": "claude"
        }
      ],
      "activeTabId": "t-1712345678-xyz",
      "explorer": { /* unchanged */ }
    }
  }
}
```

Key changes vs v2:
- No `paneLayout` field (already gone in phase 2).
- `activeTabId` (string) replaces `activeTabIndex` (number).
- `tab.name` is authoritative — written on every rename, read on every
  restore, never falls back to `project.name`.
- Tab `id` persisted for diagnostics.

**Migration from v2** — `loadSessionData()`:
1. If `data.version === 2`, map each project's `activeTabIndex` →
   `activeTabId` via position, mint new string tab IDs for each saved
   tab, set `version: 3`.
2. Also load `~/.claude-terminal/session-names.json` and, for each tab
   with a `claudeSessionId`, merge the saved custom name into
   `tab.name` **only if `tab.name` is currently empty**. If `tab.name`
   already has a value, leave it — it's the authoritative source.
3. Write v3 on the next save. Never read v2 again.

`session-names.json` stays as a secondary writer. `updateTerminalTabName`
continues to write it on rename (for Claude's resume dialog / lightbulb).
The restore flow no longer reads from it as the primary source — v3
`tab.name` is.

### C4 — Rename fix
```js
function updateTerminalTabName(id, name) {
  if (name && name.length > 30) name = name.slice(0, 30) + '…';
  const termData = getTerminal(id);
  if (!termData) {
    console.warn(`[Rename] No terminal for id ${id}`);
    return;
  }
  updateTerminal(id, { name });

  // Always refresh the specific tab element — scoped to the single tab bar
  const tab = document.querySelector(`#terminal-tabs .terminal-tab[data-id="${id}"]`);
  if (!tab) {
    console.warn(`[Rename] Tab element missing for id ${id}, skipping DOM update`);
  } else {
    const nameSpan = tab.querySelector('.tab-name');
    if (nameSpan) nameSpan.textContent = name;
  }

  // session-names.json — for resume dialog only
  if (name && termData.claudeSessionId) {
    setSessionCustomName(termData.claudeSessionId, name);
  }
  if (name && termData.originalSessionId && termData.originalSessionId !== termData.claudeSessionId) {
    setSessionCustomName(termData.originalSessionId, name);
  }
  TerminalSessionService.saveTerminalSessions();
}
```

The key fixes are:
- String IDs throughout — no stale `Number(id)` path.
- Scoped `#terminal-tabs` querySelector — can't accidentally match a
  stale element from a different pane (there are no panes).
- Warn-on-miss — surface the bug class loudly if it reappears.
- Double-click rename already passes `id` correctly; it just needs the
  ID consistency to work.

### C5 — Restore fix
Rewrite the `renderer.js` restore loop to:
1. Load v3 (or migrate v2 → v3).
2. For each project, for each tab, mint a new renderer-side string ID,
   then call `createTerminal` / `openFileTab` with `name: tab.name || null`.
3. Build a `restoredIdByOldId: Map<oldStringId, newStringId>` so the
   saved `activeTabId` can resolve to the new ID.
4. Call `setActiveTerminalForProject(projectId, newActiveId)` — DOM
   activation is deferred to the `filterByProject` step.
5. Switch to `lastOpenedProjectId` at the end; `filterByProject` picks
   up the correct active tab from state.

### C6 — `createTerminal` default name fix
Change the existing `const tabName = customName || project.name;`
default to:
```js
let tabName;
if (customName !== undefined && customName !== null) {
  // Explicit name from caller (restore path or user rename).
  // Empty string is a legit "no name known" signal from restore.
  tabName = customName || 'Untitled';
} else {
  // Brand-new tab — default to project name (Claude) or 'Terminal' (basic).
  tabName = isBasicTerminal ? 'Terminal' : project.name;
}
```

This is the direct fix for "restored names are wrong". Callers that
restore from disk pass `name: tab.name || null` — when `tab.name` is
empty, we fall back to `"Untitled"`, never to `project.name`.

### C7 — `setActiveTerminal` simplification + `filterByProject` invariant

New `setActiveTerminal`:
```js
function setActiveTerminal(id) {
  const termData = getTerminal(id);
  if (!termData) return;

  const prevId = getActiveTerminal();
  const prev = prevId && getTerminal(prevId);
  if (prev && prev.terminal && prevId !== id) {
    try { prev.terminal.blur(); } catch {}
    try {
      if (prev.terminal?.buffer?.active) {
        savedScrollPositions.set(prevId, { viewportY: prev.terminal.buffer.active.viewportY });
      }
    } catch {}
  }

  // Write to state: per-project active + (implied) current project
  const projectId = termData.project?.id;
  if (projectId) setActiveTerminalForProject(projectId, id);

  // DOM: scoped to the single tab bar and content area, strict ===
  document.querySelectorAll('#terminal-tabs .terminal-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.id === id);
  });
  document.querySelectorAll('#terminal-content .terminal-wrapper').forEach(w => {
    if (w.dataset.id === id) {
      w.classList.add('active');
      w.style.removeProperty('display');
    } else {
      w.classList.remove('active');
      // Do NOT removeProperty('display') here — filterByProject owns that.
    }
  });

  // scroll restore, focus, time tracking, notifyTabActivated — unchanged
}
```

**`filterByProject` audit — MANDATORY.** Read the current implementation.
It MUST:
- In the main branch (a project IS selected): iterate all
  `.terminal-wrapper` elements. For wrappers whose `termData.project.id`
  matches the selected project: show them (remove `display`). For all
  others: hide them (`display = 'none'`).
- In the else-branch (no project selected, i.e. "show all"): DO NOT
  call `removeProperty('display')` blanket on all wrappers. This
  violates the memory feedback rule
  (`~/.claude/projects/C--Users-uhgde-source-repos-claude-terminal/memory/feedback-filterByProject-danger.md`).
  Whatever the current correct-branch semantics are, preserve them
  exactly. If the current code does the dangerous thing, STOP and
  document the deviation in the summary — don't silently fix it.
</decisions>

<specifics>
## Execution specifics

- **Worktree.** All edits in
  `C:/Users/uhgde/source/repos/claude-terminal-rewrite`.
- **Depends on phase 2.** `git log` in the worktree must show the phase
  2 commit as a recent ancestor before starting.
- **Single commit or split?** Split into sub-commits if it helps
  bisectability:
  - commit 3a: string ID migration + state refactor
  - commit 3b: v3 persistence format + migration
  - commit 3c: rename/restore fix + filterByProject audit
  Each sub-commit must leave `npm test` + `npm run build:renderer` green.
  Or do it as one big commit if the coupling makes splits awkward.

- **v2 → v3 migration must be tested.** The executor should:
  1. Copy an existing v2 `terminal-sessions.json` from the user's
     `~/.claude-terminal/` into a temp file for reference.
  2. Implement the migration.
  3. Write a unit test (`tests/services/TerminalSessionService.test.js`)
     covering: v2 load → v3 shape, `activeTabIndex` → `activeTabId`,
     session-names.json merge into `tab.name`, v3 passthrough.
  4. Ensure no existing tests regress.

- **Backward-compat for existing terminals on disk.** When migrating,
  DO NOT mint new `claudeSessionId` values — those are Claude CLI
  session identifiers and must survive. Only mint new renderer tab IDs.

- **`terminalsState.set(...)` calls.** Be careful: the state module
  expects specific shapes. The new `activePerProject` Map must be
  replaced (`new Map(existing.activePerProject)`) when setting via
  `set()` to trigger observer notifications — or use `setProp` for
  single-key updates.

- **Tests.** Existing tests cover settings state, project state,
  i18n, and RemoteServer. Any test that asserts against
  `terminals.state.activeTerminal` as a number needs to be updated to
  either read a string or use the new `getActiveTerminal()` helper.
</specifics>

<code_context>
## Files to modify (post phase 2)

- `src/renderer/state/terminals.state.js` — extend with activePerProject, currentProjectId, new helpers; accept string IDs
- `src/renderer/ui/components/TerminalManager.js` — genTabId, createTerminal refactor, simplified setActiveTerminal, rename fix, delete lastActivePerProject closure, update all getTerminal/updateTerminal/setActiveTerminal callers to use string IDs
- `src/renderer/services/TerminalSessionService.js` — v3 write format, v2→v3 migration on load, session-names.json merge
- `renderer.js` — rewrite restore loop, use setActiveTerminalForProject
- Possibly: `src/main/services/TerminalService.js` — no changes needed; keep its numeric PTY ID. Renderer maps it via `ptyId`.
- Possibly: `src/main/ipc/terminal.ipc.js` — no changes needed; it already accepts whatever id the renderer sends for write/resize/kill.
- `tests/services/TerminalSessionService.test.js` — new test file covering v2→v3 migration (if the test suite has one already, extend; otherwise create).
- Possibly affected existing tests in `tests/state/` if any assert on terminal ID shapes.

## Existing patterns worth preserving (do not rewrite)

- `scheduleScrollAfterRestore(id)` — silence-based scroll after restore.
- `restoreNameProtected` Set — protects restored custom names from
  post-resume OSC title overwrites.
- `handleClaudeTitleChange`, `setupPasteHandler`, `setupClipboardShortcuts`,
  `setupRightClickHandler`, `createTerminalKeyHandler`.
- The `terminalContext` rich-context map for notifications.
- The `lastTerminalData` Map for staleness detection.
- All FiveM / WebApp / API / generic type-console creators keep their
  current structure — they just switch to string IDs like everything
  else.
- The `session-names.json` secondary writer.
- The `isGhostSession(...)` filter in restore (still needed).

## Integration points untouched

- Main process — no changes to `TerminalService.js` or `terminal.ipc.js`
  unless absolutely necessary. The ID scheme translation happens in
  the renderer.
- Workflows, ParallelTaskService, ControlTowerPanel — none of them
  touch tab IDs directly.
- RemoteServer — doesn't touch tab IDs.
</code_context>

<deferred>
## Deferred

- None — this is the last phase of the rewrite.
- Future work (explicit non-goals here):
  - Anything about a replacement split-pane feature
  - Cloud relay / remote control improvements
  - Resume dialog UX changes
</deferred>

---

*Phase: 3-rewrite-tab-system*
*Part of: Tab System Rewrite (1→3)*
*Context gathered: 2026-04-11*
