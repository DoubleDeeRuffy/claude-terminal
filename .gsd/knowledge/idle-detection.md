# Idle Detection & Heartbeat Systems

Three independent systems track activity and idle state. They share no state and can disagree — a tab can be visually "working" while time tracking has already idled it out.

## System 1: Time Tracking Heartbeat (`src/renderer/state/timeTracking.state.js`)

**Purpose:** Track per-project and global working time for the dashboard.

### How it works
- Single entry point: `heartbeat(projectId, source)` records activity per project.
- Runtime state: `trackingState.activeProjects` — a `Map<projectId, { startedAt, lastHeartbeat, source }>`.
- A 10-second `tick()` interval checks each active project: if `now - lastHeartbeat > idleTimeout`, the project session is finalized and removed from `activeProjects`.
- Default idle timeout: **120 seconds** (configurable via `settings.idleTimeout`).
- 1-second throttle per project (ignores rapid heartbeats).

### What triggers heartbeats
| Trigger | Location | When |
|---------|----------|------|
| Terminal creation | `TerminalManager.js:1761, 2083, 3328, 4232` | Once at terminal/chat creation |
| User keyboard input | `TerminalManager.js:1899, 3393, 4491` | Every keypress in `terminal.onData()` |
| Tab switch (project change) | `TerminalManager.js:1479` | When active terminal changes to a different project |

### What does NOT trigger heartbeats
- Terminal PTY output (Claude printing text) does **not** call `heartbeat()` — only `claudeHeartbeat()`.
- Hook events (SESSION_START, TOOL_START, etc.) do **not** call `heartbeat()` — only `claudeHeartbeat()`.

### Idle flow
1. `tick()` runs every 10s.
2. For each active project, checks `now - info.lastHeartbeat > getIdleTimeout()`.
3. If idle: finalizes session (saves duration), deletes from `activeProjects`.
4. If all projects idle: finalizes global session too.
5. Also handles sleep/wake detection (gap > 30s between ticks) and midnight rollover.

---

## System 2: Claude Activity (`src/renderer/state/claudeActivity.state.js`)

**Purpose:** Track whether Claude is actively producing output in each terminal (used by close-warning and UI indicators).

### How it works
- Per-terminal map: `activityMap = Map<terminalId, { lastActivity: number }>`.
- `claudeHeartbeat(terminalId)` records a timestamp (1-second throttle).
- `isClaudeActive(terminalId)` returns `true` if `now - lastActivity < 15 seconds`.
- No periodic cleanup — entries persist until `removeClaudeTerminal(id)` is called on tab close.

### What triggers claudeHeartbeat
| Trigger | Location | When |
|---------|----------|------|
| PTY output data | `TerminalManager.js:1856, 3377, 4478` | Every IPC data chunk written to terminal |
| Hook: SESSION_START | `events/index.js:37` | When hooks provider reports session start |
| Hook: TOOL_START | `events/index.js:44` | When hooks provider reports tool use start |
| Hook: TOOL_END | `events/index.js:49` | When hooks provider reports tool use end |
| Chat streaming | `ChatView.js:2870` | During chat message streaming |

### Key detail
This system tracks per-**terminal** (not per-project), while time tracking tracks per-**project**.

---

## System 3: Tab Visual Status (`TerminalManager.js` + `events/index.js`)

**Purpose:** Show the colored dot on terminal tabs (working/ready/loading).

### How status is set to "working"
| Source | Location | When |
|--------|----------|------|
| User presses Enter | `TerminalManager.js:1902, 3396, 4494` | On `\r` or `\n` in `terminal.onData()` |
| Hook: CLAUDE_WORKING | `events/index.js:332` via `wireTerminalStatusConsumer()` | PreToolUse hook event |
| Scraping detection | Various places in TerminalManager | When scraping detects Claude output patterns |

