# Phase 13: Implement a setting to disable Chat/Terminal SwitchButton on Tabs - Research

**Researched:** 2026-02-26
**Domain:** Electron renderer settings UI + CSS visibility control
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Setting location: **Claude > Terminal** settings group (alongside `tabRenameOnSlashCommand` toggle from Phase 10)
- Setting key: Claude's discretion on exact name (e.g. `showTabModeToggle`)
- Default: **shown** (enabled) — uses `!== false` guard so undefined/missing key defaults to showing the button (safe upgrade path)
- Label text: **"Show mode switch on tabs"**
- Toggle applies **immediately** to all open tabs — no reload needed
- Implementation: read `getSetting()` at call-time, not cached — matches Phase 7 / Phase 10 convention
- The button stays in the DOM — hidden via CSS, not removed. A CSS class on `document.body` (driven by the setting) controls visibility
- When hidden: **no fallback mechanism** — users locked to `defaultTerminalMode`; no context menu, no keyboard shortcut for mode switching

### Claude's Discretion

- Exact setting key name (e.g. `showTabModeToggle`, `tabModeToggle`, `showModeSwitchButton`)
- CSS implementation approach for hiding (class on body vs per-tab check)
- i18n key naming convention
- Tooltip/description text for the setting toggle

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 13 adds a single boolean setting `showTabModeToggle` (or similar) to the Claude > Terminal settings group. When the user disables the toggle, the `.tab-mode-toggle` button on every terminal tab is hidden via CSS. When re-enabled, it reappears on hover as before.

The implementation is pure CSS + settings state — no IPC, no main-process involvement, no renderer rebuild is needed beyond the standard `npm run build:renderer`. The CSS approach uses a body-level class (`body.hide-tab-mode-toggle .tab-mode-toggle { display: none }`) applied at render time via `document.body.classList`, matching the `compact-projects` and `reduce-motion` body-class patterns already in SettingsPanel.js.

The setting reads `getSetting()` at call-time — not module-level — ensuring immediate effect when the settings panel is saved. This is identical to the `tabRenameOnSlashCommand` toggle (Phase 10) and all Phase 7 / Phase 1.1 toggles in this codebase.

**Primary recommendation:** Add `showTabModeToggle: true` to `defaultSettings`, add a `settings-toggle-row` block inside the existing `terminalGroup` section in SettingsPanel, add `show-tab-mode-toggle` DOM id, read it in the `saveSettingsHandler`, apply a body class, and add a CSS rule that hides `.tab-mode-toggle` when that class is present.

## Standard Stack

### Core

| File | Purpose | Role in this phase |
|------|---------|-------------------|
| `src/renderer/state/settings.state.js` | App settings state + `getSetting()` / `defaultSettings` | Add `showTabModeToggle: true` to `defaultSettings` |
| `src/renderer/ui/panels/SettingsPanel.js` | Claude tab settings UI, save handler | Add toggle HTML in `terminalGroup`; read toggle in `saveSettingsHandler`; apply body class |
| `styles/terminal.css` | Terminal tab CSS | Add `.hide-tab-mode-toggle .tab-mode-toggle { display: none !important }` |
| `src/renderer/i18n/locales/en.json` | English strings | Add `showTabModeToggle` + `showTabModeToggleDesc` under `settings` |
| `src/renderer/i18n/locales/fr.json` | French strings | Same keys in French |

### Supporting

| File | Purpose | Role |
|------|---------|------|
| `src/renderer/index.js` | App init | Apply body class on startup (same as `compact-projects`) |

No new packages required.

**Installation:** None — no new dependencies.

## Architecture Patterns

### Pattern 1: Settings Toggle in Claude > Terminal Group

The `terminalGroup` section in SettingsPanel.js (Claude tab) currently holds `tabRenameOnSlashCommand`. Phase 13 adds a second toggle row immediately after it, using the identical HTML structure.

**Current structure (from `feat/phase-11-explorer-natural-sorting` branch):**

```html
<div class="settings-group">
  <div class="settings-group-title">${t('settings.terminalGroup')}</div>
  <div class="settings-card">
    <div class="settings-toggle-row">
      <div class="settings-toggle-label">
        <div>${t('settings.tabRenameOnSlashCommand')}</div>
        <div class="settings-toggle-desc">${t('settings.tabRenameOnSlashCommandDesc')}</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="tab-rename-slash-toggle" ${settings.tabRenameOnSlashCommand ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
    </div>
  </div>
</div>
```

