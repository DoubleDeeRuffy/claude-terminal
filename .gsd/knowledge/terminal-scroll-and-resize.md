# Terminal Scroll & Resize Gotchas

## The Original Bug

When the user scrolls up in a terminal to read older output while Claude is streaming, the viewport jumps — sometimes to the very top of the scrollback buffer. The user cannot read older output until Claude finishes.

## Investigation Session (2026-03-29)

Multiple approaches were tried. None fully solved the problem. This document records all findings so the next attempt can start from upstream/main with full context.

---

## Approach 1: Remove CSS `overflow-y: auto` override — DID NOT FIX

**Theory:** `styles/terminal.css` line ~1232 had:
```css
.terminal-wrapper .xterm-viewport {
  overflow-y: auto !important;
}
```
This overrides xterm.js's own `overflow-y: scroll` (in `styles/xterm.css` line 96). With `auto`, the scrollbar toggles on/off as content changes, causing layout shifts that reset `scrollTop` to 0.

**Change:** Removed the rule, replaced with a comment.

**Result:** Did NOT fix the scroll jump. The bug persisted identically. Removing this rule is still a good idea (it was wrong to override xterm internals), but it was not the root cause.

---

## Approach 2: Guard `terminal.clear()` with alternate buffer check — UNCERTAIN

**Theory:** Claude CLI's TUI uses `\x1b[2J` (erase display) for redraws inside the alternate screen buffer. The data handler detected these sequences and called `terminal.clear()` unconditionally, which wipes the main buffer's scrollback.

**Change:**
```javascript
if (terminal.buffer.active.type === 'normal' &&
    (data.data.includes('\x1b[2J') || data.data.includes('\x1b[3J') || data.data.includes('\x1bc'))) {
  terminal.clear();
}
```

**Result:** This is logically correct — `terminal.clear()` should not fire during alternate buffer TUI redraws. But it alone did not fix the scroll jump. May prevent an occasional scrollback wipe but is not the primary cause. Worth keeping.

---

## Approach 3: `writePreservingScroll()` wrapper — PARTIALLY WORKS, REMAINING ISSUES

**Theory:** `terminal.write(data)` resets the viewport. Save distance-from-bottom before write, restore after.

**Change:**
```javascript
function writePreservingScroll(terminal, data) {
  const buf = terminal.buffer.active;
  const wasScrolledUp = buf.viewportY < buf.baseY;
  const savedOffset = buf.baseY - buf.viewportY;
  terminal.write(data);
  if (wasScrolledUp) {
    const newTarget = terminal.buffer.active.baseY - savedOffset;
    const delta = newTarget - terminal.buffer.active.viewportY;
    if (delta !== 0) terminal.scrollLines(delta);
  }
}
```

Applied to ALL `terminal.write(data.data)` calls (4 locations) and `writeTypeConsole`.

**Result:** NOT fully verified. The user reported remaining issues with tab/project switching after this change was combined with other broken changes. The scroll-preservation logic itself may be sound, but it was never tested in isolation on a clean codebase.

**Remaining concerns:**
- Does `terminal.write()` process synchronously in xterm.js v6? If it's async/batched, reading `buffer.active.baseY` immediately after may return stale values.
- Does `scrollLines()` cause a visual flicker (jump down then back up)?
- Claude CLI switches between alternate and normal buffers. If the buffer type changes mid-write (within a batched data chunk), the saved offset from the old buffer is meaningless.

---

## Approach 4: `withScrollPreserved` around ResizeObserver `fit()` — BROKE EVERYTHING

**Theory:** `fitAddon.fit()` in ResizeObserver could also reset scroll. Wrap it.

**Change:** Same scroll-preservation wrapper around `fitAddon.fit()` + `api.terminal.resize()` inside all ResizeObserver callbacks.

**Result:** **CAUSED BLANK TERMINALS.** When `filterByProject` toggles `display: none` on wrappers:
1. ResizeObserver fires with 0x0 dimensions
2. `fitAddon.fit()` resizes xterm to near-zero cols/rows
3. xterm reflows the entire buffer to fit in ~0 columns
4. Buffer content is effectively destroyed
5. `scrollLines()` runs with stale offsets → further corruption

