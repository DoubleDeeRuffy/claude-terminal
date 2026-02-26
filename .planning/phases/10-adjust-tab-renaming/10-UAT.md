---
status: diagnosed
phase: 10-adjust-tab-renaming
source: 10-01-SUMMARY.md
started: 2026-02-25T12:00:00Z
updated: 2026-02-25T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Settings toggle visible
expected: In Settings > Terminal section, a toggle labeled "Rename tab on slash command" appears after "Update title on project switch". Default is OFF.
result: issue
reported: "the setting is wrongly located in Settings > General, should be in Settings > Claude under a new sub-section Terminal"
severity: major

### 2. Tab renames on slash command
expected: Enable the toggle in Settings. Open a Claude terminal for a project. Type a slash command (e.g. `/help`). The terminal tab name should update to show the slash command text.
result: issue
reported: "this is entirely not working. i want the name to be exact the last command, not a haiku-version of it."
severity: blocker

### 3. Toggle OFF prevents rename
expected: Disable the toggle in Settings. Type another slash command in the Claude terminal. The tab name should NOT change — it keeps whatever name it had before (haiku AI name or previous name).
result: skipped
reason: Depends on test 2 (core rename broken)

### 4. Long command truncation
expected: Enable the toggle. Type a long slash command (40+ characters, e.g. `/gsd:execute-phase 10 --gaps-only --verbose`). The tab name should be truncated at 40 characters with an ellipsis character at the end.
result: skipped
reason: Depends on test 2 (core rename broken)

### 5. i18n labels (EN and FR)
expected: Switch language to English — toggle shows "Rename tab on slash command" with description mentioning slash commands. Switch to French — shows "Renommer l'onglet sur commande slash" with French description.
result: skipped
reason: User skipped remaining

## Summary

total: 5
passed: 0
issues: 2
pending: 0
skipped: 3

## Gaps

- truth: "Toggle appears in Settings > Claude under a Terminal sub-section"
  status: failed
  reason: "User reported: the setting is wrongly located in Settings > General, should be in Settings > Claude under a new sub-section Terminal"
  severity: major
  test: 1
  root_cause: "Toggle inserted at line 456 inside General tab's System group (data-panel='general') after updateTitleOnProjectSwitch. Should be in Claude tab (data-panel='claude') in a new Terminal settings group."
  artifacts:
    - path: "src/renderer/ui/panels/SettingsPanel.js"
      issue: "tab-rename-slash-toggle placed in General > System instead of Claude > Terminal"
  missing:
    - "Move toggle from General > System to Claude tab"
    - "Create new Terminal settings group in Claude tab (after Default Terminal Mode, before Hooks)"
    - "Add i18n key for settings.terminalGroup in en.json and fr.json"

- truth: "Terminal tab name updates to show the exact slash command text when enabled"
  status: failed
  reason: "User reported: this is entirely not working. i want the name to be exact the last command, not a haiku-version of it."
  severity: blocker
  test: 2
  root_cause: "Race condition: wireTabRenameConsumer correctly renames tab to slash command, but TerminalManager.js handleOscTitle unconditionally overwrites it within seconds via OSC title scraping (braille spinner/taskName). Two sites at lines ~392 and ~404 call updateTerminalTabName without checking tabRenameOnSlashCommand setting."
  artifacts:
    - path: "src/renderer/ui/components/TerminalManager.js"
      issue: "handleOscTitle lines 390-404: two unconditional updateTerminalTabName calls overwrite slash command name"
    - path: "src/renderer/events/index.js"
      issue: "wireTabRenameConsumer works correctly, no change needed"
  missing:
    - "Add guard in handleOscTitle to skip rename when tabRenameOnSlashCommand is enabled and current tab name starts with /"
