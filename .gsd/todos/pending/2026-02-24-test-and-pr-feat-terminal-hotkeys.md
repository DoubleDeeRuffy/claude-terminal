---
created: 2026-02-24T20:46:25.340Z
title: Test and PR feat/terminal-hotkeys
area: ui
files:
  - src/main/windows/MainWindow.js
  - src/main/preload.js
  - renderer.js
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/ui/components/ChatView.js
  - styles/chat.css
  - src/renderer/state/settings.state.js
  - src/renderer/ui/panels/SettingsPanel.js
---

## Problem

Branch `feat/terminal-hotkeys` is pushed to origin but needs manual testing before opening a PR against `Sterll/claude-terminal:main`. The most complex branch — adds 6 terminal shortcuts all gated by individual settings.

## Solution

1. `git checkout feat/terminal-hotkeys && npm run build:renderer && npx electron .`
2. Test each shortcut:
   - Ctrl+Tab / Ctrl+Shift+Tab — switches terminal tabs
   - Ctrl+C — copies selection (or sends SIGINT if nothing selected)
   - Ctrl+V — pastes from clipboard
   - Ctrl+Left/Right — jumps words in terminal
   - Ctrl+Backspace — deletes previous word
   - Shift+Enter — sends literal newline
3. Verify Shift+Enter hint visible in chat footer
4. Toggle each setting off individually — verify shortcut stops working
5. Verify Ctrl+Up/Down still switches projects
6. Open draft PR: `gh pr create --repo Sterll/claude-terminal --base main --head DoubleDeeRuffy:feat/terminal-hotkeys`
