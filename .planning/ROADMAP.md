# Roadmap: Claude Terminal — UX Fixes

## Overview

Three self-contained UX fixes for an existing, mature Electron terminal application. Phase 1 removes the dotfile filter in the file explorer — the smallest change with zero dependencies, confirms the build loop. Phase 2 wires all five keyboard behaviors into the xterm.js key handler — the most risk-bearing change, requires resolving the Ctrl+Arrow conflict before writing code. Phase 3 adds the visible "New Terminal" button above the tab strip — spans three files but contains zero new logic.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Dotfile Visibility** - Remove the dotfile filter from both code paths in FileExplorer.js so all hidden files appear in tree and search
- [x] **Phase 2: Terminal Keyboard Shortcuts** - Wire Ctrl+C copy, Ctrl+V paste, right-click paste, and Ctrl+Arrow word-jump into the xterm.js key handler; remap tab-switching to Ctrl+Tab/Ctrl+Shift+Tab (completed 2026-02-24)
- [x] **Phase 3: New Terminal Button** - Add a visible "+" button after the project name, above the tab strip, wired to the existing createTerminal flow (completed 2026-02-24)

## Phase Details

### Phase 1: Dotfile Visibility
**Goal**: Users can see and find all dotfiles and dotfolders in their project tree
**Depends on**: Nothing (first phase)
**Requirements**: FILE-01, FILE-02
**Success Criteria** (what must be TRUE):
  1. User can see .planning, .git, .claude, .github and other dotfolders in the file explorer tree
  2. User can find dotfiles via Ctrl+P file search within the file explorer
  3. Standard non-dot files that were visible before continue to display correctly
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Remove dotfile filter from readDirectoryAsync and collectAllFiles in FileExplorer.js

### Phase 1.1: Add Dotfile Visibility toggle setting under a new Explorer group in General settings. Toggle controls whether dotfiles/dotfolders appear in the file explorer. Enabled by default. (INSERTED)

**Goal:** Users can toggle dotfile/dotfolder visibility in the file explorer via a setting in General settings, defaulting to visible
**Depends on:** Phase 1
**Requirements:** FILE-01, FILE-02
**Plans:** 1/1 plans complete

Plans:
- [ ] 1.1-01-PLAN.md — Add showDotfiles setting, Explorer toggle in General settings, dotfile filter in FileExplorer tree and search paths

### Phase 2: Terminal Keyboard Shortcuts
**Goal**: Users can use standard Windows terminal keyboard shortcuts — copy, paste, word-jump — without breaking SIGINT or tab-switching
**Depends on**: Phase 1
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04, TERM-05
**Success Criteria** (what must be TRUE):
  1. User can copy selected text with Ctrl+C; pressing Ctrl+C with no selection sends SIGINT as before
  2. User can paste clipboard content with Ctrl+V
  3. User can right-click in the terminal and select paste (or right-click directly pastes)
  4. User can jump by word with Ctrl+Left and Ctrl+Right inside the terminal PTY
  5. User can switch terminal tabs with Ctrl+Tab and Ctrl+Shift+Tab (tab-switching no longer on Ctrl+Arrow)
**Plans:** 3/3 plans complete

Plans:
- [x] 02-01-PLAN.md — Remap tab-switching from Ctrl+Arrow to Ctrl+Tab/Ctrl+Shift+Tab across all three input layers
- [x] 02-02-PLAN.md — Add Ctrl+C selection-gated copy, Ctrl+V paste, and Ctrl+Arrow word-jump to createTerminalKeyHandler
- [x] 02-03-PLAN.md — Add right-click paste via contextmenu listener using direct IPC clipboard path

### Phase 2.1: Fix PR #13 Review Issues for Terminal Keyboard Shortcuts (INSERTED)

**Goal:** Fix three PR #13 review issues: flatten nested terminalShortcuts settings to flat keys, restore Ctrl+Left/Right Windows Snap bypass with word-jump routing, and rebase on main
**Depends on:** Phase 2
**Requirements:** TERM-01, TERM-03, TERM-04, TERM-05, TERM-V2-01
**Plans:** 2/2 plans complete

Plans:
- [x] 2.1-01-PLAN.md — Flatten nested terminalShortcuts object to 8 flat shortcutXxx keys, update all consumers
- [x] 2.1-02-PLAN.md — Restore Ctrl+Left/Right Windows Snap bypass with word-jump IPC chain, rebase branch on main

### Phase 3: New Terminal Button
**Goal**: Users can create a new terminal with one click from a visible button above the tab strip
**Depends on**: Phase 2
**Requirements**: TMGR-01
**Success Criteria** (what must be TRUE):
  1. A "+" button is visible after the project name, above the terminal tab strip
  2. Clicking the button opens a new terminal tab, identical to pressing Ctrl+T
  3. The button appears and works consistently across all project types (general, FiveM, WebApp, Python)
**Plans:** 1 plan

Plans:
- [x] 03-01-PLAN.md — Add "+" button HTML/CSS in index.html and terminal.css, wire click handler in renderer.js

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Dotfile Visibility | 1/1 | Complete | 2026-02-24 |
| 2. Terminal Keyboard Shortcuts | 3/3 | Complete    | 2026-02-24 |
| 3. New Terminal Button | 1/1 | Complete    | 2026-02-24 |

### Phase 4: Remember every tab, every claude-session and the session context accross app restarts

**Goal:** Terminal tabs persist across app restarts — each project recreates its tabs in the same working directories, and the last opened project is restored
**Depends on:** Phase 3
**Requirements:** SESS-01, SESS-02, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. When the app restarts, each project's terminal tabs are re-created in their saved working directories
  2. The last opened project is selected and visible after restart
  3. Terminal state is saved continuously (survives crashes, not just clean shutdowns)
  4. Deleting a project cleans up its saved terminal session data
  5. Projects with missing directories are silently skipped during restore
**Plans:** 2/2 plans complete

Plans:
- [x] 04-01-PLAN.md — Create TerminalSessionService and wire save hooks into TerminalManager
- [x] 04-02-PLAN.md — Wire restore at startup, last-opened-project tracking, and deletion cleanup in renderer.js

### Phase 5: Remember Explorer State

**Goal:** File explorer expanded folders and panel visibility persist per-project across project switches and app restarts
**Depends on:** Phase 4
**Requirements:** EXPL-01, EXPL-02, EXPL-03, EXPL-04
**Success Criteria** (what must be TRUE):
  1. When switching between projects, expanded folders are restored to exactly how the user left them
  2. When the app restarts, the last project's expanded folders reappear as before
  3. If a project's panel was hidden, it stays hidden when switching back to that project
  4. Explorer state is saved continuously (survives crashes)
  5. Deleting a project cleans up its saved explorer state
  6. Missing folders on disk are silently skipped during restore
**Plans:** 2 plans

Plans:
- [x] 05-01-PLAN.md — Add getState/restoreState to FileExplorer.js, extend TerminalSessionService to persist explorer state
- [x] 05-02-PLAN.md — Wire restore into renderer.js project-switch subscriber and add save triggers to FileExplorer events

### Phase 5.1: Save Explorer-State within app starts and remember Scroll-Position (INSERTED)

**Goal:** Explorer state (expanded folders, panel visibility) survives cold-start app restarts and file tree scroll position is persisted per-project, restored after restarts and project switches
**Depends on:** Phase 5
**Requirements:** EXPL-01, EXPL-03
**Plans:** 2/2 plans complete

Plans:
- [ ] 5.1-01-PLAN.md — Fix cold-start overwrite guard in TerminalSessionService, add scrollTop to FileExplorer getState/restoreState with counter-based async restore and debounced scroll listener
- [ ] 5.1-02-PLAN.md — Wire setSkipExplorerCapture around startup terminal restore loop, add saveTerminalSessionsImmediate flush to onWillQuit and beforeunload handlers

### Phase 6: Resume Claude Sessions After Restart

**Goal:** Persist Claude terminal session IDs so that after an app restart, each terminal reconnects to its previous Claude session via `claude --resume <session-id>` instead of starting fresh
**Depends on:** Phase 5
**Requirements:** SESS-01, SESS-02, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. When the app restarts, terminals that had an active Claude session resume via `claude --resume <session-id>` instead of starting fresh
  2. Plain shell terminals restore normally (existing Phase 4 behavior unchanged)
  3. Session IDs are captured continuously from hooks events (crash-resilient)
  4. If a resume fails (stale session), the terminal automatically falls back to a fresh Claude session within 5 seconds
  5. When hooks are disabled (scraping mode), terminals restore as before without resume (graceful degradation)
**Plans:** 3 plans

Plans:
- [x] 06-01-PLAN.md — Capture session IDs from hooks events, persist in TerminalSessionService, fix resumeSession termData
- [x] 06-02-PLAN.md — Thread resumeSessionId through createTerminal and restore loop, add resume failure watchdog
- [ ] 06-03-PLAN.md — Gap closure: forward resumeSessionId in chat mode, save/restore tab mode, fix init order

### Phase 6.4: bugfix-session-resume-claudeSessionId-not-persisted-across-restarts (INSERTED)

