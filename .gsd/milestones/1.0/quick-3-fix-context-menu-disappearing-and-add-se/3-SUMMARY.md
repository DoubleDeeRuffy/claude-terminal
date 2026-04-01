---
phase: quick-3
plan: 1
subsystem: renderer-ui
tags: [bug-fix, context-menu, event-bubbling]
dependency_graph:
  requires: []
  provides: [working-terminal-context-menu]
  affects: [src/renderer/ui/components/ContextMenu.js]
tech_stack:
  added: []
  patterns: [deferred-event-listener-registration, settimeout-0-event-flush]
key_files:
  modified:
    - src/renderer/ui/components/ContextMenu.js
decisions:
  - "Deferred close-handler registration with setTimeout(0) — simplest fix that allows the opening contextmenu event to finish propagating before listeners are active"
metrics:
  duration: ~3 minutes
  completed: 2026-02-25
---

# Quick Task 3: Fix Context Menu Disappearing After Right-Click Summary

**One-liner:** Deferred document-level close-handler registration with `setTimeout(0)` prevents the opening `contextmenu` event from immediately closing the menu via event bubbling.

## What Was Done

Fixed a bug in `ContextMenu.js` where the context menu disappeared instantly after right-clicking a terminal. The root cause: close-handlers were registered synchronously inside `showContextMenu()`, so the `contextmenu` event that triggered the menu also bubbled up to `document` and immediately fired `handleClickOutside`, closing the menu before it was ever visible.

The fix wraps the three `document.addEventListener` calls in `setTimeout(..., 0)` so they are registered only after the current event loop tick (and thus after the `contextmenu` event has finished propagating).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Defer close-handler registration in showContextMenu() | 09c2d9d |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/renderer/ui/components/ContextMenu.js` contains 2 `setTimeout` calls (deferred listeners + existing removeChild animation)
- [x] `dist/renderer.bundle.js` built successfully
- [x] Commit 09c2d9d exists

## Self-Check: PASSED
