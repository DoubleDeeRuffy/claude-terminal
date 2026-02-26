# Phase 8: Rename App Title to Current Selected Project - Research

**Researched:** 2026-02-25
**Domain:** Electron window title management, renderer state subscriptions, settings persistence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Title format:** `Claude Terminal - {Project Display Name}`
- Use the project's custom display name (falls back to folder name if no custom name is set)
- When no project is selected (All Projects view or app startup with no project): show just `Claude Terminal`
- Substring matching is sufficient for external time trackers — no special formatting needed
- **Setting name:** "Update window title on project switch" (or similar)
- **Default:** enabled out of the box
- **Location:** General section of the Settings panel
- When disabled: window title stays as `Claude Terminal` regardless of project selection
- **Trigger:** Title updates when `selectedProjectFilter` changes (clicking a project in the sidebar)
- Deselecting a project (clicking "All Projects" / clearing filter) reverts title to `Claude Terminal`
- Terminal tab focus changes do NOT trigger a title update — only the project filter matters

### Claude's Discretion

- Exact setting label and description wording
- Implementation approach (main process vs renderer title update)
- Whether to persist the title across app restarts (follows from selectedProjectFilter restore in Phase 4)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 8 adds project-aware window title updates to Claude Terminal. The entire IPC infrastructure for setting the window title already exists and is working — `api.window.setTitle()` in the renderer sends an IPC message to `mainWindow.setTitle()` via the `set-window-title` handler in `dialog.ipc.js`. The `updateWindowTitle()` function in `SettingsService.js` already implements the three-layer title update (DOM titlebar element, `document.title`, and native window title via IPC). However, this function is only used for chat-task-title purposes and is never called on project selection changes.

The implementation requires three targeted changes: (1) add a new `updateTitleOnProjectSwitch` boolean setting (default `true`) to `settings.state.js`, (2) add a `projectsState.subscribe` listener in `renderer.js` that calls `document.title = ...` and `api.window.setTitle()` when `selectedProjectFilter` changes, and (3) add the toggle UI row and handler to `SettingsPanel.js` following the exact same pattern as `terminalContextMenu`, `compactProjects`, and `aiCommitMessages`.

The project data shape is well understood: `state.projects[state.selectedProjectFilter]` gives the current project object, and the display name is `project.name` (which is already either a custom display name or folder name derived from path — Phase 4 confirmed this). The title at startup is handled automatically because Phase 4's startup restore calls `setSelectedProjectFilter`, which fires the same `projectsState.subscribe` listener.

**Primary recommendation:** Implement entirely in the renderer process — no main process changes needed. Use the existing `projectsState.subscribe` pattern from Phase 5 (FileExplorer subscribe) as the exact wiring template.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron BrowserWindow | ^28.0.0 | Native window title via `mainWindow.setTitle()` | Already in use, IPC channel exists |
| `ipcRenderer.send` / `ipcMain.on` | built-in | Renderer-to-main title propagation | Existing `set-window-title` channel works |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `projectsState` (State observable) | internal | Subscribe to project filter changes | Already the trigger source |
| `settingsState` | internal | Persist the `updateTitleOnProjectSwitch` toggle | Consistent with all other boolean settings |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Renderer-side title update | Main process polling | Main process polling is overcomplicated — renderer already owns project selection state |
| Subscribing to `projectsState` | Hooking directly inside `setSelectedProjectFilter()` | State subscription is the established reactive pattern in this codebase; hook injection is an anti-pattern here |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No new files. Changes are confined to:
```
src/renderer/state/settings.state.js    # Add new setting key + default
src/renderer/ui/panels/SettingsPanel.js # Add toggle HTML + saveSettings handling
src/renderer/i18n/locales/en.json       # Add 2 i18n keys
src/renderer/i18n/locales/fr.json       # Add 2 i18n keys
renderer.js                             # Add projectsState.subscribe for title update
```

### Pattern 1: projectsState.subscribe for side effects

**What:** Subscribe to project state changes in `renderer.js` to react to `selectedProjectFilter` changes.

**When to use:** Any time a UI element or system state needs to react to project selection. Phase 5 used this exact pattern for `FileExplorer`.

