# Phase 17: Taskbar Pin Lost on Update - Research

**Researched:** 2026-02-26
**Domain:** Windows NSIS installer update behavior, AppUserModelId, shortcut lifecycle
**Confidence:** HIGH (root cause), MEDIUM (fix path for assisted installer mode)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Determine exactly what NSIS does during an auto-update: full uninstall+reinstall, or in-place file replacement?
- Document the findings in a research report (RESEARCH.md)
- Focus: what causes Windows to lose the taskbar pin identity (shortcut recreation, AppUserModelId change, exe path shift, etc.)
- Switching from assisted (wizard) to one-click NSIS is acceptable if it helps fix the issue
- Must stay with NSIS — no migration to MSI or MSIX
- Transition must be seamless for existing users — no manual uninstall required
- Windows only — macOS and Linux update behavior deferred
- No need to investigate data safety (settings, projects, etc.) — only shortcut stability
- All shortcuts must survive updates: taskbar pin, Start Menu shortcut, desktop shortcut
- No shortcut duplication or recreation on update
- The pin breaks on every single update, not a version-specific regression
- Install path stays the same (`AppData\Local\Programs\Claude Terminal`) across updates
- Current config: `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`
- User is open to switching to `oneClick: true` if it helps

### Claude's Discretion

- Specific NSIS configuration changes needed
- Whether to set explicit AppUserModelId
- Technical approach to preventing shortcut recreation during updates

### Deferred Ideas (OUT OF SCOPE)

None
</user_constraints>

---

## Summary

The Windows taskbar pin is lost on every update because the NSIS uninstaller — which runs as part of the update flow — calls `WinShell::UninstShortcut`, which internally calls `IStartMenuPinnedList::RemoveFromList`. This API unpins the shortcut from both the Start Menu and the taskbar. After the uninstall portion completes, the installer creates fresh shortcuts, but Windows treats these as new shortcuts and does not restore the pin.

The root cause is NOT a path mismatch. The install path stays constant at `AppData\Local\Programs\Claude Terminal`. The real problem is that `WinShell::UninstShortcut` is called unconditionally during update runs, which explicitly removes the taskbar pin.

The current config (`oneClick: false`, `allowToChangeInstallationDirectory: true`) is the worst combination for this bug. The `allowToChangeInstallationDirectory: true` option has been confirmed in the electron-builder issue tracker to force `keepShortcuts` to `false`, causing shortcut recreation even when nothing about the shortcut changed. Switching to `oneClick: true` eliminates the "change install dir" page entirely and uses a better-tested update code path, but either mode can be made to work with the right NSIS configuration.

**Primary recommendation:** Set `allowToChangeInstallationDirectory: false` (or switch to `oneClick: true`) AND ensure `app.setAppUserModelId` is called early in `main.js` with the appId string. This two-change combination eliminates both the forced shortcut recreation and any AUMID inconsistency.

---

## What Actually Happens During an NSIS Update

### The Update Flow (electron-updater + NSIS)

1. `electron-updater` downloads the new NSIS installer `.exe` to a temp/cache directory.
2. On `quitAndInstall()`, the app quits and spawns the downloaded installer with `--updated` flag (and optionally `/S` for silent).
3. The NSIS installer detects an existing installation via registry key `INSTALL_REGISTRY_KEY`.
4. The installer runs the **uninstall section in silent mode** to remove the old version. This is not a separate uninstaller exe — it is the same installer binary running its cleanup macros.
5. `WinShell::UninstShortcut` is called for desktop and Start Menu shortcuts. This internally calls `IStartMenuPinnedList::RemoveFromList`, which unpins the shortcut from both Start Menu and taskbar.
6. The installer writes the new files.
7. New shortcuts are created via `WinShell::SetLnkAUMI`. These are new `.lnk` files that Windows has never seen pinned.
8. Windows does not automatically re-pin shortcuts after reinstallation. The pin is permanently lost.

**Verdict: It is a full uninstall + reinstall, not in-place file replacement.** The uninstall step is the cause of taskbar pin loss.

### Why `allowToChangeInstallationDirectory: true` Makes It Worse

According to electron-builder issue #2514 analysis: `allowToChangeInstallationDirectory: true` automatically sets `keepShortcuts` to `false` in the generated NSIS script. This forces shortcut recreation even when the path, AUMID, and all other properties are identical between old and new installs. Removing this option allows `keepShortcuts` to evaluate whether existing shortcuts should be preserved.

### What `keepShortcuts` Does

When `keepShortcuts != "false"`, the NSIS installer template:
- Checks if the old Start Menu `.lnk` path equals the new one
- If paths match: does not call `UninstShortcut` — the existing pin survives
- If paths differ (e.g., app was renamed): renames the shortcut file, which also preserves the pin

