---
phase: quick-4
plan: 01
subsystem: renderer/ui/components
tags: [ux, tabs, mouse, middle-click, terminal-manager]
dependency_graph:
  requires: []
  provides: [middle-click-tab-close]
  affects: [TerminalManager.js]
tech_stack:
  added: []
  patterns: [auxclick event, e.button === 1 guard]
key_files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js
decisions:
  - Used onauxclick (not addEventListener) to match the existing onclick/ondblclick assignment style throughout the file
  - e.button === 1 guard ensures only middle-click triggers close, not other auxclick sources
  - Applied preventDefault() to suppress browser's middle-click auto-scroll behavior
metrics:
  duration: ~5 minutes
  completed: 2026-02-25T07:49:44Z
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 4: Mouse Middle-Click Tab Close Summary

**One-liner:** Middle-click (auxclick, button 1) on any terminal tab now closes it — 6 handlers added to match browser/IDE UX convention.

## What Was Built

Added `onauxclick` event handlers to all 6 terminal tab creation sites in `TerminalManager.js`. Each handler checks `e.button === 1` (middle mouse button), calls `e.preventDefault()` to suppress browser scroll behavior, and calls the appropriate close function for that tab type.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add auxclick close to all 6 tab creation sites | e39dfc7 | src/renderer/ui/components/TerminalManager.js |

## Implementation Details

Six sites modified in `TerminalManager.js`:

| Line | Tab Type | Close Call |
|------|----------|------------|
| ~1438 | Claude terminal (with mode toggle) | `closeTerminal(id)` |
| ~1674 | Type console tab | `closeTypeConsole(id, projectIndex, typeId)` |
| ~2838 | Standard terminal tab | `closeTerminal(id)` |
| ~3008 | Standard terminal tab | `closeTerminal(id)` |
| ~3153 | File viewer tab | `closeTerminal(id)` |
| ~3349 | Claude terminal alternate (with mode toggle) | `closeTerminal(id)` |

Pattern added after each `.tab-close` onclick line:
```javascript
tab.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); closeTerminal(id); } };
```

## Verification

- `onauxclick` count in TerminalManager.js: **6** (matches all 6 tab sites)
- `npm run build:renderer` completed successfully with no errors
- Existing `onclick`, `ondblclick`, and `.tab-close` onclick behavior unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] All 6 onauxclick handlers present in TerminalManager.js
- [x] Commit e39dfc7 exists
- [x] Build succeeded (dist/renderer.bundle.js updated)
