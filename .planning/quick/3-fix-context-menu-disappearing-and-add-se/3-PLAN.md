---
phase: quick-3
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/ui/components/ContextMenu.js
autonomous: true
requirements: [QUICK-3]

must_haves:
  truths:
    - "Right-clicking a terminal shows the context menu and it stays visible"
    - "Clicking outside the context menu closes it"
    - "Right-clicking again while menu is open closes and reopens at new position"
    - "Escape key closes the context menu"
  artifacts:
    - path: "src/renderer/ui/components/ContextMenu.js"
      provides: "Context menu with deferred close-handler registration"
      contains: "setTimeout"
  key_links:
    - from: "src/renderer/ui/components/TerminalManager.js"
      to: "src/renderer/ui/components/ContextMenu.js"
      via: "showContextMenu() call on right-click"
      pattern: "showContextMenu"
---

<objective>
Fix the terminal context menu disappearing immediately after right-click.

Purpose: The context menu closes instantly because the document-level `contextmenu` close-handler fires on the same event that opened the menu (event bubbling). Deferring handler registration with `setTimeout(0)` ensures the opening event finishes propagating before close-handlers are active.

Output: A working context menu that stays visible on right-click in terminals.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/renderer/ui/components/ContextMenu.js
@src/renderer/ui/components/TerminalManager.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Defer close-handler registration to prevent immediate dismissal</name>
  <files>src/renderer/ui/components/ContextMenu.js</files>
  <action>
In `showContextMenu()` (around lines 92-95), wrap the three `document.addEventListener` calls in a `setTimeout(() => { ... }, 0)`. This defers registration until after the current right-click event has finished propagating through the DOM, preventing the `handleClickOutside` listener from catching the same `contextmenu` event that triggered the menu.

Before (lines 92-95):
```js
document.addEventListener('click', handleClickOutside);
document.addEventListener('contextmenu', handleClickOutside);
document.addEventListener('keydown', handleEscape);
```

After:
```js
setTimeout(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('contextmenu', handleClickOutside);
  document.addEventListener('keydown', handleEscape);
}, 0);
```

No other changes needed. The `hideContextMenu()` function already removes these same listeners, so cleanup remains correct.
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && grep -n "setTimeout" src/renderer/ui/components/ContextMenu.js | grep -v "removeChild" | head -5</automated>
    <manual>Run `npm start`, right-click a terminal, confirm context menu appears and stays visible.</manual>
  </verify>
  <done>The three document.addEventListener calls in showContextMenu are wrapped in setTimeout(0). The context menu no longer disappears immediately on right-click.</done>
</task>

</tasks>

<verification>
- `grep -c "setTimeout" src/renderer/ui/components/ContextMenu.js` returns 2 (existing one for removeChild + new one for addEventListener)
- `npm run build:renderer` completes without errors
- Manual: right-click terminal shows persistent context menu; click outside closes it; Escape closes it
</verification>

<success_criteria>
- Context menu appears and remains visible on terminal right-click
- All three close methods work: click outside, right-click outside, Escape key
- No regressions in existing context menu usage (project list right-click, etc.)
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-context-menu-disappearing-and-add-se/3-SUMMARY.md`
</output>
