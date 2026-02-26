---
phase: 18-disable-haiki-tab-naming-settings-toggle
plan: 01
subsystem: settings, chat-view, terminal-manager, i18n
tags: [settings, tab-naming, ai, haiku, ux, toggle]
dependency_graph:
  requires: []
  provides: [aiTabNaming-setting, tabs-settings-group, ai-tab-naming-toggle]
  affects: [ChatView.js, TerminalManager.js, SettingsPanel.js, settings.state.js, en.json, fr.json]
tech_stack:
  added: []
  patterns: [getSetting call-time read, !== false guard for safe upgrade]
key_files:
  created: []
  modified:
    - src/renderer/state/settings.state.js
    - src/renderer/ui/components/ChatView.js
    - src/renderer/ui/components/TerminalManager.js
    - src/renderer/ui/panels/SettingsPanel.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
decisions:
  - "aiTabNaming defaults to true with !== false guard so undefined/missing key defaults to AI naming ON (safe upgrade path)"
  - "Guard placed on outer if condition of both ChatView generateTabName blocks — both the instant truncation rename AND the async haiku call are skipped when disabled"
  - "Guard added as AND condition alongside existing shouldSkipOscRename check in TerminalManager — keeps AI naming toggle and slash-command cooldown as separate orthogonal concerns"
  - "Slash-command rename toggle moved from terminalGroup into new tabsGroup with relabeled i18n key (tabRenameOnSlashCommandTerminal) — old keys retained for any other references"
  - "getSetting called at call-time (runtime) not cached — toggle takes effect immediately without restart"
metrics:
  duration: ~10 minutes
  completed: 2026-02-26T13:20:29Z
  tasks_completed: 2
  files_modified: 6
---

# Phase 18 Plan 01: AI Tab Naming Toggle Summary

**One-liner:** `aiTabNaming: true` setting with `!== false` guard on 4 rename call sites and new Tabs settings group containing both AI naming toggle and relocated slash-command toggle.

## What Was Built

Added an "AI tab naming" toggle to the settings panel that controls whether the haiku AI model renames chat tabs on message submit and whether OSC title changes from Claude CLI rename terminal tabs. Users who prefer static tab names can now disable both rename mechanisms with a single toggle.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add aiTabNaming setting default and guard all rename call sites | f3fa8248 | settings.state.js, ChatView.js, TerminalManager.js |
| 2 | Create Tabs settings group with AI tab naming toggle, move slash-command toggle, add i18n | 94ac91cf | SettingsPanel.js, en.json, fr.json |

## Implementation Details

### Task 1: Setting + Guards

**settings.state.js:** Added `aiTabNaming: true` to `defaultSettings` alongside other boolean settings. The `!== false` guard means `undefined`/missing key also defaults to AI naming enabled — existing users see no behavior change on upgrade.

**ChatView.js (2 call sites guarded):**
- Line 1528: Keyboard-submitted messages: `if (onTabRename && !text.startsWith('/') && getSetting('aiTabNaming') !== false)`
- Line 3197: Remote/PWA messages: `if (onTabRename && text && !text.startsWith('/') && getSetting('aiTabNaming') !== false)`

Both the immediate truncation rename and the async haiku API call are inside the guarded block — when disabled, both are skipped.

**TerminalManager.js (2 call sites guarded):**
- Line 391: Working-state rename: `if (getSetting('aiTabNaming') !== false && !shouldSkipOscRename(id))`
- Line 405: Ready-candidate rename: `if (getSetting('aiTabNaming') !== false && !shouldSkipOscRename(id))`

The `aiTabNaming` guard is placed alongside `shouldSkipOscRename`, not inside it — keeps the two concerns (AI naming toggle vs slash-command cooldown) separate and independent.

### Task 2: Settings UI + i18n

**SettingsPanel.js:** New "Tabs" settings group inserted before the "Terminal" group in the Claude settings tab. Contains:
1. AI tab naming toggle (id: `ai-tab-naming-toggle`, default checked)
2. Slash-command rename toggle (id: `tab-rename-slash-toggle`, moved from Terminal group, relabeled)

The Terminal group now only contains the idle timeout dropdown.

Save logic reads `ai-tab-naming-toggle` checkbox and persists `aiTabNaming: newAiTabNaming` to settings.

**i18n (EN + FR):** Added 4 new keys in both locale files:
- `tabsGroup`, `aiTabNaming`, `aiTabNamingDesc`, `tabRenameOnSlashCommandTerminal`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npm test`: 281/281 tests pass, 14 suites, no regressions
- `npm run build:renderer`: Build complete, no errors
- `aiTabNaming` grep: 1 hit in settings.state.js, 2 in ChatView.js, 2 in TerminalManager.js, 4+ in SettingsPanel.js, 2 in en.json, 2 in fr.json
- `tabsGroup` grep: 1 in SettingsPanel.js, 1 in en.json, 1 in fr.json
- `tab-rename-slash-toggle` no longer inside terminalGroup block

## Self-Check: PASSED

Files exist:
- src/renderer/state/settings.state.js: FOUND
- src/renderer/ui/components/ChatView.js: FOUND
- src/renderer/ui/components/TerminalManager.js: FOUND
- src/renderer/ui/panels/SettingsPanel.js: FOUND
- src/renderer/i18n/locales/en.json: FOUND
- src/renderer/i18n/locales/fr.json: FOUND

Commits exist:
- f3fa8248: FOUND (feat(18-01): add aiTabNaming setting and guard all rename call sites)
- 94ac91cf: FOUND (feat(18-01): add Tabs settings group with AI tab naming toggle and i18n)
