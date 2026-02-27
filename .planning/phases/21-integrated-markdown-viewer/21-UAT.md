---
status: testing
phase: 21-integrated-markdown-viewer
source: 21-01-SUMMARY.md, 21-02-SUMMARY.md
started: 2026-02-27T12:00:00Z
updated: 2026-02-27T12:00:00Z
---

## Current Test

number: 6
name: Ctrl+F in-document search
expected: |
  With a markdown tab focused, press Ctrl+F. A search bar appears. Type a term — matches are highlighted. Enter goes to next match, Shift+Enter to previous, Escape closes the search bar.
awaiting: user response

## Tests

### 1. Open markdown file as rendered preview
expected: In the file explorer, click a .md file. It opens as a rendered markdown preview with formatted headings, code blocks (with copy buttons), tables, links, and images — not raw text.
result: PASS

### 2. Table of Contents sidebar
expected: The markdown tab shows a TOC sidebar on the left listing all headings. Clicking a heading scrolls the document smoothly to that section. The collapse/expand toggle works and persists its state across tabs.
result: PASS (icon fix: swapped hamburger to chevron matching main sidebar)

### 3. Source/Rendered toggle
expected: A toggle button in the tab header switches between rendered markdown preview and syntax-highlighted source view of the raw markdown.
result: PASS

### 4. Ctrl+click link gating
expected: Links in the rendered markdown show a "Ctrl+click to open" tooltip. Clicking without Ctrl does nothing. Ctrl+clicking opens the link in the default browser.
result: PASS (fixes: tooltip now shows URL, anchor links scroll in-document)

### 5. Live reload on file change
expected: While a .md file is open in a tab, edit and save that file externally (e.g., in VS Code). The preview updates automatically without losing your scroll position.
result: PASS (fixes: persistent:true for watcher, termData.mdRenderer scoping bug)

### 6. Ctrl+F in-document search
expected: With a markdown tab focused, press Ctrl+F. A search bar appears. Type a term — matches are highlighted. Enter goes to next match, Shift+Enter to previous, Escape closes the search bar.
result: PASS (fix: replaced window.find with custom mark-based highlighting to keep focus in searchbar, 400ms debounce, match counter)

### 7. Double-click .md opens in external editor
expected: Double-clicking a .md file in the file explorer opens it in your configured external editor (not as a preview tab).
result: [pending]

### 8. Tab cleanup on close
expected: Open a .md file, then close the tab. No errors in the console. Opening the same file again works normally (file watcher is properly cleaned up).
result: [pending]

## Summary

total: 8
passed: 4
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
