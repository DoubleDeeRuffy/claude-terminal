# Phase 31: Tab-Splitview - Research

**Researched:** 2026-03-01
**Domain:** Electron renderer DOM architecture, CSS flex layout, drag-and-drop, session persistence
**Confidence:** HIGH

## Summary

Implementing VSCode-style splitview requires introducing a "pane" abstraction layer between the existing flat tab bar / content container and the terminal instances. The current architecture has a single `#terminals-tabs` div and a single `#terminals-container` div hardcoded in `index.html`, with 15+ direct `getElementById` references across TerminalManager.js (4391 lines). All tab creation, switching, drag-drop, context menus, filtering, and persistence flow through these two singleton containers.

The refactoring is significant but well-scoped: the pane concept wraps existing tab/wrapper DOM elements without changing terminal creation, PTY management, or chat/file viewer logic. The key challenge is that `setActiveTerminal()` currently operates globally (toggling `.active` on ALL `.terminal-wrapper` elements via `document.querySelectorAll`), and session persistence reads DOM order from `#terminals-tabs .terminal-tab` -- both must become pane-aware.

**Primary recommendation:** Introduce a `PaneManager` module that owns pane lifecycle (create/collapse/layout) and provides `getTabsContainer(paneId)` / `getContentContainer(paneId)` accessors. TerminalManager.js functions receive an optional `paneId` parameter, defaulting to pane 0 (single-pane mode). This preserves backward compatibility and minimizes the blast radius.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Drop zone style:** VSCode-style overlay -- when dragging a tab, the right half of the content area highlights as a drop target
- **Visual feedback:** Accent-colored semi-transparent overlay on the target half while hovering
- **Non-drag trigger:** "Split Right" option in the tab context menu (right-click -> Split Right)
- **Insert into existing pane:** Same left/right-of-target logic as current tab reordering
- **Last tab closed -> pane collapses:** Automatic collapse back to fewer panes
- **Left pane emptied:** Right/remaining pane(s) take over -- same collapse behavior
- **Maximum panes:** Up to 3 (left/center/right) for v1
- **Persistence:** Full persist across app restarts -- save which tabs are in which pane
- **Context menu entries:** "Move Right" / "Move Left" (relative direction). When 3 panes, submenu shows specific pane targets
- **Split Right on rightmost pane:** Creates new pane to right (up to 3-max). Greyed out at 3
- **No tab cloning:** A tab belongs to exactly one pane
- **No keyboard shortcuts for v1:** Mouse-driven only
- **Fixed equal-width panes:** 50/50 for 2, 33/33/33 for 3. No manual resizing
- **Proportional sizing:** Only pane count and tab assignments need persisting

### Deferred Ideas (OUT OF SCOPE)
- Vertical splitting (top/bottom)
- More than 3 panes
- Manual pane resizing / draggable divider
- Keyboard shortcuts for pane focus or tab movement
- Tab cloning (same file in multiple panes)
</user_constraints>

## Architecture Patterns

### Current DOM Structure (Single Pane)
```
.terminals-panel
  .terminals-header (filter bar, git actions, etc.)
  .terminals-tabs#terminals-tabs        <-- single flat tab bar
  .terminals-container#terminals-container  <-- single content area
    .terminal-wrapper[data-id]          <-- absolute-positioned, only .active visible
    .terminal-wrapper[data-id]
    ...
    .empty-state#empty-terminals
```

### Proposed DOM Structure (Multi-Pane)
```
.terminals-panel
  .terminals-header (unchanged)
  .split-pane-area                       <-- NEW flex container
    .split-pane[data-pane-id="0"]        <-- pane wrapper (flex: 1)
      .pane-tabs                         <-- pane-scoped tab bar
      .pane-content                      <-- pane-scoped content container
        .terminal-wrapper[data-id]       <-- same as before, now scoped to pane
    .split-divider                       <-- NEW visual divider (cosmetic only, not draggable)
    .split-pane[data-pane-id="1"]
      .pane-tabs
      .pane-content
        .terminal-wrapper[data-id]
  .empty-state#empty-terminals           <-- stays outside pane area for global empty state
```