**Example (Phase 5 template — `renderer.js` line 1509):**
```js
// Subscribe to project selection changes for FileExplorer
projectsState.subscribe(() => {
  const state = projectsState.get();
  const selectedFilter = state.selectedProjectFilter;
  const projects = state.projects;

  if (selectedFilter !== null && projects[selectedFilter]) {
    const project = projects[selectedFilter];
    // ... do something with project
  } else {
    // handle deselection
  }
});
```

**Phase 8 implementation:**
```js
// Subscribe to project selection changes for window title
projectsState.subscribe(() => {
  const { getSetting } = require('./src/renderer/state');
  if (!getSetting('updateTitleOnProjectSwitch')) return;

  const state = projectsState.get();
  const selectedFilter = state.selectedProjectFilter;
  const projects = state.projects;

  let title;
  if (selectedFilter !== null && projects[selectedFilter]) {
    title = `Claude Terminal - ${projects[selectedFilter].name}`;
  } else {
    title = 'Claude Terminal';
  }

  document.title = title;
  api.window.setTitle(title);
});
```

### Pattern 2: Settings toggle — HTML + saveSettings

**What:** Toggle is rendered in `SettingsPanel.js` `buildSettingsHtml()` inside the "System" card (`settings-toggle-row`). The `saveSettingsHandler()` function reads the checkbox state and includes it in `newSettings`.

**When to use:** Every boolean setting in the General tab follows this pattern exactly.

**Example (from `SettingsPanel.js` lines 436-445 for `terminalContextMenu`):**
```js
// In buildSettingsHtml() - HTML:
<div class="settings-toggle-row">
  <div class="settings-toggle-label">
    <div>${t('settings.terminalContextMenu')}</div>
    <div class="settings-toggle-desc">${t('settings.terminalContextMenuDesc')}</div>
  </div>
  <label class="settings-toggle">
    <input type="checkbox" id="terminal-context-menu-toggle" ${settings.terminalContextMenu !== false ? 'checked' : ''}>
    <span class="settings-toggle-slider"></span>
  </label>
</div>
```

```js
// In saveSettingsHandler():
const terminalContextMenuToggle = document.getElementById('terminal-context-menu-toggle');
const newTerminalContextMenu = terminalContextMenuToggle ? terminalContextMenuToggle.checked : true;
// ... included in newSettings object
```

**Phase 8 addition follows the same three-step pattern:**
1. Add `updateTitleOnProjectSwitch: true` to `defaultSettings` in `settings.state.js`
2. Add toggle HTML row in the System card of `SettingsPanel.js` `buildSettingsHtml()`
3. Read toggle in `saveSettingsHandler()` and include in `newSettings`

### Pattern 3: Setting default with `!== false` guard

All boolean settings that default to `true` use `settings.settingKey !== false ? 'checked' : ''` so that when the key is absent from disk (first run or older `settings.json` without this key), the toggle renders as checked.

```js
// Pattern used for terminalContextMenu, compactProjects, aiCommitMessages
${settings.updateTitleOnProjectSwitch !== false ? 'checked' : ''}
```

### Anti-Patterns to Avoid

- **Updating the title inside `setSelectedProjectFilter()` directly:** The function is a pure state setter; side effects belong in subscribers.
- **Reading from `settingsState` inside the subscriber without guarding for undefined:** Use `getSetting('updateTitleOnProjectSwitch') !== false` (not `=== true`) to handle missing key on first run.
- **Updating `document.title` without also calling `api.window.setTitle()`:** The titlebar in the frameless window reads `document.title` for display, but the actual OS/taskbar window title requires the IPC call to `mainWindow.setTitle()`.
- **Updating the DOM titlebar element (`.titlebar-title`):** The existing `updateWindowTitle()` does this, but it is designed for chat-task-title composite strings. For project-only titles, skip the DOM element — only update `document.title` and `api.window.setTitle()` to avoid UI flicker from clearing chat task context.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Setting storage/persistence | Custom file write | `setSetting()` / `getSetting()` from `settings.state.js` | Debounced atomic writes, corruption recovery already implemented |
| IPC for title update | New IPC channel | Existing `api.window.setTitle()` / `set-window-title` channel | Already registered in `dialog.ipc.js`, already wired in preload |
| Project name lookup | Custom lookup | `state.projects[state.selectedProjectFilter].name` | The state model already provides this |

