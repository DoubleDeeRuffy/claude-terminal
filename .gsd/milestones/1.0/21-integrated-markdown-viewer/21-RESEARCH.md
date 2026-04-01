# Phase 21: Integrated Markdown Viewer - Research

**Researched:** 2026-02-27
**Domain:** Markdown rendering, file tab integration, file watching, in-app search, TOC generation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Single-click on `.md` file opens rendered markdown preview tab
- Double-click opens in configured external editor (existing behavior — no change needed)
- Only `.md` files get rendered preview — other file types unaffected
- Markdown preview opens as a normal tab (same tab system as terminal/chat/file tabs)
- Tab name shows filename (e.g., "README.md", "CLAUDE.md")
- Multiple `.md` files can be open as separate tabs simultaneously
- Clicking an already-open `.md` tab focuses its existing tab (no duplicates)
- Close button and middle-click work same as terminal tabs
- Toggle button in tab header switches between rendered markdown and raw source
- Default view is rendered markdown
- Dark theme colors, accent color, and typography — feels native
- Fenced code blocks get language-aware syntax highlighting
- Code blocks have copy-to-clipboard button that appears on hover
- Links are Ctrl+click to open (gated to prevent accidental navigation)
- Tooltip on links says "Ctrl+click to open"
- External links open in default browser
- File watcher detects disk changes and re-renders automatically (cross-platform)
- Ctrl+F opens a search bar within the markdown preview
- Collapsible TOC sidebar generated from document headings
- TOC expanded by default
- TOC collapsed/expanded state persisted across app restarts (setting)
- Relative image paths resolved and rendered inline

### Claude's Discretion

- Syntax highlighting library choice (existing codebase may already have one)
- File watcher implementation details (fs.watch vs chokidar vs other)
- Search bar UI design and highlight style
- TOC sidebar width and positioning
- Scroll position management
- Error handling for malformed markdown or missing images

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 21 adds a markdown preview tab to the existing file viewer system in Claude Terminal. The codebase already has all core primitives needed: `marked` v17.0.3 is an active dependency used in ChatView, an existing file tab system (`openFileTab` in TerminalManager.js) handles non-terminal content, and the custom regex-based `syntaxHighlight.js` provides language-aware highlighting.

The implementation strategy is to extend `openFileTab()` in TerminalManager.js with a new markdown branch: when a `.md` file is opened, render using `marked` with a custom renderer (modeled on the existing ChatView pattern), wrap it in a scrollable container with a header showing toggle/search controls and a collapsible TOC sidebar. The file click handler in FileExplorer.js already routes single-click to `onOpenFile` → `TerminalManager.openFileTab()`, so no change is needed there.

For live reload, `fs.watch()` (available via Node.js in the preload bridge under `window.electron_nodeModules.fs`) is the correct cross-platform choice — no new dependency needed. The preload bridge exposes `fs.readFileSync` and `fs.existsSync` for re-reading the file. TOC collapse state can be stored in `settings.json` via the existing `setSetting`/`getSetting` pattern.

