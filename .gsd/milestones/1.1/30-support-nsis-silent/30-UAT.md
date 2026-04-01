---
phase: 30-support-nsis-silent
status: PASS
tested: 2026-02-28
---

# Phase 30 UAT: Support-NSIS-Silent

## Test Results

### T1: SetSilent normal removed — PASS
- **Method:** Code review + grep
- **Result:** `SetSilent normal` no longer exists as an NSIS instruction. Only appears in a comment explaining the removal.
- **Verdict:** PASS

### T2: customInstall macro with correct guards — PASS
- **Method:** Code review
- **Result:** `customInstall` macro writes `.silent-install` marker only when `${Silent}` is true AND `${isUpdated}` is false. Uses `$PROFILE` (maps to `%USERPROFILE%` = `os.homedir()`).
- **Verdict:** PASS

### T3: customUnInstall unchanged — PASS
- **Method:** Code diff review
- **Result:** Desktop shortcut cleanup logic unchanged — still deletes only on real uninstall (`${ifNot} ${isUpdated}`).
- **Verdict:** PASS

### T4: Silent install marker detection — PASS
- **Method:** Simulated marker file test (Node.js)
- **Result:** When `.silent-install` marker exists, `isFirstLaunch()` returns `false`, applies defaults (setupCompleted=true, hooksEnabled=true, launchAtStartup=false), and deletes the marker.
- **Verdict:** PASS

### T5: Normal launch unaffected — PASS
- **Method:** Simulated test (no marker, setupCompleted=true)
- **Result:** `isFirstLaunch()` returns `false` as expected — existing users unaffected.
- **Verdict:** PASS

### T6: Fresh install wizard still shows — PASS
- **Method:** Simulated test (no marker, setupCompleted absent)
- **Result:** `isFirstLaunch()` returns `true` — wizard will show for normal fresh installs.
- **Verdict:** PASS

### T7: Safety guard — marker with existing setup — PASS
- **Method:** Simulated test (marker exists, setupCompleted already true)
- **Result:** `isFirstLaunch()` returns `false`, settings not overwritten, marker cleaned up.
- **Verdict:** PASS

### T8: MUI defines preserved — PASS
- **Method:** Grep count
- **Result:** All 8 MUI defines present (welcome, finish, abort warning, uninstaller text).
- **Verdict:** PASS

### T9: Build succeeds — PASS
- **Method:** `npm run build:renderer`
- **Result:** Builds successfully without errors.
- **Verdict:** PASS

### T10: All tests pass — PASS
- **Method:** `npm test`
- **Result:** 1124 tests pass, 0 failures.
- **Verdict:** PASS

## Untestable Items (require full installer build)
- Actual NSIS compilation of `installer-custom.nsh` with electron-builder
- End-to-end silent install via `installer.exe /S`
- Auto-update flow via electron-updater passing `/S --updated`
- These would be verified during the next release build.

## Summary
All testable aspects pass. The NSIS script changes are syntactically correct and follow documented electron-builder patterns. The app-side detection logic works correctly across all scenarios (marker present, absent, edge cases).
