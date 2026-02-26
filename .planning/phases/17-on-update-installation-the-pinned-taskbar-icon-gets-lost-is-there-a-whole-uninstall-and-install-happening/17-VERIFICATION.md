---
phase: 17-on-update-installation-the-pinned-taskbar-icon-gets-lost-is-there-a-whole-uninstall-and-install-happening
verified: 2026-02-26T00:00:00Z
status: human_needed
score: 3/3 must-haves verified
re_verification: false
human_verification:
  - test: "Build the NSIS installer with `npm run build:win` and verify it completes without an NSIS compilation error referencing `${isUpdated}` in the `customUnInstall` macro"
    expected: "Build succeeds without any NSIS error mentioning isUpdated, customUnInstall, or undefined variable"
    why_human: "The plan itself flagged this as LOW confidence — ${isUpdated} is a compile-time NSIS define set by electron-builder's assistedInstaller.nsh template. Whether it is in scope for the customUnInstall macro can only be confirmed by running an actual NSIS build. If it is out of scope the build will fail with a NSIS error at compile time."
  - test: "Install a previous version of Claude Terminal, pin it to the taskbar, then install the patched build over it (simulate an auto-update) and verify the taskbar pin remains"
    expected: "The pinned icon on the Windows taskbar still launches Claude Terminal after the update — the pin is not lost"
    why_human: "Windows taskbar pin survival across NSIS updates can only be verified by performing an actual install-over-install on a real Windows 10/11 machine. No programmatic check can replicate this."
---

# Phase 17: Taskbar Pin Stability Verification Report

**Phase Goal:** Fix Windows taskbar pin loss on auto-update by setting explicit AUMID, disabling forced shortcut recreation, and guarding shortcut deletion during update runs
**Verified:** 2026-02-26
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Taskbar pin survives app updates — the NSIS installer no longer deletes and recreates shortcuts during update runs | VERIFIED | `build-assets/installer-custom.nsh` line 38: `${ifNot} ${isUpdated}` wraps `Delete "$DESKTOP\Claude Terminal.lnk"` |
| 2 | Running app AUMID matches the shortcut AUMID — no duplicate taskbar icons | VERIFIED | `main.js` line 52-54: `app.setAppUserModelId('com.yanis.claude-terminal')` guarded by `process.platform === 'win32'`, placed before any window creation; `electron-builder.config.js` line 7: `appId: "com.yanis.claude-terminal"` — strings match exactly |
| 3 | Existing users upgrading from allowToChangeInstallationDirectory:true experience no install path issues | VERIFIED | `electron-builder.config.js` line 68: `allowToChangeInstallationDirectory: false` with comment "false prevents keepShortcuts=false — preserves taskbar pin across updates" |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `main.js` | Explicit AppUserModelId set on win32 before any window creation | VERIFIED | Line 52-54: `if (process.platform === 'win32') { app.setAppUserModelId('com.yanis.claude-terminal'); }` — first statement in `bootstrapApp()`, before all `require()` calls and window creation |
| `electron-builder.config.js` | NSIS config with allowToChangeInstallationDirectory disabled | VERIFIED | Line 68: `allowToChangeInstallationDirectory: false` |
| `build-assets/installer-custom.nsh` | Guarded shortcut deletion that skips during updates | VERIFIED | Lines 35-41: `!macro customUnInstall` wraps `Delete` with `${ifNot} ${isUpdated}` / `${endIf}` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.js` | `electron-builder.config.js` | AUMID string must match appId | VERIFIED | Both use `com.yanis.claude-terminal` — `main.js` line 53, `electron-builder.config.js` line 7 |
| `electron-builder.config.js` | `build-assets/installer-custom.nsh` | include directive references custom NSH | VERIFIED | `electron-builder.config.js` line 76: `include: "build-assets/installer-custom.nsh"` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PIN-01 | 17-01-PLAN.md | Windows taskbar pin survives app auto-updates — shortcuts preserved during update runs, AUMID consistent between running process and shortcut | SATISFIED | Three independent fixes implemented: explicit AUMID in main.js, `allowToChangeInstallationDirectory: false` in electron-builder.config.js, and `${isUpdated}` guard in installer-custom.nsh |

### Anti-Patterns Found

None. No TODO, FIXME, HACK, XXX, placeholder comments, or empty/stub implementations found in any of the three modified files.

### Human Verification Required

#### 1. NSIS build compiles without error on `${isUpdated}` in customUnInstall

**Test:** Run `npm run build:win` and inspect the full build output for any NSIS compilation error
**Expected:** Build succeeds; no error referencing `isUpdated`, `customUnInstall`, or undefined variable
**Why human:** The plan itself flagged this as LOW confidence (see plan task 2 NOTE). `${isUpdated}` is a compile-time define set by electron-builder's `assistedInstaller.nsh` template. Whether it is in scope inside the `customUnInstall` macro depends on include order during NSIS compilation — something that can only be confirmed by a real build run. If out of scope, the build will fail with a NSIS compile error.

#### 2. Taskbar pin survives an actual over-install update on Windows

**Test:** On Windows 10 or 11 — install a previous Claude Terminal version, pin the taskbar icon, then install the patched build as an update. Verify the pin is intact after installation completes.
**Expected:** The pinned taskbar icon still exists and launches Claude Terminal after the update; no re-pinning required
**Why human:** Windows taskbar pin behavior during NSIS installer runs cannot be verified programmatically. This requires a real Windows machine performing an actual install-over-install update scenario.

### Gaps Summary

No automated gaps found. All three code changes are present, substantive, correctly placed, and wired. Both commits (56062108, 4f96e8f8) are confirmed in git history. The only outstanding item is a human build test to confirm the `${isUpdated}` NSIS define is in scope for `customUnInstall` — this was noted as a known low-confidence assumption in the original plan.

---

_Verified: 2026-02-26_
_Verifier: Claude (gsd-verifier)_
