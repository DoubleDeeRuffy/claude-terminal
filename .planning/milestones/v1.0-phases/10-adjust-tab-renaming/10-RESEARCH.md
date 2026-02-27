# Phase 10: Adjust Tab Renaming - Research

**Researched:** 2026-02-25
**Domain:** Renderer event bus, terminal input handling, settings state, SettingsPanel UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Detection source:** Use HooksProvider PROMPT_SUBMIT events to detect slash commands. Only `/slash-command` patterns trigger rename — regular prompts do not. Capture the full command including arguments (e.g., `/gsd:verify-work 12`, not just `/gsd:verify-work`).
- **Tab name format:** Slash command only — no project prefix, no decoration. Tab displays exactly what was typed: `/gsd:verify-work 12`. Default tab name (before any slash command) = project name.
- **Settings toggle:** New toggle in Terminal Settings section. When ON: project name → slash command on detection → next slash command replaces previous. When OFF: current behavior unchanged (haiku AI-generated names). Setting must be read at runtime (not cached) so toggling takes effect immediately.
- **Persistence across /clear:** `/clear` does NOT reset the tab name — the last slash command name sticks. Only a new slash command replaces the current name. On session restart (new PTY), tab reverts to project name default.

### Claude's Discretion

- Exact setting key name and default value
- How to wire HooksProvider event to tab rename logic
- Whether to truncate extremely long slash commands in the tab

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

This phase adds opt-in tab auto-renaming to the last slash command executed in a terminal session. The feature uses the existing `ClaudeEventBus` PROMPT_SUBMIT event (already emitted by HooksProvider when `UserPromptSubmit` fires with a `prompt` field), detects when the prompt starts with `/`, and calls `updateTerminalTabName()` in TerminalManager.

The key insight is that **PROMPT_SUBMIT already carries the prompt text from HooksProvider** — `{ prompt: stdin.prompt || null }` — meaning the full slash command string (e.g., `/gsd:verify-work 12`) is already available without any new IPC or hook changes. The detection and rename logic belongs in `src/renderer/events/index.js` as a new consumer function (`wireTabRenameConsumer`), matching the established consumer pattern used throughout that file.

The existing `extractTitleFromInput()` function in TerminalManager **explicitly rejects** slash commands (`if (text.startsWith('/') return null`), so there is no collision. The new feature operates on an entirely separate code path: HooksProvider event → events/index.js consumer → `TerminalManager.updateTerminalTabName()`.

**Primary recommendation:** Add `wireTabRenameConsumer()` in `events/index.js`, gate on `getSetting('tabRenameOnSlashCommand')`, use `findClaudeTerminalForProject()` (already exists) to resolve terminal ID, and call `updateTerminalTabName(terminalId, prompt)` with optional truncation at ~40 chars.

## Standard Stack

### Core
| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| `ClaudeEventBus` | `src/renderer/events/ClaudeEventBus.js` | Pub-sub for Claude events | Already the single source of truth for hook events |
| `EVENT_TYPES.PROMPT_SUBMIT` | `ClaudeEventBus.js` | Fires on UserPromptSubmit hook | Already emits `{ prompt: string\|null }` — prompt text is available |
| `updateTerminalTabName()` | `TerminalManager.js:982` | Updates state + DOM tab label | Already handles the state+DOM dual update |
| `findClaudeTerminalForProject()` | `events/index.js:160` | Resolves projectId → terminal ID | Already used by wireSessionIdCapture, wireTerminalStatusConsumer |
| `getSetting()` | `settings.state.js:60` | Runtime setting read | Used throughout events/index.js for feature flags |

### Supporting
| Component | Location | Purpose | When to Use |
|-----------|----------|---------|-------------|
| `settingsState` (defaultSettings) | `settings.state.js:12` | Where new setting key is declared | Add `tabRenameOnSlashCommand: false` here |
| `SettingsPanel.js` | `src/renderer/ui/panels/SettingsPanel.js` | Settings UI rendering + save handler | Add toggle HTML in Terminal Settings section, wire in `saveSettingsHandler()` |
| `en.json` / `fr.json` | `src/renderer/i18n/locales/` | i18n for UI strings | Add `settings.tabRenameOnSlashCommand` + `Desc` keys |

## Architecture Patterns

### Recommended Structure

No new files required. Changes span four existing files:

