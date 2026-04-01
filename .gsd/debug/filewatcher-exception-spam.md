---
status: diagnosed
trigger: "multiple exceptions from filewatcher - dont spam messageboxes"
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Two root causes identified
test: Code analysis of chokidar v4 internals + explorer.ipc.js configuration
expecting: N/A - diagnosis complete
next_action: Report findings

## Symptoms

expected: File watcher silently updates the file explorer tree
actual: Multiple exception message boxes spam the user
errors: Multiple exceptions from filewatcher
reproduction: File watcher detects changes in a project directory (especially on Windows with EPERM scenarios)
started: After Phase 22 added chokidar file watcher

## Eliminated

- hypothesis: chokidar-level error handler missing
  evidence: Line 160-162 of explorer.ipc.js has `.on('error', () => {})` - chokidar-level errors are swallowed
  timestamp: 2026-02-27

- hypothesis: chokidar close() unhandled promise rejection
  evidence: Tested double-close - both resolve cleanly
  timestamp: 2026-02-27

- hypothesis: path format mismatch (forward vs backslash)
  evidence: Tested chokidar v4.0.3 on Windows - returns proper backslash paths
  timestamp: 2026-02-27

- hypothesis: readDirectoryAsync throws uncaught
  evidence: Function has full try-catch wrapper returning [] on any error (lines 397-448)
  timestamp: 2026-02-27

- hypothesis: awaitWriteFinish stat errors bubble uncaught
  evidence: AWF stat errors go through awfEmit -> EVENTS.ERROR -> caught by .on('error') handler
  timestamp: 2026-02-27

## Evidence

- timestamp: 2026-02-27
  checked: explorer.ipc.js chokidar configuration
  found: `persistent: false` set at line 115
  implication: Triggers a different code path in chokidar's handler.js

- timestamp: 2026-02-27
  checked: chokidar/handler.js setFsWatchListener (lines 160-198)
  found: When persistent:false (line 164), native fs.watch watcher is created but NO .on('error') handler is attached (line 168 returns immediately). When persistent:true (line 175+), watcher.on(EV.ERROR, ...) IS attached at line 180.
  implication: Native fs.watch 'error' events are UNHANDLED in non-persistent mode

- timestamp: 2026-02-27
  checked: Node.js EventEmitter behavior
  found: An EventEmitter that emits 'error' without a listener throws the error as uncaught exception
  implication: Native fs.watch errors crash the process

- timestamp: 2026-02-27
  checked: Electron 28.3.3 uncaught exception behavior
  found: Electron's main process shows dialog.showErrorBox() for uncaught exceptions by default
  implication: Each fs.watch error = one message box shown to user

- timestamp: 2026-02-27
  checked: renderer.js onChanges callback (line 1569-1571)
  found: `FileExplorer.applyWatcherChanges(changes)` called without await or .catch()
  implication: Any rejection from the async function is an unhandled promise rejection in renderer

- timestamp: 2026-02-27
  checked: chokidar _handleError (index.js line 533-542)
  found: EPERM and EACCES are NOT silently swallowed unless ignorePermissionErrors option is set (which it is NOT in explorer.ipc.js)
  implication: Permission errors are emitted as error events

## Resolution

root_cause: |
  PRIMARY: chokidar v4 bug/behavior with persistent:false — native fs.watch error handlers not attached.
  In chokidar/handler.js setFsWatchListener(), when options.persistent is false (line 164),
  the native fs.watch instance is created but returned without an .on('error') handler.
  When persistent:true, line 180 attaches watcher.on(EV.ERROR, ...).
  This means native fs.watch 'error' events (EPERM, EACCES on Windows) become
  uncaught exceptions in the main process. Electron shows dialog.showErrorBox() for each.

  SECONDARY: renderer.js line 1570 calls async applyWatcherChanges() without .catch(),
  creating unhandled promise rejections in the renderer process.

fix:
verification:
files_changed: []
