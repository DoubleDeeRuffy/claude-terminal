# Phase 20: Bugfix-Swap-Projects-Selected-Tab - Research

**Researched:** 2026-02-26
**Domain:** Electron Renderer — Terminal/Tab State Management
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- When switching projects, the app always resets to the first tab instead of restoring the last-active tab
- This affects all tab types (terminal and chat) — fix both uniformly
- Remember which tab was active per project and restore it when switching back
- Also restore the scroll position for both terminal output and chat scroll
- Memory is within-session only — on app restart, use existing restore logic (Phase 04/06)
- Tab switch should be instant with no animation/transition
- If the remembered tab no longer exists (was closed), fall back to the first available tab
- Fresh projects with no terminals: keep existing behavior unchanged — only fix tab-selection for projects with existing tabs

### Claude's Discretion

- Where to store the per-project active-tab state (in-memory map, state module, etc.)
- How to capture and restore scroll positions efficiently
- Whether to debounce scroll position captures

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

The bug is in `filterByProject()` in `TerminalManager.js`. When switching between projects, the function always selects `firstVisibleId` (the first tab) unless the existing disk-based `activeTabIndex` restoration succeeds. That disk-based path is unreliable for **within-session** project switching because: (1) it requires `restoreTerminalSessions` setting to be enabled, (2) it reads stale disk data (saves are debounced 2s so rapid switching outpaces the save), and (3) it uses a fragile integer index that can drift if tabs close between saves.

The correct fix is a module-level `Map<projectId, terminalId>` in `TerminalManager.js` that captures the active terminal ID whenever a tab is clicked or set active for a given project, and uses that ID during `filterByProject()` restoration. This is an in-memory, within-session store — no disk I/O needed. The same Map already exists in `events/index.js` as `lastActiveClaudeTab`, but that one only tracks Claude (non-basic) terminal tabs. The fix must cover ALL tab types (basic terminal, Claude terminal, chat).

Scroll position restoration: for xterm.js terminal tabs, the scroll position is `terminal.buffer.active.viewportY` (readable at any time) and restored via `terminal.scrollLines(savedY - terminal.buffer.active.viewportY)`. For chat tabs, the DOM element's `messagesEl.scrollTop` is the source/target. The scroll capture should happen in `setActiveTerminal()` when leaving a tab, and restore in `setActiveTerminal()` when arriving on a tab.

**Primary recommendation:** Add a module-level `Map<projectId, terminalId>` in TerminalManager.js. Populate it in `setActiveTerminal()` after every tab switch. Use it in `filterByProject()` as the primary restoration source (before the disk-based `activeTabIndex` fallback). Add a parallel `Map<terminalId, scrollPosition>` for scroll restoration captured at leave-time and applied at arrive-time.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xterm.js | ^6.0.0 | Terminal emulator — scroll API | Already installed |
| DOM APIs | browser-native | Chat scroll (`messagesEl.scrollTop`) | No dependency needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | — | No new packages needed | Pure JS fix |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory Map | Disk persistence | Disk = stale on rapid switch; Map = immediate, correct |
| In-memory Map | State module (terminalsState/projectsState) | State module adds observable overhead; Map is simpler for ephemeral within-session data |
| Per-tab scroll capture | Global scroll watcher | Global watcher adds overhead; capture-on-leave is minimal and precise |

## Architecture Patterns

### Current Code Flow (causing the bug)

```
User clicks Project A
  → ProjectList.js: setSelectedProjectFilter(projectIndex) + onFilterTerminals(idx)
  → renderer.js: TerminalManager.filterByProject(idx)
  → filterByProject():
      1. Show/hide tabs and wrappers by project
      2. Check if current activeTerminal tab is visible
      3. If not visible → try disk-based activeTabIndex restore
      4. FALLBACK: setActiveTerminal(firstVisibleId)   ← always tab #1 when disk restore fails
```

### Why Disk-Based Restore Fails for Within-Session Switching

- `loadSessionData()` returns `null` when `restoreTerminalSessions` setting is disabled
- Even when enabled, saves are debounced 2s — rapid project switching outpaces saves
- `activeTabIndex` is an integer position in Map iteration order (fragile when tabs are added/closed mid-session)
- `activeTabIndex` in disk data is only updated for the project that **owns the globally active terminal** at save time — other projects keep their last-saved value from app start

### Recommended Fix Pattern

