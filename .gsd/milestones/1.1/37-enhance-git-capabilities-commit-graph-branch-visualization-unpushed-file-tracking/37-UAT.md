---
status: testing
phase: 37-enhance-git-capabilities-commit-graph-branch-visualization-unpushed-file-tracking
source: [37-01-SUMMARY.md, 37-02-SUMMARY.md, 37-03-SUMMARY.md]
started: 2026-04-04T10:30:00Z
updated: 2026-04-04T10:30:00Z
---

## Current Test

number: 1
name: Branch treeview sections
expected: |
  Open a git-tracked project. Click the Git tab. The branch sidebar shows three collapsible sections: Recent, Local, Remote. Each section has a chevron toggle to expand/collapse.
awaiting: user response

## Tests

### 1. Branch treeview sections
expected: Open a git-tracked project. Click the Git tab. The branch sidebar shows three collapsible sections: Recent, Local, Remote. Each section has a chevron toggle to expand/collapse.
result: [pending]

### 2. Branch hierarchical folders
expected: In the Local section, branches with slash prefixes (e.g. feat/phase-37-...) are grouped under folder nodes (e.g. "feat" folder). Clicking a folder expands/collapses its children.
result: [pending]

### 3. Ahead/behind tracking badges
expected: Local branches that track a remote show ahead/behind commit counts next to the branch name (e.g. arrow with number like "2" or "29"). Branches with no remote tracking show no badge.
result: [pending]

### 4. Branch search filtering
expected: A search input appears at the top of the branch list. Typing filters branches across all sections in real-time (with slight debounce). Clearing search restores full list.
result: [pending]

### 5. Branch actions preserved
expected: Right-clicking or hovering a branch still shows checkout, merge, delete actions. Checking out a different branch works as before.
result: [pending]

### 6. Arrow indicators on branch button
expected: The current branch button in the git action bar shows a green up-arrow when local is ahead of remote, and a blue down-arrow when local is behind. If both ahead and behind, both arrows appear.
result: [pending]

### 7. Commit graph modal opens
expected: A graph icon button is visible in the git sidebar header (branches section). Clicking it opens a modal dialog showing the commit graph with colored SVG branch lanes.
result: [pending]

### 8. Commit graph modal resizable
expected: The commit graph modal can be resized by dragging its edges or corners. The modal has a minimum size and does not shrink below it.
result: [pending]

### 9. Commit graph modal size persists
expected: Resize the commit graph modal to a custom size, close it, then reopen. The modal opens at the previously resized dimensions.
result: [pending]

### 10. Commit graph filter toolbar
expected: The commit graph modal has a filter toolbar at the top with: search text input, author dropdown, branch dropdown, date-from input, date-to input, and path filter input. Filters narrow the displayed commits.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps
