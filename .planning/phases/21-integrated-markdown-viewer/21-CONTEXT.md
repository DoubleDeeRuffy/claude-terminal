# Phase 21: Integrated Markdown Viewer - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Render markdown files inline within Claude Terminal as formatted content. Users can view `.md` files from the file explorer as rendered markdown in a dedicated tab, with toggle to raw source. This is a read-only viewer — editing is done in external editors.

</domain>

<decisions>
## Implementation Decisions

### Viewing Trigger
- Single-click on `.md` file in file explorer opens rendered markdown preview
- Double-click opens the file in the configured external editor (existing behavior)
- Only `.md` files get rendered preview treatment — other file types unaffected

### Tab Behavior
- Markdown preview opens as a normal tab (same tab system as terminal/chat tabs)
- Tab name shows the filename (e.g., "README.md", "CLAUDE.md")
- Multiple markdown files can be open simultaneously as separate tabs
- Clicking an already-open `.md` file focuses its existing tab instead of opening a duplicate
- Close button and middle-click work the same as terminal tabs

### Preview/Source Toggle
- Toggle button located in the tab header to switch between rendered markdown and raw source text
- Default view is rendered markdown

### Visual Styling
- Rendered markdown uses the app's existing dark theme colors, accent color, and typography — feels native
- Fenced code blocks get language-aware syntax highlighting (```js, ```python, etc.)
- Code blocks have a copy-to-clipboard button that appears on hover

### Link Handling
- Links are Ctrl+click to open (gated to prevent accidental navigation)
- Tooltip on links indicates "Ctrl+click to open"
- External links open in default browser

### Live Reload
- File watcher detects changes on disk and re-renders automatically (cross-platform: Windows, macOS, Linux)

### Search
- Ctrl+F opens a search bar within the markdown preview

### Table of Contents
- Collapsible TOC sidebar generated from document headings
- Expanded by default
- Collapsed/expanded state persisted across app restarts (setting)

### Images
- Relative image paths (e.g., `./screenshot.png`) are resolved and rendered inline

### Claude's Discretion
- Syntax highlighting library choice (existing codebase may already have one)
- File watcher implementation details (fs.watch vs chokidar vs other)
- Search bar UI design and highlight style
- TOC sidebar width and positioning
- Scroll position management
- Error handling for malformed markdown or missing images

</decisions>

<specifics>
## Specific Ideas

- Tab system should be fully consistent with existing terminal/chat tabs — same close behavior, same tab bar, same visual weight
- Ctrl+click link gating with tooltip — prevents accidental navigation, familiar pattern from VS Code
- TOC state persistence means the setting survives app restarts — user sets it once

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-integrated-markdown-viewer*
*Context gathered: 2026-02-27*
