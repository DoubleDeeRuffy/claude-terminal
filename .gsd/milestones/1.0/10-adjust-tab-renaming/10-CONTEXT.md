# Phase 10: Adjust Tab Renaming - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Adjust terminal tab naming so that tabs auto-rename to the last slash command executed in the session. This is a new opt-in setting in Terminal Settings. When enabled, the tab displays the project name by default, then switches to the full slash command string (e.g., `/gsd:verify-work 12`) whenever a slash command is submitted. The name persists until the next slash command replaces it — including across `/clear`.

</domain>

<decisions>
## Implementation Decisions

### Detection source
- Use HooksProvider PROMPT_SUBMIT events to detect slash commands
- Only `/slash-command` patterns trigger rename — regular prompts do not
- Capture the full command including arguments (e.g., `/gsd:verify-work 12`, not just `/gsd:verify-work`)

### Tab name format
- Slash command only — no project prefix, no decoration
- Tab displays exactly what was typed: `/gsd:verify-work 12`
- Default tab name (before any slash command) = project name

### Settings toggle
- New toggle in Terminal Settings section
- When ON: project name → slash command on detection → next slash command replaces previous
- When OFF: current behavior unchanged (haiku AI-generated names)
- Setting should be read at runtime (not cached) so toggling takes effect immediately

### Persistence across /clear
- `/clear` does NOT reset the tab name — the last slash command name sticks
- Only a new slash command replaces the current name
- On session restart (new PTY), tab reverts to project name default

### Claude's Discretion
- Exact setting key name and default value
- How to wire HooksProvider event to tab rename logic
- Whether to truncate extremely long slash commands in the tab

</decisions>

<specifics>
## Specific Ideas

- "For a session I want to name the tab to the last slash command executed"
- "This must work with /clear — after clear, the tab keeps the slash command name"
- This is a new feature branch with a later PR — work on dedicated branch

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-adjust-tab-renaming*
*Context gathered: 2026-02-25*
