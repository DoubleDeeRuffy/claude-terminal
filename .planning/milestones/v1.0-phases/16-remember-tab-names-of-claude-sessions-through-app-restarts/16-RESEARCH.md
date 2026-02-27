# Phase 16: Remember Tab-Names of Claude-Sessions through app-restarts - Research

**Researched:** 2026-02-26
**Domain:** Session persistence extension — tab name serialization
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Persist ALL tab names — whatever the tab currently shows at save time gets restored
- Includes: user renames, AI-generated haiku names, slash-command derived names, and default names ("Terminal 1")
- No re-generation of AI names on restore — saved name is used as-is, avoiding unnecessary API calls
- Restored tabs look identical to before restart — no visual indicator that a name was restored
- Restored tabs behave normally — new slash commands, user renames, and AI naming all work as usual on restored tabs
- Tab name persists through /clear (consistent with Phase 10 decision)
- Save tab names on every name change (immediate persistence), not just at shutdown — crash-resilient
- Use existing debounced save mechanism pattern (saveTerminalSessionsImmediate or similar)
- Integration with existing TerminalSessionService save/restore flow

### Claude's Discretion

- Storage format details (how tab names are stored in session data)
- Integration with existing TerminalSessionService save/restore flow
- Exact hook point for capturing name changes

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 16 extends the existing terminal session persistence system (built in Phases 4 and 6) to also save and restore tab names. The infrastructure is almost entirely in place — the `name` field already lives in every terminal's in-memory data object (`terminalsState`), and the `saveTerminalSessionsImmediate()` function already iterates all terminals and writes a `tab` object per terminal. There are exactly two gaps: (1) the `name` field is not included in that serialized `tab` object, and (2) the restore loop in `renderer.js` does not pass the saved name back to `createTerminal()`.

There are four distinct code paths that mutate a tab name during a session: OSC title parsing (terminal mode AI naming via `updateTerminalTabName`), haiku AI naming (chat mode via `onTabRename` callback in `ChatView`), slash-command rename (via `updateTerminalTabName` from `wireTabRenameConsumer`), and user double-click rename (via `startRenameTab`/`updateTerminal`). None of these four paths currently call `saveTerminalSessions()` after writing the new name into terminal data — only `wireSessionIdCapture` calls save (on session ID changes). All four paths must be hooked to trigger a debounced save.

**Primary recommendation:** Add `name` to the serialized tab object in `saveTerminalSessionsImmediate`, pass `name: tab.name` in the restore loop's `createTerminal` call, and call `saveTerminalSessions()` after every name mutation. This is a small, focused change across three files: `TerminalSessionService.js`, `TerminalManager.js`, and `renderer.js`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| N/A — pure JS | — | No new dependencies required | All needed infrastructure exists |

No new npm packages. This phase is pure logic extension of existing code.

## Architecture Patterns

### Existing Session Persistence Architecture

```
renderer.js (startup restore loop)
  └── loadSessionData()                         ← reads terminal-sessions.json
      └── for each tab: createTerminal(project, { name, mode, cwd, ... })

TerminalSessionService.saveTerminalSessionsImmediate()
  └── iterates terminalsState.get().terminals
      └── writes { cwd, isBasic, mode, claudeSessionId } per tab  ← missing: name
      └── atomic write to terminal-sessions.json
```

### Pattern 1: Add `name` to serialized tab object

**What:** In `TerminalSessionService.saveTerminalSessionsImmediate()`, include `name: td.name` in the per-tab object alongside `cwd`, `isBasic`, `mode`, `claudeSessionId`.

**When to use:** Always — applies to all tab types (terminal, chat, basic).

**Example (TerminalSessionService.js, lines 84-92):**
```js
// Source: TerminalSessionService.js (saveTerminalSessionsImmediate)
const tab = {
  cwd: td.cwd || td.project.path,
  isBasic: td.isBasic || false,
  mode: td.mode || 'terminal',
  claudeSessionId: td.claudeSessionId || null,
  name: td.name || null,   // NEW — persist whatever name is showing
};
```