**Key insight:** Everything needed already exists. This phase is pure wiring — no new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Missing guard for `updateTitleOnProjectSwitch !== false` vs `=== true`

**What goes wrong:** If the guard is `settings.updateTitleOnProjectSwitch === true`, then existing users with old `settings.json` (which lacks the key) will have the feature disabled even though the default is `true`.

**Why it happens:** `undefined === true` is `false`, so the check silently treats missing keys as disabled.

**How to avoid:** Always use `setting !== false` for "default-on" booleans. The `defaultSettings` object in `settings.state.js` sets `updateTitleOnProjectSwitch: true`, but this only applies to fresh installs where the full `defaultSettings` is applied. For existing users, `loadSettings()` merges their saved JSON over defaults — so if the key is absent in their file, the merged state gets the default from `defaultSettings`. However, to be safe in the subscriber (which reads live state), use `getSetting('updateTitleOnProjectSwitch') !== false`.

**Warning signs:** Feature doesn't activate for users upgrading from older versions.

### Pitfall 2: Subscriber fires on every projectsState change, not just filter changes

**What goes wrong:** `projectsState.subscribe` fires on ANY projectsState mutation (folder add, project rename, etc.), not just filter changes. The title update would be called excessively.

**Why it happens:** The `State` observable calls all subscribers on any `set()` or `setProp()` call.

**How to avoid:** Track the previous filter value and only update when it actually changed. Alternatively, accept the performance cost since the operation is just two cheap DOM/IPC calls — this is the approach used by Phase 5's FileExplorer subscriber which also re-runs on every state change. For title updates, re-running on every mutation is acceptable (same project name will be re-set idempotently).

**Warning signs:** Visible only in profiling; no user-visible bug.

### Pitfall 3: Title not updating on app restart

**What goes wrong:** On startup, if the Phase 4 restore calls `setSelectedProjectFilter` before the subscriber is registered, the title stays as `Claude Terminal`.

**Why it happens:** Subscriber registration order in `renderer.js` matters if startup restore happens synchronously before subscribers are set up.

**How to avoid:** Place the `projectsState.subscribe` block in `renderer.js` in the same init section as the Phase 5 FileExplorer subscriber (around line 1509) — AFTER `initializeState()` is called. Phase 4's startup restore happens inside the `async` init IIFE (lines 257-303), which completes before the subscribers at line 1509 fire, so the subscriber will catch the final state. Confirmed: Phase 5's FileExplorer subscriber already handles startup restore correctly using this placement.

### Pitfall 4: `settings.updateTitleOnProjectSwitch` not in `saveSettingsHandler`

**What goes wrong:** If the toggle HTML is added but the key is not read in `saveSettingsHandler()` and included in `newSettings`, the setting will never persist to disk.

**Why it happens:** `saveSettingsHandler()` constructs `newSettings` explicitly (not by reading all toggle states generically). Each new toggle must be explicitly added.

**How to avoid:** Follow the exact three-step pattern: (1) default in state, (2) HTML toggle, (3) read in `saveSettingsHandler` + include in `newSettings`.

---

## Code Examples

### Example 1: Complete subscriber block (renderer.js)

```js
// Subscribe to project selection changes for window title update
projectsState.subscribe(() => {
  const state = projectsState.get();
  if (getSetting('updateTitleOnProjectSwitch') === false) return;

  const selectedFilter = state.selectedProjectFilter;
  const projects = state.projects;
  const title = (selectedFilter !== null && projects[selectedFilter])
    ? `Claude Terminal - ${projects[selectedFilter].name}`
    : 'Claude Terminal';

  document.title = title;
  api.window.setTitle(title);
});
```

### Example 2: settings.state.js default

```js
// In defaultSettings object:
updateTitleOnProjectSwitch: true, // Update window title when switching projects (for external time trackers)
```

### Example 3: SettingsPanel.js HTML toggle

Place inside the "System" settings card, alongside `terminalContextMenu`, `compactProjects`, etc.:

```js
<div class="settings-toggle-row">
  <div class="settings-toggle-label">
    <div>${t('settings.updateTitleOnProjectSwitch')}</div>
    <div class="settings-toggle-desc">${t('settings.updateTitleOnProjectSwitchDesc')}</div>
  </div>
  <label class="settings-toggle">
    <input type="checkbox" id="update-title-on-project-switch-toggle" ${settings.updateTitleOnProjectSwitch !== false ? 'checked' : ''}>
    <span class="settings-toggle-slider"></span>
  </label>
</div>
```

