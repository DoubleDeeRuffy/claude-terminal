# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Terminal and file explorer behave as users expect from native desktop tools — standard keyboard shortcuts work, all files are visible, and creating a new terminal is one click away
**Current focus:** Phase 6.3 — Remember Active Tab Per Project (COMPLETE)

## Current Position

Phase: 6.3 (remember-active-task-on-project-scope-to-restore-it-on-project-swap-and-app-restart) — COMPLETE
Plan: 1 of 1 complete
Status: Plan 6.3-01 complete — activeTabIndex saved per project in TerminalSessionService + restored by filterByProject with bounds-check fallback
Last activity: 2026-02-26 - Completed plan 6.3-01: activeTabIndex persistence in TerminalSessionService + active tab restore in TerminalManager.js

Progress: [████████████████████████████] 100% (Phase 18, Plan 1/1)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: ~8 minutes
- Total execution time: ~40 minutes

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 1 (Dotfile Visibility) | 1 | ~10m | ~10m |
| Phase 2 (Terminal Keyboard Shortcuts) | 3/3 | ~28m | ~9m |
| Phase 3 (New Terminal Button) | 1/1 | ~2m | ~2m |
| Phase 4 (Session Persistence) | 1/3 | ~10m | ~10m |
| Phase 5 (Remember Explorer State) | 2/2 | ~6m | ~3m |

**Recent Trend:**
- Last 5 plans: 03-01 (~2m), 04-01 (~10m), 04-02 (~8m), 05-01 (~2m), 05-02 (~4m)
- Trend: On track

