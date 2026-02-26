# Phase 6: Resume Claude Sessions After Restart - Research

**Researched:** 2026-02-25
**Domain:** Claude Terminal Session ID Persistence — capture session IDs from hooks events, persist per-terminal, pass to TerminalService.create() on restore
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Session ID capture**
- Use the existing HooksProvider/ClaudeEventBus SESSION_START events to capture session IDs
- Extend TerminalSessionService (Phase 4 infrastructure) with a `claudeSessionId` field per terminal
- Every SESSION_START event updates the stored session ID for that terminal (always tracks latest)

**Resume behavior**
- Only terminals that had an active Claude session get `claude --resume <id>` on restore
- Plain shells restore normally (existing Phase 4 behavior unchanged)
- Auto-resume immediately — terminal opens and runs `claude --resume <session-id>` automatically, seamless continuation

**Failure handling**
- Just attempt `claude --resume` without pre-validation — no need to inspect Claude's internal file structure
- Detect failure via exit code: if Claude process exits quickly (within a few seconds), assume resume failed
- On failure, fall back to starting a fresh `claude` session in the same terminal (not a plain shell)
- Session ID updates on every SESSION_START, so fallback new sessions also get tracked

### Claude's Discretion
- Exact timeout threshold for "exited quickly" detection
- How to wire the hooks event to the specific terminal (terminal ID correlation)
- Whether to show a brief indicator during resume attempt

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase adds Claude session ID persistence so that after an app restart, terminals that previously had a Claude session automatically resume that session via `claude --resume <session-id>` instead of starting a fresh session. The infrastructure is deeply favorable: the main process already supports `resumeSessionId` (it is already wired through `TerminalService.create()`, the IPC handler `terminal-create`, and the preload bridge), and the renderer already has a `resumeSession()` function in `TerminalManager.js`. Phase 4 already built the persistence layer (`TerminalSessionService.js`), which needs only a `claudeSessionId` field added to each tab's stored data.

The key complexity is the **terminal ID correlation problem**: SESSION_START events from the hooks system arrive via `cwd` (project path) rather than by terminal ID. When a project has multiple Claude terminals open simultaneously, the event cannot deterministically identify which terminal's session just started. The existing approach in `HooksProvider.js` resolves only to a `projectId` — not to a specific terminal. This phase must solve that correlation to update the correct terminal's stored session ID.

The **failure detection** is the other non-trivial piece. After `claude --resume <id>` runs, if Claude exits within a few seconds it indicates the session is stale/deleted. The PTY exit event (`terminal-exit` IPC channel) fires immediately when the process dies, and the renderer already handles this via `closeTerminal()`. A short-lived timer started at resume time, cancelled on first data received from the PTY, serves as the "quick exit" detector. If the timer fires before data arrives, fall back to a fresh `claude` start.

**Primary recommendation:** Extend `TerminalSessionService.js` with a `claudeSessionId` field, add a new EventBus consumer in `events/index.js` that wires SESSION_START → session ID capture per terminal, thread `claudeSessionId` through the restore loop in `renderer.js`, and use a short-lived watchdog timer to detect and recover from stale-session failures.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `TerminalSessionService.js` | Existing | Persistence layer — extend with `claudeSessionId` field | Already owns the terminal-sessions.json file and all read/write logic |
| `ClaudeEventBus` + `HooksProvider` | Existing | SESSION_START event source delivering `session_id` from hook stdin | Already parses `stdin.session_id` from `SessionStart` hook events |
| `TerminalService.create()` (main) | Existing | PTY spawn with `claude --resume <id>` — already supports `resumeSessionId` | Already implemented end-to-end: `TerminalService` → `terminal.ipc.js` → preload → `api.terminal.create` |
| `TerminalManager.resumeSession()` | Existing | Renderer-side resume logic — already calls `api.terminal.create({ resumeSessionId })` | Exists for the sessions panel "resume" button; can be reused or its pattern copied |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `fs` (via preload) | Built-in | Read/write `terminal-sessions.json` | Same atomic-write pattern already used in `TerminalSessionService` |
| `terminalsState` Map | Existing | Look up `termData` by terminal ID to find which terminal a session event belongs to | The source of truth for in-memory terminal state |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HooksProvider SESSION_START for capture | ScrapingProvider events | ScrapingProvider never receives a `session_id` — it emits synthetic SESSION_START with `sessionId: null`. HooksProvider is the only path to a real session ID. |
| Extending TerminalSessionService in-place | New separate service | TerminalSessionService already owns the file format; adding a field is far simpler than splitting concerns |
| Watchdog timer for failure detection | Pre-validating session file existence | CONTEXT.md locked decision: attempt without pre-validation. Watchdog is the only viable failure detection mechanism |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No new files required. Changes touch:

```
src/renderer/services/TerminalSessionService.js   # add claudeSessionId to tab data shape
src/renderer/events/index.js                      # add SESSION_START consumer to capture session IDs
src/renderer/ui/components/TerminalManager.js     # add mode/cwd to termData for resumed terminals
renderer.js                                       # thread resumeSessionId into the restore loop
```

### Pattern 1: Extended Tab Data Shape

**What:** Add `claudeSessionId` to the per-tab object stored in `terminal-sessions.json`.

**When to use:** Set whenever a SESSION_START event fires for a terminal; read at restore time.

**Example (extended tab shape in terminal-sessions.json):**
```json
{
  "projects": {
    "project-1748000000000-abc123": {
      "tabs": [
        {
          "cwd": "C:\\Users\\user\\source\\repos\\my-project",
          "isBasic": false,
          "claudeSessionId": "abc123de-f012-3456-7890-abcdef012345"
        },
        {
          "cwd": "C:\\Users\\user\\source\\repos\\my-project",
          "isBasic": false,
          "claudeSessionId": null
        }
      ],
      "activeCwd": "C:\\Users\\user\\source\\repos\\my-project"
    }
  }
}
```

`claudeSessionId: null` means the terminal never had a Claude session start event (just created, loading, or the hook never fired). On restore, `null` means: restore as normal without `--resume`.

### Pattern 2: Terminal ID Correlation — the Core Challenge

**What:** SESSION_START events from `HooksProvider` arrive with `meta.projectId` (derived from `cwd`) but NOT with a terminal ID. When multiple Claude terminals are open for the same project, which terminal's session just started?

**Why it matters:** We must update the correct terminal's `claudeSessionId` in memory (later persisted to disk). Getting this wrong silently corrupts session data.

**The available signal:** The hook `cwd` field is `process.cwd()` of the hook handler script, which is the project working directory (the `--cwd` that Claude was launched with). For a project with one Claude terminal, this unambiguously identifies the terminal. For a project with multiple Claude terminals, all at the same cwd, we must use a heuristic.