### How status is set to "ready"
| Source | Location | When |
|--------|----------|------|
| Hook: SESSION_END | `events/index.js:344` via `wireTerminalStatusConsumer()` | Stop or SessionEnd hook event |
| Scraping "done" | `updateTerminalStatus()` via scraping callback | When scraping detects idle prompt |

### BUG: No timeout fallback
The tab status system has **no staleness/timeout mechanism**. If a `SESSION_END` or `Stop` hook event is lost or never emitted (Claude hangs, hook HTTP server misses event, session stuck), the tab stays `status-working` **forever**.

The close-warning system (`events/index.js:486-494`) checks `td.status === 'working'` — so a stuck-working tab will also trigger false close warnings.

---

## How the three systems interact (or don't)

```
Terminal Output (PTY data)
  └─> claudeHeartbeat(terminalId)     [System 2: 15s Claude activity]
  └─> (does NOT call heartbeat())     [System 1: NOT triggered]

User Input (keyboard)
  └─> heartbeat(projectId, 'terminal') [System 1: time tracking]
  └─> updateTerminalStatus('working')  [System 3: visual status]

Hook Events (SESSION_START, TOOL_START, TOOL_END)
  └─> claudeHeartbeat(terminalId)     [System 2: Claude activity]
  └─> updateTerminalStatus('working')  [System 3: visual status on CLAUDE_WORKING]
  └─> (does NOT call heartbeat())     [System 1: NOT triggered]

Hook Events (SESSION_END, Stop)
  └─> updateTerminalStatus('ready')   [System 3: visual status]
  └─> (does NOT affect Systems 1 or 2)
```

---

## Known Bug: Tabs stuck in "working" state

**Symptom:** Tabs show "working" status for 30+ minutes even though Claude is idle.

**Root cause:** System 3 (tab visual status) depends entirely on explicit events to transition back to "ready". If the `SESSION_END`/`Stop` event is never received, there is no fallback timeout.

**Why System 2 doesn't help:** `claudeActivity.state.js` correctly tracks a 15s idle timeout per terminal, but nothing consumes `isClaudeActive()` to reset tab status. The function exists but is only used for:
- Close-warning activity check (`events/index.js:486-494`) — but that checks `td.status === 'working'`, not `isClaudeActive()`.

**Fix applied:** Staleness check in `events/index.js` — `startStatusStalenessCheck()`:
- Runs every 10 seconds via `setInterval`.
- Iterates all terminals; for each with `status === 'working'`:
  - Reads `claudeActivity.state.getClaudeActivityState()` to get `lastActivity` timestamp.
  - If `now - lastActivity > 60 seconds`, resets tab status to "ready".
- 60-second threshold chosen as compromise: long enough to tolerate brief gaps between tool calls, short enough to catch truly stuck tabs within ~1 minute.
- Also hardened the close-warning handler (`onCheckClaudeActivity`) to require **both** `td.status === 'working'` AND `isClaudeActive(id)` — prevents false close warnings from stale tabs.

**Remaining potential improvements (not yet implemented):**
- Wire `claudeHeartbeat` into the time tracking `heartbeat` as well, so Claude output keeps time tracking alive (separate concern but related gap).

---

## File Reference

| File | System | Key functions |
|------|--------|---------------|
| `src/renderer/state/timeTracking.state.js` | Time Tracking | `heartbeat()`, `tick()`, `stopProject()` |
| `src/renderer/state/claudeActivity.state.js` | Claude Activity | `claudeHeartbeat()`, `isClaudeActive()` |
| `src/renderer/ui/components/TerminalManager.js` | Tab Status + triggers | `updateTerminalStatus()`, IPC data handlers, `onData()` |
| `src/renderer/events/index.js` | Event consumers | `wireTerminalStatusConsumer()`, `wireClaudeActivityConsumer()` |
| `src/renderer/events/HooksProvider.js` | Hook event source | `handleHookEvent()` |
| `src/renderer/events/ScrapingProvider.js` | Scraping event source | `handleScrapingEvent()` |
