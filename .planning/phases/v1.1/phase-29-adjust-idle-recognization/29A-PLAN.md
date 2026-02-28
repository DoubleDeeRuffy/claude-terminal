# Phase 29: Adjust Idle Recognition — Plan

## Plan 29A: Split heartbeat into user time-tracking and Claude activity systems

**Goal:** Separate the single `heartbeat()` system into two: a user heartbeat for time tracking (persisted, per-project) and a Claude heartbeat for terminal activity status (runtime only, per-terminal). Update idle timeout from minute-based to second-based options.

**Scope:** 1 new file, 8 modified files. Refactor + feature change.

---

### Task 1: Create claudeActivity.state.js — per-terminal Claude activity tracking

**New file:** `src/renderer/state/claudeActivity.state.js`

**Purpose:** Track whether Claude is actively working in each terminal. Runtime only — no persistence.

```javascript
// State: Map<terminalId, { lastActivity: number }>
// Exports:
//   claudeHeartbeat(terminalId)   — record Claude activity for a terminal
//   isClaudeActive(terminalId)    — check if Claude is active (within timeout)
//   removeTerminal(terminalId)    — clean up when terminal closes
//   getClaudeActivityState()      — expose for debugging/UI
```

**Implementation:**
- Simple `Map` keyed by terminal ID
- `claudeHeartbeat(terminalId)` — set `lastActivity = Date.now()`, 1s throttle per terminal
- `isClaudeActive(terminalId)` — returns `true` if `now - lastActivity < CLAUDE_IDLE_TIMEOUT` (15 seconds fixed, not configurable)
- `removeTerminal(terminalId)` — delete from map on terminal close
- No tick loop needed — active status checked on-demand via `isClaudeActive()`
- No State class needed — plain Map + exported functions

---

### Task 2: Refactor timeTracking.state.js — user heartbeat only

**File:** `src/renderer/state/timeTracking.state.js`

**Changes:**

1. **Constants (lines 20-34):**
   - `getIdleTimeout()`: Change from `minutes * 60 * 1000` to `seconds * 1000` — the setting now stores seconds directly
   - `TICK_INTERVAL`: `60000` → `10000` (10 seconds)
   - `SLEEP_GAP`: `120000` → `30000` (30 seconds — 3× tick)
   - **Remove** `MERGE_GAP` constant entirely

2. **Remove `mergeOrAppend()` function** (lines 569-596):
   - Replace all calls to `mergeOrAppend(sessions, newSession)` with `sessions.push(newSession)`
   - Direct append — no merging, each activity block = one session

3. **Update `addSession()` (lines 544-567):**
   - Replace `mergeOrAppend(target.sessions, newSession)` with `target.sessions.push(newSession)` (2 occurrences: global and project)

4. **Update default idle timeout in `getIdleTimeout()` fallback:**
   - `getSetting('idleTimeout') || 2` → `getSetting('idleTimeout') || 120` (120 seconds = same 2min default)

**No API changes** — `heartbeat()`, `stopProject()`, and all other exports remain identical.

---

### Task 3: Update settings.state.js — idle timeout default

**File:** `src/renderer/state/settings.state.js`

**Change:**
- Line 44: `idleTimeout: 2` → `idleTimeout: 120` (seconds instead of minutes)

---

### Task 4: Wire claudeActivity into state/index.js

**File:** `src/renderer/state/index.js`

**Changes:**
- Import `claudeActivity` module: `const claudeActivityState = require('./claudeActivity.state');`
- Add spread to exports: `...claudeActivityState,`

---

### Task 5: Split heartbeat calls in TerminalManager.js

**File:** `src/renderer/ui/components/TerminalManager.js`

**Changes:**
- Add import: `const { claudeHeartbeat, removeTerminal: removeClaudeTerminal } = require('../../state');`

**Split user-input vs terminal-output heartbeats:**

**Project-switch stop/start (line 1306-1308):**
```javascript
// Before:
if (prevProjectId !== newProjectId) {
  if (newProjectId) heartbeat(newProjectId, 'terminal');
}

// After:
if (prevProjectId !== newProjectId) {
  if (prevProjectId) stopProject(prevProjectId);
  if (newProjectId) heartbeat(newProjectId, 'terminal');
}
```
This ensures the old project's timer stops immediately on tab switch, not just when it idles out.

