---
phase: 31-tab-splitview
plan: 31A
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/ui/components/PaneManager.js
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/ui/components/ProjectList.js
  - index.html
  - styles/terminal.css
autonomous: true
requirements:
  - SPLIT-INFRA

must_haves:
  truths:
    - "App starts and shows a single pane with all existing tab behavior unchanged"
    - "All tab creation functions route through PaneManager for container access"
    - "Tab drag-drop reordering still works within the single pane"
    - "Project filtering still shows/hides tabs correctly"
    - "Session save still captures DOM tab order correctly"
  artifacts:
    - path: "src/renderer/ui/components/PaneManager.js"
      provides: "Pane CRUD, state tracking, container accessors"
    - path: "index.html"
      provides: "Updated DOM structure with split-pane-area wrapper"
      contains: "split-pane-area"
    - path: "styles/terminal.css"
      provides: "CSS for pane layout structure"
      contains: "split-pane-area"
  key_links:
    - from: "src/renderer/ui/components/TerminalManager.js"
      to: "src/renderer/ui/components/PaneManager.js"
      via: "require + getTabsContainer/getContentContainer calls"
    - from: "src/renderer/ui/components/PaneManager.js"
      to: "index.html"
      via: "DOM queries on .split-pane, .pane-tabs, .pane-content"
---

<objective>
Introduce the PaneManager module and refactor all DOM container references to route through it, while maintaining a single-pane experience with zero behavioral change.

Purpose: This is the foundation for multi-pane splitview. Every `getElementById('terminals-tabs')` and `getElementById('terminals-container')` call must go through PaneManager so that when multi-pane is activated in Plan 31B, the routing "just works."

Output: PaneManager.js module, updated index.html DOM structure, updated TerminalManager.js with all 15 getElementById calls refactored, updated ProjectList.js reference, updated CSS.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/31-tab-splitview/31-CONTEXT.md
@.planning/phases/31-tab-splitview/31-RESEARCH.md

@index.html (lines 286-435 for terminals panel DOM)
@src/renderer/ui/components/TerminalManager.js (full file - 4391 lines)
@src/renderer/ui/components/ProjectList.js (lines 840-855)
@src/renderer/services/TerminalSessionService.js (full file - 212 lines)
@styles/terminal.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create PaneManager module and update index.html DOM structure</name>
  <files>src/renderer/ui/components/PaneManager.js, index.html, styles/terminal.css</files>
  <action>
**1. Create `src/renderer/ui/components/PaneManager.js`:**

This module manages pane lifecycle and provides container accessors. Initial state: exactly 1 pane ("pane-0").

```javascript
// Core state
const panes = new Map(); // paneId -> { tabsEl, contentEl, tabs: Set<string>, activeTab: string|null }
let paneOrder = []; // ordered left to right, max 3
let activePaneId = null; // currently focused pane
let nextPaneNum = 0;

// Called once on app init — wraps existing DOM into pane-0
function initPanes() {
  const paneArea = document.getElementById('split-pane-area');
  const paneEl = paneArea.querySelector('.split-pane[data-pane-id="0"]');
  const tabsEl = paneEl.querySelector('.pane-tabs');
  const contentEl = paneEl.querySelector('.pane-content');

  panes.set('pane-0', { el: paneEl, tabsEl, contentEl, tabs: new Set(), activeTab: null });
  paneOrder = ['pane-0'];
  activePaneId = 'pane-0';
  nextPaneNum = 1;
}

// Create a new pane — inserts DOM after the specified pane (or at end)
// Returns the new paneId. Max 3 panes enforced.
function createPane(afterPaneId) { ... }

// Collapse a pane — removes DOM, moves any remaining tabs to neighbor
function collapsePane(paneId) { ... }

// Register a tab (termId) to a pane
function registerTab(termId, paneId) { ... }

// Unregister a tab — returns true if pane is now empty
function unregisterTab(termId) { ... }

// Get the pane a tab belongs to
function getPaneForTab(termId) { ... }

// Move a tab between panes (DOM + state)
function moveTabToPane(termId, targetPaneId) { ... }

// Container accessors — THE KEY API for TerminalManager
function getTabsContainer(paneId) { return panes.get(paneId || activePaneId)?.tabsEl; }
function getContentContainer(paneId) { return panes.get(paneId || activePaneId)?.contentEl; }

// Get default pane for new tabs (the active pane)
function getDefaultPaneId() { return activePaneId || paneOrder[0]; }

function getActivePaneId() { return activePaneId; }
function setActivePaneId(paneId) { activePaneId = paneId; }
function getPaneOrder() { return [...paneOrder]; }
function getPanes() { return panes; }
function getPaneCount() { return paneOrder.length; }
```

For `createPane()`: Create DOM elements (`.split-pane` > `.pane-tabs` + `.pane-content`), insert a `.split-divider` before the new pane, add to panes Map and paneOrder array. Return new paneId.

For `collapsePane()`: Remove pane DOM + preceding divider, remove from Map and paneOrder. Do NOT move tabs here — caller (TerminalManager) handles tab reassignment before calling collapse. If the collapsed pane was the active pane, set activePaneId to the first remaining pane.

