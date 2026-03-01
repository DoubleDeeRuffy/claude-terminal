---
phase: 31-tab-splitview
plan: 31D
type: execute
wave: 4
depends_on: ["31C"]
files_modified:
  - src/renderer/services/TerminalSessionService.js
  - src/renderer/ui/components/PaneManager.js
  - renderer.js
autonomous: true
requirements:
  - SPLIT-PERSIST
must_haves:
  truths:
    - "Pane layout persists across app restarts (2-pane or 3-pane layout restored)"
    - "Tab-to-pane assignments persist and restore correctly"
    - "Per-pane active tab restored correctly"
    - "Backward compatible: v1 session data (no paneLayout) loads into single pane"
    - "Session version bumped to 2"
  artifacts:
    - path: "src/renderer/services/TerminalSessionService.js"
      provides: "v2 session format with paneLayout field"
      contains: "paneLayout"
    - path: "renderer.js"
      provides: "Updated restore loop that creates panes first, then tabs into correct panes"
      contains: "paneLayout"
  key_links:
    - from: "TerminalSessionService.js saveTerminalSessionsImmediate()"
      to: "PaneManager state"
      via: "getPaneOrder + getPaneForTab to serialize pane layout"
    - from: "renderer.js restore loop"
      to: "PaneManager.createPane"
      via: "Pre-create panes from paneLayout before tab restore"
---

<objective>
Add full persistence for the split pane layout — save which tabs are in which pane, restore pane structure on app restart, maintain backward compatibility with v1 session data.

Purpose: Without persistence, users lose their pane layout every restart. This is the final piece that makes splitview a first-class feature.

Output: Updated TerminalSessionService with v2 format, updated renderer.js restore loop, backward-compatible migration.
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
@.planning/phases/31-tab-splitview/31C-SUMMARY.md

@src/renderer/services/TerminalSessionService.js (full file)
@renderer.js (lines 188-270 for session restore)
@src/renderer/ui/components/PaneManager.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update TerminalSessionService to save pane layout (v2 format)</name>
  <files>src/renderer/services/TerminalSessionService.js, src/renderer/ui/components/PaneManager.js</files>
  <action>
**1. Update `saveTerminalSessionsImmediate()` in TerminalSessionService.js:**

Currently (line 82-123), this function iterates `#terminals-tabs .terminal-tab` elements in DOM order, groups by project, and builds `{ tabs: [], activeTabIndex, activeCwd }` per project.

The 31A plan already updated line 84 to iterate all panes. Now add paneLayout serialization.

After building the `projectSessions` object (around line 123), add pane layout data for each project:

```javascript
// After the orderedIds loop completes and projectSessions is built:

// Add pane layout information per project
const PaneManager = require('../ui/components/PaneManager');
const paneOrder = PaneManager.getPaneOrder();

if (paneOrder.length > 1) {
  // Multi-pane: record which tabs belong to which pane
  // First, build a global tab-index map (position in the flattened tabs array per project)
  for (const [projectId, session] of Object.entries(projectSessions)) {
    const projectTabIds = []; // ordered list of term IDs for this project
    for (const pId of paneOrder) {
      const tabsEl = PaneManager.getTabsContainer(pId);
      if (tabsEl) {
        tabsEl.querySelectorAll('.terminal-tab').forEach(tabEl => {
          const termId = tabEl.dataset.id;
          const td = terminals.get(termId) || terminals.get(Number(termId));
          if (td && td.project?.id === projectId) {
            projectTabIds.push({ termId, paneId: pId });
          }
        });
      }
    }

    // Build pane layout for this project
    const paneMap = new Map(); // paneId -> { tabIndices, activeTabIndex }
    const tabIdToIndex = new Map();
    session.tabs.forEach((tab, idx) => {
      // Match by index position — tabs are already in order from the pane iteration
      // Actually, we need to match tab entries to their pane assignments
    });

    // Simpler approach: iterate panes and build tabIndices arrays
    const panes = [];
    let globalTabIdx = 0;
    const allTabsFlat = []; // rebuild tabs in pane order

    for (const pId of paneOrder) {
      const tabsEl = PaneManager.getTabsContainer(pId);
      if (!tabsEl) continue;

      const paneTabIndices = [];
      let paneActiveTabIndex = null;
      const paneActiveTab = PaneManager.getPaneActiveTab(pId);

      tabsEl.querySelectorAll('.terminal-tab').forEach(tabEl => {
        const termId = tabEl.dataset.id;
        const td = terminals.get(termId) || terminals.get(Number(termId));
        if (!td || td.project?.id !== projectId) return;

        // Check if tab is visible (not filtered out)
        if (tabEl.style.display === 'none') return;

        paneTabIndices.push(globalTabIdx);
        if (String(termId) === String(paneActiveTab)) {
          paneActiveTabIndex = paneTabIndices.length - 1;
        }
        globalTabIdx++;
      });

      if (paneTabIndices.length > 0) {
        panes.push({
          tabIndices: paneTabIndices,
          activeTabIndex: paneActiveTabIndex ?? 0
        });
      }
    }

    if (panes.length > 1) {
      session.paneLayout = {
        count: panes.length,
        activePane: paneOrder.indexOf(PaneManager.getActivePaneId()),
        panes
      };
    }
    // If only 1 pane, omit paneLayout (backward compat)
  }
}
```

