# Phase 6: Resume Claude Sessions After Restart - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist Claude terminal session IDs so that after an app restart, each terminal that had an active Claude session reconnects via `claude --resume <session-id>` instead of starting fresh. Plain shell terminals are unaffected — they restore as before (Phase 4 behavior).

</domain>

<decisions>
## Implementation Decisions

### Session ID capture
- Use the existing HooksProvider/ClaudeEventBus SESSION_START events to capture session IDs
- Extend TerminalSessionService (Phase 4 infrastructure) with a `claudeSessionId` field per terminal
- Every SESSION_START event updates the stored session ID for that terminal (always tracks latest)

### Resume behavior
- Only terminals that had an active Claude session get `claude --resume <id>` on restore
- Plain shells restore normally (existing Phase 4 behavior unchanged)
- Auto-resume immediately — terminal opens and runs `claude --resume <session-id>` automatically, seamless continuation

### Failure handling
- Just attempt `claude --resume` without pre-validation — no need to inspect Claude's internal file structure
- Detect failure via exit code: if Claude process exits quickly (within a few seconds), assume resume failed
- On failure, fall back to starting a fresh `claude` session in the same terminal (not a plain shell)
- Session ID updates on every SESSION_START, so fallback new sessions also get tracked

### Claude's Discretion
- Exact timeout threshold for "exited quickly" detection
- How to wire the hooks event to the specific terminal (terminal ID correlation)
- Whether to show a brief indicator during resume attempt

</decisions>

<specifics>
## Specific Ideas

- User referenced `claude --resume` as the mechanism — this is a known Claude CLI flag that accepts a session ID
- The hooks system already fires SESSION_START with session metadata — this is the capture path
- TerminalSessionService from Phase 4 already persists per-terminal data — extend, don't replace

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-resume-claude-sessions*
*Context gathered: 2026-02-25*
