---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/ui/components/TerminalManager.js
autonomous: true
requirements: [QUICK-4]

must_haves:
  truths:
    - "Middle-clicking (mouse button 1 / auxclick) on any terminal tab closes that tab"
    - "Middle-click on non-tab areas does nothing (no accidental closes)"
    - "Existing close button, click-to-activate, and double-click-to-rename still work unchanged"
  artifacts:
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "auxclick middle-click handler on all 6 tab creation sites"
      contains: "auxclick"
  key_links:
    - from: "tab auxclick handler"
      to: "closeTerminal / closeTypeConsole"
      via: "e.button === 1 check in auxclick listener"
      pattern: "auxclick.*button.*===.*1"
---

<objective>
Add mouse middle-click (button 1) on terminal tabs to close the tab.

Purpose: Standard UX pattern — browsers, IDEs, and terminal emulators all support middle-click to close tabs. Users expect this behavior.
Output: Updated TerminalManager.js with auxclick handlers on all 6 tab creation sites.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/renderer/ui/components/TerminalManager.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add middle-click close handlers to all terminal tab creation sites</name>
  <files>src/renderer/ui/components/TerminalManager.js</files>
  <action>
    Add an `auxclick` event listener to the `tab` element at each of the 6 tab event wiring sites in TerminalManager.js. The handler should:
    1. Check `e.button === 1` (middle mouse button)
    2. Call `e.preventDefault()` and `e.stopPropagation()`
    3. Call the appropriate close function for that tab type

    The 6 sites are at these lines (after existing `// Tab events` comments):
    - Line ~1436: Claude terminal tab — call `closeTerminal(id)`
    - Line ~1672: Type console tab — call `closeTypeConsole(id, projectIndex, typeId)`
    - Line ~2834: Standard terminal tab — call `closeTerminal(id)`
    - Line ~3004: Another standard terminal tab — call `closeTerminal(id)`
    - Line ~3147: Another standard terminal tab — call `closeTerminal(id)`
    - Line ~3342: Claude terminal (alternate) — call `closeTerminal(id)`

    Pattern to add after each existing `.tab-close` onclick line:
    ```javascript
    tab.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); closeTerminal(id); } };
    ```

    For the type console tab (line ~1674), use `closeTypeConsole(id, projectIndex, typeId)` instead of `closeTerminal(id)`.

    Do NOT modify the generic Tab.js component — this is specific to TerminalManager terminal tabs only.
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && node -e "const fs = require('fs'); const c = fs.readFileSync('src/renderer/ui/components/TerminalManager.js','utf8'); const m = c.match(/onauxclick/g); console.log('auxclick count:', m ? m.length : 0); process.exit(m && m.length === 6 ? 0 : 1);"</automated>
    <manual>Open the app, middle-click on a terminal tab, verify it closes</manual>
  </verify>
  <done>All 6 tab creation sites have auxclick handlers; middle-clicking any terminal tab closes it; existing click/dblclick/close-button behavior unchanged.</done>
</task>

</tasks>

<verification>
- grep for `onauxclick` in TerminalManager.js returns exactly 6 matches
- grep for `closeTerminal` call count unchanged except for 5 new auxclick sites
- grep for `closeTypeConsole` call count unchanged except for 1 new auxclick site
- `npm run build:renderer` succeeds without errors
</verification>

<success_criteria>
Middle-clicking (mouse button 1) on any terminal tab in the application closes that tab, matching standard browser/IDE tab behavior. All 6 tab creation functions in TerminalManager.js have the auxclick handler.
</success_criteria>

<output>
After completion, create `.planning/quick/4-feature-mouse-middleclick-tab-close/4-SUMMARY.md`
</output>
