---
status: passed
phase: 24-shift-return-race-condition
source: [24-01-SUMMARY.md]
started: 2026-02-27T17:30:00Z
updated: 2026-02-27T18:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Shift+Return inserts newline (terminal)
expected: Hold Shift and press Return rapidly in a terminal tab. Each press inserts a single newline — the message is never submitted.
result: pass
notes: Required fixing TerminalManager.js (not ChatView.js). Triple OR-guard (shiftHeld || e.shiftKey || e.getModifierState('Shift')). Blocks both keydown and keypress to prevent double-newline from xterm.

### 2. Return submits the message
expected: Type a message and press Return (without Shift). The message is submitted immediately.
result: pass

### 3. Single newline per Shift+Enter (no double-line)
expected: Each Shift+Enter inserts exactly one newline, not two.
result: pass
notes: Fixed by returning false for both keydown AND keypress events in xterm custom key handler. keydown sends '\n', keypress is blocked.

### 4. No sticky Shift after Alt+Tab
expected: Hold Shift, Alt+Tab away, Alt+Tab back, press Return. Message submits (not newline).
result: pass

### 5. Multiline spacing looks good (terminal)
expected: Multiple Shift+Enter lines appear with proper single-spaced spacing.
result: pass
notes: User confirmed "absolutely fantastic"

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

## Notes

- Original plan targeted ChatView.js only — user exclusively uses terminal tabs, not chat tabs
- TerminalManager.js fix uses OR-logic (any detection method confirming Shift → insert newline)
- ChatView.js fix uses AND-logic (all methods must confirm no Shift → allow submit)
- Double-newline bug was caused by xterm keypress event leaking through after keydown was blocked
