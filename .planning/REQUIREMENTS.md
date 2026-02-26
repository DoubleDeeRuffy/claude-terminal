# Requirements: Claude Terminal — UX Fixes

**Defined:** 2026-02-24
**Core Value:** The terminal and file explorer must behave as users expect from native desktop tools

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Terminal Shortcuts

- [x] **TERM-01**: User can copy selected text with Ctrl+C (passes SIGINT to PTY when no selection)
- [x] **TERM-02**: User can paste clipboard content with Ctrl+V
- [x] **TERM-03**: User can jump by word with Ctrl+Arrow (left/right)
- [x] **TERM-04**: User can paste via right-click in terminal
- [x] **TERM-05**: Terminal tab switching remapped from Ctrl+Arrow to Ctrl+Tab/Ctrl+Shift+Tab

### File Explorer

- [x] **FILE-01**: User can see dotfiles and dotfolders (.planning, .git, etc.) in file explorer tree
- [x] **FILE-02**: User can find dotfiles via file search/indexer

### Terminal Management

- [x] **TMGR-01**: User can create new terminal via button positioned after project name, above tab control

### Session Persistence

- **SESS-01**: Terminal tabs are restored with their working directories when the app restarts
- **SESS-02**: The last opened project is restored when the app restarts
- **SESS-03**: Terminal session state is saved continuously (crash-resilient, not save-on-quit-only)
- **SESS-04**: When a project is deleted, its saved terminal session data is cleaned up

### Explorer State Persistence

- **EXPL-01**: Expanded folders are remembered per-project across project switches and app restarts
- **EXPL-02**: File explorer panel visibility (open/closed) is remembered per-project
- **EXPL-03**: Explorer state is saved continuously with debounce (crash-resilient)
- **EXPL-04**: Explorer state is cleaned up when a project is deleted

## v2 Requirements

### Terminal Shortcuts

- **TERM-V2-01**: Configurable keyboard shortcut mappings for terminal
- **TERM-V2-02**: macOS Cmd+C/Cmd+V mapping

### File Explorer

- **FILE-V2-01**: Configurable dotfile visibility toggle in settings

### Window Title

- **TITLE-01**: Window title updates to show current project name when switching projects (for external time-tracking tools)
- **TITLE-02**: User can toggle window title updates on/off in Settings (default: enabled)

### Window State

- **WIN-01**: Window position, size, and maximized state persist across app restarts
- **WIN-02**: Multi-monitor support: window restores to correct monitor, falls back to primary if monitor disconnected
- **WIN-03**: Window state is saved continuously via debounced move/resize events (crash-resilient)

### .NET Project Support

- **DOTNET-01**: User with a .NET project sees SDK-specific dashboard badge and framework stats (target framework, SDK type, project count for solutions)

### Tab Mode Toggle

- **TAB-MODE-01**: User can hide the Chat/Terminal mode-switch button on terminal tabs via a settings toggle (default: shown, immediate effect, persists across restarts)

### Session Resume

- **SESS-RESUME-01**: User can resume a previous Claude session from a visible button in the terminal toolbar (opens existing sessions modal for the current project)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Chat input hotkeys | Only fixing xterm.js terminal, not chat |
| Terminal split panes | Separate feature, not part of this milestone |
| Dotfile toggle setting | User explicitly chose "show all", no toggle needed |
| macOS right-click word selection | Windows-first, defer to v2+ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TERM-01 | Phase 2 | Complete |
| TERM-02 | Phase 2 | Complete |
| TERM-03 | Phase 2 | Complete |
| TERM-04 | Phase 2 | Complete |
| TERM-05 | Phase 2 | Complete (2026-02-24) |
| FILE-01 | Phase 1 | Complete (2026-02-24) |
| FILE-02 | Phase 1 | Complete (2026-02-24) |
| TMGR-01 | Phase 3 | Complete |
| SESS-01 | Phase 4+6 | Complete (2026-02-25) |
| SESS-02 | Phase 4+6 | Complete (2026-02-25) |
| SESS-03 | Phase 4+6 | Complete (2026-02-25) |
| SESS-04 | Phase 4+6 | Complete (2026-02-25) |
| EXPL-01 | Phase 5 | Complete |
| EXPL-02 | Phase 5 | Complete |
| EXPL-03 | Phase 5 | Complete |
| EXPL-04 | Phase 5 | Complete |
| TERM-V2-01 | Phase 7 | Planned |
| TITLE-01 | Phase 8 | Planned |
| TITLE-02 | Phase 8 | Planned |
| WIN-01 | Phase 9 | Planned |
| WIN-02 | Phase 9 | Planned |
| WIN-03 | Phase 9 | Planned |
| DOTNET-01 | Phase 12 | Planned |
| TAB-MODE-01 | Phase 13 | Planned |
| SESS-RESUME-01 | Phase 14 | Planned |

**Coverage:**
- v1 requirements: 16 total, all complete
- v2 requirements: 8 mapped (TERM-V2-01, TITLE-01, TITLE-02, WIN-01, WIN-02, WIN-03, TAB-MODE-01, SESS-RESUME-01)
- Unmapped: TERM-V2-02, FILE-V2-01

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-24 — traceability filled after roadmap creation*
