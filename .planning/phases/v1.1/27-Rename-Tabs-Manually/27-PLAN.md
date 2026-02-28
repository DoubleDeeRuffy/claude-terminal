---
phase: 27-Rename-Tabs-Manually
plan: A
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/i18n/locales/en.json
  - src/renderer/i18n/locales/fr.json
autonomous: true
requirements: []

must_haves:
  truths:
    - "Right-clicking any terminal/file tab shows a context menu with Rename, Close, Close Others, Close Tabs to Right"
    - "Selecting Rename triggers the existing inline rename input on the tab"
    - "Selecting Close closes the right-clicked tab"
    - "Selecting Close Others closes all tabs except the right-clicked one"
    - "Selecting Close Tabs to Right closes all tabs to the right of the right-clicked one"
    - "Context menu works on all tab types (terminal, file, chat, type-console)"
  artifacts:
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "Tab context menu handler function + integration at all 6 tab creation sites"
      contains: "showTabContextMenu"
    - path: "src/renderer/i18n/locales/en.json"
      provides: "i18n keys for tab context menu labels"
      contains: "tabs.closeOthers"
    - path: "src/renderer/i18n/locales/fr.json"
      provides: "French translations for tab context menu labels"
      contains: "tabs.closeOthers"
  key_links:
    - from: "showTabContextMenu"
      to: "showContextMenu (ContextMenu.js)"
      via: "require('./ContextMenu')"
      pattern: "showContextMenu\\("
    - from: "showTabContextMenu"
      to: "startRenameTab, closeTerminal, closeFileTab"
      via: "direct function calls"
      pattern: "startRenameTab\\(|closeTerminal\\(|closeFileTab\\("
---

<objective>
Add a right-click context menu to all tab types (terminal, file, chat, type-console) with Rename, Close, Close Others, and Close Tabs to Right actions.

Purpose: Make tab rename discoverable (currently hidden behind double-click) and provide bulk-close actions matching IDE conventions.
Output: Modified TerminalManager.js with context menu on all tabs, plus i18n keys in en.json and fr.json.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/v1.1/27-Rename-Tabs-Manually/CONTEXT.md
@src/renderer/ui/components/ContextMenu.js
@src/renderer/ui/components/TerminalManager.js

<interfaces>
<!-- Key functions and patterns the executor needs -->

From src/renderer/ui/components/ContextMenu.js:
```javascript
function showContextMenu({ x, y, items, target }) { ... }
// items: Array of { label, icon?, shortcut?, disabled?, danger?, onClick, separator? }
module.exports = { showContextMenu, hideContextMenu, setupContextMenu, MenuItems };
```

From src/renderer/ui/components/TerminalManager.js (existing functions to reuse):
```javascript
function startRenameTab(id) { ... }     // line 1162 — inline rename input
function closeTerminal(id) { ... }       // line 1332 — closes any tab type (terminal, file, chat, type-console)
function closeTypeConsole(id, projectIndex, typeId) { ... } // for type-console tabs
const { getTerminal } = require('../../state');  // returns { type, name, ... } or null
```

Tab DOM structure:
- Tabs live in `#terminals-tabs` as `.terminal-tab[data-id="ID"]`
- Tab ordering is DOM-based — "to the right" = subsequent siblings
- 6 tab creation sites bind handlers at lines: 1689-1691, 1926-1927, 3134-3136, 3305-3307, 3813-3815, 4023-4025

IMPORTANT: `showContextMenu` is used at line 581 in TerminalManager.js without an explicit import.
The executor MUST add `const { showContextMenu } = require('./ContextMenu');` at the top of TerminalManager.js.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add i18n keys for tab context menu</name>
  <files>src/renderer/i18n/locales/en.json, src/renderer/i18n/locales/fr.json</files>
  <action>
Add a new `"tabs"` section to both locale files with these keys:

