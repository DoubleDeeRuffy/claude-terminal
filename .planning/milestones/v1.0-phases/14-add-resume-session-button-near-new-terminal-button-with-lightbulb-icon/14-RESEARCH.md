# Phase 14: Add Resume Session Button Near New Terminal Button with Lightbulb Icon - Research

**Researched:** 2026-02-26
**Domain:** Electron Renderer — HTML/CSS/JS UI button addition
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Button goes in the `terminals-filter` bar, **before** the new terminal (+) button (order: lightbulb | +)
- Clicking opens the existing `showSessionsModal()` function — no new session picker UI
- Follows `terminals-filter` visibility rules — hidden when no project is selected, shown when a project is open
- Works standalone on current upstream/main (PR #11 new terminal button is already merged there)
- Visual: **outline/stroke lightbulb** SVG icon — consistent with the + icon's stroke-based style
- CSS class: `filter-resume-session-btn` (matches `filter-new-terminal-btn` pattern)
- HTML id: `btn-resume-session`
- Tooltip: "Resume Claude session" (i18n key in both en.json and fr.json, using `data-i18n-title`)
- If no sessions exist, the modal opens and shows its existing empty state — no disable logic needed

### Claude's Discretion

- Exact lightbulb SVG path design
- CSS hover/active state specifics (should match existing button patterns)
- French translation for the tooltip
- Exact i18n key naming convention

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

---

## Summary

Phase 14 adds a single lightbulb-icon button inside the `#terminals-filter` bar, immediately before the existing `#btn-new-terminal` (+ button). Clicking it calls `showSessionsModal()` with the currently selected project, which is already the modal used by the system tray "Show Sessions" action and the `ShortcutsManager`.

The implementation touches exactly four files: `index.html` (button element), `renderer.js` (click handler), `styles/terminal.css` (CSS rules), and both i18n locale files. The `showSessionsModal()` function is already exported in `renderer.js` and handles all states (no sessions empty state, full session list). There is nothing to build beyond wiring the button to an existing function.

**Important branching note:** The local fork's `main` branch does NOT yet include the upstream's `btn-new-terminal` button (PR #11 was merged into `upstream/main` but our fork hasn't pulled it). The PR for Phase 14 must be based on `upstream/main`, not on the local fork's `main`. The correct branch base is `upstream/main`, and the PR must include or rebase onto the existing upstream `btn-new-terminal` changes. In practice: create the feature branch from `upstream/main` so the new button sits correctly next to `btn-new-terminal`.

**Primary recommendation:** Insert `<button class="filter-resume-session-btn" id="btn-resume-session" data-i18n-title="terminals.resumeSession">` before `btn-new-terminal` in `index.html`, wire `onclick` in `renderer.js` using the exact same pattern as `btn-new-terminal`, add CSS rules mirroring `.filter-new-terminal-btn` in `terminal.css`, and add the i18n key to both locale files.

---

## Standard Stack

### Core (No new dependencies required)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| HTML (`index.html`) | static | Button element, SVG icon, i18n attributes | Project pattern — all UI buttons defined here |
| `renderer.js` | project file | Click handler wiring, `showSessionsModal()` call | Button handlers live here for the terminals-filter bar |
| `styles/terminal.css` | project file | `.filter-resume-session-btn` CSS rules | All terminals-filter button styles live in terminal.css |
| `src/renderer/i18n/locales/en.json` | project file | English tooltip i18n key | All English strings |
| `src/renderer/i18n/locales/fr.json` | project file | French tooltip i18n key | All French strings |

No npm installs required. Pure HTML/CSS/JS changes.

---

## Architecture Patterns

### Upstream `terminals-filter` DOM Structure (from `upstream/main:index.html`)

```html
<div class="terminals-filter" id="terminals-filter" style="display: none;">
  <span class="filter-project" id="filter-project-name"></span>

  <!-- Phase 14: INSERT btn-resume-session HERE, before btn-new-terminal -->

  <button class="filter-new-terminal-btn" id="btn-new-terminal" title="New terminal (Ctrl+T)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>

  <div class="filter-git-actions" id="filter-git-actions" style="display: none;">
    ...
  </div>
  ...
  <button class="filter-clear" id="btn-show-all" data-i18n-title="ui.showAllTerminals">
    ...
  </button>
</div>
```

The resume button goes **between** `filter-project-name` span and `btn-new-terminal`.

### Pattern 2: Click Handler — mirrors `btn-new-terminal`

The `btn-new-terminal` handler in `upstream/main:renderer.js` lines 1493-1503:

```js
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

The resume button handler follows the same pattern, calling `showSessionsModal()` instead:

```js
// Wire lightbulb resume session button
const btnResumeSession = document.getElementById('btn-resume-session');
if (btnResumeSession) {
  btnResumeSession.onclick = () => {
    const selectedFilter = projectsState.get().selectedProjectFilter;
    const projects = projectsState.get().projects;
    if (selectedFilter !== null && projects[selectedFilter]) {
      showSessionsModal(projects[selectedFilter]);
    }
  };
}
```

`showSessionsModal` is already declared and available in the same `renderer.js` scope (line 1216 in upstream, line 1150 in local main). It is also exported via the `ctx` object (line 193 in local main: `showSessionsModal,`), so it is in scope for the handler.

### Pattern 3: CSS — mirrors `.filter-new-terminal-btn`

From `upstream/main:styles/terminal.css` lines 107-131:

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

The resume button CSS class `.filter-resume-session-btn` replicates this exactly (same dimensions, same hover state, same SVG size). Place the new rules immediately before `.filter-new-terminal-btn` so the pair is visually grouped in the CSS.

### Pattern 4: i18n tooltip using `data-i18n-title`

Other buttons using `data-i18n-title` (verified from `index.html`):
- `data-i18n-title="ui.showAllTerminals"` on `#btn-show-all`
- `data-i18n-title="projects.gitPull"` on `#filter-btn-pull`

For Phase 14, use `data-i18n-title="terminals.resumeSession"`.

Existing related keys already in both locales:
- `terminals.resumeConversation` = "Resume a conversation" (EN) / "Reprendre une conversation" (FR) — this is the modal title, NOT the tooltip
- New key needed: `terminals.resumeSession` = "Resume Claude session" (EN)
- French: "Reprendre une session Claude" (suggested; Claude's discretion)

### Pattern 5: `showSessionsModal()` function

Already handles all edge cases:
- No sessions → shows empty state with a "New conversation" button
- Sessions exist → shows grouped/searchable list with pin support
- Error → shows error modal

No guard needed on button click — always visible when `terminals-filter` is visible, and `showSessionsModal` handles its own empty state.

### Anti-Patterns to Avoid

- **Disabling button when no sessions:** Not needed per decision. `showSessionsModal` already shows an empty state.
- **Creating a new session picker:** The existing modal is the correct UI.
- **Using `title` attribute instead of `data-i18n-title`:** Would break i18n. Use `data-i18n-title`.
- **Hardcoding a tooltip string without adding it to both locale files:** Both `en.json` and `fr.json` must be updated.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session picker UI | New modal/dropdown | `showSessionsModal()` at line 1150 | Already handles grouping, search, pin, empty state |
| Button visibility toggling | Manual show/hide logic | `terminals-filter` visibility (already managed) | Button inherits parent show/hide for free |
| Session loading | Custom IPC calls | `api.claude.sessions()` inside `showSessionsModal` | Already called and cached there |

---

## Common Pitfalls

### Pitfall 1: Placing button after `btn-new-terminal` instead of before

**What goes wrong:** Order is reversed — user wanted lightbulb BEFORE the "+" (to the left).

**How to avoid:** Insert HTML **between** `filter-project-name` span and `btn-new-terminal` button. The DOM order in `terminals-filter` is: project name → resume (lightbulb) → new terminal (+) → git actions → ... → close (X).

### Pitfall 2: Forgetting to add i18n key to BOTH locale files

**What goes wrong:** App works in one language but shows the key string (e.g. `terminals.resumeSession`) as raw text in the other.

**How to avoid:** Always update both `en.json` and `fr.json`. The i18n system does not fall back between languages — missing key shows the key path.

### Pitfall 3: Branching from local `main` instead of `upstream/main`

**What goes wrong:** The branch won't include the `btn-new-terminal` that was merged into upstream. The PR will have a conflict or visually incorrect button ordering.

**How to avoid:** Create the feature branch from `upstream/main` (or rebase onto it). The local fork's `main` is behind upstream on the Phase 3 (`btn-new-terminal`) changes.

### Pitfall 4: Using `title` attribute instead of `data-i18n-title`

**What goes wrong:** Tooltip won't be translated; won't follow the project's i18n pattern.

**How to avoid:** Use `data-i18n-title="terminals.resumeSession"` on the button element (no fallback `title` attribute needed since the i18n system handles it).

---

## Code Examples

### Button HTML (to insert before `btn-new-terminal` in `index.html`)

```html
<button class="filter-resume-session-btn" id="btn-resume-session" data-i18n-title="terminals.resumeSession">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <!-- Outline lightbulb SVG — stroke-based, consistent with + icon -->
    <path d="M9 21h6"/>
    <path d="M12 2a7 7 0 0 1 4 12.9V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.1A7 7 0 0 1 12 2z"/>
  </svg>
</button>
```

Note: The exact SVG path is Claude's discretion. The above is a standard stroke-based outline lightbulb. Any outline lightbulb path that renders cleanly at 14×14px is acceptable.

### CSS Rules (to add in `styles/terminal.css`, before `.filter-new-terminal-btn`)

```css
.filter-resume-session-btn {
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

.filter-resume-session-btn:hover {
  background: var(--accent-dim);
  color: var(--accent);
}

.filter-resume-session-btn svg {
  width: 14px;
  height: 14px;
}
```

### Click handler (to add in `renderer.js`, near the `btn-new-terminal` handler)

```js
// Wire lightbulb resume session button
const btnResumeSession = document.getElementById('btn-resume-session');
if (btnResumeSession) {
  btnResumeSession.onclick = () => {
    const selectedFilter = projectsState.get().selectedProjectFilter;
    const projects = projectsState.get().projects;
    if (selectedFilter !== null && projects[selectedFilter]) {
      showSessionsModal(projects[selectedFilter]);
    }
  };
}
```

### i18n additions

**`src/renderer/i18n/locales/en.json`** — add inside `"terminals"` object:
```json
"resumeSession": "Resume Claude session"
```

**`src/renderer/i18n/locales/fr.json`** — add inside `"terminals"` object:
```json
"resumeSession": "Reprendre une session Claude"
```

---

## File Change Summary

| File | Change | Location |
|------|--------|----------|
| `index.html` | Add `<button id="btn-resume-session">` with lightbulb SVG | Inside `.terminals-filter`, before `#btn-new-terminal` |
| `renderer.js` | Add `btnResumeSession.onclick` handler calling `showSessionsModal()` | After the `btn-new-terminal` handler block (~line 1503 in upstream) |
| `styles/terminal.css` | Add `.filter-resume-session-btn` rules (3 blocks: base, :hover, svg) | Before `.filter-new-terminal-btn` block |
| `src/renderer/i18n/locales/en.json` | Add `"resumeSession"` key in `"terminals"` object | In terminals object |
| `src/renderer/i18n/locales/fr.json` | Add `"resumeSession"` key in `"terminals"` object | In terminals object |

No new services, IPC handlers, state modules, or dependencies required.

---

## Open Questions

1. **Branch base: local `main` or `upstream/main`?**
   - What we know: `btn-new-terminal` is in `upstream/main` but NOT in local fork's `main`. The CONTEXT.md says "Works standalone on current upstream/main (PR #11 already merged)".
   - What's unclear: Whether the PR workflow will rebase onto upstream or if local main will be brought up to date first.
   - Recommendation: Branch from `upstream/main` directly, or sync fork's main with upstream before branching. The planner should call this out explicitly.

2. **Exact placement in `renderer.js`**
   - What we know: In upstream, the `btn-new-terminal` handler is at line 1493. The resume handler must be adjacent.
   - Recommendation: Add the resume handler block immediately BEFORE or AFTER the `btn-new-terminal` handler. Before is slightly more logical (same visual order as HTML).

---

## Sources

### Primary (HIGH confidence)
- `upstream/main:index.html` — verified `terminals-filter` DOM structure, `btn-new-terminal` position, button pattern
- `upstream/main:styles/terminal.css` lines 81-131 — verified `.filter-new-terminal-btn` and `.filter-clear` CSS rule shapes
- `upstream/main:renderer.js` lines 1493-1503 — verified click handler pattern for `btn-new-terminal`
- `renderer.js` lines 1150-1278 (local main) — verified `showSessionsModal()` implementation, all edge cases handled
- `renderer.js` lines 3003-3015 (local main) — verified `showSessionsModal` is called with same pattern from tray handler
- `upstream/main:src/renderer/i18n/locales/en.json` — verified `terminals.resumeConversation` exists, confirmed `resumeSession` key is absent (needs adding)
- `upstream/main:src/renderer/i18n/locales/fr.json` — same verification

### Secondary (MEDIUM confidence)
- `.planning/phases/03-new-terminal-button/03-01-SUMMARY.md` — confirmed Phase 3 patterns and conventions used for btn-new-terminal (matches what is seen in upstream/main)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all files verified directly from upstream/main git show
- Architecture: HIGH — exact DOM structure, CSS rules, and handler patterns extracted from source
- Pitfalls: HIGH — identified from direct code inspection

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable codebase, no fast-moving deps)
