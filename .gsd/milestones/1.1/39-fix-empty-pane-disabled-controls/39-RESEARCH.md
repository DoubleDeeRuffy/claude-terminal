# Phase 39: Fix empty pane disabled controls - Research

**Researched:** 2026-04-04
**Domain:** CSS flex layout, Electron renderer DOM
**Confidence:** HIGH

## Summary

The bug manifests when a project is selected but has no open terminals. The `#empty-terminals` div (`.empty-state` class) uses `height: 100%` which, in a flex column parent, can cause it to overflow beyond its allocated space and visually overlap the `.terminals-header` bar containing the action buttons. Additionally, when `renderSessionsPanel()` replaces the empty state content with a `.sessions-panel` div (also `height: 100%; width: 100%`), the overflow worsens because the sessions panel has padding and its own flex layout.

The root cause is a CSS sizing conflict: `.empty-state` uses `height: 100%` (percentage of parent) rather than participating in the flex layout via `flex: 1`. Since `.terminals-panel` is a flex column, the correct approach is `flex: 1; min-height: 0; overflow: hidden` on `#empty-terminals` when visible, which constrains it to the remaining space after the header.

**Primary recommendation:** Replace `height: 100%` on `.empty-state` with flex-based sizing when it's a direct child of `.terminals-panel`, and ensure `.sessions-panel` uses `flex: 1; min-height: 0` instead of `height: 100%`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** All buttons in `#terminals-filter` stay enabled when a project is selected but has no terminals -- git operations (pull, push, changes, branch) work at the project level, not the terminal level.
- **D-02:** Only the "resume session" lightbulb button and "new terminal" (+) button are terminal-dependent -- but even these should remain clickable (resume opens session picker, + creates a new terminal).
- **D-03:** CSS-only fix -- ensure `#empty-terminals` respects the flex layout of `.terminals-panel` and doesn't overflow into `.terminals-header`. No DOM restructuring, no z-index hacks.
- **D-04:** The `.sessions-panel` inside `#empty-terminals` uses `height: 100%` which can cause overflow. Fix must ensure the empty state container stays within its flex-allocated space.

### Claude's Discretion
- Specific CSS properties to adjust (overflow, flex sizing, height constraints) -- whatever makes the layout correct without side effects.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

## Architecture Patterns

### DOM Structure (`.terminals-panel` flex column)

```
.terminals-panel                    ← flex: 1; display: flex; flex-direction: column; overflow: hidden
  .terminals-header                 ← display: flex; align-items: center; min-height: 36px (when filter visible)
    .btn-toggle-explorer
    #terminals-filter               ← display: none|flex; contains all action buttons
      .filter-project               ← project name
      #btn-resume-session           ← lightbulb resume button
      #btn-new-terminal             ← + button
      #filter-ci-pill
      #filter-git-actions           ← display: none|flex; pull/push/changes/branch
      #actions-dropdown-wrapper
      #prompts-dropdown-wrapper
      #btn-show-all                 ← X close filter
    #git-changes-panel
  .ci-status-bar                    ← display: none (usually)
  #split-pane-area                  ← terminal panes (hidden when empty)
  #empty-terminals                  ← class="empty-state"; display: none|flex
    [innerHTML replaced by renderSessionsPanel()]
  .project-detail-view
```

### Current CSS (the problem)

```css
/* terminal.css lines 9-14 */
.terminals-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* terminal.css lines 1152-1163 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;          /* <-- THE PROBLEM: % height in flex child */
  color: var(--text-muted);
  gap: 12px;
  padding: 40px;
  text-align: center;
}

/* projects.css lines 854-861 */
.sessions-panel {
  width: 100%;
  height: 100%;          /* <-- ALSO PROBLEMATIC: inherits the overflow */
  display: flex;
  flex-direction: column;
  padding: 24px 28px;
  overflow: hidden;
}
```

### Fix Pattern

The `.empty-state` class is used generically in multiple places, so the fix should target `#empty-terminals` specifically (or `.terminals-panel > .empty-state`):

**Fix 1 -- `#empty-terminals` flex sizing:**
```css
/* In terminal.css, after .empty-state rules */
#empty-terminals {
  flex: 1;
  min-height: 0;
  overflow: hidden;   /* or overflow-y: auto if scrolling desired */
  height: auto;       /* override .empty-state height: 100% */
}
```

**Fix 2 -- `.sessions-panel` height:**
```css
/* In projects.css */
.sessions-panel {
  /* Change from: */
  /* height: 100%; */
  /* To: */
  flex: 1;
  min-height: 0;
}
```

The `flex: 1; min-height: 0` pattern is the standard CSS solution for "fill remaining space in a flex column without overflowing." The `min-height: 0` override is necessary because flex items default to `min-height: auto` which prevents them from shrinking below their content size.

### Button Enable/Disable Analysis

The git action buttons (`#filter-git-actions`) are controlled by `showFilterGitActions()` / `hideFilterGitActions()` in `renderer.js`. These are triggered by a `projectsState.subscribe()` handler (renderer.js ~line 4194) that reacts to `selectedProjectFilter` changes:

- **When project selected:** `showFilterGitActions(projectId)` sets `filterGitActions.style.display = 'flex'` (if git repo)
- **When project deselected:** `hideFilterGitActions()` sets `filterGitActions.style.display = 'none'`

This flow is **independent of terminal existence** -- it depends only on the project having a git repo status. So per D-01, the git buttons should already be enabled. The "disabled" appearance is likely a visual overlap issue (the sessions panel covering the buttons), not an actual `disabled` attribute.

