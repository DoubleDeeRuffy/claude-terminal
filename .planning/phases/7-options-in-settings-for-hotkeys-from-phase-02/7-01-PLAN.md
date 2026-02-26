---
phase: 7-options-in-settings-for-hotkeys-from-phase-02
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/state/settings.state.js
  - src/renderer/ui/panels/ShortcutsManager.js
  - src/renderer/ui/components/TerminalManager.js
  - src/renderer/i18n/locales/en.json
  - src/renderer/i18n/locales/fr.json
autonomous: true
requirements: [TERM-V2-01]

must_haves:
  truths:
    - "User sees a Terminal Shortcuts section in the Shortcuts settings panel with 6 hotkey rows"
    - "User can toggle each terminal hotkey on/off individually via enable/disable controls"
    - "User can rebind Ctrl+C copy and Ctrl+V paste to different key combinations via the existing capture overlay"
    - "Rebinding a terminal shortcut to an already-used key shows a conflict error and is rejected"
    - "Disabling a terminal hotkey (e.g. Ctrl+C copy) makes it stop working in the terminal immediately"
    - "Right-click copy/paste (Windows Terminal style) works when enabled: copies selection if text selected, pastes if none"
    - "Right-click copy/paste is disabled by default on fresh install"
    - "Existing users keep all 5 Phase 02 hotkeys active (defaults are enabled: true)"
  artifacts:
    - path: "src/renderer/state/settings.state.js"
      provides: "terminalShortcuts defaults in defaultSettings with per-shortcut deep-merge on load"
      contains: "terminalShortcuts"
    - path: "src/renderer/ui/panels/ShortcutsManager.js"
      provides: "TERMINAL_SHORTCUTS map with rebindable:true for ctrlC/ctrlV, Terminal Shortcuts section with rebind buttons and enable toggles"
      contains: "TERMINAL_SHORTCUTS"
    - path: "src/renderer/ui/components/TerminalManager.js"
      provides: "Settings-gated hotkeys in createTerminalKeyHandler (with rebound key matching for ctrlC/ctrlV) and priority-chain in setupRightClickHandler"
      contains: "terminalShortcuts"
  key_links:
    - from: "src/renderer/ui/panels/ShortcutsManager.js"
      to: "src/renderer/state/settings.state.js"
      via: "setProp('terminalShortcuts', ...) on toggle change and rebind capture"
      pattern: "setProp.*terminalShortcuts"
    - from: "src/renderer/ui/components/TerminalManager.js"
      to: "src/renderer/state/settings.state.js"
      via: "getSetting('terminalShortcuts') at call-time in key handler, comparing rebound key for ctrlC/ctrlV"
      pattern: "getSetting.*terminalShortcuts"
---

<objective>
Add terminal shortcut settings (enable/disable toggles and rebinding for Ctrl+C/Ctrl+V) to the ShortcutsManager panel, gate all Phase 02 hotkeys on those settings in TerminalManager, and implement the new right-click copy/paste (Windows Terminal style) behavior.

Purpose: Users can control which terminal keyboard shortcuts are active, rebind Ctrl+C copy and Ctrl+V paste to different key combinations, and gain the new Windows Terminal-style right-click behavior as an opt-in feature.
Output: Terminal Shortcuts section in settings, 6 configurable hotkeys (2 rebindable), settings-gated enforcement in terminal key handler.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/7-options-in-settings-for-hotkeys-from-phase-02/7-RESEARCH.md
@src/renderer/state/settings.state.js
@src/renderer/ui/panels/ShortcutsManager.js
@src/renderer/ui/components/TerminalManager.js
@src/renderer/i18n/locales/en.json
@src/renderer/i18n/locales/fr.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add terminalShortcuts to settings state, TERMINAL_SHORTCUTS map with rebind support to ShortcutsManager, and i18n keys</name>
  <files>
    src/renderer/state/settings.state.js
    src/renderer/ui/panels/ShortcutsManager.js
    src/renderer/i18n/locales/en.json
    src/renderer/i18n/locales/fr.json
  </files>
  <action>
**settings.state.js:**
1. Add `terminalShortcuts` to `defaultSettings`:
```js
terminalShortcuts: {
  ctrlC:              { enabled: true  },
  ctrlV:              { enabled: true  },
  ctrlArrow:          { enabled: true  },
  ctrlTab:            { enabled: true  },
  rightClickPaste:    { enabled: true  },
  rightClickCopyPaste:{ enabled: false }
}
```
Note: `ctrlC` and `ctrlV` do NOT have a `key` property in defaults. Their default keys come from `TERMINAL_SHORTCUTS[id].key` in ShortcutsManager. When a user rebinds, the custom key is stored as e.g. `{ enabled: true, key: 'Ctrl+Shift+C' }`.

