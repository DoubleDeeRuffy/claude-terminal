---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: — Consolidations
status: verifying
last_updated: "2026-04-01T20:25:40.671Z"
last_activity: 2026-04-01
progress:
  total_phases: 13
  completed_phases: 8
  total_plans: 14
  completed_plans: 11
---

# Project State

## Current Position

Phase: 36 (fix-terminal-flickering-buffer-loss-and-blackouts-caused-by-scroll-to-top-changes) — COMPLETE
Plan: 1 of 1 (complete)
Status: Phase 36 complete — all plans done, ready for PR
Last activity: 2026-04-01 -- Phase 36 complete (36-01-PLAN.md executed)

## Accumulated Context

- v1.0 shipped 33 phases, 51 plans (2026-02-24 → 2026-02-27)
- 6 open PRs pending upstream review
- Phase numbering continues from 25

### Roadmap Evolution

- Phase 25 added: Pane-Divider-Opts
- Phase 26 added: MD-Files-Reopening
- Phase 27 removed: Projects-Pane-Opts (decided not to pursue)
- Phase 27 added: Rename-Tabs-Manually
- Phase 28 added: Paste-Doubles-Linebreaks
- Phase 29 added: Adjust-Idle-Recognization
- Phase 30 added: Support-NSIS-Silent
- Phase 31 added: Tab-Splitview (4 plans: infra, activation, triggers, persistence)
- Phase 31A complete: PaneManager module with container accessors, all 14 getElementById calls refactored
- Phase 31B complete: Pane-scoped setActiveTerminal, per-pane active tab tracking, pane-aware filterByProject
- Phase 31C complete: Context menu Split Right/Move actions, drag-to-split with overlay, cross-pane tab reorder, auto-collapse
- Phase 31D complete: v2 session format with paneLayout, pane-aware restore loop, backward-compatible v1 migration
- Phase 32 added: Close-Warnings (warn before closing if Claude is actively working, show project + tab name)
- Phase 33 added: Updater-Settings (configurable check interval, download mode, install mode)
- Phase 33 complete: 3 updater settings dropdowns, settings-driven UpdaterService, manual download banner flow
- Phase 34 added: AI-Rename-Menuitem in the tab contextmenu based on the existing ai-rename mechanism
- Phase 34 complete: AI Rename context menu item with loading indicator and error revert, EN/FR i18n
- Phase 35 added: Fix-Usage — Usage display shows incorrect percentages
- Phase 35 complete: Fixed API utilization decimal-to-percentage conversion (* 100) in UsageService
- Phase 36 added: Fix terminal flickering, buffer loss, and blackouts caused by scroll-to-top changes
- Phase 36 complete: Debounced writePreservingScroll (80ms), rapid-output guard suppressing terminal.clear() during Claude TUI redraws (3+ chunks < 150ms hysteresis)

### Pending Todos

9 todos in `.gsd/todos/pending/`