In `en.json`, add inside the top-level object (after `"common"` section or at end before closing brace):
```json
"tabs": {
  "rename": "Rename",
  "close": "Close",
  "closeOthers": "Close Others",
  "closeToRight": "Close Tabs to Right"
}
```

In `fr.json`, add the same structure with French translations:
```json
"tabs": {
  "rename": "Renommer",
  "close": "Fermer",
  "closeOthers": "Fermer les autres",
  "closeToRight": "Fermer les onglets à droite"
}
```

Place the section logically near the end of each file alongside other UI section keys.
  </action>
  <verify>
    <automated>grep -c "closeOthers" src/renderer/i18n/locales/en.json src/renderer/i18n/locales/fr.json</automated>
  </verify>
  <done>Both locale files contain the 4 tab context menu keys with correct translations.</done>
</task>

<task type="auto">
  <name>Task 2: Implement tab context menu in TerminalManager.js</name>
  <files>src/renderer/ui/components/TerminalManager.js</files>
  <action>
**Step 1: Add import for showContextMenu and confirm closeFileTab is in scope.**

Near the top of TerminalManager.js (after the existing `require('./ChatView')` line ~44), add:
```javascript
const { showContextMenu } = require('./ContextMenu');
```

Also confirm that `closeFileTab` is already declared/accessible in TerminalManager.js (search for `function closeFileTab` or `const closeFileTab`). If it is not in scope, add it to the appropriate require line. This function is needed for closing file-type tabs in the context menu (CONTEXT.md decision).

**Step 2: Create the `showTabContextMenu(e, id)` function.**

Add this function near `startRenameTab` (around line 1194, after the `startRenameTab` function ends). This is a single reusable function called from all tab creation sites:

```javascript
/**
 * Show context menu for a tab (right-click)
 * @param {MouseEvent} e - The contextmenu event
 * @param {string} id - Tab/terminal ID
 */
function showTabContextMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();

  const tabsContainer = document.getElementById('terminals-tabs');
  const allTabs = Array.from(tabsContainer.querySelectorAll('.terminal-tab'));
  const thisTab = tabsContainer.querySelector(`.terminal-tab[data-id="${id}"]`);
  const thisIndex = allTabs.indexOf(thisTab);
  const tabsToRight = allTabs.slice(thisIndex + 1);

  // Use closeFileTab for file tabs, closeTerminal for all other types
  // (CONTEXT.md decision: closeTerminal does not handle file tabs)
  const closeTab = (tabId) => {
    const term = getTerminal(tabId);
    if (term && term.type === 'file') {
      closeFileTab(tabId);
    } else {
      closeTerminal(tabId);
    }
  };

  showContextMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      {
        label: t('tabs.rename'),
        shortcut: 'Double-click',
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
        onClick: () => startRenameTab(id)
      },
      { separator: true },
      {
        label: t('tabs.close'),
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        onClick: () => closeTab(id)
      },
      {
        label: t('tabs.closeOthers'),
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        disabled: allTabs.length <= 1,
        onClick: () => {
          allTabs.forEach(tab => {
            const tabId = tab.dataset.id;
            if (tabId !== id) closeTab(tabId);
          });
        }
      },
      {
        label: t('tabs.closeToRight'),
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        disabled: tabsToRight.length === 0,
        onClick: () => {
          tabsToRight.forEach(tab => closeTab(tab.dataset.id));
        }
      }
    ]
  });
}
```

**Step 3: Wire the context menu to all 6 tab creation sites.**

At each of the 6 locations where `tab.querySelector('.tab-close').onclick` is set, add a `contextmenu` listener on the tab element. Add the line BEFORE the existing `tab.querySelector('.tab-close').onclick` line at each site:

**Site 1 — line ~1689** (createTerminal, standard terminal):
Add before line 1689:
```javascript
tab.oncontextmenu = (e) => showTabContextMenu(e, id);
```

