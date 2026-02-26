# Phase 3: New Terminal Button - Research

**Researched:** 2026-02-24
**Domain:** Electron Renderer UI — HTML button insertion, CSS styling, click handler wiring
**Confidence:** HIGH

## Summary

This phase is purely a renderer-side UI change. No new libraries, no IPC changes, no main process involvement. The task is to add a "+" button inside the existing `terminals-filter` div (which already holds the project name badge above the tab strip), then wire its click handler to call the exact same function that Ctrl+T already invokes.

The full new-terminal call chain already exists and is well-tested: `createTerminalForProject(project)` in `renderer.js` calls `TerminalManager.createTerminal(project, { skipPermissions: ... })`. The button simply needs to invoke this with the currently-filtered project, which is always available when `terminals-filter` is visible (it only shows when a project is selected).

The button must appear **inside `terminals-filter`**, immediately after the project name badge (`filter-project` span) and before the git actions group. The `terminals-filter` div is `display: none` by default and becomes `display: flex` via `filterByProject()` in `TerminalManager.js` — so the button is automatically hidden when no project is selected and shown when one is.

**Primary recommendation:** Add `<button id="btn-new-terminal" class="filter-new-terminal-btn">` after `<span class="filter-project">` in `index.html`; wire `onclick` in `renderer.js` (near line 1426 where `btn-toggle-explorer` is wired); add `.filter-new-terminal-btn` styles in `terminal.css` matching the compact icon-button pattern already used in `terminals-filter`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TMGR-01 | User can create new terminal via button positioned after project name, above tab control | Button goes inside `.terminals-filter` after `.filter-project` span; calls existing `createTerminalForProject(project)` with the currently selected project |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla DOM | N/A | Button, event listener | No framework in this project — all UI is plain JS + HTML |
| Existing CSS variables | N/A | Theming | `--accent`, `--bg-hover`, `--text-secondary` already defined in `base.css` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | — | This is a pure HTML/CSS/JS change |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `id` wiring in `renderer.js` | Inline `onclick` attribute in HTML | `onclick` attribute would need global scope; `id`-based wiring in renderer.js is the established pattern in this codebase |

**Installation:**
No packages needed.

## Architecture Patterns

### Existing Pattern: Button Wiring in renderer.js

All buttons in `index.html` are wired in `renderer.js` using `document.getElementById(...).onclick = ...`. Examples at lines 1426-1429:

```javascript
// Source: renderer.js line 1426
const btnToggleExplorer = document.getElementById('btn-toggle-explorer');
if (btnToggleExplorer) {
  btnToggleExplorer.onclick = () => FileExplorer.toggle();
}
```

The new button MUST follow this same pattern.

### Pattern: New Terminal Creation for Currently-Selected Project

The tray's "Open Terminal" handler (renderer.js line 2990) shows the canonical pattern for creating a terminal for the currently-filtered project:

```javascript
// Source: renderer.js line 2990
api.tray.onOpenTerminal(() => {
  const selectedFilter = projectsState.get().selectedProjectFilter;
  const projects = projectsState.get().projects;
  if (selectedFilter !== null && projects[selectedFilter]) {
    createTerminalForProject(projects[selectedFilter]);
  } else if (projects.length > 0) {
    createTerminalForProject(projects[0]);
  }
});
```

The button click handler should use the simpler version (the button is only visible when a project IS selected, because `terminals-filter` is hidden otherwise):

```javascript
// Proposed handler
const btnNewTerminal = document.getElementById('btn-new-terminal');
if (btnNewTerminal) {
  btnNewTerminal.onclick = () => {
    const selectedFilter = projectsState.get().selectedProjectFilter;
    const projects = projectsState.get().projects;
    if (selectedFilter !== null && projects[selectedFilter]) {
      createTerminalForProject(projects[selectedFilter]);
    }
  };
}
```

### Placement: Inside terminals-filter, After Project Name Badge

The `terminals-filter` div in `index.html` (line 276) has this structure:

```html
<div class="terminals-filter" id="terminals-filter" style="display: none;">
  <span class="filter-project" id="filter-project-name"></span>

  <!-- NEW BUTTON GOES HERE -->

  <div class="filter-git-actions" id="filter-git-actions" style="display: none;">
    ...
  </div>
  <div class="actions-dropdown-wrapper" ...>...</div>
  <div class="prompts-dropdown-wrapper" ...>...</div>
  <button class="filter-clear" id="btn-show-all" ...>...</button>
</div>
```

The `filter-git-actions` group already has `margin-left: auto` applied via CSS (line 112 in `terminal.css`), so inserting a button before it will naturally place it right after the project name without breaking the right-aligned git buttons.

### CSS Pattern: Small Icon Buttons in terminals-filter

The existing `filter-clear` button (X to dismiss) uses a simple pattern. The `btn-toggle-explorer` and `btn-icon` (in `projects.css` line 117) share the common icon-button style. For the new "+" button, use a new class `.filter-new-terminal-btn` with dimensions matching the surrounding controls:

```css
/* In terminal.css — Pattern: compact icon buttons in terminals-filter */
.filter-new-terminal-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.filter-new-terminal-btn:hover {
  background: var(--accent-dim);
  color: var(--accent);
}

.filter-new-terminal-btn svg {
  width: 14px;
  height: 14px;
}
```

The "+" icon is a standard SVG cross: `<line x1="12" y1="5" x2="12" y2="19"/>` + `<line x1="5" y1="12" x2="19" y2="12"/>` with `stroke` styling.

### Anti-Patterns to Avoid
- **Placing the button outside `terminals-filter`:** The requirement says "after the project name" — this means inside the same flex row as the project name badge, not as a sibling element below it.
- **Using `margin-left: auto` on the new button:** This would right-align it. The button should be immediately after the project name, so no auto-margin.
- **Calling `TerminalManager.createTerminal()` directly instead of `createTerminalForProject()`:** `createTerminalForProject()` correctly passes `skipPermissions` from settings state; the raw call doesn't.
- **Wiring via inline `onclick` attribute in HTML:** The codebase pattern uses `getElementById + .onclick` in renderer.js, not inline attributes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal creation logic | Custom create-terminal code | `createTerminalForProject(project)` already in renderer.js | Full option handling (skipPermissions, etc.) |
| Project selection tracking | Custom state query | `projectsState.get().selectedProjectFilter` | Already maintained by state module |

**Key insight:** Every mechanism needed for this phase already exists. This is purely a UI plumbing task.

## Common Pitfalls

### Pitfall 1: Button Visible When No Project Selected
**What goes wrong:** If the button is placed outside `terminals-filter` (e.g., as a direct child of `terminals-header`), it will always be visible — even when no project is selected — and clicking it will silently do nothing.
**Why it happens:** `terminals-filter` is the only element with show/hide logic tied to project selection (managed by `filterByProject()` in TerminalManager.js line 1917-1931).
**How to avoid:** Place the button INSIDE `terminals-filter`. It automatically inherits the show/hide behavior.
**Warning signs:** Button visible on initial load before any project is selected.

### Pitfall 2: Breaking git-actions Right-Alignment
**What goes wrong:** `filter-git-actions` is right-aligned via `margin-left: auto` (terminal.css line 112). Inserting the new button incorrectly (e.g., after `filter-git-actions`) breaks the layout.
**Why it happens:** Flexbox auto-margins work directionally.
**How to avoid:** Insert the new button BEFORE `filter-git-actions`. The CSS rule `margin-left: auto` on `filter-git-actions` will push it and everything after it to the right, leaving the new button naturally adjacent to the project name.
**Warning signs:** Git action buttons appear in the middle of the row instead of right-aligned.