**Goal:** Fix claudeSessionId and cwd not being stored on termData at creation time, causing session resume to fail after app restart
**Depends on:** Phase 6
**Plans:** 1/1 plans complete

Plans:
- [ ] 6.4-01-PLAN.md — Add claudeSessionId and cwd fields to termData object in createTerminal

### Phase 6.3: Remember active task on Project scope to restore it on project-swap and app restart (INSERTED)

**Goal:** Persist the active terminal tab per project and restore it on project-swap and app restart so users land on exactly the tab they were last working in
**Depends on:** Phase 6
**Requirements:** SESS-01, SESS-02
**Plans:** 1/1 plans complete

Plans:
- [ ] 6.3-01-PLAN.md — Persist activeTabIndex in TerminalSessionService and restore in filterByProject

### Phase 6.2: scroll to the very end on session resume in every tab (INSERTED)

**Goal:** All restored terminal tabs scroll to the very bottom after app restart so users see the most recent output, not a mid-session scroll position
**Depends on:** Phase 6
**Requirements:** SESS-01
**Plans:** 2/2 plans complete

Plans:
- [x] 6.2-01-PLAN.md — Add post-restore scroll-all loop in renderer.js and loading→ready scroll hook in TerminalManager.js
- [ ] 6.2-02-PLAN.md — Replace fixed 200ms timeout and premature loading→ready scroll with silence-based PTY detection

### Phase 6.1: Bugfix: save NewSessionId after Clear for restore to restore the correct session, not an old one (INSERTED)

**Goal:** Fix session ID staleness after /clear — update stored session ID on every SESSION_START, use last-active-tab tracking for multi-tab correctness, and save immediately to disk for crash resilience
**Depends on:** Phase 6
**Plans:** 1/1 plans complete

Plans:
- [ ] 6.1-01-PLAN.md — Export saveTerminalSessionsImmediate, add last-active-tab tracking, fix wireSessionIdCapture, hook TerminalManager setActiveTerminal

### Phase 7: Options in Settings for Hotkeys from Phase 02

**Goal:** Users can enable/disable and configure each terminal keyboard shortcut from the Settings panel, including a new Windows Terminal-style right-click copy/paste behavior
**Depends on:** Phase 6
**Requirements:** TERM-V2-01
**Success Criteria** (what must be TRUE):
  1. User sees a "Terminal Shortcuts" section in the Shortcuts settings panel with 6 hotkey rows
  2. User can toggle each terminal hotkey on/off individually
  3. Disabling a hotkey immediately stops it from working in the terminal
  4. Right-click copy/paste (Windows Terminal style) works when enabled and is disabled by default
  5. Disabling Ctrl+Tab in settings stops tab-switching (main process respects the setting via IPC)
  6. Existing users keep all Phase 02 hotkeys active (backward compatible defaults)
**Plans:** 2/2 plans complete

Plans:
- [x] 7-01-PLAN.md — Add terminal shortcut settings, UI toggles in ShortcutsManager, gate hotkeys in TerminalManager, implement rightClickCopyPaste
- [ ] 7-02-PLAN.md — Wire Ctrl+Tab enable/disable IPC chain from renderer to main process, sync on startup and settings change

### Phase 7.1: Fix Hotkeys Settings Toggles (INSERTED)

**Goal:** Fix terminal shortcut toggle switches to render as styled pill toggles instead of raw HTML checkboxes (CSS class mismatch from Phase 7)
**Depends on:** Phase 7
**Plans:** 1/1 plans complete

Plans:
- [ ] 7.1-01-PLAN.md — Fix CSS class mismatch: change terminal-shortcut-toggle to toggle-option in ShortcutsManager.js

### Phase 8: Rename App Title to current selected project

**Goal:** Window title reflects the currently selected project name for external time-tracking tool detection
**Depends on:** Phase 7
**Requirements:** TITLE-01, TITLE-02
**Plans:** 1/1 plans complete

Plans:
- [x] 8-01-PLAN.md — Add updateTitleOnProjectSwitch setting, toggle UI, i18n, and projectsState subscriber for window title updates

### Phase 9: Remember Window State On Windows

**Goal:** Window position, size, and maximized state persist across app restarts — the window reappears exactly where the user left it, including on multi-monitor setups
**Depends on:** Phase 8
**Requirements:** WIN-01, WIN-02, WIN-03
**Plans:** 1/1 plans complete

Plans:
- [ ] 9-01-PLAN.md — Add window state persistence to MainWindow.js: load/validate/save bounds with multi-monitor support