### Pattern 1: Pane Manager Module
**What:** A new module (`PaneManager.js` or section in TerminalManager) that encapsulates pane state.
**When to use:** All pane lifecycle operations.

```javascript
// Core pane state
const panes = new Map(); // paneId -> { tabsEl, contentEl, tabs: Set<termId>, activeTab: string|null }
let paneOrder = ['pane-0']; // ordered left to right, max 3

// Key functions
function createPane() { /* creates DOM elements, returns paneId */ }
function collapsePane(paneId) { /* removes pane, reassigns tabs if needed */ }
function getPaneForTab(termId) { /* returns paneId */ }
function moveTabToPane(termId, targetPaneId) { /* DOM move + state update */ }
function splitRight(termId) { /* creates new pane, moves tab there */ }
function getTabsContainer(paneId) { /* returns pane's tab bar element */ }
function getContentContainer(paneId) { /* returns pane's content element */ }
```

### Pattern 2: Tab-to-Pane Mapping on termData
**What:** Each terminal's `termData` object gets a `paneId` field.
**When to use:** Everywhere termData is created or persisted.

```javascript
// In createTerminal(), createChatTerminal(), openFileTab(), etc:
const termData = {
  // ... existing fields ...
  paneId: targetPaneId || getDefaultPaneId(), // defaults to left-most pane
};
```

### Pattern 3: Pane-Scoped Active Tab
**What:** Each pane tracks its own active tab independently. The "global" active terminal is the active tab of the focused pane.
**When to use:** `setActiveTerminal()` refactoring.

Current `setActiveTerminal()` toggles `.active` on ALL `.terminal-tab` and `.terminal-wrapper` elements globally:
```javascript
// CURRENT (line 1284-1290) - MUST CHANGE
document.querySelectorAll('.terminal-tab').forEach(t => t.classList.toggle('active', t.dataset.id == id));
document.querySelectorAll('.terminal-wrapper').forEach(w => {
  const isActive = w.dataset.id == id;
  w.classList.toggle('active', isActive);
  w.style.removeProperty('display');
});
```

**New approach:** Each pane shows its own active wrapper. Global active = the one that has keyboard focus.
```javascript
function setActiveTerminal(id) {
  const paneId = getPaneForTab(id);
  const pane = panes.get(paneId);

  // Toggle active only within this pane's DOM
  pane.tabsEl.querySelectorAll('.terminal-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.id == id));
  pane.contentEl.querySelectorAll('.terminal-wrapper').forEach(w => {
    w.classList.toggle('active', w.dataset.id == id);
    w.style.removeProperty('display');
  });

  // Update pane's active tab
  pane.activeTab = id;

  // Update global active terminal state
  setActiveTerminalState(id);

  // Focus handling, scroll restore, time tracking... (unchanged logic)
}
```

### Anti-Patterns to Avoid
- **Global `document.querySelectorAll('.terminal-tab')`:** Must become pane-scoped queries. There are 6 call sites that do global queries.
- **Hardcoding `getElementById('terminals-tabs')`:** There are 8 call sites that grab the single tab container, and 7 that grab the content container. Each must route through PaneManager.
- **Storing pane state in DOM only:** Pane-to-tab mapping must be in JS state (for persistence and filtering), not just DOM structure.

## Code Inventory: All Sites Requiring Changes

### getElementById('terminals-tabs') -- 8 call sites
| Line | Function | Change Needed |
|------|----------|---------------|
| 997 | `setupTabDragDrop()` drop handler | Use tab's parent pane's tabsContainer |
| 1209 | `showTabContextMenu()` | Scope to pane's tabs |
| 1576 | `createTerminal()` | Append to target pane's tabs |
| 1897 | `createFivemConsole()` variant | Append to target pane's tabs |
| 3100 | `createTypeConsole()` | Append to target pane's tabs |
| 3259 | `createTypeConsole()` variant | Append to target pane's tabs |
| 3522 | `openFileTab()` | Append to target pane's tabs |
| 4001 | `createChatTerminal()` | Append to target pane's tabs |