**Module-level Maps in TerminalManager.js:**

```javascript
// Track last-active terminal ID per project (in-memory, within-session)
// Key: projectId (string), Value: terminalId (number/string)
const lastActivePerProject = new Map();

// Track scroll position per terminal at leave-time
// Key: terminalId, Value: { viewportY?: number, scrollTop?: number }
const savedScrollPositions = new Map();
```

**Capture in `setActiveTerminal(id)`:**

```javascript
function setActiveTerminal(id) {
  const prevActiveId = getActiveTerminal();

  // Capture scroll position of the outgoing terminal
  if (prevActiveId && prevActiveId !== id) {
    const prevTd = getTerminal(prevActiveId);
    if (prevTd) {
      if (prevTd.mode === 'chat' && prevTd.chatView) {
        const messagesEl = prevTd.chatView.getMessagesEl(); // see note below
        savedScrollPositions.set(prevActiveId, { scrollTop: messagesEl?.scrollTop ?? 0 });
      } else if (prevTd.terminal) {
        savedScrollPositions.set(prevActiveId, { viewportY: prevTd.terminal.buffer.active.viewportY });
      }
    }
  }

  // ... existing blur/focus logic ...

  // Record this terminal as last-active for its project
  const td = getTerminal(id);
  if (td?.project?.id) {
    lastActivePerProject.set(td.project.id, id);
  }

  // ... setActiveTerminalState, DOM updates ...

  // Restore scroll position of the incoming terminal
  if (td) {
    const saved = savedScrollPositions.get(id);
    if (saved !== undefined) {
      if (td.mode === 'chat' && td.chatView) {
        // Defer until wrapper is visible (requestAnimationFrame)
        requestAnimationFrame(() => {
          const messagesEl = td.chatView.getMessagesEl();
          if (messagesEl) messagesEl.scrollTop = saved.scrollTop ?? messagesEl.scrollHeight;
        });
      } else if (td.terminal && saved.viewportY !== undefined) {
        requestAnimationFrame(() => {
          const delta = saved.viewportY - td.terminal.buffer.active.viewportY;
          if (delta !== 0) td.terminal.scrollLines(delta);
        });
      }
    }
  }
}
```

**Restore in `filterByProject()`:**

Replace the disk-based `activeTabIndex` block with:

```javascript
// Try in-memory per-project last-active tab first
const project = projects[projectIndex];
if (project) {
  const savedId = lastActivePerProject.get(project.id);
  if (savedId && getTerminal(savedId)) {
    const savedTab = document.querySelector(`.terminal-tab[data-id="${savedId}"]`);
    if (savedTab && savedTab.style.display !== 'none') {
      targetId = savedId;
    }
  }
  // Disk-based fallback (activeTabIndex) remains as secondary fallback
  if (!targetId || targetId === firstVisibleId) {
    // ... existing disk restore code ...
  }
}
```

### ChatView `getMessagesEl()` Note

`ChatView.js` creates `messagesEl` as a local variable inside `createChatView()`. The `chatView` object stored on `termData.chatView` exposes a `.focus()` method (line ~1200 in TerminalManager). Check what other methods are already exported from `createChatView()` before adding a new `getMessagesEl()` accessor. Alternative: query by selector from the wrapper DOM element:

```javascript
const wrapper = document.querySelector(`.terminal-wrapper[data-id="${prevActiveId}"]`);
const messagesEl = wrapper?.querySelector('.chat-messages');
```

This avoids needing to add a new API to ChatView — use the DOM query approach.

### Map Cleanup (Tab Close)

When `closeTerminal(id)` is called, clean up both maps:

```javascript
savedScrollPositions.delete(id);
// Do NOT delete lastActivePerProject — the terminal may be closed but
// the project's OTHER tabs remain; filterByProject's fallback handles missing IDs.
// However, if the closed terminal IS the stored last-active, the guard
// `getTerminal(savedId)` in filterByProject will return null → falls back to firstVisibleId.
```

### Anti-Patterns to Avoid

