# Phase 29: Adjust Idle Recognition — Context

## Summary

Split the current single `heartbeat()` system into two independent mechanisms:
1. **User heartbeat** — time tracking per project (persisted)
2. **Claude heartbeat** — terminal activity status (runtime only)

## Decisions

### 1. User Heartbeat (Time Tracking)

**Scope:** Active project only — one project tracked at a time.

**Sources (keep):**
- User keystrokes (terminal input)
- Mouse activity / tab interaction
- Chat message sends
- Any user-initiated interaction

**Sources (remove from time tracking):**
- Terminal output (Claude writing)
- Hook events (SESSION_START, TOOL_START, TOOL_END)
- Chat streaming output (trackOutputActivity)

**Behavior:**
- Switch project focus → immediately stop old project timer, start new
- User goes idle (no interaction for configurable timeout) → stop timer
- Only the focused/active project accumulates time
- Persisted to disk as sessions (existing session storage)

**Settings dropdown values:** 15s, 30s, 1min, 2min, 3min, 5min, 10min

**Tick interval:** 10 seconds (down from 60s)

**Sleep gap threshold:** Needs adjustment — with 10s tick, ~30s is reasonable (3 missed ticks)

**No session merging.** Remove `mergeOrAppend` logic entirely. Each continuous activity block = one session. Gap between sessions = user was idle or switched projects.

### 2. Claude Heartbeat (Terminal Status)

**Scope:** Per-terminal. Each terminal independently tracked.

**Sources:**
- Terminal output (pty data coming from Claude)
- Hook events (TOOL_START, TOOL_END, SESSION_START, SESSION_END)
- Chat streaming output (trackOutputActivity)

**NOT sources:**
- User keystrokes
- Chat message sends

**Behavior:**
- Runtime state only — no persistence, no sessions saved
- Simple active/idle flag per terminal ID
- Idle timeout: short, fixed (not user-configurable — e.g., 15s or derived from same setting)
- Purpose: UI can show "Claude is working" / "Claude is idle" per terminal
- Terminal close → remove from tracking map

### 3. What Changes Where

| File | Change |
|------|--------|
| `timeTracking.state.js` | Refactor: user heartbeat for time tracking only. Remove terminal output as heartbeat source. Remove `mergeOrAppend`. Change tick to 10s. Adjust sleep gap. Add project-switch stop/start. |
| New: `claudeActivity.state.js` (or similar) | New module: per-terminal Claude active/idle tracking. Runtime Map only. |
| `TerminalManager.js` | Split heartbeat calls: user input → user heartbeat, terminal output → claude heartbeat. Add project-switch detection → stop/start user tracking. |
| `ChatView.js` | Split: send message → user heartbeat, streaming output → claude heartbeat. |
| `events/index.js` | Hook events → claude heartbeat only (not user time tracking). |
| `SettingsPanel.js` | Update dropdown: 15s, 30s, 1min, 2min, 3min, 5min, 10min. |
| `settings.state.js` | Update default idle timeout (maybe 2min still, or 1min). |
| `en.json` / `fr.json` | Update idle timeout option labels for seconds-based values. |

### 4. Deferred Ideas

- Per-terminal time tracking display in UI (not this phase — just the data model)
- Claude activity indicator/bulb in tab bar (separate phase, consumes claude heartbeat)

## Code Context

**Current heartbeat call sites (from codebase scan):**

User-input sites (→ user heartbeat):
- `TerminalManager.js:1651` — terminal onData (user typing)
- `TerminalManager.js:3100` — terminal onData (user typing, second create path)
- `TerminalManager.js:4193` — terminal onData (API console typing)
- `ChatView.js:1450` — chat send message

Terminal-output sites (→ claude heartbeat):
- `TerminalManager.js:1608` — terminal onOutput
- `TerminalManager.js:3084` — terminal onOutput (second create path)
- `TerminalManager.js:4180` — terminal onOutput (API console)
- `ChatView.js:2855` — trackOutputActivity (chat streaming)

Hook event sites (→ claude heartbeat):
- `events/index.js:36` — SESSION_START
- `events/index.js:44` — TOOL_START
- `events/index.js:48` — TOOL_END

Project-switch sites (→ stop old / start new user tracking):
- `TerminalManager.js:1254` — tab switch with different project
- Need to also detect active project changes via sidebar/project list clicks

**Key constants to change:**
- `TICK_INTERVAL`: 60000 → 10000
- `MERGE_GAP`: remove entirely
- `SLEEP_GAP`: 120000 → ~30000
- `HEARTBEAT_THROTTLE`: 1000 (keep for both systems)
- `getIdleTimeout()`: update to support seconds-based values
