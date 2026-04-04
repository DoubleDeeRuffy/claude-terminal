# Quick Task 260404-guu: Disable modal collapse on click away - Summary

**Completed:** 2026-04-04
**Status:** Done

## Changes

### renderer.js (4 edits)
1. **Line ~119** — Added `let wizardModalOpen = false;` guard variable in LOCAL STATE section
2. **Line ~114** — Added `wizardModalOpen = false;` as first line of `closeModal()` to reset flag on every close
3. **Line ~3209** — Added `&& !wizardModalOpen` check to overlay click handler
4. **Line ~3545** — Set `wizardModalOpen = true;` after `showModal()` call in new-project wizard

## Behavior
- New-project wizard: backdrop clicks ignored, modal stays open
- All other modals: backdrop-close works as before (flag is `false` by default)
- ESC key: still closes the wizard (unchanged)
- Cancel/X buttons: still close the wizard (unchanged, both call `closeModal()` which resets the flag)

## Tests
- 466/466 passed, 0 regressions
- Renderer build: clean
