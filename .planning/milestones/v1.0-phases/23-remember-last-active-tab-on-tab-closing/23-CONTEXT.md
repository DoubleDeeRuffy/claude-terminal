# Phase 23: Remember-Last-Active-Tab-On-Tab-Closing - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

When a terminal tab is closed, the app should switch to the previously active tab within the same project — not just the first tab found. This mirrors browser tab-close behavior where closing a tab returns you to the tab you were on before, not an arbitrary one.

Currently `closeTerminal()` picks the first same-project terminal via a simple `forEach` scan (TerminalManager.js:1366-1370). This phase replaces that with a per-project history stack.

</domain>

<decisions>
## Implementation Decisions

### Tab history scope
- Per-project history stack — each project maintains its own ordered list of recently-active tab IDs
- Closing a tab switches to the last active tab within that same project
- Global cross-project history is not tracked

### History stack depth
- Full history — track every tab activation in order, no cap
- The stack is bounded naturally by the number of open tabs per project
- Closing tabs walks back through the complete activation history (like browser tab close)

### Fallback behavior
- Walk back the history stack: if the most-recent entry is gone, try the next-oldest, and so on
- If the entire stack is exhausted (all previously-active tabs are closed), fall back to the nearest neighboring tab in the tab strip
- Existing behavior (switch to sessions panel when no tabs remain) is preserved

### Tab type coverage
- All tab types participate equally: terminal, chat, and file/markdown viewer tabs
- Unified behavior — the history stack tracks whatever tab was last active regardless of type

### Claude's Discretion
- Data structure choice for the per-project history stack (array, linked list, etc.)
- Whether to persist the history stack across app restarts or keep it in-memory only
- Integration approach with existing `lastActivePerProject` Map from Phase 20

</decisions>

<specifics>
## Specific Ideas

- Behavior should match browser tab-close UX — closing a tab returns to where you were before, not a random tab
- The existing `lastActivePerProject` Map (Phase 20) tracks only a single last-active ID per project; this phase extends that concept to a full ordered stack

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-remember-last-active-tab-on-tab-closing*
*Context gathered: 2026-02-27*