**Site 2 — line ~1926** (createTypeConsole):
Add before line 1927. NOTE: type console tabs use `closeTypeConsole(id, projectIndex, typeId)` not `closeTerminal(id)`. However, per CONTEXT.md, `closeTerminal` handles type consoles at line 1340 by delegating to `closeTypeConsole`. So using `closeTerminal(id)` in the context menu is correct and consistent.
```javascript
tab.oncontextmenu = (e) => showTabContextMenu(e, id);
```

**Site 3 — line ~3134** (resumeSession terminal tab):
Add before line 3134:
```javascript
tab.oncontextmenu = (e) => showTabContextMenu(e, id);
```

**Site 4 — line ~3305** (resumeSession chat mode tab):
Add before line 3305:
```javascript
tab.oncontextmenu = (e) => showTabContextMenu(e, id);
```

**Site 5 — line ~3813** (openFileTab):
Add before line 3813:
```javascript
tab.oncontextmenu = (e) => showTabContextMenu(e, id);
```

**Site 6 — line ~4023** (restoreFileTab):
Add before line 4023:
```javascript
tab.oncontextmenu = (e) => showTabContextMenu(e, id);
```

IMPORTANT: Line numbers are approximate — match by the surrounding code pattern (`tab.querySelector('.tab-name').ondblclick` and `tab.querySelector('.tab-close').onclick`). Each site has the same 3-line pattern:
```javascript
tab.querySelector('.tab-name').ondblclick = (e) => { e.stopPropagation(); startRenameTab(id); };
tab.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); closeTerminal(id); };
tab.onauxclick = (e) => { if (e.button === 1) { ... closeTerminal(id); } };
```
Add the `tab.oncontextmenu` line right before or after this block at each site.
  </action>
  <verify>
    <automated>grep -c "showTabContextMenu" src/renderer/ui/components/TerminalManager.js</automated>
    <!-- Expected: 7+ (1 function definition + 6 call sites) -->
    <automated>grep "closeFileTab" src/renderer/ui/components/TerminalManager.js</automated>
    <!-- Expected: closeFileTab used inside showTabContextMenu for file-type tabs -->
  </verify>
  <done>
    - `showTabContextMenu` function exists and uses `showContextMenu` from ContextMenu.js
    - All 6 tab creation sites have `tab.oncontextmenu` wired to `showTabContextMenu`
    - Close logic uses `closeFileTab(id)` for file tabs and `closeTerminal(id)` for all other tab types (per CONTEXT.md)
    - Close Others iterates all tabs and closes all except the right-clicked one
    - Close Tabs to Right uses DOM ordering to find subsequent siblings
    - Both bulk-close items are disabled when there are no tabs to close
    - `closeFileTab` is confirmed in scope (declared in TerminalManager.js or imported)
    - `npm run build:renderer` succeeds
    - `npm test` passes
  </done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` — must succeed (no import errors, no syntax errors)
2. `npm test` — all existing tests pass
3. `grep -c "showTabContextMenu" src/renderer/ui/components/TerminalManager.js` — returns 7+ (1 definition + 6 call sites)
4. `grep -c "closeOthers" src/renderer/i18n/locales/en.json` — returns 1
5. `grep -c "closeOthers" src/renderer/i18n/locales/fr.json` — returns 1
6. `grep "require.*ContextMenu" src/renderer/ui/components/TerminalManager.js` — returns the new import line
7. `grep "closeFileTab" src/renderer/ui/components/TerminalManager.js` — confirms file-tab close logic is present
</verification>

<success_criteria>
- Right-click on any tab shows a 4-item context menu (Rename, Close, Close Others, Close Tabs to Right)
- Rename triggers the existing inline rename flow
- Close closes the individual tab (using closeFileTab for file tabs, closeTerminal for others)
- Close Others and Close Tabs to Right perform bulk-close using DOM ordering with type-aware close logic
- Disabled states apply correctly (Close Others disabled with 1 tab, Close to Right disabled on last tab)
- All i18n keys present in both en.json and fr.json
- Build and tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/v1.1/27-Rename-Tabs-Manually/27-SUMMARY.md`
</output>
