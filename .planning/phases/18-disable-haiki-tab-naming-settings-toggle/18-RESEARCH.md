# Phase 18: Disable Haiku Tab-Naming Settings Toggle - Research

**Researched:** 2026-02-26
**Domain:** Electron renderer — settings state, UI panel, chat view, terminal manager
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Toggle behavior:**
- When OFF: no auto-renaming at all — tabs keep default name (e.g. "Terminal 1")
- Affects both chat-mode (haiku generateTabName) AND terminal-mode (OSC rename)
- Default state: ON (current behavior preserved for existing users — safe upgrade path)
- Independent from the existing "Rename tab on slash command" toggle — both can be configured separately

**Settings placement:**
- Create a new **Tabs** settings group in the settings panel
- Move the existing "Rename tab on slash command" toggle into this new Tabs group
- Rename moved toggle to "Terminal: rename tab on slash command"
- Add new "AI tab naming" toggle in the same Tabs group
- Label: "AI tab naming"
- Description: "Use AI to generate short tab names from messages"

### Claude's Discretion
- Exact ordering of toggles within the new Tabs group
- i18n key naming for new settings group and toggle
- Whether to use `=== false` or `!== true` guard pattern (follow existing conventions)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 18 adds a single boolean setting (`aiTabNaming`) to control whether the haiku AI model auto-renames tabs in both chat mode and terminal mode. The feature touches four files: `settings.state.js` (add default), `SettingsPanel.js` (new Tabs group + toggle HTML + save logic), `ChatView.js` (two call sites guarded by the setting), and the i18n locale files.

The existing `tabRenameOnSlashCommand` toggle currently lives inside the `terminalGroup` settings group. Per user decision, both toggles must move into a new **Tabs** group, with `tabRenameOnSlashCommand` renamed to "Terminal: rename tab on slash command". No change to the underlying setting key name is needed — only the i18n label changes.

The OSC-based rename path in `TerminalManager.js` already has `shouldSkipOscRename()` as a guard point. The new `aiTabNaming` toggle needs a second, parallel guard there — but inverted: skip the rename when `aiTabNaming === false`, rather than the existing slash-command cooldown logic. The two guards are logically independent.

**Primary recommendation:** Add `aiTabNaming: true` to `defaultSettings`, guard both `generateTabName` call sites in `ChatView.js` and both OSC rename call sites in `handleClaudeTitleChange` in `TerminalManager.js`, then restructure `SettingsPanel.js` to move the slash-command toggle out of `terminalGroup` and into a new `tabsGroup`.

## Standard Stack

### Core
| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| `settings.state.js` | `src/renderer/state/settings.state.js` | Persistent key-value store for all settings | All feature toggles live here |
| `SettingsPanel.js` | `src/renderer/ui/panels/SettingsPanel.js` | Renders settings UI and handles save | All settings UI is here |
| `ChatView.js` | `src/renderer/ui/components/ChatView.js` | Chat mode tab naming call sites | Two `generateTabName` invocations to guard |
| `TerminalManager.js` | `src/renderer/ui/components/TerminalManager.js` | OSC title rename call sites | `handleClaudeTitleChange` guards OSC renames |
| `en.json` / `fr.json` | `src/renderer/i18n/locales/` | All UI strings | i18n keys for new group + toggle |

**Installation:** No new packages required.

## Architecture Patterns

### Pattern 1: Boolean Setting with !== false Guard (safe upgrade default ON)

**What:** For settings that default to ON (preserve existing behavior), use `!== false` as the guard. An absent/undefined key behaves as ON, so existing users get no disruption.

**When to use:** Any setting whose default is `true` and whose absence should not change behavior.

**Example from Phase 8 and Phase 11:**
```js
// settings.state.js defaultSettings
aiTabNaming: true,

// Guard in ChatView.js / TerminalManager.js
if (getSetting('aiTabNaming') === false) return; // skip rename

// Checkbox render in SettingsPanel.js
<input type="checkbox" id="ai-tab-naming-toggle" ${settings.aiTabNaming !== false ? 'checked' : ''}>
```

