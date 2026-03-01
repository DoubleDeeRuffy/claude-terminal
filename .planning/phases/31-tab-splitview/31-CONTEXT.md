# Phase 31: Tab-Splitview

## Goal

Implement a VSCode-style splitview for terminals and file tabs. Users can drag a tab or use a context menu to split the content area into up to 3 independent panes, each with its own tab bar. Context menu actions are scoped per pane.

## Decisions

### Split Trigger & Drop Zones

- **Drop zone style:** VSCode-style overlay — when dragging a tab, the right half of the content area highlights as a drop target
- **Visual feedback:** Accent-colored semi-transparent overlay on the target half while hovering
- **Non-drag trigger:** "Split Right" option in the tab context menu (right-click → Split Right)
- **Insert into existing pane:** Same left/right-of-target logic as current tab reordering (insert before or after the hovered tab based on midpoint)

### Pane Lifecycle & Empty-Pane Behavior

- **Last tab closed → pane collapses:** Automatic collapse back to fewer panes, seamless transition
- **Left pane emptied:** Right/remaining pane(s) take over — same collapse behavior regardless of which pane empties
- **Maximum panes:** Up to 3 (left/center/right) for v1
- **Persistence:** Full persist across app restarts — save which tabs are in which pane, restore on launch

### Tab Movement Between Panes

- **Context menu entries:** "Move Right" / "Move Left" (relative direction). When 3 panes exist, submenu shows specific pane targets
- **Split Right on rightmost pane:** Creates a new pane to the right (up to 3-max). Once at 3, option is greyed out
- **No tab cloning:** A tab belongs to exactly one pane. Moving removes it from the source pane
- **No keyboard shortcuts for v1:** Tab movement is mouse-driven only (drag or context menu)

### Resizable Divider

- **Fixed equal-width panes:** No manual resizing. 50/50 for 2 panes, 33/33/33 for 3 panes
- **Proportional sizing:** Panes share width equally and adapt when the window resizes
- **Double-click divider:** No special behavior
- **Persistence:** Save layout as ratio (not pixels) so it adapts to window size changes. Since widths are always equal, only the pane count and tab assignments need persisting

## Out of Scope

- Vertical splitting (top/bottom) — potential future phase
- More than 3 panes
- Manual pane resizing / draggable divider
- Keyboard shortcuts for pane focus or tab movement
- Tab cloning (same file in multiple panes)

## Code Context

### Current Architecture (TerminalManager.js ~4400 lines)

- **Tab bar:** `#terminals-tabs` — flat flex row of `.terminal-tab` divs with `data-id`
- **Content area:** `#terminals-container` — absolute-positioned `.terminal-wrapper` divs, only `.active` one visible
- **Tab creation:** `createTerminal()` (line ~1504) appends to single tabsContainer and single container
- **Tab switching:** `setActiveTerminal()` (line ~1257) toggles `.active` on all wrappers globally
- **Tab drag/drop:** `setupTabDragDrop()` (line ~945) reorders within single tab bar
- **Context menu:** `showTabContextMenu()` (line ~1205) scoped to single tab bar's children
- **File tabs:** `openFileTab()` (line ~3462) same container, uses `.file-wrapper` class
- **Project filtering:** `filterByProject()` (line ~2277) hides/shows tabs via `display: none`
- **Persistence:** Tab order from DOM order in `#terminals-tabs`, active tab index per project

### Key Refactoring Needed

1. **Pane abstraction:** Introduce a "pane" concept — each pane has its own tab bar + content container
2. **Tab-to-pane mapping:** `termData` needs a `paneId` field; state needs pane tracking
3. **Container layout:** Replace single absolute-positioned stack with flex-based multi-pane layout
4. **setActiveTerminal:** Must become pane-aware — each pane has its own active tab
5. **Drop zones:** New drag-over detection for split targets (content area overlay), not just tab reorder
6. **Context menu:** Scope "Close Others"/"Close to Right" to the pane's tabs; add "Move Right"/"Move Left"/"Split Right"
7. **Persistence:** Extend session data to save pane layout + tab-to-pane assignments + ratios

### CSS Impact

- `styles/terminal.css` — `.terminals-panel`, `.terminals-tabs`, `.terminals-container`, `.terminal-wrapper`
- New CSS needed for: `.split-pane`, `.split-divider`, `.split-drop-overlay`, pane-scoped tab bars
