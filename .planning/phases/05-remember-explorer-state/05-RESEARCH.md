# Phase 5: Remember Explorer State - Research

**Researched:** 2026-02-24
**Domain:** Electron Renderer State Persistence — FileExplorer expanded-folder and panel-visibility save/restore per project
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**What state to persist**
- Expanded folders only — no scroll position, search query, or file selection
- State is per-project — each project has its own independent expansion state
- Save continuously with debounce (crash-resilient, same pattern as Phase 4 terminal sessions)
- Store in the same file as terminal session data from Phase 4 — one unified session file per project

**Restore behavior**
- Eager restore — on project switch, immediately re-expand all saved folders and load their children
- Missing folders on disk are silently skipped (no error, no notification)
- Panel visibility (open/closed) is remembered per-project
- Panel width stays global (current localStorage behavior unchanged)

**Staleness handling**
- Clean up explorer state when a project is deleted (consistent with Phase 4 terminal cleanup)
- If the project root directory no longer exists, silently discard the explorer state entirely

### Claude's Discretion
- Debounce timing for save
- Data structure for storing expanded folder paths
- Integration details with Phase 4's TerminalSessionService

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 5 adds persistence for FileExplorer state — which folders are expanded and whether the panel is visible — per project. The state is stored alongside Phase 4's terminal session data in `~/.claude-terminal/terminal-sessions.json`. On project switch or app restart, the explorer immediately re-expands all saved folders by calling `getOrLoadFolder()` on each path in order.

The feature is entirely within the existing codebase: no new dependencies, no new files beyond what Phase 4 already created. The key integration points are: (1) extend `TerminalSessionService` to also persist `expandedPaths[]` and `panelVisible` per project, (2) export new setter functions from `FileExplorer.js` so the service can restore state, (3) hook into the existing `projectsState.subscribe()` that already fires on project switch, (4) extend `clearProjectSessions()` to also remove the explorer keys.

The critical behavioral nuance is that `expandedFolders` in `FileExplorer.js` is a `Map` from path → `{ children, loaded }`. Persistence stores only the **path keys** as an array. On restore, each path is re-loaded from disk via the existing `getOrLoadFolder()` mechanism — children are never stored, just the set of which folders should be open. Missing paths on disk are silently skipped using `fs.existsSync` before calling `getOrLoadFolder`.

**Primary recommendation:** Extend `terminal-sessions.json` schema with `explorer: { expandedPaths: string[], panelVisible: bool }` per project. Add save-on-change hooks to FileExplorer's `toggleFolder`, `hide`, and `show` calls. Restore on project switch inside the existing `projectsState.subscribe()` in `renderer.js`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node `fs` (sync) | Built-in (via preload) | Read/write extended session JSON | Same file and same atomic-write pattern already established by Phase 4 |
| Existing `TerminalSessionService.js` | Phase 4 output | Storage layer for `terminal-sessions.json` | Already in place; extend rather than create a new file |

### Supporting

None required — this is pure codebase integration with no new dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Same `terminal-sessions.json` | Separate `explorer-state.json` | Separate file is cleaner in isolation, but CONTEXT.md locks this: "store in the same file as terminal session data" |
| Array of absolute paths | Relative paths (relative to project root) | Relative paths would survive project folder moves, but absolute paths are simpler and consistent with how `expandedFolders` Map keys work in FileExplorer.js |
| Per-path persistence | Storing the entire `expandedFolders` Map including children | Children are re-loaded from disk on restore — storing them bloats the file and creates stale data if disk changes between sessions |

**Installation:** None required — no new packages.

---

## Architecture Patterns

### Data Structure Extension to `terminal-sessions.json`

The Phase 4 JSON schema per project:

```json
{
  "lastOpenedProjectId": "project-id",
  "projects": {
    "project-id": {
      "tabs": [{ "cwd": "...", "isBasic": false }]
    }
  }
}
```

Phase 5 extends each project entry with an `explorer` key:

```json
{
  "lastOpenedProjectId": "project-id",
  "projects": {
    "project-id": {
      "tabs": [{ "cwd": "...", "isBasic": false }],
      "explorer": {
        "expandedPaths": [
          "C:\\Users\\user\\repos\\my-project\\src",
          "C:\\Users\\user\\repos\\my-project\\src\\components"
        ],
        "panelVisible": true
      }
    }
  }
}
```

**Key design points:**
- `expandedPaths` is a flat array of absolute paths that were keys in `expandedFolders` Map (only paths where `entry.loaded === true` at save time — no point saving paths still loading)
- `panelVisible` mirrors the `manuallyHidden` flag: `panelVisible = !manuallyHidden` (stored positively for readability)
- Old session files without `explorer` key are gracefully handled — treated as no saved state (show panel, no expanded folders)

### Pattern 1: Save Explorer State via TerminalSessionService

**What:** Extend `saveTerminalSessions()` (and its immediate variant) to read FileExplorer state alongside terminal state.

**When to use:** Triggered after every `toggleFolder`, `show`/`hide`, same debounce as terminal sessions (300ms).

**Implementation sketch:**

```js
// In TerminalSessionService.js — extend saveTerminalSessionsImmediate():
// (add after existing projectsMap construction)

// Lazy-require FileExplorer to avoid circular deps
const FileExplorer = require('../ui/components/FileExplorer');
const explorerState = FileExplorer.getStateForProject(currentProjectId);
if (explorerState && projectsMap[currentProjectId]) {
  projectsMap[currentProjectId].explorer = explorerState;
}
```

**Alternative approach (recommended):** Rather than tightly coupling TerminalSessionService to FileExplorer, expose a `getExplorerSessions()` function from FileExplorer that returns `{ [projectId]: { expandedPaths, panelVisible } }` keyed by `rootPath → projectId`. This keeps the coupling directional (service queries component, not the reverse).

### Pattern 2: FileExplorer State Export

**What:** Add functions to `FileExplorer.js` to expose current state and apply saved state.

**Exports to add:**

```js
// Read current state — called by TerminalSessionService during save
function getState() {
  return {
    expandedPaths: [...expandedFolders.keys()].filter(p => {
      const entry = expandedFolders.get(p);
      return entry && entry.loaded;  // only persist fully-loaded expansions
    }),
    panelVisible: isVisible  // or !manuallyHidden
  };
}

// Apply saved state — called on project switch / app start
async function restoreState({ expandedPaths = [], panelVisible = true }) {
  // Apply panel visibility first
  if (panelVisible && rootPath && !manuallyHidden) {
    show();
  } else if (!panelVisible) {
    manuallyHidden = true;
    hide();
  }

  // Re-expand each saved folder (silently skip missing)
  for (const folderPath of expandedPaths) {
    if (!fs.existsSync(folderPath)) continue;           // silently skip
    if (!isPathSafe(folderPath)) continue;              // security: must be under rootPath
    getOrLoadFolder(folderPath);                        // async load, triggers render on completion
  }
}
```

**Note on `isPathSafe`:** Already defined in FileExplorer.js — use it to guard each restored path. A path saved for project A should never be applied while rootPath is project B's path; the `setRootPath` call before restore handles this, but the guard is defense-in-depth.

### Pattern 3: Trigger Save from FileExplorer Events

**What:** Hook into the three state-changing operations in FileExplorer.js that should trigger a save: `toggleFolder`, `show`/`hide` (panel visibility).

**Where to call save:**

```js
// In toggleFolder() — after expanding or collapsing:
function toggleFolder(folderPath) {
  // ... existing logic ...
  saveExplorerState();  // new call — debounced
}

// In hide() — after panel hidden:
function hide() {
  // ... existing logic ...
  saveExplorerState();
}

// In show() — when panel becomes visible (to persist panelVisible: true):
function show() {
  // ... existing logic ...
  saveExplorerState();
}
```

