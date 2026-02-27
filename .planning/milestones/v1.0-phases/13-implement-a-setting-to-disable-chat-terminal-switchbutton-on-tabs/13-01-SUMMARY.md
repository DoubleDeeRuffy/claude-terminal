---
phase: 13-implement-a-setting-to-disable-chat-terminal-switchbutton-on-tabs
plan: 01
subsystem: renderer-settings
tags: [settings, terminal-tabs, ui, css, i18n]
dependency_graph:
  requires: []
  provides: [showTabModeToggle-setting, hide-tab-mode-toggle-body-class]
  affects: [SettingsPanel, settings.state, terminal.css, index.js, i18n]
tech_stack:
  added: []
  patterns: [body-class-css-toggle, !== false default guard]
key_files:
  created: []
  modified:
    - src/renderer/state/settings.state.js
    - src/renderer/ui/panels/SettingsPanel.js
    - src/renderer/index.js
    - styles/terminal.css
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
decisions:
  - showTabModeToggle uses !== false guard so undefined/missing key defaults to showing button (safe upgrade path)
  - CSS display:none with !important overrides hover-based opacity/flex changes on .tab-mode-toggle
  - Toggle placed inside existing defaultTerminalMode settings-card to group related terminal tab settings
  - Body class toggled immediately in saveSettingsHandler without DOM iteration — CSS rule on body handles all tabs
metrics:
  duration: ~8 minutes
  completed: 2026-02-26
  tasks_completed: 2
  files_modified: 6
---

# Phase 13 Plan 01: Implement showTabModeToggle Setting Summary

**One-liner:** Settings toggle that hides the Chat/Terminal mode-switch button on terminal tabs via body-level CSS class, with persistent on/off state across restarts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add showTabModeToggle default, CSS rule, startup body class, i18n strings | 27a051fd | settings.state.js, terminal.css, index.js, en.json, fr.json |
| 2 | Add toggle UI in SettingsPanel and wire saveSettingsHandler | 5bcc57f3 | SettingsPanel.js |

## What Was Built

A settings toggle in the Claude tab's "Default terminal mode" section that controls whether the Chat/Terminal switch button is visible on terminal tabs.

**Key implementation details:**
- `showTabModeToggle: true` default in `settings.state.js` — safe upgrade path, existing users see no change
- `body.hide-tab-mode-toggle .tab-mode-toggle { display: none !important }` in `terminal.css` — `!important` required to override the hover-based opacity rule
- Startup body class applied in `index.js` after `initializeState()` using `=== false` guard (not `!value`) so undefined defaults to NOT hiding
- `SettingsPanel.js` toggle uses `settings.showTabModeToggle !== false ? 'checked' : ''` for consistent undefined-as-true behavior
- Body class toggled immediately via `document.body.classList.toggle('hide-tab-mode-toggle', !newShowTabModeToggle)` — no DOM iteration over tabs needed
- i18n keys in both `en.json` and `fr.json` for label and description

## Verification

- `npm run build:renderer` — PASSED
- `npm test` — PASSED (262 tests, 13 suites)
- `grep -r "showTabModeToggle" src/ styles/` — hits in all 6 expected files
- `grep "hide-tab-mode-toggle" src/renderer/index.js src/renderer/ui/panels/SettingsPanel.js styles/terminal.css` — hits in all 3 files
- `!== false` guard confirmed in toggle HTML

## Deviations from Plan

None — plan executed exactly as written.

The plan referenced `tabRenameOnSlashCommand` as a neighbor setting for placement, but that setting/toggle does not exist in the current codebase on main. The new toggle was placed inside the existing `defaultTerminalMode` settings-card (the Terminal section of the Claude tab) which is the logical home for terminal tab UI settings.

## Self-Check: PASSED

- `src/renderer/state/settings.state.js` — FOUND showTabModeToggle
- `src/renderer/ui/panels/SettingsPanel.js` — FOUND show-tab-mode-toggle + showTabModeToggle + hide-tab-mode-toggle
- `src/renderer/index.js` — FOUND hide-tab-mode-toggle
- `styles/terminal.css` — FOUND body.hide-tab-mode-toggle rule
- `src/renderer/i18n/locales/en.json` — FOUND showTabModeToggle keys
- `src/renderer/i18n/locales/fr.json` — FOUND showTabModeToggle keys
- Commits 27a051fd and 5bcc57f3 — FOUND in git log
