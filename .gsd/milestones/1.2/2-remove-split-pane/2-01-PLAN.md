---
phase: 2-remove-split-pane
plan: 01
type: execute
wave: 1
depends_on: [1-chat-sdk-removal-ghost]
files_modified:
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/services/TerminalSessionService.js
  - renderer.js
  - index.html
  - styles/terminal.css
  - src/renderer/i18n/locales/en.json
  - src/renderer/i18n/locales/fr.json
files_deleted:
  - src/renderer/ui/components/PaneManager.js
autonomous: true

must_haves:
  truths:
    - "PaneManager.js no longer exists"
    - "No require('./PaneManager') anywhere in src/"
    - "HTML has a single `#terminal-tabs` container and a single `#terminal-content` container"
    - "No `.split-pane`, `.split-pane-area`, `.split-divider`, or `.split-drop-overlay` selectors in styles/terminal.css"
    - "Tab context menu has no Split / Move items"
    - "Existing v2 terminal-sessions.json files still load (paneLayout field is ignored, not required)"
    - "`npm run build:renderer` succeeds"
    - "`npm test` still passes (450 / 450)"
  artifacts:
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "Single-bar tab + content management, no PaneManager references"
      contains_not: "PaneManager"
    - path: "src/renderer/services/TerminalSessionService.js"
      provides: "Save path queries #terminal-tabs directly; no paneLayout field written"
      contains_not: "paneLayout"
    - path: "renderer.js"
      provides: "Restore loop with no PaneManager init or per-pane branching"
      contains_not: "PaneManager"
    - path: "index.html"
      provides: "Collapsed single-bar DOM with #terminal-tabs + #terminal-content"
      contains: "terminal-tabs"
      contains_not: "split-pane-area"
    - path: "styles/terminal.css"
      provides: "Renamed .terminal-tabs / .terminal-content rules; no split CSS"
      contains_not: "split-pane"
  key_links:
    - from: "TerminalManager.createTerminal"
      to: "document.getElementById('terminal-tabs')"
      via: "direct DOM query replacing PaneManager.getTabsContainer()"
      pattern: "getElementById\\(['\"]terminal-tabs"
    - from: "TerminalSessionService.saveTerminalSessionsImmediate"
      to: "document.getElementById('terminal-tabs')"
      via: "single-bar iteration replacing pane-order loop"
      pattern: "getElementById\\(['\"]terminal-tabs"
---

<objective>
Delete the split-pane / multi-pane feature entirely so the tab system
reverts to a single tab bar + content area. The codebase stays on the
existing (buggy) tab ID scheme, persistence format, and active-tab
tracking — phase 3 fixes those. This phase is strictly about removing
the PaneManager coupling so phase 3 has a clean slate.

Purpose: unblock phase 3 by eliminating the axis of "which pane does a
tab belong to." After this phase, tabs still have the known bugs
(rename wrong tab, wrong names on restore), but there is exactly one
tab bar and one content container.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md

**CRITICAL: this phase executes inside the worktree, NOT the main checkout.**

Before starting any work, cd into:
`C:/Users/uhgde/source/repos/claude-terminal-rewrite`

All paths in this plan are relative to that worktree. `git log` there
must show commit `d9395d6f` as a recent ancestor (phase 1 ghost).
</execution_context>

<context>
@.gsd/PROJECT.md
@.gsd/ROADMAP.md
@.gsd/milestones/1.2/2-remove-split-pane/2-CONTEXT.md
@.gsd/milestones/1.2/1-chat-sdk-removal-ghost/1-CONTEXT.md

<interfaces>
Read at execution time (do NOT paste contents inline — these files change between plan and execute):

