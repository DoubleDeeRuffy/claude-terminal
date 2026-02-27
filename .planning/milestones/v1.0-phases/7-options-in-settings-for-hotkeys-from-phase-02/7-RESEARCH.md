# Phase 7: Options in Settings for Hotkeys from Phase 02 - Research

**Researched:** 2026-02-25
**Domain:** Electron renderer — xterm.js custom key handler + ShortcutsManager panel + settings state
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Hotkey scope:** All 5 Phase 02 hotkeys are configurable: Ctrl+C copy, Ctrl+V paste, right-click paste, Ctrl+Arrow word-jump, Ctrl+Tab tab-switching. Plus one new hotkey: right-click copies selected text (if selection exists) AND pastes (if no selection) — Windows Terminal behavior. Total: 6 configurable terminal hotkeys.
- **Full rebinding supported** — reuse the existing ShortcutsManager rebinding infrastructure.
- **Settings UI:** Terminal hotkeys appear in the existing Shortcuts panel (ShortcutsManager), grouped under a separate "Terminal Shortcuts" heading/section within the panel.
- **No master toggle** — each hotkey has its own individual enable/disable and rebind controls.
- **Default behavior:** On fresh install, all hotkeys enabled by default EXCEPT right-click copy/paste (disabled by default — non-standard behavior could surprise users). Existing users keep current behavior (all 5 Phase 02 hotkeys remain active).
- **Reset-to-defaults** uses the existing ShortcutsManager pattern — no new UI needed.
- **Conflict handling:** Block with error when a user tries to rebind to a key combination already used by another shortcut. No protected list — users can override global app shortcuts if they choose.

### Claude's Discretion

None specified.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

## Summary

Phase 7 adds configurable enable/disable and rebinding for the 6 terminal hotkeys that Phase 02 implemented. The work touches four layers: (1) `ShortcutsManager.js` — add a "Terminal Shortcuts" section with enable/disable toggles plus rebind buttons; (2) `TerminalManager.js` — make `createTerminalKeyHandler`, `setupRightClickHandler`, and the Ctrl+Tab IPC path gate on settings at call-time rather than hardcoded; (3) `MainWindow.js` — the `before-input-event` Ctrl+Tab intercept must be disabled when the user turns off tab-switching; (4) `settings.state.js` + i18n — add new defaults and translation keys.

The right-click "Windows Terminal" behavior (copy-if-selection, paste-if-none) is a **new feature** on top of the existing context-menu toggle. It must be implemented as a separate enabled/disabled hotkey with its own key in settings, and its behavior must be merged with the existing `getSetting('terminalContextMenu')` guard in `setupRightClickHandler`.

The Ctrl+Tab hotkey is the most architecturally complex because it is intercepted in the **main process** (`MainWindow.js` `before-input-event`), not in the renderer. Disabling it requires a settings value that is accessible to the main process. The current architecture passes settings only to the renderer; the main process has no live read of settings. The cleanest solution without a large refactor is to have the renderer send an IPC message to the main process whenever the Ctrl+Tab setting changes, toggling the interception on/off.

**Primary recommendation:** Use the existing ShortcutsManager pattern (DEFAULT_SHORTCUTS map, per-shortcut enable flag in settings, `checkShortcutConflict`, `applyShortcut`) as the model. Add a parallel `TERMINAL_SHORTCUTS` map with `enabled` defaults. Gate the 5 renderer-side hotkeys in `createTerminalKeyHandler`/`setupRightClickHandler` by checking `getSetting('terminalShortcuts')` at call-time. For Ctrl+Tab, wire a `terminal.setCtrlTabEnabled` IPC channel from renderer → main process.

---

## Standard Stack

