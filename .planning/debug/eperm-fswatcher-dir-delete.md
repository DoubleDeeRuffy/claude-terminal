---
status: diagnosed
trigger: "on deletion of a dir: uncaught exception: error: eperm: operation not permitted, watch at fswatcher"
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:00:00Z
---

## Current Focus

hypothesis: EPERM from native FSWatcher escapes to uncaught exception because persistent:false bypasses chokidar's error listener wiring
test: trace code path for persistent:false vs persistent:true in chokidar handler.js
expecting: persistent:false skips watcher.on('error') registration
next_action: report root cause

## Symptoms

expected: Deleting a watched directory externally should be handled gracefully (silent or logged warning)
actual: Uncaught exception dialog: "error: eperm: operation not permitted, watch at fswatcher node:internal/fs/watchers:207:21"
errors: EPERM from Node.js internal FSWatcher when watched directory is deleted on Windows
reproduction: Start watching a project directory, then delete a subdirectory from Windows Explorer
started: After Phase 22 added chokidar file watcher

## Eliminated

(none)

## Evidence

- timestamp: 2026-02-27T00:01:00Z
  checked: chokidar version
  found: v4.0.3 installed
  implication: chokidar v4 has ignorePermissionErrors option (default: false)

- timestamp: 2026-02-27T00:02:00Z
  checked: explorer.ipc.js watcher options
  found: persistent:false is set, ignorePermissionErrors is NOT set (defaults to false)
  implication: Two separate issues contributing to the bug

- timestamp: 2026-02-27T00:03:00Z
  checked: chokidar handler.js createFsWatchInstance and setFsWatchListener (lines 120-198)
  found: |
    CRITICAL FINDING: When persistent:false, setFsWatchListener takes an early return path (lines 164-168)
    that creates the watcher via createFsWatchInstance and returns watcher.close.bind(watcher) immediately.
    It NEVER registers watcher.on('error', ...) handler (lines 180-198).
    The error listener is ONLY registered in the persistent:true branch (line 180).
  implication: Native FSWatcher error events have no listener and become uncaught exceptions

- timestamp: 2026-02-27T00:04:00Z
  checked: chokidar _handleError method (index.js line 533)
  found: |
    When ignorePermissionErrors:false (the default), EPERM errors are emitted via this.emit('error', error).
    But that only matters if the error reaches _handleError. The EPERM from the native watcher
    on directory deletion fires as a watcher 'error' event, which has no listener due to persistent:false.
  implication: Even the .on('error', () => {}) in explorer.ipc.js line 160 cannot catch this

- timestamp: 2026-02-27T00:05:00Z
  checked: main.js for uncaughtException handler
  found: No process.on('uncaughtException') handler exists anywhere in the codebase
  implication: Unhandled 'error' event on native FSWatcher becomes uncaught exception, Electron shows error dialog

- timestamp: 2026-02-27T00:06:00Z
  checked: chokidar handler.js EPERM workaround (lines 184-194)
  found: |
    In the persistent:true path, there IS a Windows-specific EPERM workaround:
    When EPERM fires, it tries to open(path, 'r'). If that fails (directory gone),
    it silently swallows the error (catch block does nothing). This is the exact
    fix for the known Node.js issue joyent/node#4337 - but it only runs when persistent:true.
  implication: chokidar already has the fix for this exact scenario, but persistent:false bypasses it

## Resolution

root_cause: |
  TWO combined issues cause this bug:

  1. **persistent:false bypasses chokidar's error listener** (PRIMARY CAUSE)
     In chokidar v4 handler.js, setFsWatchListener has two code paths:
     - persistent:false (line 164-168): Creates native FSWatcher, returns close function immediately.
       NO error listener is registered on the watcher.
     - persistent:true (line 170-198): Creates native FSWatcher AND registers watcher.on('error', ...)
       which includes a Windows-specific EPERM workaround (tries to open the path; if it fails,
       silently swallows the error since the path is gone).

     Since explorer.ipc.js uses persistent:false, the native FSWatcher has no error listener.
     When Windows raises EPERM on a deleted directory, Node.js treats the unhandled 'error' event
     as an uncaught exception.

  2. **ignorePermissionErrors not enabled** (SECONDARY FACTOR)
     chokidar's _handleError method (index.js line 538) would suppress EPERM/EACCES if
     ignorePermissionErrors:true, but this option is not set. However, even if set, it would
     not help because the error never reaches _handleError - it fires on the native watcher
     which has no listener.

  3. **No process-level uncaught exception handler** (NO SAFETY NET)
     main.js has no process.on('uncaughtException') handler, so Electron's default behavior
     shows an error dialog to the user.

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
