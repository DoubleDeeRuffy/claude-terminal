---
phase: 31-tab-splitview
plan: 31B
type: execute
wave: 2
depends_on: ["31A"]
files_modified:
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/ui/components/PaneManager.js
  - styles/terminal.css
autonomous: true
requirements:
  - SPLIT-ACTIVE
  - SPLIT-FILTER

must_haves:
  truths:
    - "Each pane shows its own active tab independently"
    - "Clicking in a pane makes it the focused pane and updates global active terminal"
    - "filterByProject works correctly with multiple panes"
    - "Time tracking follows the globally focused terminal correctly"
    - "fitAddon.fit only fires for visible active tabs in each pane"
  artifacts:
    - path: "src/renderer/ui/components/PaneManager.js"
      provides: "Updated with per-pane active tab tracking and focus delegation"
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "Pane-aware setActiveTerminal and filterByProject"
    - path: "styles/terminal.css"
      provides: "CSS for multi-pane layouts and focused pane indicator"
  key_links:
    - from: "TerminalManager.js setActiveTerminal"
      to: "PaneManager per-pane activeTab"
      via: "getPaneForTab + pane-scoped DOM toggle"
    - from: "TerminalManager.js filterByProject"
      to: "PaneManager pane iteration"
      via: "getPaneOrder + per-pane querySelectorAll"
---

<objective>
Make setActiveTerminal() and filterByProject() pane-aware so each pane can independently show its own active tab. This is the core behavioral change that enables multi-pane to function.

Purpose: Without pane-aware activation, opening a second pane would cause tab visibility conflicts (only one wrapper visible globally). This plan makes each pane independently manage which tab is visible.

Output: Updated setActiveTerminal() with pane-scoped DOM toggling, per-pane active tab state, focus pane tracking, pane-aware filterByProject(), CSS for multi-pane visibility.
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

@src/renderer/ui/components/PaneManager.js
@src/renderer/ui/components/TerminalManager.js (lines 1257-1320 for setActiveTerminal, lines 2277-2370 for filterByProject)
@styles/terminal.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor setActiveTerminal() to be pane-aware and add per-pane active tab tracking</name>
  <files>src/renderer/ui/components/TerminalManager.js, src/renderer/ui/components/PaneManager.js</files>
  <action>
**1. Update PaneManager.js — add per-pane active tab API:**

Add these functions:
```javascript
function setPaneActiveTab(paneId, termId) {
  const pane = panes.get(paneId);
  if (pane) pane.activeTab = termId;
}

function getPaneActiveTab(paneId) {
  return panes.get(paneId)?.activeTab || null;
}
```

Export both functions.

**2. Refactor `setActiveTerminal()` in TerminalManager.js** (currently at line ~1257):

The current implementation (lines 1283-1290) toggles `.active` on ALL `.terminal-tab` and ALL `.terminal-wrapper` elements globally. This MUST become pane-scoped.

Replace the global toggle block (lines ~1283-1290):
```javascript
// OLD:
setActiveTerminalState(id);
document.querySelectorAll('.terminal-tab').forEach(t => t.classList.toggle('active', t.dataset.id == id));
document.querySelectorAll('.terminal-wrapper').forEach(w => {
  const isActive = w.dataset.id == id;
  w.classList.toggle('active', isActive);
  w.style.removeProperty('display');
});
```

With pane-scoped logic:
```javascript
setActiveTerminalState(id);

const paneId = PaneManager.getPaneForTab(String(id));
if (paneId) {
  const pane = PaneManager.getPanes().get(paneId);
  if (pane) {
    // Toggle active only within THIS pane's tab bar
    pane.tabsEl.querySelectorAll('.terminal-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.id == id));
    // Toggle active only within THIS pane's content
    pane.contentEl.querySelectorAll('.terminal-wrapper').forEach(w => {
      w.classList.toggle('active', w.dataset.id == id);
      w.style.removeProperty('display');
    });
    // Update pane's tracked active tab
    PaneManager.setPaneActiveTab(paneId, String(id));
  }
  // Set this pane as the focused pane
  PaneManager.setActivePaneId(paneId);
} else {
  // Fallback for tabs not yet registered (edge case during init)
  document.querySelectorAll('.terminal-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.id == id));
  document.querySelectorAll('.terminal-wrapper').forEach(w => {
    w.classList.toggle('active', w.dataset.id == id);
    w.style.removeProperty('display');
  });
}
```

