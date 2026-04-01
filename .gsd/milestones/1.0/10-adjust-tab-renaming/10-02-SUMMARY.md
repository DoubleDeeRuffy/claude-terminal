---
phase: 10-adjust-tab-renaming
plan: "02"
subsystem: settings-ui, terminal-manager, i18n
tags: [gap-closure, settings, tab-rename, osc-title, i18n]
dependency_graph:
  requires: [10-01]
  provides: [TAB-RENAME-01]
  affects: [SettingsPanel, TerminalManager, i18n]
tech_stack:
  added: []
  patterns: [lazy-getSetting-guard, module-exports-addition, settings-group-placement]
key_files:
  modified:
    - src/renderer/ui/panels/SettingsPanel.js
    - src/renderer/ui/components/TerminalManager.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
decisions:
  - "Use module-level getSetting (already imported) instead of lazy require in shouldSkipOscRename — no circular dep risk, getSetting is already in scope"
  - "Guard both OSC call sites (working state and ready-candidate state) with shouldSkipOscRename helper to avoid code duplication"
metrics:
  duration: "~6 minutes"
  completed: "2026-02-25"
  tasks_completed: 2
  files_modified: 4
---

# Phase 10 Plan 02: Adjust Tab Renaming — Gap Closure Summary

Move toggle to Claude > Terminal group and fix OSC guard so slash-command tab names are not overwritten by Claude's task-name OSC updates.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move toggle, add export, add OSC guard | 1b601fa (+ prior phase 11 commits) | SettingsPanel.js, TerminalManager.js, en.json, fr.json |
| 2 | Verify end-to-end with grep validation + build + tests | (verification only) | — |

## Changes Made

### SettingsPanel.js
- Removed `tab-rename-slash-toggle` block from General tab (was between `update-title-on-project-switch-toggle` and `reduce-motion-toggle`)
- Added new `settings-group` with title `${t('settings.terminalGroup')}` in Claude tab, between Default Terminal Mode group and Hooks group
- Toggle HTML uses `id="tab-rename-slash-toggle"` — save handler still reads by same ID, no change needed there

### TerminalManager.js
- Added `updateTerminalTabName` to `module.exports` (after `updateTerminalStatus`) — fixes silent failure in `wireTabRenameConsumer`'s try/catch
- Added `shouldSkipOscRename(id)` helper function before `handleClaudeTitleChange` — uses module-level `getSetting` (already imported)
- Guarded both `updateTerminalTabName(id, parsed.taskName)` call sites in `handleClaudeTitleChange` with `if (!shouldSkipOscRename(id))`

### i18n
- Added `"terminalGroup": "Terminal"` to both `en.json` and `fr.json` settings section

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c "tab-rename-slash-toggle" SettingsPanel.js` | 2 (HTML + saveHandler) |
| Toggle in General panel? | false |
| Toggle in Claude panel? | true |
| `grep -c "shouldSkipOscRename" TerminalManager.js` | 3 (definition + 2 call sites) |
| `updateTerminalTabName` in module.exports | yes |
| `terminalGroup` in en.json | 1 |
| `terminalGroup` in fr.json | 1 |
| Build | PASS |
| Tests | 262/262 PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong require path in shouldSkipOscRename**
- **Found during:** Task 1 build verification
- **Issue:** Plan suggested lazy `require('../state/settings.state')` but `getSetting` is already imported at module level from `'../../state'`; using a require here caused a build error
- **Fix:** Use module-level `getSetting` directly in `shouldSkipOscRename` — no require needed, no circular dep risk
- **Files modified:** src/renderer/ui/components/TerminalManager.js

## Self-Check: PASSED

- `src/renderer/ui/panels/SettingsPanel.js` — verified toggle placement via node script
- `src/renderer/ui/components/TerminalManager.js` — verified shouldSkipOscRename (3 occurrences), updateTerminalTabName in exports
- `src/renderer/i18n/locales/en.json` — terminalGroup key present
- `src/renderer/i18n/locales/fr.json` — terminalGroup key present
- Commit 1b601fa exists in git log
- Build: PASS, Tests: 262/262 PASS