**Implementation of `saveExplorerState()`:**

```js
// In FileExplorer.js — new helper
const { saveTerminalSessions } = require('../../services/TerminalSessionService');

function saveExplorerState() {
  // saveTerminalSessions() is already debounced (300ms)
  // It will call getState() on FileExplorer as part of its write
  saveTerminalSessions();
}
```

**Circular dependency risk:** FileExplorer → TerminalSessionService → (lazy requires) FileExplorer. Use the same lazy-require pattern that Phase 4 already uses in `saveTerminalSessionsImmediate()` to avoid circular dep at module load time.

### Pattern 4: Restore on Project Switch

**What:** When `setRootPath()` is called (project switch), after clearing the old state, apply the new project's saved explorer state.

**Current flow in renderer.js:**

```js
projectsState.subscribe(() => {
  const state = projectsState.get();
  const selectedFilter = state.selectedProjectFilter;
  const projects = state.projects;

  if (selectedFilter !== null && projects[selectedFilter]) {
    FileExplorer.setRootPath(projects[selectedFilter].path);  // triggers clear + render
  } else {
    FileExplorer.hide();
  }
});
```

**Phase 5 extension — two options:**

**Option A (recommended):** Pass saved explorer state into `setRootPath()` as an optional second argument:

```js
// In renderer.js projectsState.subscribe callback:
if (selectedFilter !== null && projects[selectedFilter]) {
  const project = projects[selectedFilter];
  const sessionData = loadSessionData();
  const explorerState = sessionData?.projects?.[project.id]?.explorer;
  FileExplorer.setRootPath(project.path, explorerState);
}
```

```js
// In FileExplorer.js setRootPath():
function setRootPath(projectPath, savedState = null) {
  if (rootPath === projectPath) return;
  rootPath = projectPath;
  selectedFiles.clear();
  lastSelectedFile = null;
  expandedFolders.clear();
  // ... other resets ...

  if (savedState) {
    restoreState(savedState);  // apply panel visibility + start loading saved folders
  } else if (rootPath && !manuallyHidden) {
    show();
    render();
  }
}
```

**Option B:** Call `FileExplorer.restoreState(explorerState)` immediately after `setRootPath()` from the subscriber in renderer.js. Simpler but requires two calls where one would do.

Option A is cleaner — single call, state applied atomically with the path change.

### Pattern 5: Restore at App Startup

**What:** On first load, after the Phase 4 session restore loop runs and the last-opened project is selected, the project subscription fires `setRootPath()` which already handles restore if we implement Option A above. No separate startup restore needed — the project switch mechanism covers it.

**Verification:** The Phase 4 restore code in renderer.js ends with:

```js
if (sessionData.lastOpenedProjectId) {
  const idx = projects.findIndex(p => p.id === sessionData.lastOpenedProjectId);
  if (idx !== -1) {
    setSelectedProjectFilter(idx);
    TerminalManager.filterByProject(idx);
  }
}
```

`setSelectedProjectFilter(idx)` fires `projectsState.subscribe()` which calls `FileExplorer.setRootPath()`. With Option A, the explorer state is restored as part of that call. No additional startup code needed.

### Pattern 6: Delete Cleanup

**What:** When a project is deleted, its explorer state is automatically cleaned up because the entire project entry is removed from `terminal-sessions.json` by `clearProjectSessions(projectId)`. No additional cleanup needed.

**Verification:** `clearProjectSessions()` in TerminalSessionService.js deletes `data.projects[projectId]` which contains the `explorer` key. The Phase 4 deletion hook in `deleteProjectUI` already calls `clearProjectSessions(projectId)`.

### Anti-Patterns to Avoid

