---
created: 2026-02-28T00:00:00.000Z
title: Create PR for Phase 30 — NSIS Silent Install Support
area: installer
files:
  - build-assets/installer-custom.nsh
  - src/main/windows/SetupWizardWindow.js
---

## Task

Create a PR to upstream `Sterll/claude-terminal` for phase 30 (NSIS silent install support).

## Changes

- Removed `SetSilent normal` from `customInit` — fixes `/S` flag and auto-updates via electron-updater
- Added `customInstall` macro that writes `.silent-install` marker for first-time silent installs (guarded by `${Silent}` and `${isUpdated}`)
- Added `applySilentInstallDefaults()` and modified `isFirstLaunch()` in SetupWizardWindow.js to detect marker, apply defaults (hooks ON, startup OFF), delete marker, and skip wizard

## Notes

- UAT passed (10/10 tests + manual silent install confirmation)
- Branch: needs to be created from the phase 30 commit (`feat/phase-30-nsis-silent-install`)
- PR target: `gh pr create --repo Sterll/claude-terminal --head DoubleDeeRuffy:BRANCH`
- Related: PR #16 has a desktop shortcut deletion issue — comment posted with investigation findings
