---
created: 2026-02-24T20:46:25.340Z
title: Test and PR feat/right-click-terminal
area: ui
files:
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/state/settings.state.js
  - src/renderer/ui/panels/SettingsPanel.js
---

## Problem

Branch `feat/right-click-terminal` is pushed to origin but needs manual testing before opening a PR against `Sterll/claude-terminal:main`. The feature adds right-click copy/paste on terminal (copy if selection, paste if none).

## Solution

1. `git checkout feat/right-click-terminal && npm run build:renderer && npx electron .`
2. Select text in terminal, right-click — verify it copies to clipboard
3. Right-click with no selection — verify it pastes from clipboard
4. Toggle "Right-click copy/paste" off in settings — verify right-click shows default context menu
5. Open draft PR: `gh pr create --repo Sterll/claude-terminal --base main --head DoubleDeeRuffy:feat/right-click-terminal`