- **Storing `expandedFolders` entries where `loaded === false`:** A folder in loading state hasn't been confirmed to exist yet. Only persist paths where `entry.loaded === true` to avoid saving phantom expansions.
- **Re-using `manuallyHidden` across projects:** `manuallyHidden` is a global flag in FileExplorer.js that survives project switches. Phase 5 must reset `manuallyHidden` based on the incoming project's `panelVisible` value in `setRootPath()`, otherwise hiding the panel for one project bleeds into the next project.
- **Restoring paths not under the current project root:** An `expandedPath` saved from a previous session might be `/other-project/src` due to a bug or file corruption. Always validate with `isPathSafe()` before calling `getOrLoadFolder()`.
- **Blocking render on restore:** `restoreState()` calls `getOrLoadFolder()` which is async (reads disk, then re-renders). Do not await each folder sequentially — fire all `getOrLoadFolder()` calls synchronously (they each internally start async reads and re-render when done). The explorer will progressively show expanded folders as each loads.
- **Saving search state or file selection:** CONTEXT.md is explicit — only expanded folders and panel visibility. The `searchQuery`, `selectedFiles`, `lastSelectedFile` are session-only state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic write | Custom write+verify | `writeFileSync` + `renameSync` in existing `writeSessionsFile()` | Already implemented in TerminalSessionService.js — just call it |
| Debounce | New timer | The existing `saveTerminalSessions()` which is already debounced at 300ms | Phase 4 debounce covers Phase 5 triggers too since they write the same file |
| Per-folder existence check | OS watcher / inotify | `fs.existsSync()` at restore time | Simple, cheap, already used throughout FileExplorer.js |

**Key insight:** Phase 5 adds no new infrastructure. It extends three existing modules (FileExplorer.js, TerminalSessionService.js, renderer.js) with minimal additions.

---

## Common Pitfalls

### Pitfall 1: `manuallyHidden` Flag Not Reset on Project Switch

**What goes wrong:** User hides panel on project A. Switches to project B (which had panel visible). `setRootPath()` is called but doesn't reset `manuallyHidden`. The `show()` call inside `setRootPath` is guarded by `!manuallyHidden`, so project B's panel stays hidden even though saved state says `panelVisible: true`.

**Why it happens:** `manuallyHidden` is module-level state that persists across project switches. The current `setRootPath()` does not touch `manuallyHidden`.

**How to avoid:** In the extended `setRootPath()`, set `manuallyHidden` from `savedState.panelVisible` before calling `show()` or `hide()`. If no saved state, default `manuallyHidden = false` (show panel for new projects).

**Warning signs:** Panel visibility from project A persists after switching to project B.

### Pitfall 2: Saving Partially-Loaded Folders

**What goes wrong:** User quickly expands a large folder, then immediately switches projects. The folder is in `expandedFolders` with `loaded: false`. The save captures it. On restore, `getOrLoadFolder()` is called — this works, but it means the folder appears to load from scratch rather than being "already open". This is acceptable behavior.

**Real risk:** If the folder was never actually on disk (e.g., `getOrLoadFolder` returned `[]` due to error), saving it as expanded means it gets re-attempted on restore — `fs.existsSync()` catches this and skips it silently.

**How to avoid:** Filter to `entry.loaded === true` in `getState()`. Only persist folders that successfully loaded. In-flight loads are ephemeral.

**Warning signs:** Saved paths that don't exist produce no harm (silently skipped), but indicate the filter isn't working.

### Pitfall 3: Circular Dependency Between FileExplorer and TerminalSessionService

**What goes wrong:** If `FileExplorer.js` imports `TerminalSessionService` at the top of the file, and `TerminalSessionService.js` imports `FileExplorer` at the top, both modules fail to load (Node.js circular dependency deadlock — one module is still `{}` when the other requires it).

**Why it happens:** Phase 4 already solved this for TerminalSessionService → terminalsState using lazy requires inside functions. The same pattern applies here.

**How to avoid:** In `TerminalSessionService.js`'s `saveTerminalSessionsImmediate()`, require FileExplorer lazily:

```js
function saveTerminalSessionsImmediate() {
  const { terminalsState } = require('../state/terminals.state');  // already lazy
  const FileExplorer = require('../ui/components/FileExplorer');   // lazy — add this
  const explorerState = FileExplorer.getState();
  // ...
}
```

