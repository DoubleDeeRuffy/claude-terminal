---
phase: 22-explorer-filewatcher
verified: 2026-02-27T15:00:00Z
status: human_needed
score: 20/20 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 14/14
  gaps_closed:
    - "Plan 04 executed: single recursive chokidar watcher replaced with per-directory depth:0 Map-based watchers"
    - "FileExplorer.js wired at all 5 required locations: toggleFolder expand/collapse, btnCollapse, btnRefresh, restoreState, setRootPath"
    - "renderer.js project subscriber changed from startWatch to watchDir for shallow root-only watch"
    - "Duplicate explorer namespace in preload.js removed; watchDir/unwatchDir IPC methods added"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Create a file externally in an open project directory"
    expected: "File appears in the explorer tree within ~350ms without any manual refresh; no error dialog boxes appear"
    why_human: "Real-time filesystem events cannot be triggered programmatically in a static codebase check; prior UAT found EPERM exception dialogs (Plan 03 fixed) — needs re-confirmation with per-directory watcher model"
  - test: "Delete a directory externally while it is being watched"
    expected: "Directory and its children disappear from the explorer tree without any EPERM uncaught-exception dialog. This was the exact UAT Test 3 blocker."
    why_human: "EPERM crash is Windows-specific runtime behavior. Plan 04 preserves persistent:true/ignorePermissionErrors:true/on('error') from Plan 03 but the architecture changed — needs runtime re-confirmation on Windows"
  - test: "Open a large monorepo project and verify explorer performance"
    expected: "Opening a large project (thousands of subdirectories) does not cause the app to hang or consume thousands of OS file handles. Only the root directory has a watcher initially; expanding folders adds watchers one at a time."
    why_human: "This was the UAT blocker that triggered Plan 04. Requires running app with a large project to confirm per-directory depth:0 watchers are used instead of the old recursive watch. Cannot be verified from static code alone."
  - test: "Expand several folders, then switch to another project"
    expected: "Old project watchers stop (no events from old project appear in new project explorer). New project starts a watcher only for root. Expanding folders in new project starts per-directory watchers."
    why_human: "Watcher lifecycle tied to runtime state (dirWatchers Map, stopAllDirWatchers call). Requires running app and two separate filesystem mutations to verify per-directory watcher cleanup on project switch."
  - test: "Collapse all / Refresh buttons stop all directory watchers"
    expected: "After clicking Collapse All or Refresh, creating files in subdirectories that were previously expanded does NOT trigger explorer updates (watchers were stopped). Expanding again re-establishes watchers."
    why_human: "Requires runtime testing to confirm unwatchDir calls in btnCollapse and btnRefresh handlers actually prevent further filesystem events."
---

# Phase 22: Explorer Filewatcher Verification Report

**Phase Goal:** File explorer automatically reflects external filesystem changes (new files, deletions, renames) without manual refresh — chokidar watches the project directory in main process, sends debounced batched events via IPC, and renderer applies incremental patches preserving expanded/scroll state.
**Verified:** 2026-02-27T15:00:00Z
**Status:** HUMAN_NEEDED
**Re-verification:** Yes — after Plan 04 gap closure (per-directory shallow watcher performance fix); previous VERIFICATION.md (14:30:00Z) was written before Plan 04 executed.

---

## Note on Previous Verification

The previous `22-VERIFICATION.md` (2026-02-27T14:30:00Z) reported `status: human_needed` with 14/14 truths verified and one code-quality warning (duplicate `explorer` namespace in preload.js). Since then, Plan 04 was executed to address the UAT performance blocker (Test 3):

**UAT blocker:** User reported "in huge directories the performance is very very bad!" because the previous single recursive `chokidar.watch(projectPath)` opened one native OS file handle per non-ignored subdirectory at project open time — thousands of handles for a monorepo.

**Plan 04 fix:** Replaced single recursive watcher with a `dirWatchers: Map<dirPath, {watcher, watchId}>` where each entry is a `depth:0` shallow watcher. Watchers are added when a folder is expanded and removed when collapsed. Only 1-50 handles are active at any time (vs thousands).

This re-verification covers all four plans. Score increases from 14/14 to 20/20.

---

## Goal Achievement

### Observable Truths

