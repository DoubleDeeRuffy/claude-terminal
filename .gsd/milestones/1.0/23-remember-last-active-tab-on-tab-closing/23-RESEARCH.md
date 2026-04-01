# Phase 23: Remember-Last-Active-Tab-On-Tab-Closing - Research

**Researched:** 2026-02-27
**Domain:** In-memory tab history stack, TerminalManager.js tab close logic
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Tab history scope:** Per-project history stack — each project maintains its own ordered list of recently-active tab IDs. Global cross-project history is not tracked.
- **History stack depth:** Full history — track every tab activation in order, no cap. The stack is bounded naturally by the number of open tabs per project.
- **Fallback behavior:** Walk back the history stack: if the most-recent entry is gone, try the next-oldest, and so on. If the entire stack is exhausted (all previously-active tabs are closed), fall back to the nearest neighboring tab in the tab strip. Existing behavior (switch to sessions panel when no tabs remain) is preserved.
- **Tab type coverage:** All tab types participate equally — terminal, chat, and file/markdown viewer tabs. Unified behavior — the history stack tracks whatever tab was last active regardless of type.

### Claude's Discretion

- Data structure choice for the per-project history stack (array, linked list, etc.)
- Whether to persist the history stack across app restarts or keep it in-memory only
- Integration approach with existing `lastActivePerProject` Map from Phase 20

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 23 is a self-contained renderer-side change to `TerminalManager.js`. The only file that needs modification is `src/renderer/ui/components/TerminalManager.js`. No new libraries, IPC channels, or state modules are needed.

The current `closeTerminal()` function (lines 1309–1394) picks the fallback tab via a `forEach` scan that stops at the first same-project terminal it encounters — insertion order, not activation order. The fix replaces that scan with a per-project history stack (an array of terminal IDs per project ID), appended in `setActiveTerminal()` and walked in `closeTerminal()`.

The existing `lastActivePerProject` Map from Phase 20 tracks only the single most-recent tab per project and is used by `filterByProject()` for project-switch restoration. This phase adds a **second**, parallel data structure — `tabActivationHistory` (a `Map<projectId, tabId[]>`) — rather than replacing or mutating `lastActivePerProject`, keeping Phase 20 behavior intact and the two concerns cleanly separated.

**Primary recommendation:** Add `tabActivationHistory` as a `Map<projectId, number[]>` alongside `lastActivePerProject`. Append in `setActiveTerminal`. Walk and clean in `closeTerminal`. Keep in-memory only (no persistence).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none) | — | Pure JS array stack | No library needed — this is a plain array push/walk pattern |

No new dependencies. No npm installs required.

## Architecture Patterns

### Recommended Project Structure

No file additions. Single file change:

```
src/renderer/ui/components/
└── TerminalManager.js    # Only file to modify
```

### Pattern 1: Per-Project Tab History Stack

**What:** A `Map<projectId, number[]>` where each array is an ordered list of terminal IDs in the order they were activated. The last element is the most recently activated tab for that project.

**When to use:** On every `setActiveTerminal()` call and every `closeTerminal()` call.

**Data structure recommendation:** A plain JS `Array` per project, used as a stack (push on activate, pop-walk on close). An array is the correct choice over a linked list — JS arrays are native, have O(1) push, and allow arbitrary-index removal when cleaning up closed tab IDs.

**Example — declaration (at module level near `lastActivePerProject`):**

```js
// ── Per-project activation history (for browser-like tab-close behavior) ──
// Map<projectId, number[]> — most-recently-activated tab ID is the last element
const tabActivationHistory = new Map();
```

**Example — push on activation (in `setActiveTerminal`, after the existing `lastActivePerProject.set` call):**

```js
// Append to per-project activation history
if (newProjectId) {
  if (!tabActivationHistory.has(newProjectId)) {
    tabActivationHistory.set(newProjectId, []);
  }
  tabActivationHistory.get(newProjectId).push(id);
}
```

**Example — walk-back on close (in `closeTerminal`, replaces the `forEach` scan at lines 1362–1371):**

