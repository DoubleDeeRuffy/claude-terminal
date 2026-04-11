# Phase 2: Remove Split-Pane / PaneManager - Context

**Gathered:** 2026-04-11
**Status:** Ready for execution
**Part of:** Tab System Rewrite (phases 1→3)
**Depends on:** Phase 1 ghost (commit `d9395d6f`) must be present in the worktree history.

<domain>
## Phase Boundary

Delete the split-pane / multi-pane tab layout feature entirely:

- `src/renderer/ui/components/PaneManager.js` (489 lines) — deleted.
- HTML in `index.html` — the `<div class="split-pane-area">` /
  `<div class="split-pane">` wrapper collapses to a single tab bar +
  content area pair (new ids `#terminal-tabs` and `#terminal-content`).
- CSS in `styles/terminal.css` — delete `.split-pane-area`,
  `.split-pane`, `.split-pane.focused`, `.split-divider`, `.pane-tabs`
  (or rename to `.terminal-tabs`), `.pane-content` (or rename to
  `.terminal-content`), `.split-drop-overlay`.
- `TerminalManager.js` — delete every `PaneManager.xxx(...)` call and
  the "Split Right" / "Move Left/Right/To Pane" context menu items and
  their drag-to-split handlers.
- `TerminalSessionService.js` — delete the `paneLayout` save block and
  replace the `PaneManager.getPaneOrder()` iteration with a single
  `document.querySelectorAll('#terminal-tabs .terminal-tab')` query.
- `renderer.js` — delete `PaneManager.initPanes()` and all per-pane
  restore logic. Replace with the simplified single-bar restore path
  (phase 3 will rewrite restore semantics more deeply — this phase just
  removes pane coupling).
- i18n — delete `tabs.splitRight`, `tabs.moveLeft`, `tabs.moveRight`,
  `tabs.moveToPane` from `en.json` and `fr.json` (keys only, no other
  edits).

**Why this is phase 2 of 3:** Phase 1 (chat removal) already landed.
Phase 3 (clean tab-system rewrite) assumes `TerminalManager` is free of
both chat branching AND pane coupling before it runs — otherwise phase 3
has to simultaneously preserve the pane layout save/restore semantics
while redesigning tab IDs and the active-tab model. That's the kind of
compound surgery that historically regresses this codebase. Separating
the pane removal into its own green-test-suite checkpoint gives phase 3
a clean slate to work from.

**Non-goal:** fixing the existing tab bugs (rename wrong tab, wrong
names on restore, lost active tab). Those are phase 3. This phase must
leave the app behaving identically to today — minus the split feature.
Existing v2 `terminal-sessions.json` files with a `paneLayout` block
should still load; the restore code just ignores the layout and uses
`saved.tabs` in order + `saved.activeTabIndex`.
</domain>

<decisions>
## Implementation Decisions

### DOM collapse
- Collapse `<div class="split-pane-area" id="split-pane-area">` →
  `<div class="split-pane" data-pane-id="0">` → two inner divs
  (`pane-tabs` + `pane-content`) into:

  ```html
  <div id="terminal-tabs" class="terminal-tabs" role="tablist" aria-label="Terminal tabs"></div>
  <div id="terminal-content" class="terminal-content" role="region" aria-label="Terminals"></div>
  ```

- CSS selectors: rename `.pane-tabs` → `.terminal-tabs` and
  `.pane-content` → `.terminal-content`. Keep the geometry /
  flex / color rules that applied to them.
- `.split-pane-area`, `.split-pane*`, `.split-divider`, `.split-drop-overlay`
  — delete wholesale.

### TerminalManager call-site strategy
Every `PaneManager.xxx(...)` call maps to one of:
- **Delete** (the call is the whole point of split) — drag-split
  handlers, context menu items, `registerTab` / `unregisterTab`.
- **Replace with a single global selector** — `getTabsContainer()` →
  `document.getElementById('terminal-tabs')`, `getContentContainer()` →
  `document.getElementById('terminal-content')`.
- **Inline-simplify** — `getPaneForTab(id)` returns null now, callers
  just iterate the single tab bar directly.

When in doubt, the loose-equality `tab.dataset.id == id` comparisons
currently in `setActiveTerminal`'s DOM-toggle loops can stay on their
current loose semantics for this phase. Phase 3 will convert the whole
system to string IDs and strict equality — don't pre-empt that here.

### TerminalSessionService save path
Replace:
```js
const PaneManager = require('../ui/components/PaneManager');
const paneOrder = PaneManager.getPaneOrder();
const allTabElements = [];
for (const paneId of paneOrder) {
  const tabsEl = PaneManager.getTabsContainer(paneId);
  if (tabsEl) allTabElements.push(...tabsEl.querySelectorAll('.terminal-tab'));
}
```
with:
```js
const tabsEl = document.getElementById('terminal-tabs');
const allTabElements = tabsEl ? Array.from(tabsEl.querySelectorAll('.terminal-tab')) : [];
```

Delete the entire `if (paneOrder.length > 1) { ... session.paneLayout ... }`
block (around lines 137-183 in the current file). Save format stays at
`version: 2` for this phase — phase 3 migrates to v3.

