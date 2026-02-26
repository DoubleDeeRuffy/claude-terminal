---
phase: quick-shift-enter-multiline
plan: "01"
subsystem: terminal-input, chat-ui
tags: [keyboard-shortcut, multiline, ux, terminal, chat]
dependency_graph:
  requires: []
  provides: [MULTILINE-01]
  affects: [TerminalManager, ChatView, chat-styles]
tech_stack:
  added: []
  patterns: [xterm-custom-key-handler, css-keyboard-hint]
key_files:
  modified:
    - src/renderer/ui/components/TerminalManager.js
    - src/renderer/ui/components/ChatView.js
    - styles/chat.css
decisions:
  - "Shift+Enter sends \\n (linefeed) not \\r\\n to PTY — consistent with how most shells distinguish newline from carriage return"
  - "Hint uses t('chat.newLine') with inline fallback; locale files not updated (acceptable per plan)"
  - "Guard placed before Ctrl+Arrow block to ensure it is checked first without disrupting other shortcuts"
metrics:
  duration: ~5 minutes
  completed: 2026-02-24
---

# Quick Task 1: Shift+Enter Multiline Support Summary

**One-liner:** Shift+Enter now sends `\n` to PTY in all terminal channels, and chat input shows a subtle keyboard hint.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Intercept Shift+Enter in terminal | 4e50ac2 | src/renderer/ui/components/TerminalManager.js |
| 2 | Add keyboard hint to chat input footer | bc84287 | src/renderer/ui/components/ChatView.js, styles/chat.css |

## What Was Built

**Task 1 — Terminal Shift+Enter interception:**

Added a guard at the top of `createTerminalKeyHandler` (line 561) in `TerminalManager.js`. When Shift+Enter is pressed (no Ctrl, no Alt, keydown event only), the handler sends `\n` via the appropriate input channel and returns `false` to prevent xterm.js from emitting its default `\r`. This lets Claude CLI (and any other PTY program that distinguishes newline from carriage return) receive proper multiline input.

All three input channels are covered: `fivem-input` routes to `api.fivem.input`, `webapp-input` routes to `api.webapp.input`, and the default `terminal-input` routes to `api.terminal.input`.

**Task 2 — Chat keyboard hint:**

Inserted `<span class="chat-keyboard-hint"><kbd>Shift</kbd>+<kbd>Enter</kbd> for new line</span>` into `.chat-footer-right` in `ChatView.js`, before the effort selector. Added matching CSS to `chat.css` with muted colors (`var(--text-muted)`, `var(--bg-tertiary)`, `var(--border-color)`) and small font size (`var(--font-2xs)`) so the hint is discoverable without being distracting. The existing chat textarea Shift+Enter behavior (Enter sends, Shift+Enter inserts newline natively) already worked correctly — no JS changes needed.

## Verification

```
grep -n "shiftKey.*Enter" src/renderer/ui/components/TerminalManager.js
# → 563:    if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter' && e.type === 'keydown') {

grep -n "chat-keyboard-hint" src/renderer/ui/components/ChatView.js styles/chat.css
# → ChatView.js:185: <span class="chat-keyboard-hint">...
# → chat.css:2722: .chat-keyboard-hint { ... }
# → chat.css:2732: .chat-keyboard-hint kbd { ... }

npm run build:renderer  # Build complete: dist/renderer.bundle.js
npm test               # 262 tests passed, 0 failures
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- src/renderer/ui/components/TerminalManager.js — modified with Shift+Enter guard
- src/renderer/ui/components/ChatView.js — modified with keyboard hint span
- styles/chat.css — modified with .chat-keyboard-hint and kbd styles
- Commit 4e50ac2 — Task 1 (TerminalManager)
- Commit bc84287 — Task 2 (ChatView + chat.css)
- Build succeeded, 262 tests passed