- `src/renderer/ui/components/PaneManager.js` — confirm it exists before deletion
- `src/renderer/ui/components/TerminalManager.js` — grep `PaneManager\.` for all call sites
- `src/renderer/services/TerminalSessionService.js` — find the save-path PaneManager loop (~lines 82-100) and the paneLayout block (~lines 137-183)
- `renderer.js` — find PaneManager init (~lines 205-218) and restore branches (~lines 261-366)
- `index.html` — find the DOM block (~lines 493-496 pre phase-2)
- `styles/terminal.css` — find `.split-pane-area` / `.split-pane` / `.split-drop-overlay` / `.pane-tabs` / `.pane-content` blocks (around lines 18-100)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Collapse the DOM in index.html</name>
  <files>index.html</files>
  <action>
Find the block that currently reads (exact strings may differ slightly —
grep for `split-pane-area`):

```html
<div class="split-pane-area" id="split-pane-area">
  <div class="split-pane" data-pane-id="0">
    <div class="pane-tabs" role="tablist" aria-label="Terminal tabs"></div>
    <div class="pane-content" role="region" aria-label="Terminals"></div>
  </div>
</div>
```

Replace with:

```html
<div id="terminal-tabs" class="terminal-tabs" role="tablist" aria-label="Terminal tabs"></div>
<div id="terminal-content" class="terminal-content" role="region" aria-label="Terminals"></div>
```

Keep any surrounding wrappers (e.g., the `empty-terminals` div, the
overall `claude-tab` container). Only the pane-area wrapper collapses.
  </action>
  <verify>
    <automated>grep -n "split-pane\|pane-tabs\|pane-content\|data-pane-id" index.html | head -5</automated>
  </verify>
  <done>
    - No `split-pane-area`, `split-pane`, `pane-tabs`, `pane-content`, or `data-pane-id` strings in index.html
    - `#terminal-tabs` and `#terminal-content` divs both present
  </done>
</task>

<task type="auto">
  <name>Task 2: Strip split/pane CSS from terminal.css</name>
  <files>styles/terminal.css</files>
  <action>
1. Delete every rule that targets `.split-pane-area`, `.split-pane`,
   `.split-pane.focused`, `.split-divider`, `.split-drop-overlay`,
   `.split-drop-overlay.visible`.
2. Rename `.pane-tabs` → `.terminal-tabs` everywhere it appears.
3. Rename `.pane-content` → `.terminal-content` everywhere it appears.
4. If the CSS had flex layout rules that specifically handled the
   split-pane-area flexbox (e.g. `flex: 1 1 0`), preserve the intent on
   the new `.terminal-content` rule — the single content area should
   still fill the available space.

Do NOT touch the `.md-*` markdown renderer rules added in phase 1.
  </action>
  <verify>
    <automated>grep -n "split-pane\|\.pane-tabs\|\.pane-content\|split-divider\|split-drop-overlay" styles/terminal.css</automated>
  </verify>
  <done>
    - No hits for any split-related selector
    - `.terminal-tabs` and `.terminal-content` rules exist and carry the
      layout intent of their predecessors
  </done>
</task>

<task type="auto">
  <name>Task 3: Delete PaneManager.js and strip require from TerminalManager</name>
  <files>src/renderer/ui/components/PaneManager.js, src/renderer/ui/components/TerminalManager.js</files>
  <action>
1. Delete `src/renderer/ui/components/PaneManager.js`.
2. In `TerminalManager.js`, delete the `const PaneManager = require('./PaneManager');` line.
3. Replace every `PaneManager.getTabsContainer()` call with
   `document.getElementById('terminal-tabs')`.
4. Replace every `PaneManager.getContentContainer()` call with
   `document.getElementById('terminal-content')`.
