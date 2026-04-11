---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: — Tab System Rewrite
status: planning
last_updated: "2026-04-11T18:00:00.000Z"
last_activity: 2026-04-11 -- v1.1 milestone archived and shipped
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 3
  completed_plans: 1
---

# Project State

## Project Reference

See: .gsd/PROJECT.md (updated 2026-04-11 after v1.1 completion)

**Core value:** Fix tab system at the root with string IDs + v3 persistence format, and shrink the codebase by removing chat/SDK/split-pane.
**Current focus:** v1.2 Phase 2 — Remove Split-Pane / PaneManager

## Current Position

Milestone: v1.2 Tab System Rewrite
Phase: 2 (Remove Split-Pane / PaneManager) — ready to plan/execute
Plan: 2A — Delete PaneManager + split-pane code
Status: Phase 1 (GHOST) already landed in commit `d9395d6f`
Last activity: 2026-04-11 -- v1.1 milestone archived and shipped

## Accumulated Context

- **v1.0 shipped** 2026-02-27 — 33 phases, 51 plans (UX Fixes)
- **v1.1 shipped** 2026-04-11 — 16 phases, 22 plans, 32 tasks (Consolidations). Known gaps: Phase 29 upstream PR pending, 29.1 unfixed, 31C/31D superseded, 32 tracking stale. See [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md).
- **v1.2 active** — Tab System Rewrite in isolated worktree `../claude-terminal-rewrite` off commit `52d9d17a`. Phase 1 (chat + Agent SDK removal) ghost-completed in `d9395d6f` (`+620 / −11,501` across 33 files).
- **Fork-only execution for v1.2** — no upstream PRs planned
- **6 open upstream PRs** from v1.0/v1.1 phases still pending review (fork diverges from upstream trajectory)

### Open Tech Debt

- Phase 29 (v1.1) — heartbeat split: upstream PR pending
- Phase 29.1 (v1.1) — cross-tab idle contamination: unfixed
- Phase 32 (v1.1) — close warnings: implementation shipped, checkbox stale
- Phase 37 (v1.1) — git tab polish: WIP commit `52d9d17a`, remaining polish deferred

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260404-guu | Disable modal collapse on click away (new project wizard) | 2026-04-04 | ed59c5ba | [260404-guu-adding-a-new-project-disable-modal-colla](./quick/260404-guu-adding-a-new-project-disable-modal-colla/) |

### Pending Todos

9 todos in `.gsd/todos/pending/`