When `keepShortcuts == "false"` (the current behavior): shortcuts are always deleted and recreated, the pin is always lost.

### Role of AppUserModelId (AUMID)

Windows uses the AUMID to group windows on the taskbar and to match running apps to their pinned shortcuts. If the AUMID of the running process does not match the AUMID embedded in the `.lnk` file, Windows may show a duplicate icon or fail to group correctly.

Currently `main.js` does **not** call `app.setAppUserModelId()` explicitly. Electron auto-sets the AUMID to the `appId` from `package.json` only when the app is packaged with Squirrel. For NSIS builds, the AUMID must be set explicitly, otherwise Electron generates a runtime AUMID that may differ from the one written into the shortcut by the NSIS installer.

The NSIS installer writes `WinShell::SetLnkAUMI "${APP_ID}"` on the shortcut. If the running Electron app has a different AUMID, the taskbar will show two separate entries and the pin will always appear broken.

---

## Standard Stack

### Core
| Component | Version/Value | Purpose | Why Standard |
|-----------|--------------|---------|--------------|
| `electron-builder` | current (project already uses it) | NSIS installer generation | Already in use |
| `electron` `app.setAppUserModelId` | Electron 28+ | Set AUMID before any BrowserWindow opens | Required for NSIS installs |
| NSIS `keepShortcuts` mechanism | Built into electron-builder templates | Prevent shortcut recreation on update | Implemented in uninstaller.nsh |
| `installer-custom.nsh` include | Already exists at `build-assets/installer-custom.nsh` | Custom NSIS macros | Project already has this hook |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `WinShell::UninstAppUserModelId` | Removes AUMID registration on uninstall | Already called by electron-builder uninstaller |
| `${isUpdated}` NSIS variable | Detects update vs fresh install in macros | Can guard shortcut deletion in custom macros |

---

## Architecture Patterns

### Pattern 1: Fix via Config (Preferred — Minimal Code Change)

**What:** Change `electron-builder.config.js` to disable the options that force shortcut recreation, and add the AUMID call to `main.js`.

**When to use:** When the install path is already stable (it is — `AppData\Local\Programs\Claude Terminal`).

**Changes:**

In `electron-builder.config.js`:
```js
nsis: {
  oneClick: false,
  perMachine: false,
  allowElevation: true,
  allowToChangeInstallationDirectory: false,  // KEY CHANGE: was true
  createDesktopShortcut: true,                // Keep as true (not "always")
  createStartMenuShortcut: true,
  differentialPackage: true,
  // ... rest unchanged
}
```

In `main.js` (before any window is created, inside `bootstrapApp()` before `app.whenReady()`):
```js
// Set AUMID explicitly for NSIS builds (must match appId in electron-builder config)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.yanis.claude-terminal');
}
```

### Pattern 2: Switch to oneClick: true (More Reliable Update Path)

**What:** Switch to one-click installer mode. Removes the "choose install directory" wizard page. Uses a simpler, better-tested NSIS update path.

**When to use:** If `allowToChangeInstallationDirectory: false` alone does not fully resolve the issue, or user prefers simpler UX.

**Key difference:** `oneClick: true` installs to `AppData\Local\Programs\<name>` without asking. User cannot change directory. For an app that already had a fixed install path, this is functionally equivalent.

**Migration concern:** Existing users installed with `oneClick: false` are at `AppData\Local\Programs\Claude Terminal`. The `oneClick: true` path installs to `AppData\Local\Programs\claude-terminal` (uses `package.json` `name` field, not `productName`). This is a **different path** — existing users would get a parallel installation. This path mismatch makes `oneClick: true` migration non-trivial without a custom installer migration script.

**Recommendation:** Stick with `oneClick: false`, fix with `allowToChangeInstallationDirectory: false` + explicit AUMID.

### Pattern 3: Custom NSIS Macro (Most Surgical)

**What:** Override `customUnInstall` in `installer-custom.nsh` to skip shortcut deletion during update runs using the `${isUpdated}` variable.

**Risk:** The `${isUpdated}` variable is an internal electron-builder template variable. Its exact behavior and availability in `customUnInstall` is not fully documented. Testing required.

```nsis
!macro customUnInstall
  ; Only delete shortcuts on actual uninstall, not update runs
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\Claude Terminal.lnk"
  ${endIf}
!macroend
```