5. Delete every `PaneManager.registerTab(...)`, `PaneManager.unregisterTab(...)`,
   `PaneManager.setPaneActiveTab(...)`, `PaneManager.getPaneForTab(...)`,
   `PaneManager.getPanes()`, `PaneManager.getPaneCount()`,
   `PaneManager.getPaneOrder()`, `PaneManager.createPane(...)`,
   `PaneManager.collapsePane(...)`, `PaneManager.moveTabToPane(...)`,
   `PaneManager.setActivePaneId(...)`, `PaneManager.getActivePaneId(...)`,
   `PaneManager.getActivePaneIndex(...)`, `PaneManager.getDefaultPaneId()`,
   `PaneManager.setDragTabId(...)`, `PaneManager.clearDragTabId(...)`,
   `PaneManager.hideAllDropOverlays(...)`,
   `PaneManager.setOnTabMoved(...)`, `PaneManager.setOnPaneFocus(...)`,
   `PaneManager.setupPaneFocusHandlers(...)`, `PaneManager.initPanes(...)`,
   `PaneManager.showDropOverlay(...)`.
6. In `setActiveTerminal(id)`, replace the pane-scoped DOM toggle block:
   ```js
   const paneId = PaneManager.getPaneForTab(String(id));
   if (paneId) {
     const pane = PaneManager.getPanes().get(paneId);
     if (pane) {
       pane.tabsEl.querySelectorAll('.terminal-tab').forEach(...);
       pane.contentEl.querySelectorAll('.terminal-wrapper').forEach(...);
       PaneManager.setPaneActiveTab(paneId, String(id));
     }
     PaneManager.setActivePaneId(paneId);
   } else {
     /* fallback */
   }
   ```
   With a single direct-query version:
   ```js
   document.querySelectorAll('#terminal-tabs .terminal-tab').forEach(t =>
     t.classList.toggle('active', t.dataset.id == id));
   document.querySelectorAll('#terminal-content .terminal-wrapper').forEach(w => {
     w.classList.toggle('active', w.dataset.id == id);
     w.style.removeProperty('display');
   });
   ```
   ⚠️ **filterByProject safety:** this `removeProperty('display')` blanket
   call is fine in `setActiveTerminal` (the global user-intent switch),
   but do NOT replicate this pattern inside `filterByProject`'s else-branch
   — see the memory feedback note at
   `~/.claude/projects/C--Users-uhgde-source-repos-claude-terminal/memory/feedback-filterByProject-danger.md`.
   Phase 3 will audit `filterByProject` specifically; this phase must
   leave it exactly as-is.
7. In `closeTerminal(id)`, delete the `closedPaneId` / `emptyPaneId` /
   `unregisterTab` / `collapsePane` / pane-local successor branches.
   Keep the `tabActivationHistory` walk-back successor logic and the
   `samePaneId` nearest-neighbor fallback (rename the var `sameProjectTerminalId` to match).
8. Delete every `PaneManager.xxx` call from `showTabContextMenu()`:
   - The "Split Right" menu item (and the separator above it)
   - The "Move Left" / "Move Right" / "Move to Pane {0}" spread
   - Leave the Rename / AI Rename / Close / Close Others / Close to Right items intact.
9. Delete the tab drag-split handlers — any `setupTabDragDrop` code that
   touches `PaneManager.setDragTabId`, `PaneManager.clearDragTabId`,
   `PaneManager.hideAllDropOverlays`. The simple reorder logic that
   uses `insertBefore` within a single tab bar stays.
10. Delete `openFileTab()`'s `PaneManager.registerTab` call and its
    `getTabsContainer()` / `getContentContainer()` calls, replacing them
    with the direct-element queries.
11. Delete every type-console creator (FiveM, WebApp, API, generic
    `createTypeConsole`) `PaneManager.getTabsContainer()` /
    `PaneManager.getContentContainer()` / `PaneManager.registerTab` call
    and replace with the direct-element queries.
  </action>
  <verify>
    <automated>ls src/renderer/ui/components/PaneManager.js 2>&1; grep -rn "PaneManager" src/ renderer.js 2>&1 | head -5</automated>
  </verify>
  <done>
    - `PaneManager.js` file does not exist
    - `grep -rn "PaneManager" src/ renderer.js` returns zero hits
    - `npm run build:renderer` succeeds
  </done>
</task>

<task type="auto">
  <name>Task 4: Strip PaneManager from TerminalSessionService save path</name>
  <files>src/renderer/services/TerminalSessionService.js</files>
  <action>