**IMPORTANT:** The tabs array in the session must be ordered to match the paneLayout.tabIndices. Since we iterate panes left-to-right and tabs within each pane in DOM order, the tabs array should already be in the correct order (from the 31A update to iterate all panes). Verify this.

**2. Bump session version to 2:**

Change line ~156:
```javascript
const sessionData = {
  version: 2, // was 1
  savedAt: new Date().toISOString(),
  lastOpenedProjectId,
  projects: projectSessions,
};
```

**3. Add a helper to PaneManager** for getting the active pane's position in order:

```javascript
function getActivePaneIndex() {
  return paneOrder.indexOf(activePaneId);
}
```

Export `getActivePaneIndex` and `getPaneActiveTab` (if not already exported from 31B).
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>Session saves include paneLayout with tab-to-pane assignments. Version bumped to 2. Single-pane sessions omit paneLayout for backward compat. Build and tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Update session restore in renderer.js to recreate panes from saved layout</name>
  <files>renderer.js, src/renderer/ui/components/PaneManager.js</files>
  <action>
**1. Update the session restore loop in `renderer.js`** (lines 188-265):

The current restore logic (lines 196-246) iterates `saved.tabs` sequentially. For pane support, we need to:

a) First create the pane structure from `saved.paneLayout`
b) Then create tabs, routing each to its assigned pane

Replace the per-project restore block (lines 201-245) with:

