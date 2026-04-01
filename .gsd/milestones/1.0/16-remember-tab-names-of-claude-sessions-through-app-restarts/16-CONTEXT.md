# Phase 16: Remember Tab-Names of Claude-Sessions through app-restarts - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist tab names across app restarts so that when terminal sessions are restored, each tab retains the name it had before shutdown. This covers all tab name sources (user renames, AI haiku names, slash-command names, default names). No new naming features are added — only persistence of existing names.

</domain>

<decisions>
## Implementation Decisions

### Name sources
- Persist ALL tab names — whatever the tab currently shows at save time gets restored
- Includes: user renames, AI-generated haiku names, slash-command derived names, and default names ("Terminal 1")
- No re-generation of AI names on restore — saved name is used as-is, avoiding unnecessary API calls

### Restore behavior
- Restored tabs look identical to before restart — no visual indicator that a name was restored
- Restored tabs behave normally — new slash commands, user renames, and AI naming all work as usual on restored tabs

### Name lifecycle
- Tab name persists through /clear (consistent with Phase 10 decision)
- Save tab names on every name change (immediate persistence), not just at shutdown — crash-resilient
- Use existing debounced save mechanism pattern (saveTerminalSessionsImmediate or similar)

### Claude's Discretion
- Storage format details (how tab names are stored in session data)
- Integration with existing TerminalSessionService save/restore flow
- Exact hook point for capturing name changes

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The existing session persistence infrastructure (Phase 4/6) already saves tab data; this extends it to include the tab name field.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-remember-tab-names-of-claude-sessions-through-app-restarts*
*Context gathered: 2026-02-26*
