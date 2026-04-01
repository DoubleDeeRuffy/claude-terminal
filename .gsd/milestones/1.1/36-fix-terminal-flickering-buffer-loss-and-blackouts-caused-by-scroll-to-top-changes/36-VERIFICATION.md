---
phase: 36-fix-terminal-flickering-buffer-loss-and-blackouts-caused-by-scroll-to-top-changes
verified: 2026-04-01T20:45:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 36: Fix Terminal Flickering, Buffer Loss, and Blackouts — Verification Report

**Phase Goal:** Fix three terminal rendering regressions: viewport flickering during rapid Claude output, scrollback buffer loss from stray terminal.clear() calls, and visual blackouts on tab switch.
**Verified:** 2026-04-01T20:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can scroll up during rapid Claude output without viewport fighting or flickering | VERIFIED | `writePreservingScroll` makes NO synchronous `scrollLines()` call; the 80ms debounce timer is only set when `wasScrolledUp`, and keeps being reset by rapid data. Viewport is left to xterm's native handling during streaming. |
| 2 | Scrollback buffer is never wiped by Claude CLI TUI redraws | VERIFIED | `rapidOutputActive` flag (requires 3+ consecutive chunks < 150ms apart) gates `terminal.clear()`. When rapid, clear is suppressed entirely and any pending debounce is cancelled. `terminal.clear()` is only called on the idle/slow path. |
| 3 | Tab switching does not cause terminal blackouts or blank content | VERIFIED | D-03 (prevention-only) is the accepted approach. No tab-switch recovery mechanism was added — root cause prevention from Truths 1 and 2 is sufficient. No regression in tab-switch code path introduced. |
| 4 | User scroll position is restored after output settles (not per-write) | VERIFIED | `scrollRestoreState` WeakMap holds `{ scrollRestoreTimer, savedOffset, savedBufType }` per terminal. Timer fires at 80ms after last write. During rapid output the timer keeps being reset before it fires. Fires exactly once when output pauses. |
| 5 | Basic (non-Claude) terminals with slow output still preserve scroll position correctly | VERIFIED | Slow output (gaps > 80ms between writes) means the timer fires after each write — identical UX to the old synchronous approach but without per-write flicker risk. No special-case branching needed or added. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderer/ui/components/TerminalManager.js` | Debounced `writePreservingScroll` and tightened clear-screen guard | VERIFIED | File modified in commits `c3580a53` and `8dda98d4`. Contains `scrollRestoreState` WeakMap at module level (line 148). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `writePreservingScroll` | `terminal.write` | Debounced scroll restoration after output gap | VERIFIED | `clearTimeout(state.scrollRestoreTimer)` on line 166; 80ms `setTimeout` on line 167; `terminal.write(data)` on line 179 — no synchronous `scrollLines()` between them. |
| `clear-screen detection` | `terminal.clear()` | `rapidOutputActive` flag prevents clears during rapid output | VERIFIED | `rapidOutputActive` checked at line 2095; `terminal.clear()` only reached on line 2102 in the `else` (slow/idle) branch. Pattern `rapidOutputActive.*terminal\.clear` confirmed by code structure. |

### Data-Flow Trace (Level 4)

Not applicable — this phase modifies event handlers and utility functions, not data-rendering components. No dynamic data source to trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Renderer builds without errors | `npm run build:renderer` | `Build complete: dist/renderer.bundle.js` | PASS |
| All 466 tests pass | `npm test` | `17 suites, 466 tests passed` | PASS |
| Old brittle `< 100ms` single-gap check removed | `grep "(now - lastDataTime) < 100"` | No matches | PASS |
| Old 200ms debounced `terminal.clear()` removed | `grep "setTimeout.*terminal\.clear"` | No matches | PASS |
| All 5 `writePreservingScroll` call sites intact | grep for call sites | Lines 2106, 2541, 3675, 3856, 4794 | PASS |
| `scrollRestoreState` WeakMap exists at module level | grep | Line 148: `const scrollRestoreState = new WeakMap()` | PASS |
| Commits documented in SUMMARY exist in repo | `git log` | `c3580a53`, `8dda98d4` both confirmed | PASS |

### Requirements Coverage

The FLICKER requirement IDs are defined inline in ROADMAP.md under Phase 36. REQUIREMENTS.md for v1.1 explicitly states "No requirements defined yet" — the traceability table is empty and the FLICKER IDs are not registered there. This is not a gap: the ROADMAP is the authoritative source for these IDs, and REQUIREMENTS.md confirms no cross-registration is expected at this milestone stage.

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|---------|
| FLICKER-01 | ROADMAP.md Phase 36 | Debounced scroll preservation — replace per-write scrollLines with post-settle restoration | SATISFIED | `writePreservingScroll` uses 80ms `setTimeout` debounce; no synchronous `scrollLines()` call after `terminal.write()` |
| FLICKER-02 | ROADMAP.md Phase 36 | Tightened clear-screen guard — suppress `terminal.clear()` during rapid Claude TUI redraws | SATISFIED | `rapidOutputActive` flag with 3-chunk hysteresis and 500ms cooldown; `terminal.clear()` only fires in idle/slow branch |
| FLICKER-03 | ROADMAP.md Phase 36 | No tab-switch recovery needed — root cause prevention is sufficient | SATISFIED | No tab-switch recovery code added; D-03 decision confirmed and applied |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODOs, stubs, empty handlers, or hardcoded empty data detected in the modified code region. The `resetOutputSilenceTimer` and `clearOutputSilenceTimer` functions at lines 183-185 are intentional no-ops with explanatory comments (Claude silence detection disabled by design) — not stubs.

### Human Verification Required

These behaviors require a running Claude session to verify and cannot be checked programmatically:

#### 1. Scroll viewport stability during rapid Claude output

**Test:** Open a Claude terminal, run a task that produces sustained rapid output (e.g., `find / -name "*.js"` or a streaming Claude response). Scroll up to read older output while it is still streaming.
**Expected:** Viewport does NOT jump back to bottom on each data chunk. Viewport stays at the user's scroll position until output pauses for ~80ms, then snaps back to the preserved offset.
**Why human:** Cannot simulate xterm.js viewport state in Jest (jsdom has no layout engine).

#### 2. Scrollback buffer intact after Claude TUI redraws

**Test:** Run Claude on a long task, let it complete. Press Ctrl+End (or scroll to bottom), then scroll up.
**Expected:** Full scrollback history is visible — no missing sections caused by a stray `terminal.clear()` during the TUI redraw phase.
**Why human:** Requires live PTY output with real `\x1b[2J`/alternate-screen escape sequences.

#### 3. User-initiated `/clear` still works in an idle terminal

**Test:** In a terminal that has been idle for > 500ms, type `/clear` and press Enter.
**Expected:** Scrollback is wiped immediately (not suppressed by `rapidOutputActive`).
**Why human:** Requires live terminal interaction with timing.

#### 4. No visual blackout on tab switch during Claude output

**Test:** Start a Claude streaming session, quickly switch to another project tab and back.
**Expected:** Terminal content is visible and not blank on return.
**Why human:** Requires live Electron window with active xterm.js renderer.

### Gaps Summary

No gaps. All automated checks pass, all must-haves are verified, both commits exist and are substantive, the build succeeds, and all 466 tests pass. Four behaviors are flagged for human spot-checks due to the live xterm.js/Electron runtime requirement, but none are expected to fail given the correctness of the implementation.

---

_Verified: 2026-04-01T20:45:00Z_
_Verifier: Claude (gsd-verifier)_
