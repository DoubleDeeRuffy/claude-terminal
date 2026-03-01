---
phase: 31-tab-splitview
plan: 31C
type: execute
wave: 3
depends_on: ["31B"]
files_modified:
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/ui/components/PaneManager.js
  - styles/terminal.css
  - src/renderer/i18n/locales/en.json
  - src/renderer/i18n/locales/fr.json
autonomous: true
requirements:
  - SPLIT-TRIGGER
  - SPLIT-MOVE
  - SPLIT-COLLAPSE
  - SPLIT-DROPZONE
must_haves:
  truths:
    - "Right-click tab > Split Right creates a new pane with that tab"
    - "Right-click tab > Move Right / Move Left moves tab between panes"
    - "Dragging a tab over the right half of another pane's content area triggers split/move"
    - "VSCode-style semi-transparent overlay appears when dragging over content area"
    - "Closing the last tab in a pane collapses the pane automatically"
    - "Maximum 3 panes enforced (Split Right greyed out at max)"
    - "Left pane emptied collapses correctly, remaining panes shift left"
  artifacts:
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "Split triggers, drag-to-split, context menu additions, pane collapse on close"
    - path: "src/renderer/ui/components/PaneManager.js"
      provides: "createPane, collapsePane fully implemented, drop overlay management"
    - path: "styles/terminal.css"
      provides: "Drop overlay styles (.split-drop-overlay)"
    - path: "src/renderer/i18n/locales/en.json"
      provides: "i18n keys for Split Right, Move Right, Move Left"
    - path: "src/renderer/i18n/locales/fr.json"
      provides: "French translations for split actions"
  key_links:
    - from: "TerminalManager.js showTabContextMenu()"
      to: "PaneManager.createPane + moveTabToPane"
      via: "Split Right / Move Right menu actions"
    - from: "TerminalManager.js setupTabDragDrop()"
      to: "PaneManager drop overlay"
      via: "dragover on .pane-content triggers overlay"
    - from: "TerminalManager.js closeTerminal()"
      to: "PaneManager.collapsePane()"
      via: "unregisterTab returns empty -> collapsePane"
---

<objective>
Implement all split triggers (context menu "Split Right", "Move Right"/"Move Left", drag-to-split with drop zone overlay) and automatic pane collapse when the last tab is closed.

Purpose: This is the core user-facing splitview functionality. After this plan, users can create multiple panes, move tabs between them, and panes auto-collapse when empty.

Output: Working splitview with up to 3 panes, context menu actions, drag-to-split with visual overlay, automatic collapse.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/31-tab-splitview/31-CONTEXT.md
@.planning/phases/31-tab-splitview/31-RESEARCH.md
@.planning/phases/31-tab-splitview/31A-SUMMARY.md
@.planning/phases/31-tab-splitview/31B-SUMMARY.md

@src/renderer/ui/components/PaneManager.js
@src/renderer/ui/components/TerminalManager.js (lines 945-1008 setupTabDragDrop, lines 1202-1252 showTabContextMenu, lines 1380-1498 closeTerminal)
@styles/terminal.css
@src/renderer/i18n/locales/en.json
@src/renderer/i18n/locales/fr.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement PaneManager.createPane/collapsePane and context menu split/move actions</name>
  <files>src/renderer/ui/components/PaneManager.js, src/renderer/ui/components/TerminalManager.js, src/renderer/i18n/locales/en.json, src/renderer/i18n/locales/fr.json</files>
  <action>
**1. Implement `createPane(afterPaneId)` in PaneManager.js:**

