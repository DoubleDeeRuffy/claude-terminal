# Phase 18: Disable Haiku Tab-Naming Settings toggle - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a settings toggle to disable the automatic AI-powered (haiku model) tab name generation. This covers both chat-mode tabs (where `generateTabName` calls haiku) and terminal-mode tabs (where OSC rename fires from Claude CLI). When disabled, tabs keep their default name with no auto-renaming.

</domain>

<decisions>
## Implementation Decisions

### Toggle behavior
- When OFF: no auto-renaming at all — tabs keep default name (e.g. "Terminal 1")
- Affects both chat-mode (haiku generateTabName) AND terminal-mode (OSC rename)
- Default state: ON (current behavior preserved for existing users — safe upgrade path)
- Independent from the existing "Rename tab on slash command" toggle — both can be configured separately

### Settings placement
- Create a new **Tabs** settings group in the settings panel
- Move the existing "Rename tab on slash command" toggle into this new Tabs group
- Rename moved toggle to "Terminal: rename tab on slash command"
- Add new "AI tab naming" toggle in the same Tabs group
- Label: "AI tab naming"
- Description: "Use AI to generate short tab names from messages"

### Claude's Discretion
- Exact ordering of toggles within the new Tabs group
- i18n key naming for new settings group and toggle
- Whether to use `=== false` or `!== true` guard pattern (follow existing conventions)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing toggle patterns in the codebase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-disable-haiki-tab-naming-settings-toggle*
*Context gathered: 2026-02-26*