IMPORTANT: The rest of `setActiveTerminal()` stays unchanged (scroll capture, terminal blur, focus logic, time tracking, project switch). Only the DOM toggling changes.

**3. Add pane focus click handler:**

In PaneManager.js, add a function `setupPaneFocusHandlers()` that adds click listeners to each `.split-pane` element. When any area of a pane is clicked, it sets that pane as the active pane and makes its active tab the global active terminal:

```javascript
function setupPaneFocusHandlers() {
  const paneArea = document.getElementById('split-pane-area');
  paneArea.addEventListener('mousedown', (e) => {
    const paneEl = e.target.closest('.split-pane');
    if (!paneEl) return;
    const paneId = 'pane-' + paneEl.dataset.paneId;
    if (paneId === activePaneId) return; // already focused

    const pane = panes.get(paneId);
    if (pane && pane.activeTab) {
      // This will trigger setActiveTerminal which sets activePaneId
      // Emit an event or call a callback to trigger setActiveTerminal
      if (onPaneFocusCallback) {
        onPaneFocusCallback(pane.activeTab);
      }
    }
  }, true); // capture phase to fire before xterm focus
}

let onPaneFocusCallback = null;
function setOnPaneFocus(callback) {
  onPaneFocusCallback = callback;
}
```

Export `setupPaneFocusHandlers` and `setOnPaneFocus`.

In TerminalManager.js init code (or renderer.js after PaneManager.initPanes()):
```javascript
PaneManager.setOnPaneFocus((termId) => {
  setActiveTerminal(termId);
});
PaneManager.setupPaneFocusHandlers();
```

**4. Update CSS for pane-scoped wrapper visibility** in `styles/terminal.css`:

The existing `.terminal-wrapper` styles use `display: none` by default and `.terminal-wrapper.active` to show. This pattern works per-pane because each pane's content area only contains its own wrappers. Verify that these CSS rules do NOT use `#terminals-container` as a parent selector. If they do, update to use `.pane-content` instead.

Add focused pane indicator:
```css
.split-pane.focused {
  /* Subtle indicator — optional, could be a slightly different border */
}
```

**5. Add `.focused` class management to PaneManager:**

When `setActivePaneId()` is called, toggle `.focused` class on pane elements:
```javascript
function setActivePaneId(paneId) {
  if (activePaneId && panes.has(activePaneId)) {
    panes.get(activePaneId).el.classList.remove('focused');
  }
  activePaneId = paneId;
  if (paneId && panes.has(paneId)) {
    panes.get(paneId).el.classList.add('focused');
  }
}
```
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>setActiveTerminal() toggles active class only within the target tab's pane. Each pane tracks its own activeTab. Clicking a pane updates global focus. With single pane, behavior is identical to before. Build and tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Make filterByProject() pane-aware and add multi-pane CSS</name>
  <files>src/renderer/ui/components/TerminalManager.js, styles/terminal.css</files>
  <action>
**1. Update `filterByProject()`** (line ~2277 in TerminalManager.js):

The current implementation (lines 2312-2315) uses global `querySelectorAll('.terminal-tab')` and `querySelectorAll('.terminal-wrapper')`. These selectors still work with the new DOM structure (`.terminal-tab` elements are now inside `.pane-tabs` but still match the class selector globally). However, we need to add pane-level empty state handling.