**Phase 13 adds inside the same `settings-card`:**

```html
<div class="settings-toggle-row">
  <div class="settings-toggle-label">
    <div>${t('settings.showTabModeToggle')}</div>
    <div class="settings-toggle-desc">${t('settings.showTabModeToggleDesc')}</div>
  </div>
  <label class="settings-toggle">
    <input type="checkbox" id="show-tab-mode-toggle" ${settings.showTabModeToggle !== false ? 'checked' : ''}>
    <span class="settings-toggle-slider"></span>
  </label>
</div>
```

Note: `!== false` guard (not ternary `? 'checked' : ''`) ensures undefined defaults to shown. Compare:
- `tabRenameOnSlashCommand` uses `settings.tabRenameOnSlashCommand ? 'checked' : ''` (opt-in, defaults unchecked)
- `showDotfiles` uses `settings.showDotfiles !== false ? 'checked' : ''` (opt-out, defaults checked)
- Phase 13 MUST use `!== false` (default: shown).

### Pattern 2: saveSettingsHandler read + body class

In `saveSettingsHandler` (same as `compact-projects`, `reduce-motion`, `showDotfiles`):

```js
const showTabModeToggle = document.getElementById('show-tab-mode-toggle');
const newShowTabModeToggle = showTabModeToggle ? showTabModeToggle.checked : true;

const newSettings = {
  // ... existing keys ...
  showTabModeToggle: newShowTabModeToggle,
};

// ... after ctx.settingsState.set(newSettings) ...
document.body.classList.toggle('hide-tab-mode-toggle', !newShowTabModeToggle);
```

### Pattern 3: Body class on startup

In `src/renderer/index.js`, after `initializeState()`, apply the body class (same as `compact-projects`):

```js
// Apply showTabModeToggle body class from saved settings
if (state.getSetting('showTabModeToggle') === false) {
  document.body.classList.add('hide-tab-mode-toggle');
}
```

### Pattern 4: CSS hiding rule

In `styles/terminal.css`, immediately after the existing `.tab-mode-toggle` block:

```css
/* Hide mode toggle when setting is disabled */
body.hide-tab-mode-toggle .tab-mode-toggle {
  display: none !important;
}
```

Using `body.hide-tab-mode-toggle` as the parent selector is the same approach as `body.compact-projects` used in layout.css. This is renderer-only — no main process change needed.

### Pattern 5: defaultSettings key

In `src/renderer/state/settings.state.js`, add to `defaultSettings`:

```js
showTabModeToggle: true, // true = show Chat/Terminal mode switch button on tabs (default), false = hide it
```

Position: alongside `tabRenameOnSlashCommand` (the other Terminal-group boolean). The `loadSettings()` spread (`{ ...defaultSettings, ...saved }`) already handles new keys correctly — no special migration needed.

### Anti-Patterns to Avoid

- **Do NOT cache `getSetting('showTabModeToggle')` at module load** — must read at call-time so toggling takes effect immediately on save (Phase 7 / 10 lesson).
- **Do NOT remove `.tab-mode-toggle` from DOM** — keep button in DOM, hide via CSS only. Removing it on save would require re-rendering all tabs.
- **Do NOT use inline `style.display`** on each tab element — body class is the clean, single-point approach; iterating all tabs adds DOM churn.
- **Do NOT add an IPC handler** — this is a renderer-only CSS class; no main process involvement needed.
- **Do NOT use the `!= false` (loose)** — use strict `!== false`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Immediate toggle effect across all open tabs | JavaScript loop over all `.tab-mode-toggle` elements | Body-class CSS rule | Single CSS rule, zero runtime JS, handles all tabs present and future |
| Setting persistence | Custom serialization | Existing `ctx.settingsState.set()` + `ctx.saveSettings()` in `saveSettingsHandler` | Already wired for all settings |
| Startup application | Re-read setting on each tab creation | Body class set once on startup in `index.js` | Tabs inherit from body class automatically |

## Common Pitfalls

### Pitfall 1: Wrong default guard

**What goes wrong:** Using `settings.showTabModeToggle ? 'checked' : ''` makes the checkbox unchecked when the key is missing (undefined is falsy). New users and upgraders see the button hidden by default, breaking the "default shown" requirement.

