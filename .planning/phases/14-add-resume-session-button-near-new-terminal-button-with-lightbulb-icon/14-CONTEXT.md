# Phase 14: Add Resume Session Button Near New Terminal Button with Lightbulb Icon - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a resume session button with a lightbulb icon in the terminals-filter bar, next to the existing new terminal (+) button. Clicking it opens the existing sessions modal for the current project. No new session management UI or session listing changes are in scope.

</domain>

<decisions>
## Implementation Decisions

### Button placement & trigger
- Button goes in the `terminals-filter` bar, **before** the new terminal (+) button
- Clicking opens the existing sessions modal (the one already built into TerminalManager.js)
- Follows `terminals-filter` visibility rules — hidden when no project is selected, shown when a project is open
- Works standalone on current upstream/main (PR #11 new terminal button is already merged)

### Visual design
- **Outline/stroke lightbulb** SVG icon — consistent with the + icon's stroke-based style
- CSS class: `filter-resume-session-btn` (matches `filter-new-terminal-btn` pattern)
- HTML id: `btn-resume-session`
- Tooltip: "Resume Claude session" (i18n key in both en.json and fr.json, using `data-i18n-title`)

### Session selection UX
- Opens the existing sessions modal — no new picker UI needed
- If no sessions exist for the project, the modal opens and shows its existing empty state
- No button disable logic needed — always clickable when visible

### Claude's Discretion
- Exact lightbulb SVG path design
- CSS hover/active state specifics (should match existing button patterns)
- French translation for the tooltip
- Exact i18n key naming convention

</decisions>

<specifics>
## Specific Ideas

- The button must be **next to** the new terminal button — user was explicit about this
- Placed **before** (to the left of) the + button, so the order is: lightbulb (resume) | + (new terminal)
- Should feel like a natural pair with the new terminal button

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-add-resume-session-button-near-new-terminal-button-with-lightbulb-icon*
*Context gathered: 2026-02-26*