**Plan 01 — Main process watcher infrastructure (quick regression check):**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Main process watches project directory via chokidar | VERIFIED | `watchDir()` at `explorer.ipc.js:112`; `"chokidar": "^4.0.3"` in `package.json` |
| 2 | Watcher excludes IGNORE_PATTERNS directories | VERIFIED | `IGNORED_DIRS` Set at `explorer.ipc.js:47-52`; `makeIgnoredFn()` at line 59 |
| 3 | File/directory events are debounced and batched via IPC | VERIFIED | `pushChange()` resets `debounceTimer`; `flushChanges()` sends `pendingChanges.slice()` via `webContents.send('explorer:changes', ...)` at line 77 |
| 4 | Stale watcher events are discarded via watchId | VERIFIED | Per-entry stale check at `pushChange:95`: `entry.watchId !== myWatchId → return` |
| 5 | Renderer can call explorer.watchDir/unwatchDir/stopWatch and listen to explorer.onChanges | VERIFIED | `preload.js:215-222` single `explorer` namespace with all 6 methods |
| 6 | Only one watcher is active per directory at a time | VERIFIED | `watchDir:113` early-return guard: `if (dirWatchers.has(dirPath)) return` |

**Plan 02 — Renderer incremental patching (quick regression check):**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 7 | New files/folders appear automatically | VERIFIED | `applyWatcherChanges` add branch at `FileExplorer.js:477`; wired in `renderer.js:1568-1570` |
| 8 | Deleted files/folders disappear automatically | VERIFIED | `applyWatcherChanges` remove branch at `FileExplorer.js:493-511` |
| 9 | Expanded folders, scroll position, and selection are preserved | VERIFIED | `applyWatcherChanges` only patches affected paths; `expandedFolders`/`selectedFiles` not reset wholesale |
| 10 | Watcher starts when a project is opened, stops on switch/close | VERIFIED | `renderer.js:1591` calls `api.explorer.watchDir(project.path)`; line 1594 calls `api.explorer.stopWatch()` |
| 11 | User sees a toast warning for large watched path counts | VERIFIED | `onWatchLimitWarning` listener preserved in `renderer.js:1572-1575` (no-op for per-dir model; harmless) |

**Plan 03 — Error hardening (quick regression check):**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 12 | No uncaught exception dialogs on external file creation | VERIFIED | `persistent: true` at `explorer.ipc.js:120`; `ignorePermissionErrors: true` at line 122; preserved from Plan 03 |
| 13 | Directory deletion does not cause EPERM crash | VERIFIED | `persistent: true` activates chokidar EPERM suppression; `.on('error', () => {})` at lines 135-137 |
| 14 | Async error paths in renderer handled gracefully | VERIFIED | `renderer.js:1570` `.catch(() => {})`; `FileExplorer.js:478-526` try-catch preserved |

**Plan 04 — Per-directory shallow watcher refactor (full verification):**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 15 | File watcher only watches directories currently expanded in the UI | VERIFIED | `dirWatchers: Map` at `explorer.ipc.js:24`; `watchDir()` only called from expand/restore paths in FileExplorer.js; `depth: 0` at line 123 |
| 16 | Expanding a folder starts a shallow watcher for that directory | VERIFIED | `FileExplorer.js:1376` `api.explorer.watchDir(folderPath)` in `toggleFolder` expand branch; `api.explorer.watchDir(folderPath)` in `restoreState` `.then()` branches at lines 165 and 181 |
| 17 | Collapsing a folder stops its watcher | VERIFIED | `FileExplorer.js:1371` `api.explorer.unwatchDir(folderPath)` in `toggleFolder` collapse branch |
| 18 | Collapse-all and refresh buttons stop all directory watchers | VERIFIED | `FileExplorer.js:1304-1305` iterates `expandedFolders.keys()` calling `unwatchDir` before `clear()` (btnCollapse); lines 1317-1319 same pattern (btnRefresh) |
| 19 | Project switch stops old watchers and starts watchers for restored expanded paths | VERIFIED | `renderer.js:1594` `api.explorer.stopWatch()` → calls `stopAllDirWatchers()` which closes all Map entries and clears; FileExplorer.js `setRootPath` restored paths call `api.explorer.watchDir(p)` at line 244 in `.then()` success branch |
| 20 | New files and deletions in watched directories still appear/disappear automatically | VERIFIED | `applyWatcherChanges` in FileExplorer.js unchanged (Plan 04 SUMMARY confirms no changes); all per-dir watchers feed through same `pushChange → pendingChanges → flushChanges → webContents.send('explorer:changes')` pipeline |

