# Phase 27: Rename-Tabs-Manually — Context

## Phase Goal
Add a right-click context menu to terminal/file tabs with rename, close, and bulk-close actions.

## Decisions

### Tab Context Menu
Right-click any `.terminal-tab` shows a context menu with 4 items:

1. **Rename (Double-click)** — calls existing `startRenameTab(id)`. Label hints at the keyboard shortcut.
2. **Close** — closes the right-clicked tab
3. **Close Others** — closes all tabs except the right-clicked one
4. **Close Tabs to Right** — closes all tabs to the right of the right-clicked one

### Behavior
- Close Others / Close to Right affect **all tab types** (terminal, file, chat) — no type filtering
- **No protection** for running Claude sessions — close means close
- Reuse existing `showContextMenu()` from `ContextMenu.js`

### What's NOT in scope
- No new rename triggers (F2, tooltips)
- No OSC overwrite protection changes
- No visual rename indicators
- Rename already works via double-click on `.tab-name` — this phase just makes it discoverable

## Code Context

### Existing rename
- `startRenameTab(id)` at `TerminalManager.js:1162` — inline input, blur/Enter/Escape, persists via `TerminalSessionService`
- `.tab-name` double-click handlers at lines 1182, 1689, 1926, 3134, 3305, 3813, 4023

### Context menu utility
- `showContextMenu({ x, y, items })` in `ContextMenu.js` — already used for terminal body right-click

### Tab structure
- Tabs are `.terminal-tab[data-id="ID"]` in `#terminals-tabs`
- Inner: `.status-dot` + `.tab-name` + optional `.tab-mode-toggle` + `.tab-close`

### Close logic
- `closeTerminal(id)` for terminal/chat/basic tabs
- `closeFileTab(id)` for file tabs
- Tab type detectable via `getTerminal(id).type` (`'file'` vs others)
- Tab ordering is DOM-based — "to the right" = subsequent siblings in `#terminals-tabs`

## Deferred Ideas
(none)