### Pattern 2: Pass saved name in restore loop

**What:** In `renderer.js` restore loop (around line 181), pass `name: tab.name` to `createTerminal` when it is non-null and non-default. Note: the restore loop currently also omits `mode`, but STATE.md confirms mode was intentionally handled in Phase 06-03 — check whether `mode: tab.mode` is already being passed (it currently is NOT in the visible code; this may need fixing too, or may be out of scope for this phase).

**Example (renderer.js, lines 181-186):**
```js
await TerminalManager.createTerminal(project, {
  runClaude: !tab.isBasic,
  cwd,
  mode: tab.mode || null,          // already needed per 06-03 but currently absent
  skipPermissions: settingsState.get().skipPermissions,
  resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
  name: tab.name || null,           // NEW — restore saved name
});
```

Both `createTerminal` and `createChatTerminal` already accept `name: customName` in their options destructuring (lines 1329 and 3377 of TerminalManager.js). The custom name is already used as `tabName = customName || project.name` (lines 1376 and 3382). No changes needed in those functions.

### Pattern 3: Trigger save after every name mutation

There are four name-mutation code paths. Each needs a `saveTerminalSessions()` call after the mutation:

**Path A: `updateTerminalTabName(id, name)` in TerminalManager.js (line 1002)**
This function is the central point for OSC renames and slash-command renames. Adding a save call here covers both in one place.
```js
function updateTerminalTabName(id, name) {
  const termData = getTerminal(id);
  if (!termData) return;
  if (name && name.startsWith('/')) {
    slashRenameTimestamps.set(id, Date.now());
  }
  updateTerminal(id, { name });
  // Update DOM...
  // NEW: persist name change
  const TerminalSessionService = require('../services/TerminalSessionService');
  TerminalSessionService.saveTerminalSessions();
}
```

**Path B: `finishRename` inside `startRenameTab()` in TerminalManager.js (line 1143)**
User double-click rename. After `updateTerminal(id, { name: newName })`:
```js
const finishRename = () => {
  const newName = input.value.trim() || currentName;
  updateTerminal(id, { name: newName });
  // ... DOM updates ...
  // NEW: persist name change
  const TerminalSessionService = require('../services/TerminalSessionService');
  TerminalSessionService.saveTerminalSessions();
};
```

**Path C: `onTabRename` callback in `createChatTerminal` in TerminalManager.js (line 3441)**
Chat tab haiku AI naming. After `data.name = name`:
```js
onTabRename: (name) => {
  const nameEl = tab.querySelector('.tab-name');
  if (nameEl) nameEl.textContent = name;
  const data = getTerminal(id);
  if (data) data.name = name;
  // remote notify...
  // NEW: persist name change
  const TerminalSessionService = require('../services/TerminalSessionService');
  TerminalSessionService.saveTerminalSessions();
},
```

### Anti-Patterns to Avoid

- **Saving on every `updateTerminal` call:** `updateTerminal` is called for many non-name updates (status, cwd, claudeSessionId, etc.). Adding save to `updateTerminal` itself would over-save. Target only name-mutation paths.
- **Re-generating AI names on restore:** The saved name must be used as-is. Never call `generateTabName` or the haiku service on restore. The `customName` mechanism in `createTerminal` already satisfies this.
- **Using `saveTerminalSessionsImmediate` instead of `saveTerminalSessions` for name changes:** Name changes are frequent (can fire multiple times per Claude task). Use the debounced `saveTerminalSessions()` (2000ms debounce), not the immediate variant. The immediate variant is reserved for crash-critical moments (session ID capture, shutdown).
- **Circular dependency pitfall:** `TerminalManager.js` already uses lazy `require('../services/TerminalSessionService')` pattern to avoid circular deps (established in Phase 4). Follow the same pattern — use `require` inside the function body, not at module top.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounced file write | Custom timer + file write | `saveTerminalSessions()` (already debounced at 2000ms) | Already atomic (tmp+rename), already handles race conditions |
| Name source detection | Logic to classify whether name is "worth saving" | Save ALL names unconditionally | Context.md decision: save everything shown — no classification needed |
| Separate name persistence file | New JSON file for tab names | Extend existing `terminal-sessions.json` tab object | Keeps all session data co-located, single read/write cycle |

