# Phase 36: Fix Terminal Flickering, Buffer Loss, and Blackouts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 36-fix-terminal-flickering-buffer-loss-and-blackouts-caused-by-scroll-to-top-changes
**Areas discussed:** Scroll preservation strategy, Buffer loss root cause, Tab-switch recovery

---

## Scroll Preservation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced scroll preservation | Only restore scroll position after output settles (~50-100ms gap). During rapid output, let xterm handle viewport natively. | ✓ |
| Flag-based preservation | Track user-scrolled-up flag, only preserve when set. Still runs scrollLines() per write when scrolled up. | |
| Remove writePreservingScroll entirely | Plain terminal.write(). User scroll position lost during output. | |
| You decide | Claude picks best technical approach. | |

**User's choice:** Debounced scroll preservation (Recommended)
**Notes:** Eliminates per-write viewport fighting that causes flickering during rapid Claude output.

---

## Buffer Loss Root Cause Investigation

| Option | Description | Selected |
|--------|-------------|----------|
| Fix clear-screen detection first | Tighten guard so terminal.clear() only fires on explicit user-initiated clears, never during rapid Claude output. | ✓ |
| Add diagnostic logging first | Instrument terminal.clear(), WebGL context loss, and writePreservingScroll to capture data before fixing. | |
| Fix both simultaneously | Tighten clear-screen detection AND add WebGL context loss recovery. | |
| You decide | Claude picks approach. | |

**User's choice:** Fix clear-screen detection first (Recommended)
**Notes:** Most likely cause of buffer loss — Claude CLI TUI redraws emit \x1b[2J sequences that can hit normal buffer between alternate-screen transitions.

---

## Tab-Switch Recovery Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Prevention only | Fix root causes, no recovery mechanism needed. Simpler code. | ✓ |
| Prevention + lightweight recovery | Fix root causes AND add terminal.refresh() on tab switch as insurance. | |
| Prevention + full PTY re-read | Fix root causes AND request PTY screen state from main process on tab switch. | |
| You decide | Claude picks approach. | |

**User's choice:** Prevention only (Recommended)
**Notes:** Trust that the root cause fixes are sufficient. No additional tab-switch recovery needed.

---

## Claude's Discretion

- Exact debounce timing thresholds
- Whether to integrate with existing adaptive batching in TerminalService.js
- Heuristic for distinguishing user-initiated clears from TUI redraws

## Deferred Ideas

None — discussion stayed within phase scope
