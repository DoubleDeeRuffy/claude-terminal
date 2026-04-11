# Milestones

## v1.1 Consolidations (Shipped: 2026-04-11)

**Timeline:** 2026-02-28 → 2026-04-11 (43 days)
**Phases:** 16 | **Plans:** 22 | **Tasks:** 32
**Commits:** 147 (fork, `ee51c0e8..d4747ac3`) | **Files:** 662 | **Lines:** +76,934 / −9,349

**Key accomplishments:**

1. **Tab context-menu + AI Rename** — Right-click menu (Rename, Close, Close Others, Close Tabs to Right) across all 6 tab creation sites, plus on-demand Haiku-based AI Rename with async loading indicator (Phases 27, 34)
2. **Full tab + Claude session persistence** — File and terminal tabs restored across restarts with exact ordering and active-tab state (Phase 26); paste `\r\n`→`\r` normalization + Shift+Enter fix (Phase 28)
3. **Heartbeat split** — Separated user time-tracking from per-terminal Claude activity detection; 10s tick; configurable idle thresholds (15s–10min) (Phase 29 + 29.1)
4. **NSIS silent install + configurable updater** — `/S` flag respected, `.silent-install` marker applies defaults without wizard (Phase 30); updater settings UI for check interval, download mode, install mode (Phase 33)
5. **Terminal rendering stability** — Debounced scroll preservation (80ms settle) + rapid-output guard suppressing `terminal.clear()` during Claude TUI redraws — fixes flicker, buffer loss, and blackouts (Phase 36)
6. **Rider-quality git tab** — `getBranchesWithTracking` + `getRecentBranches` utilities, hierarchical branch treeview with Recent/Local/Remote + ahead/behind badges + search, resizable commit graph modal with colored SVG lanes + 8-handle resize + filter toolbar, top-bar branch/pull/push status sync with 5-minute periodic refresh (Phase 37)
7. **Clipboard image paste into terminal** — Ctrl+V intercepts images, inline thumbnail preview bar, temp file save with 1-hour TTL cleanup, path injection into Claude CLI prompt on Enter (Phase 38)
8. **UX polish** — Usage percentage fix (Phase 35), flex-based empty-pane sizing (Phase 39), pane divider fixes (Phase 25), close warning when Claude is actively working (Phase 32)

### Known Gaps

- **Phase 29** — UAT passed but upstream PR pending (functionality shipped on fork)
- **Phase 29.1** — Cross-tab idle contamination bugfix incomplete; tracked as tech debt
- **Phase 31C / 31D** — Split-pane triggers and persistence intentionally abandoned. v1.2 Phase 2 removes PaneManager entirely, so extending it further would be dead code. 31A/31B shipped.
- **Phase 32** — Implementation shipped (SUMMARY.md exists), roadmap checkbox not flipped
- **Phases 25 / 26 / 28** — Shipped cleanly but no SUMMARY.md written; commit history is authoritative record

### Retrospective

v1.1 started as an incremental "optimize + polish" pass but drifted into replacing subsystems. The heartbeat split (Phase 29), terminal rendering rework (Phase 36), and git tab rewrite (Phase 37) were each larger than a typical consolidation phase.

The pivotal decision came mid-Phase 31: after shipping the PaneManager infrastructure (31A/B), it became clear the split-pane feature wasn't worth finishing for a fork that doesn't use it. That insight triggered v1.2 scaffolding in parallel — chat + Agent SDK removal happened as a ghost commit (`d9395d6f`, `−11,501` LOC) before the milestone dir existed.

**Archive:** [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) · [milestones/v1.1-REQUIREMENTS.md](milestones/v1.1-REQUIREMENTS.md)

---

## v1.0 UX Fixes (Shipped: 2026-02-27)

**Timeline:** 2026-02-24 → 2026-02-27 (4 days)
**Phases:** 33 | **Plans:** 51 | **Commits:** 268 | **Files:** 408 | **Lines:** +68,920 / −3,794

Full terminal keyboard shortcuts, session persistence & resume across restarts, file explorer enhancements (dotfiles, natural sorting, file watcher), integrated markdown viewer, tab management (AI naming, name persistence, resume dialog, close history), taskbar pin preservation, window state persistence, .NET dashboard, shift+return race condition fix.

**Archive:** [milestones/1.0/v1.0-ROADMAP.md](milestones/1.0/v1.0-ROADMAP.md) · [milestones/1.0/v1.0-REQUIREMENTS.md](milestones/1.0/v1.0-REQUIREMENTS.md)

---
