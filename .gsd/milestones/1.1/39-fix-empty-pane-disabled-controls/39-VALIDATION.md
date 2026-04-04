---
phase: 39
slug: fix-empty-pane-disabled-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | CSS-FIX | visual/manual | Visual inspection | N/A | ⬜ pending |
| 39-01-02 | 01 | 1 | BTN-STATE | visual/manual | Visual inspection | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This is a CSS-only fix — no new test files needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sessions panel doesn't overflow header | CSS-FIX | Visual layout — CSS rendering cannot be tested in jsdom | 1. Open project with no terminals 2. Verify sessions panel stays below header bar 3. Verify all top buttons visible and clickable |
| All buttons enabled in empty state | BTN-STATE | Button interactivity requires live Electron environment | 1. Open project with no terminals 2. Click each button in header: resume, +, changes, branch, pull, push 3. Verify all respond to clicks |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
