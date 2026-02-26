# Claude Terminal — UX Fixes

## What This Is

Claude Terminal is a cross-platform Electron desktop application (v0.9.6) for managing Claude Code projects with an integrated terminal, chat UI, git management, and plugin ecosystem. This milestone focuses on fixing three UX gaps: missing terminal hotkeys, hidden dotfiles in the file explorer, and a missing "New Terminal" button.

## Core Value

The terminal and file explorer must behave as users expect from native desktop tools — standard keyboard shortcuts work, all files are visible, and creating a new terminal is one click away.

## Requirements

### Validated

<!-- Inferred from existing codebase — already shipped and working -->

- ✓ xterm.js terminal with WebGL rendering and node-pty backend — existing
- ✓ Multi-terminal support with tabs per project — existing
- ✓ File explorer with tree navigation and file operations — existing
- ✓ Keyboard shortcuts system (Ctrl+T, Ctrl+W, Ctrl+P, etc.) — existing
- ✓ Chat interface with Claude Agent SDK streaming — existing
- ✓ Git management panel with staging, commits, branches — existing
- ✓ Project type plugin system (6 types) — existing
- ✓ i18n support (EN/FR) — existing
- ✓ Remote control via WebSocket + PIN auth — existing
- ✓ MCP server management — existing

### Active

- [ ] Ctrl+Arrow word-jump navigation in xterm.js terminal
- [ ] Ctrl+C to copy selected text in xterm.js terminal
- [ ] Ctrl+V to paste clipboard content in xterm.js terminal
- [ ] Right-click paste in xterm.js terminal
- [ ] File explorer shows dotfiles and dotfolders (.planning, .git, etc.)
- [ ] "New Terminal" button positioned after project name, above the tab control

### Out of Scope

- Chat input hotkeys — only fixing xterm.js terminal
- Configurable dotfile filter toggle — just removing the filter
- Terminal split panes or advanced layout — separate feature

## Context

- **Brownfield:** Large existing codebase (118 IPC handlers, 14 CSS files, full project type system)
- **Terminal:** xterm.js v6 with WebGL addon, node-pty backend, PowerShell default on Windows
- **File explorer:** `FileExplorer.js` component in `src/renderer/ui/components/`
- **Keyboard shortcuts:** `KeyboardShortcuts.js` in `src/renderer/features/`, plus xterm.js has its own key handling
- **Codebase map:** Available at `.planning/codebase/` (7 documents)

## Constraints

- **Electron IPC:** Terminal input flows through preload bridge — clipboard access needs IPC or renderer-side API
- **xterm.js key handling:** Must work with xterm's built-in key event system (attachCustomKeyEventHandler or similar)
- **Cross-platform:** Ctrl on Windows/Linux maps to Cmd on macOS for some shortcuts

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Remove dotfile filter entirely | User wants to see all files, no toggle needed | — Pending |
| Handle hotkeys in xterm.js layer | Shortcuts are terminal-specific, not app-wide | — Pending |
| Position new terminal button after project name | User's explicit UI preference | — Pending |

---
*Last updated: 2026-02-24 after initialization*
