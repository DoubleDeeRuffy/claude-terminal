---
phase: 03-new-terminal-button
plan: 01
subsystem: terminal-ui
tags: [terminal, ui, button, click-handler]
dependency_graph:
  requires: []
  provides: [new-terminal-button]
  affects: [index.html, renderer.js, styles/terminal.css]
tech_stack:
  added: []
  patterns: [filter-bar-icon-button, projectsState-onclick-handler]
key_files:
  created: []
  modified:
    - index.html
    - renderer.js
    - styles/terminal.css
decisions:
  - Button placed between project name span and filter-git-actions to preserve right-alignment via margin-left:auto
  - Handler uses createTerminalForProject() not TerminalManager.createTerminal() to respect skipPermissions setting
metrics:
  duration: ~2 minutes
  completed: 2026-02-24
  tasks_completed: 2
  files_modified: 3
---

# Phase 3 Plan 01: New Terminal Button Summary

**One-liner:** "+" click button in terminals-filter bar wired to createTerminalForProject() via projectsState selection lookup.

## What Was Built

A compact "+" icon button (`btn-new-terminal`) inserted into the `terminals-filter` div in `index.html`, positioned immediately after the project name badge and before the git actions group. The button inherits the show/hide behavior of `terminals-filter` (hidden when no project is selected). A click handler in `renderer.js` reads the current `selectedProjectFilter` from `projectsState` and calls `createTerminalForProject()` — the same code path as Ctrl+T.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add "+" button HTML and CSS | ab94c79 | index.html, styles/terminal.css |
| 2 | Wire click handler in renderer.js | 5603af0 | renderer.js |

## Verification Results

1. `grep -c "btn-new-terminal" index.html` = 1 (button element exists)
2. `grep -c "filter-new-terminal-btn" styles/terminal.css` = 3 (base, hover, svg rules)
3. `grep -c "btn-new-terminal" renderer.js` = 1 (handler wired)
4. `createTerminalForProject(projects[selectedFilter])` confirmed in handler
5. Button is between `filter-project-name` span and `filter-git-actions` div (right-alignment preserved)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] index.html modified with btn-new-terminal button
- [x] styles/terminal.css modified with .filter-new-terminal-btn rules (3 rule blocks)
- [x] renderer.js modified with onclick handler
- [x] Commits ab94c79 and 5603af0 exist in git log
