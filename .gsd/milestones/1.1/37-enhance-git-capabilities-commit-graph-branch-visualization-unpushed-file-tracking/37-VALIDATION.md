---
phase: 37
slug: enhance-git-capabilities-commit-graph-branch-visualization-unpushed-file-tracking
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-04
---

# Phase 37 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 37-01-01 | 01 | 1 | D-04/D-09/D-14 | unit | `npm test` | pending |
| 37-01-02 | 01 | 1 | D-04/D-09/D-14 | unit | `npm test` | pending |
| 37-02-01 | 02 | 2 | D-07/D-08/D-10 | build | `npm run build:renderer` | pending |
| 37-02-02 | 02 | 2 | D-07-D-14 | build+unit | `npm run build:renderer && npm test` | pending |
| 37-03-01 | 03 | 3 | D-01/D-03 | build | `npm run build:renderer` | pending |
| 37-03-02 | 03 | 3 | D-01-D-06 | build+unit | `npm run build:renderer && npm test` | pending |
| 37-03-03 | 03 | 3 | all | manual | Visual verification checkpoint | pending |

*Status: pending / green / red / flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modal resize + persist | D-03/D-04 | Requires mouse drag interaction | Open commit graph modal, drag edge to resize, close and reopen -- size preserved |
| Colored branch lanes SVG | D-05 | Visual rendering quality | Open commit graph, verify colored lanes match Rider-style |
| Arrow indicators on branch button | D-12/D-13 | Visual indicator placement | Check branch button shows green up / blue down arrows |
| Date and path filters | D-05 | Filter interaction | Use date range and path inputs in commit graph toolbar |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
