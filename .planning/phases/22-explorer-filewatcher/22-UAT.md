---
status: diagnosed
phase: 22-explorer-filewatcher
source: 22-01-SUMMARY.md, 22-02-SUMMARY.md, 22-03-SUMMARY.md
started: 2026-02-27T11:00:00Z
updated: 2026-02-27T14:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. New file appears automatically
expected: With a project open and file explorer expanded, create a new file in the project directory using an external tool. The new file should appear in the file explorer tree within ~1 second without pressing any refresh button.
result-v1: issue (blocker) — "i got multiple exceptions from filewatcher - dont spam messageboxes!"
result: pass

### 2. New folder appears automatically
expected: Create a new folder in the project directory using an external tool. The folder should appear in the file explorer tree automatically without manual refresh.
result: pass

### 3. Deleted file disappears automatically
expected: Delete a file from the project directory using an external tool. The file should disappear from the file explorer tree automatically without manual refresh.
result-v1: issue (blocker) — "on deletion of a dir: uncaught exception: error: eperm: operation not permitted, watch"
result: issue
reported: "in huge directories the performance is very very bad! Only watch what is currently visible, start a watcher if a directory is expanded, dont create watchers for every dir in every subdir"
severity: blocker

### 4. Deleted folder disappears automatically
expected: Delete a folder from the project directory using an external tool. The folder and its contents should disappear from the file explorer tree automatically. No EPERM error dialogs.
result: skipped
reason: blocked by performance issue in test 3

### 5. Expanded folders preserved during auto-update
expected: Expand several folders in the file explorer, then create or delete a file externally. After the tree updates, previously expanded folders should remain expanded.
result: skipped
reason: blocked by performance issue in test 3

### 6. Watcher follows project switch
expected: Open project A (file explorer visible), then switch to project B. Create a file externally in project B — it should appear. Create a file in project A — it should NOT appear.
result: skipped
reason: blocked by performance issue in test 3

## Summary

total: 6
passed: 2
issues: 1
pending: 0
skipped: 3

## Gaps

### Resolved (Plan 03)

- truth: "New file appears automatically without errors"
  status: fixed (Plan 03)
  test: 1

- truth: "Deleted file disappears automatically without errors"
  status: fixed (Plan 03)
  test: 3

### Open

- truth: "File watcher performs well in large directories"
  status: failed
  reason: "User reported: in huge directories the performance is very very bad! Only watch what is currently visible, start a watcher if a directory is expanded, dont create watchers for every dir in every subdir"
  severity: blocker
  test: 3
  root_cause: "chokidar.watch(projectPath) at explorer.ipc.js line 113 uses fully recursive watching (no depth limit). Every subdirectory in the project tree gets a native OS fs.watch handle at project open time — regardless of whether those directories are visible/expanded in the UI. A monorepo can consume thousands of handles instantly. No IPC mechanism exists for per-directory watch/unwatch, and toggleFolder() in FileExplorer.js has no watcher awareness."
  artifacts:
    - path: "src/main/ipc/explorer.ipc.js"
      issue: "Single recursive chokidar watcher; no depth:0; no per-directory watch/unwatch IPC handlers"
    - path: "src/main/preload.js"
      issue: "No watchDir/unwatchDir methods; explorer key duplicated (dead code bug at lines 223-228)"
    - path: "src/renderer/ui/components/FileExplorer.js"
      issue: "toggleFolder() does not call any watcher API on expand/collapse"
    - path: "renderer.js"
      issue: "Project selection calls full recursive startWatch instead of shallow root watch"
  missing:
    - "Replace single recursive chokidar watcher with Map<dirPath, FSWatcher> using depth:0 per directory"
    - "Add watchDir(dirPath) / unwatchDir(dirPath) / stopAllDirWatchers() IPC handlers"
    - "Add watchDir/unwatchDir to preload explorer namespace; remove duplicate explorer key"
    - "Wire toggleFolder() expand → watchDir, collapse → unwatchDir"
    - "Change renderer.js startWatch to watchDir for shallow root-only watch"
  debug_session: ".planning/debug/watcher-performance-recursive.md"
