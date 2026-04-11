# Claude Terminal — Tab System Rewrite

## Current State (post v1.1)

**Shipped:** v1.1 Consolidations — 16 phases, 22 plans, 32 tasks. See [.gsd/milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md).

**v1.1 validated:**
- Right-click tab context menu + AI Rename via Haiku (on-demand rename, async with loading indicator)
- Full tab persistence: file + terminal tabs restored across restarts with exact ordering
- Split heartbeat system: user time-tracking separate from per-terminal Claude activity detection
- NSIS silent install (`/S` flag + `.silent-install` marker) + user-configurable auto-updater
- Terminal rendering stability: debounced scroll preservation + rapid-output clear-screen guard (fixes flicker, buffer loss, blackouts)
- Rider-quality git tab: `getBranchesWithTracking`/`getRecentBranches` utilities, hierarchical branch treeview, resizable commit graph modal, top-bar branch/pull/push status sync
- Terminal clipboard image paste: Ctrl+V intercepts images, inline thumbnail preview, temp file save + path injection to CLI

## Current Milestone: v1.2 Tab System Rewrite

**Goal:** Fix the three recurring tab bugs (rename wrong tab, wrong tabs on restore, wrong names on restore) at the root cause by rebuilding the tab subsystem on a clean foundation — string IDs, `activePerProject` + `currentProjectId` state, v3 persistence format with v2→v3 migration.

**Shrink simultaneously:** Delete the integrated chat feature, `@anthropic-ai/claude-agent-sdk` dependency, and the split-pane / PaneManager layout system. None are used by the fork owner; chat/SDK removal already shipped as a "ghost" phase (commit `d9395d6f`, `net +620 / −11,501` across 33 files).

**Execution model:** Isolated worktree at `../claude-terminal-rewrite` (detached HEAD off the phase-37 WIP commit `52d9d17a`). Fork-only — no upstream PRs.

**Phases:**
1. Chat + Agent SDK Removal (GHOST — already completed in `d9395d6f`)
2. Remove Split-Pane / PaneManager — collapses split-pane DOM, strips CSS, removes paneLayout from session save path
3. Rewrite Tab System — string IDs, v3 format, rename/restore/active-tab fixes

## Tech Debt Carried Into v1.2

- **Phase 29** (heartbeat split): upstream PR still pending — functionality shipped on fork
- **Phase 29.1** (cross-tab idle contamination): unfixed, may resurface during v1.2 work
- **Phase 32** (close warnings): implementation shipped, roadmap checkbox stale
- **Phase 25 / 26 / 28**: no SUMMARY.md written; commit history is authoritative record
- **Phase 37**: WIP snapshot commit (`52d9d17a`) — remaining polish deferred

## Context

- **Brownfield:** Large existing codebase (118+ IPC handlers, 14 CSS files, full project type system) — lighter after v1.2 Phase 1 ghost (chat/SDK removal)
- **Terminal:** xterm.js v6 with WebGL addon, node-pty backend, PowerShell default on Windows
- **File explorer:** `FileExplorer.js` component in `src/renderer/ui/components/`
- **Keyboard shortcuts:** `KeyboardShortcuts.js` in `src/renderer/features/`, plus xterm.js key handling
- **Codebase map:** Available at `.gsd/codebase/`
- **Fork status:** 6 open upstream PRs (phases 1, 3, 4+6, 9, 10, 21, 24). v1.1 landed on fork `main` without waiting for upstream review. v1.2 runs in a separate worktree — no upstream PRs planned.

## Constraints

- **Electron IPC:** Terminal input flows through preload bridge — clipboard access needs IPC or renderer-side API
- **xterm.js key handling:** Must work with xterm's built-in key event system
- **Cross-platform:** Ctrl on Windows/Linux maps to Cmd on macOS for some shortcuts
- **v2 session compatibility:** v3 tab system must migrate existing `terminal-sessions.json` (with old `paneLayout`) without data loss

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Remove dotfile filter entirely | User wants to see all files, no toggle needed | Shipped (v1.0 Phase 1) |
| Handle hotkeys in xterm.js layer | Shortcuts are terminal-specific, not app-wide | Shipped (v1.0 Phase 2) |
| Crash-resilient saves (continuous, not quit-only) | Users lose data on crashes | Shipped (v1.0 Phases 4-6) |
| chokidar file watcher with per-directory shallow watchers | Performance on large repos | Shipped (v1.0 Phase 22) |
| Split heartbeat into user/Claude systems | Time tracking ≠ activity detection — different lifecycles | Shipped (v1.1 Phase 29, PR pending) |
| Debounced scroll preservation + rapid-output clear-screen guard | Per-write scrollLines caused flicker; strays terminal.clear() caused buffer loss | Shipped (v1.1 Phase 36) ✓ Good |
| Abandon Phase 31C/31D mid-flight | Split-pane unused by fork owner; v1.2 will remove PaneManager entirely | Superseded by v1.2 ✓ Good |
| Delete chat + Agent SDK ghost-style before formal v1.2 start | Unblocks tab rewrite, removes ~11k LOC | Shipped in `d9395d6f` ✓ Good |
| Fork-only v1.2 execution (no upstream PRs) | Upstream doesn't share fork's trajectory on rewrite/removal | — Pending outcome |
| Isolated worktree for v1.2 | Keeps `main` usable while rewrite progresses | — Pending outcome |

<details>
<summary>v1.1 Consolidations (completed)</summary>

### What v1.1 Was

Optimize existing features and spread proven patterns throughout the app. Incremental milestone — phases added one at a time via `/gsd:add-phase` / `/gsd:insert-phase`.

### Target Areas (all addressed)

- Feature optimizations and polish
- Spreading existing patterns app-wide
- Deferred items from v1.0 (as needed)

### Deferred from v1.0 — Outcomes

- Projects panel width persistence (Phase 15 → addressed in v1.1 Phase 25)
- Notification state persistence (Phase 15.1 → still deferred)
- macOS Cmd+C/Cmd+V mapping (TERM-V2-02 → still deferred, fork is Windows-only)

</details>

<details>
<summary>v1.0 Initial Project Brief</summary>

### What This Was

Claude Terminal is a cross-platform Electron desktop application for managing Claude Code projects with an integrated terminal, chat UI, git management, and plugin ecosystem. The v1.0 milestone focused on fixing three core UX gaps: missing terminal hotkeys, hidden dotfiles in the file explorer, and a missing "New Terminal" button — then expanded to cover session persistence, explorer enhancements, tab management, and more.

### Original Requirements

- Ctrl+Arrow word-jump navigation in xterm.js terminal
- Ctrl+C to copy selected text in xterm.js terminal
- Ctrl+V to paste clipboard content in xterm.js terminal
- Right-click paste in xterm.js terminal
- File explorer shows dotfiles and dotfolders
- "New Terminal" button positioned after project name

</details>

---
*Last updated: 2026-04-11 after v1.1 milestone completion*
