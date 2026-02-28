# Phase 28: Paste-Doubles-Linebreaks — Context

## Problem Statement

Pasting multi-line text into the terminal produces doubled linebreaks. Windows clipboard stores line endings as `\r\n`. The paste path sends raw clipboard text to node-pty, where both `\r` and `\n` are interpreted as separate line separators.

## Decisions

### 1. Normalization Strategy

- **Where:** In `performPaste()` (`TerminalManager.js:493`) — the shared paste helper in the renderer
- **What:** Two-step normalization: `\r\n` → `\r`, then remaining lone `\n` → `\r`
- **Why `\r`:** Terminal convention — Enter sends `\r`, the PTY translates. Matches what xterm.js produces for keystrokes.
- **Platform:** Always normalize on all platforms (no OS detection)

### 2. Scope of Fix

- **Paste fix:** `performPaste()` only — all paste paths (Ctrl+V, Ctrl+Shift+V, right-click, context menu) already funnel through it
- **Paste channels:** Normalization applies to all three input channels (terminal, FiveM, WebApp)
- **Enter key fix:** Also fix Enter key handlers (lines 710-714) to send `\r` instead of `\n` — but **terminal-input channel only**, not FiveM/WebApp
- **Out of scope:** xterm onData handler, macro/resolved text paths

### 3. Bracket Paste Mode

- **Decision:** Deferred to a future phase — it's an enhancement (preventing accidental line-by-line execution), not a bug fix

## Code Context

### Primary fix location
- `src/renderer/ui/components/TerminalManager.js` — `performPaste()` function (line 493)
- Add normalization in `sendPaste()` callback before dispatching to IPC

### Enter key fix location
- `src/renderer/ui/components/TerminalManager.js` — lines 710-714
- Change `data: '\n'` to `data: '\r'` for the `api.terminal.input()` branch only

### Paste flow
```
clipboard.readText() → sendPaste(text) → api.terminal.input({ id, data: text })
                                        → api.fivem.input(...)
                                        → api.webapp.input(...)
```

### Key files
| File | Role |
|------|------|
| `src/renderer/ui/components/TerminalManager.js` | `performPaste()`, `sendPaste()`, Enter key handlers |
| `src/main/services/TerminalService.js` | `write()` — passes data to PTY (no changes needed) |
| `src/main/ipc/terminal.ipc.js` | `terminal-input` handler (no changes needed) |

## Deferred Ideas

- Bracket paste mode for multi-line pastes (prevents shell from executing line-by-line)
- Enter key `\n` → `\r` normalization for FiveM/WebApp channels
