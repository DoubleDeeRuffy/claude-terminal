---
phase: 21-integrated-markdown-viewer
plan: 02
subsystem: renderer/file-tabs
tags: [markdown, file-watcher, live-reload, search, ipc, file-explorer]
dependency_graph:
  requires:
    - phase: 21-01
      provides: markdown rendering branch in openFileTab with termData.mdCleanup=null slot
  provides:
    - watch-file/unwatch-file IPC handlers with ref-counting
    - dialog.watchFile/unwatchFile/onFileChanged preload bridge
    - Live reload on file change with scroll preservation and TOC/source sync
    - Ctrl+F in-document search bar with Enter/Shift+Enter navigation
    - Double-click .md in FileExplorer opens in external editor
  affects: [TerminalManager.js, FileExplorer.js, dialog.ipc.js, preload.js]
tech_stack:
  added: []
  patterns:
    - "ref-counted file watchers: Map<filePath, {watcher, refCount}> prevents premature close when multiple tabs watch same file"
    - "300ms debounce on fs.watch events handles multi-event saves from editors like VS Code"
    - "termData.mdCleanup stores teardown closure — called in closeTerminal to prevent resource leaks"
key_files:
  created: []
  modified:
    - src/main/ipc/dialog.ipc.js
    - src/main/preload.js
    - src/renderer/ui/components/TerminalManager.js
    - src/renderer/ui/components/FileExplorer.js
key-decisions:
  - "fs.watch with persistent:false prevents the watcher from keeping the Electron process alive after all windows close"
  - "Ref-counting on fileWatchers Map allows safe sharing of one fs.watch instance across multiple markdown tabs for the same file"
  - "Scroll position saved as bodyEl.scrollTop before innerHTML update and restored after — survives DOM replacement without losing position"
  - "wrapper tabindex=-1 makes the markdown wrapper keyboard-focusable so Ctrl+F keydown fires without requiring any terminal xterm focus"
  - "Double-click handler uses ondblclick (not addEventListener) matching the pattern of onclick and oncontextmenu in the same block"
  - "getSetting in FileExplorer dblclick uses lazy require (same pattern as existing getSetting calls in that file) — no top-level import needed"

requirements-completed: [MD-VIEW-02, MD-VIEW-03]

duration: 5min
completed: 2026-02-27
tasks_completed: 2
files_modified: 4
---

# Phase 21 Plan 02: Integrated Markdown Viewer (Live Reload + Search) Summary

File watcher IPC with ref-counting, 300ms-debounced live reload with scroll/TOC/source sync, Ctrl+F in-document search bar, and double-click-to-editor for .md files in the explorer.

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-27T09:44:00Z
- **Completed:** 2026-02-27T09:48:59Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- File watcher IPC (`watch-file`/`unwatch-file`) with reference counting and `persistent:false` flag to avoid keeping the process alive
- Live reload on file change: debounced 300ms, preserves scroll position, syncs rendered body, TOC nav, and source view simultaneously
- `termData.mdCleanup` teardown closure wired — unsubscribes listener, calls `unwatchFile`, and clears debounce timer when tab closes
- Ctrl+F search bar inserted into `.md-viewer-content` with Enter (next), Shift+Enter (previous), and Escape (close) keyboard shortcuts
- Double-click `.md` in FileExplorer opens file in configured external editor via `api.dialog.openInEditor`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add file watcher IPC handlers and preload bridge** - `f825b3d6` (feat)
2. **Task 2: Wire live reload, Ctrl+F search, and double-click-to-editor** - `37b61af9` (feat)

## Files Created/Modified

- `src/main/ipc/dialog.ipc.js` - Added `fileWatchers` Map, `watch-file` and `unwatch-file` IPC handlers
- `src/main/preload.js` - Added `dialog.watchFile`, `dialog.unwatchFile`, `dialog.onFileChanged` to the dialog namespace
- `src/renderer/ui/components/TerminalManager.js` - Added file watcher wiring, live reload with scroll/TOC/source sync, Ctrl+F search bar
- `src/renderer/ui/components/FileExplorer.js` - Added `ondblclick` handler for `.md` files opening in external editor

## Decisions Made

- `persistent: false` on `fs.watch` prevents the watcher from keeping the Electron process alive after all windows close
- Ref-counting on `fileWatchers` Map: same file can be watched by multiple tabs without spawning duplicate FSWatchers
- Scroll position saved/restored as `bodyEl.scrollTop` before/after `innerHTML` replacement — survives DOM rewrite without losing position
- `wrapper.setAttribute('tabindex', '-1')` makes markdown wrapper focusable for Ctrl+F keydown without interfering with xterm
- `ondblclick` property assignment matches the existing `onclick`/`oncontextmenu` pattern in FileExplorer.js
- Lazy `require('../../state/settings.state')` inside dblclick handler matches existing getSetting call pattern in FileExplorer

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

- `src/main/ipc/dialog.ipc.js` — EXISTS, contains `watch-file` (2 occurrences)
- `src/main/preload.js` — EXISTS, contains `watchFile` and `onFileChanged` (3 occurrences)
- `src/renderer/ui/components/TerminalManager.js` — EXISTS, contains `onFileChanged`, `md-viewer-search`
- `src/renderer/ui/components/FileExplorer.js` — EXISTS, contains `ondblclick`
- Commit f825b3d6 — EXISTS (Task 1)
- Commit 37b61af9 — EXISTS (Task 2)
- `npm run build:renderer` — PASSED
- `npm test` — PASSED (281 tests, 14 suites, no regressions)

## Next Phase Readiness

- Phase 21 (Integrated Markdown Viewer) is now complete — both plans done
- Phase 20.1 (Always ScrollToEnd on Switching Tabs or Projects) can proceed next
- No blockers or concerns

---
*Phase: 21-integrated-markdown-viewer*
*Completed: 2026-02-27*
