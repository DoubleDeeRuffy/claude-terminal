---
status: testing
phase: 16-remember-tab-names-of-claude-sessions-through-app-restarts
source: 16-01-SUMMARY.md
started: 2026-02-26T12:00:00Z
updated: 2026-02-26T12:00:00Z
---

## Current Test

number: 1
name: User-renamed tab name persists across restart
expected: |
  1. Open a terminal tab
  2. Double-click the tab name to rename it to something custom (e.g., "My Build")
  3. Close and reopen the app
  4. The tab should reappear with the name "My Build" (not the default name)
awaiting: user response

## Tests

### 1. User-renamed tab name persists across restart
expected: Rename a tab manually (double-click), restart the app. The tab should restore with the custom name you gave it.
result: [pending]

### 2. AI haiku tab name persists across restart
expected: Let the AI generate a haiku-style tab name (happens automatically when a Claude session runs). Restart the app. The tab should restore with the AI-generated name, not a default name.
result: [pending]

### 3. Chat-mode tab restores with correct name and mode
expected: Open a chat-mode tab (not terminal mode). It should have a name. Restart the app. The tab should restore in chat mode (not terminal mode) and keep its name.
result: [pending]

### 4. Old sessions without name field restore normally
expected: If you have any tabs from before this feature (no saved name), they should still restore fine with a default name — no errors or crashes.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