For `registerTab(termId, paneId)`: Add termId to `panes.get(paneId).tabs`. This is called by TerminalManager whenever a tab is created.

For `unregisterTab(termId)`: Find which pane owns the tab, remove from Set. Return `true` if the pane's tabs Set is now empty (signals caller to collapse).

For `moveTabToPane(termId, targetPaneId)`: Move the tab DOM element and wrapper DOM element from source pane to target pane. Update state. The tab element is `document.querySelector('.terminal-tab[data-id="TERMID"]')` and wrapper is `document.querySelector('.terminal-wrapper[data-id="TERMID"]')`.

Export all public functions via `module.exports`.

**2. Update `index.html` (lines 427-432):**

Replace:
```html
<div class="terminals-tabs" id="terminals-tabs" role="tablist" aria-label="Terminal tabs"></div>
<div class="terminals-container" id="terminals-container" role="region" aria-label="Terminals">
  <div class="empty-state" id="empty-terminals">
```

With:
```html
<div class="split-pane-area" id="split-pane-area">
  <div class="split-pane" data-pane-id="0">
    <div class="pane-tabs" role="tablist" aria-label="Terminal tabs"></div>
    <div class="pane-content" role="region" aria-label="Terminals"></div>
  </div>
</div>
<div class="empty-state" id="empty-terminals">
```

Keep `#empty-terminals` OUTSIDE the split-pane-area — it overlays the whole content region. Keep the original `id="terminals-tabs"` and `id="terminals-container"` removed. The old IDs are replaced by PaneManager accessors.

**3. Add CSS to `styles/terminal.css`:**

Add these styles after the existing `.terminals-panel` block (around line 15):

```css
/* Split Pane Layout */
.split-pane-area {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.split-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.split-divider {
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}

/* Pane-scoped tab bar — reuses .terminals-tabs styling */
.pane-tabs {
  display: flex;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 8px;
  min-height: 40px;
  gap: 4px;
  overflow-x: auto;
  align-items: center;
}

/* Pane-scoped content — reuses .terminals-container sizing */
.pane-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--bg-primary);
}
```

Verify that `.terminal-tab` and `.terminal-wrapper` styles do NOT depend on being inside `#terminals-tabs` or `#terminals-container` specifically (they use class selectors, so they should work inside `.pane-tabs` and `.pane-content`).

Copy any existing `.terminals-tabs` scrollbar styling to also apply to `.pane-tabs` (check for `::-webkit-scrollbar` rules scoped to `.terminals-tabs`).
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>PaneManager.js exists with all exported functions. index.html uses .split-pane-area wrapper with pane-0. CSS for pane layout added. Build succeeds.</done>
</task>

<task type="auto">
  <name>Task 2: Refactor all getElementById calls in TerminalManager.js and ProjectList.js to use PaneManager</name>
  <files>src/renderer/ui/components/TerminalManager.js, src/renderer/ui/components/ProjectList.js, src/renderer/services/TerminalSessionService.js</files>
  <action>
**1. Add PaneManager import to TerminalManager.js** (top of file, after existing requires around line 48):
```javascript
const PaneManager = require('./PaneManager');
```

**2. Add PaneManager.initPanes() call** — find the init/setup function in TerminalManager (the module exports an `init` or is called at load time). Add `PaneManager.initPanes()` at the earliest point after DOM is ready. If TerminalManager doesn't have an explicit init, add it to the top-level module body or to the first function that accesses DOM. Check how TerminalManager is initialized in `renderer.js` — it may need to be called there.

**3. Refactor all 8 `getElementById('terminals-tabs')` call sites:**

