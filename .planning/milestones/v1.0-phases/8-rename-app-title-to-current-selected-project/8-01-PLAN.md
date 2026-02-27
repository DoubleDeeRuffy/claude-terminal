---
phase: 8-rename-app-title-to-current-selected-project
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/state/settings.state.js
  - src/renderer/ui/panels/SettingsPanel.js
  - src/renderer/i18n/locales/en.json
  - src/renderer/i18n/locales/fr.json
  - renderer.js
autonomous: true
requirements:
  - TITLE-01
  - TITLE-02
must_haves:
  truths:
    - "When the user selects a project, the Windows taskbar title changes to 'Claude Terminal - {Project Name}'"
    - "When the user deselects a project (All Projects view), the title reverts to 'Claude Terminal'"
    - "User can toggle the window title update feature on/off in Settings > General"
    - "Disabling the toggle immediately resets the title to 'Claude Terminal'"
    - "On app restart, the title reflects the restored project (Phase 4 startup restore fires the subscriber)"
    - "Existing users upgrading see the feature enabled by default (no missing-key bug)"
  artifacts:
    - path: "src/renderer/state/settings.state.js"
      provides: "updateTitleOnProjectSwitch default setting"
      contains: "updateTitleOnProjectSwitch"
    - path: "src/renderer/ui/panels/SettingsPanel.js"
      provides: "Toggle UI row and saveSettingsHandler entry"
      contains: "update-title-on-project-switch-toggle"
    - path: "renderer.js"
      provides: "projectsState subscriber for title update"
      contains: "api.window.setTitle"
    - path: "src/renderer/i18n/locales/en.json"
      provides: "English i18n keys"
      contains: "updateTitleOnProjectSwitch"
    - path: "src/renderer/i18n/locales/fr.json"
      provides: "French i18n keys"
      contains: "updateTitleOnProjectSwitch"
  key_links:
    - from: "renderer.js"
      to: "projectsState"
      via: "subscribe callback reads selectedProjectFilter and calls api.window.setTitle()"
      pattern: "projectsState\\.subscribe.*setTitle"
    - from: "SettingsPanel.js"
      to: "settings.state.js"
      via: "saveSettingsHandler reads toggle and persists updateTitleOnProjectSwitch"
      pattern: "updateTitleOnProjectSwitch"
---

<objective>
Add project-aware window title updates so the Windows taskbar shows which project is active, controlled by a settings toggle.

Purpose: External time-tracking tools can detect project switches by reading the window title from the taskbar.
Output: Working title update on project switch, toggle in Settings, i18n for EN/FR.
</objective>

<execution_context>
@C:/Users/uhgde/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/uhgde/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/8-rename-app-title-to-current-selected-project/8-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add updateTitleOnProjectSwitch setting, toggle UI, and i18n keys</name>
  <files>
    src/renderer/state/settings.state.js
    src/renderer/ui/panels/SettingsPanel.js
    src/renderer/i18n/locales/en.json
    src/renderer/i18n/locales/fr.json
  </files>
  <action>
1. In `src/renderer/state/settings.state.js`, add `updateTitleOnProjectSwitch: true` to the `defaultSettings` object (place near other boolean settings like `terminalContextMenu`, `compactProjects`).

2. In `src/renderer/i18n/locales/en.json`, add inside the `"settings"` block (near `terminalContextMenu` keys):
   - `"updateTitleOnProjectSwitch": "Update window title on project switch"`
   - `"updateTitleOnProjectSwitchDesc": "Change the app title in the taskbar to show the active project (useful for external time-tracking tools)"`

3. In `src/renderer/i18n/locales/fr.json`, add inside the `"settings"` block:
   - `"updateTitleOnProjectSwitch": "Mettre à jour le titre sur changement de projet"`
   - `"updateTitleOnProjectSwitchDesc": "Affiche le nom du projet actif dans la barre des tâches (utile pour les outils de suivi du temps)"`

