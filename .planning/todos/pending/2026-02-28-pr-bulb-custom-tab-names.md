---
created: 2026-02-28T00:00:00.000Z
title: Create PR — Lightbulb modal shows custom tab names
area: renderer
files:
  - renderer.js
  - src/main/ipc/claude.ipc.js
  - src/renderer/ui/components/TerminalManager.js
---

## Task

Create a PR to upstream `Sterll/claude-terminal` for lightbulb modal custom tab name support.

## Changes

Four bugs fixed:

1. **Ghost sessions flooding lightbulb** (`claude.ipc.js`) — 199 JSONL files with only `file-history-snapshot` lines (no user messages) passed the 200-byte size filter. Added `messageCount === 0 && !firstPrompt` filter to skip them.

2. **Custom names not displayed in lightbulb** (`renderer.js`) — `_preprocessModalSessions` never read `session-names.json`. Added `_modalNamesFile`/`_loadModalNames()`/`_getModalCustomName()` and integrated into preprocessing (custom name takes priority over summary/prompt).

3. **Manual tab rename didn't persist to session-names.json** (`TerminalManager.js`) — `startRenameTab()` called `updateTerminal()` directly instead of `updateTerminalTabName()` which writes to `session-names.json`. Fixed to use `updateTerminalTabName()`.

4. **Session ID mismatch on resume** (`TerminalManager.js`) — Claude assigns a new session ID on resume via `onSessionStart`, but the lightbulb lists sessions by the original JSONL filename. Custom names were written under the new ID, never found under the old one. Added `originalSessionId` to termData and write custom names to both IDs.

## Notes

- Changes are currently on `feat/phase-29-adjust-idle-recognition` — needs dedicated branch from `origin/main`
- PR target: `gh pr create --repo Sterll/claude-terminal --head DoubleDeeRuffy:BRANCH`
- Tests pass (843/843), build passes
