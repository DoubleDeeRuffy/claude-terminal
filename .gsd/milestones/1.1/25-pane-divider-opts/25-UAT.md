# Phase 25: Pane-Divider-Opts — UAT Report

**Date:** 2026-02-28
**Result:** PASS (all tests)

## Test Results

| # | Test | Result |
|---|------|--------|
| 1 | Explorer resizer: no drag-and-drop leaking, no mouse sticking | PASS |
| 2 | Memory resizer: hover glow visible, drag glow visible | PASS |
| 3 | Projects panel: can resize down to 150px | PASS (after CSS fix) |
| 4 | Projects panel width: survives app restart | PASS |
| 5 | Memory sidebar width: survives app restart | PASS |
| 6 | File explorer width: still survives app restart (regression) | PASS |
| 7 | All three resizers show active visual feedback during drag | PASS (verified via code) |
| 8 | `npm test` passes (2248/2248) | PASS |
| 9 | `npm run build:renderer` succeeds | PASS |

## Issues Found During UAT

### Issue: Projects panel min-width CSS override
- **Symptom:** JS allowed 150px but panel wouldn't go below 280px
- **Root cause:** `styles/projects.css:33` had `min-width: 280px` overriding the JS `Math.max(150, ...)`
- **Fix:** Changed CSS `min-width` from `280px` to `150px`

## Files Modified

| File | Changes |
|------|---------|
| `src/renderer/ui/components/FileExplorer.js` | `e.preventDefault()` + `e.stopPropagation()` on resizer mousedown, `.active` class toggle, `saveSettingsImmediate()` |
| `index.html` | Added `#memory-sidebar-resizer` inside `.memory-sidebar` |
| `styles/memory.css` | Added `position: relative` to `.memory-sidebar` |
| `styles/projects.css` | Changed `min-width: 280px` → `150px` on `.projects-panel` |
| `renderer.js` | Projects min-width `Math.max(150, ...)`, `saveSettingsImmediate()` |
| `src/renderer/ui/panels/MemoryEditor.js` | Full memory sidebar resizer: mousedown/move/up, active class, width persistence + restore |