The resume session button (`#btn-resume-session`) reads `projectsState.get().selectedProjectFilter` -- it works project-level, not terminal-level. Per D-02, no changes needed to its click handler.

### Flow When Project Selected With No Terminals

1. `filterByProject(projectIndex)` called
2. `filterIndicator.style.display = 'flex'` -- shows the header bar
3. Terminal loop finds `visibleCount === 0`
4. `emptyState.style.display = 'flex'` -- shows `#empty-terminals`
5. `renderSessionsPanel(project, emptyState)` -- replaces innerHTML with sessions panel
6. `setActiveTerminalState(null)` -- sets active terminal to null
7. Separately, `projectsState.subscribe()` fires `showFilterGitActions(projectId)` -- shows git buttons

The overlap happens at step 4-5: the `#empty-terminals` div with `height: 100%` can extend beyond its flex-allocated area, visually covering the header.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flex overflow containment | Manual height calculations in JS | `flex: 1; min-height: 0` CSS pattern | Standard CSS flex behavior, no JS overhead |
| Scoped CSS override | Modifying the generic `.empty-state` class | `#empty-terminals` or `.terminals-panel > .empty-state` selector | Avoids breaking other empty states in the app |

## Common Pitfalls

### Pitfall 1: Modifying `.empty-state` globally
**What goes wrong:** The `.empty-state` class is used in multiple places (e.g., file explorer, other panels). Changing `height: 100%` to `flex: 1` globally could break those other usages.
**Why it happens:** `.empty-state` is a shared utility class.
**How to avoid:** Use `#empty-terminals` ID selector or `.terminals-panel > .empty-state` to scope the override.
**Warning signs:** Other panels with empty states looking wrong after the change.

### Pitfall 2: Forgetting `min-height: 0`
**What goes wrong:** Setting `flex: 1` without `min-height: 0` doesn't fully solve the overflow because flex items have an implicit `min-height: auto` that prevents shrinking below content size.
**Why it happens:** Common CSS flex gotcha -- the spec defaults `min-height` to `auto` for flex items.
**How to avoid:** Always pair `flex: 1` with `min-height: 0` in flex column children that need to shrink.
**Warning signs:** Content still overflowing despite `flex: 1`.

### Pitfall 3: Breaking the centered empty state (no sessions)
**What goes wrong:** When a project has no sessions, the empty state shows a centered icon + text. If we remove `height: 100%` and only use `flex: 1`, the centering via `justify-content: center` still works because `flex: 1` gives the element the full remaining height.
**Why it happens:** `justify-content: center` works on the flex container's cross axis only when the container has height.
**How to avoid:** `flex: 1` gives the container height from the flex layout, so centering works. Verify both states: with sessions (scrollable list) and without sessions (centered empty message).

### Pitfall 4: Sessions list not scrollable
**What goes wrong:** The sessions list inside `.sessions-panel` needs to be scrollable when there are many sessions. If we set `overflow: hidden` on `#empty-terminals`, the inner `.sessions-list` must handle its own scrolling.
**Why it happens:** Nested overflow containment.
**How to avoid:** Ensure `.sessions-list` has `overflow-y: auto; flex: 1; min-height: 0` so it scrolls within the contained space.

## Code Examples

### Fix for `#empty-terminals` overflow (terminal.css)

```css
/* Source: CSS flex layout spec - flex item sizing */
/* Add after .empty-state rules (~line 1228) */
#empty-terminals {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  height: auto;  /* override .empty-state height: 100% */
}
```

### Fix for `.sessions-panel` height (projects.css)

```css
/* Source: existing .sessions-panel at line 854 */
.sessions-panel {
  width: 100%;
  /* height: 100%;  -- REMOVE this */
  flex: 1;          /* -- ADD: fill available space */
  min-height: 0;    /* -- ADD: allow shrinking */
  display: flex;
  flex-direction: column;
  padding: 24px 28px;
  overflow: hidden;
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with jsdom |
| Config file | `package.json` jest section |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-03 | Empty state stays within flex-allocated space | manual | Visual inspection in running app | N/A |
| D-04 | Sessions panel doesn't overflow | manual | Visual inspection in running app | N/A |
| D-01 | Git buttons stay enabled | manual | Visual inspection -- click pull/push/changes/branch with no terminals | N/A |
| D-02 | Resume + new terminal buttons clickable | manual | Visual inspection -- click lightbulb and + with no terminals | N/A |

### Sampling Rate
- **Per task commit:** `npm test` (ensure no regressions)
- **Per wave merge:** `npm test && npm run build:renderer`
- **Phase gate:** Visual verification in running app + full test suite green

### Wave 0 Gaps
None -- this is a CSS-only fix with no testable code logic. All validation is visual/manual.

## Sources

### Primary (HIGH confidence)
- `index.html` lines 329-499 -- DOM structure of `.terminals-panel`
- `styles/terminal.css` lines 9-14, 56-65, 1152-1228 -- flex layout and empty state styles
- `styles/projects.css` lines 854-861 -- `.sessions-panel` styles
- `src/renderer/ui/components/TerminalManager.js` lines 2345-2497 -- `filterByProject()` logic
- `renderer.js` lines 3776-3890 -- git action button show/hide logic

### Secondary (MEDIUM confidence)
- CSS Flexbox spec: `min-height: 0` override for flex items is well-documented standard behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - CSS-only fix, no libraries involved
- Architecture: HIGH - Full DOM/CSS chain traced through source code
- Pitfalls: HIGH - Common CSS flex gotchas, verified against actual codebase structure

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- CSS layout patterns don't change)
