# Phase 11: Explorer Natural Sorting - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the FileExplorer's alphabetical sort with natural sorting so numeric sequences in filenames are compared as numbers (e.g., `file2` before `file10`). Add a setting toggle to switch between natural and alphabetical sort. FileExplorer only — does not affect Project List.

</domain>

<decisions>
## Implementation Decisions

### Sorting behavior
- Natural numeric sorting: treat numeric segments as numbers (file1 < file2 < file10 < file20)
- Case-insensitive comparison (apple.txt and Apple.txt sort together)
- Leading zeros ignored (file01 and file1 treated as same numeric value)
- Reference: Windows Explorer natural sort behavior

### Sort order preferences
- Directories always sort before files (current behavior preserved)
- Dotfiles/dotfolders sort at the top within their group (before regular items)
- Special-character-prefixed names (_utils, -config, #notes) sort before alphanumeric names

### Comparison scope
- Natural sort applies to both folder tree view AND search results
- FileExplorer only — Project List sidebar keeps its user-defined order
- Toggle lives in Explorer settings group (alongside existing dotfiles toggle)
- Default for new users: natural sort ON

### Claude's Discretion
- Natural sort algorithm implementation (regex-based, `Intl.Collator` with `numeric: true`, or custom)
- i18n key naming and label wording for the toggle
- How to handle edge cases (emoji filenames, Unicode, very long numeric sequences)

</decisions>

<specifics>
## Specific Ideas

- "Match Windows Explorer's natural sort behavior as closely as possible"
- Setting toggle in the Explorer group under General settings, consistent with the dotfiles visibility toggle pattern from Phase 1.1

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-explorer-natural-sorting*
*Context gathered: 2026-02-25*