```js
// Walk back activation history to find the previous live tab for this project
let sameProjectTerminalId = null;
if (closedProjectId) {
  const history = tabActivationHistory.get(closedProjectId);
  if (history) {
    // Walk from most-recent backward, skip the tab being closed and any already-removed tabs
    for (let i = history.length - 1; i >= 0; i--) {
      const candidateId = history[i];
      if (candidateId === id) continue;          // skip the tab being closed
      if (!getTerminal(candidateId)) continue;    // skip already-removed tabs
      sameProjectTerminalId = candidateId;
      break;
    }
  }
}

// Fallback: nearest neighbor in tab strip (original forEach scan, only reached if history exhausted)
if (!sameProjectTerminalId && closedProjectPath) {
  const terminals = terminalsState.get().terminals;
  terminals.forEach((td, termId) => {
    if (!sameProjectTerminalId && td.project?.path === closedProjectPath) {
      sameProjectTerminalId = termId;
    }
  });
}
```

**Example — cleanup on terminal removal (in `closeTerminal`, after `removeTerminal(id)`):**

No eager cleanup needed. The walk-back already skips entries where `getTerminal(candidateId)` returns null (same guard pattern as the existing `lastActivePerProject` comment on lines 1339–1340). This keeps the cleanup model consistent with the rest of the file.

Optionally, entries for the closed tab ID can be filtered out of the history array at close-time to bound memory. With at most ~10 tabs per project this is never a memory concern, but it keeps the array clean:

```js
// Optional: prune history entries for the tab being closed
if (closedProjectId) {
  const history = tabActivationHistory.get(closedProjectId);
  if (history) {
    // Remove all occurrences of the closed tab ID (may appear multiple times if re-activated)
    const pruned = history.filter(hId => hId !== id);
    if (pruned.length === 0) {
      tabActivationHistory.delete(closedProjectId);
    } else {
      tabActivationHistory.set(closedProjectId, pruned);
    }
  }
}
```

Pruning is safe to do before or after the walk-back as long as the walk-back reads the unpruned array. Simplest: prune after the walk-back has already found `sameProjectTerminalId`.

### Pattern 2: In-Memory Only (No Persistence)

**What:** The history stack is module-level state, lives only for the session. It is NOT saved to `TerminalSessionService` or any disk store.

**Rationale:** Activation order from a previous session is meaningless. A user reopens the app and sees restored tabs — there is no correct "previously-active" ordering from before shutdown. Keeping it in-memory avoids disk I/O and schema migration.

**Implication:** On app restart, `tabActivationHistory` is empty for all projects. The first time `setActiveTerminal` is called per project, the history starts fresh. The `filterByProject` fallback path (disk-based `activeTabIndex`) handles the restart case as before — no change needed there.

### Pattern 3: Integration with Existing `lastActivePerProject`

**What:** Keep `lastActivePerProject` exactly as it is. Do NOT replace or merge it into `tabActivationHistory`.

**Why:** `lastActivePerProject` is used in `filterByProject` for project-switch restoration (Phase 20). Its semantics differ — it needs the single most-recent ID quickly for O(1) lookup during project switch. The history stack is needed only during `closeTerminal`. They serve different consumers; coupling them would create fragility.

**Change required in `setActiveTerminal`:** Both Maps get updated at the same point (after the `newProjectId` guard). The `lastActivePerProject.set` line stays; the `tabActivationHistory.get(newProjectId).push(id)` line is added immediately after.

### Anti-Patterns to Avoid

- **Replacing `lastActivePerProject` with `tabActivationHistory`:** Do not do this. `filterByProject` reads `lastActivePerProject` by key — replacing it with an array-based map changes the API contract for Phase 20 logic.
- **Capping or LRU-bounding the array:** The user decision is "full history". Do not impose an artificial cap. The array is bounded by the number of tab activations in a session, which is small in practice.
- **Persisting the history:** Do not add this to `TerminalSessionService`. The disk-based `activeTabIndex` already handles the app-restart case.
- **Using the history stack in `filterByProject`:** The `filterByProject` function has its own restore logic (Phase 20 `lastActivePerProject` + Phase 6.3 disk fallback). Do not add a third restore path there. The history stack is only for `closeTerminal`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ordered stack | Custom linked list | JS Array | Arrays are native O(1) push, zero overhead, already used throughout the file |
| Stale-entry detection | Eager bookkeeping on every close | `getTerminal(id)` null-check in walk loop | Established pattern in this codebase — see existing comment on lines 1339–1340 |

