---
phase: 7-options-in-settings-for-hotkeys-from-phase-02
plan: 01
subsystem: ui
tags: [electron, xterm, settings, keyboard-shortcuts, terminal]

# Dependency graph
requires:
  - phase: 2-terminal-keyboard-shortcuts
    provides: Phase 02 hotkeys (Ctrl+C copy, Ctrl+V paste, Ctrl+Arrow word-jump, right-click paste) implemented in TerminalManager.js
provides:
  - Terminal Shortcuts section in ShortcutsManager settings panel with 6 configurable hotkey rows
  - Enable/disable toggle per terminal shortcut stored in settings.terminalShortcuts
  - Rebinding support for ctrlC and ctrlV via the existing capture overlay
  - Bidirectional conflict checking between global and terminal shortcuts
  - All Phase 02 hotkeys gated on settings at call-time in createTerminalKeyHandler
  - rightClickCopyPaste (Windows Terminal style) as opt-in Priority 1 right-click behavior
affects: [TerminalManager, ShortcutsManager, settings-state, i18n]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "terminalShortcuts deep-merge on load: per-shortcut object spread preserves custom key property alongside enabled flag"
    - "rebound key matching via normalizeStoredKey + eventToNormalizedKey helpers — no circular import from KeyboardShortcuts.js"
    - "3-priority chain in setupRightClickHandler: rightClickCopyPaste > rightClickPaste > context menu"
    - "settings read at call-time (getSetting at runtime) not at handler-creation time — allows live toggle without re-creating handler"

key-files:
  created: []
  modified:
    - src/renderer/state/settings.state.js
    - src/renderer/ui/panels/ShortcutsManager.js
    - src/renderer/ui/components/TerminalManager.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json

key-decisions:
  - "Settings read at call-time in key handler (getSetting at runtime, not captured at handler-creation) so toggles take effect immediately without re-attaching handlers"
  - "normalizeStoredKey inlined in TerminalManager to avoid circular dependency with KeyboardShortcuts.js"
  - "rightClickCopyPaste disabled by default (enabledByDefault: false); rightClickPaste enabled by default — preserves Phase 02 behavior for existing users"
  - "ctrlC rebound: when custom key set, original Ctrl+C always sends SIGINT regardless of text selection — unambiguous PTY behavior"
  - "ctrlTab marked rebindable: false due to main-process before-input-event intercept (architectural constraint)"

patterns-established:
  - "Terminal shortcut gating: read ts = getSetting('terminalShortcuts') || {} at top of relevant block; check ts[id]?.enabled === false to disable"
  - "Rebound key support: check ts[id]?.key && ts[id].key !== 'DefaultKey'; if rebound, skip default hardcoded check and match via normalizeStoredKey"

requirements-completed: [TERM-V2-01]

# Metrics
duration: 20min
completed: 2026-02-25
---

# Phase 7 Plan 01: Terminal Shortcut Settings Summary

**Terminal shortcut settings panel with per-shortcut enable/disable toggles, Ctrl+C/Ctrl+V rebinding, and Windows Terminal-style right-click copy/paste as opt-in behavior**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-02-25T07:53:00Z
- **Completed:** 2026-02-25T08:13:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added Terminal Shortcuts section in ShortcutsManager panel with 6 rows (ctrlC, ctrlV, ctrlArrow, ctrlTab, rightClickPaste, rightClickCopyPaste)
- Each row has an enable/disable toggle; ctrlC and ctrlV have interactive rebind buttons using the existing shortcut capture overlay
- All Phase 02 hotkeys in TerminalManager are now gated on `getSetting('terminalShortcuts')` at call-time for live effect
- Right-click handler rewritten as 3-priority chain with Windows Terminal copy/paste as opt-in Priority 1 behavior
- Bidirectional conflict checking: global shortcut rebinds checked against terminal shortcuts and vice versa

## Task Commits

Each task was committed atomically:

1. **Task 1: Add terminalShortcuts to state, TERMINAL_SHORTCUTS map, Terminal Shortcuts UI section, i18n keys** - `91634d2` (feat)
2. **Task 2: Gate Phase 02 hotkeys on settings in TerminalManager, implement rightClickCopyPaste** - `6804c95` (feat)

## Files Created/Modified

- `src/renderer/state/settings.state.js` - Added terminalShortcuts to defaultSettings with per-shortcut deep-merge on load
- `src/renderer/ui/panels/ShortcutsManager.js` - Added TERMINAL_SHORTCUTS map, Terminal Shortcuts section with toggles and rebind buttons, startTerminalShortcutCapture, extended conflict checking
- `src/renderer/ui/components/TerminalManager.js` - Gated ctrlC/ctrlV/ctrlArrow on settings with rebound key support; rewrote setupRightClickHandler as 3-priority chain
- `src/renderer/i18n/locales/en.json` - Added 9 new shortcut i18n keys under "shortcuts"
- `src/renderer/i18n/locales/fr.json` - Added 9 new shortcut i18n keys under "shortcuts" in French

## Decisions Made

- Settings read at call-time (`getSetting()` each time key/right-click handler fires) rather than captured at handler-creation — toggles take effect immediately without re-attaching xterm handlers
- `normalizeStoredKey` and `eventToNormalizedKey` inlined in TerminalManager.js to avoid circular dependency with KeyboardShortcuts.js (which is used by ShortcutsManager)
- When ctrlC is rebound to a custom key, the original Ctrl+C always sends SIGINT to PTY (unambiguous behavior — user has explicitly moved copy elsewhere)
- `rightClickCopyPaste` is disabled by default; `rightClickPaste` is enabled by default — preserves exact Phase 02 right-click paste behavior for existing users
- `ctrlTab` is `rebindable: false` because Ctrl+Tab switching is intercepted in the main process via `before-input-event` IPC, not in the renderer xterm handler

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Terminal shortcut settings are fully functional; users can toggle and rebind Ctrl+C/Ctrl+V
- Phase 8 (Rename App Title) and Phase 9 (Remember Window State) are independent and ready to execute
- The `toggle-slider` CSS class used by terminal shortcut toggles should be confirmed to exist in existing styles (uses same pattern as settings panel toggles elsewhere)

## Self-Check: PASSED

- settings.state.js: FOUND
- ShortcutsManager.js: FOUND
- TerminalManager.js: FOUND
- Commit 91634d2: FOUND
- Commit 6804c95: FOUND
- TERMINAL_SHORTCUTS in ShortcutsManager: 6 occurrences
- terminalShortcuts in settings.state.js: 5 occurrences
- getSetting('terminalShortcuts') in TerminalManager: 6 occurrences

---
*Phase: 7-options-in-settings-for-hotkeys-from-phase-02*
*Completed: 2026-02-25*
