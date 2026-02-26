---
phase: quick-2
plan: 01
subsystem: terminal-keyboard
tags: [terminal, keyboard-shortcut, xterm, pty, word-delete]
dependency_graph:
  requires: []
  provides: [Ctrl+Backspace word-delete in all PTY terminals]
  affects: [src/renderer/ui/components/TerminalManager.js]
tech_stack:
  added: []
  patterns: [xterm attachCustomKeyEventHandler, PTY escape sequence forwarding]
key_files:
  modified:
    - src/renderer/ui/components/TerminalManager.js
decisions:
  - "Used \\x17 (ETB / Ctrl+W) as the word-delete signal — universally recognized by bash readline (unix-word-rubout), PowerShell PSReadLine (BackwardDeleteWord), and zsh"
  - "Handler placed inside existing Ctrl+key block (line 578) before Ctrl+C, matching the same guard pattern as Ctrl+Left/Right word-jump"
  - "FiveM/WebApp input channels return true (fall through) to preserve their default Ctrl+Backspace behavior"
metrics:
  duration: ~3 minutes
  completed: 2026-02-24T19:39:00Z
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 2: Ctrl+Backspace Word-Delete Summary

**One-liner:** Ctrl+Backspace sends \\x17 (ETB/word-rubout) to PTY terminals via xterm key handler, deleting the previous word in bash, PowerShell, and zsh.

## What Was Done

Added a Ctrl+Backspace handler inside the `createTerminalKeyHandler` function in `TerminalManager.js`. When the user presses Ctrl+Backspace in a PTY terminal:

1. The handler is intercepted inside the existing `if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.repeat && e.type === 'keydown')` block
2. `\x17` (ASCII ETB = Ctrl+W) is sent directly to the PTY via `api.terminal.input`
3. The shell/line editor interprets this as "delete previous word" (unix-word-rubout / BackwardDeleteWord)
4. FiveM and WebApp input channels fall through with `return true` to retain default behavior

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1: Add Ctrl+Backspace word-delete | fe7de79 | feat(quick-2): add Ctrl+Backspace word-delete to terminal key handler |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/renderer/ui/components/TerminalManager.js` modified: FOUND
- Handler at line 597 (`Ctrl+Backspace`) with `\x17` at line 602: FOUND
- Commit fe7de79: FOUND
- Build: PASSED (dist/renderer.bundle.js rebuilt successfully)
