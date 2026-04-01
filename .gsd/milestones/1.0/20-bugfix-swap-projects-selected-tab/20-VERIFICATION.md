---
phase: 20-bugfix-swap-projects-selected-tab
verified: 2026-02-26T11:30:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 20: Bugfix Swap Projects Selected Tab — Verification Report

**Phase Goal:** Fix the bug where switching between projects always resets to the first tab instead of remembering the last-active tab
**Verified:** 2026-02-26T11:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Switching from Project A (on tab 3) to Project B and back to Project A lands on tab 3 | VERIFIED | `lastActivePerProject.set(newProjectId, id)` at line 1236 captures on every activation; `lastActivePerProject.get(project.id)` at line 2264 restores in `filterByProject` |
| 2 | Scroll position in terminal tabs is preserved when switching between projects | VERIFIED | `savedScrollPositions.set(prevActiveId, { viewportY: ... })` at line 1198 captures xterm `buffer.active.viewportY`; `termData.terminal.scrollLines(delta)` at line 1252 restores it |
| 3 | Scroll position in chat tabs is preserved when switching between projects | VERIFIED | `savedScrollPositions.set(prevActiveId, { scrollTop: messagesEl.scrollTop })` at line 1195 captures chat DOM scroll; `messagesEl.scrollTop = saved.scrollTop` at line 1248 restores it via `requestAnimationFrame` |
| 4 | If the remembered tab was closed, the first available tab is selected instead | VERIFIED | Guard at line 2265: `if (savedId && getTerminal(savedId))` — `getTerminal` returns null for closed tabs, so `targetId` stays as `firstVisibleId`; `savedScrollPositions.delete(id)` at line 1329 cleans up on close |
| 5 | Fresh projects with no terminals keep existing behavior unchanged | VERIFIED | Code path only enters the in-memory lookup when `project` exists (line 2261 guard); falls through to `firstVisibleId` if Map has no entry for a new project |
| 6 | App restart still uses existing Phase 04/06 disk-based restore logic | VERIFIED | Disk fallback at lines 2272–2292 remains intact: `loadSessionData()` from `TerminalSessionService` checked when `targetId === firstVisibleId` (in-memory Map has no entry on cold start) |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderer/ui/components/TerminalManager.js` | In-memory per-project active tab tracking and scroll position restoration; contains `lastActivePerProject` | VERIFIED | File exists; `lastActivePerProject` declared at line 160, `savedScrollPositions` at line 162; both substantively used across 6 operations |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `setActiveTerminal()` | `lastActivePerProject Map` | `Map.set` on every tab activation | WIRED | `lastActivePerProject.set(newProjectId, id)` at line 1236, inside `if (termData)` block after project-id guard |
| `filterByProject()` | `lastActivePerProject Map` | `Map.get` to find saved tab before disk fallback | WIRED | `lastActivePerProject.get(project.id)` at line 2264, used as primary restore source |
| `setActiveTerminal()` | `savedScrollPositions Map` | Capture outgoing scroll, restore incoming scroll | WIRED | `.set` at lines 1195 and 1198 (capture); `.get` at line 1240 with `requestAnimationFrame` restore at lines 1242–1256 |
| `closeTerminal()` | `savedScrollPositions Map` | Cleanup on terminal close | WIRED | `savedScrollPositions.delete(id)` at line 1329 |

### Requirements Coverage

No formal requirement IDs were declared for this bugfix phase. The phase goal is a targeted behavioral fix — all observable truths map directly to the goal statement.

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholder returns, or empty handlers were found in the new code paths.

### Human Verification Required

The following behaviors require manual testing to confirm end-to-end correctness:

#### 1. Project switching restores tab

**Test:** Open Project A, switch to its tab 3 (third terminal tab). Switch to Project B. Switch back to Project A.
**Expected:** Project A opens on tab 3, not tab 1.
**Why human:** DOM visibility and tab state require a running Electron app to confirm.

#### 2. Scroll position preservation — terminal

**Test:** Open a terminal, scroll up in the xterm output. Switch to another project. Switch back.
**Expected:** Terminal scroll position is restored to where it was left.
**Why human:** xterm `viewportY` buffer behavior requires a real PTY process with output.

#### 3. Scroll position preservation — chat

**Test:** Open a chat tab, scroll up through chat messages. Switch to another project. Switch back.
**Expected:** Chat message scroll position is restored.
**Why human:** `.chat-messages` scrollTop requires a running renderer with rendered DOM.

#### 4. Closed tab graceful fallback

**Test:** Open Project A with 3 tabs, activate tab 2, close tab 2, switch to Project B, switch back to Project A.
**Expected:** Falls back to first visible tab (tab 1 or tab 3), no error.
**Why human:** Requires live tab lifecycle to confirm the `getTerminal(savedId)` null guard works correctly.

### Gaps Summary

No gaps. All automated checks passed:
- Both Maps (`lastActivePerProject`, `savedScrollPositions`) declared at module level (lines 160, 162)
- All 6 Map operations present at correct call sites
- `filterByProject` uses in-memory Map as primary source with disk fallback intact
- `closeTerminal` cleans up `savedScrollPositions` but correctly preserves `lastActivePerProject` for graceful stale-ID handling
- `npm run build:renderer` succeeds with no errors
- `npm test` passes: 281 tests across 14 suites, 0 failures

The phase goal is achieved. The single-file change in `TerminalManager.js` wires the two Maps at all required call sites. Human verification of the runtime behavior (4 items above) is recommended before closing the phase.

---

_Verified: 2026-02-26T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