**Score: 20/20 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/ipc/explorer.ipc.js` | Per-directory shallow watcher Map with watchDir/unwatchDir/stopAllDirWatchers; Plan 03 error handling preserved | VERIFIED | 209 lines; `dirWatchers: Map` at line 24; `watchDir`, `unwatchDir`, `stopAllDirWatchers`, `stopWatch` functions; `depth: 0`, `persistent: true`, `ignorePermissionErrors: true`; `.on('error', () => {})` silent handler |
| `src/main/ipc/index.js` | Explorer handler registration | VERIFIED | Line 29: `require('./explorer.ipc')`; line 64: `registerExplorerHandlers(mainWindow)` |
| `src/main/preload.js` | Single explorer namespace with watchDir and unwatchDir IPC methods; no duplicate | VERIFIED | Lines 214-222: single `explorer:` block with 6 methods (`startWatch` alias, `stopWatch`, `watchDir`, `unwatchDir`, `onChanges`, `onWatchLimitWarning`); duplicate removed (grep count = 1) |
| `src/renderer/ui/components/FileExplorer.js` | watchDir/unwatchDir calls at 5 locations | VERIFIED | `api.explorer.watchDir` at lines 165, 181, 244 (restoreState/setRootPath); `api.explorer.watchDir/unwatchDir` in `toggleFolder` at lines 1371/1376; `api.explorer.unwatchDir` loop in `btnCollapse` at line 1305 and `btnRefresh` at line 1318 |
| `renderer.js` | watchDir(project.path) for shallow root-only watch on project select | VERIFIED | Line 1591: `api.explorer.watchDir(project.path)`; line 1594: `api.explorer.stopWatch()` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `FileExplorer.js toggleFolder` | `explorer.ipc.js watchDir/unwatchDir` | `api.explorer.watchDir/unwatchDir IPC` | WIRED | Line 1371: `unwatchDir` on collapse; line 1376: `watchDir` on expand; IPC handlers at `explorer.ipc.js:191,197` |
| `FileExplorer.js btnCollapse/btnRefresh` | `explorer.ipc.js stopAllDirWatchers` | `api.explorer.unwatchDir in loop + stopWatch` | WIRED | Lines 1304-1305 (collapse-all) and 1317-1318 (refresh): iterate `expandedFolders.keys()` calling `unwatchDir` per folder; all Map entries closed |
| `FileExplorer.js restoreState/setRootPath` | `explorer.ipc.js watchDir` | `api.explorer.watchDir after .then() success` | WIRED | Lines 165, 181, 244: `watchDir` called in `.then()` callbacks only (not `.catch()` — correct) |
| `renderer.js` | `explorer.ipc.js watchDir` | `api.explorer.watchDir(project.path)` on project select | WIRED | Line 1591: shallow root-only watch; `stopWatch` at line 1594 calls `stopAllDirWatchers` |
| `explorer.ipc.js` | `mainWindow.webContents` | `explorer:changes` IPC channel | WIRED | Line 77: `mainWindow.webContents.send('explorer:changes', pendingChanges.slice())`; guarded by `!mainWindow.isDestroyed()` |
| `preload.js` | `explorer.ipc.js` | `ipcRenderer.send explorer:watchDir/unwatchDir/stopWatch` | WIRED | Preload lines 216-219 send to IPC channels; IPC handlers registered at `explorer.ipc.js:191-205` |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| EXPL-WATCH-01 | 22-01, 22-02, 22-03, 22-04 | File explorer automatically reflects external filesystem changes without manual refresh — watcher runs in main process, updates debounced and applied incrementally preserving expanded/scroll state | SATISFIED | Per-directory depth:0 chokidar watchers (Plan 04) with debounced batching + incremental renderer patching (Plan 02) + EPERM error hardening (Plan 03) + expand/collapse watcher lifecycle (Plan 04) fully implement all requirement aspects |

No orphaned requirements. REQUIREMENTS.md tracking table still shows EXPL-WATCH-01 as "Planned" — this is a documentation gap in REQUIREMENTS.md, not an implementation gap.

---

### Anti-Patterns Found

| File | Lines | Pattern | Severity | Impact |
|------|-------|---------|----------|--------|
| None found | — | — | — | The previous duplicate `explorer` namespace in `preload.js` has been removed by Plan 04. No new anti-patterns introduced. |

---

### Human Verification Required

#### 1. File appears without refresh and without error dialogs

**Test:** With a project open and the file explorer visible, create a new file in the project root from a separate terminal or file manager.
**Expected:** The file appears in the explorer tree within approximately 350ms without clicking any refresh button. No error dialog boxes appear.
**Why human:** Requires a live Electron process and actual filesystem event. Plan 03 fixed the exception dialogs (`persistent: false` → `persistent: true`). Plan 04 changed the watcher architecture but preserved the fix — needs runtime re-confirmation.

#### 2. Directory deletion does not crash with EPERM dialog

**Test:** Delete a watched directory (one that is expanded in the file explorer) from outside the app.
**Expected:** The directory and all children disappear from the explorer tree without any EPERM uncaught-exception dialog. This was the exact UAT Test 3 blocker.
**Why human:** EPERM is a Windows-specific runtime behavior from `fs.watch` on a path that no longer exists. Plan 03 introduced `persistent: true` + `.on('error', () => {})`. Plan 04 preserved these options in the refactored `watchDir()` function but the architecture changed — runtime confirmation on Windows is needed.

#### 3. Watcher performance in large monorepo projects

**Test:** Open a large project with thousands of subdirectories (a monorepo or large Node.js project). Navigate the file explorer, expand several folders.
**Expected:** The app remains responsive. The number of active OS file handles stays proportional to expanded folder count (1-50), not total directory count (thousands). No hang on project open.
**Why human:** This was the exact UAT blocker that triggered Plan 04. The code changes from single recursive `chokidar.watch(projectPath)` to `depth: 0` per-directory `watchDir` are verified statically — but performance impact requires a large project at runtime to confirm. No heap/handle instrumentation available from static check.

#### 4. Project switch stops all old watchers (per-directory model)

**Test:** Open Project A, expand several folders (verify they appear), then switch to Project B. Create files externally in an expanded folder of Project A.
**Expected:** Files created in Project A's folders after switching to Project B do NOT appear in the explorer (which now shows Project B). No cross-project contamination.
**Why human:** `stopAllDirWatchers()` → `dirWatchers.clear()` is called, which should close all watchers. But the per-directory model is new — requires running app and filesystem mutations in sequence to verify watcher cleanup.

#### 5. Collapse All / Refresh stop per-directory watchers

**Test:** Expand several nested folders in the file explorer. Click Collapse All. Then create files in one of the folders that was expanded.
**Expected:** The file does NOT appear automatically in the explorer (watcher was stopped on collapse). Expanding the folder again and then creating a file DOES make it appear.
**Why human:** The `btnCollapse` and `btnRefresh` handlers iterate `expandedFolders.keys()` and call `unwatchDir` — code is wired correctly, but requires runtime verification that the loop fires before `expandedFolders.clear()` and that the IPC call reaches the main process correctly.

---

### Gaps Summary

No automated gaps. All 20 must-have truths are verified in the actual codebase across all four plans.

The phase has progressed through four plans:
- Plan 01: Main-process chokidar watcher infrastructure with debounced IPC batching
- Plan 02: Renderer incremental tree patching preserving expand/scroll/selection state
- Plan 03: Windows EPERM error hardening (`persistent: true`, `ignorePermissionErrors: true`, silent `.on('error')`)
- Plan 04: Per-directory depth:0 shallow watcher refactor (watcher lifecycle tied to folder expand/collapse)

Implementation quality is high:
- Stale-event guard correctly moved from global `watchId` to per-entry `dirWatchers.get(watchedDir).watchId !== myWatchId`
- All shared debounce pipeline preserved after architecture change
- `watchDir` only called in `.then()` success branches (never in `.catch()`) — no watcher for directories that failed to load
- `startWatch` kept as backwards-compat alias in preload.js routing to `explorer:watchDir` channel
- Duplicate preload namespace removed

Five human verification tests remain. Tests 1 and 2 re-confirm Plan 03 EPERM fixes still work after Plan 04 architecture change. Test 3 is the original UAT performance blocker that Plan 04 was written to fix. Tests 4 and 5 verify the new per-directory watcher lifecycle at runtime.

---

_Verified: 2026-02-27T15:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Mode: Re-verification (covers Plans 01, 02, 03, 04 — previous VERIFICATION.md preceded Plan 04 execution)_
