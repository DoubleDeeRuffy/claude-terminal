---
created: 2026-03-14T16:09:16.806Z
title: Fix terminal clear scrollback and session ID routing
area: ui
files:
  - src/renderer/ui/components/TerminalManager.js:1953
  - src/renderer/events/index.js:263-273
  - src/renderer/events/index.js:724-759
---

## Problem

Two issues discovered after upstream merge (v1.1.1):

### 1. `/clear` does not wipe scrollback buffer
When user runs `/clear` in a Claude terminal tab, Claude CLI sends ANSI clear sequences (`\x1b[2J`, `\x1b[3J`, `\x1bc`) which only clear the visible xterm viewport. The scrollback buffer (5000 lines) retains all previous chat history, so scrolling up reveals the old conversation.

### 2. `/clear` renames the wrong tab
When `/clear` creates a new session, `findTerminalForSessionId` was checking uncaptured terminals (Priority 2) before `lastActiveClaudeTab` (Priority 3). With multiple tabs for the same project, this caused the session rotation logic to pick the wrong terminal and reset its name to the project name.

## Solution

### Scrollback fix (`TerminalManager.js`)
In the IPC data handler for Claude terminals, detect clear escape sequences in the incoming data and call `terminal.clear()` (which wipes scrollback) before `terminal.write(data.data)`.

### Session routing fix (`events/index.js`)
Reorder `findTerminalForSessionId` priorities:
1. Terminal already has this exact session ID (resume)
2. **`lastActiveClaudeTab`** (most reliable for `/clear` — user was just using it)
3. Uncaptured terminal (fresh tab with no session yet)
4. Highest ID heuristic

Both fixes are implemented on `main` — needs a clean PR branch.