**Precedent in codebase:**
- `showDotfiles !== false` — Phase 1.1
- `explorerNaturalSort !== false` — Phase 11
- `showTabModeToggle !== false` — Phase 13
- `getSetting('aiTabNaming') === false` (call-time read, not cached) — Phase 7/10 pattern

### Pattern 2: Call-time getSetting Read (immediate toggle effect)

**What:** Read the setting inside the callback/handler, not at module load. This means toggling the setting takes effect on the very next action without requiring a restart or re-wiring.

**Precedent:**
```js
// ChatView.js — inside _send() callback
if (getSetting('aiTabNaming') === false) return;
api.chat.generateTabName({ userMessage: text }).then(res => { ... });
```

This matches how `tabRenameOnSlashCommand` is read in `events/index.js` and how `showDotfiles` is read in `FileExplorer.js`.

### Pattern 3: New Settings Group (Tabs group)

**What:** A `settings-group` div wrapping a `settings-group-title` and a `settings-card` with toggle rows.

**Template (from existing groups like explorerGroup):**
```html
<div class="settings-group">
  <div class="settings-group-title">${t('settings.tabsGroup')}</div>
  <div class="settings-card">
    <div class="settings-toggle-row">
      <div class="settings-toggle-label">
        <div>${t('settings.aiTabNaming')}</div>
        <div class="settings-toggle-desc">${t('settings.aiTabNamingDesc')}</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="ai-tab-naming-toggle" ${settings.aiTabNaming !== false ? 'checked' : ''}>
        <span class="settings-toggle-slider"></span>
      </label>
    </div>
    <div class="settings-toggle-row">
      <div class="settings-toggle-label">
        <div>${t('settings.tabRenameOnSlashCommandTerminal')}</div>
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

### Anti-Patterns to Avoid
- **Caching getSetting at module load:** The setting must be read at call time so toggling takes effect immediately (no reload needed).
- **Adding a new guard key to shouldSkipOscRename:** The existing `shouldSkipOscRename` is specifically for the slash-command cooldown. The `aiTabNaming` guard should be an independent early return BEFORE calling `updateTerminalTabName` in `handleClaudeTitleChange`, not inside `shouldSkipOscRename`. This keeps the two concerns separate.
- **Changing the `tabRenameOnSlashCommand` key name:** The setting key stays `tabRenameOnSlashCommand`. Only the i18n label displayed in the UI changes.

## File-by-File Change Map

### 1. `src/renderer/state/settings.state.js`
- Add `aiTabNaming: true` to `defaultSettings`.
- No other changes needed.

### 2. `src/renderer/ui/components/ChatView.js`
Two call sites at lines ~1527–1538 and ~3196–3206. Both follow the same pattern:

```js
// Tab rename: instant truncation + async haiku polish
if (onTabRename && !text.startsWith('/')) {
  // [EXISTING] Immediate: smart truncation
  const words = text.split(/\s+/).slice(0, 5).join(' ');
  onTabRename(words.length > 30 ? words.slice(0, 28) + '...' : words);
  // [NEW GUARD] Skip AI rename if disabled
  if (getSetting('aiTabNaming') !== false) {
    if (!tabNamePending) {
      tabNamePending = true;
      api.chat.generateTabName({ userMessage: text }).then(res => {
        if (res?.success && res.name) onTabRename(res.name);
      }).catch(() => {}).finally(() => { tabNamePending = false; });
    }
  }
}
```

Note: `getSetting` is already imported in `ChatView.js` via `require('../../state')`. Verify this import is present — if not, add it from the state barrel.

### 3. `src/renderer/ui/components/TerminalManager.js`
Two OSC call sites inside `handleClaudeTitleChange` at lines ~389–393 and ~402–407:

```js
// Auto-name tab from Claude's task name (not tool names)
if (parsed.taskName) {
  if (getSetting('aiTabNaming') !== false && !shouldSkipOscRename(id)) {
    updateTerminalTabName(id, parsed.taskName);
  }
}
```

And the ready-candidate block:
```js
if (parsed.taskName) {
  if (!terminalContext.has(id)) terminalContext.set(id, { ... });
  terminalContext.get(id).taskName = parsed.taskName;
  if (getSetting('aiTabNaming') !== false && !shouldSkipOscRename(id)) {
    updateTerminalTabName(id, parsed.taskName);
  }
}
```

`getSetting` is already imported at the top of `TerminalManager.js` (line 32 via `require('../../state')`).

### 4. `src/renderer/ui/panels/SettingsPanel.js`
Four changes:

**4a. Remove `tabRenameOnSlashCommand` toggle from `terminalGroup`** (lines 660–669). The `terminalGroup` div currently contains the slash-command toggle + the idle timeout dropdown. Remove only the toggle row; keep the idle timeout row. The `terminalGroup` group div itself stays.

**4b. Add new `tabsGroup` group** in the Claude settings panel, placed just BEFORE the existing `terminalGroup` group. Contains two toggles: AI tab naming (new) and slash-command rename (moved).

**4c. Save-settings read** — Add a line to read the new checkbox:
```js
const aiTabNamingToggle = document.getElementById('ai-tab-naming-toggle');
const newAiTabNaming = aiTabNamingToggle ? aiTabNamingToggle.checked : true;
```

**4d. Add to the `newSettings` object:**
```js
aiTabNaming: newAiTabNaming,
```

The existing `tabRenameOnSlashCommand: newTabRenameOnSlashCommand` line stays as-is (the checkbox `id="tab-rename-slash-toggle"` remains unchanged).

### 5. `src/renderer/i18n/locales/en.json`
Add inside `settings`:
```json
"tabsGroup": "Tabs",
"aiTabNaming": "AI tab naming",
"aiTabNamingDesc": "Use AI to generate short tab names from messages",
"tabRenameOnSlashCommandTerminal": "Terminal: rename tab on slash command"
```

The existing `tabRenameOnSlashCommand` and `tabRenameOnSlashCommandDesc` keys can stay or be repurposed for the description. The label key shown in the UI changes to `tabRenameOnSlashCommandTerminal` to match the new heading.

### 6. `src/renderer/i18n/locales/fr.json`
Add corresponding French translations:
```json
"tabsGroup": "Onglets",
"aiTabNaming": "Nommage IA des onglets",
"aiTabNamingDesc": "Utiliser l'IA pour générer des noms courts pour les onglets à partir des messages",
"tabRenameOnSlashCommandTerminal": "Terminal : renommer l'onglet sur commande slash"
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Setting persistence | Custom file I/O | `setSetting(key, value)` in `settings.state.js` | Atomic writes, debounce, error handling already implemented |
| Toggle state saving | Manual checkbox read | Pattern: `getElementById + .checked` already used 10+ times in `collectSettings()` | Consistent with existing pattern in `SettingsPanel.js` |