```javascript
function createPane(afterPaneId) {
  if (paneOrder.length >= 3) return null; // max 3 panes

  const paneId = 'pane-' + nextPaneNum++;
  const paneArea = document.getElementById('split-pane-area');

  // Create divider
  const divider = document.createElement('div');
  divider.className = 'split-divider';

  // Create pane DOM
  const paneEl = document.createElement('div');
  paneEl.className = 'split-pane';
  paneEl.dataset.paneId = paneId.replace('pane-', '');

  const tabsEl = document.createElement('div');
  tabsEl.className = 'pane-tabs';
  tabsEl.setAttribute('role', 'tablist');

  const contentEl = document.createElement('div');
  contentEl.className = 'pane-content';
  contentEl.setAttribute('role', 'region');

  paneEl.appendChild(tabsEl);
  paneEl.appendChild(contentEl);

  // Insert after the reference pane
  const afterPane = panes.get(afterPaneId);
  if (afterPane && afterPane.el.nextSibling) {
    paneArea.insertBefore(divider, afterPane.el.nextSibling);
    paneArea.insertBefore(paneEl, divider.nextSibling);
  } else {
    paneArea.appendChild(divider);
    paneArea.appendChild(paneEl);
  }

  // Register in state
  const afterIndex = paneOrder.indexOf(afterPaneId);
  paneOrder.splice(afterIndex + 1, 0, paneId);
  panes.set(paneId, { el: paneEl, tabsEl, contentEl, tabs: new Set(), activeTab: null });

  // Set up drop overlay for the new pane's content area
  setupPaneDropOverlay(paneId);

  return paneId;
}
```

**2. Implement `collapsePane(paneId)` in PaneManager.js:**

```javascript
function collapsePane(paneId) {
  const pane = panes.get(paneId);
  if (!pane || paneOrder.length <= 1) return; // never collapse the last pane

  // Remove divider (the one preceding this pane, or following if first pane)
  const prevSibling = pane.el.previousElementSibling;
  if (prevSibling && prevSibling.classList.contains('split-divider')) {
    prevSibling.remove();
  } else {
    // First pane — remove following divider
    const nextSibling = pane.el.nextElementSibling;
    if (nextSibling && nextSibling.classList.contains('split-divider')) {
      nextSibling.remove();
    }
  }

  // Remove pane DOM
  pane.el.remove();

  // Update state
  const idx = paneOrder.indexOf(paneId);
  paneOrder.splice(idx, 1);
  panes.delete(paneId);

  // If collapsed pane was active, switch to nearest
  if (activePaneId === paneId) {
    activePaneId = paneOrder[Math.min(idx, paneOrder.length - 1)];
    if (activePaneId && panes.has(activePaneId)) {
      panes.get(activePaneId).el.classList.add('focused');
    }
  }
}
```

**3. Implement `moveTabToPane(termId, targetPaneId)` in PaneManager.js:**

```javascript
function moveTabToPane(termId, targetPaneId) {
  const sourcePaneId = getPaneForTab(termId);
  if (!sourcePaneId || sourcePaneId === targetPaneId) return false;

  const targetPane = panes.get(targetPaneId);
  const sourcePane = panes.get(sourcePaneId);
  if (!targetPane || !sourcePane) return false;

  // Move tab DOM element
  const tabEl = document.querySelector(`.terminal-tab[data-id="${termId}"]`);
  const wrapperEl = document.querySelector(`.terminal-wrapper[data-id="${termId}"]`);
  if (tabEl) targetPane.tabsEl.appendChild(tabEl);
  if (wrapperEl) targetPane.contentEl.appendChild(wrapperEl);

  // Update state
  sourcePane.tabs.delete(termId);
  targetPane.tabs.add(termId);

  // If moved tab was source pane's active tab, switch source to another
  if (sourcePane.activeTab === termId) {
    const remaining = Array.from(sourcePane.tabs);
    sourcePane.activeTab = remaining.length > 0 ? remaining[0] : null;
  }

  return sourcePane.tabs.size === 0; // returns true if source pane is now empty
}
```

**4. Add `setupPaneDropOverlay(paneId)` to PaneManager.js:**

This adds the semi-transparent overlay element to each pane's content area:
```javascript
function setupPaneDropOverlay(paneId) {
  const pane = panes.get(paneId);
  if (!pane) return;

  const overlay = document.createElement('div');
  overlay.className = 'split-drop-overlay';
  overlay.dataset.paneId = paneId.replace('pane-', '');
  pane.contentEl.style.position = 'relative'; // ensure overlay positioning works
  pane.contentEl.appendChild(overlay);
}
```

