# Phase 33: Updater-Settings — CONTEXT

## Decisions

### 1. UI Placement
**Decision:** New dedicated "Updates" settings-group below "System" in the General tab, with its own card containing 3 dropdowns + the existing "Check for Updates" button.

### 2. Check Interval Options
**Options:** 30 minutes, 1 hour, 3 hours, At startup only, Manual
- "Manual" means no automatic checking — user must click "Check for Updates" button manually.
- The manual check button remains visible in all modes (always available).
- When set to "Manual", download/install dropdowns stay enabled (they apply if user manually checks and finds an update).

### 3. Update Banner in Manual Download Mode
**Decision:** When download mode is "Manual" and a new version is detected:
- Show a banner: "v{version} available" with a **Download** button.
- After download completes, banner changes to "Restart to update" (same as current behavior).
- Two-step flow: detect → user clicks Download → download progress → user clicks Restart.

### 4. Default Values
**Decision:** Match current hardcoded behavior — zero behavior change for existing and new users:
- Check interval: **30 minutes** (current `CHECK_INTERVAL_MS`)
- Download mode: **Auto** (current `autoDownload: true`)
- Install mode: **Auto on close** (current `autoInstallOnAppQuit: true`)

## Code Context

### Integration Points
- **Settings UI:** `src/renderer/ui/panels/SettingsPanel.js` — General tab, add new "Updates" group after "System" group (after line ~516)
- **Settings persistence:** Uses `settings-dropdown` pattern (see language/editor/close-action dropdowns for reference)
- **UpdaterService:** `src/main/services/UpdaterService.js` — replace hardcoded `autoDownload`, `autoInstallOnAppQuit`, `CHECK_INTERVAL_MS` with config reads
- **Preload bridge:** `src/main/preload.js` — `updates` namespace (line 410-413), `app` namespace has `installUpdate` (line 239)
- **IPC:** `src/main/ipc/dialog.ipc.js` — handles `update-install` event (line 121)
- **i18n:** `src/renderer/i18n/locales/en.json` + `fr.json` — add keys under `settings.*`

### Existing Patterns to Follow
- Dropdown: `settings-dropdown` with `settings-dropdown-trigger`, `settings-dropdown-menu`, `settings-dropdown-option`
- Settings save: `ctx.api.settings.save()` after change
- Update status IPC: `update-status` channel with `{ status, version, progress, error }`

### Settings Keys (proposed)
```
settings.updateCheckInterval = '30min' | '1h' | '3h' | 'startup' | 'manual'
settings.updateDownloadMode = 'auto' | 'manual'
settings.updateInstallMode = 'auto' | 'manual'
```