4. In `src/renderer/ui/panels/SettingsPanel.js` `buildSettingsHtml()`:
   - Add a `settings-toggle-row` in the "System" settings card, placed after `terminalContextMenu` and before `reduceMotion`. Follow the exact HTML pattern used by `terminalContextMenu`:
     ```html
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

5. In `saveSettingsHandler()`:
   - Read the toggle: `const updateTitleToggle = document.getElementById('update-title-on-project-switch-toggle');`
   - Compute value: `const newUpdateTitleOnProjectSwitch = updateTitleToggle ? updateTitleToggle.checked : true;`
   - Add `updateTitleOnProjectSwitch: newUpdateTitleOnProjectSwitch` to the `newSettings` object.
   - After saving, if `newUpdateTitleOnProjectSwitch === false`, immediately reset the title:
     ```js
     if (newUpdateTitleOnProjectSwitch === false) {
       document.title = 'Claude Terminal';
       api.window.setTitle('Claude Terminal');
     }
     ```
  </action>
  <verify>
    <automated>npm run build:renderer && node -e "const fs=require('fs'); const s=fs.readFileSync('src/renderer/state/settings.state.js','utf8'); console.assert(s.includes('updateTitleOnProjectSwitch'), 'missing setting default'); const p=fs.readFileSync('src/renderer/ui/panels/SettingsPanel.js','utf8'); console.assert(p.includes('update-title-on-project-switch-toggle'), 'missing toggle'); const en=fs.readFileSync('src/renderer/i18n/locales/en.json','utf8'); console.assert(en.includes('updateTitleOnProjectSwitch'), 'missing en i18n'); const fr=fs.readFileSync('src/renderer/i18n/locales/fr.json','utf8'); console.assert(fr.includes('updateTitleOnProjectSwitch'), 'missing fr i18n'); console.log('All checks passed')"</automated>
  </verify>
  <done>
    - `updateTitleOnProjectSwitch: true` exists in defaultSettings
    - Toggle HTML row renders in Settings > General (System card)
    - `saveSettingsHandler` reads and persists the toggle value
    - Disabling the toggle immediately resets title to "Claude Terminal"
    - EN and FR i18n keys present for label and description
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire projectsState subscriber for window title updates in renderer.js</name>
  <files>renderer.js</files>
  <action>
1. In `renderer.js`, add a `projectsState.subscribe` listener for window title updates. Place it near the Phase 5 FileExplorer subscriber (around line 1509 area — after `initializeState()` has completed), following the exact same subscription pattern.

2. The subscriber implementation:
   ```js
   // Phase 8: Update window title on project switch
   projectsState.subscribe(() => {
     const { getSetting } = require('./src/renderer/state');
     if (getSetting('updateTitleOnProjectSwitch') === false) return;

     const state = projectsState.get();
     const selectedFilter = state.selectedProjectFilter;
     const projects = state.projects;
     const title = (selectedFilter !== null && projects[selectedFilter])
       ? `Claude Terminal - ${projects[selectedFilter].name}`
       : 'Claude Terminal';

     document.title = title;
     api.window.setTitle(title);
   });
   ```

3. Key implementation notes:
   - Use `getSetting('updateTitleOnProjectSwitch') === false` (NOT `=== true`) to handle missing key on first run/upgrade — `undefined !== false` evaluates truthy, so the feature works by default.
   - Use `projects[selectedFilter].name` for the display name — this is already either a custom name or folder-derived name.
   - Update both `document.title` (for DOM/frameless titlebar) AND `api.window.setTitle()` (for OS taskbar).
   - Do NOT update the `.titlebar-title` DOM element — that is managed by `SettingsService.updateWindowTitle()` for chat context and should not be overwritten.
   - The subscriber fires on any `projectsState` mutation, but the two calls (document.title assignment + IPC) are cheap and idempotent, so no debounce or previous-value tracking needed.
   - Startup restore is handled automatically: Phase 4's `setSelectedProjectFilter` on startup mutates `projectsState`, which fires this subscriber.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const r=fs.readFileSync('renderer.js','utf8'); console.assert(r.includes('updateTitleOnProjectSwitch'), 'missing setting check in subscriber'); console.assert(r.includes('api.window.setTitle'), 'missing setTitle call'); console.assert(r.includes('Claude Terminal -'), 'missing title format'); console.log('All checks passed')"</automated>
  </verify>
  <done>
    - projectsState.subscribe block exists in renderer.js
    - Selecting a project updates title to "Claude Terminal - {name}"
    - Deselecting a project reverts title to "Claude Terminal"
    - Setting check gates the subscriber (disabled = no title update)
    - Startup restore fires the subscriber automatically
  </done>
</task>

</tasks>

<verification>
1. `npm run build:renderer` succeeds without errors
2. `npm test` passes (no regressions)
3. Grep confirms all artifacts:
   - `grep -r "updateTitleOnProjectSwitch" src/renderer/state/settings.state.js` → default setting
   - `grep -r "update-title-on-project-switch-toggle" src/renderer/ui/panels/SettingsPanel.js` → toggle UI
   - `grep -r "updateTitleOnProjectSwitch" src/renderer/i18n/locales/en.json` → EN i18n
   - `grep -r "updateTitleOnProjectSwitch" src/renderer/i18n/locales/fr.json` → FR i18n
   - `grep -r "Claude Terminal -" renderer.js` → title format in subscriber
   - `grep -r "api.window.setTitle" renderer.js` → IPC call in subscriber
</verification>

<success_criteria>
- Window title updates to "Claude Terminal - {Project Name}" on project selection
- Window title reverts to "Claude Terminal" on deselection
- Toggle in Settings > General controls the feature (default: enabled)
- Disabling the toggle immediately resets the title
- Existing users upgrading see the feature enabled by default
- EN and FR translations present
- Build succeeds, tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/8-rename-app-title-to-current-selected-project/8-01-SUMMARY.md`
</output>
