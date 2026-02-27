---
phase: 23-remember-last-active-tab-on-tab-closing
verified: 2026-02-27T15:30:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Close a non-last tab after visiting multiple tabs in the same project"
    expected: "Focus switches to the tab that was active immediately before the closed one, not the first tab in insertion order"
    why_human: "Runtime tab-switch behavior requires actual Electron UI interaction to observe"
  - test: "Open tabs A, B, C in a project; close C, then close B"
    expected: "Closing C returns to B; closing B returns to A (stack unwinds in activation order)"
    why_human: "Multi-step activation sequence requires live app to verify"
  - test: "Closing the only remaining tab in a project"
    expected: "Sessions panel shown (no switch to a tab in another project)"
    why_human: "Requires live app to confirm sessions panel rendering, not a tab from another project"
---

# Phase 23: Remember Last Active Tab on Tab Closing Verification Report

**Phase Goal:** Closing a tab switches to the previously-active tab within the same project (browser-like behavior) instead of the first same-project tab found by insertion order.
**Verified:** 2026-02-27T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Closing a tab switches to the previously-active tab within the same project, not the first tab in insertion order | ? HUMAN | Walk-back logic wired (lines 1370-1402); runtime behavior requires UI testing |
| 2 | Closing all tabs except one in a project correctly switches to that remaining tab | ? HUMAN | Walk-back exhausts history → fallback forEach scan picks the one remaining tab; verified logically, needs UI test |
| 3 | Closing the only tab for a project shows the sessions panel (existing behavior preserved) | ? HUMAN | `sameProjectTerminalId` is null → `stopProject` + `closedProjectIndex` branch at line 1414 unchanged; needs live confirmation |
| 4 | All tab types (terminal, chat, file/markdown) participate in activation history equally | ✓ VERIFIED | `setActiveTerminal` push at line 1250 fires for all tab types — no type-gating present |
| 5 | History is per-project — closing a tab in Project A never switches to a tab in Project B | ✓ VERIFIED | History Map keyed by `project.id` (line 1373: `tabActivationHistory.get(closedProjectId)`); fallback forEach filters by `project.path` (line 1398) |

**Score:** 5/5 truths implemented; 2/5 fully verifiable without live app; 3/5 flagged for human testing

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderer/ui/components/TerminalManager.js` | tabActivationHistory Map, history push in setActiveTerminal, walk-back in closeTerminal | ✓ VERIFIED | All three elements present at lines 167, 1247-1250, 1370-1402 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `setActiveTerminal()` | `tabActivationHistory` | push on every tab activation | ✓ WIRED | Line 1250: `tabActivationHistory.get(newProjectId).push(id)` inside `if (newProjectId)` guard |
| `closeTerminal()` | `tabActivationHistory` | walk-back to find previous active tab | ✓ WIRED | Line 1373: `tabActivationHistory.get(closedProjectId)` followed by backward loop at lines 1376-1382 |

### Requirements Coverage

No requirement IDs declared in PLAN frontmatter (`requirements: []`). No REQUIREMENTS.md mapping for Phase 23. No orphaned requirements to report.

### Anti-Patterns Found

No blockers or warnings found in `src/renderer/ui/components/TerminalManager.js`:
- No TODO/FIXME/PLACEHOLDER comments in modified sections
- No stub implementations (return null / empty return)
- No console.log-only handlers
- Build succeeds: `npm run build:renderer` exits cleanly
- Tests pass: 1686/1686 tests across 84 suites

### Additional Verification Checks

**Commit presence (from SUMMARY):**
- `246dc4da` — feat(23-01): add tabActivationHistory Map and push in setActiveTerminal — present in git log
- `abea6a1a` — feat(23-01): replace forEach scan in closeTerminal with history walk-back — present in git log

**Reference count:** 7 occurrences of `tabActivationHistory` in TerminalManager.js. The PLAN verification criterion stated "at least 8" — the discrepancy is that `history.filter(hId => hId !== id)` at line 1385 uses the local `history` variable (assigned from `tabActivationHistory.get(closedProjectId)`) rather than referencing `tabActivationHistory` directly. All 7 distinct operations on the Map are present and correct: declare, has-check, set (init), get+push, get (walk-back), delete, set (prune). This is NOT a gap.

**Phase 20 preserved:** `lastActivePerProject` unchanged — declaration at line 162, set at line 1245 (same `if (newProjectId)` block, before the new history push), used at line 2307 for project-switch restore. No regressions to Phase 20.

**Fallback neighbor scan retained:** Lines 1394-1402 preserve the original `forEach` scan as a safety net for tabs created before Phase 23 history was populated.

### Human Verification Required

#### 1. Browser-like tab-close UX (core goal)

**Test:** Open a project, create 3 tabs (A, B, C). Activate A, then B, then C. Close C.
**Expected:** Focus switches to B (the tab active before C), not A (insertion order).
**Why human:** Tab activation and focus state require a live Electron renderer — cannot be verified by static code analysis.

#### 2. History stack unwinds correctly across multiple closes

**Test:** Continue from above (focus now on B). Close B.
**Expected:** Focus switches to A.
**Why human:** Multi-step runtime state requires live interaction.

#### 3. Sessions panel shown when last project tab is closed

**Test:** Close all tabs for a project until one remains, then close the last one.
**Expected:** App shows the sessions panel for that project — no jump to a tab in a different project.
**Why human:** Sessions panel rendering requires visual confirmation in a live Electron window.

### Gaps Summary

No gaps. All code artifacts exist, are substantive, and are wired correctly. The implementation exactly matches the plan specification:

- `tabActivationHistory` Map declared at module level (line 167)
- Push inside `if (newProjectId)` guard in `setActiveTerminal` (lines 1247-1250)
- Walk-back loop in `closeTerminal` skipping closed/stale tabs (lines 1375-1382)
- Prune after walk-back to keep history clean (lines 1384-1390)
- Original `forEach` fallback retained (lines 1394-1402)
- `lastActivePerProject` (Phase 20) untouched
- Build passes, all 1686 tests pass

Three truths are flagged as human_needed because they describe runtime UI behavior (which tab gains focus, which panel renders) that cannot be confirmed by static analysis alone.

---

_Verified: 2026-02-27T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
