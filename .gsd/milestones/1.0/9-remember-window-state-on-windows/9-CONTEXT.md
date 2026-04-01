# Phase 9: Remember Window State On Windows - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist and restore the Electron window's position, size, and maximized state across app restarts on Windows. The window should reappear exactly where the user left it, including on multi-monitor setups.

</domain>

<decisions>
## Implementation Decisions

### Restore scope
- Persist: x, y, width, height, isMaximized
- No fullscreen state tracking
- When closed maximized, restore as maximized — the saved normal bounds are used when the user un-maximizes
- Track both maximized state AND the pre-maximized normal bounds separately

### Multi-monitor handling
- Save absolute screen coordinates plus a monitor identifier
- If saved monitor is available on startup, restore window to that monitor
- If saved monitor is disconnected, center on primary monitor at default size
- If saved position is off-screen (e.g., resolution changed), reset to center on primary monitor — no partial clamping, full reset

### Default / first-launch behavior
- First launch: keep current defaults (1400x900, centered)
- Persistence kicks in after first user interaction with the window
- No reset button or shortcut — manual resize or data file deletion suffices

### Persistence timing
- Debounced save on every move/resize event (crash-resilient)
- Also save on close as a final checkpoint
- Store in existing `~/.claude-terminal/settings.json` under a `windowState` key

### Claude's Discretion
- Debounce interval for move/resize saves
- Monitor identification strategy (display ID, bounds hash, etc.)
- Atomic write pattern (consistent with existing codebase conventions)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing persistence patterns in the codebase (atomic writes, debounce conventions from settings/time tracking).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 9-remember-window-state-on-windows*
*Context gathered: 2026-02-25*
