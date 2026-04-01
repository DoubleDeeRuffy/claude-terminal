# Phase 35: Fix-Usage - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the usage display showing incorrect percentages. User reports Session 1%, Weekly 29%, Sonnet 0% when actual values are 41%, 34%, 0%. The display pipeline (API fetch → parse → render) has a bug somewhere.

</domain>

<decisions>
## Implementation Decisions

### Diagnosis
- Root cause unknown — could be API response parsing (decimal vs percentage), PTY regex scraping, stale cache, or field mapping
- Existing debug log (`[Usage] Raw API response:`) should be leveraged during investigation
- Fix whatever is found — no behavioral changes needed, just correct numbers

### Claude's Discretion
- Diagnosis approach and root cause identification
- Whether to improve logging for future debugging
- Any defensive parsing improvements discovered during fix

</decisions>

<specifics>
## Specific Ideas

No specific requirements — just make the numbers match reality.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `UsageService.js` (main process): OAuth API fetch + PTY fallback, 5min periodic refresh
- `renderer.js:4230-4430`: Usage display with bars, percentages, reset countdowns
- `usage.ipc.js`: IPC bridge (get-usage-data, refresh-usage, start/stop-monitor)

### Established Patterns
- API maps: `five_hour.utilization` → session, `seven_day.utilization` → weekly, `seven_day_sonnet.utilization` → sonnet
- `updateUsageBar()` does `Math.round(percent)` — if API returns decimals (0.41), this rounds to 0
- PTY fallback uses regex to scrape `/usage` command output

### Integration Points
- `preload.js:389-394`: `electron_api.usage` namespace
- `renderer.js:4414-4430`: Click-to-refresh, 60s monitor, 5s cache poll

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 35-fix-usage*
*Context gathered: 2026-03-08*