In `FileExplorer.js`, require TerminalSessionService lazily in `saveExplorerState()` — or avoid the import entirely by accepting `saveTerminalSessions` as a callback injected via `init({ onStateChange })`.

**Warning signs:** `FileExplorer.getState is not a function` or empty `{}` object when trying to call it.

### Pitfall 4: Race Between `setRootPath` Clear and Async Folder Load

**What goes wrong:** Project A has saved folders. `setRootPath(projectA)` is called, which calls `restoreState()`, which calls `getOrLoadFolder(path1)`. While path1 is loading async, user switches to project B. `setRootPath(projectB)` is called, which calls `expandedFolders.clear()`. When path1's async read resolves, it calls `render()` — but `rootPath` now points to project B. The render is for the wrong project.

**Why it happens:** `getOrLoadFolder` closes over the `expandedFolders` Map and calls `render()` on completion. The async closure doesn't know the project has changed.

**How to avoid:** The existing `getOrLoadFolder` already has a guard: `if (entry) return entry` — if `expandedFolders` was cleared (project switch), the entry is gone, and the render on completion will render project B's (now empty) state, which is correct. The render is harmless since `rootPath` has changed. This is not a correctness issue, just a spurious extra render. Acceptable.

### Pitfall 5: Loading State on App Startup Before rootPath Is Set

**What goes wrong:** `FileExplorer.restoreState()` is called before `setRootPath()`, or during a phase where `rootPath === null`. Calls to `getOrLoadFolder()` fail because `isPathSafe()` requires `rootPath` to be non-null.

**How to avoid:** Always call `restoreState()` from within `setRootPath()` after `rootPath` is assigned, never before. The Option A pattern ensures this ordering.

---

## Code Examples

Verified patterns from codebase inspection:

### FileExplorer.js: `getState()` function

```js
// Returns current serializable explorer state for the current project
// Called by TerminalSessionService during save
function getState() {
  return {
    expandedPaths: [...expandedFolders.keys()].filter(p => {
      const entry = expandedFolders.get(p);
      return entry && entry.loaded;
    }),
    panelVisible: isVisible
  };
}
```

### FileExplorer.js: `restoreState()` function

```js
// Apply saved state — called from setRootPath() when savedState is provided
function restoreState(savedState) {
  const { expandedPaths = [], panelVisible = true } = savedState;

  // Apply panel visibility
  if (!panelVisible) {
    manuallyHidden = true;
    // Don't call hide() — rootPath just set, panel not shown yet; hide() handles DOM
    const panel = document.getElementById('file-explorer-panel');
    if (panel) { panel.style.display = 'none'; isVisible = false; }
  } else {
    manuallyHidden = false;
    show();
  }

  // Re-expand saved folders (async, each triggers its own render on completion)
  for (const folderPath of expandedPaths) {
    try {
      if (!fs.existsSync(folderPath)) continue;     // silently skip missing
      if (!isPathSafe(folderPath)) continue;         // security guard
      getOrLoadFolder(folderPath);                   // starts async load + render
    } catch (e) {
      // Silently skip on any error
    }
  }
}
```

### FileExplorer.js: Extended `setRootPath()`

```js
function setRootPath(projectPath, savedState = null) {
  if (rootPath === projectPath) return;
  rootPath = projectPath;
  selectedFiles.clear();
  lastSelectedFile = null;
  expandedFolders.clear();
  gitStatusMap.clear();
  searchQuery = '';
  searchResults = [];

  if (!rootPath) return;

  if (savedState) {
    restoreState(savedState);
  } else {
    manuallyHidden = false;   // new project with no history — show by default
    show();
    render();
  }
  updateSearchBarVisibility();
}
```

### TerminalSessionService.js: Extended `saveTerminalSessionsImmediate()`