1. Replace the `const PaneManager = require('../ui/components/PaneManager');`
   + `paneOrder` / `allTabElements` loop at the top of
   `saveTerminalSessionsImmediate()` with:
   ```js
   const tabsEl = document.getElementById('terminal-tabs');
   const allTabElements = tabsEl ? Array.from(tabsEl.querySelectorAll('.terminal-tab')) : [];
   ```
2. Delete the entire `if (paneOrder.length > 1) { for (const [projectId, session] of Object.entries(projectSessions)) { ... session.paneLayout ... } }` block.
3. Delete the paneLayout rendering branch in `_dumpSessionDebugFromData`
   (the `if (layout && layout.panes && layout.panes.length > 1)` block).
4. The save format stays at `version: 2` — no migration in this phase.
  </action>
  <verify>
    <automated>grep -n "PaneManager\|paneLayout" src/renderer/services/TerminalSessionService.js</automated>
  </verify>
  <done>
    - No PaneManager or paneLayout references in the file
    - Save still writes v2 format (same `version: 2`, `projects`, `activeTabIndex`, `tabs[]` shape)
  </done>
</task>

<task type="auto">
  <name>Task 5: Simplify renderer.js restore loop</name>
  <files>renderer.js</files>
  <action>
1. Delete `PaneManager.initPanes()`, `setOnPaneFocus`, `setupPaneFocusHandlers`,
   `setOnTabMoved`, and `const PaneManager = require(...)` at the top of
   the restore section (~lines 205-218 before phase 2).
2. Inside the `for (const projectId of Object.keys(sessionData.projects))`
   loop:
   - Delete the pre-create pane structure block (`if (saved.paneLayout && saved.paneLayout.count > 1) { ... }`).
   - Delete the `tabToPaneIndex` Map build + every use of it (lines
     that do `tabToPaneIndex.set`, `tabToPaneIndex.get`,
     `PaneManager.setActivePaneId`, `prevActivePaneId`).
   - Delete the per-pane active tab restore block (the second
     `if (saved.paneLayout && saved.paneLayout.panes)` block that walks
     `saved.paneLayout.panes.forEach((paneData, paneIdx) => { ... })`
     and sets `PaneManager.setPaneActiveTab` + `setActivePaneId`).
   - Keep the `else` branch (the `saved.activeTabIndex` / `saved.activeCwd`
     legacy path) as the ONLY active-tab-restore logic.
3. Leave `TerminalManager.setActiveTerminal(...)` + `filterByProject(...)`
   calls exactly as-is. Phase 3 rewrites them.
4. Leave the ghost-session skip logic, session-names.json loading, and
   the file-tab restore branch exactly as-is. Phase 3 rewrites those.
  </action>
  <verify>
    <automated>grep -n "PaneManager\|paneLayout" renderer.js</automated>
  </verify>
  <done>
    - No PaneManager or paneLayout references in renderer.js
    - Restore loop contains only single-bar logic
    - `npm run build:renderer` succeeds
  </done>
</task>

<task type="auto">
  <name>Task 6: Delete split i18n keys from en.json and fr.json</name>
  <files>src/renderer/i18n/locales/en.json, src/renderer/i18n/locales/fr.json</files>
  <action>
From both locale files, delete these keys from the `tabs` object:
- `tabs.splitRight`
- `tabs.moveLeft`
- `tabs.moveRight`
- `tabs.moveToPane`

Leave `tabs.rename`, `tabs.aiRename`, `tabs.close`, `tabs.closeOthers`,
`tabs.closeToRight` and any others intact.
  </action>
  <verify>
    <automated>grep -n "splitRight\|moveLeft\|moveRight\|moveToPane" src/renderer/i18n/locales/en.json src/renderer/i18n/locales/fr.json</automated>
  </verify>
  <done>
    - Zero hits for any of the four keys in en.json / fr.json
  </done>
</task>