**Lesson: NEVER wrap fitAddon.fit() with scroll preservation.** Buffer geometry (cols/rows) changes during fit, making saved scroll offsets meaningless.

---

## Approach 5: Zero-size guard in ResizeObserver — FIXES BLANK TERMINALS, SCROLL ISSUE UNCLEAR

**Change:**
```javascript
const resizeObserver = new ResizeObserver(() => {
  if (!wrapper.offsetWidth || !wrapper.offsetHeight) return;
  fitAddon.fit();
  api.terminal.resize({ id, cols: terminal.cols, rows: terminal.rows });
});
```

**Result:** Fixes the blank-terminal-on-switch bug caused by Approach 4. But does NOT address the original scroll jump issue. This is a good defensive guard regardless — `fitAddon.fit()` should never run on a hidden (0x0) container.

---

## Approach 6: Adding wrapper class re-sync in filterByProject else-branch — BROKE EVERYTHING

**Theory:** When `filterByProject` skips `setActiveTerminal` (because the current active tab is already visible), the pane handling loop may have toggled `.active` to a wrong intermediate wrapper.

**Change:** Added an else-branch at the end of `filterByProject` that re-applied `.active` class and `removeProperty('display')` on all wrappers in the pane to match the global active terminal.

**Result:** **MADE THINGS WORSE.** `removeProperty('display')` on all wrappers in the pane undid the filter's `display: none` on other-project wrappers. Terminals from wrong projects could briefly flash visible or steal the active state.

**Lesson: Never call `removeProperty('display')` on wrappers outside of `setActiveTerminal`.** The filter uses inline `display: none` to hide other-project wrappers; any code that removes those inline styles must be very careful about which wrappers it touches.

---

## What to try next (starting from upstream/main)

### High-confidence fixes (apply these regardless):
1. **Zero-size guard in ResizeObserver** — prevents `fitAddon.fit()` on hidden terminals
2. **Alternate buffer check on `terminal.clear()`** — prevents scrollback wipe during Claude TUI redraws
3. **Remove `overflow-y: auto !important`** from `.terminal-wrapper .xterm-viewport` in terminal.css

### For the scroll-jump-on-write issue, investigate:
1. **Is the problem actually in `terminal.write()`?** Add a `console.log` before/after write showing `viewportY` and `baseY`. If they don't change across write, the scroll jump happens elsewhere (ResizeObserver? `setActiveTerminal`?).
2. **Is the ResizeObserver firing during normal data writes?** The observer watches the wrapper element. If writing data somehow triggers a layout change on the wrapper (unlikely with xterm canvas rendering, but worth verifying), that would cause fit() → scroll reset.
3. **xterm.js `scrollOnUserInput` option** — xterm has options that control auto-scroll behavior. Check if `scrollOnUserInput: false` or similar helps.
4. **Try xterm.js `onScroll` event** — listen for scroll events and detect when the viewport is being reset unexpectedly. This would pinpoint the exact cause.
5. **WebGL context loss** — when a terminal is hidden, the WebGL context might be lost. The current `onContextLoss` handler disposes the addon but never recreates it. This could cause blank terminals (though the content should still be in the buffer). Consider re-loading WebGL addon when terminal becomes visible again.

### Architecture notes:
- There are **5 places** in TerminalManager.js that create ResizeObservers (createTerminal, createTypeConsole, resumeSession, createTerminalWithPrompt, switchTerminalMode). All must be kept in sync.
- There are **4 places** with `terminal.write(data.data)` in IPC data handlers (same 4 creation functions minus createTypeConsole which uses `writeTypeConsole()`).
- `setActiveTerminal` at line ~1612 calls `fitAddon.fit()` when switching tabs — this is the proper place for fit on show, so the ResizeObserver zero-size skip doesn't cause stale dimensions.
- `filterByProject` at lines ~2806-2809 calls `removeProperty('display')` on ALL wrappers in a pane when switching the pane's active tab. This is a dangerous pattern — it undoes the filter's inline `display: none` on other-project wrappers. CSS handles visibility correctly via `.active` class, but any interaction between this and other display manipulation code is fragile.
