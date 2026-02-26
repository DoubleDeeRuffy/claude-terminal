---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/ui/components/TerminalManager.js
autonomous: true
requirements: [QUICK-2]

must_haves:
  truths:
    - "Pressing Ctrl+Backspace in any terminal deletes the previous word"
    - "Regular Backspace still deletes a single character"
    - "Ctrl+Backspace works in both PowerShell and Claude CLI terminals"
  artifacts:
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "Ctrl+Backspace word-delete handler in createTerminalKeyHandler"
      contains: "Backspace"
  key_links:
    - from: "src/renderer/ui/components/TerminalManager.js"
      to: "api.terminal.input"
      via: "Ctrl+Backspace sends \\x17 to PTY"
      pattern: "Backspace.*\\\\x17"
---

<objective>
Add Ctrl+Backspace (STRG+Backspace) support to delete a whole word in terminal input.

Purpose: Standard keyboard shortcut expected by users — Ctrl+Backspace deletes the previous word in any shell/CLI.
Output: Updated TerminalManager.js with Ctrl+Backspace handler sending word-delete to PTY.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/renderer/ui/components/TerminalManager.js (lines 560-710 — createTerminalKeyHandler function)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Ctrl+Backspace word-delete to terminal key handler</name>
  <files>src/renderer/ui/components/TerminalManager.js</files>
  <action>
In the `createTerminalKeyHandler` function (~line 560), add a Ctrl+Backspace handler inside the existing `if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.repeat && e.type === 'keydown')` block (around line 578).

Add this BEFORE the Ctrl+C handler (~line 599), after the arrow key block (~line 595):

```javascript
// Ctrl+Backspace — delete previous word (TERM-05)
// Send ASCII ETB (0x17 = Ctrl+W) which is the standard word-rubout signal
// recognized by readline, PowerShell PSReadLine, and most shell line editors.
if (e.key === 'Backspace') {
  if (inputChannel === 'terminal-input') {
    api.terminal.input({ id: terminalId, data: '\x17' });
    return false;
  }
  return true; // FiveM/WebApp — fall through to default behavior
}
```

Follow the exact same pattern as the Ctrl+Left/Right word-jump handler (lines 632-647):
- Only intercept for `terminal-input` channel (real PTY terminals)
- Let FiveM/WebApp consoles fall through with `return true`
- Use `\x17` (ASCII ETB / Ctrl+W) which is the universal word-delete-backward signal

The escape sequence `\x17` is correct because:
- bash/zsh readline: `unix-word-rubout` bound to Ctrl+W by default
- PowerShell PSReadLine: `BackwardDeleteWord` responds to Ctrl+W
- Most terminal emulators map Ctrl+Backspace to this same sequence
  </action>
  <verify>
    <automated>cd /c/Users/uhgde/source/repos/claude-terminal && node -e "const fs = require('fs'); const src = fs.readFileSync('src/renderer/ui/components/TerminalManager.js', 'utf8'); const hasBackspace = src.includes('Backspace') && src.includes('\\\\x17'); console.log('Ctrl+Backspace handler:', hasBackspace ? 'FOUND' : 'MISSING'); if (!hasBackspace) process.exit(1);"</automated>
    <manual>Run the app (npm start), open a terminal, type a multi-word command, press Ctrl+Backspace — the last word should be deleted</manual>
  </verify>
  <done>Ctrl+Backspace in any PTY terminal sends \x17 to the shell, deleting the previous word. Regular Backspace unchanged. FiveM/WebApp consoles unaffected.</done>
</task>

</tasks>

<verification>
- grep TerminalManager.js for `Backspace` and `\x17` — handler exists
- npm run build:renderer succeeds without errors
- Manual test: type "hello world test" then Ctrl+Backspace deletes "test", another Ctrl+Backspace deletes "world"
</verification>

<success_criteria>
Ctrl+Backspace deletes the previous word in terminal input, matching standard desktop behavior.
</success_criteria>

<output>
After completion, create `.planning/quick/2-add-support-for-strg-backspace-to-delete/2-SUMMARY.md`
</output>