<task type="auto">
  <name>Task 7: Full verification + commit</name>
  <files>.</files>
  <action>
1. Run the full grep sweep:
   ```bash
   grep -rn "PaneManager\|paneLayout\|split-pane\|split-drop-overlay\|\\.split-pane" src/ styles/ index.html renderer.js
   ```
   Expected: zero hits.

2. Run the renderer build:
   ```bash
   npm run build:renderer
   ```
   Expected: `Build complete: dist/renderer.bundle.js`, no warnings.

3. Run the test suite:
   ```bash
   npm test
   ```
   Expected: 450 / 450 passing. If any tests reference pane layout or
   PaneManager, fix or delete those tests (grep `tests/` for
   `PaneManager` / `paneLayout` first).

4. Commit with this message (single commit, no amend):
   ```
   phase 2: remove split-pane / PaneManager, collapse to single tab bar

   Deletes the split-pane layout feature entirely. The integrated
   PaneManager component (~489 lines) is removed along with its DOM
   wrapper, all its CSS, every TerminalManager call site, the
   paneLayout save format branch, and the per-pane restore logic.

   The HTML collapses from a split-pane-area wrapping a split-pane
   wrapping a pane-tabs + pane-content pair down to a single pair of
   #terminal-tabs / #terminal-content containers.

   TerminalManager.setActiveTerminal now queries the single tab bar
   directly; closeTerminal no longer tracks pane membership or
   collapses empty panes; the tab context menu no longer has Split /
   Move items; tab drag-and-drop reordering still works within the
   single bar.

   TerminalSessionService still writes version: 2 — existing
   terminal-sessions.json files with a paneLayout block still load
   (the field is ignored). Phase 3 migrates to v3.

   Known bugs NOT fixed in this phase (scoped to phase 3):
   - rename still affects the wrong tab in some cases
   - restored tab names still fall back to project.name
   - per-project active tab memory is still split across three places

   npm test: 450 passed. build:renderer: clean.
   This is phase 2 of 3 in the tab system rewrite.
   ```

5. Print the final grep-sweep results and the new commit hash to the
   session summary file.
  </action>
  <verify>
    <automated>npm run build:renderer 2>&1 | tail -5 && npm test 2>&1 | tail -5 && git log --oneline -3</automated>
  </verify>
  <done>
    - All three verify commands succeed
    - Phase 2 commit exists on top of the phase 1 commit in the worktree
    - Summary written to `.gsd/milestones/1.2/2-remove-split-pane/2-01-SUMMARY.md`
  </done>
</task>

</tasks>

<verification>
- `grep -rn "PaneManager\|paneLayout\|split-pane\|split-drop-overlay\|\\.split-pane" src/ styles/ index.html renderer.js` → 0 hits
- `npm run build:renderer` → clean build
- `npm test` → 450 / 450 passing
- `git log --oneline` → phase 2 commit on top of phase 1 (`d9395d6f`)
- Manual (if the app can launch): existing projects with multi-pane saved
  state still load — the old paneLayout field is ignored, tabs restore
  from `saved.tabs` in order, active tab from `saved.activeTabIndex`
</verification>

<success_criteria>
- `PaneManager.js` deleted
- Zero PaneManager / paneLayout / split-pane references remain
- Single `#terminal-tabs` + `#terminal-content` DOM pair
- Renderer builds, all tests pass
- Existing known tab bugs (wrong rename target, wrong names on restore)
  are NOT fixed here — they stay for phase 3 to address
- `filterByProject` was NOT audited or modified — phase 3 owns that
</success_criteria>

<output>
After completion, create `.gsd/milestones/1.2/2-remove-split-pane/2-01-SUMMARY.md`
summarizing:
- The commit hash
- `git diff --stat` for the phase 2 commit
- Any deviations from the plan (e.g., additional PaneManager call sites
  found that weren't in the context doc — document them so phase 3 knows)
- Confirmation that the filterByProject function body was NOT modified
</output>