Call `setupPaneDropOverlay('pane-0')` at the end of `initPanes()`.

Export: `setupPaneDropOverlay`.

**5. Add i18n keys to `en.json`** — add to the `"tabs"` section:

```json
"tabs": {
  "rename": "Rename",
  "close": "Close",
  "closeOthers": "Close Others",
  "closeToRight": "Close Tabs to Right",
  "splitRight": "Split Right",
  "moveRight": "Move Right",
  "moveLeft": "Move Left",
  "moveToPane": "Move to Pane {0}"
}
```

**6. Add i18n keys to `fr.json`** — add to the `"tabs"` section:

```json
"tabs": {
  "rename": "Renommer",
  "close": "Fermer",
  "closeOthers": "Fermer les autres",
  "closeToRight": "Fermer les onglets à droite",
  "splitRight": "Diviser à droite",
  "moveRight": "Déplacer à droite",
  "moveLeft": "Déplacer à gauche",
  "moveToPane": "Déplacer vers le panneau {0}"
}
```

**7. Update `showTabContextMenu()` in TerminalManager.js** (line ~1205):

After the existing "Close Tabs to Right" menu item, add a separator and the split/move items:

```javascript
// After the closeToRight item, add:
{ separator: true },
{
  label: t('tabs.splitRight'),
  icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 3h8v18H3V3zm10 0h8v18h-8V3z"/></svg>',
  disabled: PaneManager.getPaneCount() >= 3,
  onClick: () => {
    const currentPaneId = PaneManager.getPaneForTab(String(id));
    const newPaneId = PaneManager.createPane(currentPaneId);
    if (newPaneId) {
      const sourceEmpty = PaneManager.moveTabToPane(String(id), newPaneId);
      // Activate the moved tab in the new pane
      setActiveTerminal(id);
      // If source pane is empty, collapse it
      if (sourceEmpty) {
        PaneManager.collapsePane(currentPaneId);
      }
    }
  }
}
```

Add Move Right / Move Left items. These should be context-aware — only show when multiple panes exist:

```javascript
// Only add move items when multiple panes exist
...(PaneManager.getPaneCount() > 1 ? [
  {
    label: t('tabs.moveLeft'),
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>',
    disabled: PaneManager.getPaneOrder().indexOf(PaneManager.getPaneForTab(String(id))) === 0,
    onClick: () => {
      const currentPaneId = PaneManager.getPaneForTab(String(id));
      const order = PaneManager.getPaneOrder();
      const idx = order.indexOf(currentPaneId);
      if (idx > 0) {
        const targetPaneId = order[idx - 1];
        const sourceEmpty = PaneManager.moveTabToPane(String(id), targetPaneId);
        setActiveTerminal(id);
        if (sourceEmpty) PaneManager.collapsePane(currentPaneId);
      }
    }
  },
  {
    label: t('tabs.moveRight'),
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>',
    disabled: (() => {
      const order = PaneManager.getPaneOrder();
      return order.indexOf(PaneManager.getPaneForTab(String(id))) === order.length - 1;
    })(),
    onClick: () => {
      const currentPaneId = PaneManager.getPaneForTab(String(id));
      const order = PaneManager.getPaneOrder();
      const idx = order.indexOf(currentPaneId);
      if (idx < order.length - 1) {
        const targetPaneId = order[idx + 1];
        const sourceEmpty = PaneManager.moveTabToPane(String(id), targetPaneId);
        setActiveTerminal(id);
        if (sourceEmpty) PaneManager.collapsePane(currentPaneId);
      }
    }
  }
] : [])
```

**8. Update `closeTerminal()` in TerminalManager.js** (around line 1438):

After `PaneManager.unregisterTab(String(id))` (added in 31A), check if pane is empty and collapse:

```javascript
const paneEmpty = PaneManager.unregisterTab(String(id));
document.querySelector(`.terminal-tab[data-id="${id}"]`)?.remove();
document.querySelector(`.terminal-wrapper[data-id="${id}"]`)?.remove();

// Collapse pane if it's now empty (but not the last pane)
if (paneEmpty && PaneManager.getPaneCount() > 1) {
  const emptyPaneId = /* need to know which pane was empty */;
  PaneManager.collapsePane(emptyPaneId);
}
```

To know WHICH pane became empty, modify `unregisterTab()` to return the paneId when empty:
```javascript
// In PaneManager.js, update unregisterTab:
function unregisterTab(termId) {
  for (const [paneId, pane] of panes) {
    if (pane.tabs.has(termId)) {
      pane.tabs.delete(termId);
      if (pane.activeTab === termId) {
        const remaining = Array.from(pane.tabs);
        pane.activeTab = remaining.length > 0 ? remaining[0] : null;
      }
      return pane.tabs.size === 0 ? paneId : null; // return paneId if empty, null otherwise
    }
  }
  return null;
}
```

Then in closeTerminal():
```javascript
const emptyPaneId = PaneManager.unregisterTab(String(id));
document.querySelector(`.terminal-tab[data-id="${id}"]`)?.remove();
document.querySelector(`.terminal-wrapper[data-id="${id}"]`)?.remove();

if (emptyPaneId && PaneManager.getPaneCount() > 1) {
  PaneManager.collapsePane(emptyPaneId);
}
```

Ensure the `closeTerminal()` next-tab selection logic (lines 1441-1496) still works after pane collapse. The existing logic looks for same-project terminals in state, which is pane-agnostic and should work fine.
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>Context menu shows "Split Right", "Move Right", "Move Left". Split Right creates a new pane. Move actions transfer tabs. Close last tab collapses pane. Max 3 panes enforced. All i18n keys present in en.json and fr.json. Build and tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Implement drag-to-split with VSCode-style drop zone overlay</name>
  <files>src/renderer/ui/components/TerminalManager.js, src/renderer/ui/components/PaneManager.js, styles/terminal.css</files>
  <action>
**1. Add drop zone overlay CSS to `styles/terminal.css`:**

```css
/* Drop zone overlay for split */
.split-drop-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 50%;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 2px dashed var(--accent);
  border-radius: var(--radius);
  pointer-events: none;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.split-drop-overlay.visible {
  opacity: 1;
}

/* When dragging, show cursor feedback on pane content areas */
.pane-content.drag-target {
  outline: none;
}
```

**2. Add drag-over handlers on `.pane-content` elements in PaneManager.js:**

Create a function `setupPaneDragTargets()` that makes each pane's content area a drop target for tab splitting:

