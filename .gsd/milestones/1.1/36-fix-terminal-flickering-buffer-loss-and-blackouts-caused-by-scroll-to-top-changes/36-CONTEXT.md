# Phase 36: Fix Terminal Flickering, Buffer Loss, and Blackouts - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three critical terminal rendering bugs: (1) flickering during rapid Claude output, (2) scrollback buffer disappearing (scroll-up history gone), and (3) visual blackouts. These are regressions related to the `writePreservingScroll()` mechanism and clear-screen detection interacting badly with Claude CLI's rapid TUI redraws. This is a pure bug-fix phase — no new features.

</domain>

<decisions>
## Implementation Decisions

### Scroll Preservation Strategy
- **D-01:** Replace per-write scroll restoration with debounced approach. During rapid Claude output, let xterm.js handle the viewport natively. Only restore the user's scroll position after output settles (~50-100ms gap). This eliminates the per-write `scrollLines()` calls that cause viewport fighting and flickering.

### Buffer Loss Fix
- **D-02:** Tighten the clear-screen detection guard in TerminalManager.js (lines 2039-2060). The current logic detects `\x1b[2J`/`\x1b[3J`/`\x1bc` sequences and calls `terminal.clear()`, which wipes scrollback. The fix should ensure `terminal.clear()` only fires on explicit user-initiated clears (e.g., after idle period or user Enter keypress), never during rapid Claude output. Claude CLI's TUI redraws emit these sequences constantly — a stray clear hitting the normal buffer between alternate-screen transitions is the most likely cause of buffer loss.

### Tab-Switch Recovery
- **D-03:** Prevention only — no recovery mechanism on tab switch. The root cause fixes (D-01 and D-02) should be sufficient. No `terminal.refresh()` or PTY re-read on tab switch.

### Claude's Discretion
- Implementation details of the debounce timing (exact ms thresholds)
- Whether to use a simple timeout or integrate with the existing adaptive batching in TerminalService.js
- Exact heuristic for distinguishing user-initiated clears from TUI redraws

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Terminal Implementation
- `src/renderer/ui/components/TerminalManager.js` §140-154 — `writePreservingScroll()` function (primary fix target)
- `src/renderer/ui/components/TerminalManager.js` §2033-2068 — Clear-screen detection and debouncing logic (secondary fix target)
- `src/main/services/TerminalService.js` §107-136 — Adaptive batching in main process (context for output patterns)

### Knowledge Base
- `.gsd/knowledge/terminal-scroll-and-resize.md` — Known terminal scroll/resize issues documentation (migrated from .planning/)

### Prior Reset Context
- Tag `wip/terminal-scroll-debug` (commit `f6ce2aeb`) — Pre-reset WIP with all previous scroll/rendering attempts. Use `git diff wip/terminal-scroll-debug -- <file>` to see what was tried before.

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Functions to Modify
- `writePreservingScroll(terminal, data)` (TerminalManager.js:144-154) — Currently saves viewportY offset before every `write()` and restores via `scrollLines()`. Needs debounce wrapper.
- Clear-screen handler (TerminalManager.js:2034-2060) — Detects escape sequences and calls `terminal.clear()`. Has a 200ms debounce for rapid output but the `< 100ms` gap threshold is too aggressive.
- `registerTerminalHandler()` data callback (TerminalManager.js:2036-2068) — Orchestrates both writePreservingScroll and clear detection per data chunk.

### Established Patterns
- Adaptive batching in TerminalService.js main process: 4ms idle / 16ms normal / 50ms flooding. The renderer receives pre-batched data.
- `terminal.buffer.active.type` check distinguishes normal vs alternate screen buffer
- WebGL addon with context loss handler (TerminalManager.js:131-133) — disposes on loss, no re-creation

### Integration Points
- All terminal types (Claude, basic, project-type consoles) use the same `writePreservingScroll` path
- The fix must not break basic terminal scrolling (non-Claude terminals with slow output)

</code_context>

<specifics>
## Specific Ideas

- User reports: "flickering while Claude is working, loses the buffer (scrolling up not possible anymore — it's gone). Switching tabs helps but doesn't restore the buffer. MAJOR issue."
- The bugs re-emerged after terminal files were reset to upstream/main on 2026-03-29 and subsequent scroll-to-top changes were re-applied
- The `writePreservingScroll` function was introduced to prevent xterm from jumping to bottom when user is reading scrollback — the fix must preserve this UX goal while eliminating the flickering side effect

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 36-fix-terminal-flickering-buffer-loss-and-blackouts-caused-by-scroll-to-top-changes*
*Context gathered: 2026-04-01*