### Core
| Component | Location | Purpose | Notes |
|-----------|----------|---------|-------|
| `ShortcutsManager.js` | `src/renderer/ui/panels/ShortcutsManager.js` | Renders shortcut rows, handles capture, conflict check, reset | Existing; extend with Terminal section |
| `KeyboardShortcuts.js` | `src/renderer/features/KeyboardShortcuts.js` | Normalizes keys, manages global shortcut map | Existing; no changes needed for terminal shortcuts (terminal shortcuts bypass this system via `attachCustomKeyEventHandler`) |
| `TerminalManager.js` | `src/renderer/ui/components/TerminalManager.js` | `createTerminalKeyHandler`, `setupRightClickHandler` | The actual enforcement point for 5 of 6 hotkeys |
| `MainWindow.js` | `src/main/windows/MainWindow.js` | `before-input-event` Ctrl+Tab intercept | Must be togglable via IPC for the tab-switch hotkey |
| `settings.state.js` | `src/renderer/state/settings.state.js` | `defaultSettings` object, `getSetting()` | Add `terminalShortcuts` object here |
| i18n locales | `src/renderer/i18n/locales/en.json` + `fr.json` | Translation keys | Add keys under `shortcuts.*` section |

### No New Dependencies

No npm packages needed. Everything reuses existing infrastructure.

---

## Architecture Patterns

### How the existing ShortcutsManager works (HIGH confidence — direct code read)

`DEFAULT_SHORTCUTS` is a plain object keyed by shortcut ID, each entry has `{ key, labelKey }`. The user's overrides are stored under `settings.shortcuts[id]`. The panel renders a row per entry with a key-capture button and an optional reset button. `applyShortcut` writes to `settings.shortcuts` and calls `registerAllShortcuts()` which re-applies all shortcuts to the global `KeyboardShortcuts` map.

Terminal shortcuts are **different from global shortcuts** in one critical way: they are not in the `KeyboardShortcuts` map (which fires on `document.addEventListener('keydown')`). They live inside xterm.js's `attachCustomKeyEventHandler` callback (`createTerminalKeyHandler`) and in DOM-level `contextmenu` listeners (`setupRightClickHandler`). The ShortcutsManager's `registerAllShortcuts()` path is therefore **not used** for terminal shortcuts — the terminal key handler reads settings at call-time via `getSetting()`.

### Pattern: Per-shortcut enable/disable flag

The CONTEXT.md requires each hotkey to have its own enable/disable control, not just a key rebind. The cleanest storage model that mirrors the existing `shortcuts: {}` pattern is a new `terminalShortcuts` settings key:

```js
// In defaultSettings (settings.state.js)
terminalShortcuts: {
  ctrlC:       { enabled: true,  key: 'Ctrl+C' },
  ctrlV:       { enabled: true,  key: 'Ctrl+V' },
  ctrlArrow:   { enabled: true,  key: 'Ctrl+Left/Right' },  // display-only — always both arrows
  ctrlTab:     { enabled: true,  key: 'Ctrl+Tab' },
  rightClick:  { enabled: true,  key: 'RightClick' },       // legacy paste behavior
  rightClickCopyPaste: { enabled: false, key: 'RightClick' }, // new Windows Terminal behavior
}
```

**Important:** `rightClick` (legacy) and `rightClickCopyPaste` (new) are mutually exclusive. The `setupRightClickHandler` already has a `getSetting('terminalContextMenu')` branch. Phase 7 must integrate with that branch — the right-click behavior is now: (1) if `rightClickCopyPaste` enabled → copy-if-selection/paste-if-none; (2) else if `rightClick` enabled → instant paste (legacy); (3) else if `terminalContextMenu` is true → show context menu with no right-click paste action; (4) else → no-op.

Actually, re-reading the CONTEXT.md more carefully: the 6 hotkeys are distinct items. `rightClick` (paste) from Phase 02 and the new `rightClickCopyPaste` (copy-or-paste) are counted separately. The simplest model that avoids confusion:

```
terminal hotkey IDs (6 total):
  ctrlC           → Ctrl+C  (copy if selection, SIGINT if none)
  ctrlV           → Ctrl+V  (paste)
  ctrlArrow       → Ctrl+Left/Right  (word-jump)
  ctrlTab         → Ctrl+Tab  (tab-switching)
  rightClickPaste → RightClick  (legacy instant paste from Phase 02-03)
  rightClickCopyPaste → RightClick  (new Windows Terminal behavior — disabled by default)
```