```js
function saveTerminalSessionsImmediate() {
  try {
    const { terminalsState } = require('../state/terminals.state');
    const { projectsState } = require('../state/projects.state');
    const FileExplorer = require('../ui/components/FileExplorer');  // lazy

    const state = terminalsState.get();
    const { terminals, activeTerminal } = state;

    const projectsMap = {};

    terminals.forEach((termData) => {
      if (termData.mode !== 'terminal') return;
      if (!termData.project || !termData.project.id) return;
      const projectId = termData.project.id;
      const cwd = termData.cwd || termData.project.path;
      const isBasic = termData.isBasic === true;
      if (!projectsMap[projectId]) {
        projectsMap[projectId] = { tabs: [], activeCwd: null };
      }
      projectsMap[projectId].tabs.push({ cwd, isBasic });
    });

    if (activeTerminal !== null) {
      const activeTermData = terminals.get(activeTerminal);
      if (activeTermData && activeTermData.mode === 'terminal' && activeTermData.project?.id) {
        const pid = activeTermData.project.id;
        if (projectsMap[pid]) {
          projectsMap[pid].activeCwd = activeTermData.cwd || activeTermData.project.path;
        }
      }
    }

    // Add explorer state for current project
    const projectsStateData = projectsState.get();
    const idx = projectsStateData.selectedProjectFilter;
    const currentProject = (idx !== null && idx !== undefined) ? projectsStateData.projects[idx] : null;
    if (currentProject) {
      if (!projectsMap[currentProject.id]) {
        projectsMap[currentProject.id] = { tabs: [], activeCwd: null };
      }
      projectsMap[currentProject.id].explorer = FileExplorer.getState();
    }

    const lastOpenedProjectId = currentProject ? currentProject.id : null;
    const data = { lastOpenedProjectId, projects: projectsMap };
    writeSessionsFile(data);
  } catch (e) {
    console.error('[TerminalSessionService] saveTerminalSessionsImmediate failed:', e);
  }
}
```

### renderer.js: Extended `projectsState.subscribe()` callback

```js
projectsState.subscribe(() => {
  const state = projectsState.get();
  const selectedFilter = state.selectedProjectFilter;
  const projects = state.projects;

  if (selectedFilter !== null && projects[selectedFilter]) {
    const project = projects[selectedFilter];
    const sessionData = loadSessionData();
    const explorerState = sessionData?.projects?.[project.id]?.explorer || null;
    FileExplorer.setRootPath(project.path, explorerState);
  } else {
    FileExplorer.hide();
  }
});
```

### FileExplorer.js: `toggleFolder` with save hook

```js
function toggleFolder(folderPath) {
  const entry = expandedFolders.get(folderPath);
  if (entry && entry.loaded) {
    expandedFolders.delete(folderPath);
    render();
  } else if (!entry) {
    getOrLoadFolder(folderPath);
    render();
  }
  // Fire save — debounced 300ms via TerminalSessionService
  _saveExplorerState();
}

let _saveExplorerStateTimer = null;
function _saveExplorerState() {
  clearTimeout(_saveExplorerStateTimer);
  _saveExplorerStateTimer = setTimeout(() => {
    try {
      const { saveTerminalSessions } = require('../../services/TerminalSessionService');
      saveTerminalSessions();
    } catch (e) { /* ignore */ }
  }, 300);
}
```

**Note:** Alternatively, `saveTerminalSessions` can be injected via `init({ onStateChange })` to eliminate the lazy require and the separate debounce timer (since `saveTerminalSessions` is itself debounced at 300ms).

---

## Open Questions