### Pitfall 3: Renderer Bundle Not Rebuilt
**What goes wrong:** Changes to files in `src/renderer/` don't appear in the app.
**Why it happens:** The renderer is bundled via esbuild into `dist/renderer.bundle.js`.
**How to avoid:** `renderer.js` is NOT in `src/renderer/` — it is the entry point at the repo root and is NOT bundled via esbuild. Changes to `renderer.js` take effect directly (it's loaded via `<script>` in index.html or equivalent). Changes to files under `src/renderer/` require `npm run build:renderer`. CONFIRM: check if renderer.js uses `require('./src/renderer')` — yes it does, so any change to files under `src/renderer/` needs a rebuild. But the button wiring in `renderer.js` itself does NOT need a rebuild.
**Warning signs:** Changes not reflected after saving.

## Code Examples

### 1. HTML: New Button in index.html (after filter-project span)

```html
<!-- Inside terminals-filter div, after filter-project span -->
<span class="filter-project" id="filter-project-name"></span>

<button class="filter-new-terminal-btn" id="btn-new-terminal" title="New terminal (Ctrl+T)">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
</button>
```

### 2. JavaScript: Handler in renderer.js (near line 1426, with btn-toggle-explorer)

```javascript
// Wire "+" new terminal button
const btnNewTerminal = document.getElementById('btn-new-terminal');
if (btnNewTerminal) {
  btnNewTerminal.onclick = () => {
    const selectedFilter = projectsState.get().selectedProjectFilter;
    const projects = projectsState.get().projects;
    if (selectedFilter !== null && projects[selectedFilter]) {
      createTerminalForProject(projects[selectedFilter]);
    }
  };
}
```

### 3. CSS: New rule in terminal.css (in the terminals-filter section, around line 56)

```css
.filter-new-terminal-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.filter-new-terminal-btn:hover {
  background: var(--accent-dim);
  color: var(--accent);
}

.filter-new-terminal-btn svg {
  width: 14px;
  height: 14px;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | Direct DOM wiring via `getElementById + .onclick` | Existing | No change needed |

**Deprecated/outdated:**
- Nothing deprecated for this phase.

## Open Questions

1. **Tooltip text for the button**
   - What we know: The `title` attribute provides a native tooltip. The codebase uses `data-i18n-title` for i18n tooltips.
   - What's unclear: Whether to add an i18n key for "New terminal" or use a hardcoded English title.
   - Recommendation: Use a simple `title="New terminal (Ctrl+T)"` — no i18n key needed for a single-button tooltip in this context. Per project conventions, error messages in main process must be English; UI strings in renderer should use i18n. However, adding a full i18n key for a tooltip is optional complexity. Given the plan description says this is a single plan task, use a hardcoded title and add i18n as a follow-up if desired.

2. **Whether `filter-git-actions` auto-margin needs adjustment**
   - What we know: `terminal.css` has `margin-left: auto` on `.filter-git-actions` via the rule at line 112 (`.filter-git-actions { margin-left: auto; }`).
   - What's unclear: Whether inserting the new button before it changes layout.
   - Recommendation: No adjustment needed. The new button is placed before `filter-git-actions`; the `margin-left: auto` still pushes git actions to the right. The new button naturally sits immediately after the project name badge.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `index.html` lines 276-330 — full `terminals-filter` HTML structure verified
- Direct codebase inspection: `renderer.js` lines 872-877 — `createTerminalForProject` definition
- Direct codebase inspection: `renderer.js` lines 2990-2999 — tray new-terminal pattern (canonical reference)
- Direct codebase inspection: `renderer.js` lines 1426-1429 — button wiring pattern
- Direct codebase inspection: `src/renderer/ui/components/TerminalManager.js` lines 1911-1941 — `filterByProject()` show/hide logic
- Direct codebase inspection: `styles/terminal.css` lines 56-105 — `terminals-filter` CSS
- Direct codebase inspection: `styles/projects.css` lines 117-139 — `btn-icon` pattern

### Secondary (MEDIUM confidence)
- None required — all findings from primary source inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, pure DOM + existing CSS variables
- Architecture: HIGH — insertion point, wiring pattern, and creation function all verified in source
- Pitfalls: HIGH — layout mechanics confirmed via CSS inspection; show/hide behavior confirmed via TerminalManager source

**Research date:** 2026-02-24
**Valid until:** Stable — only changes if `terminals-filter` HTML structure or `createTerminalForProject` function is refactored
