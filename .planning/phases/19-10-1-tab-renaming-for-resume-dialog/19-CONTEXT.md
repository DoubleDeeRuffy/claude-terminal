# Phase 19: 10.1 Tab-Renaming-For-Resume-Dialog - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The resume session dialog (Phase 14's lightbulb button) shows saved Claude sessions for resuming. This phase ensures that tab names (from all rename sources: saved name, slash command, AI haiku naming) are displayed in the resume dialog instead of generic "Untitled conversation" text, and fixes metadata readability by applying accent/theme color.

</domain>

<decisions>
## Implementation Decisions

### Session name in resume dialog
- Replace "Untitled conversation" with the saved tab name from app session data
- All naming sources feed into this: saved tab name (Phase 16), slash command rename (Phase 10), AI haiku naming (Phase 18)
- Sessions without a saved tab name fall back to the project name (current behavior)
- Session name styling stays untouched — no font/size changes, only replace the text content

### Metadata readability
- All 3 metadata elements (timestamp, branch, and any other info text) use the accent/theme color
- This fixes the current unreadable state of metadata text in dialog entries

### Data source strategy
- Merge Claude session files (source of truth for session ID, timestamps) with app's saved terminal session data (for tab names)
- Claude session files remain the primary/authoritative source

### Rename propagation
- Every tab rename triggers an immediate save to session data
- Resume dialog always shows the latest tab name, not stale data

</decisions>

<specifics>
## Specific Ideas

- The dialog currently shows "Untitled conversation" and unreadable metadata — both are the core problems to fix
- Tab rename from any source (slash command, AI haiku, manual) must propagate to the resume dialog's session entry

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-10-1-tab-renaming-for-resume-dialog*
*Context gathered: 2026-02-26*