These last two share the same physical key (right-click). They cannot both be enabled simultaneously. The UI must show one toggle per row but with a note, or show them as a radio choice. Given the "no master toggle" constraint, presenting them as two separate rows that conflict with each other is the simplest approach — the existing conflict-check mechanism will prevent both from being enabled.

### Pattern: Reading settings in createTerminalKeyHandler

`createTerminalKeyHandler` already calls `getSetting()` for `terminalContextMenu`. All guards must call `getSetting('terminalShortcuts')` at the top of the handler and destructure:

```js
function createTerminalKeyHandler(terminal, terminalId, inputChannel = 'terminal-input') {
  return (e) => {
    const ts = getSetting('terminalShortcuts') || {};
    // ...
    if (e.key.toLowerCase() === 'c' && e.ctrlKey) {
      if (ts.ctrlC?.enabled === false) return true; // pass through to PTY
      // ... existing copy logic
    }
    // etc.
  };
}
```

**Key insight:** `getSetting()` reads live from `settingsState.get()` so no re-attachment of the handler is needed when settings change. The handler closure captures nothing — it reads fresh on every keydown.

### Pattern: Ctrl+Tab via IPC to main process

The Ctrl+Tab intercept is in `MainWindow.js` `before-input-event`. The main process does not import `settings.state.js`. Two options:

**Option A (recommended):** Keep a module-level boolean in `MainWindow.js` (`let ctrlTabEnabled = true`). Expose an IPC handler `terminal:setCtrlTabEnabled` (or similar in `dialog.ipc.js`). When the renderer saves settings with `ctrlTab.enabled` changed, send this IPC. On app startup, send the initial value after settings load.

**Option B:** Skip the main-process intercept entirely when disabled and just block the key in the renderer — but this fails because Chromium eats Ctrl+Tab before xterm ever sees it. The main-process intercept is non-optional for this key.

Option A is the established pattern: `before-input-event` + IPC channel. The renderer already calls IPC for many settings-driven side effects.

### Where to add the IPC handler

`src/main/ipc/dialog.ipc.js` already handles misc window/system operations. Adding one handler there:

```js
ipcMain.handle('terminal:setCtrlTabEnabled', (_, enabled) => {
  setCtrlTabEnabled(enabled); // MainWindow.js export
});
```

`MainWindow.js` exports `setCtrlTabEnabled(bool)` which updates the module-level flag. The `before-input-event` handler checks the flag.

### ShortcutsManager: Adding the Terminal Shortcuts section

`renderShortcutsPanel()` builds HTML from `DEFAULT_SHORTCUTS`. Add a second loop over `TERMINAL_SHORTCUTS` after a new `<div class="settings-group-title">` header. Each terminal shortcut row needs both:
1. An **enable/disable toggle** (checkbox or toggle) — absent from existing shortcut rows
2. A **rebind button** (same as existing rows, but only interactive when enabled)

The enable toggle updates `settings.terminalShortcuts[id].enabled` without going through `registerAllShortcuts()` (which is only for the global KeyboardShortcuts map).

The rebind captures a new key combination and updates `settings.terminalShortcuts[id].key`.

`checkShortcutConflict` must be extended to also check across the terminal shortcuts map, and vice versa.

### Anti-Patterns to Avoid