2. In the settings loading/merge logic, add explicit deep-merge for `terminalShortcuts` so that existing users who have no `terminalShortcuts` key (or a partial one) get correct defaults. After the main shallow merge, add:
```js
if (saved.terminalShortcuts) {
  merged.terminalShortcuts = { ...defaultSettings.terminalShortcuts, ...saved.terminalShortcuts };
}
```
This deep-merges per-shortcut (preserving custom `key` property alongside `enabled`) and prevents the shallow-merge pitfall described in Research pitfall #4.

**ShortcutsManager.js:**
1. Add a `TERMINAL_SHORTCUTS` constant map at module level:
```js
const TERMINAL_SHORTCUTS = {
  ctrlC:              { key: 'Ctrl+C',         labelKey: 'shortcuts.termCtrlC',              enabledByDefault: true,  rebindable: true  },
  ctrlV:              { key: 'Ctrl+V',         labelKey: 'shortcuts.termCtrlV',              enabledByDefault: true,  rebindable: true  },
  ctrlArrow:          { key: 'Ctrl+Left/Right',labelKey: 'shortcuts.termCtrlArrow',           enabledByDefault: true,  rebindable: false },
  ctrlTab:            { key: 'Ctrl+Tab',       labelKey: 'shortcuts.termCtrlTab',             enabledByDefault: true,  rebindable: false },
  rightClickPaste:    { key: 'RightClick',     labelKey: 'shortcuts.termRightClickPaste',     enabledByDefault: true,  rebindable: false },
  rightClickCopyPaste:{ key: 'RightClick',     labelKey: 'shortcuts.termRightClickCopyPaste', enabledByDefault: false, rebindable: false }
};
```
Note: `ctrlC` and `ctrlV` are `rebindable: true` per user decision ("full rebinding supported"). The rebind button reuses the existing `startShortcutCapture` overlay from ShortcutsManager — when the user captures a new key combo, it is stored in `settings.terminalShortcuts[id].key` (e.g. `{ enabled: true, key: 'Ctrl+Shift+C' }`). Conflict checking via `checkShortcutConflict` prevents duplicate bindings. `ctrlArrow` and `ctrlTab` are `rebindable: false` due to architecture constraints (main-process intercept / dual-key). `rightClick*` are `rebindable: false` (mouse events).

2. In `renderShortcutsPanel()`, after the existing shortcuts section, add a "Terminal Shortcuts" section. Render it under a new `<div class="settings-group-title">` with header text from `t('shortcuts.terminalShortcuts')`. For each entry in TERMINAL_SHORTCUTS, render a row with:
   - Label from `t(entry.labelKey)`
   - Key display: For entries with `rebindable: true` (ctrlC, ctrlV), render an interactive rebind button (same style as existing shortcut rows in DEFAULT_SHORTCUTS) showing the current key from `getSetting('terminalShortcuts')?.[id]?.key || entry.key`. Clicking the button calls the existing `startShortcutCapture` overlay flow. On capture complete, store the normalized key in `settings.terminalShortcuts[id].key` via `settingsState.setProp('terminalShortcuts', updated)` then `saveSettings()`. Before applying, run `checkShortcutConflict` against both DEFAULT_SHORTCUTS and TERMINAL_SHORTCUTS maps. If conflict, show the existing conflict error and reject the rebind. For entries with `rebindable: false`, show a static (non-interactive) key label with `entry.key`.
   - An enable/disable toggle (checkbox or toggle switch matching existing UI patterns like the `terminalContextMenu` toggle in SettingsPanel)
   - The toggle reads from `getSetting('terminalShortcuts')?.[id]?.enabled` (default to `entry.enabledByDefault` if undefined)
   - On toggle change: read current `terminalShortcuts` from settings, update the specific `[id].enabled`, write back via `settingsState.setProp('terminalShortcuts', updated)` then `saveSettings()`

3. Extend `checkShortcutConflict` (or add a parallel check) so that when checking for conflicts, it also checks against enabled terminal shortcuts. This works bidirectionally: global shortcut rebinds are checked against terminal shortcuts, and terminal shortcut rebinds (ctrlC/ctrlV) are checked against global shortcuts and other terminal shortcuts. For terminal shortcuts, use their current key: `getSetting('terminalShortcuts')?.[id]?.key || entry.key`. Return a conflict message if found.