**Split user-input vs terminal-output heartbeats:**

| Line | Current | Change |
|------|---------|--------|
| 1307 | `heartbeat(projId, 'terminal')` — tab switch | Keep as user heartbeat + add `stopProject(prevProjectId)` before (see above) |
| 1566 | `heartbeat(...)` — new terminal creation | Keep as user heartbeat |
| **1661** | `heartbeat(td.project.id, 'terminal')` — **terminal output** | → `claudeHeartbeat(id)` |
| 1704 | `heartbeat(td.project.id, 'terminal')` — user input | Keep as user heartbeat |
| 1888 | `heartbeat(...)` — FiveM console creation | Keep as user heartbeat |
| 3090 | `heartbeat(...)` — resume terminal creation | Keep as user heartbeat |
| **3139** | `heartbeat(td.project.id, 'terminal')` — **resume terminal output** | → `claudeHeartbeat(id)` |
| 3155 | `heartbeat(td.project.id, 'terminal')` — resume user input | Keep as user heartbeat |
| 3992 | `heartbeat(...)` — basic terminal creation | Keep as user heartbeat |
| **4239** | `heartbeat(td.project.id, 'terminal')` — **basic terminal output** | → `claudeHeartbeat(id)` |
| 4252 | `heartbeat(td.project.id, 'terminal')` — basic user input | Keep as user heartbeat |

**Note:** FiveM type console `onData` (line 1947) does NOT call `heartbeat()` — no change needed there.

**Terminal close cleanup:**
- In `closeTerminal()` function — add `removeClaudeTerminal(id)` call alongside existing `stopProject()` call

---

### Task 6: Split heartbeat calls in ChatView.js

**File:** `src/renderer/ui/components/ChatView.js`

**Changes:**
- Add import: `const { claudeHeartbeat } = require('../../state');`

| Line | Current | Change |
|------|---------|--------|
| 1450 | `heartbeat(project.id, 'chat')` — send message | Keep as user heartbeat |
| **2855** | `heartbeat(project.id, 'chat')` — `trackOutputActivity()` | → `claudeHeartbeat(terminalId)` |

The `terminalId` is available as a closure parameter of `createChatView()` (line 121: `const { terminalId = null, ... } = options`). It is in scope for `trackOutputActivity()` at line 2853.

---

### Task 7: Route hook events to Claude heartbeat only (events/index.js)

**File:** `src/renderer/events/index.js`

**Changes:**
- Add import: `const { claudeHeartbeat } = require('../state');`
- Terminal ID resolution: Hook events carry `e.projectId` but not `e.terminalId`. Use the existing `lastActiveClaudeTab` map (line 27) to resolve: `lastActiveClaudeTab.get(e.projectId)`. If no terminal found, skip the Claude heartbeat (no-op).

| Line | Current | Change |
|------|---------|--------|
| 36 | `heartbeat(e.projectId, 'hooks')` — SESSION_START | → resolve `terminalId` via `lastActiveClaudeTab.get(e.projectId)`, then `claudeHeartbeat(terminalId)` if found |
| 40 | `stopProject(e.projectId)` — SESSION_END | **Remove** — Claude session ending should NOT stop user time tracking (user may still be typing). User time tracking stops only via idle timeout or explicit project switch. |
| 44 | `heartbeat(e.projectId, 'hooks')` — TOOL_START | → same pattern: resolve terminal ID, `claudeHeartbeat(terminalId)` |
| 48 | `heartbeat(e.projectId, 'hooks')` — TOOL_END | → same pattern: resolve terminal ID, `claudeHeartbeat(terminalId)` |

**Implementation pattern for each hook:**
```javascript
const tid = lastActiveClaudeTab.get(e.projectId);
if (tid) claudeHeartbeat(tid);
```

---

### Task 8: Update SettingsPanel.js — seconds-based dropdown

**File:** `src/renderer/ui/panels/SettingsPanel.js`

**Changes:**

1. **Dropdown options (line 755):**
   - `[1, 2, 3, 5, 10, 15, 30]` → `[15, 30, 60, 120, 180, 300, 600]`
   - These are seconds: 15s, 30s, 1min, 2min, 3min, 5min, 10min

