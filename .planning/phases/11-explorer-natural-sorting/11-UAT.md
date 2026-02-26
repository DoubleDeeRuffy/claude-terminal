---
status: complete
phase: 11-explorer-natural-sorting
source: 11-01-SUMMARY.md
started: 2026-02-25T12:00:00Z
updated: 2026-02-25T12:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Natural Sort Order in File Explorer
expected: Open a project with numbered files (e.g., file1, file2, file10, file20). They should appear in natural numeric order: file1, file2, file10, file20 — NOT lexicographic (file1, file10, file2, file20). Directories appear before files.
result: pass

### 2. Dotfiles Sort First Within Groups
expected: In a directory containing dotfiles (e.g., .gitignore, .env) alongside regular files, dotfiles should appear before regular files within the files group (after all directories). Special-char-prefixed names (like _helpers) sort between dotfiles and normal alphanumeric names.
result: pass

### 3. Natural Sort Toggle in Settings
expected: Open Settings. In the Explorer section (same card as "Show dotfiles"), there should be a toggle for "Natural sort" (or localized equivalent). It should be ON by default.
result: pass

### 4. Toggling Natural Sort Off
expected: Turn the Natural Sort toggle OFF in Settings, then open/refresh a file explorer. Files with numbers should now appear in strict lexicographic order (file1, file10, file2, file20 instead of file1, file2, file10, file20).
result: pass

### 5. Search Results Use Natural Sort
expected: Use the file explorer search. Results containing numbered filenames should appear in natural numeric order (same as the tree view), not lexicographic order.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
