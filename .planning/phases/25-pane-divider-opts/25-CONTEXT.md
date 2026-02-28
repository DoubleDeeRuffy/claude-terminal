# Phase 25: Pane-Divider-Opts — Context

## Phase Goal

Fix pane divider bugs (persistence, event leaking, missing visual feedback) and adjust constraints.

## Decisions

### 1. Projects panel width not restoring on restart

- **Bug:** Width is saved via `settingsState.setProp('projectsPanelWidth')` on mouseup but not reliably restored on app launch
- **Code:** `renderer.js:3811-3815` — restore logic exists, investigate why it fails (timing? settings not loaded yet?)
- **Expected:** Panel width persists across app restarts

### 2. Memory sidebar width not restoring on restart

- **Bug:** Width is saved via `settingsState.setProp('memorySidebarWidth')` but not restored
- **Code:** `MemoryEditor.js:205-210` — restore logic exists, investigate why it fails
- **Expected:** Memory sidebar width persists across app restarts

### 3. Projects panel min-width reduction

- **Change:** Lower minimum width from 200px to 150px
- **Code:** `renderer.js:3793` — `Math.max(200, ...)` → `Math.max(150, ...)`
- **No other dividers affected** — explorer stays at 200px min

### 4. Explorer resizer triggering drag-and-drop

- **Bug:** Mousedown on the file explorer resizer leaks through to the file tree underneath, triggering a drag-and-drop event on the file/directory below the cursor. After the drag event fires, the pane resize "sticks" to the mouse (follows without holding button down).
- **Code:** `FileExplorer.js:1391` — mousedown handler needs `e.stopPropagation()` to prevent event from reaching the tree's draggable items
- **Scope:** Fix only on the explorer resizer (other resizers don't overlay draggable content)

### 5. Memory sidebar resizer missing visual feedback

- **Bug:** The resizer element has `class="panel-resizer"` in HTML (`index.html:718`) but hover/active accent glow doesn't appear
- **Likely cause:** z-index conflict, positioning issue, or the `.panel-resizer` CSS in `styles/terminal.css:1182-1212` not applying in the memory tab context
- **Expected:** Same hover (accent 60% + glow) and drag (accent 80% + stronger glow) visual feedback as the other two resizers

## Code Context

### Files to modify

| File | What | Lines |
|------|------|-------|
| `renderer.js` | Projects resizer min-width + investigate restore | 3776-3816 |
| `src/renderer/ui/components/FileExplorer.js` | Explorer resizer stopPropagation + investigate restore | 1383-1431 |
| `src/renderer/ui/panels/MemoryEditor.js` | Memory sidebar restore investigation | 173-211 |
| `styles/terminal.css` | `.panel-resizer` styling — verify it applies to memory tab | 1182-1212 |
| `styles/memory.css` | May need memory-specific resizer positioning fix | - |

### Existing patterns

- Width persistence: `settingsState.setProp(key, width)` + `saveSettings()` on mouseup
- Width restore: `getSetting(key)` or `settingsState.get().key` on init
- Resizer CSS: `.panel-resizer` class with `::before` pseudo-element for 8px hit target
- All three resizers use identical mousedown → mousemove → mouseup pattern

## Deferred Ideas

(none)
