---
created: 2026-02-24T20:46:25.340Z
title: Test and PR feat/terminal-session-restore
area: ui
files:
  - src/renderer/services/TerminalSessionService.js
  - renderer.js
  - src/renderer/state/settings.state.js
  - src/renderer/ui/panels/SettingsPanel.js
---

## Problem

Branch `feat/terminal-session-restore` is pushed to origin but needs manual testing before opening a PR against `Sterll/claude-terminal:main`. The feature persists terminal tabs to disk and restores them on app startup.

## Solution

1. `git checkout feat/terminal-session-restore && npm run build:renderer && npx electron .`
2. Open 2-3 terminals across different projects, close app, reopen — verify tabs restored
3. Toggle "Restore terminal sessions" off, restart — verify clean start
4. Delete a project — verify its sessions are cleared from terminal-sessions.json
5. Open draft PR: `gh pr create --repo Sterll/claude-terminal --base main --head DoubleDeeRuffy:feat/terminal-session-restore`
