# Phase 4: Session Persistence - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist and restore terminal tabs across app restarts. When the app reopens, each project's terminal tabs are re-created in the same working directories they had before. Claude chat sessions are explicitly out of scope.

</domain>

<decisions>
## Implementation Decisions

### Scope of persistence
- Restore terminal tabs with their working directories — that's it
- No Claude chat session restore (explicitly excluded)
- No terminal scrollback/output history restore
- No scroll positions or minor UI state
- Tab renaming is not implemented, so not a concern

### Restoration behavior
- Always auto-restore — no setting, no prompt, no toggle
- All projects restore their terminals at app startup (not lazily on project open)
- Terminals re-launch a fresh shell (PowerShell) in the saved working directory
- Restore the active/selected terminal tab per project
- Respect zero-terminal state: if a project had no terminals saved, don't auto-create one
- Also remember and restore the last opened project (app opens to that project)

### Save strategy
- Save terminal state on every change (tab open, tab close) with debounce — crash-resilient
- No save-on-quit-only; continuous persistence ensures crash recovery works

### Per-project storage
- Terminal state stored per-project (each project independently remembers its tabs)
- Auto-cleanup: when a project is deleted from the app, its saved terminal state is deleted too

### Edge cases
- If a project's directory was deleted/moved since last session, skip its terminals silently (no error)
- No cap on number of terminals restored — restore all of them
- Crash recovery: always restore from last saved state, no fresh-start-after-crash logic

### Claude's Discretion
- Storage format and location (JSON file structure, where in ~/.claude-terminal/)
- Debounce timing for save operations
- Order of terminal restoration (sequential vs parallel spawning)
- How to detect working directory of existing terminals for save

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-remember-every-tab-every-claude-session-and-the-session-context-accross-app-restarts*
*Context gathered: 2026-02-24*