- **Attaching the key handler per-settings-change:** Do NOT re-call `attachCustomKeyEventHandler` when settings change. The handler already reads settings live via `getSetting()`. Re-attaching creates duplicate handlers.
- **Storing terminal shortcut keys in `settings.shortcuts`:** They live in `settings.terminalShortcuts` — separate namespace to avoid collisions and because the shape differs (has `enabled` field).
- **Reading terminal shortcut settings in `registerAllShortcuts`:** Terminal shortcuts are NOT in the `KeyboardShortcuts` global map. `registerAllShortcuts` does not need to know about them.
- **Relying on `navigator.clipboard` for right-click paste:** Phase 02-03's decision log explicitly states `api.app.clipboardRead()` is required because `navigator.clipboard` fails on focus loss during right-click in Electron. The new Windows Terminal right-click behavior must use the same fallback chain.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key capture overlay | Custom capture UI | Reuse existing `startShortcutCapture` in ShortcutsManager | Already handles ESC, modifier-only press, conflict display |
| Conflict detection | New conflict algorithm | Extend `checkShortcutConflict` to cover both maps | Simple iteration, already works |
| Settings persistence | Custom file write | `ctx.settingsState.setProp('terminalShortcuts', ...)` + `ctx.saveSettings()` | Same atomic write path as all other settings |
| Enable toggle UI | Radio buttons, dropdowns | Checkbox/toggle — same pattern as `terminalContextMenu` in SettingsPanel | Consistent with existing UI |

---

## Common Pitfalls

### Pitfall 1: Ctrl+Tab disable doesn't work because main process still intercepts
**What goes wrong:** User disables Ctrl+Tab in settings. The renderer respects the setting and would not switch terminals, but the main process `before-input-event` still calls `event.preventDefault()` and sends `ctrl-tab` IPC. The renderer receives the IPC message and calls `switchTerminal()` anyway — or the key never reaches xterm even if the handler tries to pass through.
**Why it happens:** `before-input-event` runs in the main process with no access to renderer settings.
**How to avoid:** Implement the `terminal:setCtrlTabEnabled` IPC channel (Option A above). The renderer fires this on startup and on every settings save that changes the value.
**Warning signs:** Ctrl+Tab still switches terminals after being disabled in settings.

### Pitfall 2: Right-click behavior conflict between `terminalContextMenu` and new hotkeys
**What goes wrong:** `setupRightClickHandler` has an existing branch on `getSetting('terminalContextMenu')`. The new `rightClickPaste` and `rightClickCopyPaste` hotkeys must integrate with this, not bypass it.
**Why it happens:** Two independent settings control right-click behavior — easy to accidentally double-fire.
**How to avoid:** Rewrite `setupRightClickHandler` as a single decision tree: check all relevant settings in one place and decide exactly one behavior. Document the precedence.

### Pitfall 3: Terminal shortcut keys using `normalizeKey` but arrow keys aren't in the normalizer
**What goes wrong:** Ctrl+Arrow "key" is stored as a display string `'Ctrl+Left/Right'` (not a real key combo). The rebind flow expects to capture a real combo.
**Why it happens:** The word-jump shortcut controls two keys simultaneously (Left and Right). Capturing either one in isolation doesn't cover both.
**How to avoid:** Treat `ctrlArrow` as a special non-rebindable shortcut with only an enable/disable toggle. The key display can be `'Ctrl+← / →'` and clicking the key button shows a message that this shortcut cannot be rebound (it always uses Ctrl+Arrow). Or allow rebinding to only one modifier+arrow pair and apply it to both directions. The simplest approach: enable/disable only, no rebind for this hotkey (mark it as `rebindable: false` in TERMINAL_SHORTCUTS).

### Pitfall 4: Existing users get right-click behavior changed
**What goes wrong:** `rightClickPaste` (legacy instant paste) was always-on before Phase 7. Phase 7 adds a setting for it. If the default is `enabled: true` but loading from saved settings gives `undefined` (no key present), the merge in `loadSettings` (`{ ...defaultSettings, ...saved }`) won't deep-merge the nested `terminalShortcuts` object — saved users get the whole saved `terminalShortcuts` or the whole default, not a merge.
**Why it happens:** `Object.assign`/spread is shallow. If a user has `terminalShortcuts: {}` or no `terminalShortcuts` key at all in their settings file, they'll use the full default (fine). But if they have a partial `terminalShortcuts` from a previous phase-7 partial save, the spread will not fill in missing sub-keys.
**How to avoid:** In `loadSettings`, deep-merge `terminalShortcuts` explicitly:
```js
if (saved.terminalShortcuts) {
  merged.terminalShortcuts = {
    ...defaultSettings.terminalShortcuts,
    ...saved.terminalShortcuts
  };
}
```
Or handle it in `getSetting('terminalShortcuts')` by falling back per-key.

