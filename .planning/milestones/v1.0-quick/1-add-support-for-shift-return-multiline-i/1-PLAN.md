---
phase: quick-shift-enter-multiline
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/ui/components/ChatView.js
  - styles/chat.css
autonomous: true
requirements: [MULTILINE-01]
must_haves:
  truths:
    - "Shift+Enter in terminal inserts a newline instead of submitting the command"
    - "Shift+Enter in chat textarea inserts a newline and the textarea expands"
    - "Enter alone still sends/submits in both terminal and chat"
    - "Visual hint tells user Shift+Enter is available for multiline"
  artifacts:
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "Shift+Enter interception in terminal key handler"
      contains: "shiftKey"
    - path: "src/renderer/ui/components/ChatView.js"
      provides: "Shift+Enter hint in chat input footer"
      contains: "Shift"
    - path: "styles/chat.css"
      provides: "Styling for keyboard hint in chat footer"
      contains: "chat-keyboard-hint"
  key_links:
    - from: "src/renderer/ui/components/TerminalManager.js"
      to: "node-pty via IPC"
      via: "api.terminal.input with newline character"
      pattern: "shiftKey.*Enter"
---

<objective>
Add Shift+Enter multiline support to both the terminal (xterm.js) and the chat input textarea, with a visual hint showing the shortcut.

Purpose: Users need to compose multiline input in Claude CLI terminals (Shift+Enter for newline vs Enter to submit) and in the chat UI. The chat already partially supports this (Enter sends, Shift+Enter falls through to default textarea behavior) but the terminal does not distinguish Shift+Enter from Enter — both send `\r`. Additionally, there is no visual hint telling users about this shortcut.

Output: Updated TerminalManager.js with Shift+Enter interception, updated ChatView.js with keyboard hint, updated chat.css with hint styling.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/renderer/ui/components/TerminalManager.js (terminal key handling — createTerminalKeyHandler at ~line 560, onData at ~line 1348)
@src/renderer/ui/components/ChatView.js (chat input keydown at ~line 467, Enter handling at ~line 533, input footer at ~line 179)
@styles/chat.css (chat-input-area and chat-input-footer styling at ~line 2367+)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Intercept Shift+Enter in terminal to send newline</name>
  <files>src/renderer/ui/components/TerminalManager.js</files>
  <action>
In the `createTerminalKeyHandler` function (around line 560), add a Shift+Enter interception BEFORE the existing shortcut checks. When Shift+Enter is pressed on keydown:

1. Check `e.shiftKey && e.key === 'Enter' && e.type === 'keydown'`
2. Send `\n` (newline/linefeed) to the PTY via the appropriate input channel:
   - For `terminal-input`: `api.terminal.input({ id: terminalId, data: '\n' })`
   - For `fivem-input`: `api.fivem.input({ projectIndex: terminalId, data: '\n' })`
   - For `webapp-input`: `api.webapp.input({ projectIndex: terminalId, data: '\n' })`
3. Return `false` to prevent xterm.js from also sending `\r`

Place this check early in the handler, right after the opening `return (e) => {` line and before the Ctrl+Arrow checks. The check should be:

```javascript
// Shift+Enter — send newline for multiline input (e.g., Claude CLI)
if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter' && e.type === 'keydown') {
  if (inputChannel === 'fivem-input') {
    api.fivem.input({ projectIndex: terminalId, data: '\n' });
  } else if (inputChannel === 'webapp-input') {
    api.webapp.input({ projectIndex: terminalId, data: '\n' });
  } else {
    api.terminal.input({ id: terminalId, data: '\n' });
  }
  return false;
}
```

This ensures Claude CLI (and any other PTY program) receives a newline character instead of a carriage return, which is the standard way terminals distinguish "new line" from "submit".
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && grep -n "shiftKey.*Enter" src/renderer/ui/components/TerminalManager.js | head -5</automated>
    <manual>Open app, start a Claude CLI terminal, type a line, press Shift+Enter — cursor should move to new line without submitting. Press Enter alone — should submit.</manual>
  </verify>
  <done>Shift+Enter in terminal sends `\n` to PTY; Enter alone still sends `\r` (default xterm behavior). The handler covers all three input channels (terminal, fivem, webapp).</done>
</task>

<task type="auto">
  <name>Task 2: Add Shift+Enter keyboard hint to chat input and ensure auto-resize</name>
  <files>src/renderer/ui/components/ChatView.js, styles/chat.css</files>
  <action>
**ChatView.js changes:**

1. In the chat input footer (around line 179), add a keyboard hint to the `.chat-footer-right` div. Insert a small hint element BEFORE the effort selector:

```html
<span class="chat-keyboard-hint"><kbd>Shift</kbd>+<kbd>Enter</kbd> ${escapeHtml(t('chat.newLine') || 'for new line')}</span>
```

This goes inside the `.chat-footer-right` div, before the `.chat-effort-selector` div.

2. Add i18n key usage: Use `t('chat.newLine')` with fallback `'for new line'`. Do NOT add to locale files (they can be updated separately) — the fallback string is sufficient.

**chat.css changes:**

Add styling for the keyboard hint after the `.chat-input-footer` styles (around line 2705):

```css
.chat-keyboard-hint {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: var(--font-2xs);
  color: var(--text-muted);
  white-space: nowrap;
  margin-right: 8px;
}

.chat-keyboard-hint kbd {
  display: inline-block;
  padding: 1px 4px;
  font-size: var(--font-2xs);
  font-family: inherit;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  color: var(--text-secondary);
  line-height: 1.4;
}
```

The hint should be subtle (muted text, small font) so it does not distract but is discoverable. The existing Shift+Enter behavior in the chat textarea (line 533: `e.key === 'Enter' && !e.shiftKey` sends, otherwise falls through to native textarea newline) already works correctly — no JS changes needed for the chat input keydown logic.
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && grep -n "chat-keyboard-hint" src/renderer/ui/components/ChatView.js styles/chat.css | head -5</automated>
    <manual>Open app, navigate to chat tab — small "Shift+Enter for new line" hint should appear in the input footer area. Shift+Enter in chat textarea should insert a newline and expand the textarea.</manual>
  </verify>
  <done>Chat input footer shows a subtle "Shift+Enter for new line" keyboard hint. Chat textarea continues to support multiline via Shift+Enter with auto-resize. Hint uses CSS variables for consistent theming.</done>
</task>

</tasks>

<verification>
1. `grep -n "shiftKey.*Enter" src/renderer/ui/components/TerminalManager.js` — shows the new Shift+Enter interception
2. `grep -n "chat-keyboard-hint" src/renderer/ui/components/ChatView.js styles/chat.css` — shows hint in HTML and CSS
3. `npm run build:renderer` — builds successfully with no errors
4. `npm test` — all existing tests pass
</verification>

<success_criteria>
- Shift+Enter in terminal sends newline (`\n`) to PTY instead of carriage return
- Enter alone in terminal still submits (default xterm `\r` behavior)
- Shift+Enter in chat textarea inserts newline and auto-resizes (already works, verified)
- Visual hint "Shift+Enter for new line" appears in chat input footer
- Renderer builds successfully, all tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/1-add-support-for-shift-return-multiline-i/1-SUMMARY.md`
</output>
