# Phase 15: Remember Projects Width Across App Restarts - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix and unify panel width persistence so both the projects panel and file explorer panel widths survive app restarts. The projects panel already saves to settings.json but restore is broken; the file explorer uses localStorage which doesn't survive reinstalls. Both need to reliably save and restore via settings.json.

</domain>

<decisions>
## Implementation Decisions

### Resize interaction
- Both projects panel and file explorer already have drag-to-resize handles — no new resize UI needed
- Existing min/max constraints on the drag handles are sufficient — no additional bounds needed
- Saved widths must be applied before first paint (no visual jump on startup)

### Persistence scope
- Global widths (same for all projects), not per-project
- Both panels persist to settings.json (settingsState)
- Projects panel: already uses `projectsPanelWidth` in settingsState — but save/restore may be broken (needs investigation)
- File explorer: currently uses `localStorage.setItem('file-explorer-width')` — migrate to settingsState as `fileExplorerWidth`
- Clean up old localStorage key (`file-explorer-width`) after migration to settings.json

### Bug investigation
- The existing `projectsPanelWidth` save/restore is reportedly not working across restarts — could be race condition or a bug
- Research phase must investigate: is the value being saved? Is it being read too early? Is something overwriting it?
- Fix whatever is broken so both panels reliably restore their widths

### Default & reset behavior
- Manual drag only — no double-click-to-reset or other reset mechanism
- Default widths come from CSS (existing behavior)

### Claude's Discretion
- Migration strategy for localStorage → settings.json (one-time migration read + cleanup)
- Exact timing of width restoration in the initialization flow
- Whether to debounce width saves during drag (performance consideration)

</decisions>

<specifics>
## Specific Ideas

- Follow the same pattern as Phase 9 (window state persistence) — save on change, restore early on startup
- The projects panel save already calls `saveSettings()` after `setProp` — verify this actually writes to disk

</specifics>

<deferred>
## Deferred Ideas

- Remember Notification State with a toggleable Setting in Settings > General > System "Remember Notification State" — user wants this as Phase 15.1

</deferred>

---

*Phase: 15-remember-projects-width-accross-app-restarts*
*Context gathered: 2026-02-26*