## Common Pitfalls

### Pitfall 1: Forgetting the Second ChatView Call Site
**What goes wrong:** The `generateTabName` call appears in two places in `ChatView.js` — once for keyboard-submitted messages (~line 1533) and once for remote (PWA) messages (~line 3200). Guard both.
**Why it happens:** The remote path is far from the main path and easy to miss.
**How to avoid:** Search for `generateTabName` in `ChatView.js` — there are exactly two calls. Both must be guarded.
**Warning signs:** Remote UI messages still trigger AI tab naming after toggle is disabled.

### Pitfall 2: Guarding the Immediate Truncation Too Aggressively
**What goes wrong:** Disabling AI tab naming should only suppress the async haiku call. The immediate word-truncation (non-AI) rename should still happen in chat mode — OR both should be suppressed. The user decision says "tabs keep default name". This means BOTH the instant truncation and the async haiku call should be suppressed when `aiTabNaming === false`.
**Recommendation:** Wrap the entire `if (onTabRename && !text.startsWith('/'))` block (or add an early exit at the top of it) with the `aiTabNaming` guard in chat mode.

**Revised guard pattern for ChatView.js:**
```js
if (onTabRename && !text.startsWith('/') && getSetting('aiTabNaming') !== false) {
  const words = text.split(/\s+/).slice(0, 5).join(' ');
  onTabRename(words.length > 30 ? words.slice(0, 28) + '...' : words);
  if (!tabNamePending) {
    tabNamePending = true;
    api.chat.generateTabName({ userMessage: text }).then(res => {
      if (res?.success && res.name) onTabRename(res.name);
    }).catch(() => {}).finally(() => { tabNamePending = false; });
  }
}
```