After the existing visibility loop (around line 2346), add pane-level checks:
```javascript
// After the visibility loop that sets visibleCount:

// Check each pane for visible tabs — hide panes with zero visible tabs during filtering
// Do NOT collapse panes (they should reappear when filter changes)
const paneOrder = PaneManager.getPaneOrder();
for (const paneId of paneOrder) {
  const pane = PaneManager.getPanes().get(paneId);
  if (!pane) continue;
  const visibleTabsInPane = Array.from(pane.tabsEl.querySelectorAll('.terminal-tab'))
    .filter(tab => tab.style.display !== 'none');

  if (visibleTabsInPane.length === 0) {
    // Hide this pane (but don't collapse — filter may change)
    pane.el.style.display = 'none';
    // Also hide the preceding divider if any
    const prevSibling = pane.el.previousElementSibling;
    if (prevSibling && prevSibling.classList.contains('split-divider')) {
      prevSibling.style.display = 'none';
    }
  } else {
    pane.el.style.display = '';
    const prevSibling = pane.el.previousElementSibling;
    if (prevSibling && prevSibling.classList.contains('split-divider')) {
      prevSibling.style.display = '';
    }

    // If pane's active tab is hidden, switch to first visible tab in this pane
    const currentActive = PaneManager.getPaneActiveTab(paneId);
    const activeTabEl = currentActive ? pane.tabsEl.querySelector(`.terminal-tab[data-id="${currentActive}"]`) : null;
    if (!activeTabEl || activeTabEl.style.display === 'none') {
      const firstVisible = visibleTabsInPane[0];
      if (firstVisible) {
        // Activate the first visible tab in this pane without changing global focus
        PaneManager.setPaneActiveTab(paneId, firstVisible.dataset.id);
        pane.tabsEl.querySelectorAll('.terminal-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.id === firstVisible.dataset.id));
        pane.contentEl.querySelectorAll('.terminal-wrapper').forEach(w => {
          w.classList.toggle('active', w.dataset.id === firstVisible.dataset.id);
          w.style.removeProperty('display');
        });
      }
    }
  }
}
```

**2. Update the empty state logic** in filterByProject() (line ~2348):

The existing `emptyState.style.display = 'flex'` when `visibleCount === 0` still works — it shows the global empty state overlay when ALL terminals are hidden. No change needed here.

**3. Add CSS for multi-pane layout variations** to `styles/terminal.css`:

These are preparation CSS rules that will be active when Plan 31C creates additional panes:

```css
/* Ensure pane-content wrapper visibility follows .active class (same as .terminals-container) */
.pane-content .terminal-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: none;
}

.pane-content .terminal-wrapper.active {
  display: flex;
  flex-direction: column;
}

/* Empty state sits outside pane area and overlays everything */
.terminals-panel > .empty-state {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
}
```

Verify these don't conflict with existing `.terminal-wrapper` rules. The existing rules likely already set `position: absolute` etc. on `.terminals-container .terminal-wrapper` — those can stay as fallback, but the new `.pane-content .terminal-wrapper` rules should take precedence in the new DOM structure. Check existing specificity and adjust if needed.

**4. Verify the dragend cleanup** in `setupTabDragDrop()` (line ~967):

The global cleanup `document.querySelectorAll('.terminal-tab.drag-over-left, .terminal-tab.drag-over-right')` is fine to stay global — it's a cleanup pass that should clear ALL drag states everywhere. No change needed.
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>filterByProject hides panes with zero visible tabs during filtering. setActiveTerminal is fully pane-scoped. CSS supports both single and multi-pane wrapper visibility. Build and tests pass. App works identically with single pane.</done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` succeeds
2. `npm test` passes
3. Manual: Tab switching only affects the active pane (verifiable even with single pane by confirming no regressions)
4. Manual: Project filter hides/shows tabs, no empty state artifacts
5. Manual: Time tracking still follows active terminal correctly
</verification>

<success_criteria>
- setActiveTerminal() uses pane-scoped DOM queries (no global querySelectorAll for tab/wrapper toggle)
- Each pane tracks its own activeTab via PaneManager
- filterByProject() handles pane visibility (hides panes with no visible tabs, shows when filter changes)
- Pane focus click handler installed (ready for multi-pane)
- CSS supports .pane-content .terminal-wrapper visibility pattern
</success_criteria>

<output>
After completion, create `.planning/phases/31-tab-splitview/31B-SUMMARY.md`
</output>