**Recommended heuristic (Claude's Discretion):** In `terminalsState.get().terminals`, filter terminals by `projectId` AND `mode === 'terminal'` AND `!isBasic`. Then:
1. If exactly one such terminal exists → it is the one whose session started. HIGH confidence.
2. If multiple terminals exist → pick the most recently created one (highest terminal ID, as IDs are monotonically incrementing integers). MEDIUM confidence, but this is the best available signal without invasive tracking.
3. If zero terminals exist → event is stale or from an external Claude process; ignore.

**Example implementation of correlation:**
```js
// In events/index.js — new consumer wired in wireSessionIdCapture()
function findTerminalForProject(projectId) {
  try {
    const { terminalsState } = require('../state/terminals.state');
    const terminals = terminalsState.get().terminals;
    let best = null;
    let bestId = -1;
    for (const [id, td] of terminals) {
      if (td.project?.id === projectId && td.mode === 'terminal' && !td.isBasic) {
        if (id > bestId) { bestId = id; best = id; }
      }
    }
    return best; // terminal ID (integer) or null
  } catch (e) { return null; }
}
```

**Alternative considered:** Attaching a `pendingSessionCapture` flag to a terminal at creation time (the terminal is in `loading` status), then matching the first SESSION_START that fires. This is more accurate but requires coordinating a flag between createTerminal and the event bus — additional coupling. The "latest terminal ID" heuristic is simpler and correct for the common case (one Claude terminal per project).

### Pattern 3: In-Memory claudeSessionId on termData

**What:** Store the captured session ID on the live `termData` object in `terminalsState` so `saveTerminalSessionsImmediate` can read it alongside CWD and isBasic.

**When to use:** Updated in the SESSION_START consumer; read by the existing save function.

**Example — updating termData:**
```js
// In the SESSION_START consumer after finding the terminal ID:
const { updateTerminal } = require('../state/terminals.state');
updateTerminal(terminalId, { claudeSessionId: envelope.data.sessionId });
// Then trigger debounced save:
const TerminalSessionService = require('../services/TerminalSessionService');
TerminalSessionService.saveTerminalSessions();
```

**Reading in saveTerminalSessionsImmediate (TerminalSessionService.js):**
```js
projectsMap[projectId].tabs.push({
  cwd,
  isBasic,
  claudeSessionId: termData.claudeSessionId || null   // NEW field
});
```

### Pattern 4: Restore with Resume

**What:** In `renderer.js` restore loop, pass `claudeSessionId` to `createTerminal` via options, which threads it through to `api.terminal.create({ resumeSessionId })`.

**When to use:** At startup, for every tab that has a non-null `claudeSessionId` and `isBasic === false`.

**Current restore loop (renderer.js lines 174-181) — modification:**
```js
// BEFORE (Phase 4 implementation):
await TerminalManager.createTerminal(project, {
  runClaude: !tab.isBasic,
  cwd,
  skipPermissions: settingsState.get().skipPermissions,
});

// AFTER (Phase 6 addition):
await TerminalManager.createTerminal(project, {
  runClaude: !tab.isBasic,
  cwd,
  skipPermissions: settingsState.get().skipPermissions,
  resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
});
```

**Threading resumeSessionId through createTerminal:**
`TerminalManager.createTerminal()` already accepts an `options` object (line 1184). The `resumeSessionId` option must be destructured and passed to `api.terminal.create()`. Currently `createTerminal` does NOT thread `resumeSessionId` through — this is the primary code change in `TerminalManager.js`. Compare with `resumeSession()` (line 2648) which does pass it.

### Pattern 5: Failure Detection Watchdog

**What:** When a resume is attempted, start a short timer. If the PTY exits before the timer fires AND before any data was received, treat as a failed resume and restart with fresh `claude`.

**Threshold (Claude's Discretion):** 5 seconds. Rationale: `claude --resume <id>` with a valid session typically shows the first character of output within 1-2 seconds. An invalid/expired session causes Claude to exit within ~1s with an error message. 5 seconds provides enough buffer for slow machines while not making the user wait long on failure.

**Implementation options:**

*Option A: Inside TerminalManager.createTerminal() (recommended)*
- After the PTY is created with `resumeSessionId`, attach a watchdog: `setTimeout(watchdog, 5000)`.
- The existing `terminal.onTitleChange()` and `onData()` callbacks already exist for this terminal. Flag `dataReceived = false`; on first `onData`, set `dataReceived = true` and cancel the watchdog.
- If watchdog fires and `dataReceived === false` AND the terminal was closed (PTY exit received): call `TerminalManager.createTerminal(project, { runClaude: true, cwd })` to start a fresh Claude session, then close the failed terminal.

*Option B: Separate monitoring in the restore loop (simpler but less encapsulated)*
- After each `createTerminal()` call with a `resumeSessionId`, subscribe to `terminal-exit` IPC for that specific terminal ID. If exit arrives within 5s, restart fresh.

**Recommended: Option A** — keeps the logic co-located with the terminal creation code and reuses the existing `onData`/`onExit` infrastructure.

**Key detail from codebase:** The existing `closeTerminal()` is called when the `terminal-exit` IPC event fires (line 1348 in TerminalManager.js: `() => closeTerminal(id)`). The watchdog must check if the terminal was removed from `terminalsState` before triggering fallback, to avoid acting on an intentional user-close.

### Pattern 6: ScrapingProvider Limitation

**What:** When hooksEnabled is false (scraping mode), SESSION_START events have `sessionId: null` (synthetic). Session ID capture will not work.

**Impact:** On restore after restart with hooks disabled, all Claude terminals start fresh (no `--resume`). This is acceptable — the user has hooks disabled, so the capture path was never available.

**What NOT to do:** Do not attempt session ID capture in ScrapingProvider. The terminal output contains no structured session ID.

**Implementation:** Guard in the new consumer:
```js
eventBus.on(EVENT_TYPES.SESSION_START, (e) => {
  if (e.source !== 'hooks') return;       // ScrapingProvider emits source: 'scraping'
  if (!e.data?.sessionId) return;         // HooksProvider synthetic events also have null
  // ... capture logic
});
```

### Anti-Patterns to Avoid

- **Persisting session IDs in a separate file:** All terminal session data is consolidated in `terminal-sessions.json`. Adding a new file for session IDs would split the data that logically belongs together and create a second file to clean up on project deletion.
- **Querying Claude's session files directly:** CONTEXT.md explicitly forbids this. Do not read `~/.claude/projects/*/sessions-index.json` to validate session IDs before attempting resume.
- **Using `projectId` alone for correlation when multi-terminal:** This would silently update the wrong terminal's session ID. Always find the specific terminal ID first.
- **Blocking startup on resume success detection:** The watchdog must be async. The startup restore loop should `await createTerminal()` (which returns as soon as the PTY is spawned), then the watchdog runs independently in the background.
- **Clearing `claudeSessionId` on close:** When a user manually closes a terminal tab, the terminal is removed from live state. On the next `saveTerminalSessions()` call, that terminal won't appear in the serialized data — the ID is already gone. No explicit clearing needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Claude session resume via PTY | Custom `--resume` argument construction | `TerminalService.create({ resumeSessionId })` — already built | Windows path uses `cmd.exe /c claude --resume <id>`, non-Windows writes to PTY stdin; both already exist and validated |
| Session ID format validation | Custom regex | Existing regex in `TerminalService.js` line 136: `/^[a-f0-9\-]{8,64}$/` | The main process already validates format to prevent shell injection; renderer just needs to pass the value through |
| Atomic file write | Custom write logic | `writeSessionsFile()` in `TerminalSessionService.js` | Already crash-resilient via tmp+rename; just add `claudeSessionId` to the data it serializes |
| Renderer-side terminal resume | Custom implementation | `TerminalManager.resumeSession()` already exists at line 2638 | Pattern is already established; `createTerminal` needs the same `resumeSessionId` option threading |

**Key insight:** 90% of this phase is wiring — the infrastructure for resume (`TerminalService`, IPC, preload), persistence (`TerminalSessionService`), and events (`HooksProvider`, `ClaudeEventBus`) is already in place. The work is connecting these systems.

---

## Common Pitfalls

### Pitfall 1: createTerminal Does Not Thread resumeSessionId

**What goes wrong:** The restore loop passes `resumeSessionId` in options to `createTerminal()`, but `createTerminal()` (unlike `resumeSession()`) does not currently destructure or forward `resumeSessionId` to `api.terminal.create()`. The PTY launches without `--resume`, silently.

**Why it happens:** `resumeSession()` and `createTerminal()` are separate code paths. Phase 4 only added `runClaude`, `cwd`, and `skipPermissions` threading to `createTerminal`. The `resumeSessionId` option was never added to `createTerminal`.

**How to avoid:** Add `resumeSessionId` to the destructured options at line 1184 of `TerminalManager.js`, and pass it to `api.terminal.create()` at line 1195.

**Warning signs:** Terminals open without "resuming" indicator; Claude starts fresh; no `--resume` in the PTY command.

### Pitfall 2: ScrapingProvider SESSION_START Has Null Session ID

**What goes wrong:** Consumer receives SESSION_START but `e.data.sessionId` is `null`. Code updates `termData.claudeSessionId = null`, overwriting a previously captured valid ID.

**Why it happens:** ScrapingProvider emits `{ sessionId: null, synthetic: true }` for SESSION_START. If hooks are disabled mid-session then re-enabled, scraping events will fire with null IDs.

**How to avoid:** In the consumer, only update if `e.data.sessionId` is truthy AND `e.source === 'hooks'`. Never overwrite with null.

**Code guard:**
```js
if (e.source !== 'hooks' || !e.data?.sessionId) return;
```

### Pitfall 3: Multi-Tab Same-Project Session ID Collision

**What goes wrong:** Project has two Claude terminals. Terminal A starts a session → SESSION_START fires → heuristic picks the latest terminal ID (B, which was created after A) → B gets A's session ID. On restart, B resumes A's session.

**Why it happens:** The hooks event only provides `cwd` (project path), not a terminal-specific identifier. The "latest terminal" heuristic is probabilistic.

**How to avoid:** Accept this as an inherent limitation of the cwd-based correlation. The common case (one Claude terminal per project) is unambiguous. The multi-terminal case is documented as best-effort. Document this in code comments.

**Warning signs:** User reports wrong session resumed after restart when they had multiple Claude terminals open simultaneously.

### Pitfall 4: Stale Session ID After User Manually Resumes via Session Panel

**What goes wrong:** User opens session panel (sessions list UI), clicks "Resume" for an old session — this calls `resumeSession()` directly. A new SESSION_START fires with that session's ID, which updates `claudeSessionId`. Later, user closes that terminal. On restart, the old session's ID is in the file. Claude attempts to resume it.

**Why it happens:** `resumeSession()` spawns a terminal that will receive a SESSION_START. The consumer captures this ID just like any other. This is actually CORRECT behavior — the user explicitly chose that session, so we should restore it on next restart. This is not actually a bug.

**Clarification:** This is the desired behavior. Not a pitfall.

### Pitfall 5: Watchdog Fires After User Intentionally Closes Terminal

**What goes wrong:** User closes a resuming terminal within 5 seconds. Watchdog fires (terminal was closed quickly), thinks resume failed, spawns a new terminal.

**Why it happens:** The watchdog doesn't distinguish between user-initiated close and PTY-exit due to resume failure.

**How to avoid:** Check if the terminal still exists in `terminalsState` when the watchdog fires. If `getTerminal(id) === undefined`, the terminal was already cleaned up by `closeTerminal()` — do nothing.

**Code guard in watchdog:**
```js
setTimeout(() => {
  const td = getTerminal(id);
  if (!td) return;              // terminal already removed by user or closeTerminal — ignore
  if (dataReceived) return;     // data arrived before timeout — resume succeeded
  // Resume failed: start fresh
  createTerminal(project, { runClaude: true, cwd: project.path });
  closeTerminal(id);
}, RESUME_WATCHDOG_MS);
```

### Pitfall 6: termData Missing mode and cwd for resumeSession Terminals

**What goes wrong:** `resumeSession()` at line 2683 creates `termData` without `mode: 'terminal'` and without `cwd`. When `saveTerminalSessionsImmediate` runs, the filter `if (termData.mode !== 'terminal') return;` excludes these terminals, so their session IDs are never saved.

**Why it happens:** `resumeSession()` was written before Phase 4 introduced the `mode` field requirement. Its `termData` at line 2683 has no `mode` property.

**How to avoid:** Add `mode: 'terminal', cwd: project.path` to the `termData` object inside `resumeSession()`. This is a small fix that ensures resumed sessions are also tracked for future restarts.

---

## Code Examples

Verified patterns from codebase inspection:

### SESSION_START Event Shape (from HooksProvider)

```js
// From HooksProvider.js line 105-108 (SessionStart hook case):
eventBus.emit(EVENT_TYPES.SESSION_START, {
  sessionId: stdin.session_id || null,   // The Claude session UUID
  model: stdin.model || null
}, meta);
// meta = { projectId: "project-...", projectPath: "/path/to/project", source: 'hooks' }
```

The `stdin.session_id` field is the Claude session identifier. It is populated for real `SessionStart` hooks events but is `null` for synthetic events (scraping provider, or `ensureSession` synthetic calls).

### api.terminal.create Already Accepts resumeSessionId

```js
// From preload.js line 81:
create: (params) => ipcRenderer.invoke('terminal-create', params),

// From terminal.ipc.js line 14:
ipcMain.handle('terminal-create', (event, { cwd, runClaude, skipPermissions, resumeSessionId }) => {
  return terminalService.create({ cwd, runClaude, skipPermissions, resumeSessionId });
});

// From TerminalService.js lines 66-76 (Windows path):
if (runClaude && process.platform === 'win32') {
  const claudeArgs = ['claude'];
  if (resumeSessionId) {
    claudeArgs.push('--resume', resumeSessionId);
  }
  // ...
}
```

The full chain is already wired. Only `TerminalManager.createTerminal()` needs to pass `resumeSessionId` through.

### createTerminal — Where to Add resumeSessionId Threading

```js
// TerminalManager.js line 1184 (current):
async function createTerminal(project, options = {}) {
  const { skipPermissions = false, runClaude = true, name: customName = null,
          mode: explicitMode = null, cwd: overrideCwd = null,
          initialPrompt = null, initialImages = null,
          initialModel = null, initialEffort = null, onSessionStart = null } = options;
  // ...
  const result = await api.terminal.create({
    cwd: overrideCwd || project.path,
    runClaude,
    skipPermissions
  });

// CHANGE TO:
async function createTerminal(project, options = {}) {
  const { skipPermissions = false, runClaude = true, name: customName = null,
          mode: explicitMode = null, cwd: overrideCwd = null,
          initialPrompt = null, initialImages = null,
          initialModel = null, initialEffort = null, onSessionStart = null,
          resumeSessionId = null } = options;          // ADD THIS
  // ...
  const result = await api.terminal.create({
    cwd: overrideCwd || project.path,
    runClaude,
    skipPermissions,
    resumeSessionId: resumeSessionId || undefined     // ADD THIS
  });
```

### New EventBus Consumer: wireSessionIdCapture (in events/index.js)

```js
// New function to add in events/index.js — called from initClaudeEvents():
function wireSessionIdCapture() {
  consumerUnsubscribers.push(
    eventBus.on(EVENT_TYPES.SESSION_START, (e) => {
      // Only hooks provide real session IDs
      if (e.source !== 'hooks') return;
      if (!e.data?.sessionId) return;
      if (!e.projectId) return;

      // Find the terminal for this project (latest terminal ID heuristic)
      const terminalId = findClaudeTerminalForProject(e.projectId);
      if (!terminalId) return;

      // Update in-memory termData
      const { updateTerminal } = require('../state/terminals.state');
      updateTerminal(terminalId, { claudeSessionId: e.data.sessionId });

      // Trigger debounced save to persist the session ID
      const TerminalSessionService = require('../services/TerminalSessionService');
      TerminalSessionService.saveTerminalSessions();

      console.debug(`[Events] Captured session ID ${e.data.sessionId} for terminal ${terminalId}`);
    })
  );
}

function findClaudeTerminalForProject(projectId) {
  try {
    const { terminalsState } = require('../state/terminals.state');
    const terminals = terminalsState.get().terminals;
    let bestId = null;
    let bestNumericId = -1;
    for (const [id, td] of terminals) {
      if (td.project?.id !== projectId) continue;
      if (td.mode !== 'terminal') continue;
      if (td.isBasic) continue;
      if (id > bestNumericId) { bestNumericId = id; bestId = id; }
    }
    return bestId;
  } catch (e) { return null; }
}
```

### Extended saveTerminalSessionsImmediate (TerminalSessionService.js)

```js
// Inside the terminals.forEach() loop (line 87-100 currently):
terminals.forEach((termData) => {
  if (termData.mode !== 'terminal') return;
  if (!termData.project || !termData.project.id) return;

  const projectId = termData.project.id;
  const cwd = termData.cwd || termData.project.path;
  const isBasic = termData.isBasic === true;
  const claudeSessionId = termData.claudeSessionId || null;   // NEW

  if (!projectsMap[projectId]) {
    projectsMap[projectId] = { tabs: [], activeCwd: null };
  }

  projectsMap[projectId].tabs.push({ cwd, isBasic, claudeSessionId });  // EXTENDED
});
```

### Restore Loop Addition (renderer.js)

```js
// Inside the existing restore loop at line 174 (Phase 4):
await TerminalManager.createTerminal(project, {
  runClaude: !tab.isBasic,
  cwd,
  skipPermissions: settingsState.get().skipPermissions,
  // PHASE 6 ADDITION:
  resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null,
});
```

### Fix for resumeSession termData (TerminalManager.js line 2683)

```js
// CURRENT (missing mode and cwd):
const termData = {
  terminal, fitAddon, project, projectIndex,
  name: t('terminals.resuming'),
  status: 'working',
  inputBuffer: '',
  isBasic: false
};

// FIXED (add mode and cwd so saveTerminalSessionsImmediate includes these terminals):
const termData = {
  terminal, fitAddon, project, projectIndex,
  name: t('terminals.resuming'),
  status: 'working',
  inputBuffer: '',
  isBasic: false,
  mode: 'terminal',              // ADD: required by save filter
  cwd: project.path              // ADD: required by session persistence
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No session resume | `claude --resume <id>` via PTY | Already existed before Phase 4 (implemented in `TerminalService.js`) | The main process already knows how to resume; Phase 6 only adds the persistence and wiring |
| Manual resume via session panel | Automatic resume on restart | This phase | User never needs to browse session list after a restart — it just works |
| SESSION_START events fire but are only used for time tracking + notifications | SESSION_START also captures session ID for persistence | This phase | EventBus gains a new consumer that is persistence-focused |

**Deprecated/outdated:**
- None — this is a new feature extension of Phase 4 infrastructure.

---

## Open Questions

1. **Watchdog timeout threshold: 5 seconds?**
   - What we know: Claude with a valid `--resume` session typically emits output within 1-2 seconds on a normal machine. An invalid session exits within ~1s. Windows uses `cmd.exe /c claude --resume <id>` which exits immediately when the claude process exits.
   - What's unclear: Whether very slow machines (low RAM, slow SSD) might have legitimate Claude starts that take >5 seconds before first output.
   - Recommendation: 5 seconds. If it proves too short in practice, it's a one-line config constant change. Better to fail fast than make users wait 30 seconds to see a fallback.

2. **Terminal ID correlation — should we store a correlated terminal identifier at creation time?**
   - What we know: The "latest terminal ID" heuristic works correctly for the common case (one Claude terminal per project). Multi-terminal same-project with simultaneous sessions is an edge case.
   - What's unclear: How often users run multiple Claude terminals simultaneously on the same project.
   - Recommendation: Ship with the heuristic. Add a `// TODO: improve correlation for multi-terminal same-project` comment. Do not over-engineer for an edge case.

3. **Should resumeSession() (for the sessions panel) also use createTerminal() instead of its own PTY spawn?**
   - What we know: `resumeSession()` has its own PTY spawn logic duplicating most of `createTerminal()`. Fixing the `mode` and `cwd` fields (Pitfall 6 above) is a simpler fix than merging the two functions.
   - Recommendation: Fix only `mode` and `cwd` in `resumeSession()`'s `termData`. Do not attempt to merge `resumeSession()` and `createTerminal()` in this phase — that is a refactor scope expansion.

4. **What happens if the user is using ScrapingProvider (hooks disabled)?**
   - What we know: No session IDs are captured. `claudeSessionId` remains `null` for all tabs. Restore loop passes `null`, which `createTerminal` ignores (no `--resume`). Fresh sessions start as before Phase 6.
   - Recommendation: This is acceptable and requires no special handling. Hooks-disabled users get Phase 4 behavior (tab restore without session resume).

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` — section omitted.

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `src/main/services/TerminalService.js` lines 43-76, 131-145 — confirmed `resumeSessionId` is fully implemented for both Windows (cmd.exe /c) and non-Windows (PTY stdin write) paths
- Codebase inspection: `src/main/ipc/terminal.ipc.js` line 14 — confirmed `resumeSessionId` passes through IPC
- Codebase inspection: `src/main/preload.js` line 81 — confirmed preload bridge passes all params via `ipcRenderer.invoke('terminal-create', params)`
- Codebase inspection: `src/renderer/ui/components/TerminalManager.js` lines 1183-1248 — verified `createTerminal()` does NOT currently destructure or forward `resumeSessionId`; this is the primary code gap
- Codebase inspection: `src/renderer/ui/components/TerminalManager.js` lines 2638-2728 — verified `resumeSession()` exists and correctly passes `resumeSessionId` to `api.terminal.create()`; also confirmed `termData` is missing `mode` and `cwd` (Pitfall 6)
- Codebase inspection: `src/renderer/events/HooksProvider.js` lines 100-109 — confirmed `SessionStart` hook populates `stdin.session_id` → emitted as `data.sessionId` in SESSION_START event; also confirmed resolution is by `cwd`→`projectId`, not terminal ID
- Codebase inspection: `src/renderer/events/ClaudeEventBus.js` — confirmed `EVENT_TYPES.SESSION_START = 'session:start'` and event envelope shape
- Codebase inspection: `src/renderer/events/index.js` — confirmed consumer wiring pattern; confirmed `wireSessionIdCapture()` can be added alongside existing consumers
- Codebase inspection: `src/renderer/services/TerminalSessionService.js` — confirmed current tab shape (`{ cwd, isBasic }`), confirmed `claudeSessionId` field is absent and must be added
- Codebase inspection: `renderer.js` lines 162-209 — confirmed Phase 4 restore loop structure; confirmed insertion point for `resumeSessionId` option
- Codebase inspection: `src/renderer/events/ScrapingProvider.js` line 48 — confirmed `sessionId: null` for scraping-sourced SESSION_START events

### Secondary (MEDIUM confidence)

- Pattern inference: The watchdog timer pattern (start timer, cancel on first data, fire fallback if timer expires) is a standard PTY/process-launch reliability pattern not explicitly present in codebase but consistent with existing timer usage (loadingTimeouts Map at line 1290).

### Tertiary (LOW confidence)

- None — all findings are from direct codebase inspection.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all components inspected directly in source; no new dependencies
- Architecture: HIGH — exact line numbers and function signatures verified
- Pitfalls: HIGH — derived from actual code gaps (missing `resumeSessionId` threading in `createTerminal`, missing `mode`/`cwd` in `resumeSession`'s termData) found by inspection

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (codebase patterns are stable; valid until major refactor of TerminalManager or events system)
