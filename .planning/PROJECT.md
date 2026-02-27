# Claude Terminal — UX Fixes

## Current State

**Shipped:** v1.0 (2026-02-27)
**Core Value:** The terminal and file explorer must behave as users expect from native desktop tools — standard keyboard shortcuts work, all files are visible, and creating a new terminal is one click away.

### What v1.0 Delivered

- Full Windows-native terminal shortcuts with configurable settings
- Session persistence & Claude resume across app restarts (crash-resilient)
- File explorer: dotfile toggle, natural sorting, file watcher, scroll persistence
- Integrated markdown viewer with TOC, live reload, and search
- Tab management: AI naming toggle, name persistence, resume dialog with saved names, browser-like close history
- Taskbar pin preservation, window state persistence, .NET dashboard, app title tracking

### Deferred from v1.0

- Projects panel width persistence (Phase 15)
- Notification state persistence (Phase 15.1)
- macOS Cmd+C/Cmd+V mapping (TERM-V2-02)

## Next Milestone Goals

To be defined via `/gsd:new-milestone`.

## Context

- **Brownfield:** Large existing codebase (118+ IPC handlers, 14 CSS files, full project type system)
- **Terminal:** xterm.js v6 with WebGL addon, node-pty backend, PowerShell default on Windows
- **File explorer:** `FileExplorer.js` component in `src/renderer/ui/components/`
- **Keyboard shortcuts:** `KeyboardShortcuts.js` in `src/renderer/features/`, plus xterm.js key handling
- **Codebase map:** Available at `.planning/codebase/` (7 documents)

## Constraints

- **Electron IPC:** Terminal input flows through preload bridge — clipboard access needs IPC or renderer-side API
- **xterm.js key handling:** Must work with xterm's built-in key event system
- **Cross-platform:** Ctrl on Windows/Linux maps to Cmd on macOS for some shortcuts

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Remove dotfile filter entirely | User wants to see all files, no toggle needed | Shipped (Phase 1) |
| Handle hotkeys in xterm.js layer | Shortcuts are terminal-specific, not app-wide | Shipped (Phase 2) |
| Position new terminal button after project name | User's explicit UI preference | Shipped (Phase 3) |
| Configurable terminal shortcuts | User needs flexibility per-shortcut | Shipped (Phase 7) |
| Crash-resilient saves (continuous, not quit-only) | Users lose data on crashes | Shipped (Phases 4-6) |
| chokidar file watcher with per-directory shallow watchers | Performance on large repos | Shipped (Phase 22) |

<details>
<summary>v1.0 Initial Project Brief</summary>

### What This Was

Claude Terminal is a cross-platform Electron desktop application (v0.9.6) for managing Claude Code projects with an integrated terminal, chat UI, git management, and plugin ecosystem. The v1.0 milestone focused on fixing three core UX gaps: missing terminal hotkeys, hidden dotfiles in the file explorer, and a missing "New Terminal" button — then expanded to cover session persistence, explorer enhancements, tab management, and more.

### Original Requirements

- Ctrl+Arrow word-jump navigation in xterm.js terminal
- Ctrl+C to copy selected text in xterm.js terminal
- Ctrl+V to paste clipboard content in xterm.js terminal
- Right-click paste in xterm.js terminal
- File explorer shows dotfiles and dotfolders
- "New Terminal" button positioned after project name

</details>

---
*Last updated: 2026-02-27 — v1.0 milestone archived*
