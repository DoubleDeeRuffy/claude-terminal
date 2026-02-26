# Phase 13: Implement a setting to disable Chat/Terminal - SwitchButton on Tabs - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a settings toggle that controls whether the Chat/Terminal mode-switch button appears on terminal tabs. The button currently shows on hover for all Claude terminals, allowing users to toggle between terminal and chat mode. This phase adds the ability to hide it entirely.

</domain>

<decisions>
## Implementation Decisions

### Setting location & default
- Setting lives in **Claude > Terminal** settings group (alongside ctrlTab, rightClickPaste toggles from Phase 7)
- Setting key: `showTabModeToggle` (or similar — Claude's discretion on exact key name)
- Default: **shown** (enabled) — uses `!== false` guard so undefined/missing key defaults to showing the button (safe upgrade path)
- Label text: **"Show mode switch on tabs"**

### Toggle effect on open tabs
- Toggling the setting applies **immediately** to all open tabs — no reload or new-tab-only behavior
- Implementation pattern: read `getSetting()` at call-time (runtime check), not cached — matches Phase 7 convention where toggles take effect immediately without re-attaching handlers
- The button stays in the DOM — hidden via CSS (`display: none` or similar), not removed from DOM. A CSS class on a parent element (e.g., body or terminal container) driven by the setting controls visibility

### Mode interaction when button is hidden
- **No fallback mechanism** — when the button is hidden, users are locked to whatever mode `defaultTerminalMode` dictates
- No context menu option, no keyboard shortcut — users who hide the button want a single mode
- Users can still change `defaultTerminalMode` in settings to control which mode new tabs open in

### Claude's Discretion
- Exact setting key name (e.g., `showTabModeToggle`, `tabModeToggle`, `showModeSwitchButton`)
- CSS implementation approach for hiding (class on body vs per-tab check)
- i18n key naming convention
- Tooltip/description text for the setting toggle

</decisions>

<specifics>
## Specific Ideas

- Follow the exact same pattern as Phase 7 settings toggles — same CSS class structure (`toggle-option` label, `terminal-shortcut-checkbox` input), same getSetting() runtime read pattern
- Keep in mind previous PR review feedback from Sterll — clean, minimal changes, no over-engineering

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-implement-a-setting-to-disable-chat-terminal-switchbutton-on-tabs*
*Context gathered: 2026-02-26*