### renderer.js restore path
Delete lines 205-218 (PaneManager init + callbacks), lines 261-268 (pre-create
pane structure), lines 270-278 (tabToPaneIndex map), lines 294-299
(per-pane target setup), lines 324-325 (setActivePaneId restore),
lines 331-366 (per-pane active tab restore block). What's left is a
simple loop that iterates `saved.tabs`, calls `createTerminal` /
`openFileTab` for each, and at the end picks the active tab by
`saved.activeTabIndex`.

### Claude's Discretion
- Exact CSS rule reshaping when renaming `.pane-tabs` → `.terminal-tabs`
  (some rules may collapse with existing ones).
- Whether to keep the `setupPaneFocusHandlers` idiom in renderer.js as
  dead code removal or just delete the whole wire-up block.
- Dead-code cleanup in `closeTerminal()` where `emptyPaneId` / `closedPaneId`
  were tracked — delete those locals and their branches.
</decisions>

<specifics>
## Specific constraints

- **Worktree execution.** All edits happen inside
  `C:/Users/uhgde/source/repos/claude-terminal-rewrite` (detached HEAD).
  The main checkout at `C:/Users/uhgde/source/repos/claude-terminal` is
  NOT touched by this phase.
- **Phase 1 ghost must be present.** Before editing, verify
  `git log d9395d6f -1` succeeds in the worktree.
- **Test + build gates** must still be green at the end:
  - `npm run build:renderer` — no `PaneManager` references, clean bundle.
  - `npm test` — 450/450 passing (phase 2 shouldn't change test count).
- **Grep sweep** at the end must return zero hits:
  `grep -rn "PaneManager\|paneLayout\|split-pane\|split-drop-overlay\|\.split-pane" src/ styles/ index.html renderer.js`
- **Manual E2E** (only if the app actually runs):
  - Open a project with 3 terminals, rename one, quit, relaunch → all
    3 terminals come back in the correct order with their names intact.
    (Names may still be wrong — that's the phase 3 bug. Count and order
    must be right.)
</specifics>

<code_context>
## Existing Code Insights

### Files to modify
- `src/renderer/ui/components/PaneManager.js` — **DELETE**
- `src/renderer/ui/components/TerminalManager.js` — strip PaneManager usage
- `src/renderer/services/TerminalSessionService.js` — rewrite save DOM query + delete paneLayout block
- `renderer.js` — simplify restore loop
- `index.html` — collapse DOM
- `styles/terminal.css` — delete split CSS / rename pane selectors
- `src/renderer/i18n/locales/en.json` — delete 4 i18n keys
- `src/renderer/i18n/locales/fr.json` — delete 4 i18n keys

### Grep anchors for TerminalManager PaneManager call sites

At the time of this plan (post phase 1, pre phase 2), the PaneManager
call sites were approximately:

- `const PaneManager = require('./PaneManager');` — line 49 (after chat
  require was deleted in phase 1; subtract 1 from the phase-1 numbers)
- Tab drag handlers that set/clear `dragTabId` + hide overlays
- `showTabContextMenu()` — "Split Right" item, the whole 2-pane /
  3-pane move-items block
- `setActiveTerminal()` — the `const paneId = PaneManager.getPaneForTab(...)`
  / `pane.tabsEl.querySelectorAll(...)` / `pane.contentEl.querySelectorAll(...)`
  block → replace with document-scoped queries on `#terminal-tabs` /
  `#terminal-content`
- `closeTerminal()` — `closedPaneId` / `emptyPaneId` / `unregisterTab` /
  `collapsePane` / `samePaneId pane.activeTab` fallback for successor
  tab selection — delete these, walk activation history directly
- `createTerminal()` — `getTabsContainer()` / `getContentContainer()` /
  `registerTab()` calls
- `openFileTab()` — same pattern
- All type-console creators (FiveM, WebApp, API, TypeConsole) — same
  pattern

Use Grep `PaneManager\.` in the worktree to find exact line numbers at
execution time.

### Patterns already correct for phase 2

- Tab IDs stay as whatever mix of string and number they currently are;
  phase 3 unifies them.
- `tab.dataset.id == id` loose equality stays put; phase 3 fixes it.
- `lastActivePerProject` closure stays put; phase 3 moves it into state.
- The `session-names.json` secondary writer stays exactly as-is.

### Integration points untouched by this phase

- `HookEventServer`, `ClaudeEventBus` consumers — they don't know about panes.
- `ControlTowerPanel.js` — already rewritten in phase 1, no pane references.
- `RemoteServer.js` — already stripped in phase 1.
- All workflow / parallel-task code — doesn't touch the DOM.
</code_context>

<deferred>
## Deferred to Phase 3

- Unified string tab IDs
- `activePerProject` state + single source of truth for active tab
- v3 `terminal-sessions.json` format
- Rename-the-wrong-tab fix (scoped `#terminal-tabs` querySelector + warn-on-miss)
- Wrong-names-on-restore fix (never fall back to `project.name`)
- Strict `===` in `setActiveTerminal` DOM toggles
- `filterByProject` safety invariant audit
</deferred>

---

*Phase: 2-remove-split-pane*
*Part of: Tab System Rewrite (1→3)*
*Context gathered: 2026-04-11*