**Note:** The existing `customUnInstall` in `installer-custom.nsh` already deletes the desktop shortcut unconditionally. This needs to be wrapped with the `${isUpdated}` guard regardless of which approach is chosen.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shortcut creation with AUMID | Custom shortcut creator code | `WinShell::SetLnkAUMI` (already used by electron-builder) | The installer already handles this |
| Pin restoration after update | "Re-pin on launch" user prompt | Fix the root cause (don't delete the pin) | Pin restoration via API is not possible on Windows 10/11 programmatically |
| Detecting update vs fresh install | Custom registry flag | `${isUpdated}` NSIS variable | Built into electron-builder templates |

**Key insight:** Windows does not expose a public API to programmatically pin a shortcut to the taskbar (the old `ITaskbarList::PinToTaskbar` path was removed). The only reliable approach is to prevent the pin from being removed in the first place.

---

## Common Pitfalls

### Pitfall 1: Assuming Path Consistency Is Enough
**What goes wrong:** Developer sees that install path stays the same and concludes the issue is elsewhere.
**Why it happens:** The path is stable, but the shortcut `.lnk` file is deleted and recreated — Windows sees the new `.lnk` as a different object even if it points to the same target.
**How to avoid:** Fix must target shortcut lifecycle (keep the `.lnk` file), not path stability.
**Warning signs:** Pin is lost even though the exe path did not change.

### Pitfall 2: Setting `createDesktopShortcut: "always"`
**What goes wrong:** Developer sets this thinking it will "restore" the pin. Instead it guarantees recreation (and thus guaranteed pin loss) on every update.
**Why it happens:** "always" means "recreate even if user deleted it" — the shortcut is always recreated, never preserved.
**How to avoid:** Use `true` (not `"always"`) for `createDesktopShortcut`. This allows `keepShortcuts` mechanism to preserve existing shortcuts.

### Pitfall 3: Not Setting AppUserModelId in main.js
**What goes wrong:** NSIS creates the shortcut with `APP_ID = "com.yanis.claude-terminal"`. Electron without explicit AUMID may generate a different runtime AUMID. The taskbar sees two different apps and shows separate entries.
**Why it happens:** Electron auto-sets AUMID for Squirrel installs but not NSIS installs.
**How to avoid:** Call `app.setAppUserModelId('com.yanis.claude-terminal')` early in main process startup on win32, before any BrowserWindow is created.
**Warning signs:** App shows with a separate icon next to the pinned shortcut when running.

### Pitfall 4: `customUnInstall` Macro Deletes Shortcut Unconditionally
**What goes wrong:** The existing `build-assets/installer-custom.nsh` has `!macro customUnInstall` that calls `Delete "$DESKTOP\Claude Terminal.lnk"` unconditionally. This runs even during update flows.
**Why it happens:** Macro was written without awareness of the `${isUpdated}` variable.
**How to avoid:** Wrap the Delete call with `${ifNot} ${isUpdated}` guard.

### Pitfall 5: oneClick: true Migration Path Mismatch
**What goes wrong:** Switching to `oneClick: true` installs to a different directory (`claude-terminal` vs `Claude Terminal`), creating parallel installations for existing users.
**Why it happens:** `oneClick: true` uses `package.json` `name` while `oneClick: false` uses `productName`.
**How to avoid:** Don't switch to `oneClick: true` without a migration NSIS script that handles existing installs.

---

## Code Examples

### Explicit AUMID in main.js
```js
// Source: Electron docs + electron-builder NSIS issue #926
// In bootstrapApp(), before app.whenReady()
if (process.platform === 'win32') {
  app.setAppUserModelId('com.yanis.claude-terminal'); // must match appId in electron-builder.config.js
}
```

### electron-builder.config.js nsis section (fixed)
```js
// Source: electron-builder issue #2514 + NSIS docs
nsis: {
  oneClick: false,
  perMachine: false,
  allowElevation: true,
  allowToChangeInstallationDirectory: false,  // CHANGED: false prevents keepShortcuts=false
  createDesktopShortcut: true,                // NOT "always" — preserves keepShortcuts behavior
  createStartMenuShortcut: true,
  differentialPackage: true,
  license: "LICENSE",
  installerSidebar: "build-assets/installer-sidebar.bmp",
  uninstallerSidebar: "build-assets/uninstaller-sidebar.bmp",
  installerHeader: "build-assets/installer-header.bmp",
  include: "build-assets/installer-custom.nsh"
}
```

### Guarded customUnInstall macro in installer-custom.nsh
```nsis
; Source: electron-builder NSIS template variable documentation
!macro customUnInstall
  ; Only clean up desktop shortcut on actual uninstall, NOT during update runs
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\Claude Terminal.lnk"
  ${endIf}
!macroend
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Per-version install directories | Single stable install directory | electron-builder already does this for NSIS (not a problem here) |
| No explicit AUMID | `app.setAppUserModelId(appId)` early in main | Required for NSIS installs to match shortcut AUMID |
| `allowToChangeInstallationDirectory: true` | `false` | Prevents forced `keepShortcuts=false` |
| Unconditional shortcut deletion in customUnInstall | Guard with `${isUpdated}` | Prevents pin removal during update runs |

**Deprecated/outdated:**
- `ITaskbarList::PinToTaskbar` (Windows API): Removed in Windows 10. Cannot programmatically pin apps — must prevent unpin instead.

---

## Open Questions

1. **Does `${isUpdated}` work inside `customUnInstall`?**
   - What we know: `${isUpdated}` is confirmed to be available in `customInstall` macros.
   - What's unclear: Whether it is correctly scoped and set when `customUnInstall` runs during the update flow (the uninstall section runs first, then the install section).
   - Recommendation: Test empirically. If `${isUpdated}` is not available/reliable in `customUnInstall`, use a registry flag written by `customInstall` (set "updating=1" before uninstall, check in customUnInstall, clear after).

2. **Does removing `allowToChangeInstallationDirectory` break existing user installs?**
   - What we know: Existing users are installed at `AppData\Local\Programs\Claude Terminal`. Removing this option uses the same default path.
   - What's unclear: Whether the NSIS upgrade detection (via registry) still finds the existing installation correctly when the option is removed.
   - Recommendation: The install registry key (`com.yanis.claude-terminal`) stays the same — detection should work. Validate in a test install.

3. **Is the AUMID currently inconsistent between shortcut and running process?**
   - What we know: `main.js` does not call `app.setAppUserModelId()`. The NSIS installer sets the shortcut AUMID to `com.yanis.claude-terminal`.
   - What's unclear: Whether Electron auto-sets the AUMID to the appId for NSIS builds (documentation says Squirrel only).
   - Recommendation: Add the explicit call as a safe default regardless. Zero risk, potential fix.

---

## Implementation Order (Recommended)

1. **Change 1 (low risk):** Add `app.setAppUserModelId('com.yanis.claude-terminal')` to `main.js` on win32. Ensures AUMID consistency.
2. **Change 2 (medium risk):** Set `allowToChangeInstallationDirectory: false` in `electron-builder.config.js`. Enables `keepShortcuts` mechanism.
3. **Change 3 (low risk):** Guard `Delete "$DESKTOP\Claude Terminal.lnk"` in `installer-custom.nsh` with `${ifNot} ${isUpdated}`. Prevents explicit shortcut deletion during updates.
4. **Validation:** Build a test installer, install it, pin to taskbar, then update — verify pin survives.

Changes 1-3 together address all three independent root causes. Any single change alone may not be sufficient.

---

## Sources

### Primary (HIGH confidence)
- electron-builder issue #926 — NSIS Auto-updating leaves a bad shortcut (taskbar): https://github.com/electron-userland/electron-builder/issues/926
- electron-builder issue #2514 — Pinned Icon removed on update, `allowToChangeInstallationDirectory` forces `keepShortcuts=false`: https://github.com/electron-userland/electron-builder/issues/2514
- electron-builder `uninstaller.nsh` source — `WinShell::UninstShortcut` confirmed: https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/nsis/uninstaller.nsh
- electron-builder `NsisUpdater.ts` — confirms no separate uninstaller, installer launched with `--updated`: https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/NsisUpdater.ts
- Chromium docs on Windows shortcut and taskbar handling (AUMID is the key identity): https://chromium.googlesource.com/chromium/src/+/HEAD/docs/windows_shortcut_and_taskbar_handling.md
- Microsoft docs — `IStartMenuPinnedList::RemoveFromList`: https://learn.microsoft.com/en-us/windows/win32/api/shobjidl/nf-shobjidl-istartmenupinnedlist-removefromlist

### Secondary (MEDIUM confidence)
- electron-builder NSIS docs — `createDesktopShortcut` "always" vs `true` behavior: https://www.electron.build/nsis.html
- electron-builder NSIS options reference — `allowToChangeInstallationDirectory`: https://www.electron.build/electron-builder.Interface.NsisOptions.html
- electron-builder issue #1293 — duplicate of #926, confirms AUMID must be set for NSIS: https://github.com/electron-userland/electron-builder/issues/1293

### Tertiary (LOW confidence — need validation)
- `${isUpdated}` variable availability in `customUnInstall` context — inferred from `customInstall` documentation, not confirmed for uninstall macros

---

## Metadata

**Confidence breakdown:**
- Root cause (UninstShortcut + allowToChangeInstallationDirectory): HIGH — confirmed by official electron-builder issue tracker and source code
- Fix approach (remove allowToChangeInstallationDirectory + explicit AUMID): HIGH — confirmed by issue #2514 resolution
- `${isUpdated}` in customUnInstall context: LOW — needs empirical testing
- oneClick: true migration risk: HIGH — path difference is documented behavior

**Research date:** 2026-02-26
**Valid until:** 2026-08-26 (stable electron-builder NSIS behavior, unlikely to change)