**Primary recommendation:** Extend `openFileTab()` with a markdown branch, reuse the ChatView `marked` configuration pattern for rendering, use `fs.watch()` from the preload for live reload (exposed via a thin IPC wrapper), and model CSS on existing `.file-viewer-*` and `.chat-code-*` classes.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `marked` | ^17.0.3 | Markdown-to-HTML parsing | Already a production dependency; used in ChatView |
| Custom `syntaxHighlight.js` | (in-repo) | Language-aware code highlighting | Already integrated; used by ChatView code renderer |
| Node.js `fs.watch` | built-in (Node 18+) | File change detection | No new dependency; preload already exposes `fs` methods |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `navigator.clipboard` | Web API | Copy-to-clipboard for code blocks | Same pattern as ChatView copy button |
| `getSetting`/`setSetting` | in-repo state | TOC expand/collapse persistence | Same pattern used by all settings in codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fs.watch` | `chokidar` | chokidar is more reliable on macOS symlinks and deep trees, but adds a dependency; for a single file watch (not directory trees), `fs.watch` is sufficient |
| `marked` custom renderer | `markdown-it` | markdown-it is more extensible; but `marked` is already present and the ChatView pattern proves it works |
| Custom syntax highlighter | `highlight.js` or `shiki` | These provide better coverage; but the custom `syntaxHighlight.js` already handles all common languages and avoids a new dep; if code quality is insufficient, `highlight.js` is the upgrade path |

**Installation:** No new packages required. All stack components already exist in the codebase.

## Architecture Patterns

### Recommended Project Structure

No new files or modules need to be created. Changes are isolated to:

```
src/renderer/ui/components/TerminalManager.js   # Extend openFileTab() with markdown branch
src/renderer/ui/components/FileExplorer.js      # Change single-click behavior for .md files
styles/terminal.css                             # Add .md-viewer-* CSS classes
src/renderer/i18n/locales/en.json               # Add mdViewer.* keys
src/renderer/i18n/locales/fr.json               # Add mdViewer.* keys (same keys in French)
src/main/ipc/dialog.ipc.js  (OR new ipc file)  # File watch IPC channel (optional — see below)
src/main/preload.js                             # Expose fs.watch if going IPC-free approach
```

### Pattern 1: Markdown Rendering (extend existing marked config)

**What:** The `openFileTab()` function in TerminalManager.js already has branches for images, video, audio, and text. Add a markdown branch that reads the file, runs `marked.parse()`, and injects the result into the wrapper HTML.

**When to use:** When `ext === 'md'`

**Example (based on existing ChatView pattern):**
```javascript
// Source: existing ChatView.js lines 32-83 (ensureMarkedConfig + renderMarkdown pattern)
const { marked } = require('marked');

function ensureMdViewerMarkedConfig() {
  // Configure a SEPARATE marked instance or reuse ensureMarkedConfig()
  // Key differences from ChatView:
  //   - Images: resolve relative paths to file:// URLs
  //   - Links: Ctrl+click gating (no target="_blank" by default)
  //   - Code blocks: same copy-button pattern as ChatView
}

function renderMdFile(content, filePath) {
  ensureMdViewerMarkedConfig();
  const basePath = path.dirname(filePath);
  // Override image renderer to resolve relative paths
  return marked.parse(content);
}
```

**Critical:** `marked` uses a global singleton configuration. The ChatView already calls `marked.use()` to configure it globally. The markdown viewer MUST NOT call `marked.use()` again with conflicting options — reuse `ensureMarkedConfig()` from ChatView, or create a separate `Marked` instance using `new marked.Marked()` (available in marked v5+).

### Pattern 2: File Tab Extension (existing openFileTab pattern)

**What:** The `openFileTab()` function in TerminalManager.js (lines 3257-3399) already handles file tabs. The markdown branch adds:
1. `isMarkdown` detection (`ext === 'md'`)
2. A `viewerBody` with two sections: `md-viewer-body` (rendered HTML) and `md-viewer-source` (raw code)
3. Header with toggle button (rendered/source), Ctrl+F search bar
4. TOC sidebar panel

**Store the tab state (for toggle and watcher):**
```javascript
const termData = {
  type: 'file',
  filePath,
  project,
  projectIndex,
  name: fileName,
  status: 'ready',
  isMarkdown: true,         // NEW
  mdViewMode: 'rendered',   // NEW: 'rendered' | 'source'
  mdWatcher: null,          // NEW: fs.FSWatcher reference for cleanup
};
```

**Cleanup on close:** When `closeTerminal(id)` is called, the existing cleanup path runs. The markdown watcher must be stopped. Hook into `closeTerminal()` to call `termData.mdWatcher?.close()` before removing.

### Pattern 3: Live Reload via fs.watch

**What:** Node.js `fs.watch()` fires on file changes. The preload does NOT currently expose `fs.watch()`. Two implementation approaches:

**Approach A — IPC channel (recommended):** Add a new IPC handler `dialog:watchFile` / `dialog:unwatchFile` that takes a file path and emits events back to renderer via `ipcRenderer.on('file-changed', ...)`. This is the cleanest architecture (main process owns Node.js resources).

**Approach B — Preload fs.watch exposure:** Expose `fs.watch` through the preload bridge. This is simpler but gives renderer direct access to Node.js native API, which is architecturally messier.

**Recommendation:** Use Approach A (IPC) to match the established pattern. Add 2 IPC handlers to `dialog.ipc.js`:
```javascript
// In dialog.ipc.js
const watchers = new Map(); // filePath -> FSWatcher

