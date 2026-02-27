---
phase: 22-explorer-filewatcher
plan: 02
subsystem: ui
tags: [chokidar, file-watcher, ipc, electron, filewatcher, explorer, renderer, i18n]

# Dependency graph
requires:
  - phase: 22-explorer-filewatcher (Plan 01)
    provides: "Chokidar watcher service with explorer:startWatch, explorer:stopWatch, explorer:changes, explorer:watchLimitWarning IPC events and preload bridge"
provides:
  - Incremental tree patch function applyWatcherChanges in FileExplorer.js
  - Watcher lifecycle wiring in renderer.js project-switch subscriber (startWatch on project open, stopWatch on deselect)
  - One-time push-event listeners for explorer:changes and explorer:watchLimitWarning
  - i18n keys fileExplorer.watchLimitWarning in en.json and fr.json
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Incremental patch over full re-render: applyWatcherChanges only touches affected parent dirs, not the whole tree"
    - "path.sep prefix guard in startsWith prevents false matches (e.g. /project/src vs /project/src-old)"
    - "Copy-before-iterate pattern for expandedFolders.keys() — avoids mutation-during-iteration"
    - "One-time listener registration before subscribe loop — prevents duplicate listeners on re-renders"

key-files:
  created: []
  modified:
    - src/renderer/ui/components/FileExplorer.js
    - renderer.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json

key-decisions:
  - "i18n key is fileExplorer.watchLimitWarning (not explorer.watchLimitWarning) — JSON uses fileExplorer namespace, not explorer"
  - "showToast takes {type, title, message} object — used fileExplorer.title as title and watchLimitWarning as message"
  - "onChanges and onWatchLimitWarning registered once before projectsState.subscribe — prevents duplicate listener accumulation on project switches"
  - "For add changes: re-read parent via readDirectoryAsync to get correctly sorted children with stats"
  - "For remove changes: filter children array directly (cheaper than re-reading disk); cascade delete sub-dirs from expandedFolders"

patterns-established:
  - "applyWatcherChanges incremental patch: add -> re-read parent; remove -> filter children + cascade expandedFolders delete"

requirements-completed: [EXPL-WATCH-01]

# Metrics
duration: 8min
completed: 2026-02-27
---

# Phase 22 Plan 02: Explorer Filewatcher — Renderer Wiring Summary

**Incremental tree-patch function applyWatcherChanges wired to chokidar watcher via renderer.js project-switch subscriber, with soft-limit warning toast and EN/FR i18n keys**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-27T10:43:00Z
- **Completed:** 2026-02-27T10:50:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `applyWatcherChanges(changes)` to FileExplorer.js — incrementally patches the expanded-folder tree for `add` and `remove` events without full re-render
- Wired `api.explorer.onChanges` and `api.explorer.onWatchLimitWarning` one-time listeners before project-switch subscriber in renderer.js
- Added `api.explorer.startWatch(project.path)` and `api.explorer.stopWatch()` to the project-switch subscriber so watcher lifecycle follows active project
- Added `fileExplorer.watchLimitWarning` i18n key in both `en.json` and `fr.json` with `{count}` interpolation; French uses proper UTF-8 accented characters

## Task Commits

Each task was committed atomically:

1. **Task 1: Add applyWatcherChanges to FileExplorer.js** - `d19057bf` (feat)
2. **Task 2: Wire watcher lifecycle in renderer.js and add i18n keys** - `406f16d8` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `src/renderer/ui/components/FileExplorer.js` — Added: `applyWatcherChanges` function and export in module.exports
- `renderer.js` — Added: FILE WATCHER section with `onChanges`/`onWatchLimitWarning` listeners; `startWatch`/`stopWatch` in project-switch subscriber
- `src/renderer/i18n/locales/en.json` — Added: `fileExplorer.watchLimitWarning` key
- `src/renderer/i18n/locales/fr.json` — Added: `fileExplorer.watchLimitWarning` key (French, proper UTF-8)

## Decisions Made

- **i18n namespace is `fileExplorer`, not `explorer`:** The JSON locale files use `fileExplorer` as the top-level key (matching the component name), not a generic `explorer` key. The plan's `explorer.watchLimitWarning` reference was adapted to `fileExplorer.watchLimitWarning` to match actual JSON structure.
- **`showToast` object API:** `showToast` in renderer.js takes `{type, title, message}` — used `t('fileExplorer.title')` as toast title and `t('fileExplorer.watchLimitWarning', { count })` as message body.
- **One-time listener placement:** `onChanges` and `onWatchLimitWarning` registered once before the `projectsState.subscribe` block — avoids accumulating duplicate listeners on every project switch.
- **Re-read for add, filter for remove:** Additions re-read the parent dir via `readDirectoryAsync` to get correctly sorted children with full stat data; removals directly filter the children array without disk I/O (cheaper, sufficient).
- **`path.sep` in startsWith:** Prevents false matches when a deleted directory path is a prefix of another (`/project/src` vs `/project/src-old`).

## Deviations from Plan

**1. [Rule 1 - Bug] Corrected i18n key from `explorer.watchLimitWarning` to `fileExplorer.watchLimitWarning`**
- **Found during:** Task 2 (adding i18n keys)
- **Issue:** Plan specified key path `explorer.watchLimitWarning`, but the locale JSON files use `fileExplorer` as the namespace — there is no top-level `explorer` key. Using the plan's key would cause a `[i18n] Missing translation: explorer.watchLimitWarning` console warning at runtime.
- **Fix:** Added key under the existing `fileExplorer` section in both JSON files; updated `t()` call in renderer.js to `t('fileExplorer.watchLimitWarning', ...)`.
- **Files modified:** `src/renderer/i18n/locales/en.json`, `src/renderer/i18n/locales/fr.json`, `renderer.js`
- **Verification:** `node -e "require('./src/renderer/i18n/locales/en.json').fileExplorer.watchLimitWarning"` returns the string
- **Committed in:** `406f16d8` (Task 2 commit)

**2. [Rule 1 - Bug] Used correct `showToast` object API**
- **Found during:** Task 2 (wiring onWatchLimitWarning)
- **Issue:** Plan showed `showToast(message, type)` with positional args, but the `showToast` function in renderer.js takes a single options object `{type, title, message}`.
- **Fix:** Called `showToast({ type: 'warning', title: t('fileExplorer.title'), message: t('fileExplorer.watchLimitWarning', { count: totalPaths }) })`.
- **Files modified:** `renderer.js`
- **Verification:** Build passes, no type errors
- **Committed in:** `406f16d8` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs in plan spec vs actual code API)
**Impact on plan:** Both corrections necessary for runtime correctness. No scope creep — behaviour matches plan intent exactly.

## Issues Encountered

None — both corrections were straightforward adaptations from plan spec to actual codebase API.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 22 is now complete: main-process chokidar watcher (Plan 01) + renderer wiring (Plan 02)
- File explorer automatically reflects external filesystem changes: new files/folders appear, deleted ones disappear without manual refresh
- Expanded folders, scroll position, and selection state are preserved during automatic updates
- Watcher lifecycle is tied to the active project (startWatch on switch, stopWatch on deselect)
- All 281 tests pass; `npm run build:renderer` succeeds

## Self-Check: PASSED

- `src/renderer/ui/components/FileExplorer.js` — FOUND
- `renderer.js` — FOUND
- `src/renderer/i18n/locales/en.json` — FOUND
- `src/renderer/i18n/locales/fr.json` — FOUND
- Commit `d19057bf` — FOUND
- Commit `406f16d8` — FOUND

---
*Phase: 22-explorer-filewatcher*
*Completed: 2026-02-27*