### getElementById('terminals-container') -- 7 call sites
| Line | Function | Change Needed |
|------|----------|---------------|
| 1596 | `createTerminal()` | Append to target pane's content |
| 1910 | console variant | Append to target pane's content |
| 3111 | `createTypeConsole()` | Append to target pane's content |
| 3270 | `createTypeConsole()` variant | Append to target pane's content |
| 3534 | `openFileTab()` | Append to target pane's content |
| 4017 | `createChatTerminal()` | Append to target pane's content |

### Global querySelectorAll -- 6 call sites
| Line | Function | Change Needed |
|------|----------|---------------|
| 967 | `setupTabDragDrop()` dragend cleanup | Scope to all panes (OK to stay global for cleanup) |
| 1210 | `showTabContextMenu()` allTabs | Scope to current pane's tabs |
| 1284 | `setActiveTerminal()` tab toggle | Scope to pane |
| 1285 | `setActiveTerminal()` wrapper toggle | Scope to pane |
| 2312 | `filterByProject()` tab indexing | Must iterate all panes |
| 2315 | `filterByProject()` wrapper indexing | Must iterate all panes |

### Session Persistence (TerminalSessionService.js)
| Line | What | Change Needed |
|------|------|---------------|
| 84 | `querySelectorAll('#terminals-tabs .terminal-tab')` for DOM order | Must iterate all panes in order |
| 93 | `projectSessions[projectId] = { tabs: [] }` | Add `panes` field with tab assignments |
| 155 | `sessionData` structure | Add pane layout info |

### Close Terminal (line 1438-1439)
```javascript
document.querySelector(`.terminal-tab[data-id="${id}"]`)?.remove();
document.querySelector(`.terminal-wrapper[data-id="${id}"]`)?.remove();
```
These global selectors still work with panes (since data-id is unique), but must also trigger pane collapse if pane becomes empty.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flex-based equal-width layout | Custom JS resize logic | CSS `flex: 1` on each pane | CSS handles proportional sizing natively, adapts to window resize |
| Drop zone detection | Pixel math for overlay positioning | CSS overlay with `pointer-events: none` + JS dragover on content area | Simpler, more reliable |
| Pane divider styling | Complex border/shadow calculations | Simple 1px CSS border between panes | Fixed-width panes means no drag handle needed |

## Common Pitfalls

### Pitfall 1: FitAddon.fit() During Hidden State
**What goes wrong:** `fitAddon.fit()` called on terminals in non-active pane wrappers causes zero-dimension errors.
**Why it happens:** Non-active wrappers have `display: none`, so dimensions are 0.
**How to avoid:** Each pane shows its own active wrapper. `fitAddon.fit()` only fires for the active tab within each visible pane. The existing `ResizeObserver` on each wrapper handles this naturally (it fires when element becomes visible/resizes).
**Warning signs:** Terminal renders at 1x1 or throws errors in console.

### Pitfall 2: setActiveTerminal() Must Stay Global for State
**What goes wrong:** Time tracking, project switching, Claude heartbeat all depend on a single "active terminal" concept.
**Why it happens:** The app has one active terminal for keyboard focus, notifications, and time tracking.
**How to avoid:** Keep `terminalsState.activeTerminal` as the globally focused terminal. Each pane tracks its own visible tab separately. When user clicks in a pane, that pane's active tab becomes the global active terminal.
**Warning signs:** Time tracking counts double, notifications go to wrong terminal.

### Pitfall 3: filterByProject() With Multiple Panes
**What goes wrong:** Project filtering hides/shows tabs. With panes, a pane might become empty after filtering.
**Why it happens:** The filter iterates all terminals and hides non-matching ones.
**How to avoid:** After filtering, check each pane for visible tabs. If a pane has zero visible tabs, either hide the pane or show an empty state within it. Do NOT collapse panes on filter (they should reappear when filter changes).
**Warning signs:** Empty pane stuck on screen, or pane collapses and tabs are lost.

### Pitfall 4: Drag Between Panes vs. Reorder Within Pane
**What goes wrong:** Same drag event needs to handle two different operations: reorder within current pane (existing behavior) vs. move to a different pane (new behavior).
**Why it happens:** Both use the same HTML5 drag-and-drop API.
**How to avoid:** Use drop zone detection on the **content area** (not tab bar) for split/move-to-pane. Tab bar drop continues to mean reorder. The VSCode overlay appears only when dragging over the content area of a different pane.
**Warning signs:** Tab accidentally splits when user wanted to reorder.

