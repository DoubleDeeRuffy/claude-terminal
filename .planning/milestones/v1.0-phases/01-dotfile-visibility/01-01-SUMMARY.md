---
phase: 01-dotfile-visibility
plan: 01
subsystem: file-explorer
tags: [dotfiles, file-explorer, search, visibility]
dependency_graph:
  requires: []
  provides: [dotfile-visibility-tree, dotfile-visibility-search]
  affects: [FileExplorer.js]
tech_stack:
  added: []
  patterns: [IGNORE_PATTERNS blocklist, direct filter removal]
key_files:
  created: []
  modified:
    - src/renderer/ui/components/FileExplorer.js
decisions:
  - "Remove blanket dotfile filter entirely (no toggle) — user explicitly chose show-all approach"
  - "IGNORE_PATTERNS blocklist retained unchanged — .git, node_modules, .DS_Store, .env.local remain hidden"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-24"
  tasks_completed: 2
  files_modified: 1
---

# Phase 1 Plan 01: Dotfile Visibility Summary

**One-liner:** Removed blanket `name.startsWith('.')` dotfile filter from both `readDirectoryAsync` and `collectAllFiles` in FileExplorer.js so dotfolders like `.planning`, `.claude`, and `.github` appear in the tree view and Ctrl+P search while IGNORE_PATTERNS entries remain hidden.

## What Was Done

Two surgical line deletions in `src/renderer/ui/components/FileExplorer.js`:

1. **Task 1 — Remove dotfile filters (commit d8a2652)**
   - Removed `if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;` from `readDirectoryAsync` (tree view path)
   - Removed the identical line from `collectAllFiles` (Ctrl+P search path)
   - `IGNORE_PATTERNS.has(name)` checks remain intact — blocklisted entries (.git, node_modules, .DS_Store, .env.local, etc.) stay hidden

2. **Task 2 — Rebuild renderer and verify tests**
   - `npm install` was required first (dependencies not yet installed — Rule 3 auto-fix)
   - `npm run build:renderer` succeeded: `dist/renderer.bundle.js` rebuilt cleanly
   - `npm test` passed: 262 tests across 13 suites, all green
   - `dist/` is gitignored (correct behavior) — no separate commit needed

## Verification Results

| Check | Result |
|-------|--------|
| `name.startsWith('.')` occurrences in FileExplorer.js | 0 (PASS) |
| `IGNORE_PATTERNS.has(name)` occurrences in FileExplorer.js | 2 (PASS) |
| `npm run build:renderer` | Success (PASS) |
| `npm test` (262 tests, 13 suites) | All pass (PASS) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing npm dependencies**
- **Found during:** Task 2
- **Issue:** `npm run build:renderer` failed with `Cannot find module 'esbuild'` — `node_modules/` not installed
- **Fix:** Ran `npm install` before the build step
- **Files modified:** node_modules/ (not committed — gitignored)
- **Commit:** N/A (no source change)

**2. [Expected] dist/renderer.bundle.js gitignored**
- **Found during:** Task 2 commit
- **Issue:** Plan lists `dist/renderer.bundle.js` as artifact to commit, but .gitignore correctly excludes `dist/`
- **Resolution:** Build artifact is correctly not committed. Build success verified by exit code and output message.

## Self-Check

- [x] `src/renderer/ui/components/FileExplorer.js` modified — verified by grep (0 dotfile filters, 2 IGNORE_PATTERNS checks)
- [x] Commit d8a2652 exists in git log
- [x] `npm run build:renderer` succeeded
- [x] `npm test` — 262/262 tests passed

## Self-Check: PASSED