| Line | Function | Change |
|------|----------|--------|
| ~997 | `setupTabDragDrop()` drop handler | `const tabsContainer = draggedTab.closest('.pane-tabs');` (use the dragged tab's parent pane) |
| ~1209-1210 | `showTabContextMenu()` | `const tabsContainer = document.querySelector('.terminal-tab[data-id="' + id + '"]')?.closest('.pane-tabs');` then `const allTabs = Array.from(tabsContainer.querySelectorAll('.terminal-tab'));` |
| ~1576 | `createTerminal()` | `const tabsContainer = PaneManager.getTabsContainer();` (uses active/default pane) |
| ~1897 | `createFivemConsole()` / createTypeConsole | `const tabsContainer = PaneManager.getTabsContainer();` |
| ~3100 | `createTypeConsole()` resume variant | `const tabsContainer = PaneManager.getTabsContainer();` |
| ~3259 | `createTypeConsole()` debug variant | `const tabsContainer = PaneManager.getTabsContainer();` |
| ~3522 | `openFileTab()` | `const tabsContainer = PaneManager.getTabsContainer();` |
| ~4001 | `createChatTerminal()` | `const tabsContainer = PaneManager.getTabsContainer();` |

**4. Refactor all 7 `getElementById('terminals-container')` call sites:**

| Line | Function | Change |
|------|----------|--------|
| ~1596 | `createTerminal()` | `const container = PaneManager.getContentContainer();` |
| ~1910 | console variant | `const container = PaneManager.getContentContainer();` |
| ~3111 | `createTypeConsole()` resume | `const container = PaneManager.getContentContainer();` |
| ~3270 | `createTypeConsole()` debug | `const container = PaneManager.getContentContainer();` |
| ~3534 | `openFileTab()` | `const container = PaneManager.getContentContainer();` |
| ~4017 | `createChatTerminal()` | `const container = PaneManager.getContentContainer();` |

For the 7th reference found in the research at line 1910, use the same pattern.

**5. Add PaneManager.registerTab() calls** after each tab creation:

In every function that creates a tab (`createTerminal`, `createChatTerminal`, `openFileTab`, `createTypeConsole` x2), after `tabsContainer.appendChild(tab)` and `container.appendChild(wrapper)`, add:
```javascript
PaneManager.registerTab(String(id), PaneManager.getDefaultPaneId());
```

**6. Add PaneManager.unregisterTab() call** in `closeTerminal()` (around line 1438):

Before the existing DOM removal lines:
```javascript
const paneEmpty = PaneManager.unregisterTab(String(id));
// DOM removal stays the same:
document.querySelector(`.terminal-tab[data-id="${id}"]`)?.remove();
document.querySelector(`.terminal-wrapper[data-id="${id}"]`)?.remove();
// Pane collapse will be handled in Plan 31C
```

**7. Update `showTabContextMenu()`** (line ~1209-1210):

The `allTabs` and `thisIndex` logic must be scoped to the PANE's tabs, not all tabs globally. This is already handled by step 3 above (using `.closest('.pane-tabs')` to find the container). The "Close Others" and "Close to Right" actions will correctly scope to pane-level tabs.

**8. Update `filterByProject()`** (lines ~2312-2315):

Replace:
```javascript
document.querySelectorAll('.terminal-tab').forEach(tab => {
  tabsById.set(tab.dataset.id, tab);
});
document.querySelectorAll('.terminal-wrapper').forEach(wrapper => {
  wrappersById.set(wrapper.dataset.id, wrapper);
});
```

With:
```javascript
document.querySelectorAll('.pane-tabs .terminal-tab').forEach(tab => {
  tabsById.set(tab.dataset.id, tab);
});
document.querySelectorAll('.pane-content .terminal-wrapper').forEach(wrapper => {
  wrappersById.set(wrapper.dataset.id, wrapper);
});
```

This scopes to pane children (works for single pane and multi-pane). Alternatively, since data-id is globally unique and we iterate from state anyway, the global querySelectorAll is fine here for now — it just needs to find elements wherever they are in the DOM.

**9. Update `ProjectList.js`** (lines 850-851):

Replace:
```javascript
document.getElementById('terminals-container').style.display = '';
document.getElementById('terminals-tabs').style.display = '';
```

With:
```javascript
document.getElementById('split-pane-area').style.display = '';
```

The split-pane-area controls visibility of ALL panes (tabs + content).

**10. Update `TerminalSessionService.js`** (line 84):

Replace:
```javascript
const tabElements = document.querySelectorAll('#terminals-tabs .terminal-tab');
```

With:
```javascript
// Iterate all panes in order to capture full tab sequence
const PaneManager = require('../ui/components/PaneManager');
const paneOrder = PaneManager.getPaneOrder();
const tabElements = [];
for (const paneId of paneOrder) {
  const tabsEl = PaneManager.getTabsContainer(paneId);
  if (tabsEl) {
    tabElements.push(...tabsEl.querySelectorAll('.terminal-tab'));
  }
}
```

This preserves DOM order within each pane and iterates panes left-to-right.

**11. Add PaneManager.initPanes() to renderer.js** if TerminalManager doesn't call it automatically. Find where TerminalManager is first used (around line 155-188 in renderer.js). Before the session restore loop, add:
```javascript
const PaneManager = require('./src/renderer/ui/components/PaneManager');
PaneManager.initPanes();
```
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>All 15 getElementById calls refactored. PaneManager.registerTab called on every tab creation. PaneManager.unregisterTab called on close. TerminalSessionService reads from all panes. ProjectList shows split-pane-area. App starts with single pane, all tab operations work identically to before. Build and tests pass.</done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` succeeds without errors
2. `npm test` passes all existing tests
3. Manual: App starts, single pane visible, tabs create/close/reorder/filter normally
4. Manual: Context menu (Rename, Close, Close Others, Close to Right) works correctly
5. Manual: Session save/restore preserves tab order
</verification>

<success_criteria>
- PaneManager.js exists with all documented exports
- Zero `getElementById('terminals-tabs')` or `getElementById('terminals-container')` calls remain in TerminalManager.js
- Only `getElementById('split-pane-area')` reference in ProjectList.js
- TerminalSessionService iterates panes for tab order
- App behavior is identical to pre-refactor (single pane, all features work)
</success_criteria>

<output>
After completion, create `.planning/phases/31-tab-splitview/31A-SUMMARY.md`
</output>