### Pitfall 5: `checkShortcutConflict` only checks DEFAULT_SHORTCUTS
**What goes wrong:** User tries to rebind a terminal shortcut to `Ctrl+C`. The conflict check says "no conflict" because `Ctrl+C` is not in `DEFAULT_SHORTCUTS`. But it conflicts with the terminal Ctrl+C copy hotkey.
**Why it happens:** `checkShortcutConflict` only iterates `DEFAULT_SHORTCUTS`.
**How to avoid:** Extend the function to accept a union of both maps, or call two separate checks and merge results. Also check in the reverse direction: rebinding a global shortcut should warn if it conflicts with an enabled terminal shortcut.

---

## Code Examples

### Current createTerminalKeyHandler guard pattern (direct code read, lines 622-656)
```js
// Ctrl+C — selection-gated copy (TERM-01)
if (e.key.toLowerCase() === 'c') {
  const selection = terminal.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection)
      .catch(() => api.app.clipboardWrite(selection));
    terminal.clearSelection();
    return false;
  }
  return true; // no selection → let xterm send SIGINT to PTY
}
```

Phase 7 changes this to:
```js
if (e.key.toLowerCase() === 'c') {
  const ts = getSetting('terminalShortcuts') || {};
  if (ts.ctrlC?.enabled === false) return true; // disabled → always pass SIGINT through
  const selection = terminal.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection)
      .catch(() => api.app.clipboardWrite(selection));
    terminal.clearSelection();
    return false;
  }
  return true;
}
```

### Current setupRightClickHandler (lines 521-565)
```js
function setupRightClickHandler(wrapper, terminal, terminalId, inputChannel) {
  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!getSetting('terminalContextMenu')) {
      performPaste(terminalId, inputChannel); // legacy instant paste
      return;
    }
    // ... show context menu with copy/paste/selectAll items
  });
}
```

Phase 7 extends this to a priority chain:
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
  // Priority 2: Legacy instant paste (from Phase 02, enabled by default)
  if (ts.rightClickPaste?.enabled && !getSetting('terminalContextMenu')) {
    performPaste(terminalId, inputChannel);
    return;
  }
  // Priority 3: Context menu (existing behavior when terminalContextMenu=true)
  if (getSetting('terminalContextMenu')) {
    // ... show context menu
  }
});
```

### IPC for Ctrl+Tab enable/disable

**MainWindow.js additions:**
```js
let ctrlTabEnabled = true;

function setCtrlTabEnabled(enabled) {
  ctrlTabEnabled = enabled;
}

// In before-input-event:
if (input.key === 'Tab' && ctrlTabEnabled) {
  event.preventDefault();
  mainWindow.webContents.send('ctrl-tab', input.shift ? 'prev' : 'next');
  return;
}

