---
phase: 10-adjust-tab-renaming
plan: "01"
subsystem: events, settings, i18n
tags: [tab-rename, slash-command, hooks, settings-toggle, i18n]
dependency_graph:
  requires: []
  provides: [wireTabRenameConsumer, tabRenameOnSlashCommand-setting, tab-rename-slash-toggle]
  affects: [events/index.js, settings.state.js, SettingsPanel.js, en.json, fr.json]
tech_stack:
  added: []
  patterns: [lazy-require-circular-dep, getSetting-at-call-time, hooks-source-guard, max-tab-name-truncation]
key_files:
  created: []
  modified:
    - src/renderer/events/index.js
    - src/renderer/state/settings.state.js
    - src/renderer/ui/panels/SettingsPanel.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
decisions:
  - "tabRenameOnSlashCommand defaults to false (opt-in) — preserves existing haiku AI naming for all users"
  - "Tab name persists through /clear — no reset logic added per user decision"
  - "getSetting() called inside event callback (not cached) so toggle takes effect immediately"
  - "Lazy require(TerminalManager) inside callback to avoid circular dependency (established Phase 4+ pattern)"
  - "Guard e.source !== hooks filters out ScrapingProvider which emits prompt: null"
  - "Truncate at 40 chars with Unicode ellipsis U+2026"
metrics:
  duration: 3
  completed_date: "2026-02-25"
  tasks_completed: 2
  files_modified: 5
---

# Phase 10 Plan 01: Adjust Tab Renaming Summary

**One-liner:** Opt-in terminal tab auto-renaming to last slash command via PROMPT_SUBMIT hook event with EN/FR settings toggle.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add wireTabRenameConsumer and setting default | bedb185 | events/index.js, settings.state.js |
| 2 | Add settings toggle UI and i18n keys | 7d3e6d8 | SettingsPanel.js, en.json, fr.json |

## What Was Built

**wireTabRenameConsumer** (`src/renderer/events/index.js`):
- Listens for `PROMPT_SUBMIT` events on the `ClaudeEventBus`
- Guards: `e.source !== 'hooks'` (only HooksProvider has prompt text), `!e.projectId`, slash command prefix check
- Reads `tabRenameOnSlashCommand` setting at call-time for immediate toggle effect
- Resolves terminal via `findClaudeTerminalForProject(e.projectId)` (existing helper)
- Truncates prompt at 40 chars with Unicode ellipsis `\u2026`
- Lazy requires `TerminalManager` to avoid circular dependency
- Wired into `initClaudeEvents()` after `wireSessionIdCapture()`

**Setting default** (`src/renderer/state/settings.state.js`):
- `tabRenameOnSlashCommand: false` added to `defaultSettings` — opt-in, preserves haiku naming by default

**Settings toggle UI** (`src/renderer/ui/panels/SettingsPanel.js`):
- Toggle row added after `updateTitleOnProjectSwitch` in Terminal Settings section
- HTML id: `tab-rename-slash-toggle`
- `saveSettingsHandler` reads the toggle and includes `tabRenameOnSlashCommand` in `newSettings`
- Covered by existing `autoSave` listener (no extra event wiring needed)

**i18n** (EN + FR):
- `settings.tabRenameOnSlashCommand` — label
- `settings.tabRenameOnSlashCommandDesc` — description with example `/gsd:verify-work 12`
- French translation uses proper UTF-8 umlauts: `Renommer l'onglet sur commande slash`

## Verification Results

All plan verification checks pass:
- `grep -c "wireTabRenameConsumer" src/renderer/events/index.js` → **2** (definition + call)
- `grep -c "tabRenameOnSlashCommand" src/renderer/state/settings.state.js` → **1**
- `grep -c "tab-rename-slash-toggle" src/renderer/ui/panels/SettingsPanel.js` → **2** (HTML + saveHandler)
- `grep -c "tabRenameOnSlashCommand" src/renderer/i18n/locales/en.json` → **2**
- `grep -c "tabRenameOnSlashCommand" src/renderer/i18n/locales/fr.json` → **2**
- `npm run build:renderer` → Build complete (no errors)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- FOUND: src/renderer/events/index.js (modified - wireTabRenameConsumer added)
- FOUND: src/renderer/state/settings.state.js (modified - tabRenameOnSlashCommand: false)
- FOUND: src/renderer/ui/panels/SettingsPanel.js (modified - tab-rename-slash-toggle)
- FOUND: src/renderer/i18n/locales/en.json (modified - 2 new keys)
- FOUND: src/renderer/i18n/locales/fr.json (modified - 2 new keys)

Commits verified:
- FOUND: bedb185 (Task 1 - events/index.js + settings.state.js)
- FOUND: 7d3e6d8 (Task 2 - SettingsPanel.js + i18n files)
