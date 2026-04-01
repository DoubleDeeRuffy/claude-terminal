# Phase 8: Rename App Title to current selected project - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

When the user switches projects, update the Electron window title to reflect the currently selected project. This makes the active project visible in the Windows taskbar, enabling external time-tracking tools to detect project switches. Controlled by a toggle in settings.

</domain>

<decisions>
## Implementation Decisions

### Title format
- Format: `Claude Terminal - {Project Display Name}`
- Use the project's custom display name (falls back to folder name if no custom name is set)
- When no project is selected (All Projects view or app startup with no project): show just `Claude Terminal`
- Substring matching is sufficient for external time trackers — no special formatting needed

### Settings toggle
- Setting name: "Update window title on project switch" (or similar)
- Default: **enabled** out of the box
- Location: General section of the Settings panel
- When disabled: window title stays as `Claude Terminal` regardless of project selection

### Trigger timing
- Title updates when `selectedProjectFilter` changes (clicking a project in the sidebar)
- Deselecting a project (clicking "All Projects" / clearing filter) reverts title to `Claude Terminal`
- Terminal tab focus changes do NOT trigger a title update — only the project filter matters

### Claude's Discretion
- Exact setting label and description wording
- Implementation approach (main process vs renderer title update)
- Whether to persist the title across app restarts (follows from selectedProjectFilter restore in Phase 4)

</decisions>

<specifics>
## Specific Ideas

- Primary use case: external time-tracking app reads the Windows taskbar window title to detect which project is active
- Every project switch should produce a distinct, readable title in the taskbar

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 8-rename-app-title-to-current-selected-project*
*Context gathered: 2026-02-25*
