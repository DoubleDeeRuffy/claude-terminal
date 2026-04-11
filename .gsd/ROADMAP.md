# Roadmap: Claude Terminal

## Completed Milestones

- **[v1.0 — UX Fixes](milestones/1.0/v1.0-ROADMAP.md)** (2026-02-24 → 2026-02-27) — 33 phases, 51 plans: terminal shortcuts, session persistence, explorer enhancements, markdown viewer, tab management, file watcher
- **[v1.1 — Consolidations](milestones/v1.1-ROADMAP.md)** (2026-02-28 → 2026-04-11) — 16 phases, 22 plans: tab context menu + AI rename, heartbeat split, NSIS silent install, updater settings, terminal rendering stability, Rider-quality git tab, clipboard image paste. 31C/31D superseded by v1.2; 29.1 tech debt.

## Current Milestone: v1.2 — Tab System Rewrite

**Goal:** Fix the three recurring terminal-tab bugs (rename wrong tab, wrong set of tabs on restore, wrong names on restore) by rebuilding the tab subsystem on a clean foundation. Along the way, shrink the codebase by deleting the integrated chat feature, the `@anthropic-ai/claude-agent-sdk` dependency, and the split-pane / PaneManager layout system — none of which are used by the fork owner.
**Full milestone roadmap:** [milestones/1.2/ROADMAP.md](milestones/1.2/ROADMAP.md)
**Execution model:** Isolated git worktree at `../claude-terminal-rewrite` (detached HEAD off the phase-37 WIP commit). No PRs to upstream — work stays on the fork.
**Phase numbering:** Fresh within the milestone (1, 2, 3) since this is a multi-step rewrite, not incremental feature work.

### Phase 1: Chat + Agent SDK Removal — GHOST (already completed)

**Goal:** Delete the integrated chat feature and `@anthropic-ai/claude-agent-sdk`. Rewire workflows / parallel tasks to `claude -p` CLI; rewire AI tab rename to GitHub Models API (mirror of `commitMessageGenerator.js`).
**Status:** Completed in commit `d9395d6f` (worktree) before this milestone directory was formalized — `net +620 / −11,501` across 33 files. See [1-CONTEXT.md](milestones/1.2/1-chat-sdk-removal-ghost/1-CONTEXT.md).
**Depends on:** —
**Plans:** 1/1 (ghost — no execution)

Plans:
- [x] Plan 1A: Ghost stub — recorded in commit d9395d6f before milestone existed

### Phase 2: Remove Split-Pane / PaneManager

**Goal:** Delete `PaneManager.js` and every split-pane call site so phase 3 can rewrite the tab system on a single-bar foundation without having to preserve pane semantics. Collapse the split-pane DOM, strip split CSS, remove paneLayout from the session save path, simplify renderer.js restore.
**Requirements**: Zero `PaneManager` / `paneLayout` / `split-pane` references anywhere; single `#terminal-tabs` + `#terminal-content` DOM pair; v2 `terminal-sessions.json` files still load (paneLayout ignored); existing tab bugs intentionally NOT fixed here.
**Depends on:** Phase 1 ghost (commit `d9395d6f`)
**Plans:** 1/1 plan

Plans:
- [ ] Plan 2A: Delete PaneManager + split-pane code, collapse to single tab bar — [2-01-PLAN.md](milestones/1.2/2-remove-split-pane/2-01-PLAN.md)

### Phase 3: Rewrite Tab System

**Goal:** Rebuild the tab subsystem with unified string IDs, single source of truth for per-project active tab, v3 persistence format with migration, and the rename / restore / active-tab fixes. Fixes the three canonical regressions at their root cause.
**Requirements**: String tab IDs end-to-end (no `Number(id)` fallbacks); `activePerProject` + `currentProjectId` in `terminals.state.js`; v3 `terminal-sessions.json` with authoritative `tab.name` and `activeTabId`; v2→v3 auto-migration including `session-names.json` merge; scoped `#terminal-tabs` querySelector in `updateTerminalTabName` with warn-on-miss; strict `===` DOM toggles in `setActiveTerminal`; `createTerminal` name default never falls back to `project.name` on restore; `filterByProject` safety invariant audited against the memory feedback note.
**Depends on:** Phase 2
**Plans:** 1/1 plan

Plans:
- [ ] Plan 3A: String IDs + v3 format + rename/restore/active-tab fixes — [3-01-PLAN.md](milestones/1.2/3-rewrite-tab-system/3-01-PLAN.md)
