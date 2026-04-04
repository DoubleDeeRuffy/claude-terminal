# Phase 39: Fix empty pane disabled controls - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the state where opening a project with no open terminals causes the sessions/resume panel to overlap the top action bar buttons (resume, +, changes, branch) or leaves them disabled/non-functional. The fix is CSS-only — no DOM restructuring.

</domain>

<decisions>
## Implementation Decisions

### Button state in empty terminal view
- **D-01:** All buttons in `#terminals-filter` stay enabled when a project is selected but has no terminals — git operations (pull, push, changes, branch) work at the project level, not the terminal level.
- **D-02:** Only the "resume session" lightbulb button and "new terminal" (+) button are terminal-dependent — but even these should remain clickable (resume opens session picker, + creates a new terminal).

### Sessions panel overlap fix
- **D-03:** CSS-only fix — ensure `#empty-terminals` respects the flex layout of `.terminals-panel` and doesn't overflow into `.terminals-header`. No DOM restructuring, no z-index hacks.
- **D-04:** The `.sessions-panel` inside `#empty-terminals` uses `height: 100%` which can cause overflow. Fix must ensure the empty state container stays within its flex-allocated space.

### Claude's Discretion
- Specific CSS properties to adjust (overflow, flex sizing, height constraints) — whatever makes the layout correct without side effects.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Layout & structure
- `index.html` lines 329-417 — `.terminals-panel` → `.terminals-header` → `#terminals-filter` (action buttons) and `#empty-terminals` (sessions panel container)
- `styles/terminal.css` lines 10-28 — `.terminals-panel`, `.terminals-header` flex layout
- `styles/terminal.css` lines 56-61 — `.terminals-filter` styles
- `styles/terminal.css` lines 1152-1228 — `.empty-state` styles
- `styles/projects.css` lines 854-861 — `.sessions-panel` styles (width/height 100%, padding)

### Behavior
- `src/renderer/ui/components/TerminalManager.js` lines 2345-2497 — `filterByProject()` function, empty state rendering, `renderSessionsPanel()` call
- `src/renderer/ui/components/TerminalManager.js` lines 2888-2966 — `renderSessionsPanel()` function, sessions panel HTML generation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `filterByProject()` already handles the empty state case (line 2466-2489) — shows `#empty-terminals` with `display: flex` and calls `renderSessionsPanel()`
- `.empty-state` CSS class provides centered flex layout with `height: 100%`

### Established Patterns
- `.terminals-panel` is a flex column container: header (fixed) + split-pane-area/empty-state (flex: 1)
- `#empty-terminals` toggles between `display: none` and `display: flex`
- Sessions panel is rendered as innerHTML of `#empty-terminals`, replacing the empty-state centered layout with a full `.sessions-panel`

### Integration Points
- The `#terminals-filter` bar visibility is controlled in `filterByProject()` — `filterIndicator.style.display = 'flex'` when project selected
- Button enable/disable logic may be tied to `setActiveTerminalState(null)` called at line 2489 when no terminals visible
- Git action buttons in `#filter-git-actions` have their own visibility toggle (`style="display: none"` in HTML)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard CSS flex layout fix to keep the sessions panel contained within its allocated space.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 39-fix-empty-pane-disabled-controls*
*Context gathered: 2026-04-04*
