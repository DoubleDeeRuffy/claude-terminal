# Phase 7: Options in Settings for Hotkeys from Phase 02 - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose all terminal keyboard shortcuts implemented in Phase 02 as configurable settings in the existing ShortcutsManager panel. Users can toggle on/off and rebind each terminal hotkey. Also add right-click copy (selection → copy, no selection → paste, Windows Terminal style).

</domain>

<decisions>
## Implementation Decisions

### Hotkey scope
- All 5 Phase 02 hotkeys are configurable: Ctrl+C copy, Ctrl+V paste, right-click paste, Ctrl+Arrow word-jump, Ctrl+Tab tab-switching
- New hotkey added: right-click copies selected text (if selection exists) AND pastes (if no selection) — Windows Terminal behavior
- Total: 6 configurable terminal hotkeys
- Full rebinding supported — reuse the existing ShortcutsManager rebinding infrastructure

### Settings UI
- Terminal hotkeys appear in the existing Shortcuts panel (ShortcutsManager)
- Grouped under a separate "Terminal Shortcuts" heading/section within the panel
- No master toggle — each hotkey has its own individual enable/disable and rebind controls

### Default behavior
- On fresh install, all hotkeys enabled by default EXCEPT right-click copy/paste (disabled by default — non-standard behavior could surprise users expecting a context menu)
- Existing users keep current behavior (all 5 Phase 02 hotkeys remain active)
- Reset-to-defaults uses the existing ShortcutsManager pattern — no new UI needed

### Conflict handling
- Block with error when a user tries to rebind to a key combination already used by another shortcut
- No protected list — users can override global app shortcuts (Ctrl+T, Ctrl+W, etc.) if they choose to
- User is responsible for conflicts with global shortcuts

</decisions>

<specifics>
## Specific Ideas

- Right-click behavior mirrors Windows Terminal: right-click copies selection if text is selected, pastes clipboard if nothing is selected
- The existing ShortcutsManager already has reset-to-defaults — terminal shortcuts must integrate with that existing pattern
- Look at how defaults are currently set in ShortcutsManager and follow the same approach

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 7-options-in-settings-for-hotkeys-from-phase-02*
*Context gathered: 2026-02-25*