**Why it happens:** Developers copy the `tabRenameOnSlashCommand` pattern (opt-in) instead of the `showDotfiles` pattern (opt-out).

**How to avoid:** Use `settings.showTabModeToggle !== false ? 'checked' : ''`.

**Warning signs:** Checkbox is unchecked in a fresh install or when `settings.json` has no `showTabModeToggle` key.

### Pitfall 2: Forgetting startup body-class application

**What goes wrong:** The body class is only toggled when settings are saved (via `saveSettingsHandler`). On next app launch, `showTabModeToggle: false` is in settings but `body.hide-tab-mode-toggle` is never applied — button reappears.

**Why it happens:** Only adding the toggle to `saveSettingsHandler`, forgetting to apply it at `loadSettings` time.

**How to avoid:** Add class application in `src/renderer/index.js` after `initializeState()`, reading the loaded setting — same as `compact-projects` body class applied at startup.

**Warning signs:** Toggle works after save but resets on reload/restart.

### Pitfall 3: CSS specificity conflict

**What goes wrong:** `body.hide-tab-mode-toggle .tab-mode-toggle { display: none }` is overridden by `.terminal-tab:hover .tab-mode-toggle { opacity: 1 }` — button still appears because `display: none` and `opacity` fight.

**Why it happens:** `opacity: 0` means "invisible but present"; `display: none` is required to actually remove it from flow and interaction.

**How to avoid:** Use `display: none !important` in the body-class rule to override the `flex` display set on `.tab-mode-toggle`. The `!important` is justified here (same idiom as other "disable" CSS in the project).

**Warning signs:** Button invisible but still occupies space in the tab, or button appears on hover even when disabled.

### Pitfall 4: newSettings object missing the key