### Pitfall 3: Wrong guard in TerminalManager — shouldSkipOscRename vs aiTabNaming
**What goes wrong:** Adding the `aiTabNaming` check inside `shouldSkipOscRename()` would couple two independent concerns (AI naming disabled vs slash-command cooldown) and break the slash-command cooldown logic.
**How to avoid:** Keep the `aiTabNaming` guard as a separate condition ANDed with `!shouldSkipOscRename(id)`. The combined expression is: `getSetting('aiTabNaming') !== false && !shouldSkipOscRename(id)`.

### Pitfall 4: i18n Key Collision for the Moved Toggle
**What goes wrong:** The HTML `id="tab-rename-slash-toggle"` stays the same, but the displayed label changes. If both old key (`tabRenameOnSlashCommand`) and new key (`tabRenameOnSlashCommandTerminal`) exist in the locale files, the template must use the new key for the new group placement.
**How to avoid:** Use `tabRenameOnSlashCommandTerminal` as the i18n key for the label in the new Tabs group. Keep the existing `tabRenameOnSlashCommand` key in JSON (it may still be referenced elsewhere or kept for clarity). Only the template reference changes.

### Pitfall 5: getSetting Not Imported in ChatView.js
**What goes wrong:** `getSetting` may not be in scope in `ChatView.js`.
**Verification:** Grep for `getSetting` in `ChatView.js`. If absent, import it from `../../state`.

## Code Examples

### Existing guard pattern (Phase 1.1 style — default ON):
```js
// Source: src/renderer/ui/components/FileExplorer.js
if (getSetting('showDotfiles') === false) { /* hide */ }
```

### Existing toggle HTML (explorer group pattern):
```html
<!-- Source: SettingsPanel.js ~line 526 -->
<input type="checkbox" id="show-dotfiles-toggle" ${settings.showDotfiles !== false ? 'checked' : ''}>
```

### Existing save-read pattern:
```js
// Source: SettingsPanel.js ~line 1162
const showDotfilesToggle = document.getElementById('show-dotfiles-toggle');
const newShowDotfiles = showDotfilesToggle ? showDotfilesToggle.checked : true;
```

## Open Questions

1. **Does `getSetting` need to be imported in `ChatView.js`?**
   - What we know: `getSetting` is imported at top of `TerminalManager.js` via `require('../../state')`.
   - What's unclear: Whether `ChatView.js` already imports it or not.
   - Recommendation: Run a grep on `ChatView.js` for `getSetting` before writing the guard. If missing, add to its destructured import from `../../state`.

2. **Immediate truncation in chat mode: suppress or allow?**
   - The user said "tabs keep their default name" when AI tab naming is OFF.
   - The immediate word-truncation (no AI) still renames the tab.
   - Recommendation: Suppress BOTH the instant truncation and the async haiku call when `aiTabNaming === false`. Gate the entire rename block, not just the async part. This matches the stated behavior.

## Sources

### Primary (HIGH confidence)
- Direct codebase read — `src/renderer/state/settings.state.js` (all defaults, guard patterns)
- Direct codebase read — `src/renderer/ui/panels/SettingsPanel.js` (all group structure, save logic)
- Direct codebase read — `src/renderer/ui/components/ChatView.js` (both generateTabName call sites at lines ~1527 and ~3196)
- Direct codebase read — `src/renderer/ui/components/TerminalManager.js` (shouldSkipOscRename, handleClaudeTitleChange)
- Direct codebase read — `src/renderer/events/index.js` (wireTabRenameConsumer, tabRenameOnSlashCommand guard)
- Direct codebase read — `src/renderer/i18n/locales/en.json` and `fr.json` (existing key names)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all affected files identified from direct source reads
- Architecture: HIGH — patterns extracted from 6+ prior phases in the same codebase
- Pitfalls: HIGH — derived from direct code inspection, not speculation

**Research date:** 2026-02-26
**Valid until:** Stable — no external dependencies; all changes are self-contained in renderer files
