---
phase: 38
slug: post-screenshots-terminal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | clipboard-intercept | unit | `npm test` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | temp-file-save | unit | `npm test` | ❌ W0 | ⬜ pending |
| 38-01-03 | 01 | 1 | preview-bar-render | unit | `npm test` | ❌ W0 | ⬜ pending |
| 38-01-04 | 01 | 1 | path-injection | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/terminal-image-paste.test.js` — stubs for clipboard interception, temp file save, preview rendering, path injection
- [ ] Existing test infrastructure covers framework setup

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ctrl+V with image in clipboard shows preview bar | clipboard-intercept | Requires Electron clipboard API and xterm.js DOM | 1. Copy screenshot with Win+Shift+S, 2. Ctrl+V in terminal, 3. Verify preview bar appears |
| Enter sends image paths + text to PTY | path-injection | Requires running PTY and Claude CLI | 1. Attach image, 2. Type prompt, 3. Press Enter, 4. Verify file paths appear in terminal |
| Preview bar disappears after send | ux-cleanup | Requires full Electron app | 1. Send message with image, 2. Verify preview bar hides |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