## Common Pitfalls

### Pitfall 1: `mode` is also missing from restore loop

**What goes wrong:** The STATE.md decision log notes "[Phase 06]: 06-03: mode: tab.mode passed on restore — saved mode wins over defaultTerminalMode setting." But the current `renderer.js` restore loop (lines 181-186) does NOT pass `mode: tab.mode`. This means chat-mode tabs are not restored in chat mode.

**Why it matters for Phase 16:** If `mode` is not passed, `createTerminal` routes chat-mode tabs through the terminal PTY path instead of `createChatTerminal`, so they don't use `customName` at all. If the planner includes mode restoration (which should be verified), this must be fixed together with name restoration.

**How to avoid:** Pass `mode: tab.mode || null` alongside `name: tab.name || null` in the restore call. The `mode` parameter is already accepted by `createTerminal` (line 1329: `mode: explicitMode = null`) and routes to `createChatTerminal` when `mode === 'chat'`.

**Warning sign:** After restore, tabs that were chat-mode before restart appear as terminal-mode tabs.

### Pitfall 2: Chat tab `onTabRename` directly mutates `data.name` (not via `updateTerminalTabName`)

**What goes wrong:** The chat tab's `onTabRename` callback (TerminalManager.js line 3441) sets `data.name = name` by directly mutating the terminal object, bypassing `updateTerminalTabName`. If a save is only added to `updateTerminalTabName`, chat-mode AI-generated haiku names will not be persisted.

**How to avoid:** Add `saveTerminalSessions()` to both `updateTerminalTabName` AND the `onTabRename` callback independently. Three total hook points: `updateTerminalTabName`, `finishRename`, `onTabRename`.

### Pitfall 3: Default project name as saved name causes false "restoration"

**What goes wrong:** If `td.name` is `project.name` (the default), saving it and then restoring with `name: tab.name` is harmless but redundant — `createTerminal` already defaults to `project.name`. No behavioral problem, but worth knowing.

**How to avoid:** No action required — saving the default name is fine (CONTEXT.md: "persist ALL names"). However, the planner could optionally save `null` when `name === project.name` to keep the file clean and reduce storage slightly. Either approach is valid.

### Pitfall 4: `saveTerminalSessions` is not exported from `TerminalSessionService`

**What goes wrong:** Adding lazy requires in TerminalManager.js that call `TerminalSessionService.saveTerminalSessions()` will fail silently if the export is missing.

**Current state:** `saveTerminalSessions` IS already exported (TerminalSessionService.js line 158). No action needed — just confirm the import alias in the lazy require matches.

### Pitfall 5: Haiku name fires twice (instant truncated name + async haiku)

**What goes wrong:** ChatView generates a tab name in two steps — first an instant word-truncated name, then an async haiku-polished name. Both call `onTabRename`. Both will now trigger `saveTerminalSessions()`. This is two debounced saves within ~4 seconds, which is fine (2000ms debounce means the first is usually cancelled before writing).

**How to avoid:** No action required — the debounce already handles this gracefully.

## Code Examples

### Complete saveTerminalSessionsImmediate tab object (after change)

```js
// Source: src/renderer/services/TerminalSessionService.js (saveTerminalSessionsImmediate)
const tab = {
  cwd: td.cwd || td.project.path,
  isBasic: td.isBasic || false,
  mode: td.mode || 'terminal',
  claudeSessionId: td.claudeSessionId || null,
  name: td.name || null,   // Phase 16: persist tab name
};
```

### Complete restore loop createTerminal call (after change)

```js
// Source: renderer.js (session restore loop)
await TerminalManager.createTerminal(project, {
  runClaude: !tab.isBasic,
  cwd,
  mode: tab.mode || null,
  skipPermissions: settingsState.get().skipPermissions,
  resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
  name: tab.name || null,   // Phase 16: restore tab name
});
```

### updateTerminalTabName with save (after change)