```javascript
function setupPaneDragTargets() {
  const paneArea = document.getElementById('split-pane-area');

  // Dragover on content areas — show overlay when tab is dragged over a DIFFERENT pane's content
  paneArea.addEventListener('dragover', (e) => {
    const contentEl = e.target.closest('.pane-content');
    if (!contentEl) return;

    const paneEl = contentEl.closest('.split-pane');
    if (!paneEl) return;
    const targetPaneId = 'pane-' + paneEl.dataset.paneId;

    // Only show overlay if dragging a tab (check dataTransfer)
    // and if this is a different pane than the source tab's pane
    // or if we can create a new pane (< 3 panes)
    const draggedTabId = _currentDragTabId;
    if (!draggedTabId) return;

    const sourcePaneId = getPaneForTab(draggedTabId);
    if (sourcePaneId === targetPaneId && paneOrder.length < 3) {
      // Same pane — show overlay for "split into new pane" if under max
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      showDropOverlay(targetPaneId);
    } else if (sourcePaneId !== targetPaneId) {
      // Different pane — show overlay for "move to this pane"
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      showDropOverlay(targetPaneId);
    }
  });

  paneArea.addEventListener('dragleave', (e) => {
    const contentEl = e.target.closest('.pane-content');
    if (!contentEl) return;
    // Check if we're leaving the content area entirely
    const relatedTarget = e.relatedTarget;
    if (!contentEl.contains(relatedTarget)) {
      const paneEl = contentEl.closest('.split-pane');
      if (paneEl) {
        hideDropOverlay('pane-' + paneEl.dataset.paneId);
      }
    }
  });

  paneArea.addEventListener('drop', (e) => {
    const contentEl = e.target.closest('.pane-content');
    if (!contentEl) return;

    const paneEl = contentEl.closest('.split-pane');
    if (!paneEl) return;
    const targetPaneId = 'pane-' + paneEl.dataset.paneId;

    const draggedTabId = _currentDragTabId;
    if (!draggedTabId) return;

    e.preventDefault();
    hideAllDropOverlays();

    const sourcePaneId = getPaneForTab(draggedTabId);
    if (sourcePaneId === targetPaneId) {
      // Same pane: split right (create new pane and move tab there)
      if (paneOrder.length < 3) {
        const newPaneId = createPane(targetPaneId);
        if (newPaneId) {
          const sourceEmpty = moveTabToPane(draggedTabId, newPaneId);
          if (onTabMovedCallback) onTabMovedCallback(draggedTabId);
          if (sourceEmpty && paneOrder.length > 1) collapsePane(sourcePaneId);
        }
      }
    } else {
      // Different pane: move tab to target pane
      const sourceEmpty = moveTabToPane(draggedTabId, targetPaneId);
      if (onTabMovedCallback) onTabMovedCallback(draggedTabId);
      if (sourceEmpty && paneOrder.length > 1) collapsePane(sourcePaneId);
    }
  });
}

function showDropOverlay(paneId) {
  hideAllDropOverlays();
  const pane = panes.get(paneId);
  if (!pane) return;
  const overlay = pane.contentEl.querySelector('.split-drop-overlay');
  if (overlay) overlay.classList.add('visible');
}

function hideDropOverlay(paneId) {
  const pane = panes.get(paneId);
  if (!pane) return;
  const overlay = pane.contentEl.querySelector('.split-drop-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function hideAllDropOverlays() {
  document.querySelectorAll('.split-drop-overlay.visible').forEach(el =>
    el.classList.remove('visible'));
}

// Track current drag tab ID (set by TerminalManager's dragstart)
let _currentDragTabId = null;
function setDragTabId(id) { _currentDragTabId = id; }
function clearDragTabId() { _currentDragTabId = null; }

// Callback when tab is moved (to trigger setActiveTerminal in TerminalManager)
let onTabMovedCallback = null;
function setOnTabMoved(callback) { onTabMovedCallback = callback; }
```

Export: `setupPaneDragTargets`, `setDragTabId`, `clearDragTabId`, `setOnTabMoved`, `hideAllDropOverlays`.

Call `setupPaneDragTargets()` from initPanes() or from TerminalManager init.

**3. Wire drag tracking in TerminalManager.js `setupTabDragDrop()`:**

In the `dragstart` handler (line ~948), add:
```javascript
PaneManager.setDragTabId(tab.dataset.id);
```

In the `dragend` handler (line ~959), add:
```javascript
PaneManager.clearDragTabId();
PaneManager.hideAllDropOverlays();
```

**4. Wire tab-moved callback** in TerminalManager.js init:
```javascript
PaneManager.setOnTabMoved((termId) => {
  setActiveTerminal(termId);
});
```

**5. Prevent tab-bar drop from conflicting with content-area drop:**

The existing `drop` handler on individual tabs (line ~991-1007) handles tab REORDERING within the tab bar. The new content-area drop handles SPLITTING. These should not conflict because:
- Tab bar drops fire on `.terminal-tab` elements (within `.pane-tabs`)
- Content area drops fire on `.pane-content` elements
- They are separate DOM subtrees

However, verify that `e.stopPropagation()` is called in the tab-bar drop handler to prevent bubbling to the content-area handler. Add `e.stopPropagation()` to the tab drop handler if not already present.