### Pitfall 5: Session Restore Order
**What goes wrong:** Panes must exist before tabs are restored into them.
**Why it happens:** The restore loop creates terminals sequentially; panes need to be pre-created.
**How to avoid:** On restore: first create pane structure from saved layout, then create terminals targeting specific panes.
**Warning signs:** All tabs end up in pane 0, losing the saved layout.

### Pitfall 6: closeTerminal() Pane Collapse Race
**What goes wrong:** Closing the last tab in a pane triggers collapse, but the tab-close animation/handler might conflict.
**Why it happens:** `closeTerminal()` removes DOM elements then selects next terminal.
**How to avoid:** After removing terminal from pane, check `pane.tabs.size === 0`. If empty, collapse pane first (moving DOM), then select next terminal in remaining pane.
**Warning signs:** Orphaned empty pane, or JS error when trying to activate tab in collapsed pane.

## CSS Changes Required

### New CSS: Pane Layout
```css
/* Pane container replaces direct .terminals-tabs + .terminals-container */
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
  min-width: 0; /* prevent flex overflow */
}

.split-divider {
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}

/* Pane-scoped tab bar (inherits from .terminals-tabs) */
.pane-tabs {
  display: flex;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 8px;
  min-height: 40px;
  gap: 4px;
  overflow-x: auto;
}

/* Pane-scoped content (inherits from .terminals-container) */
.pane-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--bg-primary);
}

/* Drop zone overlay for split */
.split-drop-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 2px dashed var(--accent);
  border-radius: var(--radius);
  pointer-events: none;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.15s;
}

.split-drop-overlay.right {
  right: 0;
  left: auto;
}

.split-drop-overlay.left {
  left: 0;
  right: auto;
}

.split-drop-overlay.visible {
  opacity: 1;
}
```

### CSS Changes to Existing Styles
The existing `.terminals-tabs` and `.terminals-container` selectors stay as fallback but new pane-scoped classes (`.pane-tabs`, `.pane-content`) replicate their styles. The `.terminal-wrapper` absolute positioning pattern stays the same -- it works within each pane's `.pane-content`.

## Persistence Changes

### Current Session Data Format (terminal-sessions.json)
```json
{
  "version": 1,
  "savedAt": "...",
  "lastOpenedProjectId": "...",
  "projects": {
    "project-id": {
      "tabs": [
        { "cwd": "...", "isBasic": false, "mode": "terminal", "claudeSessionId": "...", "name": "..." },
        { "type": "file", "filePath": "...", "name": "..." }
      ],
      "activeTabIndex": 1,
      "activeCwd": "..."
    }
  }
}
```

### New Session Data Format
```json
{
  "version": 2,
  "savedAt": "...",
  "lastOpenedProjectId": "...",
  "projects": {
    "project-id": {
      "paneLayout": {
        "count": 2,
        "activePane": 0,
        "panes": [
          { "tabIndices": [0, 1], "activeTabIndex": 0 },
          { "tabIndices": [2], "activeTabIndex": 0 }
        ]
      },
      "tabs": [
        { "cwd": "...", "isBasic": false, "mode": "terminal", "claudeSessionId": "...", "name": "..." },
        { "type": "file", "filePath": "...", "name": "..." },
        { "cwd": "...", "isBasic": false, "mode": "terminal", "name": "..." }
      ],
      "activeCwd": "..."
    }
  }
}
```

**Backward compatibility:** If `paneLayout` is missing (version 1 data), all tabs go to pane 0. The `activeTabIndex` at project level is still respected. This makes the migration seamless.

## Key Refactoring Strategy

### Phase Approach (Recommended Wave Order)

**Wave 1: Pane Infrastructure**
- Create PaneManager module with pane CRUD, state tracking
- Modify `index.html` to use `.split-pane-area` wrapper (or create it dynamically)
- Initial state: always 1 pane (no behavioral change)
- Wire all `getElementById('terminals-tabs')` / `getElementById('terminals-container')` calls through PaneManager

