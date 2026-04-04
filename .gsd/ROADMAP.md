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

### Phase 29.1: Bugfix-Idle-Recognition-Cross-Tab

**Goal:** Fix bug where an already-idle tab gets incorrectly set to "working" when another tab in the same project starts working — each tab's idle/working status should be independent.
**Requirements**: Investigate and fix cross-tab idle status contamination; ensure only the terminal with actual Claude output transitions to "working".
**Depends on:** Phase 29
**Plans:** 1 plan

Plans:
- [ ] Plan 29.1A: Fix cross-tab idle status contamination

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
**Plans:** 4/4 plans complete

Plans:
- [x] Plan 31A: PaneManager infrastructure and DOM refactoring (zero behavioral change)
- [x] Plan 31B: Pane-aware activation and filtering
- [ ] Plan 31C: Split triggers, drag-to-split, and pane collapse
- [ ] Plan 31D: Pane layout persistence and restore

### Phase 32: Close-Warnings

**Goal:** Warn the user before closing the app if any Claude instance is actively working (not idle) in any project, showing which project and tab name is still active.
**Requirements**: [CLOSE-01] Intercept app close and check Claude activity status; [CLOSE-02] Show confirmation dialog listing affected project(s) and tab name(s); [CLOSE-03] Allow proceed or cancel; [CLOSE-04] Skip dialog if no active work.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [ ] Plan 32A: Close warning dialog when Claude is actively working

### Phase 33: Updater-Settings

**Goal:** Add user-configurable settings for the auto-update mechanism: check interval (30min/1h/3h/startup-only/never), download mode (auto/manual), and install mode (auto-on-close/manual).
**Requirements**: [UPD-01] Add updater settings UI to settings panel (check interval, download mode, install mode); [UPD-02] Persist settings in app config; [UPD-03] Wire settings to UpdaterService (respect check interval, auto/manual download, auto/manual install); [UPD-04] Add i18n keys for EN/FR.
**Depends on:** —
**Plans:** 1 plan

Plans:
- [x] 33-01-PLAN.md — Updater settings UI, persistence, and UpdaterService wiring

### Phase 34: Tab-Rename-Contextmenu

**Goal:** Add an "AI Rename" menu item to the tab context menu that triggers the existing Haiku-based generateTabName on demand.
**Requirements**: [TAB-RENAME-CTX-01] Add AI Rename context menu item with loading indicator, error revert, and i18n keys.
**Depends on:** Phase 33
**Plans:** 1/1 plans complete

Plans:
- [x] 34-01-PLAN.md — AI Rename context menu item with async Haiku naming

### Phase 35: Fix-Usage

**Goal:** Fix usage display showing incorrect percentages — API returns decimal fractions (0.41) but code treats them as whole percentages, needs multiply by 100.
**Requirements**: Convert API utilization decimals to percentages in UsageService.js.
**Depends on:** Phase 34
**Plans:** 1/1 plans complete

Plans:
- [ ] 35-01-PLAN.md — Fix utilization decimal-to-percentage conversion

### Phase 36: Fix terminal flickering, buffer loss, and blackouts caused by scroll-to-top changes

**Goal:** Fix three terminal rendering regressions: viewport flickering during rapid Claude output, scrollback buffer loss from stray terminal.clear() calls, and visual blackouts on tab switch.
**Requirements**: [FLICKER-01] Debounced scroll preservation — replace per-write scrollLines with post-settle restoration; [FLICKER-02] Tightened clear-screen guard — suppress terminal.clear() during rapid Claude TUI redraws; [FLICKER-03] No tab-switch recovery needed — root cause prevention is sufficient.
**Depends on:** Phase 35
**Plans:** 1/1 plans complete

Plans:
- [x] 36-01-PLAN.md — Debounced scroll preservation and tightened clear-screen guard

### Phase 37: Enhance git capabilities — commit graph, branch visualization, unpushed file tracking

**Goal:** Improve the git tab to match Rider's git UX quality: a resizable commit graph modal with filter toolbar, hierarchical branch treeview with Recent/Local/Remote sections and ahead/behind indicators, and current-branch button with push/pull arrow status.
**Requirements**: [D-01..D-06] Commit graph modal (single-click access, resizable, persistent size, Rider-style lanes, reuse existing graph code); [D-07..D-11] Branch treeview (hierarchical, Recent/Local/Remote sections, ahead/behind counts, search bar, existing actions preserved); [D-12..D-14] Arrow indicators on branch button and branch tree.
**Depends on:** Phase 36
**Plans:** 3/3 plans complete

Plans:
- [x] 37-01-PLAN.md — Backend git utilities, IPC, settings defaults, and i18n keys
- [x] 37-02-PLAN.md — Branch treeview with Recent/Local/Remote sections, search, and arrow indicators
- [x] 37-03-PLAN.md — Resizable commit graph modal with filter toolbar

### Phase 38: Post screenshots into terminal (CLI mode)

**Goal:** Add clipboard image paste support to the terminal tab — intercept Ctrl+V with images, show thumbnail preview bar, save to temp files, and inject file paths into the Claude CLI prompt on Enter.
**Requirements**: [IMG-01] Clipboard image detection in paste event; [IMG-02] Preview bar with thumbnails; [IMG-03] Temp file save; [IMG-04] Max 5 image enforcement; [IMG-05] Path injection into terminal input on Enter.
**Depends on:** Phase 37
**Plans:** 1/1 plans complete

Plans:
- [x] 38-01-PLAN.md — Terminal clipboard image paste with inline preview and temp file injection

### Phase 39: Fix empty pane disabled controls

**Goal:** Fix the state where opening a project with no terminal causes the new conversation/resume pane to overlap the top action buttons (resume, add-conversation, changes, git-branch) or leaves them disabled.
**Requirements**: CSS-only fix — replace percentage heights with flex-based sizing on #empty-terminals and .sessions-panel.
**Depends on:** Phase 38
**Plans:** 1/1 plans complete

Plans:
- [x] 39-01-PLAN.md — Fix #empty-terminals and .sessions-panel CSS overflow
