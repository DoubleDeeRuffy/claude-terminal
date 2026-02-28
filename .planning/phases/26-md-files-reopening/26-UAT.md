# Phase 26: MD-Files-Reopening — UAT

## Test Results

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Mixed tab persistence (terminal + file interleaved) | PASS | After fix — tabs restore in correct visual order |
| 2 | Tab ordering preserved across restart | PASS | DOM-order save fix ensures visual order matches saved order |
| 3 | Active tab restored correctly | PASS | activeTabIndex mechanism works for both tab types |
| 4 | `npm test` | PASS | 1124/1124 tests |
| 5 | `npm run build:renderer` | PASS | |

## Issues Found & Fixed

### Issue: File tabs restored at end instead of interleaved position

**Root cause:** `saveTerminalSessionsImmediate()` iterated the `terminals` Map (insertion order) instead of the DOM tab bar (visual order). Since file tabs are opened after terminal tabs, they always appeared last in the Map regardless of their visual position.

**Fix:** Changed save loop to read `#terminals-tabs .terminal-tab` DOM elements first, then iterate in that order. This also fixes drag-and-drop tab reordering not being persisted (pre-existing bug affecting all tab types).

**File:** `src/renderer/services/TerminalSessionService.js` (lines 82-88)