```
src/renderer/events/index.js         # new wireTabRenameConsumer() + call in initClaudeEvents()
src/renderer/state/settings.state.js # add tabRenameOnSlashCommand: false to defaultSettings
src/renderer/ui/panels/SettingsPanel.js  # add toggle HTML + wire in saveSettingsHandler
src/renderer/i18n/locales/en.json    # add 2 i18n keys
src/renderer/i18n/locales/fr.json    # add 2 i18n keys
```

### Pattern 1: Consumer in events/index.js

This is the established pattern for all tab/state side effects triggered by hook events.

**What:** Add `wireTabRenameConsumer()` in `events/index.js`, call it from `initClaudeEvents()`.

**Example (modeled on wireTerminalStatusConsumer):**
```js
// Source: src/renderer/events/index.js (existing consumer pattern)
function wireTabRenameConsumer() {
  const MAX_TAB_NAME_LEN = 40;

  consumerUnsubscribers.push(
    eventBus.on(EVENT_TYPES.PROMPT_SUBMIT, (e) => {
      // Only hooks provide prompt text; scraping emits prompt: null
      if (e.source !== 'hooks') return;
      if (!e.projectId) return;
      const prompt = e.data?.prompt;
      if (!prompt || !prompt.trimStart().startsWith('/')) return;

      // Check setting at call-time (not cached) so toggle takes effect immediately
      const { getSetting } = require('../state/settings.state');
      if (!getSetting('tabRenameOnSlashCommand')) return;

      const terminalId = findClaudeTerminalForProject(e.projectId);
      if (!terminalId) return;

      // Truncate very long slash commands with ellipsis
      const name = prompt.length > MAX_TAB_NAME_LEN
        ? prompt.slice(0, MAX_TAB_NAME_LEN - 1) + '…'
        : prompt;

      try {
        const TerminalManager = require('../ui/components/TerminalManager');
        TerminalManager.updateTerminalTabName(terminalId, name);
      } catch (err) { /* TerminalManager not ready */ }
    })
  );
}
```

### Pattern 2: Setting Key + Default

**What:** New flat key on `defaultSettings` in `settings.state.js`. Default `false` (opt-in).

```js
// Source: src/renderer/state/settings.state.js (existing pattern)
const defaultSettings = {
  // ... existing keys ...
  tabRenameOnSlashCommand: false,  // Rename tab to last slash command executed
};
```

**Why `false` default:** The current behavior (haiku AI-generated names) is preserved for existing users — exactly as decided. Toggling takes effect immediately because the consumer calls `getSetting()` at event time, not at wiring time. This matches the Phase 7 / Phase 8 runtime-read pattern (`07-01: Settings read at call-time`).

### Pattern 3: SettingsPanel Toggle Wiring

The SettingsPanel has a fixed structure: render HTML → `saveSettingsHandler()` reads DOM. There are two parts:

**HTML (in the Terminal Settings section, after `terminal-context-menu-toggle`):**
```html
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
```

**saveSettingsHandler (read DOM value):**
```js
const tabRenameSlashToggle = document.getElementById('tab-rename-slash-toggle');
const newTabRenameOnSlashCommand = tabRenameSlashToggle ? tabRenameSlashToggle.checked : false;
// ... add to newSettings object:
tabRenameOnSlashCommand: newTabRenameOnSlashCommand,
```

Note: `autoSave` wiring is already present — `container.querySelectorAll('.settings-toggle input, .settings-select').forEach(el => el.addEventListener('change', autoSave))` — so the new checkbox is automatically covered.

### Anti-Patterns to Avoid