**Wave 2: Multi-Pane Activation**
- Refactor `setActiveTerminal()` to be pane-aware
- Per-pane active tab tracking
- `filterByProject()` pane-aware iteration
- CSS for 2-pane and 3-pane layouts

**Wave 3: Split Triggers**
- Context menu "Split Right" action
- Drag-to-split with drop zone overlay on content area
- "Move Right" / "Move Left" context menu actions
- Pane collapse on last-tab-close

**Wave 4: Persistence**
- Update `TerminalSessionService.js` to save pane layout
- Update restore logic to create panes first, then tabs
- Backward-compatible version detection

### Functions That Need No Changes
These functions operate on terminal state (not DOM containers) and are pane-agnostic:
- `updateTerminalStatus()` -- updates tab class by `data-id` selector (globally unique)
- `updateTerminalTabName()` -- updates tab text by `data-id` selector
- `cleanupTerminalResources()` -- disposes xterm/ResizeObserver
- All PTY data handlers, IPC dispatchers
- Title change detection, ready state debounce
- Mode switching (terminal <-> chat)

## index.html Changes

The existing static HTML:
```html
<div class="terminals-tabs" id="terminals-tabs" role="tablist"></div>
<div class="terminals-container" id="terminals-container" role="region">
  <div class="empty-state" id="empty-terminals">...</div>
</div>
```

Must become (either in HTML or created dynamically on init):
```html
<div class="split-pane-area" id="split-pane-area">
  <div class="split-pane" data-pane-id="0">
    <div class="pane-tabs" role="tablist"></div>
    <div class="pane-content" role="region">
      <!-- terminal-wrappers go here -->
    </div>
  </div>
  <!-- Additional panes created dynamically -->
</div>
<div class="empty-state" id="empty-terminals" style="display:none">...</div>
```

**Recommendation:** Create pane-0 in HTML statically, create additional panes dynamically via PaneManager. Keep `#empty-terminals` outside the pane area so it can overlay the whole content region.

## External References

### Files That Reference TerminalManager DOM
| File | What It Does | Impact |
|------|-------------|--------|
| `ProjectList.js:850-851` | Shows `#terminals-container` and `#terminals-tabs` on project select | Must reference `#split-pane-area` or be removed if panes manage their own visibility |
| `TerminalSessionService.js:84` | Reads tab order from `#terminals-tabs .terminal-tab` | Must iterate all panes |

## Open Questions

1. **Global empty state vs. per-pane empty state**
   - What we know: Currently `#empty-terminals` shows when no terminals match the filter. With panes, a pane might be empty due to filtering while another has tabs.
   - Recommendation: Show per-pane empty state only when ALL panes are empty (after filter). Individual panes with no visible tabs should just show their last content dimmed or a minimal placeholder. This simplifies the implementation significantly.

2. **Focus pane switching**
   - What we know: User clicks in a pane to focus it, making its active tab the global active terminal.
   - What's unclear: Should clicking the tab bar of pane 2 also focus that pane? (Yes, almost certainly.)
   - Recommendation: Any click within `.split-pane` sets that pane as focused, updating global active terminal to that pane's active tab.

## Sources

### Primary (HIGH confidence)
- Direct code reading of `TerminalManager.js` (4391 lines) -- all function signatures, DOM queries, state management
- Direct code reading of `TerminalSessionService.js` (212 lines) -- full persistence format
- Direct code reading of `terminals.state.js` (202 lines) -- state shape
- Direct code reading of `terminal.css` (1917 lines) -- current layout system
- Direct code reading of `index.html` (lines 287-436) -- DOM structure

### Secondary (MEDIUM confidence)
- VSCode split editor architecture (conceptual pattern) -- well-known in Electron ecosystem

## Metadata

**Confidence breakdown:**
- Architecture patterns: HIGH - based on direct code reading of all affected files
- CSS changes: HIGH - flex-based layout is well-understood, current CSS uses same patterns
- Persistence format: HIGH - full understanding of current format and migration path
- Pitfalls: HIGH - identified from actual code patterns (fitAddon, filterByProject, drag-drop)
- Refactoring scope: HIGH - complete inventory of all 21+ call sites requiring changes

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable codebase, no external dependencies for this feature)