### Phase 10: Adjust Tab Renaming

**Goal:** Terminal tabs auto-rename to the last slash command executed when an opt-in setting is enabled, using HooksProvider PROMPT_SUBMIT events
**Depends on:** Phase 9
**Requirements:** TAB-RENAME-01
**Plans:** 2/2 plans complete

Plans:
- [x] 10-01-PLAN.md — Add wireTabRenameConsumer, tabRenameOnSlashCommand setting + toggle UI, i18n keys
- [ ] 10-02-PLAN.md — Gap closure: move toggle to Claude > Terminal group, export updateTerminalTabName, guard OSC overwrite

### Phase 11: explorer-natural-sorting

**Goal:** File explorer sorts filenames with natural numeric ordering (file2 before file10), with directories first, dotfiles prioritized within groups, and a settings toggle to switch between natural and alphabetical sort
**Depends on:** Phase 10
**Requirements:** EXPL-SORT-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 11-01-PLAN.md — Add natural sort comparator, settings toggle in Explorer group, i18n keys

### Phase 12: Dashboard Support For DotNet Projects

**Goal:** Users with .NET projects see SDK-specific dashboard badge and framework stats, with detection supporting .sln/.csproj at root and one level deep
**Depends on:** Phase 11
**Requirements:** DOTNET-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 12-01-PLAN.md — Create dotnet project type plugin (detection, badge, stats, i18n) and extend DashboardService one-level-deep detection

### Phase 13: Implement a setting to disable Chat/Terminal SwitchButton on Tabs

**Goal:** Users can hide the Chat/Terminal mode-switch button on terminal tabs via a settings toggle, locking tabs to the default terminal mode
**Depends on:** Phase 12
**Requirements:** TAB-MODE-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 13-01-PLAN.md — Add showTabModeToggle setting, toggle UI in Claude > Terminal group, CSS body-class hiding rule, i18n strings

### Phase 14: Add resume session button near new terminal button with lightbulb icon

**Goal:** Users can resume a previous Claude session from a visible lightbulb button in the terminal toolbar, next to the new terminal (+) button
**Depends on:** Phase 13
**Requirements:** SESS-RESUME-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 14-01-PLAN.md — Add resume session button (HTML, CSS, click handler, i18n) in terminals-filter bar

### Phase 15: Remember Projects width accross app restarts

**Goal:** [To be planned]
**Depends on:** Phase 14
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:discuss-phase 15 to break down)

### Phase 15.1: Remember Notification State across app restarts (INSERTED)

**Goal:** [Urgent work - to be planned]
**Depends on:** Phase 15
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:discuss-phase 15.1 to break down)

### Phase 16: Remember Tab-Names of Claude-Sessions through app-restarts

**Goal:** Tab names persist across app restarts — restored tabs display the exact name they had before shutdown, covering all name sources (user renames, AI haiku names, slash-command names, defaults)
**Depends on:** Phase 15
**Requirements:** TAB-PERSIST-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 16-01-PLAN.md — Add name to serialized tab object, trigger save on all name-mutation paths, pass saved name and mode in restore loop

### Phase 17: On update-installation the pinned taskbar icon gets lost. Is there a whole uninstall and install happening?

**Goal:** Fix Windows taskbar pin loss on auto-update by setting explicit AUMID, disabling forced shortcut recreation, and guarding shortcut deletion during update runs
**Depends on:** Phase 16
**Requirements:** PIN-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 17-01-PLAN.md — Set explicit AppUserModelId, disable allowToChangeInstallationDirectory, guard customUnInstall shortcut deletion

### Phase 18: Disable Haiki Tab-Naming Settings toggle

**Goal:** Users can disable automatic AI-powered tab name generation via a settings toggle in a new Tabs group, affecting both chat-mode haiku naming and terminal-mode OSC rename
**Depends on:** Phase 17
**Requirements:** TAB-NAME-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 18-01-PLAN.md — Add aiTabNaming setting, guard ChatView and TerminalManager rename call sites, create Tabs settings group with toggle and relocated slash-command toggle, i18n

### Phase 19: 10.1 Tab-Renaming-For-Resume-Dialog

**Goal:** Resume session dialog displays saved tab names instead of "Untitled conversation" and metadata text is readable with accent color
**Depends on:** Phase 18
**Requirements:** TAB-RESUME-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 19-01-PLAN.md — Propagate tab names to session-names.json from both rename paths, fix metadata accent color

### Phase 20: Bugfix-Swap-Projects-Selected-Tab

**Goal:** [To be planned]
**Depends on:** Phase 19
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:discuss-phase 20 to break down)