```javascript
if (!saved.tabs || saved.tabs.length === 0) continue;

// Pre-create pane structure if paneLayout exists
if (saved.paneLayout && saved.paneLayout.count > 1) {
  // Create additional panes (pane-0 already exists from initPanes)
  for (let p = 1; p < saved.paneLayout.count; p++) {
    const lastPaneId = PaneManager.getPaneOrder()[PaneManager.getPaneOrder().length - 1];
    PaneManager.createPane(lastPaneId);
  }
}

const restoredIds = []; // index matches saved.tabs position

// Build a reverse map: tab index -> pane index
const tabToPaneIndex = new Map();
if (saved.paneLayout && saved.paneLayout.panes) {
  saved.paneLayout.panes.forEach((pane, paneIdx) => {
    (pane.tabIndices || []).forEach(tabIdx => {
      tabToPaneIndex.set(tabIdx, paneIdx);
    });
  });
}

for (let tabIdx = 0; tabIdx < saved.tabs.length; tabIdx++) {
  const tab = saved.tabs[tabIdx];
  let restoredId = null;

  // Determine target pane
  const paneIdx = tabToPaneIndex.get(tabIdx) ?? 0;
  const targetPaneId = PaneManager.getPaneOrder()[paneIdx] || PaneManager.getDefaultPaneId();

  // Temporarily set active pane to target so new tab goes there
  const prevActivePaneId = PaneManager.getActivePaneId();
  PaneManager.setActivePaneId(targetPaneId);

  if (tab.type === 'file') {
    if (tab.filePath && fs.existsSync(tab.filePath)) {
      restoredId = TerminalManager.openFileTab(tab.filePath, project);
    }
  } else {
    const cwd = fs.existsSync(tab.cwd) ? tab.cwd : project.path;
    restoredId = await TerminalManager.createTerminal(project, {
      runClaude: !tab.isBasic,
      cwd,
      mode: tab.mode || null,
      skipPermissions: settingsState.get().skipPermissions,
      resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
      name: tab.name || null,
    });
  }

  // Restore previous active pane
  PaneManager.setActivePaneId(prevActivePaneId);

  restoredIds[tabIdx] = restoredId || null;
}

// Restore per-pane active tabs
if (saved.paneLayout && saved.paneLayout.panes) {
  saved.paneLayout.panes.forEach((paneData, paneIdx) => {
    const paneId = PaneManager.getPaneOrder()[paneIdx];
    if (!paneId) return;

    const activeIdx = paneData.activeTabIndex;
    if (activeIdx != null) {
      const tabIndices = paneData.tabIndices || [];
      const globalTabIdx = tabIndices[activeIdx];
      const activeTermId = globalTabIdx != null ? restoredIds[globalTabIdx] : null;
      if (activeTermId) {
        // Set this tab as active in its pane (pane-scoped toggle)
        PaneManager.setPaneActiveTab(paneId, String(activeTermId));
        const pane = PaneManager.getPanes().get(paneId);
        if (pane) {
          pane.tabsEl.querySelectorAll('.terminal-tab').forEach(t =>
            t.classList.toggle('active', t.dataset.id == activeTermId));
          pane.contentEl.querySelectorAll('.terminal-wrapper').forEach(w => {
            w.classList.toggle('active', w.dataset.id == activeTermId);
            w.style.removeProperty('display');
          });
        }
      }
    }
  });

  // Set the globally active pane and its active tab
  const activePaneIdx = saved.paneLayout.activePane ?? 0;
  const activePaneId = PaneManager.getPaneOrder()[activePaneIdx];
  if (activePaneId) {
    PaneManager.setActivePaneId(activePaneId);
    const paneActiveTab = PaneManager.getPaneActiveTab(activePaneId);
    if (paneActiveTab) {
      TerminalManager.setActiveTerminal(paneActiveTab);
    }
  }
} else {
  // No paneLayout (v1 data or single pane) — use legacy activeTabIndex
  if (saved.activeTabIndex != null && restoredIds[saved.activeTabIndex]) {
    TerminalManager.setActiveTerminal(restoredIds[saved.activeTabIndex]);
  } else if (saved.activeCwd) {
    const terminals = terminalsState.get().terminals;
    let activeId = null;
    terminals.forEach((td, id) => {
      if (td.project?.id === projectId && td.cwd === saved.activeCwd) {
        activeId = id;
      }
    });
    if (activeId) {
      TerminalManager.setActiveTerminal(activeId);
    }
  }
}
```

**2. Ensure PaneManager is imported in renderer.js:**

At the top of renderer.js (near the other requires around line 156):
```javascript
const PaneManager = require('./src/renderer/ui/components/PaneManager');
```

If it was already added in 31A (for `initPanes()`), just confirm the import exists.

**3. Handle backward compatibility:**

When `saved.paneLayout` is missing (v1 data), all tabs go to pane-0 (default behavior from the existing code path). The `tabToPaneIndex` map will be empty, so every tab maps to pane index 0. This is correct.

**4. Handle edge case: pane layout references more tabs than saved:**

If `paneLayout.panes[n].tabIndices` references an index beyond `saved.tabs.length`, skip it. The `restoredIds[globalTabIdx]` will be undefined, so the activation code safely handles it.

**5. Handle edge case: saved pane count > 3:**

Though shouldn't happen, guard `createPane` loop: `Math.min(saved.paneLayout.count, 3)`.
  </action>
  <verify>
    <automated>npm run build:renderer && npm test</automated>
  </verify>
  <done>Session restore creates panes from saved layout before restoring tabs. Each tab is routed to its correct pane. Per-pane active tabs restored. v1 session data loads into single pane (backward compat). Build and tests pass.</done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` succeeds
2. `npm test` passes
3. Manual: Create 2-pane layout with tabs in each, restart app — pane layout and tab assignments restored
4. Manual: Create 3-pane layout, restart — all 3 panes restored with correct tabs
5. Manual: Delete terminal-sessions.json, restart with v1-format backup — loads into single pane correctly
6. Manual: Per-pane active tabs are restored (not just global active)
</verification>

<success_criteria>
- Session format version 2 with paneLayout field
- Backward compatible: v1 sessions load without error
- Pane structure created before tabs during restore
- Tab-to-pane routing correct during restore
- Per-pane active tabs restored
- Global active pane restored
</success_criteria>

<output>
After completion, create `.planning/phases/31-tab-splitview/31D-SUMMARY.md`
</output>