*Updated after each plan completion*
| Phase 02 P02 | 8 | 1 tasks | 1 files |
| Phase 02 P03 | 5 | 1 tasks | 1 files |
| Phase 03 P01 | 2 | 2 tasks | 3 files |
| Phase 04 P01 | 10 | 2 tasks | 2 files |
| Phase 04 P02 | 8 | 2 tasks | 1 files |
| Phase 05 P01 | 2 | 2 tasks | 2 files |
| Phase 05 P02 | 4 | 2 tasks | 1 files |
| Phase 06 P01 | 8 | 3 tasks | 3 files |
| Phase 06 P02 | 2 | 2 tasks | 2 files |
| Phase 07 P01 | 20 | 2 tasks | 5 files |
| Phase 7-options-in-settings-for-hotkeys-from-phase-02 P02 | 8 | 2 tasks | 4 files |
| Phase 9-remember-window-state-on-windows P01 | 8 | 2 tasks | 1 files |
| Phase 8 P01 | 8 | 2 tasks | 5 files |
| Phase 06 P03 | 8 | 2 tasks | 3 files |
| Phase 7.1-fix-hotkeys-settings-toggles P01 | 5 | 2 tasks | 1 files |
| Phase 10-adjust-tab-renaming P01 | 3 | 2 tasks | 5 files |
| Phase 6.1 P01 | 8 | 2 tasks | 3 files |
| Phase 5.1 P01 | 2 | 2 tasks | 2 files |
| Phase 5.1 P02 | 3 | 2 tasks | 1 files |
| Phase 1.1-dotfile-visibility-setting P01 | 8 | 2 tasks | 5 files |
| Phase 11-explorer-natural-sorting P01 | 12 | 2 tasks | 6 files |
| Phase 10-adjust-tab-renaming P02 | 6 | 2 tasks | 4 files |
| Phase 2.1 P02 | 20 | 2 tasks | 6 files |
| Phase 13 P01 | 8 | 2 tasks | 6 files |
| Phase 14 P01 | 8 | 2 tasks | 5 files |
| Phase 18 P01 | 10 | 2 tasks | 6 files |
| Phase 16 P01 | 8 | 2 tasks | 3 files |
| Phase 17 P01 | 4 | 2 tasks | 3 files |
| Phase 6.2 P01 | 1 | 1 tasks | 2 files |
| Phase 6.3 P01 | 2 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Remove dotfile filter entirely (no toggle) — user explicitly chose "show all"
- Roadmap: Handle hotkeys in xterm.js layer via attachCustomKeyEventHandler — terminal-specific, not app-wide
- Roadmap: Position new terminal button after project name above tab strip — user's explicit UI preference
- 01-01: Removed blanket dotfile filter from FileExplorer.js — both readDirectoryAsync and collectAllFiles patched; IGNORE_PATTERNS blocklist retained
- 02-01: Ctrl+Tab/Ctrl+Shift+Tab now switch terminal tabs via main-process IPC (before-input-event → ctrl-tab channel); Ctrl+Left/Right freed for word-jump in plan 02-02
- [Phase 02]: Ctrl+C uses e.key.toLowerCase() for cross-platform case variant support; word-jump escape sequences only for terminal-input channel (not FiveM/WebApp)
- 02-03: Right-click paste uses api.app.clipboardRead() (IPC path) — navigator.clipboard silently fails on focus loss during right-click in Electron
- 03-01: "+" button placed before filter-git-actions (not after) to preserve right-alignment via margin-left:auto; uses createTerminalForProject() not TerminalManager.createTerminal() to respect skipPermissions setting
- 04-01: openedProjectId (direct project ID) used for lastOpenedProjectId — more stable than selectedProjectFilter (index); lazy require in saveTerminalSessionsImmediate avoids circular deps
- 04-02: Restore loop placed after initializeState() before initI18n() — sequential tab recreation preserves order; projectsState.subscribe piggybacks on saveTerminalSessions debounce for lastOpenedProjectId tracking
- 05-01: _triggerSave uses lazy require of TerminalSessionService inside function call — same circular dep pattern as Phase 4
- 05-01: getState filters expandedFolders to only entry.loaded === true — avoids persisting in-flight phantom expansions
- 05-01: TerminalSessionService uses merge-before-write for explorer state — loads existing data first to preserve other projects' explorer state before overriding current project
- 05-02: loadSessionData() called inside projectsState.subscribe on each switch — reads fresh state from disk, no caching at module level
- 05-02: No separate startup restore code needed — Phase 4's setSelectedProjectFilter call on startup fires the same subscriber that handles project switches
- 06-01: findClaudeTerminalForProject uses latest-terminal-ID heuristic (monotonically increasing IDs) — multi-terminal edge case deferred as TODO
- 06-01: wireSessionIdCapture guards on e.source === 'hooks' — scraping emits sessionId: null, hooks provide real UUIDs
- 06-01: claudeSessionId: null in serialized tab data is intentional — Plan 06-02 checks for truthy before passing --resume
- [Phase 06]: resumeSessionId conditional spread prevents --resume null from being passed to PTY
- [Phase 06]: Watchdog checks getTerminal(id) null before acting — closeTerminal() removes terminal on PTY exit, so null means already cleaned up
- 07-01: Settings read at call-time (getSetting at runtime) in key handler — toggles take effect immediately without re-attaching xterm handlers
- 07-01: normalizeStoredKey inlined in TerminalManager to avoid circular dep with KeyboardShortcuts.js
- 07-01: ctrlC rebound: when custom key set, original Ctrl+C always sends SIGINT regardless of selection — unambiguous PTY behavior
- 07-01: rightClickCopyPaste disabled by default; rightClickPaste enabled by default — preserves Phase 02 right-click paste for existing users
- 07-01: ctrlTab marked rebindable: false — Ctrl+Tab switching is intercepted in main process via before-input-event, not renderer xterm handler
- [Phase 7-02]: 7-02: Startup sync uses !== false default so undefined/missing ctrlTab setting defaults to enabled
- [Phase 7-02]: 7-02: Lazy require inside ipcMain handler for setCtrlTabEnabled follows Phase 04 circular-dep pattern
- 09-01: Use screen.workArea (not screen.bounds) for display containment — workArea excludes taskbar, prevents restore behind it
- 09-01: normalBounds only updated when !isMaximized() — prevents maximized dimensions from being stored as normal bounds
- 09-01: x/y omitted (not undefined) from BrowserWindow options on first launch — lets Electron center the window
- 09-01: lazy require('electron').screen inside validateWindowState — screen not available before app.whenReady()
- [Phase 8]: 8-01: Use getSetting('updateTitleOnProjectSwitch') === false (not === true) so undefined/missing key defaults to enabled — safe upgrade behavior
- [Phase 8]: 8-01: Update both document.title and api.window.setTitle() — document.title for DOM, IPC setTitle for OS taskbar
- [Phase 8]: 8-01: Do NOT update .titlebar-title DOM element — managed by SettingsService.updateWindowTitle() for chat context
- [Phase 06]: 06-03: resumeSessionId added to createChatTerminal call — chat branch was silently dropping it
- [Phase 06]: 06-03: TerminalSessionService now saves mode per tab and allows chat-mode tabs
- [Phase 06]: 06-03: initClaudeEvents() moved before terminal restore — HooksProvider listens before resumed sessions emit SESSION_START
- [Phase 06]: 06-03: mode: tab.mode passed on restore — saved mode wins over defaultTerminalMode setting
- [Phase 7.1-fix-hotkeys-settings-toggles]: 7.1-01: Use toggle-option class (not terminal-shortcut-toggle) on label — connects to existing CSS without any CSS changes
- [Phase 7.1-fix-hotkeys-settings-toggles]: 7.1-01: terminal-shortcut-checkbox class on input retained — only used in JS querySelector, not CSS
- [Phase 10]: 10-01: tabRenameOnSlashCommand defaults to false (opt-in) — preserves haiku AI naming for existing users
- [Phase 10]: 10-01: getSetting() called inside PROMPT_SUBMIT callback (not cached) so toggle takes effect immediately without re-wiring
- [Phase 10]: 10-01: Tab name persists through /clear — no reset logic per user decision; only new slash command replaces it
- [Phase 6.1]: 6.1-01: lastActiveClaudeTab Map routes session IDs to focused tab — eliminates latest-ID heuristic ambiguity for multi-tab /clear scenario
- [Phase 6.1]: 6.1-01: saveTerminalSessionsImmediate() replaces debounced save in wireSessionIdCapture — crash-resilient session ID persistence after /clear
- [Phase 5.1]: _skipExplorerCapture flag in TerminalSessionService guards explorer state capture during terminal restore loop to prevent cold-start overwrite
- [Phase 5.1]: Counter-based async remaining counter in restoreState ensures scrollTop is applied after all folder loads complete
- [Phase 5.1]: 5.1-02: setSkipExplorerCapture(false) placed inside sessionData.projects block (not catch) — flag always paired with matching true call
- [Phase 5.1]: 5.1-02: saveTerminalSessionsImmediate called after saveAndShutdown in both quit handlers — explorer flush follows time-tracking flush consistently
- [Phase 1.1]: showDotfiles defaults to true — no behavior change for existing users; call-time getSetting read inside async function body so toggle takes effect immediately without reload
- [Phase 1.1]: Filter uses === false guard — undefined/missing key defaults to showing dotfiles (safe upgrade path)
- [Phase 11-01]: explorerNaturalSort defaults to true with !== false guard so undefined/missing key also defaults to natural sort ON (safe upgrade path)
- [Phase 11-01]: Module-level Intl.Collator instances (not per-call) — construction is expensive, created once at module load and reused for every sort
- [Phase 11-01]: _getNamePriority: dotfiles first (0), special-char prefix (1), normal alphanumeric last (2) within each dir/file group
- [Phase 11-01]: Search results use only name collator comparison (no dir-first or priority-tier) — collectAllFiles returns files only
- [Phase 10-02]: Use module-level getSetting in shouldSkipOscRename instead of lazy require — already in scope, no circular dep risk
- [Phase 10-02]: Guard both OSC call sites (working + ready-candidate) with shouldSkipOscRename helper to avoid code duplication
- [Phase 2.1-01]: shortcutCtrlCKey default 'C' (bare letter); rebound value is full key string like 'Ctrl+X'; rebind detected by !== 'C'; normalizeStoredKey called on stored key directly (not prefixed)
- [Phase 2.1-01]: terminalContextMenu flat key kept as-is — controls menu vs instant-paste, logically separate from shortcutXxx keys
- [Phase 2.1-01]: No migration shim for nested->flat: clean break; missing keys fall back to defaults via !== false guard
- [Phase 2.1]: 2.1-02: Always preventDefault on Ctrl+Left/Right to block Windows Snap; two-mode routing based on word-jump flag
- [Phase 2.1]: 2.1-02: Lazy require for setCtrlArrowWordJumpEnabled in IPC handler avoids circular dep (same pattern as setCtrlTabEnabled)
- [Phase 13]: showTabModeToggle uses !== false guard so undefined/missing key defaults to showing button (safe upgrade path)
- [Phase 14]: btn-resume-session placed before btn-new-terminal in HTML; CSS rules duplicated not shared; no disable logic as showSessionsModal handles empty state
- [Phase 18]: aiTabNaming defaults to true with !== false guard — safe upgrade path, existing users see no behavior change
- [Phase 18]: Guard on outer if condition of ChatView generateTabName blocks — both instant truncation and async haiku call skipped when disabled
- [Phase 18]: aiTabNaming guard added alongside shouldSkipOscRename in TerminalManager — keeps AI naming toggle and slash-command cooldown as separate concerns
- [Phase 18]: Slash-command rename toggle relocated from terminalGroup to new tabsGroup with relabeled i18n key (tabRenameOnSlashCommandTerminal)
- [Phase 16]: Phase 16: Use saveTerminalSessions() debounced for name mutations — frequent changes, not crash-critical
- [Phase 16]: Phase 16: mode pass-through in restore loop is prerequisite for chat-mode tabs to route through createChatTerminal and receive saved name
- [Phase 16]: Phase 16: Lazy require path is ../../services/TerminalSessionService from ui/components (not ../services/ as specified in plan)
- [Phase 17]: app.setAppUserModelId placed at top of bootstrapApp() on win32 — ensures runtime AUMID matches electron-builder appId before any window creation
- [Phase 17]: allowToChangeInstallationDirectory: false — prevents NSIS keepShortcuts=false path that forces shortcut recreation on every update
- [Phase 17]: isUpdated guard in customUnInstall wraps Delete shortcut line — desktop shortcut only removed on actual uninstall, not update runs
- [Phase 6.2]: 6.2-01: 200ms delay for post-restore scroll ensures fitAddon.fit() completes; scrollToBottom on loading->ready fires after history replay; broader behavior accepted
- [Phase 6.3]: 6.3-01: activeTabIndex computed as tabs.length - 1 at push time in same loop as cwd — guaranteed correct index
- [Phase 6.3]: 6.3-01: Lazy require for loadSessionData in filterByProject avoids circular dep (Phase 04/05/6.1 pattern)
- [Phase 6.3]: 6.3-01: Bounds-check savedIdx < visibleIds.length — silent fallback to firstVisibleId on out-of-range, no crash