- **Caching the setting at wire-time:** Do NOT do `const enabled = getSetting('tabRenameOnSlashCommand')` at the top of `wireTabRenameConsumer()`. Always read at event dispatch time so the toggle takes effect immediately without a page reload. (Matches Phase 7.1 decision.)
- **Using ScrapingProvider's PROMPT_SUBMIT:** Scraping emits `{ prompt: null }` — there is no prompt text available. The consumer must guard `if (e.source !== 'hooks') return`. This means the feature only works when hooks are enabled (which is exactly when HooksProvider is active and the UserPromptSubmit hook fires).
- **Touching the `extractTitleFromInput()` function:** The existing logic that reads `inputBuffer` on Enter explicitly skips slash commands. Leave it alone — it handles the default-off behavior for regular prompts.
- **Resetting tab name on /clear:** The user explicitly decided `/clear` must NOT reset the tab. Do not add any reset logic on session events. The name persists until the next slash command or PTY restart.
- **New PTY restart (session restart):** On PTY creation, the tab name is initialized to `customName || project.name` (TerminalManager.js line 1344). This already handles the "reverts to project name" requirement naturally — no extra code needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal ID resolution | Custom projectId→terminalId lookup | `findClaudeTerminalForProject()` already in events/index.js | Already handles latest-terminal-ID heuristic, multi-terminal edge case |
| Tab DOM update | Custom querySelector + textContent | `TerminalManager.updateTerminalTabName(id, name)` | Already handles both state update and DOM .tab-name span |
| Prompt text capture | New IPC or hook changes | `PROMPT_SUBMIT` event already has `e.data.prompt` from HooksProvider | Hook pipeline already delivers full prompt including arguments |

## Common Pitfalls

### Pitfall 1: PROMPT_SUBMIT fires from both providers, only hooks has prompt text

**What goes wrong:** The `PROMPT_SUBMIT` event is emitted by both HooksProvider and ScrapingProvider. HooksProvider sets `{ prompt: stdin.prompt || null }` (real text). ScrapingProvider sets `{ prompt: null }`. If the consumer doesn't check `e.source !== 'hooks'`, it may try to process a null prompt.

**How to avoid:** Guard with `if (e.source !== 'hooks') return` before checking prompt. Then additionally guard `if (!prompt || !prompt.trimStart().startsWith('/')) return`.

### Pitfall 2: Feature silently no-ops when hooks are disabled

**What goes wrong:** If the user has hooks disabled (hooksEnabled: false), no UserPromptSubmit hook fires, so PROMPT_SUBMIT with prompt text never arrives. The tab rename toggle appears in settings but never does anything.

**How to avoid:** This is expected behavior — the feature depends on hooks being enabled. No special handling is needed, but consider whether the toggle should be visually disabled/greyed out when hooksEnabled is false. This is left to Claude's discretion.

### Pitfall 3: Very long slash command strings overflow the tab

**What goes wrong:** A command like `/gsd:verify-work 12 --verbose --with-a-very-long-argument-list` would overflow the tab's fixed-width label.

**How to avoid:** Truncate to ~40 characters with a trailing `…` (Unicode U+2026, not three dots). This is a Claude's Discretion item. 40 chars covers `/gsd:verify-work 12` (20 chars) with room to spare.

### Pitfall 4: The lazy require circular dependency

**What goes wrong:** `TerminalManager.js` and `events/index.js` require each other. A top-level `const TerminalManager = require(...)` at module scope would fail.

**How to avoid:** Follow the established pattern — use a lazy `require()` inside the event callback function, wrapped in a try/catch. This is identical to how `wireTerminalStatusConsumer` and `wireSessionIdCapture` call `TerminalManager` and `TerminalSessionService` respectively.

### Pitfall 5: Prompt includes paste artifacts or multiline content

**What goes wrong:** `stdin.prompt` from the `UserPromptSubmit` hook contains the full prompt text. If a user pastes multiple lines before a slash command, the prompt might include preamble.

**How to avoid:** Use `prompt.trimStart().startsWith('/')` to handle leading whitespace. The truncation rule handles excessively long inputs. No need to handle multiline specially — just truncate.

## Code Examples

### Wiring the consumer (verified against existing pattern)

```js
// Source: src/renderer/events/index.js — wireTerminalStatusConsumer() pattern
function wireTabRenameConsumer() {
  const MAX_TAB_NAME_LEN = 40;
  consumerUnsubscribers.push(
    eventBus.on(EVENT_TYPES.PROMPT_SUBMIT, (e) => {
      if (e.source !== 'hooks') return;
      if (!e.projectId) return;
      const prompt = e.data?.prompt;
      if (!prompt || !prompt.trimStart().startsWith('/')) return;
      const { getSetting } = require('../state/settings.state');
      if (!getSetting('tabRenameOnSlashCommand')) return;
      const terminalId = findClaudeTerminalForProject(e.projectId);
      if (!terminalId) return;
      const name = prompt.length > MAX_TAB_NAME_LEN
        ? prompt.slice(0, MAX_TAB_NAME_LEN - 1) + '\u2026'
        : prompt;
      try {
        const TerminalManager = require('../ui/components/TerminalManager');
        TerminalManager.updateTerminalTabName(terminalId, name);
      } catch (err) { /* TerminalManager not ready */ }
    })
  );
}
```