2. **Dropdown display (line 756):**
   - Replace `t('settings.idleTimeoutMinutes', { count: m })` with a formatting function:
   - Values < 60: show as `${s}s` (e.g., "15s", "30s")
   - Values >= 60: show as `${s/60} min` (e.g., "1 min", "2 min")
   - Use `t('settings.idleTimeoutSeconds', { count: s })` for <60, `t('settings.idleTimeoutMinutes', { count: s/60 })` for >=60

3. **Trigger display (line 753):**
   - Same formatting logic for the current value display

4. **Default value (line 751):**
   - `settings.idleTimeout || 2` → `settings.idleTimeout || 120`

---

### Task 9: Update i18n labels (en.json + fr.json)

**File:** `src/renderer/i18n/locales/en.json`

**Changes:**
- `"idleTimeoutDesc"`: `"Minutes of inactivity before time tracking pauses"` → `"Inactivity time before time tracking pauses"`
- Add `"idleTimeoutSeconds"`: `"{count}s"` (for values under 60)
- Keep `"idleTimeoutMinutes"`: `"{count} min"` (for values 60+)

**File:** `src/renderer/i18n/locales/fr.json`

**Changes:**
- `"idleTimeoutDesc"`: `"Minutes d'inactivité avant la pause du suivi du temps"` → `"Temps d'inactivité avant la pause du suivi du temps"`
- Add `"idleTimeoutSeconds"`: `"{count}s"`
- Keep `"idleTimeoutMinutes"`: `"{count} min"`

---

### Execution Order

1. **Task 1** — Create `claudeActivity.state.js` (no dependencies)
2. **Task 2** — Refactor `timeTracking.state.js` (no dependencies)
3. **Task 3** — Update `settings.state.js` default (no dependencies)
4. **Task 4** — Wire into `state/index.js` (depends on Task 1)
5. **Task 9** — Update i18n (no dependencies, do early)
6. **Task 5** — Split TerminalManager heartbeats (depends on Tasks 1, 4)
7. **Task 6** — Split ChatView heartbeats (depends on Tasks 1, 4)
8. **Task 7** — Route hook events (depends on Tasks 1, 4)
9. **Task 8** — Update SettingsPanel dropdown (depends on Task 3, 9)

Tasks 1-3 and 9 can run in parallel. Tasks 5-8 can run in parallel after Task 4.

### Files Modified

| File | Tasks | Changes |
|------|-------|---------|
| `src/renderer/state/claudeActivity.state.js` | 1 | **New** — per-terminal Claude activity tracking |
| `src/renderer/state/timeTracking.state.js` | 2 | Tick 10s, sleep gap 30s, remove mergeOrAppend, seconds-based idle timeout |
| `src/renderer/state/settings.state.js` | 3 | Default idleTimeout: 120 (seconds) |
| `src/renderer/state/index.js` | 4 | Export claudeActivity module |
| `src/renderer/ui/components/TerminalManager.js` | 5 | Split 3 output heartbeats → claudeHeartbeat, add terminal close cleanup |
| `src/renderer/ui/components/ChatView.js` | 6 | Split trackOutputActivity → claudeHeartbeat |
| `src/renderer/events/index.js` | 7 | Route TOOL_START/TOOL_END/SESSION_START → claudeHeartbeat |
| `src/renderer/ui/panels/SettingsPanel.js` | 8 | Seconds-based dropdown [15,30,60,120,180,300,600] |
| `src/renderer/i18n/locales/en.json` | 9 | Update desc, add idleTimeoutSeconds key |
| `src/renderer/i18n/locales/fr.json` | 9 | Update desc, add idleTimeoutSeconds key |

### Verification Checklist

- [ ] `npm test` passes
- [ ] `npm run build:renderer` succeeds
- [ ] Open terminal, type commands — time tracking accrues for the project
- [ ] Stop typing for >idle timeout — time tracking pauses (session ends)
- [ ] Resume typing — new session starts (no merge with old session)
- [ ] Claude running (output flowing) — does NOT extend user time tracking
- [ ] Switch projects via tab — old project stops, new project starts tracking
- [ ] Settings: idle timeout dropdown shows 15s, 30s, 1min, 2min, 3min, 5min, 10min
- [ ] Change idle timeout to 15s — tracking pauses after ~15s of inactivity
- [ ] Close terminal — Claude activity entry removed, project tracking stops
- [ ] App sleep/resume — sessions split correctly at sleep boundary