module.exports = { createMainWindow, getMainWindow, setCtrlTabEnabled };
```

**dialog.ipc.js (or a new terminal.ipc.js handler):**
```js
ipcMain.handle('terminal:setCtrlTabEnabled', (_, enabled) => {
  const { setCtrlTabEnabled } = require('../windows/MainWindow');
  setCtrlTabEnabled(!!enabled);
});
```

**Preload bridge (src/main/preload.js) — in `terminal` namespace:**
```js
setCtrlTabEnabled: (enabled) => ipcRenderer.invoke('terminal:setCtrlTabEnabled', enabled)
```

**Renderer — called on startup and on settings change:**
```js
const ts = getSetting('terminalShortcuts') || {};
api.terminal.setCtrlTabEnabled(ts.ctrlTab?.enabled !== false);
```

### ShortcutsManager: TERMINAL_SHORTCUTS map
```js
const TERMINAL_SHORTCUTS = {
  ctrlC: {
    key: 'Ctrl+C',
    labelKey: 'shortcuts.termCtrlC',
    enabledByDefault: true,
    rebindable: true
  },
  ctrlV: {
    key: 'Ctrl+V',
    labelKey: 'shortcuts.termCtrlV',
    enabledByDefault: true,
    rebindable: true
  },
  ctrlArrow: {
    key: 'Ctrl+Left/Right',
    labelKey: 'shortcuts.termCtrlArrow',
    enabledByDefault: true,
    rebindable: false // always Ctrl+Arrow, can only toggle
  },
  ctrlTab: {
    key: 'Ctrl+Tab',
    labelKey: 'shortcuts.termCtrlTab',
    enabledByDefault: true,
    rebindable: false // intercepted in main process, cannot rebind without deeper refactor
  },
  rightClickPaste: {
    key: 'RightClick',
    labelKey: 'shortcuts.termRightClickPaste',
    enabledByDefault: true,
    rebindable: false
  },
  rightClickCopyPaste: {
    key: 'RightClick',
    labelKey: 'shortcuts.termRightClickCopyPaste',
    enabledByDefault: false,
    rebindable: false
  }
};
```

**Note on rebindable:** `ctrlArrow` and `ctrlTab` are non-rebindable due to architecture constraints. `rightClick*` cannot be rebound because there is no generic "capture a mouse button" flow in the existing ShortcutsManager. The UI should simply disable the rebind button and show a lock icon or static key label for these.

### defaultSettings addition
```js
// In settings.state.js defaultSettings:
terminalShortcuts: {
  ctrlC:              { enabled: true  },
  ctrlV:              { enabled: true  },
  ctrlArrow:          { enabled: true  },
  ctrlTab:            { enabled: true  },
  rightClickPaste:    { enabled: true  },
  rightClickCopyPaste:{ enabled: false }
}
```

(Keys are not stored here since non-rebindable items have no user-overridable key. If `ctrlC`/`ctrlV` become rebindable, the captured key would be stored as `key` property.)

### i18n keys to add (both en.json and fr.json)
```json
"shortcuts": {
  "terminalShortcuts": "Terminal Shortcuts",
  "termCtrlC": "Copy (Ctrl+C)",
  "termCtrlV": "Paste (Ctrl+V)",
  "termCtrlArrow": "Word jump (Ctrl+Arrow)",
  "termCtrlTab": "Switch terminal tab (Ctrl+Tab)",
  "termRightClickPaste": "Right-click paste",
  "termRightClickCopyPaste": "Right-click copy/paste (Windows Terminal style)",
  "enabled": "Enabled",
  "disabled": "Disabled"
}
```

---

## File Map — Files to Change

| File | What Changes |
|------|-------------|
| `src/renderer/state/settings.state.js` | Add `terminalShortcuts` to `defaultSettings`; add deep-merge in `loadSettings` |
| `src/renderer/ui/panels/ShortcutsManager.js` | Add `TERMINAL_SHORTCUTS` map; add Terminal Shortcuts section to `renderShortcutsPanel`; add toggle/rebind handlers; extend `checkShortcutConflict`; add `getTerminalShortcutEnabled`, `setTerminalShortcutEnabled`, `setTerminalShortcutKey` helpers; fire `setCtrlTabEnabled` IPC when ctrlTab setting changes |
| `src/renderer/ui/components/TerminalManager.js` | Gate each Phase 02 hotkey in `createTerminalKeyHandler` with `ts[id]?.enabled !== false`; rewrite `setupRightClickHandler` to priority-chain; add `rightClickCopyPaste` branch |
| `src/main/windows/MainWindow.js` | Add `ctrlTabEnabled` flag; `setCtrlTabEnabled` export; gate Tab intercept on flag |
| `src/main/preload.js` | Add `setCtrlTabEnabled` to `terminal` namespace |
| `src/main/ipc/terminal.ipc.js` (or `dialog.ipc.js`) | Add `ipcMain.handle('terminal:setCtrlTabEnabled', ...)` |
| `src/renderer/index.js` (or renderer.js) | On startup after settings load, call `api.terminal.setCtrlTabEnabled(...)` |
| `src/renderer/i18n/locales/en.json` | Add 8+ new keys under `shortcuts` |
| `src/renderer/i18n/locales/fr.json` | Same keys in French |

**Total: ~9 files across main + renderer + i18n**

---

## Open Questions

1. **Are `ctrlC` and `ctrlV` truly rebindable?**
   - What we know: The CONTEXT.md says "Full rebinding supported." The existing ShortcutsManager capture flow works for any Ctrl+key combo. `createTerminalKeyHandler` checks `e.key.toLowerCase() === 'c'` — if the user rebinds copy to `Ctrl+Shift+C`, we'd need to compare against the stored key rather than hardcoded 'c'.
   - What's unclear: The capture overlay and `getKeyFromEvent` already handle this. The key handler would need to normalize the event and compare to the stored key. This is achievable but adds complexity to `createTerminalKeyHandler`.
   - Recommendation: For the first plan, treat `ctrlC` and `ctrlV` as rebindable in the UI (user can set a new key) but implement the key comparison in the handler by storing the normalized key and comparing at runtime. If this is too complex, mark them as enable/disable only in Plan 1 and add rebind in Plan 2.

2. **How does `rightClickCopyPaste` interact with `terminalContextMenu` toggle in SettingsPanel?**
   - What we know: `terminalContextMenu: true` causes a context menu to show. `rightClickCopyPaste` bypasses the context menu entirely. If both are true, `rightClickCopyPaste` should take precedence (checked first in handler).
   - What's unclear: Should enabling `rightClickCopyPaste` automatically set `terminalContextMenu: false`? Or are they independent?
   - Recommendation: Keep them independent. The priority chain in `setupRightClickHandler` handles the interaction at runtime. Document the behavior in the UI (e.g., "overrides context menu when enabled").

---

## Suggested Plan Breakdown

Given the number of files and the Ctrl+Tab IPC complexity, this phase should be two plans:

**Plan 7-01: Terminal shortcut enable/disable in settings + renderer enforcement**
- Add `terminalShortcuts` to settings state with defaults
- Add Terminal Shortcuts section to ShortcutsManager UI (enable toggles + static key display)
- Gate all 5 renderer-side hotkeys in `createTerminalKeyHandler` on settings
- Implement `rightClickCopyPaste` Windows Terminal behavior in `setupRightClickHandler`
- Add i18n keys

**Plan 7-02: Ctrl+Tab IPC toggling + rebind support for ctrlC/ctrlV**
- Add `setCtrlTabEnabled` IPC chain (MainWindow → preload → renderer → settings listener)
- Wire settings change listener to fire IPC when ctrlTab enabled state changes
- Add rebind support for ctrlC and ctrlV (key comparison in `createTerminalKeyHandler`)

Alternatively, if rebind for ctrlC/ctrlV is considered too complex for v1, Plan 7-02 is only the Ctrl+Tab IPC work and both plans are small.

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `src/renderer/ui/panels/ShortcutsManager.js` — full file
- Direct code read: `src/renderer/features/KeyboardShortcuts.js` — full file
- Direct code read: `src/renderer/ui/components/TerminalManager.js` lines 75-756 (createTerminalKeyHandler, setupRightClickHandler, setupClipboardShortcuts)
- Direct code read: `src/main/windows/MainWindow.js` lines 1-80 — before-input-event handler
- Direct code read: `src/renderer/state/settings.state.js` — full file
- Direct code read: `src/renderer/i18n/locales/en.json` shortcuts section
- Direct code read: `renderer.js` — onCtrlTab wiring
- Phase 02 research and summaries: `.planning/phases/02-terminal-keyboard-shortcuts/`
- STATE.md accumulated decisions

### No external sources needed
This phase is entirely within the existing codebase. No new libraries, no API changes, no external documentation required.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components identified by direct code read
- Architecture: HIGH — patterns taken directly from existing code in the same files
- Pitfalls: HIGH — derived from direct code analysis and Phase 02 lessons-learned in STATE.md
- Ctrl+Tab IPC solution: HIGH — follows the exact established pattern from Phase 02

**Research date:** 2026-02-25
**Valid until:** Stable (this is internal code knowledge, not an external API)
