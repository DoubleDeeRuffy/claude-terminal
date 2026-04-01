---
created: 2026-02-24T20:46:25.340Z
title: Test and PR feat/dotfile-visibility
area: ui
files:
  - src/renderer/ui/components/FileExplorer.js
  - src/renderer/state/settings.state.js
  - src/renderer/ui/panels/SettingsPanel.js
---

## Problem

Branch `feat/dotfile-visibility` is pushed to origin but needs manual testing before opening a PR against `Sterll/claude-terminal:main`. The feature adds a "Show dotfiles" toggle in Settings > General that gates the dotfile filter in FileExplorer.

## Solution

1. `git checkout feat/dotfile-visibility && npm run build:renderer && npx electron .`
2. Toggle "Show dotfiles" off — verify dotfiles hidden in explorer
3. Toggle on — verify dotfiles appear (except IGNORE_PATTERNS like .git, node_modules)
4. Open draft PR: `gh pr create --repo Sterll/claude-terminal --base main --head DoubleDeeRuffy:feat/dotfile-visibility`
