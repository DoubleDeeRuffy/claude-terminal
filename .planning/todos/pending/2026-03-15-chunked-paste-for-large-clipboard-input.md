---
created: 2026-03-15T10:01:43.599Z
title: Chunked paste for large clipboard input
area: ui
files:
  - src/renderer/ui/components/TerminalManager.js:84-87,521-553
  - src/main/ipc/terminal.ipc.js:27-29
  - src/main/services/TerminalService.js:155-164
---

## Problem

Pasting large text (logfiles, long outputs) into Claude Code terminal sessions gets silently cut off. The `performPaste()` function sends the entire clipboard content as a single IPC message via `api.terminal.input()`. Large texts can exceed IPC serialization limits or overwhelm the PTY buffer, causing silent truncation. The error path in `TerminalService.write()` is a bare `catch (e) {}` — no logging, no user feedback.

## Solution

Already implemented in current working tree — chunk large pastes in `performPaste()`:
- Texts <=4KB: sent in one shot (unchanged fast path)
- Texts >4KB: split into 4KB chunks, sent sequentially with 5ms inter-chunk delay
- Constants: `PASTE_CHUNK_SIZE = 4096`, `PASTE_CHUNK_DELAY_MS = 5`

**PR checklist:**
- Create branch `feat/chunked-paste-large-input` from `origin/main`
- Cherry-pick or reapply the TerminalManager.js changes
- Run `npm test` and `npm run build:renderer`
- PR to upstream via `gh pr create --repo Sterll/claude-terminal --head DoubleDeeRuffy:BRANCH`
