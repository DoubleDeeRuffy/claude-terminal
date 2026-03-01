# Phase 28: Paste-Doubles-Linebreaks — Plan

## Plan 28A: Fix doubled linebreaks on paste and Enter key normalization

**Goal:** Eliminate doubled linebreaks when pasting multi-line text into the terminal, and fix Enter key to send `\r` instead of `\n` for the terminal-input channel.

**Scope:** 2 changes in 1 file. Pure bug fix, no new features.

---

### Task 1: Normalize line endings in performPaste() (TerminalManager.js)

**Problem:** Windows clipboard stores line endings as `\r\n`. When pasted raw into node-pty, both `\r` and `\n` are interpreted as separate line separators, producing doubled linebreaks.

**Fix:**
- `src/renderer/ui/components/TerminalManager.js:497` — Inside `sendPaste()`, normalize clipboard text before dispatching to IPC
- Two-step normalization: `\r\n` → `\r`, then lone `\n` → `\r`
- Apply to ALL channels (terminal, fivem, webapp) since paste normalization is universal

```javascript
// Before (line 497-506):
  const sendPaste = (text) => {
    if (!text) return;
    if (inputChannel === 'fivem-input') {

// After:
  const sendPaste = (text) => {
    if (!text) return;
    // Normalize line endings: \r\n → \r, then lone \n → \r (terminal convention)
    text = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
    if (inputChannel === 'fivem-input') {
```

**Verification:** Paste multi-line text (e.g., from Notepad with `\r\n` endings) — each line should appear once, not doubled.

---

### Task 2: Fix Enter key to send \r for terminal-input channel (TerminalManager.js)

**Problem:** The Shift+Enter handler sends `\n` for all channels. For the terminal-input channel, the correct character is `\r` (terminal convention — Enter sends carriage return, the PTY translates). FiveM and WebApp channels stay as `\n` since they may handle it differently.

**Fix:**
- `src/renderer/ui/components/TerminalManager.js:714` — Change `data: '\n'` to `data: '\r'` for the terminal-input branch only

```javascript
// Before (line 713-714):
      } else {
        api.terminal.input({ id: terminalId, data: '\n' });

// After:
      } else {
        api.terminal.input({ id: terminalId, data: '\r' });
```

**Verification:** In a terminal, press Shift+Enter — should produce a newline, not a doubled or missing line.

---

### Execution Order

1. Task 1 (paste normalization) — primary fix
2. Task 2 (Enter key fix) — secondary fix in same file

Both tasks modify the same file but different functions. Can be done sequentially in one pass.

### Files Modified

| File | Tasks | Changes |
|------|-------|---------|
| `src/renderer/ui/components/TerminalManager.js` | 1, 2 | Add line-ending normalization in `sendPaste()`, fix `\n` → `\r` in terminal Enter handler |

### Verification Checklist

- [ ] Paste multi-line text from Windows Notepad — no doubled linebreaks
- [ ] Paste multi-line text from browser (may use `\n` only) — no doubled linebreaks
- [ ] Paste single-line text — unchanged behavior
- [ ] Shift+Enter in terminal — produces newline correctly
- [ ] Shift+Enter in FiveM/WebApp channels — still sends `\n` (no regression)
- [ ] Regular Enter key — unchanged behavior
- [ ] `npm test` passes
- [ ] `npm run build:renderer` succeeds
