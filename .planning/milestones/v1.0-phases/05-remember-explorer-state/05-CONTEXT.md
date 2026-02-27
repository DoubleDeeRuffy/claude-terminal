# Phase 5: Remember Explorer State - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist file explorer state (expanded folders, panel visibility) across project switches and app restarts. The explorer should feel like it was never closed — folders stay open exactly as the user left them.

</domain>

<decisions>
## Implementation Decisions

### What state to persist
- Expanded folders only — no scroll position, search query, or file selection
- State is per-project — each project has its own independent expansion state
- Save continuously with debounce (crash-resilient, same pattern as Phase 4 terminal sessions)
- Store in the same file as terminal session data from Phase 4 — one unified session file per project

### Restore behavior
- Eager restore — on project switch, immediately re-expand all saved folders and load their children
- Missing folders on disk are silently skipped (no error, no notification)
- Panel visibility (open/closed) is remembered per-project
- Panel width stays global (current localStorage behavior unchanged)

### Staleness handling
- Clean up explorer state when a project is deleted (consistent with Phase 4 terminal cleanup)
- If the project root directory no longer exists, silently discard the explorer state entirely

### Claude's Discretion
- Debounce timing for save
- Data structure for storing expanded folder paths
- Integration details with Phase 4's TerminalSessionService

</decisions>

<specifics>
## Specific Ideas

- Follow Phase 4 patterns exactly — continuous save with debounce, same storage file, same cleanup on delete, same silent-skip behavior for missing paths
- The explorer should feel stateful across project switches within a session AND across app restarts

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-remember-explorer-state*
*Context gathered: 2026-02-24*