**Key insight:** The "stale entry" problem is already solved idiomatically in this file — `getTerminal()` returns null for removed terminals, and the code that reads `lastActivePerProject` already relies on this guard. The history walk-back uses the exact same null-check guard, so no new cleanup infrastructure is needed.

## Common Pitfalls

### Pitfall 1: Reading History AFTER `removeTerminal(id)` for the Closed Tab

**What goes wrong:** If the walk-back runs after `removeTerminal(id)` has already been called, and the closed tab's own ID is at the top of the history, `getTerminal(closedId)` will return null — so it will be silently skipped. But also: the second-most-recent entry IS the closed tab ID itself (if the user activated then immediately closed), and that also needs to be skipped. Both are already handled by the `if (candidateId === id) continue` plus `if (!getTerminal(candidateId)) continue` guards.

**How to avoid:** Run the walk-back AFTER `removeTerminal(id)` is called. This ensures the closed tab is truly gone from the terminals Map and `getTerminal` returns null for it, making the null-check guard doubly robust.

**Warning signs:** If the app switches to the just-closed tab (blank screen), it means the walk-back found the closed tab before `removeTerminal` was called.

### Pitfall 2: History Contains the Closed Tab's ID as the Only Entry

**What goes wrong:** User opens one tab, activates it (history = [A]), closes it. Walk-back finds A, skips it (it's the closed tab), exhausts the array. Falls back to `forEach` scan on `terminalsState` — but `terminalsState` is also empty at this point (A was just removed). `sameProjectTerminalId` is null. Falls through to the sessions panel path — which is exactly the correct behavior.

**How to avoid:** No special handling needed — the fallback chain naturally reaches the "no terminals" branch and shows the sessions panel, same as the current behavior.

### Pitfall 3: History Leaking Across Projects

**What goes wrong:** The history is keyed by `project.id`. If `project.id` is somehow shared or undefined, entries bleed across projects.

**How to avoid:** Always guard `if (newProjectId)` before pushing to history, same as the existing `lastActivePerProject.set` guard. If `newProjectId` is null/undefined, do not push.

### Pitfall 4: `tabActivationHistory` Not Initialized for a Project Before Push

**What goes wrong:** `tabActivationHistory.get(newProjectId).push(id)` crashes if the Map has no entry for `newProjectId`.

**How to avoid:** Always check `if (!tabActivationHistory.has(newProjectId)) tabActivationHistory.set(newProjectId, [])` before pushing. This is a standard Map-of-arrays pattern.

### Pitfall 5: Forgetting to Update `lastActivePerProject` in Parallel

**What goes wrong:** The new push to `tabActivationHistory` is added but `lastActivePerProject.set` is accidentally removed or moved, breaking Phase 20 project-switch restoration.

**How to avoid:** The two lines should be adjacent and clearly commented. Do not modify `lastActivePerProject` — only ADD the history push next to it.

## Code Examples

### Complete `setActiveTerminal` change (history push addition only)

```js
// Record this terminal as last-active for its project (Phase 20 — project-switch restore)
if (newProjectId) {
  lastActivePerProject.set(newProjectId, id);
}

// Append to per-project activation history (Phase 23 — browser-like tab-close behavior)
if (newProjectId) {
  if (!tabActivationHistory.has(newProjectId)) {
    tabActivationHistory.set(newProjectId, []);
  }
  tabActivationHistory.get(newProjectId).push(id);
}
```

### Complete `closeTerminal` replacement for the tab-selection block (lines 1362–1391)

Replace the existing `// Find another terminal from the same project` block through the end of `filterByProject` calls:

```js
// Find the previously-active tab for this project using activation history
let sameProjectTerminalId = null;

if (closedProjectId) {
  const history = tabActivationHistory.get(closedProjectId);
  if (history) {
    // Walk from most-recent backward; skip the closed tab and already-removed tabs
    for (let i = history.length - 1; i >= 0; i--) {
      const candidateId = history[i];
      if (candidateId === id) continue;          // skip the tab being closed
      if (!getTerminal(candidateId)) continue;   // skip already-removed tabs
      sameProjectTerminalId = candidateId;
      break;
    }

    // Prune closed tab from history to keep the array clean
    const pruned = history.filter(hId => hId !== id);
    if (pruned.length === 0) {
      tabActivationHistory.delete(closedProjectId);
    } else {
      tabActivationHistory.set(closedProjectId, pruned);
    }
  }
}

// Fallback: nearest neighbor in tab strip (if history exhausted or not yet populated)
if (!sameProjectTerminalId && closedProjectPath) {
  const terminals = terminalsState.get().terminals;
  terminals.forEach((td, termId) => {
    if (!sameProjectTerminalId && td.project?.path === closedProjectPath) {
      sameProjectTerminalId = termId;
    }
  });
}

// Stop time tracking if no more terminals for this project
if (!sameProjectTerminalId && closedProjectId) {
  stopProject(closedProjectId);
}

if (sameProjectTerminalId) {
  // Switch to the previously-active terminal of the same project
  setActiveTerminal(sameProjectTerminalId);
  const selectedFilter = projectsState.get().selectedProjectFilter;
  filterByProject(selectedFilter);
} else if (closedProjectIndex !== null && closedProjectIndex !== undefined) {
  // No more terminals for this project - stay on project filter to show sessions panel
  projectsState.setProp('selectedProjectFilter', closedProjectIndex);
  filterByProject(closedProjectIndex);
} else {
  // Fallback
  const selectedFilter = projectsState.get().selectedProjectFilter;
  filterByProject(selectedFilter);
}
```

### Module-level declaration (near line 162)

```js
// ── Per-project activation history stack (Phase 23 — browser-like tab-close behavior) ──
// Map<projectId, number[]> — most-recently-activated tab ID is the last element
const tabActivationHistory = new Map();
```

## Exact Lines to Modify

All changes are in `src/renderer/ui/components/TerminalManager.js`:

| Location | Action | Lines (approx) |
|----------|--------|----------------|
| Module-level declarations | Add `tabActivationHistory` Map declaration after `lastActivePerProject` | After line 162 |
| `setActiveTerminal()` | Add history push after `lastActivePerProject.set` | After line 1242 |
| `closeTerminal()` | Replace `forEach` scan (lines 1362–1371) with history walk-back + neighbor fallback | 1362–1371 |

No other files need to change. No IPC, no state module, no CSS, no tests, no i18n.

## Open Questions

1. **Should the pruning (filter out closed tab from history array) happen before or after the walk-back?**
   - What we know: The walk-back uses `if (candidateId === id) continue` to skip the closing tab, so order doesn't matter for correctness.
   - What's unclear: Whether to prune at all (purely cosmetic for memory).
   - Recommendation: Prune after the walk-back. Keep the logic sequential — find the target, then clean up.

2. **Should `tabActivationHistory` be cleaned up when a project is deleted?**
   - What we know: `lastActivePerProject` explicitly does NOT clean up (lines 1339–1340, stale IDs handled via null-check guard).
   - What's unclear: Nothing — the same pattern applies. When a project is deleted and its terminals are closed, the history entries will be pruned per-close. If the Map entry still exists after all tabs are closed (because the user never activated any tab after the last close), it holds an empty or pruned array — not a leak.
   - Recommendation: No special project-delete cleanup needed. Follow the existing `lastActivePerProject` pattern.

## Sources

### Primary (HIGH confidence)

- Direct code read of `TerminalManager.js` (4203 lines) — `closeTerminal` (lines 1309–1394), `setActiveTerminal` (lines 1184–1275), module-level Maps (lines 160–164), `filterByProject` restoration logic (lines 2269–2309)
- Phase 20 decision in STATE.md: "lastActivePerProject Map tracks last-active terminal ID per project in-memory; filterByProject uses Map as primary restore source"
- CONTEXT.md decisions — all locked, no alternatives to research

### Secondary (MEDIUM confidence)

- None needed — this is a pure in-codebase implementation, no external libraries.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, pure JS, direct code inspection
- Architecture: HIGH — the pattern mirrors existing `lastActivePerProject` exactly; two code sites need changes
- Pitfalls: HIGH — derived from direct reading of the `closeTerminal` and `setActiveTerminal` source

**Research date:** 2026-02-27
**Valid until:** Until TerminalManager.js is significantly refactored (stable file, changes are low-frequency)