1. **Should explorer state be saved for all projects or only the current project?**
   - What we know: `expandedFolders` is module-level state in FileExplorer.js. It only holds state for the currently-displayed project (cleared on `setRootPath`). There is no multi-project in-memory state.
   - What's unclear: When saving, should we merge the new explorer state into existing session data (preserving other projects' explorer state), or should we only know the current project's state?
   - Recommendation: In `saveTerminalSessionsImmediate()`, only update the current project's `explorer` key. Load existing data first, merge, then write — same as how the function already merges per-project terminal data. Other projects' `explorer` data is preserved in the file from their last save.

   **Important implication:** `loadSessionData()` must be called inside `saveTerminalSessionsImmediate()` to load existing data before merging. Currently the function builds `projectsMap` from scratch from live terminal state, which loses any saved explorer data for projects with no active terminals. The merge pattern is needed:

   ```js
   // Load existing data to preserve explorer state for other projects
   const existingData = loadSessionData();
   // Merge existing explorer state into projectsMap
   for (const [pid, existing] of Object.entries(existingData.projects || {})) {
     if (existing.explorer && !projectsMap[pid]) {
       projectsMap[pid] = { tabs: [], activeCwd: null };
     }
     if (existing.explorer && projectsMap[pid]) {
       projectsMap[pid].explorer = existing.explorer;  // preserve from disk
     }
   }
   // Then override current project's explorer with live state
   if (currentProject && projectsMap[currentProject.id]) {
     projectsMap[currentProject.id].explorer = FileExplorer.getState();
   }
   ```

2. **What debounce timer to use in FileExplorer for saving?**
   - What we know: `saveTerminalSessions()` is already debounced at 300ms. Calling it from `toggleFolder` (which may fire on rapid expand/collapse clicks) will coalesce to one write every 300ms.
   - Recommendation: No separate debounce in FileExplorer — just call `saveTerminalSessions()` directly from `toggleFolder`, `show`, and `hide`. The existing 300ms debounce in TerminalSessionService is sufficient.

3. **Should `panelVisible` default to `true` or `false` for a project with no saved state?**
   - Recommendation: Default to `true` — the current behavior is "panel shows when a project has a path". Preserving this default means new projects (or projects that have never had saved state) continue to show the panel automatically.

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `src/renderer/ui/components/FileExplorer.js` — verified full module structure, `expandedFolders` Map shape, `manuallyHidden` flag, `setRootPath()` clear sequence, `toggleFolder()` flow, `show()`/`hide()` implementations, `getOrLoadFolder()` async pattern, `isPathSafe()` guard, `initResizer()` localStorage width pattern
- Codebase inspection: `src/renderer/services/TerminalSessionService.js` — verified Phase 4 save/load/clear pattern, atomic write, debounce, lazy require pattern, `loadSessionData()` return shape, `clearProjectSessions()` deletion
- Codebase inspection: `renderer.js` lines 1508–1519 — verified `projectsState.subscribe()` callback that calls `FileExplorer.setRootPath()`; confirmed this is the single project-switch hook
- Codebase inspection: `renderer.js` lines 162–209 — verified Phase 4 startup restore sequence and `loadSessionData()` usage; confirmed explorer restore can piggyback on existing path
- Codebase inspection: `renderer.js` `deleteProjectUI` (line 900–928) — confirmed `clearProjectSessions(projectId)` already called; no additional cleanup needed for Phase 5
- Codebase inspection: `.planning/config.json` — confirmed `workflow.nyquist_validation` is absent (false); Validation Architecture section omitted

### Secondary (MEDIUM confidence)

- Pattern inference: The merge-before-write approach (to preserve other projects' explorer state when saving only current project) is inferred from how the function currently works. The existing code does NOT load before writing — it builds from scratch. This is fine for terminal state (terminals are only active for one project at a time) but NOT for explorer state (each project has independent saved state). The merge pattern is required.

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new deps, all in existing codebase
- Architecture: HIGH — all integration points verified by reading actual source files; data flow is clear
- Pitfalls: HIGH — `manuallyHidden` persistence issue and circular dep risk verified by reading FileExplorer.js; merge-before-write requirement verified by reading TerminalSessionService.js

**Research date:** 2026-02-24
**Valid until:** 2026-03-25 (codebase stable; valid until major refactor of FileExplorer or TerminalSessionService)
