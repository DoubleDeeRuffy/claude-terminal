# Phase 32: Close-Warnings

## Goal

Warn the user before closing the app if any Claude instance is actively working (not idle) in any project, so that closing doesn't silently interrupt ongoing work. The warning should show which project and which tab (by tab name) is still active.

## Requirements

- [CLOSE-01] Intercept app close (window close / tray quit) and check if any Claude instance is currently working (not idle)
- [CLOSE-02] If active work is detected, show a confirmation dialog listing the affected project(s) and tab name(s)
- [CLOSE-03] Allow the user to proceed with closing or cancel
- [CLOSE-04] If no active work is detected, close normally without any dialog

## Notes

- Claude activity status is tracked per-terminal in the claudeActivity state (Phase 29)
- Tab names are available from the tab elements / terminal session state
- Must handle both the window close button (minimize to tray) and the actual quit action