**i18n en.json — add under `"shortcuts"` section:**
```json
"terminalShortcuts": "Terminal Shortcuts",
"termCtrlC": "Copy selection (Ctrl+C)",
"termCtrlV": "Paste (Ctrl+V)",
"termCtrlArrow": "Word jump (Ctrl+←/→)",
"termCtrlTab": "Switch terminal tab (Ctrl+Tab)",
"termRightClickPaste": "Right-click paste",
"termRightClickCopyPaste": "Right-click copy/paste (Windows Terminal style)",
"termShortcutEnabled": "Enabled",
"termShortcutDisabled": "Disabled"
```

**i18n fr.json — same keys in French:**
```json
"terminalShortcuts": "Raccourcis terminal",
"termCtrlC": "Copier la sélection (Ctrl+C)",
"termCtrlV": "Coller (Ctrl+V)",
"termCtrlArrow": "Saut de mot (Ctrl+←/→)",
"termCtrlTab": "Changer d'onglet terminal (Ctrl+Tab)",
"termRightClickPaste": "Clic droit pour coller",
"termRightClickCopyPaste": "Clic droit copier/coller (style Windows Terminal)",
"termShortcutEnabled": "Activé",
"termShortcutDisabled": "Désactivé"
```
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && npm run build:renderer 2>&amp;1 | tail -5</automated>
    <manual>Verify TERMINAL_SHORTCUTS constant exists, terminalShortcuts in defaultSettings, i18n keys in both locale files</manual>
  </verify>
  <done>TERMINAL_SHORTCUTS map defined in ShortcutsManager with 6 entries (ctrlC and ctrlV rebindable:true). terminalShortcuts in defaultSettings with per-shortcut deep-merge. Terminal Shortcuts section renders in shortcuts panel with enable/disable toggles and interactive rebind buttons for ctrlC/ctrlV. Bidirectional conflict checking active. i18n keys present in en.json and fr.json. Renderer builds cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Gate Phase 02 hotkeys on settings in TerminalManager (with rebound key matching) and implement rightClickCopyPaste</name>
  <files>
    src/renderer/ui/components/TerminalManager.js
  </files>
  <action>
**createTerminalKeyHandler -- gate each hotkey on settings with rebound key support:**

At the top of the handler function returned by `createTerminalKeyHandler`, read terminal shortcuts settings once:
```js
const ts = getSetting('terminalShortcuts') || {};
```

Also define a helper to match a keyboard event against a stored key string (for rebound ctrlC/ctrlV). The default keys must be available without importing ShortcutsManager to avoid circular dependencies:
```js
const TERM_DEFAULT_KEYS = { ctrlC: 'Ctrl+C', ctrlV: 'Ctrl+V' };

function matchesTerminalShortcut(e, shortcutId, ts) {
  const storedKey = ts[shortcutId]?.key; // only set when user has rebound
  if (!storedKey) return false; // no custom key -- caller uses original hardcoded check
  const eventKey = getKeyFromEvent(e); // reuse existing normalizer from KeyboardShortcuts
  return eventKey === storedKey;
}
```

Then gate each Phase 02 hotkey:

1. **Ctrl+C copy** (around line 622-656): The handler must support both the default key and rebound keys:
```js
const ctrlCRebound = ts.ctrlC?.key && ts.ctrlC.key !== 'Ctrl+C';
if (ctrlCRebound) {
  if (matchesTerminalShortcut(e, 'ctrlC', ts) && ts.ctrlC?.enabled !== false) {
    const selection = terminal.getSelection();
    if (selection) { /* copy logic */ return false; }
    return true;
  }
  if (e.key.toLowerCase() === 'c') return true; // rebound, so original Ctrl+C passes as SIGINT
} else if (e.key.toLowerCase() === 'c') {
  if (ts.ctrlC?.enabled === false) return true; // disabled -> pass SIGINT through to PTY
  const selection = terminal.getSelection();
  if (selection) { /* existing copy logic */ return false; }
  return true;
}
```

2. **Ctrl+V paste**: Same pattern as Ctrl+C. Check `ts.ctrlV?.key` for rebound key, otherwise use existing `e.key.toLowerCase() === 'v'` check. Gate on `ts.ctrlV?.enabled === false`.

3. **Ctrl+Arrow word-jump**: In the Ctrl+Left/Right handler block (the escape sequence sending), add:
```js
if (ts.ctrlArrow?.enabled === false) return true; // disabled -> pass through to PTY
```
When disabled, Ctrl+Arrow does not send word-jump escape sequences. No rebind support needed (rebindable: false).

**setupRightClickHandler — rewrite as priority chain:**

The existing `setupRightClickHandler` (or `setupRightClickPaste` depending on the current function name) needs to become a priority-based decision tree. Replace the body of the contextmenu listener with:

```js
wrapper.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const ts = getSetting('terminalShortcuts') || {};

  // Priority 1: Windows Terminal copy-or-paste (new, disabled by default)
  if (ts.rightClickCopyPaste?.enabled) {
    const selection = terminal.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection)
        .catch(() => api.app.clipboardWrite(selection));
      terminal.clearSelection();
    } else {
      performPaste(terminalId, inputChannel);
    }
    return;
  }

  // Priority 2: Legacy instant paste (Phase 02 behavior, enabled by default)
  if (ts.rightClickPaste?.enabled !== false && !getSetting('terminalContextMenu')) {
    performPaste(terminalId, inputChannel);
    return;
  }

  // Priority 3: Context menu (when terminalContextMenu setting is true)
  if (getSetting('terminalContextMenu')) {
    // ... existing context menu rendering code stays here unchanged
  }
});
```

IMPORTANT: The `performPaste` function used above must reference the existing paste helper that uses `api.app.clipboardRead()` (IPC path, NOT `navigator.clipboard.readText()`). Check the existing code for the exact function name and ensure the same debounce mechanism (`lastPasteTime`/`PASTE_DEBOUNCE_MS`) applies to the new copy/paste path too.

IMPORTANT: The `rightClickCopyPaste` copy branch uses `navigator.clipboard.writeText` with `api.app.clipboardWrite` fallback (same pattern as Ctrl+C copy in the key handler). This is for WRITING to clipboard which works fine, unlike reading which needs IPC.

The priority chain means:
- `rightClickCopyPaste` enabled → always use Windows Terminal behavior (copy-if-selection, paste-if-none), regardless of `terminalContextMenu`
- `rightClickCopyPaste` disabled + `rightClickPaste` enabled + `terminalContextMenu` off → instant paste (legacy Phase 02)
- Both right-click settings disabled + `terminalContextMenu` on → show context menu
- All disabled → `e.preventDefault()` still fires (no default context menu) but no action

Apply this priority chain at ALL call sites where `setupRightClickPaste`/`setupRightClickHandler` is called (there are 5 call sites per Phase 02-03 summary: regular terminals, Claude resume, debug/prompt, FiveM/WebApp, PTY). If the function is defined once and called at multiple sites, only the function body needs changing.
  </action>
  <verify>
    <automated>cd C:/Users/uhgde/source/repos/claude-terminal && npm run build:renderer 2>&amp;1 | tail -5 && npm test 2>&amp;1 | tail -10</automated>
    <manual>Verify getSetting('terminalShortcuts') appears in createTerminalKeyHandler and setupRightClickHandler. Verify ctrlC/ctrlV handlers check ts[id]?.key for rebound keys. Verify the priority chain has 3 branches.</manual>
  </verify>
  <done>All 5 renderer-side terminal hotkeys gated on `getSetting('terminalShortcuts')` in createTerminalKeyHandler. ctrlC and ctrlV handlers match against stored rebound key when present, falling back to hardcoded default for zero-overhead common case. setupRightClickHandler rewritten as 3-priority chain with rightClickCopyPaste as Priority 1. Renderer builds and tests pass.</done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` succeeds with no errors
2. `npm test` passes (all existing tests)
3. grep confirms `TERMINAL_SHORTCUTS` exists in ShortcutsManager.js
4. grep confirms `terminalShortcuts` in settings.state.js defaultSettings
5. grep confirms `getSetting('terminalShortcuts')` in TerminalManager.js (at least 4 occurrences — one per hotkey + right-click handler)
6. grep confirms rebound key matching logic in TerminalManager.js (e.g. `ts.ctrlC?.key` or `matchesTerminalShortcut`)
7. grep confirms i18n keys `termCtrlC`, `termCtrlV`, etc. in both en.json and fr.json
</verification>

<success_criteria>
- Terminal Shortcuts section renders in ShortcutsManager panel with 6 rows
- Each row has an enable/disable toggle
- ctrlC and ctrlV rows have interactive rebind buttons using the existing capture overlay
- Rebinding ctrlC or ctrlV to an already-used key shows a conflict error
- Rebound keys are respected in the terminal key handler (e.g. rebinding copy to Ctrl+Shift+C works)
- Disabling Ctrl+C/Ctrl+V/Ctrl+Arrow in settings makes the handler pass through (no copy/paste/word-jump)
- rightClickCopyPaste (Windows Terminal style) works when enabled
- rightClickCopyPaste is disabled by default
- Existing users retain all 5 Phase 02 hotkeys active
- Renderer builds and all tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/7-options-in-settings-for-hotkeys-from-phase-02/7-01-SUMMARY.md`
</output>