### Adding to initClaudeEvents()

```js
// Source: src/renderer/events/index.js — initClaudeEvents()
function initClaudeEvents() {
  wireTimeTrackingConsumer();
  wireNotificationConsumer();
  wireAttentionConsumer();
  wireDashboardStatsConsumer();
  wireTerminalStatusConsumer();
  wireSessionIdCapture();
  wireTabRenameConsumer();   // ← ADD THIS
  wireDebugListener();
  activateProvider(hooksEnabled ? 'hooks' : 'scraping');
}
```

### Default setting (settings.state.js)

```js
// Source: src/renderer/state/settings.state.js — defaultSettings
tabRenameOnSlashCommand: false,   // ← opt-in, default OFF
```

### i18n keys (en.json placement)

Insert after `updateTitleOnProjectSwitchDesc` at line 542:
```json
"tabRenameOnSlashCommand": "Rename tab on slash command",
"tabRenameOnSlashCommandDesc": "Automatically rename the terminal tab to the last slash command executed (e.g. /gsd:verify-work 12)",
```

### i18n keys (fr.json placement)

Insert at corresponding location after `updateTitleOnProjectSwitchDesc`:
```json
"tabRenameOnSlashCommand": "Renommer l'onglet sur commande slash",
"tabRenameOnSlashCommandDesc": "Renomme automatiquement l'onglet terminal avec la dernière commande slash exécutée (ex. /gsd:verify-work 12)",
```

## Open Questions

1. **Should the toggle be visually disabled when hooksEnabled is false?**
   - What we know: The feature only works with hooks enabled; ScrapingProvider emits `prompt: null`
   - What's unclear: Whether a greyed-out/disabled toggle with a tooltip helps UX or overcomplicates SettingsPanel
   - Recommendation: Leave it simple for now — toggle is always clickable, but if hooks are off the feature silently no-ops. A descriptive `settingsDesc` string noting "requires hooks" is sufficient.

2. **Apply truncation at 40 chars or leave it to natural CSS overflow?**
   - What we know: The CSS for `.tab-name` uses `overflow: hidden; text-overflow: ellipsis` in the existing terminal CSS (inferred from terminal.css size)
   - What's unclear: Whether CSS ellipsis alone is sufficient or if long names break layout
   - Recommendation: Apply a 40-char JS truncation as a safety net. CSS handles display; JS truncation keeps the stored name clean.

## Sources

### Primary (HIGH confidence)

- `src/renderer/events/index.js` — wireTerminalStatusConsumer, wireSessionIdCapture, findClaudeTerminalForProject patterns (direct code read)
- `src/renderer/events/HooksProvider.js` — UserPromptSubmit → PROMPT_SUBMIT payload `{ prompt: stdin.prompt || null }` (direct code read)
- `src/renderer/events/ClaudeEventBus.js` — EVENT_TYPES, event envelope shape (direct code read)
- `src/renderer/ui/components/TerminalManager.js` — updateTerminalTabName, extractTitleFromInput (explicit slash skip at line 970), inputBuffer pattern (direct code read)
- `src/renderer/state/settings.state.js` — defaultSettings shape, getSetting, runtime-read pattern (direct code read)
- `src/renderer/ui/panels/SettingsPanel.js` — Terminal Settings section HTML (line 436-455), saveSettingsHandler wiring (lines 1060-1163) (direct code read)
- `src/renderer/i18n/locales/en.json` — Key placement at lines 539-542 (direct code read)
- `.planning/STATE.md` — Phase 07-01 decision: "Settings read at call-time (getSetting at runtime) in key handler — toggles take effect immediately without re-attaching xterm handlers"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components verified by direct code read
- Architecture: HIGH — consumer pattern verified against 6 existing consumer functions in events/index.js
- Pitfalls: HIGH — circular dep pitfall verified against Phase 4/5/6 accumulated decisions in STATE.md

**Research date:** 2026-02-25
**Valid until:** 2026-03-27 (stable codebase, 30-day window)
