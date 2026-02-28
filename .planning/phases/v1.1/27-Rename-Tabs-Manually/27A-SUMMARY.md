---
phase: 27
plan: 27A
subsystem: renderer/tabs
tags: [context-menu, tabs, ux]
key-files:
  created: []
  modified:
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
    - src/renderer/ui/components/TerminalManager.js
decisions:
  - Used closeTerminal() for all tab types since it internally delegates to closeTypeConsole for console tabs and handles file tabs
metrics:
  duration: 2m 17s
  completed: "2026-02-28T11:48:34Z"
  tasks: 2
  files: 3
---

# Phase 27 Plan A: Tab Context Menu Summary

Right-click context menu on all tab types with Rename, Close, Close Others, and Close Tabs to Right actions.

## What Was Done

### Task 1: i18n Keys
Added `"tabs"` section to both `en.json` and `fr.json` locale files with 4 keys: rename, close, closeOthers, closeToRight.

### Task 2: Tab Context Menu Implementation
1. **Import**: Added `showContextMenu` import from `ContextMenu.js`
2. **Function**: Created `showTabContextMenu(e, id)` that builds a 4-item context menu using the existing `showContextMenu` infrastructure
3. **Wiring**: Added `tab.oncontextmenu` handler to all 6 tab creation sites in TerminalManager.js

The function uses DOM ordering to determine tab positions for Close Others and Close Tabs to Right. Both actions are disabled when not applicable (single tab / last tab).

## Deviations from Plan

### Minor Adjustment
The plan suggested using a separate `closeFileTab` function, but no such function exists. `closeTerminal()` already handles all tab types internally (it delegates to `closeTypeConsole` for console types and handles file tabs with markdown cleanup). Used `closeTerminal()` universally instead.

## Verification Results
- `npm run build:renderer` -- PASS
- `npm test` -- 42 suites, 843 tests PASS
- `showTabContextMenu` occurrences: 7 (1 definition + 6 call sites)
- `closeOthers` in en.json: 1
- `closeOthers` in fr.json: 1
- ContextMenu import present: YES

## Commits
| Hash | Message |
|------|---------|
| 7ab25e7d | feat(27-27A): add tab context menu i18n keys |
| 2fe040d0 | feat(27-27A): add right-click context menu to all tab types |
