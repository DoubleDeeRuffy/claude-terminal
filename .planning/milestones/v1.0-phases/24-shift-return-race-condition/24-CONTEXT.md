# Phase 24: Shift-Return-Race-Condition - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the race condition in the Claude chat input where Shift+Return randomly fires as plain Return (submitting the message instead of inserting a newline). Also fix the excessive line gap that appears when Shift+Return works correctly.

</domain>

<decisions>
## Implementation Decisions

### Shift+Return behavior
- Shift+Return must always insert a newline in the chat input — never submit
- Return (without Shift) submits the message
- The bug is a race condition where Shift modifier state is lost, causing Return to fire instead
- Happens randomly but frequently — not tied to specific keystroke count or timing pattern

### Line gap fix
- When Shift+Return inserts a newline, the visual gap between lines is too large
- Should match normal line spacing (single-spaced), not double-spaced or padded

### Scope exclusions
- Multiline paste "collapsing" is NOT a bug — Claude intentionally reformats pasted text
- This phase only targets the chat input, not the raw terminal (PTY)

### Claude's Discretion
- Root cause diagnosis approach (keydown event handling, modifier key tracking, etc.)
- Implementation technique for the fix
- Whether to debounce, use keydown vs keyup, or restructure the event handler

</decisions>

<specifics>
## Specific Ideas

- The user observes Shift+Return works sometimes but randomly submits instead — suggests a timing/event ordering issue where the Shift key state is not reliably detected when Return fires
- The line gap issue may be related to how newlines are inserted (e.g., inserting `\n\n` instead of `\n`, or CSS line-height on the textarea)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-shift-return-race-condition*
*Context gathered: 2026-02-27*