- **Persisting to disk for within-session state:** The decision is in-memory only. Do not extend `terminal-sessions.json` for this.
- **Debouncing the Map writes:** The Map writes are O(1) and happen on every tab click — no debounce needed.
- **Using `activeTabIndex` (integer) for in-memory lookup:** Integer indices drift when tabs are added/closed. Terminal ID (stable string/number) is correct.
- **Removing the existing disk-based `activeTabIndex` restore:** Keep it as a secondary fallback for the app-restart case (though that path is covered by Phase 04/06, the existing code is harmless).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll position | Custom scroll tracking service | Direct xterm `buffer.active.viewportY` + DOM `scrollTop` | Already exposed by xterm API and DOM |
| Tab memory | New state module | Module-level `Map` in TerminalManager | No reactivity needed; ephemeral within-session data |

## Common Pitfalls

### Pitfall 1: Restoring Scroll Before DOM Is Visible

**What goes wrong:** Terminal wrapper has `display: none` when `setActiveTerminal` runs the `classList.toggle('active', ...)` pass. Setting `scrollTop` or `scrollLines` on a hidden element may have no effect (especially xterm's WebGL viewport).

**Why it happens:** The tab activation and DOM visibility update happen synchronously in `setActiveTerminal`, then `fitAddon.fit()` runs. The scroll restore must happen after visibility is established.

**How to avoid:** Wrap scroll restore in `requestAnimationFrame(() => { ... })` — one frame after the DOM is updated and the terminal is visible.

**Warning signs:** Scroll position always lands at top or bottom regardless of saved value.

### Pitfall 2: Missing `getTerminal(savedId)` Guard

**What goes wrong:** `lastActivePerProject` holds a terminal ID for a project, but that terminal has since been closed. `filterByProject` tries to activate a non-existent terminal.

**Why it happens:** Closing a terminal removes it from `terminalsState` but the Map retains the stale ID.

**How to avoid:** Always guard with `getTerminal(savedId)` before using the saved ID. If it returns null/undefined, fall through to `firstVisibleId`.

**Warning signs:** Tab strip shows no active tab highlighted after switching projects.

### Pitfall 3: Chat scroll `messagesEl` Not Exposed

**What goes wrong:** `chatView` object stored in `termData.chatView` doesn't expose `getMessagesEl()`, so the scroll capture code throws.

**Why it happens:** ChatView exports `{ focus, ... }` but not the DOM element reference.

**How to avoid:** Use DOM query: `document.querySelector(`.terminal-wrapper[data-id="${id}"]`)?.querySelector('.chat-messages')` — this works without modifying ChatView's API.

**Warning signs:** `TypeError: termData.chatView.getMessagesEl is not a function`.

### Pitfall 4: xterm `scrollLines` Relative Not Absolute

**What goes wrong:** `terminal.scrollLines(savedY)` is called with the saved `viewportY` value directly, but `scrollLines` takes a **delta** (relative amount), not an absolute position.

**Why it happens:** API name is misleading — `scrollLines(n)` scrolls by `n` lines, not to line `n`.

**How to avoid:** Compute delta: `const delta = savedY - terminal.buffer.active.viewportY; if (delta !== 0) terminal.scrollLines(delta);`

**Warning signs:** Terminal scroll lands at wrong position, especially inconsistent depending on current scroll when switching.

### Pitfall 5: Race Between `setActiveTerminal` and `filterByProject`

**What goes wrong:** In `filterByProject`, `setActiveTerminal(targetId)` is called, which writes to `lastActivePerProject`. If `filterByProject` is called again immediately (e.g., on rapid project switching), the Map entry now points to the restored terminal, not the actual last-active one from the *previous* visit to that project.

**Why it happens:** `setActiveTerminal` unconditionally updates `lastActivePerProject` for any terminal.

**How to avoid:** Only update `lastActivePerProject` when the user **explicitly activates** a tab (via click, keyboard shortcut), not when `filterByProject` auto-selects a tab during a project switch. One approach: add a `_isRestoringTab` flag that suppresses the Map write in `setActiveTerminal` when called from `filterByProject`.

Simpler approach: update `lastActivePerProject` in the tab `onclick` handler and in `setActiveTerminal` only when called outside a project-switch context. Or, do the Map write in `filterByProject` **only after restoration is complete** and skip the write in `setActiveTerminal` when the terminal's project matches the just-switched-to project.

**Simplest correct approach:** Update the Map in `setActiveTerminal` unconditionally — the Map value for Project A will always be the last terminal that was `setActive` for Project A's terminals, whether by user click or by `filterByProject` restore. Since `filterByProject` restores the **correct** saved value (from the previous explicit user action on Project A), the Map ends up with the right value either way.

## Code Examples

### xterm.js Scroll Position Read/Write

```javascript
// Read current scroll position (absolute line from top of scrollback buffer)
const viewportY = terminal.buffer.active.viewportY;

// Scroll to saved position (scrollLines takes a relative delta)
const delta = savedViewportY - terminal.buffer.active.viewportY;
if (delta !== 0) {
  terminal.scrollLines(delta);
}

// xterm.d.ts signatures:
// scrollLines(amount: number): void;  — scroll by N lines
// buffer.active.viewportY: number;    — current top line of viewport
```

### Chat DOM Scroll

```javascript
// Capture (via DOM query, no ChatView API change needed):
const wrapper = document.querySelector(`.terminal-wrapper[data-id="${id}"]`);
const messagesEl = wrapper?.querySelector('.chat-messages');
const scrollTop = messagesEl?.scrollTop ?? 0;

// Restore (deferred one frame so wrapper is visible):
requestAnimationFrame(() => {
  const wrapper = document.querySelector(`.terminal-wrapper[data-id="${id}"]`);
  const messagesEl = wrapper?.querySelector('.chat-messages');
  if (messagesEl) messagesEl.scrollTop = savedScrollTop;
});
```

### In-Memory Map Pattern (matches existing codebase pattern)

```javascript
// From events/index.js (Phase 6.1) — identical pattern already exists for Claude tabs:
const lastActiveClaudeTab = new Map(); // projectId -> terminalId

// Phase 20 equivalent for ALL tab types — lives in TerminalManager.js:
const lastActivePerProject = new Map(); // projectId -> terminalId (all types)
const savedScrollPositions = new Map(); // terminalId -> { viewportY?, scrollTop? }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Disk `activeTabIndex` only | In-memory Map + disk fallback | Phase 20 | Reliable within-session; disk fallback kept for app-restart |

## Open Questions

1. **Should `lastActivePerProject` also be exported for use by `events/index.js`?**
   - What we know: `events/index.js` has its own `lastActiveClaudeTab` Map for Claude tabs. They serve overlapping purposes.
   - What's unclear: Whether to consolidate into one Map or keep them separate.
   - Recommendation: Keep them separate. `lastActiveClaudeTab` in events is scoped to Claude tabs (used for session-ID capture and tab renaming). `lastActivePerProject` in TerminalManager is scoped to ALL tabs (used for UI focus restoration). Different concerns, different owners.

2. **Should scroll position be captured on every `setActiveTerminal` call, or only when leaving a project?**
   - What we know: Scroll capture on every tab switch within a project is harmless and keeps the state current.
   - What's unclear: Performance impact on very frequent tab switches.
   - Recommendation: Capture on every `setActiveTerminal` call. It's O(1) Map write — negligible cost.

## Sources

### Primary (HIGH confidence)
- `src/renderer/ui/components/TerminalManager.js` — Direct code inspection of `filterByProject()` (lines 2111-2239), `setActiveTerminal()` (lines 1173-1221), tab creation patterns
- `src/renderer/services/TerminalSessionService.js` — Direct code inspection of `saveTerminalSessionsImmediate()` (lines 68-154), `loadSessionData()` (lines 34-53), confirms disk-based `activeTabIndex` is keyed to global active terminal only
- `src/renderer/events/index.js` — `lastActiveClaudeTab` Map pattern (lines 27, 304) — confirms identical Map pattern already used in codebase
- `src/renderer/ui/components/ProjectList.js` — Project click handlers (lines 759-771) — confirms `onFilterTerminals` callback path
- `renderer.js` — `projectsState.subscribe` (line 329) and `onFilterTerminals` wiring (line 1409)
- `node_modules/@xterm/xterm/typings/xterm.d.ts` — `scrollLines(amount: number)`, `buffer.active.viewportY: number` — confirmed API signatures

## Metadata

**Confidence breakdown:**
- Bug root cause: HIGH — traced through actual code; the `!activeTab || activeTab.style.display === 'none'` condition + disk fallback dependency is the clear cause
- Fix approach (in-memory Map): HIGH — identical pattern already in codebase (`lastActiveClaudeTab`); no new libraries needed
- Scroll restoration API: HIGH — xterm `buffer.active.viewportY` + `scrollLines` confirmed in type definitions; DOM `scrollTop` is standard
- Pitfalls: HIGH — all identified from direct code inspection, not speculation

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable codebase, no fast-moving dependencies)
