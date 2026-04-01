---
phase: 21-integrated-markdown-viewer
plan: 01
subsystem: renderer/file-tabs
tags: [markdown, file-viewer, terminal-manager, css, i18n]
dependency_graph:
  requires: []
  provides: [markdown-rendering, toc-sidebar, md-viewer-css]
  affects: [TerminalManager.js, terminal.css, en.json, fr.json]
tech_stack:
  added: [marked ^17.0.3 (instance-based Marked API)]
  patterns: [new Marked() isolated instance, delegated click handlers, createMdRenderer factory]
key_files:
  created: []
  modified:
    - src/renderer/ui/components/TerminalManager.js
    - styles/terminal.css
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json
decisions:
  - "Use new Marked() instance (not global marked.use()) to avoid config conflict with ChatView's global marked config"
  - "isMarkdown branch placed before else text fallback — md files get rendered preview, not raw text with syntax highlighting"
  - "setSetting('mdViewerTocExpanded') persists TOC collapse state across tabs using !== false guard for safe defaults"
  - "mdCleanup set to null on tab creation — Plan 21-02 will set it to a file-watcher teardown function"
  - "Delegated event listeners on wrapper element (not individual elements) — efficient for dynamic HTML rendered by marked"
metrics:
  duration: 189s
  completed: 2026-02-27
  tasks_completed: 2
  files_modified: 4
---

# Phase 21 Plan 01: Integrated Markdown Viewer Summary

Markdown preview branch added to `openFileTab()` using an isolated `new Marked()` instance with custom renderers for code blocks, links, images, headings, and tables — plus a collapsible TOC sidebar, rendered/source toggle button, Ctrl+click link gating, and full CSS theming using app dark-theme variables.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add markdown rendering branch to openFileTab and cleanup to closeTerminal | 255d860b | TerminalManager.js, en.json, fr.json |
| 2 | Add markdown viewer CSS styles | 2a860320 | styles/terminal.css |

## What Was Built

### Task 1: TerminalManager.js markdown branch

- **`createMdRenderer(basePath)`** — Factory returning an isolated `new Marked()` instance with custom renderers:
  - `code` — Generates `chat-code-block` HTML with language label and copy button (reuses ChatView CSS)
  - `codespan` — Generates `chat-inline-code` spans
  - `table` — Generates `chat-table-wrapper/chat-table` HTML (reuses chat CSS)
  - `link` — Generates `md-viewer-link` anchors with `data-md-link` attribute and Ctrl+click tooltip
  - `image` — Resolves relative images to `file:///` URLs using `path.resolve(basePath, href)`
  - `heading` — Generates anchored headings with `id="md-h-{slug}"` for TOC scroll targets
  - `html` — Returns empty string (blocks raw HTML injection)
- **`buildMdToc(content)`** — Lexes markdown, extracts headings, generates `<nav class="md-toc-nav">` with depth-based indentation
- **`isMarkdown = ext === 'md'`** — Detection flag added after `isMedia`
- **Markdown branch in `openFileTab`** — When `isMarkdown`:
  - Parses content with `mdRenderer.parse(content)`
  - Builds TOC with `buildMdToc(content)`
  - Generates source view with syntax-highlighted markdown using existing `highlight(content, 'md')`
  - Sets `termData.isMarkdown`, `termData.mdViewMode`, `termData.mdRenderer`, `termData.mdCleanup = null`
- **After `container.appendChild(wrapper)`** — Adds toggle button to header, wires delegated click handlers:
  - Copy button handler (`chat-code-copy`) — `navigator.clipboard.writeText()` with `.copied` class for 1.5s
  - Ctrl+click link gating (`data-md-link`) — calls `api.dialog.openExternal()` only when `e.ctrlKey`
  - TOC smooth scroll (`data-toc-link`) — `scrollIntoView({ behavior: 'smooth' })`
  - TOC collapse toggle (`.md-toc-toggle`) — toggles `.collapsed` class, persists to `setSetting('mdViewerTocExpanded')`
- **`closeTerminal`** — Extended file tab cleanup to call `termData.mdCleanup()` if set
- **`setSetting`** — Added to the destructured import from `../../state`
- **`const { Marked } = require('marked')`** — Added after the state import

### Task 2: terminal.css markdown styles

- **Layout** — `.md-viewer-wrapper` flex container, `.md-viewer-content` flex column
- **TOC sidebar** — `.md-viewer-toc` 240px with collapse animation to 40px; `.md-toc-*` title, list, items with depth indentation (28px/40px/52px/64px/76px for depths 2-6)
- **Rendered body** — `.md-viewer-body` with full prose styles: h1-h6 with border-bottom on h1/h2, paragraph, ul/ol, li, blockquote with accent left-border, hr, strong, em, links, images
- **Code reuse** — `.md-viewer-body .chat-code-block` and `.chat-table` inherit existing chat CSS
- **Inline code** — `.chat-inline-code` styled with monospace font
- **Source view** — `.md-viewer-source` flex column, `.file-viewer-content` reuse
- **Toggle button** — `.md-viewer-toggle-btn` with normal/hover/active states using accent color
- **Search bar** — `.md-viewer-search` prepared for Plan 21-02 (hidden by default with `.visible` modifier)

### i18n Keys Added

**en.json:**
```json
"mdViewer": {
  "tableOfContents": "Table of Contents",
  "toggleToc": "Toggle table of contents",
  "toggleSource": "View source",
  "toggleRendered": "View rendered",
  "ctrlClickToOpen": "Ctrl+click to open",
  "searchPlaceholder": "Search in document...",
  "noResults": "No results"
}
```

**fr.json:** Matching French translations added.

## Verification Results

- `npm run build:renderer` — PASSED (no errors)
- `npm test` — PASSED (281 tests, 14 suites, no regressions)
- `isMarkdown` appears 4 times in TerminalManager.js
- `md-viewer-wrapper` appears in terminal.css
- `mdViewer` key appears in both en.json and fr.json
- `mdCleanup` appears 2 times in TerminalManager.js (set on termData + called in closeTerminal)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/renderer/ui/components/TerminalManager.js` — EXISTS, contains `isMarkdown`, `createMdRenderer`, `buildMdToc`, `mdCleanup`
- `styles/terminal.css` — EXISTS, contains `md-viewer-wrapper`
- `src/renderer/i18n/locales/en.json` — EXISTS, contains `mdViewer`
- `src/renderer/i18n/locales/fr.json` — EXISTS, contains `mdViewer`
- Commit 255d860b — EXISTS (Task 1)
- Commit 2a860320 — EXISTS (Task 2)
