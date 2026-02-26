# Phase 20: Bugfix-Swap-Projects-Selected-Tab - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the bug where switching between projects always resets to the first tab instead of remembering the last-active tab. Restore the previously-active tab and its scroll position when switching back to a project.

</domain>

<decisions>
## Implementation Decisions

### Bug behavior
- When switching projects, the app always resets to the first tab instead of restoring the last-active tab
- This affects all tab types (terminal and chat) — fix both uniformly

### Tab restoration
- Remember which tab was active per project and restore it when switching back
- Also restore the scroll position for both terminal output and chat scroll
- Memory is within-session only — on app restart, use existing restore logic (Phase 04/06)
- Tab switch should be instant with no animation/transition

### Fallback behavior
- If the remembered tab no longer exists (was closed), fall back to the first available tab
- Fresh projects with no terminals: keep existing behavior unchanged — only fix tab-selection for projects with existing tabs

### Claude's Discretion
- Where to store the per-project active-tab state (in-memory map, state module, etc.)
- How to capture and restore scroll positions efficiently
- Whether to debounce scroll position captures

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The key behavior is: switch away from Project A (on tab 3, scrolled halfway), open Project B, switch back to Project A → land on tab 3 at the same scroll position.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-bugfix-swap-projects-selected-tab*
*Context gathered: 2026-02-26*