Also update the tab-bar drop handler to support cross-pane reordering: when a tab is dropped on a tab in a DIFFERENT pane, it should be moved to that pane (inserted at the drop position). Update the drop handler:

```javascript
tab.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation(); // prevent content-area handler
  tab.classList.remove('drag-over-left', 'drag-over-right');

  if (!draggedTab || draggedTab === tab) return;

  const targetTabsContainer = tab.closest('.pane-tabs');
  const sourceTabsContainer = draggedTab.closest('.pane-tabs');

  const rect = tab.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  const insertBefore = e.clientX < midX;

  // Cross-pane tab-bar drop: move tab to target pane
  if (sourceTabsContainer !== targetTabsContainer) {
    const targetPaneEl = tab.closest('.split-pane');
    const targetPaneId = 'pane-' + targetPaneEl.dataset.paneId;
    const draggedId = draggedTab.dataset.id;

    // Move wrapper to target pane's content
    const wrapperEl = document.querySelector(`.terminal-wrapper[data-id="${draggedId}"]`);
    const targetContentEl = targetPaneEl.querySelector('.pane-content');
    if (wrapperEl && targetContentEl) targetContentEl.appendChild(wrapperEl);

    // Insert tab at correct position in target tab bar
    if (insertBefore) {
      targetTabsContainer.insertBefore(draggedTab, tab);
    } else {
      targetTabsContainer.insertBefore(draggedTab, tab.nextSibling);
    }

    // Update PaneManager state
    const sourcePaneEl = sourceTabsContainer.closest('.split-pane');
    const sourcePaneId = 'pane-' + sourcePaneEl.dataset.paneId;
    const sourcePane = PaneManager.getPanes().get(sourcePaneId);
    const targetPane = PaneManager.getPanes().get(targetPaneId);

    if (sourcePane) sourcePane.tabs.delete(draggedId);
    if (targetPane) targetPane.tabs.add(draggedId);

    // Collapse source pane if empty
    if (sourcePane && sourcePane.tabs.size === 0 && PaneManager.getPaneCount() > 1) {
      PaneManager.collapsePane(sourcePaneId);
    }
  } else {
    // Same pane: reorder (existing behavior)
    if (insertBefore) {
      targetTabsContainer.insertBefore(draggedTab, tab);
    } else {
      targetTabsContainer.insertBefore(draggedTab, tab.nextSibling);
    }
  }

  PaneManager.clearDragTabId();
  PaneManager.hideAllDropOverlays();
});
```

**6. Add `e.stopPropagation()` to existing tab dragover handler** if not present, to prevent content-area overlay flickering when hovering over tabs.
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>Dragging a tab over a pane's content area shows the accent-colored overlay. Dropping splits (same pane) or moves (different pane). Dragging a tab onto another pane's tab bar reorders into that pane. Empty panes collapse. All drop overlays clean up on dragend. Build and tests pass.</done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` succeeds
2. `npm test` passes
3. Manual: Right-click tab > "Split Right" creates a second pane with that tab
4. Manual: Right-click tab > "Move Right"/"Move Left" moves tab between panes
5. Manual: Drag tab over another pane's content shows semi-transparent overlay
6. Manual: Drop on overlay moves/splits tab
7. Manual: Close last tab in pane collapses it back to single pane
8. Manual: Cannot create more than 3 panes (Split Right greyed out)
9. Manual: Left pane emptied shifts remaining panes left
</verification>

<success_criteria>
- "Split Right" in context menu creates new pane and moves tab there
- "Move Right"/"Move Left" context menu items work and are disabled at boundaries
- Drag-to-split shows accent overlay on content area, drop triggers split/move
- Closing last tab in pane auto-collapses to fewer panes
- Max 3 panes enforced across all triggers
- i18n keys for splitRight, moveRight, moveLeft in both en.json and fr.json
</success_criteria>

<output>
After completion, create `.planning/phases/31-tab-splitview/31C-SUMMARY.md`
</output>
