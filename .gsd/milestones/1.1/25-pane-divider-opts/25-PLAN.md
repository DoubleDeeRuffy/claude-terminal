# Phase 25: Pane-Divider-Opts — Plan

## Plan 25A: Fix pane divider bugs and adjust constraints

**Goal:** Fix width persistence, event leaking, missing visual feedback, and lower projects panel min-width.

**Scope:** 5 issues across 4 files. All resizer-related, no new features.

---

### Task 1: Fix explorer resizer event leaking (FileExplorer.js)

**Problem:** Mousedown on the file explorer resizer leaks to the tree's draggable items underneath, triggering a drag-and-drop. After the drag fires, the resize "sticks" to the mouse.

**Fix:**
- `src/renderer/ui/components/FileExplorer.js:1391` — Add `e.preventDefault()` and `e.stopPropagation()` to the mousedown handler

```javascript
// Before:
resizer.addEventListener('mousedown', (e) => {
  startX = e.clientX;

// After:
resizer.addEventListener('mousedown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  startX = e.clientX;
```

**Verification:** Drag the explorer resizer — no file drag-and-drop should trigger, resize should not stick.

---

### Task 2: Fix memory sidebar resizer visual feedback (index.html + memory.css)

**Problem:** The memory resizer (`#memory-sidebar-resizer`) is a sibling of `.memory-sidebar`, not a child. With `position: absolute`, it needs a positioned parent — but `.memory-layout` has no `position: relative`. This means the resizer floats to the nearest positioned ancestor (the tab content), making it invisible or mispositioned. The other two resizers work because they're children of their respective panels which have `position: relative`.

**Fix:** Move the resizer element **inside** `.memory-sidebar` (as the last child), matching the pattern of the other two resizers.

In `index.html`:
```html
<!-- Before (line 718 — resizer is sibling of .memory-sidebar): -->
          </div>
          <div class="panel-resizer" id="memory-sidebar-resizer"></div>
          <div class="memory-main">

<!-- After (resizer is last child of .memory-sidebar): -->
            <div class="panel-resizer" id="memory-sidebar-resizer"></div>
          </div>
          <div class="memory-main">
```

This makes the resizer absolutely positioned within `.memory-sidebar` (which already has `position: relative` at memory.css:22).

**Verification:** Hover over the memory sidebar right edge — accent glow appears. Drag — stronger glow appears.

---

### Task 3: Lower projects panel min-width (renderer.js)

**Problem:** Projects panel minimum width is 200px, user wants 150px.

**Fix:**
- `renderer.js:3793` — Change `Math.max(200, ...)` to `Math.max(150, ...)`

```javascript
// Before:
const newWidth = Math.min(600, Math.max(200, startWidth + (e.clientX - startX)));

// After:
const newWidth = Math.min(600, Math.max(150, startWidth + (e.clientX - startX)));
```

**Verification:** Drag projects panel resizer left — panel narrows below 200px down to 150px.

---

### Task 4: Investigate and fix width persistence bugs (renderer.js + MemoryEditor.js)

**Problem:** Projects panel width and memory sidebar width don't restore on restart, even though save + restore code exists.

**Root cause investigation:** The save/restore code looks correct at first glance:
- Settings load at `renderer.js:160` (`await initializeState()`) before panels init
- Projects resizer IIFE at line 3777 runs after settings load
- MemoryEditor.init at line 261 runs after settings load

**Likely root cause:** The `settingsState.get().projectsPanelWidth` returns `null` (default) because `saveSettings()` is debounced at 500ms — if the app closes quickly after a resize, the write may not complete. OR the value is saved correctly but something else resets the panel width after restoration (e.g., a CSS transition, or another init function that sets width).

**Investigation approach during execution:**
1. Add `console.log` to verify saved values actually exist in settings.json
2. Check if anything overrides the inline width after restoration
3. Test if `saveSettingsImmediate()` instead of `saveSettings()` fixes race

**Possible fixes (apply based on investigation):**

**Fix A — Use immediate save for resizer widths:**
Both resizers use `saveSettings()` (debounced 500ms). If the app quits quickly, the save is lost. Switch to `saveSettingsImmediate()` for resize operations since they're infrequent user actions:

```javascript
// renderer.js, projects resizer onMouseUp:
settingsState.setProp('projectsPanelWidth', panel.offsetWidth);
saveSettingsImmediate(); // was: saveSettings()

// MemoryEditor.js, memory resizer onMouseUp:
ss.setProp('memorySidebarWidth', panel.offsetWidth);
saveSettingsImmediate(); // was: saveSettings()
```

**Fix B — Add active class to FileExplorer + Memory resizers (consistency):**
Only the projects resizer toggles `.active` class. Add it to the other two for visual consistency during drag:

```javascript
// FileExplorer.js mousedown:
resizer.classList.add('active');
// FileExplorer.js mouseup:
resizer.classList.remove('active');

// MemoryEditor.js mousedown:
resizer.classList.add('active');
// MemoryEditor.js mouseup:
resizer.classList.remove('active');
```

---

### Execution Order

1. Task 1 (explorer stopPropagation) — independent
2. Task 2 (memory resizer HTML move) — independent
3. Task 3 (min-width change) — independent
4. Task 4 (persistence investigation + fix) — do last, may touch same files

Tasks 1-3 can be done in parallel. Task 4 after.

### Files Modified

| File | Tasks | Changes |
|------|-------|---------|
| `src/renderer/ui/components/FileExplorer.js` | 1, 4B | stopPropagation + active class |
| `index.html` | 2 | Move resizer element inside sidebar |
| `renderer.js` | 3, 4A | Min-width 150px + saveSettingsImmediate |
| `src/renderer/ui/panels/MemoryEditor.js` | 4A, 4B | saveSettingsImmediate + active class |

### Verification Checklist

- [ ] Explorer resizer: no drag-and-drop leaking, no mouse sticking
- [ ] Memory resizer: hover glow visible, drag glow visible
- [ ] Projects panel: can resize down to 150px
- [ ] Projects panel width: survives app restart
- [ ] Memory sidebar width: survives app restart
- [ ] File explorer width: still survives app restart (regression check)
- [ ] All three resizers show active visual feedback during drag
- [ ] `npm test` passes
- [ ] `npm run build:renderer` succeeds
