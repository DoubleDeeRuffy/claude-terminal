# Roadmap: Claude Terminal

## Completed Milestones

- **[v1.0 — UX Fixes](milestones/v1.0-ROADMAP.md)** (2026-02-24 → 2026-02-27) — 33 phases, 51 plans: terminal shortcuts, session persistence, explorer enhancements, markdown viewer, tab management, file watcher

## Current Milestone: v1.1 — Consolidations

**Goal:** Optimize existing features and spread proven patterns throughout the app.
**Approach:** Incremental — phases added via `/gsd:add-phase` or `/gsd:insert-phase`.
**Phase numbering:** Continues from 25.

### Phase 25: Pane-Divider-Opts

**Goal:** Fix pane divider bugs (persistence, event leaking, missing visual feedback) and adjust constraints.
**Requirements**: Fix 5 issues across 4 files — explorer event leak, memory resizer visibility, projects min-width, width persistence.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [x] Plan 25A: Fix pane divider bugs and adjust constraints

### Phase 26: MD-Files-Reopening

**Goal:** Persist and restore all tabs (terminal + file) across app restarts, preserving exact ordering and active state.
**Requirements**: Add file tab serialization to save loop, interleaved restore for both tab types, activeTabIndex-first active tab tracking.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [x] Plan 26A: Persist & restore file tabs with full tab ordering

### Phase 27: Rename-Tabs-Manually

**Goal:** Add a right-click context menu to terminal/file tabs with rename, close, and bulk-close actions.
**Requirements**: Add tab context menu with Rename, Close, Close Others, Close Tabs to Right; wire to all 6 tab creation sites; add i18n keys.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [x] Plan 27A: Implement tab context menu with rename and bulk-close actions

### Phase 28: Paste-Doubles-Linebreaks

**Goal:** Fix doubled linebreaks when pasting multi-line text and normalize Enter key to send `\r` for terminal-input channel.
**Requirements**: Normalize `\r\n`→`\r` and `\n`→`\r` in `sendPaste()`, fix Shift+Enter to send `\r` for terminal-input only.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [x] Plan 28A: Fix doubled linebreaks on paste and Enter key normalization

### Phase 29: Adjust-Idle-Recognization

**Goal:** Split single heartbeat system into two: user heartbeat (time tracking per active project, persisted) and Claude heartbeat (per-terminal activity status, runtime only).
**Requirements**: Refactor timeTracking.state.js for user-only heartbeats with project-switch stop/start; create claudeActivity state for per-terminal Claude idle detection; update tick to 10s; remove session merging; update settings dropdown to 15s/30s/1min/2min/3min/5min/10min; split all heartbeat call sites in TerminalManager, ChatView, events/index.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [ ] Plan 29A: Split heartbeat into user time-tracking and Claude activity systems

### TODOs

- [ ] Create PR for Phase 29 (Adjust-Idle-Recognization) — UAT passed, ready for PR

### Phase 30: Support-NSIS-Silent

**Goal:** Make the NSIS installer respect the `/S` (silent) flag for both install and uninstall, and fix the `SetSilent normal` override that currently forces wizard mode.
**Requirements**: [SILENT-01] Remove `SetSilent normal` from `customInit` macro; [SILENT-02] Add `customInstall` macro to write `.silent-install` marker for fresh silent installs; [SILENT-03] Detect marker in app and apply defaults (hooks ON, startup OFF, setupCompleted true) without showing wizard.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [ ] Plan 30A: Fix NSIS silent install support and add app-side detection

### Phase 31: Tab-Splitview

**Goal:** Implement a VSCode-style splitview for terminals and file tabs — drag a tab to the right side to split the view into two independent panes, each with its own tab bar and per-pane context menu actions.
**Requirements**: [SPLIT-INFRA] PaneManager abstraction with container routing; [SPLIT-ACTIVE] Pane-aware setActiveTerminal and filterByProject; [SPLIT-TRIGGER] Context menu Split Right action; [SPLIT-MOVE] Move Right/Move Left between panes; [SPLIT-DROPZONE] VSCode-style drag-to-split with overlay; [SPLIT-COLLAPSE] Auto-collapse empty panes; [SPLIT-PERSIST] Full pane layout persistence across restarts.
**Depends on:** —
**Plans:** 4 plans

Plans:
- [ ] Plan 31A: PaneManager infrastructure and DOM refactoring (zero behavioral change)
- [ ] Plan 31B: Pane-aware activation and filtering
- [ ] Plan 31C: Split triggers, drag-to-split, and pane collapse
- [ ] Plan 31D: Pane layout persistence and restore
