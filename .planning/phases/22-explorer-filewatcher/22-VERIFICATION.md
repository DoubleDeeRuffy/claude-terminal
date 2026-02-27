---
phase: 22-explorer-filewatcher
verified: 2026-02-27T11:30:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
human_verification:
  - test: "Create a file externally in an open project directory"
    expected: "File appears in the explorer tree within ~350ms without any manual refresh"
    why_human: "Real-time filesystem events cannot be triggered programmatically in a static codebase check"
  - test: "Delete a file externally in an open project directory"
    expected: "File disappears from explorer tree within ~350ms; expanded folders, scroll position, and selection for unaffected entries remain intact"
    why_human: "Requires live Electron process and actual filesystem mutation to observe"
  - test: "Switch between two projects"
    expected: "Old watcher stops (no events from the previous project appear); new watcher starts for the newly selected project"
    why_human: "Watcher lifecycle is tied to runtime state; requires running app to verify"
---

# Phase 22: Explorer Filewatcher Verification Report

**Phase Goal:** Add file system watching to the integrated file explorer so it automatically reflects external changes (new files, deletions, renames) without requiring manual refresh. The explorer tree stays in sync with the actual filesystem at all times.
**Verified:** 2026-02-27T11:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

**Plan 01 truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Main process can watch a project directory recursively via chokidar | VERIFIED | `chokidar.watch(projectPath, ...)` in `explorer.ipc.js:113`; `chokidar: "^4.0.3"` in `package.json:66` |
| 2 | Watcher excludes IGNORE_PATTERNS directories (node_modules, .git, etc.) | VERIFIED | `IGNORED_DIRS` Set at `explorer.ipc.js:42-47`, `makeIgnoredFn()` at line 54 splits on `[\\/]` and checks all segments |
| 3 | File/directory add and remove events are debounced and batched into a single IPC message | VERIFIED | `pushChange()` clears/resets `debounceTimer` each call; `flushChanges()` sends entire `pendingChanges` array via `webContents.send('explorer:changes', pendingChanges.slice())` at line 74 |
| 4 | Only one watcher is active at a time — startWatch stops the previous watcher | VERIFIED | `startWatch()` calls `stopWatch()` as its first line (`explorer.ipc.js:109`) |
| 5 | Stale watcher events from a previous project are discarded via watchId | VERIFIED | `watchId` incremented in `stopWatch()` (line 88); `myWatchId` captured at startWatch entry (line 111); both `pushChange` (line 131) and `flushChanges` (line 70) check `myWatchId !== watchId` and return if stale |
| 6 | Renderer can call explorer.startWatch/stopWatch and listen to explorer.onChanges via preload bridge | VERIFIED | `preload.js:212-216` exposes `explorer` namespace with `startWatch`, `stopWatch`, `onChanges`, `onWatchLimitWarning` using `ipcRenderer.send` and `createListener` |

**Plan 02 truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 7 | File explorer automatically shows new files/folders created externally without manual refresh | VERIFIED | `applyWatcherChanges` at `FileExplorer.js:477`; add branch re-reads parent via `readDirectoryAsync` and calls `render()`; wired in `renderer.js:1569-1570` |
| 8 | File explorer automatically removes deleted files/folders without manual refresh | VERIFIED | remove branch at `FileExplorer.js:492-510` filters `entry.children`, cascades `expandedFolders` deletion for directories, cleans selection state; calls `render()` at line 522 |
| 9 | Expanded folders, scroll position, and selection remain intact during automatic updates | VERIFIED | `applyWatcherChanges` only touches affected parent dirs (add) or filters children and cascades deletes (remove); does NOT reset `expandedFolders` wholesale; `selectedFiles` / `lastSelectedFile` only mutated for the specific deleted path |
| 10 | Watcher starts when a project is opened and stops when project switches or closes | VERIFIED | `renderer.js:1589` calls `api.explorer.startWatch(project.path)` after `setRootPath`; `renderer.js:1592` calls `api.explorer.stopWatch()` in the else branch; `startWatch` itself always calls `stopWatch` first so switching projects correctly stops the previous watcher |
| 11 | User sees a toast warning if the project has too many watched paths | VERIFIED | `explorer.ipc.js:150-157` sends `explorer:watchLimitWarning` when `totalPaths > SOFT_LIMIT`; `renderer.js:1573-1575` calls `showToast({ type: 'warning', title: t('fileExplorer.title'), message: t('fileExplorer.watchLimitWarning', { count: totalPaths }) })`; i18n keys confirmed in both `en.json:781` and `fr.json:123` |