```js
// Source: src/renderer/ui/components/TerminalManager.js
function updateTerminalTabName(id, name) {
  const termData = getTerminal(id);
  if (!termData) return;
  if (name && name.startsWith('/')) {
    slashRenameTimestamps.set(id, Date.now());
  }
  updateTerminal(id, { name });
  const tab = document.querySelector(`.terminal-tab[data-id="${id}"]`);
  if (tab) {
    const nameSpan = tab.querySelector('.tab-name');
    if (nameSpan) nameSpan.textContent = name;
  }
  // Phase 16: persist name change (debounced)
  const TerminalSessionService = require('../services/TerminalSessionService');
  TerminalSessionService.saveTerminalSessions();
}
```

## File Impact Map

| File | Change | Lines affected |
|------|--------|----------------|
| `src/renderer/services/TerminalSessionService.js` | Add `name: td.name \|\| null` to tab object in `saveTerminalSessionsImmediate` | ~line 89 |
| `src/renderer/ui/components/TerminalManager.js` | Add `saveTerminalSessions()` to `updateTerminalTabName` | ~line 1022 |
| `src/renderer/ui/components/TerminalManager.js` | Add `saveTerminalSessions()` to `finishRename` in `startRenameTab` | ~line 1150 |
| `src/renderer/ui/components/TerminalManager.js` | Add `saveTerminalSessions()` to `onTabRename` in `createChatTerminal` | ~line 3449 |
| `renderer.js` | Pass `name: tab.name \|\| null` (and `mode: tab.mode \|\| null`) in restore loop | ~line 181 |

**Total estimated change:** ~10 lines added across 3 files. No new files, no CSS changes, no i18n changes.

## Open Questions

1. **Is `mode` restoration currently broken?**
   - What we know: STATE.md decision "[Phase 06]: 06-03: mode: tab.mode passed on restore" exists, but the current renderer.js restore loop does not pass `mode`.
   - What's unclear: Was this intentionally omitted in the "fix: restore missing features" commit (65d4d01f), or was it accidentally dropped?
   - Recommendation: Planner should include `mode: tab.mode || null` in the restore call as part of this phase, since it's a prerequisite for chat-mode tabs to receive their restored name via `createChatTerminal`.

2. **Should `name: null` be saved when name equals project.name?**
   - What we know: CONTEXT.md says "persist ALL tab names."
   - What's unclear: Whether null vs. project-name as saved value has any downstream effect.
   - Recommendation: Save unconditionally (`td.name || null`). Restore with `tab.name || null`. The `|| null` guard means empty/undefined names fall back to default project name via `customName || project.name` in createTerminal. This is safe and correct.

## Sources

### Primary (HIGH confidence)

- `src/renderer/services/TerminalSessionService.js` — Full file read; confirmed tab serialization schema and save/load functions
- `src/renderer/ui/components/TerminalManager.js` — Grepped and read key sections; confirmed all four name-mutation paths and existing `customName` parameter support in both `createTerminal` and `createChatTerminal`
- `renderer.js` lines 166-213 — Full restore loop read; confirmed missing `name` and `mode` params
- `src/renderer/events/index.js` lines 310-385 — Confirmed slash-command rename via `wireTabRenameConsumer` and save-on-session-ID in `wireSessionIdCapture`
- `src/renderer/ui/components/ChatView.js` lines 1527-1537 — Confirmed two-step haiku naming flow via `onTabRename`
- `.planning/phases/16-remember-tab-names-of-claude-sessions-through-app-restarts/16-CONTEXT.md` — All locked decisions

### Secondary (MEDIUM confidence)

- `src/renderer/state/terminals.state.js` — Confirmed `updateTerminal` function; no auto-save subscribers on terminalsState

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new dependencies; all code paths directly inspected
- Architecture: HIGH — Both save and restore paths fully read; all four name-mutation call sites identified
- Pitfalls: HIGH — Mode omission verified by reading current renderer.js restore loop; chat onTabRename bypass verified by reading ChatView.js

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable codebase, no fast-moving external APIs)