### Pending Todos

4 pending todos (`.planning/todos/pending/`)

### Roadmap Evolution

- Phase 4 added: Remember every tab, every claude-session and the session context accross app restarts
- Phase 5 added: Remember Explorer State
- Phase 6 added: Resume Claude Sessions After Restart
- Phase 7 added: Options in Settings for Hotkeys from Phase 02
- Phase 8 added: Rename App Title to current selected project
- Phase 9 added: Remember Window State On Windows
- Phase 7.1 inserted after Phase 7: Fix Hotkeys Settings Toggles (URGENT)
- Phase 10 added: Adjust Tab Renaming
- Phase 6.1 inserted after Phase 6: Bugfix: save NewSessionId after Clear for restore to restore the correct session, not an old one (URGENT)
- Phase 5.1 inserted after Phase 5: Save Explorer-State within app starts and remember Scroll-Position (URGENT)
- Phase 1.1 inserted after Phase 1: Add Dotfile Visibility toggle setting under a new Explorer group in General settings (URGENT)
- Phase 11 added: explorer-natural-sorting
- Phase 12 added: Dashboard Support For DotNet Projects
- Phase 2.1 inserted after Phase 2: Fix PR #13 Review Issues for Terminal Keyboard Shortcuts (URGENT)
- Phase 13 added: Implement a setting to disable Chat/Terminal SwitchButton on Tabs
- Phase 14 added: Add resume session button near new terminal button with lightbulb icon
- Phase 15 added: Remember Projects width accross app restarts
- Phase 16 added: Remember Tab-Names of Claude-Sessions through app-restarts
- Phase 6.2 inserted after Phase 6: scroll to the very end on session resume in every tab (URGENT)
- Phase 17 added: On update-installation the pinned taskbar icon gets lost. Is there a whole uninstall and install happening?
- Phase 18 added: Disable Haiki Tab-Naming Settings toggle
- Phase 6.3 inserted after Phase 6: Remember active task on Project scope to restore it on project-swap and app restart (URGENT)

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 1 | Add support for SHIFT+Return -> Multiline in claude-terminals | 2026-02-24 | 2f2ae0b | | [1-add-support-for-shift-return-multiline-i](./quick/1-add-support-for-shift-return-multiline-i/) |
| 2 | Add Ctrl+Backspace word-delete to terminals | 2026-02-24 | fe7de79 | | [2-add-support-for-strg-backspace-to-delete](./quick/2-add-support-for-strg-backspace-to-delete/) |
| 3 | Fix context menu disappearing and toggle setting | 2026-02-25 | 57671a2 | Verified | [3-fix-context-menu-disappearing-and-add-se](./quick/3-fix-context-menu-disappearing-and-add-se/) |
| 4 | Middle-click on terminal tab closes it | 2026-02-25 | e39dfc7 | Verified | [4-feature-mouse-middleclick-tab-close](./quick/4-feature-mouse-middleclick-tab-close/) |

## Session Continuity

Last session: 2026-02-26
Stopped at: Completed 6.2-01-PLAN.md
Resume file: .planning/phases/6.3-remember-active-task-on-project-scope-to-restore-it-on-project-swap-and-app-restart/6.3-CONTEXT.md