ipcMain.handle('dialog:watchFile', (event, filePath) => {
  if (watchers.has(filePath)) return; // already watching
  const watcher = fs.watch(filePath, { persistent: false }, () => {
    mainWindow.webContents.send('file-changed', filePath);
  });
  watchers.set(filePath, watcher);
});

ipcMain.handle('dialog:unwatchFile', (event, filePath) => {
  const watcher = watchers.get(filePath);
  if (watcher) { watcher.close(); watchers.delete(filePath); }
});
```

Add to preload bridge:
```javascript
dialog: {
  // ... existing methods
  watchFile: (filePath) => ipcRenderer.invoke('dialog:watchFile', filePath),
  unwatchFile: (filePath) => ipcRenderer.invoke('dialog:unwatchFile', filePath),
  onFileChanged: createListener('file-changed'),
}
```

### Pattern 4: TOC Generation

**What:** Parse rendered HTML (or the marked token stream) to extract headings and build a TOC tree. Inject as a collapsible sidebar panel.

**Implementation:** After `marked.parse(content)`, use a regex over the resulting HTML to extract `<h1>`, `<h2>`, `<h3>`, etc., or parse the `marked.lexer(content)` token stream (more reliable).

**Example using marked token stream:**
```javascript
function buildToc(content) {
  const tokens = marked.lexer(content);
  const headings = tokens
    .filter(t => t.type === 'heading')
    .map(t => ({ depth: t.depth, text: t.text, id: t.text.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
  return headings;
}
```

**Anchor linking:** `marked` can add `id` attributes to headings via a custom renderer so TOC links (`<a href="#heading-id">`) scroll to the right place.

**Persistence:** TOC expanded state stored as `setSetting('mdViewerTocExpanded', true/false)`. Uses the same `getSetting`/`setSetting` pattern as all other settings.

### Pattern 5: In-Tab Search (Ctrl+F)

**What:** Show a search bar overlay on Ctrl+F. Use `window.find()` browser API (available in Electron's Chromium renderer) or manually highlight matches using `innerHTML` manipulation.

**Approach A — window.find():** Simple, no extra DOM manipulation, but limited control over highlight style.
**Approach B — Custom DOM search:** Walk text nodes, wrap matches in `<mark>` elements, scroll to first match. More control, more complex.

**Recommendation:** Use `window.find()` for initial implementation since it's built into Chromium, requires no DOM manipulation, and the search bar can be a simple `<input>` that calls `window.find(query, false, false, true)` on each input event. If styling is insufficient, upgrade to DOM approach in a future phase.

**Ctrl+F wiring:** Intercept `keydown` on the wrapper element (same pattern used in ChatView for keyboard shortcuts). Prevent default browser find and show custom search bar instead.

### Pattern 6: Ctrl+Click Link Gating

**What:** In the `marked` custom renderer, links render WITHOUT `target="_blank"` and WITH a `data-md-link` attribute. A delegated click handler on the wrapper intercepts link clicks:
```javascript
wrapper.addEventListener('click', (e) => {
  const link = e.target.closest('[data-md-link]');
  if (!link) return;
  e.preventDefault();
  if (e.ctrlKey) {
    api.dialog.openExternal(link.dataset.mdLink);
  }
  // Without Ctrl: do nothing (blocked)
});
```

Tooltip via `title="Ctrl+click to open"` on the `<a>` element.

### Pattern 7: Relative Image Path Resolution

**What:** The `marked` image renderer receives a relative path like `./screenshot.png`. Resolve it against the file's directory and convert to a `file:///` URL.

**Example:**
```javascript
// In custom marked renderer:
image({ href, title, text }) {
  const resolved = href.startsWith('http') ? href
    : `file:///${path.resolve(basePath, href).replace(/\\/g, '/')}`;
  return `<img src="${resolved}" alt="${escapeHtml(text || '')}" class="md-viewer-img" />`;
}
```

`basePath` = `path.dirname(filePath)` passed via closure.

### Anti-Patterns to Avoid

- **Calling `marked.use()` twice for the same options:** Creates conflicting renderers. Use `new marked.Marked()` for an isolated instance if needed.
- **Re-rendering the entire DOM on every file change:** Causes scroll position loss. Save `scrollTop` before re-render, restore after.
- **Not cleaning up `fs.watch` on tab close:** Memory/resource leak. Always call `watcher.close()` in `closeTerminal()`.
- **`window.find()` in a container that doesn't have focus:** Must call `.focus()` on the wrapper element first.
- **Injecting raw HTML from markdown without sanitization:** `marked` v17 does NOT sanitize by default. Use the same `html()` renderer override that ChatView uses to suppress raw HTML passthrough:
  ```javascript
  marked.use({ renderer: { html() { return ''; } }, tokenizer: { html() { return undefined; } } });
  ```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown parsing | Custom regex parser | `marked` (already in package.json) | GFM tables, nested lists, blockquotes have massive edge cases |
| Syntax highlighting in code fences | Another highlighter | Existing `highlight()` from `syntaxHighlight.js` | Already handles 15+ languages; reused in ChatView |
| TOC heading ID generation | Custom heuristic | `marked.lexer()` token stream | Headings are already parsed; token stream is the ground truth |
| Clipboard copy | Custom IPC | `navigator.clipboard.writeText()` | Same as ChatView copy buttons; works in Electron renderer |

**Key insight:** The ChatView already solved markdown rendering, code blocks with copy buttons, and link handling. The markdown viewer is a read-only version of that same rendering with additions (TOC, toggle, file watcher). Copy, don't reinvent.

## Common Pitfalls

### Pitfall 1: marked Global Configuration Conflict
**What goes wrong:** The ChatView calls `marked.use()` globally on first render. If the markdown viewer also calls `marked.use()` with different renderer options, the later call wins and breaks ChatView rendering.
**Why it happens:** `marked` uses module-level singleton state; `marked.use()` is cumulative/global.
**How to avoid:** Either (a) reuse ChatView's `ensureMarkedConfig()` and `renderMarkdown()` functions directly (may need to expose them), or (b) create a dedicated `new marked.Marked()` instance for the viewer. Option (b) is cleaner.
**Warning signs:** ChatView messages appear with wrong link styling or missing code blocks after opening a markdown file.

### Pitfall 2: Scroll Position Loss on Live Reload
**What goes wrong:** File changes trigger re-render which wipes `innerHTML`, resetting scroll to top.
**Why it happens:** Full DOM replacement on re-render.
**How to avoid:** Save `wrapper.querySelector('.md-viewer-body').scrollTop` before re-render, restore after.
**Warning signs:** User is reading a long document; file saves in background; page jumps to top.

### Pitfall 3: File Watcher Not Cleaned Up
**What goes wrong:** User closes markdown tab but watcher continues, re-rendering into a detached DOM element or throwing errors.
**Why it happens:** `closeTerminal(id)` removes the DOM but doesn't stop the watcher.
**How to avoid:** In `closeTerminal()`, check if `termData.type === 'file' && termData.isMarkdown && termData.mdWatcher`, call `termData.mdWatcher.close()` (or `api.dialog.unwatchFile(termData.filePath)`).
**Warning signs:** IPC error logs after tab close; multiple watchers accumulating.

### Pitfall 4: fs.watch Fires Multiple Times per Save
**What goes wrong:** Most editors save files with a write + rename pattern (temp file → rename), causing `fs.watch` to fire 2-4 times per save.
**Why it happens:** `fs.watch` fires on the OS-level event, which is editor-implementation dependent.
**How to avoid:** Debounce the watcher callback (300ms is sufficient). Only re-render if the debounce timer isn't already running.
**Warning signs:** Visible flicker/double-render on save.

### Pitfall 5: XSS via Markdown Raw HTML
**What goes wrong:** `marked` by default passes raw `<script>` and `<img onerror=...>` tags through as HTML, enabling XSS.
**Why it happens:** `marked` v17 removed the `sanitize` option (deprecated since v5) without a built-in replacement.
**How to avoid:** Apply the same raw HTML suppression that ChatView uses (lines 65-73 of ChatView.js). This is REQUIRED.
**Warning signs:** `<script>` tags in markdown files execute in the renderer.

### Pitfall 6: TOC Links Not Scrolling Correctly
**What goes wrong:** Clicking a TOC link scrolls the page/window instead of the markdown viewer container.
**Why it happens:** Default anchor behavior targets the window scroll, not the `.md-viewer-body` div's scroll.
**How to avoid:** Intercept `<a>` clicks within the TOC, find the target heading element by ID, call `targetEl.scrollIntoView({ behavior: 'smooth' })`.

## Code Examples

### Extending openFileTab for Markdown

```javascript
// Source: TerminalManager.js openFileTab() — new markdown branch
const isMarkdown = ext === 'md';

if (isMarkdown) {
  // Render markdown using separate Marked instance (avoids global config conflict)
  const { Marked } = require('marked');
  const mdInstance = new Marked();
  // Configure: same HTML suppression as ChatView, relative image resolution, Ctrl+click links
  const basePath = path.dirname(filePath);
  mdInstance.use({
    renderer: {
      image({ href, text }) {
        const src = href.startsWith('http') ? href
          : `file:///${path.resolve(basePath, href).replace(/\\/g, '/')}`;
        return `<img src="${src}" alt="${escapeHtml(text || '')}" class="md-viewer-img" />`;
      },
      link({ href, text }) {
        return `<a class="md-viewer-link" data-md-link="${escapeHtml(href || '')}" title="Ctrl+click to open">${escapeHtml(text || '')}</a>`;
      },
      code({ text, lang }) {
        const decoded = (text || '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
        const highlighted = lang ? highlight(decoded, lang) : escapeHtml(decoded);
        return `<div class="chat-code-block"><div class="chat-code-header"><span class="chat-code-lang">${escapeHtml(lang || 'text')}</span><button class="chat-code-copy" title="Copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div><pre><code>${highlighted}</code></pre></div>`;
      },
      html() { return ''; }
    },
    gfm: true, breaks: false
  });

  const renderedHtml = mdInstance.parse(content);
  // Build TOC from token stream...
  viewerBody = `
    <div class="md-viewer-wrapper">
      <div class="md-viewer-toc" id="md-toc-${id}">...</div>
      <div class="md-viewer-body" id="md-body-${id}">${renderedHtml}</div>
    </div>`;
}
```

### Copy Button Wiring (reuse existing pattern)

```javascript
// Delegate from wrapper element — same pattern as ChatView.js line 1349-1358
wrapper.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.chat-code-copy');
  if (copyBtn) {
    const code = copyBtn.closest('.chat-code-block')?.querySelector('code')?.textContent;
    if (code) {
      navigator.clipboard.writeText(code);
      copyBtn.classList.add('copied');
      setTimeout(() => copyBtn.classList.remove('copied'), 1500);
    }
  }
  const link = e.target.closest('[data-md-link]');
  if (link) {
    e.preventDefault();
    if (e.ctrlKey) api.dialog.openExternal(link.dataset.mdLink);
  }
});
```

### File Watcher with Debounce

```javascript
// In renderer, after creating markdown tab:
let reloadTimer = null;
const unsubscribeWatch = api.dialog.onFileChanged((changedPath) => {
  if (changedPath !== filePath) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    try {
      const newContent = fs.readFileSync(filePath, 'utf-8');
      const bodyEl = document.getElementById(`md-body-${id}`);
      if (!bodyEl) return;
      const scroll = bodyEl.scrollTop;
      bodyEl.innerHTML = mdInstance.parse(newContent);
      bodyEl.scrollTop = scroll;
    } catch (e) { /* file temporarily unavailable during save */ }
  }, 300);
});
api.dialog.watchFile(filePath);

