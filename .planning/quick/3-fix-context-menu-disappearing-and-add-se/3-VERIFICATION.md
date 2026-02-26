---
phase: quick-3
verified: 2026-02-25T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Quick Task 3: Fix Context Menu Disappearing — Verification Report

**Task Goal:** Fix context menu disappearing immediately and add setting to toggle context menu vs right-click paste
**Verified:** 2026-02-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Right-clicking a terminal shows the context menu and it stays visible | VERIFIED | `showContextMenu()` defers close-handler registration via `setTimeout(0)` at line 94 of ContextMenu.js, preventing the opening event from immediately triggering dismissal |
| 2 | Clicking outside the context menu closes it | VERIFIED | `handleClickOutside` registered on `click` event (line 95); checks `!currentMenu.contains(e.target)` before hiding |
| 3 | Right-clicking again while menu is open closes and reopens at new position | VERIFIED | `showContextMenu()` calls `hideContextMenu()` first (line 22), then opens fresh; `handleClickOutside` also registered on `contextmenu` event (line 96) |
| 4 | Escape key closes the context menu | VERIFIED | `handleEscape` registered on `keydown` (line 97), checks `e.key === 'Escape'` and calls `hideContextMenu()` |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderer/ui/components/ContextMenu.js` | Context menu with deferred close-handler registration containing `setTimeout` | VERIFIED | File exists, contains `setTimeout` at lines 94-98 wrapping all three `document.addEventListener` calls, plus the pre-existing `setTimeout` at line 109 for DOM cleanup. `grep -c "setTimeout"` returns 2. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/renderer/ui/components/TerminalManager.js` | `src/renderer/ui/components/ContextMenu.js` | `showContextMenu()` call on right-click | WIRED | Line 45: `const { showContextMenu } = require('./ContextMenu')`. Line 532: `showContextMenu({...})` called inside `contextmenu` event listener. Setting guard at line 525 routes to paste (legacy) or context menu correctly. |

### Pre-existing Setting Infrastructure (Regression Check)

| Component | Location | Status | Details |
|-----------|----------|--------|---------|
| `terminalContextMenu` default state | `src/renderer/state/settings.state.js` line 33 | INTACT | `terminalContextMenu: true` default present |
| Settings toggle UI | `src/renderer/ui/panels/SettingsPanel.js` lines 438-442, 1070-1090 | INTACT | Checkbox renders, reads and saves the setting |
| Setting enforcement | `src/renderer/ui/components/TerminalManager.js` line 525 | INTACT | `if (!getSetting('terminalContextMenu'))` guard routes correctly |
| i18n keys (EN) | `src/renderer/i18n/locales/en.json` lines 530-531 | INTACT | `terminalContextMenu` and `terminalContextMenuDesc` keys present |
| i18n keys (FR) | `src/renderer/i18n/locales/fr.json` lines 596-597 | INTACT | French translations present with proper UTF-8 accents |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments or empty implementations detected in the modified file.

### Human Verification Required

| # | Test | Expected | Why Human |
|---|------|----------|-----------|
| 1 | Run `npm start`, right-click in an active terminal | Context menu appears and stays visible without immediately disappearing | Visual behavior cannot be verified programmatically |
| 2 | With context menu open, click outside it | Menu closes | Visual behavior |
| 3 | With context menu open, press Escape | Menu closes | Keyboard interaction |
| 4 | Right-click again while menu is open | Old menu closes, new menu opens at cursor position | Visual re-positioning |
| 5 | In Settings, disable "Terminal context menu" toggle, then right-click terminal | Right-click performs instant paste instead of showing menu | Behavioral branch requiring runtime verification |

## Summary

The bug fix is correctly implemented. The three `document.addEventListener` calls in `showContextMenu()` (`click`, `contextmenu`, `keydown`) are now wrapped in `setTimeout(() => { ... }, 0)` at lines 94-98 of `ContextMenu.js`. This defers listener registration until after the current `contextmenu` event finishes propagating, which was the root cause of the menu disappearing immediately.

The `hideContextMenu()` function was not modified — it still removes all three listeners correctly, so cleanup remains intact.

All pre-existing setting infrastructure (`terminalContextMenu` in state, SettingsPanel toggle, TerminalManager guard, i18n keys) is intact with no regressions.

---

_Verified: 2026-02-25_
_Verifier: Claude (gsd-verifier)_