**Score: 11/11 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/ipc/explorer.ipc.js` | Chokidar watcher lifecycle, debounced event batching, IPC handlers | VERIFIED | 188 lines; exports `registerExplorerHandlers` and `stopWatch`; substantive implementation with IGNORED_DIRS, makeIgnoredFn, pushChange, flushChanges, startWatch, stopWatch, registerExplorerHandlers |
| `src/main/ipc/index.js` | Explorer handler registration | VERIFIED | Line 29: `const { registerExplorerHandlers } = require('./explorer.ipc')`; Line 64: `registerExplorerHandlers(mainWindow)` |
| `src/main/preload.js` | explorer namespace in electron_api | VERIFIED | Lines 212-216: full `explorer` namespace with all 4 methods |
| `src/renderer/ui/components/FileExplorer.js` | applyWatcherChanges function for incremental tree patching | VERIFIED | Lines 477-523; exported in `module.exports` at line 1424; substantive: handles add (re-reads parent) and remove (filters children, cascades dir deletes, cleans selection); single `render()` call |
| `renderer.js` | Watcher lifecycle wiring in project-switch subscriber and onChanges listener | VERIFIED | Lines 1568-1593: FILE WATCHER section with one-time `onChanges`/`onWatchLimitWarning` listeners registered before `projectsState.subscribe`; `startWatch`/`stopWatch` inside subscribe block |
| `src/renderer/i18n/locales/en.json` | i18n key for watch limit warning | VERIFIED | Line 781: `"watchLimitWarning": "Large project: watching {count} paths. Explorer auto-refresh may be slower."` under `fileExplorer` namespace |
| `src/renderer/i18n/locales/fr.json` | French i18n key for watch limit warning | VERIFIED | Line 123: proper UTF-8 French text with accented characters (`surveillés`, `L'actualisation`) under `fileExplorer` namespace |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `explorer.ipc.js` | `mainWindow.webContents.send` | `explorer:changes` IPC channel | WIRED | Line 74: `mainWindow.webContents.send('explorer:changes', pendingChanges.slice())` — sends non-empty array only |
| `preload.js` | `explorer.ipc.js` | `ipcRenderer.send explorer:startWatch/stopWatch` | WIRED | Lines 213-214 send to IPC channels; `ipcMain.on('explorer:startWatch', ...)` at `explorer.ipc.js:176` receives them |
| `renderer.js` | `FileExplorer.js` | `FileExplorer.applyWatcherChanges` called from onChanges listener | WIRED | `renderer.js:1570`: `FileExplorer.applyWatcherChanges(changes)` inside `api.explorer.onChanges` callback |
| `renderer.js` | `src/main/preload.js` | `api.explorer.startWatch` in project-switch subscriber | WIRED | `renderer.js:1589`: `api.explorer.startWatch(project.path)` and line 1592: `api.explorer.stopWatch()` |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| EXPL-WATCH-01 | 22-01, 22-02 | File explorer automatically reflects external filesystem changes (new files, deletions, renames) without manual refresh — watcher runs in main process, updates are debounced and applied incrementally preserving expanded/scroll state | SATISFIED | Main-process chokidar watcher (Plan 01) with debounced batching + incremental renderer patching (Plan 02) fully implement all requirements; `expandedFolders` and `selectedFiles` state preservation confirmed in `applyWatcherChanges` |

No orphaned requirements found — EXPL-WATCH-01 is claimed by both plans and has implementation evidence.

---

### Anti-Patterns Found

No anti-patterns detected:

- No TODO/FIXME/PLACEHOLDER comments in new files
- No stub returns (`return null`, `return {}`, `return []`)
- No empty event handlers — all four chokidar events (`add`, `addDir`, `unlink`, `unlinkDir`) route to substantive `pushChange` calls
- No console-log-only implementations

---

### Implementation Quality Notes

These are notable design decisions that are correctly implemented (not gaps):

1. **Stale-event guard (watchId):** The `watchId` integer pattern is correctly applied at three layers — `pushChange` (prevents enqueueing stale events), `flushChanges` (prevents sending a batch from a closed watcher), and `startWatch`'s `ready` handler (prevents spurious soft-limit warnings). This is exactly the pattern specified in the plan.

2. **path.sep prefix guard:** `change.path + path.sep` at `FileExplorer.js:500` correctly prevents false matches where e.g. `/project/src` would otherwise match `/project/src-old` in the `startsWith` check.

3. **Copy-before-iterate:** `[...expandedFolders.keys()]` at line 501 safely copies the key list before iterating and deleting during the same loop.

4. **One-time listener registration:** `api.explorer.onChanges` and `api.explorer.onWatchLimitWarning` are registered BEFORE `projectsState.subscribe` (lines 1568-1575 vs 1577), preventing duplicate listener accumulation on every project switch.

5. **i18n namespace deviation corrected:** Plan 02 specified `explorer.watchLimitWarning` but the agent correctly adapted to `fileExplorer.watchLimitWarning` matching the actual JSON namespace structure. The `fileExplorer.title` key (line 757 of en.json) also exists and is used in the toast call.

---

### Human Verification Required

#### 1. File appears without refresh

**Test:** With a project open in the explorer, create a new file in the project root from a separate terminal or file manager.
**Expected:** The file appears in the explorer tree within approximately 350ms without clicking any refresh button.
**Why human:** Requires a live Electron process and an actual filesystem event; cannot be simulated via static code analysis.

#### 2. File disappears without refresh

**Test:** Delete an existing file in an open project directory from outside the app.
**Expected:** The file disappears from the explorer tree within approximately 350ms. Other expanded folders, scroll position, and any file selection on unaffected files remain unchanged.
**Why human:** Same reason as above; also verifies the incremental patch preserves UI state rather than a full re-render.

#### 3. Project switch stops old watcher

**Test:** Open Project A, create files in it externally (verify they appear), then switch to Project B. Create files in Project A's directory.
**Expected:** Files created in Project A's directory after switching to Project B do NOT appear in the explorer (which now shows Project B's tree). No cross-project contamination.
**Why human:** Requires running app and two separate filesystem mutations in sequence to verify the watchId invalidation works end-to-end at runtime.

---

### Gaps Summary

No gaps. All 11 must-have truths verified. All 7 artifacts confirmed to be substantive (not stubs) and wired into the live call chain. Requirement EXPL-WATCH-01 is fully satisfied. The only items outstanding are 3 human verification tests that require a running Electron app, which is expected for real-time filesystem behavior.

---

_Verified: 2026-02-27T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