// Store unsubscribe fn in termData for cleanup:
termData.mdCleanup = () => {
  unsubscribeWatch();
  api.dialog.unwatchFile(filePath);
  clearTimeout(reloadTimer);
};
```

### Ctrl+F Search with window.find()

```javascript
wrapper.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    e.stopPropagation();
    const searchBar = wrapper.querySelector('.md-viewer-search');
    if (searchBar) {
      searchBar.style.display = 'flex';
      searchBar.querySelector('input').focus();
    }
  }
});

// Search input handler:
searchInput.addEventListener('input', () => {
  const query = searchInput.value;
  if (query) window.find(query, false, false, true); // case-insensitive, wrap
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') window.find(searchInput.value, false, e.shiftKey, true);
  if (e.key === 'Escape') { searchBar.style.display = 'none'; }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `marked.sanitize` option | Custom `html()` renderer override | marked v5 (2022) | Must suppress raw HTML manually — see Pitfall 5 |
| `marked.setOptions()` global | `marked.use()` / `new marked.Marked()` | marked v5+ | Instance-based config avoids global conflicts |

**Deprecated/outdated:**
- `marked.setOptions({ sanitize: true })`: Removed in marked v5; codebase's marked v17 does not support it.
- Single global `marked` config: Still works but causes conflicts when multiple callers configure differently. Use `new marked.Marked()` for isolation.

## Open Questions

1. **Single-click behavior change for .md files**
   - What we know: Currently `openFile()` calls `callbacks.onOpenFile(filePath)` for ALL file types on single click. This already routes to `TerminalManager.openFileTab()`.
   - What's unclear: The user decision says single-click opens markdown preview. But the existing `openFileTab()` for text files also opens on single-click (same path). The `.md` branch just changes WHAT renders (markdown preview vs raw syntax highlight). No click behavior change is needed — only the rendering branch inside `openFileTab()` changes.
   - Recommendation: No change to FileExplorer click handling. Just add the `isMarkdown` branch in `openFileTab()`.

2. **marked instance isolation**
   - What we know: ChatView calls `marked.use()` globally. The `Marked` class (named export from `marked` v5+) creates isolated instances.
   - What's unclear: Whether `new marked.Marked()` is available in marked v17.0.3.
   - Recommendation: Verify via `Object.keys(require('marked'))` at runtime. If `Marked` class exists (it does in v5+), use it. Marked v17 is a major version release well past v5, so `Marked` class is available. Confidence: HIGH based on marked's changelog trajectory.

3. **Double-click to open in external editor (existing behavior)**
   - What we know: Currently `openFile()` triggers on single click (no double-click distinction in FileExplorer). Double-click on the tab name starts renaming (line 3386 in TerminalManager.js).
   - What's unclear: The CONTEXT.md says "double-click opens in external editor" but FileExplorer currently has no double-click handler for files — single click opens them.
   - Recommendation: The markdown preview opens on single click (via `openFileTab()`). The "double-click opens in editor" behavior may need a separate double-click handler added to FileExplorer for `.md` files specifically (calling `api.dialog.openInEditor()`). This is a behavior addition, not a conflict.

## Validation Architecture

> `workflow.nyquist_validation` is not set in config.json — skipping this section.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/renderer/ui/components/TerminalManager.js` lines 3257-3399 (`openFileTab`), lines 3479-3600 (`createChatTerminal` pattern)
- Codebase analysis: `src/renderer/ui/components/ChatView.js` lines 26-83 (marked configuration and renderMarkdown)
- Codebase analysis: `src/renderer/utils/syntaxHighlight.js` (existing highlight function)
- Codebase analysis: `src/renderer/ui/components/FileExplorer.js` lines 1084-1105 (single-click handler)
- Codebase analysis: `src/main/preload.js` (fs methods exposed to renderer)
- Codebase analysis: `styles/terminal.css` lines 1381-1541 (existing file-viewer CSS)
- `package.json`: `marked: ^17.0.3` confirmed as production dependency, no chokidar or file watcher library present

### Secondary (MEDIUM confidence)
- marked v17 instance-based API (`new marked.Marked()`) — based on marked changelog trajectory from v5+; marked's major versions are semver-stable for this feature

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already in the codebase or built-in Node.js
- Architecture: HIGH — based on direct codebase reading of existing patterns
- Pitfalls: HIGH — marked global config conflict verified by reading ChatView.js; others are well-known Node.js/Electron patterns

**Research date:** 2026-02-27
**Valid until:** 2026-04-27 (stable dependencies, long validity)