### Example 4: saveSettingsHandler addition

```js
// In saveSettingsHandler():
const updateTitleToggle = document.getElementById('update-title-on-project-switch-toggle');
const newUpdateTitleOnProjectSwitch = updateTitleToggle ? updateTitleToggle.checked : true;

// In newSettings object:
const newSettings = {
  // ... existing settings ...
  updateTitleOnProjectSwitch: newUpdateTitleOnProjectSwitch
};
```

### Example 5: i18n keys (en.json and fr.json)

**en.json** (in `"settings"` block, near `terminalContextMenu`):
```json
"updateTitleOnProjectSwitch": "Update window title on project switch",
"updateTitleOnProjectSwitchDesc": "Change the app title in the taskbar to show the active project (useful for external time-tracking tools)",
```

**fr.json** (in `"settings"` block):
```json
"updateTitleOnProjectSwitch": "Mettre à jour le titre sur changement de projet",
"updateTitleOnProjectSwitchDesc": "Affiche le nom du projet actif dans la barre des tâches (utile pour les outils de suivi du temps)",
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No project-aware title | `Claude Terminal - {Project}` on filter change | Phase 8 | External time trackers can detect active project |

**Existing infrastructure already in place:**
- `api.window.setTitle(title)` → preload → `ipcRenderer.send('set-window-title', title)` → `dialog.ipc.js` → `mainWindow.setTitle(title)` — fully operational since initial build
- `updateWindowTitle(taskTitle, projectName)` in `SettingsService.js` — used only by chat tab; Phase 8 does NOT call this function (avoid DOM titlebar mutation for project switches)

---

## Open Questions

1. **Should the title revert to `Claude Terminal` when the setting is disabled while a project is selected?**
   - What we know: Toggling the setting saves it but does not trigger a title update immediately.
   - What's unclear: Should disabling the toggle immediately reset the title, or only take effect on next project switch?
   - Recommendation: Reset the title to `Claude Terminal` immediately when the toggle is turned off. This can be done in `saveSettingsHandler()` after saving: if `newUpdateTitleOnProjectSwitch === false`, call `document.title = 'Claude Terminal'; api.window.setTitle('Claude Terminal');`.

2. **Placement of the toggle in the System settings card**
   - What we know: The System card contains `launchAtStartup`, `compactProjects`, `terminalContextMenu`, `reduceMotion`, `aiCommitMessages`. All are roughly equal priority.
   - What's unclear: Whether to place it at end of the card or grouped near `compactProjects` (both are project-list-related).
   - Recommendation: Place it after `terminalContextMenu` and before `reduceMotion` — thematically it is a "system integration" feature (taskbar visibility), closer to the system-level toggles.

---

## Sources

### Primary (HIGH confidence)
- Codebase analysis — `src/renderer/state/settings.state.js` (defaultSettings shape, `setSetting`/`getSetting` API)
- Codebase analysis — `src/renderer/ui/panels/SettingsPanel.js` (toggle HTML pattern, `saveSettingsHandler` structure)
- Codebase analysis — `renderer.js` lines 1509-1524 (Phase 5 FileExplorer subscriber — exact template for Phase 8)
- Codebase analysis — `src/main/ipc/dialog.ipc.js` lines 43-48 (`set-window-title` IPC handler)
- Codebase analysis — `src/main/preload.js` line 214 (`api.window.setTitle` preload bridge)
- Codebase analysis — `src/renderer/services/SettingsService.js` lines 153-167 (`updateWindowTitle` — NOT reused, informational only)

### Secondary (MEDIUM confidence)
- N/A — all findings are from direct codebase inspection (HIGH confidence)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all infrastructure verified in source code
- Architecture: HIGH — exact subscriber pattern confirmed from Phase 5 implementation
- Pitfalls: HIGH — all identified from direct analysis of `settings.state.js`, `SettingsPanel.js`, and `renderer.js` init order

**Research date:** 2026-02-25
**Valid until:** 60 days (stable codebase, no external dependencies)
