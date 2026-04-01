---
status: testing
phase: 34-tab-rename-contextmenu
source: 34-01-SUMMARY.md
started: 2026-03-07T18:30:00Z
updated: 2026-03-07T18:30:00Z
---

## Current Test

number: 1
name: AI Rename Menu Item Visible
expected: |
  Right-click a terminal tab. Context menu shows "AI Rename" directly below "Rename".
awaiting: user response

## Tests

### 1. AI Rename Menu Item Visible
expected: Right-click a terminal tab. Context menu shows "AI Rename" directly below "Rename", with no separator between them.
result: [pending]

### 2. AI Rename Execution
expected: Click "AI Rename" on a terminal tab. Tab name briefly shows "..." as loading indicator, then changes to an AI-generated name based on terminal content.
result: [pending]

### 3. AI Rename Disabled When Setting Off
expected: With aiTabNaming setting turned off, right-click a tab. "AI Rename" appears greyed out / disabled and cannot be clicked.
result: [pending]

### 4. French i18n
expected: Switch language to French. Right-click a tab. Menu shows "Renommer par IA" instead of "AI Rename".
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