**What goes wrong:** `saveSettingsHandler` builds a fresh `newSettings` object from DOM elements. If `showTabModeToggle` is not explicitly included, `ctx.settingsState.set(newSettings)` will erase it (no merge — it's `set`, not `setProp`).

**Why it happens:** Forgetting to add the new key to the `newSettings` object literal.

**How to avoid:** Ensure `showTabModeToggle: newShowTabModeToggle` appears in the `newSettings` object, alongside the other terminal-group settings.

**Warning signs:** Setting doesn't persist across save cycles; console shows `showTabModeToggle` reverting to `undefined`.

## Code Examples

### Full terminalGroup HTML block (after Phase 13)

```javascript
// Source: src/renderer/ui/panels/SettingsPanel.js — Claude tab, terminalGroup section
<div class="settings-group">
  <div class="settings-group-title">${t('settings.terminalGroup')}</div>
  <div class="settings-card">
    <div class="settings-toggle-row">
      <div class="settings-toggle-label">
        <div>${t('settings.tabRenameOnSlashCommand')}</div>
        <div class="settings-toggle-desc">${t('settings.tabRenameOnSlashCommandDesc')}</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="tab-rename-slash-toggle" ${settings.tabRenameOnSlashCommand ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
    </div>
    <div class="settings-toggle-row">
      <div class="settings-toggle-label">
        <div>${t('settings.showTabModeToggle')}</div>
        <div class="settings-toggle-desc">${t('settings.showTabModeToggleDesc')}</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="show-tab-mode-toggle" ${settings.showTabModeToggle !== false ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
    </div>
  </div>
</div>
```

### saveSettingsHandler additions

```javascript
// Source: src/renderer/ui/panels/SettingsPanel.js — saveSettingsHandler
const showTabModeToggleEl = document.getElementById('show-tab-mode-toggle');
const newShowTabModeToggle = showTabModeToggleEl ? showTabModeToggleEl.checked : true;

const newSettings = {
  // ... existing keys ...
  tabRenameOnSlashCommand: newTabRenameOnSlashCommand,
  showTabModeToggle: newShowTabModeToggle,      // NEW
  // ... rest ...
};

// ... after ctx.settingsState.set(newSettings) ...
document.body.classList.toggle('hide-tab-mode-toggle', !newShowTabModeToggle);
```

### defaultSettings addition

```javascript
// Source: src/renderer/state/settings.state.js
tabRenameOnSlashCommand: false, // existing
showTabModeToggle: true,        // NEW — true = show Chat/Terminal mode-switch button on tabs
```

### Startup body class application

```javascript
// Source: src/renderer/index.js — after initializeState()
if (state.getSetting('showTabModeToggle') === false) {
  document.body.classList.add('hide-tab-mode-toggle');
}
```

### CSS rule

```css
/* Source: styles/terminal.css — after existing .tab-mode-toggle block */
body.hide-tab-mode-toggle .tab-mode-toggle {
  display: none !important;
}
```

### i18n keys (en.json)

```json
"showTabModeToggle": "Show mode switch on tabs",
"showTabModeToggleDesc": "Show the Chat/Terminal switch button on terminal tabs (hover to reveal)"
```

### i18n keys (fr.json)

```json
"showTabModeToggle": "Afficher le bouton de changement de mode",
"showTabModeToggleDesc": "Afficher le bouton Chat/Terminal sur les onglets (visible au survol)"
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Nested `terminalShortcuts` object | Flat `shortcutXxx` keys (Phase 2.1) | Phase 13 follows flat pattern |
| `terminal-shortcut-toggle` class on label | `toggle-option` class (Phase 7.1 fix) | Phase 13 uses `settings-toggle` label (SettingsPanel style, not ShortcutsManager style) |
| Inline style for show/hide | Body class CSS | Phase 13 follows body-class pattern |

## Open Questions

1. **Which branch is the "true" base for Phase 13?**
   - What we know: Phase 13 "Depends on Phase 12". Phase 12 adds .NET project type support. The Phase 11 branch (`feat/phase-11-explorer-natural-sorting`) contains all Phase 1.1, 5.1, 6.1, 7, 7.1, 8, 9, 10, 11 work and Phase 12 documentation.
   - What's unclear: Whether Phase 12 code (the actual .NET dashboard implementation) has been committed to a branch yet.
   - Recommendation: Before creating the Phase 13 branch, verify which branch has Phase 12 complete. If Phase 12 is not yet implemented, Phase 13 can still start from `feat/phase-11-explorer-natural-sorting` (the dependency is likely on having a stable foundation, not on Phase 12 features specifically). The CONTEXT.md says "Depends on Phase 12" but Phase 13 changes are entirely orthogonal to .NET support.

2. **Phase 2.1 flat key status**
   - What we know: Phase 2.1 plan says flat `shortcutXxx` keys; commit `f09f1481` on a separate branch already implements this.
   - What's unclear: Whether the Phase 13 base branch will include the flat key refactor or still have nested `terminalShortcuts`.
   - Recommendation: `showTabModeToggle` is entirely independent of the shortcut keys — it's a new flat key with no interaction with `shortcutXxx` keys. Proceed without concern.

## Sources

### Primary (HIGH confidence)

- Direct file inspection of `feat/phase-11-explorer-natural-sorting` branch — confirmed `terminalGroup` section structure, `settings-toggle-row` pattern, `saveSettingsHandler` shape, `defaultSettings` flat keys
- Direct file inspection of `styles/terminal.css` — confirmed `.tab-mode-toggle` CSS, `opacity: 0` default, `opacity: 1` on hover
- Direct file inspection of `src/renderer/ui/panels/SettingsPanel.js` — confirmed `settings-toggle` / `settings-toggle-row` HTML pattern for Claude tab toggles
- Direct file inspection of `src/renderer/state/settings.state.js` — confirmed `defaultSettings` structure and `loadSettings()` spread pattern
- Direct file inspection of `src/renderer/i18n/locales/en.json` + `fr.json` — confirmed `terminalGroup`, `tabRenameOnSlashCommand`, `switchToChat`, `switchToTerminal` keys exist

### Secondary (MEDIUM confidence)

- Git commit `af3adf11` (Phase 7.1) — confirmed `toggle-option` class change; SettingsPanel uses `settings-toggle` (different from ShortcutsManager's `toggle-option`)
- CONTEXT.md and STATE.md — locked decisions and established pattern references

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from actual source files on `feat/phase-11-explorer-natural-sorting`
- Architecture: HIGH — all 5 touch points identified with exact line-level patterns from existing toggles
- Pitfalls: HIGH — extracted from actual accumulated decisions in STATE.md (Phase 7, 10, 1.1 lessons)

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable codebase, 30-day window)
