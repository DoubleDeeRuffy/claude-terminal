# Phase 38: Post Screenshots into Terminal (CLI Mode) - Research

**Researched:** 2026-04-04
**Domain:** Electron renderer clipboard interception, xterm.js paste events, temp file management
**Confidence:** HIGH

## Summary

This phase adds clipboard image paste support to the terminal tab. The existing codebase already has all the building blocks: the chat tab's image attachment system (`ChatView.js:507-725`) provides the UI pattern, the terminal paste interception (`setupPasteHandler`, `performPaste`, `createTerminalKeyHandler`) provides the event interception points, and `window.electron_nodeModules.fs` provides file I/O from the renderer.

The core challenge is intercepting Ctrl+V when the clipboard contains an image (not text) before xterm.js processes it, showing a preview bar above the terminal, and injecting file paths into the PTY input stream when the user presses Enter. Claude Code CLI accepts image file paths directly in prompt text (e.g., `analyze /path/to/screenshot.png`), so appending file paths to the user's typed text before sending `\r` to the PTY is the delivery mechanism.

**Primary recommendation:** Modify the existing `setupPasteHandler` to check `clipboardData.items` for images before falling through to text paste, store pending images per-terminal on the terminal data object, and intercept the `\r` in `terminal.onData` to prepend file paths before sending to the PTY.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Terminal/CLI mode only. Chat tab already has image support. This brings equivalent functionality to the terminal tab.
- **D-02:** System clipboard only (Win+Shift+S then Ctrl+V). No built-in screen capture.
- **D-03:** Terminal input only. Images attach to the current terminal session's Claude CLI prompt.
- **D-04:** Temp file + auto-reference. Save to `~/.claude-terminal/temp/screenshot-{timestamp}.png`, inject path into prompt.
- **D-05:** Inline preview bar above the terminal input area. Small thumbnail strip similar to chat's `chat-image-preview`. User types prompt normally, sends both together.
- **D-06:** Stack up to 5 images before sending, same as chat mode. Each Ctrl+V adds to the stack. Each thumbnail has a remove button.

### Claude's Discretion
- Temp file cleanup strategy (on send, on session end, or periodic)
- Exact preview bar positioning relative to terminal
- How the file path reference is injected into the CLI input (appended to prompt line, or passed as CLI flag)

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xterm/xterm | ^6.0.0 | Terminal emulator (already in project) | Existing dependency, provides paste event and onData hooks |
| Electron clipboard API | Chromium 120 | ClipboardEvent.clipboardData.items for image detection | Native browser API, no additional dependency |
| node fs (via preload) | Node 18+ | Temp file write from renderer | Already exposed via `window.electron_nodeModules.fs` |

### Supporting
No new dependencies required. Everything needed is already in the project.

## Architecture Patterns

### Terminal DOM Structure (Current)
```
.terminals-container
  .terminal-wrapper[data-id="N"]          (position: absolute, flex-column when active)
    .terminal-loading-overlay             (removed after load)
    .xterm                                (flex: 1, injected by terminal.open(wrapper))
```

### Terminal DOM Structure (With Image Preview)
```
.terminals-container
  .terminal-wrapper[data-id="N"]          (position: absolute, flex-column when active)
    .terminal-image-preview               (NEW: flex row, display:none by default, 80px max-height)
      .terminal-image-thumb[data-index]   (NEW: 64x64, relative positioned)
        img                               (object-fit: cover)
        button.terminal-image-remove      (NEW: absolute, 18x18 circle)
      .terminal-image-count               (NEW: pill badge "3/5")
    .xterm                                (flex: 1, unchanged)
```

The preview bar goes BEFORE the xterm element inside the wrapper. Since the wrapper is `display: flex; flex-direction: column` and xterm has `flex: 1`, adding the preview bar above will naturally push the terminal down and xterm will resize to fill remaining space. A `fitAddon.fit()` call after showing/hiding the preview bar ensures the terminal adjusts its rows/cols.

### Pattern 1: Paste Event Interception
**What:** Modify `setupPasteHandler` to check for image items in `ClipboardEvent.clipboardData` before falling through to text paste.
**When to use:** Every paste event on the terminal wrapper.
**Example:**
```javascript
// Source: ChatView.js:720-725 (adapted for terminal)
function setupPasteHandler(wrapper, terminalId, inputChannel = 'terminal-input') {
  wrapper.addEventListener('paste', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Check for images FIRST
    const imageItems = Array.from(e.clipboardData?.items || [])
      .filter(i => i.type.startsWith('image/'));
    if (imageItems.length > 0 && inputChannel === 'terminal-input') {
      handleTerminalImagePaste(terminalId, imageItems);
      return;
    }
    // Fall through to text paste
    performPaste(terminalId, inputChannel);
  }, true);
}
```

### Pattern 2: Enter Key Interception for Path Injection
**What:** In `terminal.onData`, when `data === '\r'` and pending images exist, save images to temp files, prepend file paths to the current `inputBuffer`, write the combined text + `\r` to the PTY, and skip the normal `api.terminal.input` call.
**When to use:** When Enter is pressed with pending images.
**Critical detail:** The `terminal.onData` callback currently sends input to the PTY immediately (`api.terminal.input({ id, data })`). For image injection, we need to:
1. Detect `\r` with pending images
2. Save blobs to temp files (async)
3. Write the file paths + user text + `\r` to the PTY
4. Suppress the original `\r` from being sent

**Example:**
```javascript
// Inside terminal.onData callback (TerminalManager.js ~line 1747)
terminal.onData(async data => {
  const td = getTerminal(id);
  const pending = td?.pendingImages;
  
  if ((data === '\r' || data === '\n') && pending?.length > 0) {
    // Save images to temp files, get paths
    const paths = await saveImagesToTemp(pending);
    // Build the full prompt: user text + file paths
    const userText = td.inputBuffer.trim();
    const pathsStr = paths.join(' ');
    const fullPrompt = userText ? `${userText} ${pathsStr}` : pathsStr;
    // Clear what xterm echoed, write the full prompt + Enter
    // Note: Need to handle the fact that xterm already echoed the inputBuffer chars
    api.terminal.input({ id, data: ` ${pathsStr}\r` }); // append paths then Enter
    clearImagePreview(id);
    // Continue with normal Enter handling (status update, etc.)
    // ...
  } else {
    api.terminal.input({ id, data });
  }
  // ... rest of inputBuffer tracking
});
```

### Pattern 3: Temp File Management
**What:** Save clipboard image blobs to `~/.claude-terminal/temp/` with timestamped names.
**When to use:** When Enter is pressed with pending images.
**Example:**
```javascript
// Can use renderer fs directly (already exposed in preload)
const { fs, path, os } = window.electron_nodeModules;
const tempDir = path.join(os.homedir(), '.claude-terminal', 'temp');

async function saveImagesToTemp(pendingImages) {
  fs.mkdirSync(tempDir, { recursive: true });
  const paths = [];
  const timestamp = Date.now();
  for (let i = 0; i < pendingImages.length; i++) {
    const img = pendingImages[i];
    const filePath = path.join(tempDir, `screenshot-${timestamp}-${i}.png`);
    // Convert blob/dataUrl to Buffer and write
    const buffer = Buffer.from(img.base64 || img.dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(filePath, buffer);
    paths.push(filePath);
  }
  return paths;
}
```

### Anti-Patterns to Avoid
- **Sending binary image data through PTY:** The PTY channel is for text. Never write raw image bytes to it. Use temp file paths.
- **Creating a new IPC handler for file save:** The renderer already has `fs.writeFileSync` via preload. Adding an IPC round-trip is unnecessary complexity for a simple synchronous file write.
- **Global pending images state:** Pending images MUST be per-terminal (stored on the terminal data object), not global. Multiple terminals can exist simultaneously.
- **Modifying performPaste:** The `performPaste` function uses `navigator.clipboard.readText()` which is async and cannot access image data. The paste event handler (`setupPasteHandler`) is the right interception point because it has access to `e.clipboardData.items`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image detection in clipboard | Custom clipboard polling | `ClipboardEvent.clipboardData.items` filter | Browser-native API, already proven in ChatView.js |
| Object URL management | Manual URL tracking | `URL.createObjectURL()` / `URL.revokeObjectURL()` | Standard browser API for blob previews |
| Image preview UI | New component system | Copy ChatView.js pattern (renderImagePreview) | Same visual language, proven pattern |
| File path in prompt | Custom CLI flags | Append path to prompt text | Claude Code CLI reads file paths inline |

## Common Pitfalls

### Pitfall 1: Ctrl+V Keyboard Handler vs Paste Event Race
**What goes wrong:** The terminal has BOTH a `keydown` handler (in `createTerminalKeyHandler` and `setupClipboardShortcuts`) that calls `performPaste()`, AND a `paste` event handler. The keydown handler calls `navigator.clipboard.readText()` which cannot detect images. Only the `paste` DOM event carries `clipboardData.items` with image types.
**Why it happens:** xterm.js Ctrl+V handling triggers `performPaste` via the custom key handler, bypassing the paste event entirely.
**How to avoid:** Image detection must happen in the `keydown` handler path too. When Ctrl+V is pressed, instead of calling `performPaste` directly, use `navigator.clipboard.read()` (the Clipboard API) to check for image items. If images are found, handle them; otherwise fall through to `performPaste`. Alternatively, check `performPaste` callers and ensure the paste DOM event still fires for clipboard image detection.
**Warning signs:** Ctrl+V with an image in clipboard pastes nothing (or pastes empty text) instead of showing the preview.

### Pitfall 2: Enter Interception Timing
**What goes wrong:** The `terminal.onData` callback sends `data` to `api.terminal.input` synchronously, but saving images to temp files may be async (if using IPC). By the time paths are ready, `\r` has already been sent.
**Why it happens:** `terminal.onData` fires synchronously for each keystroke.
**How to avoid:** Use synchronous `fs.writeFileSync` from the renderer preload (available via `window.electron_nodeModules.fs`) instead of async IPC. This keeps the Enter handling synchronous. The file writes are small (screenshots are typically under 5MB) so sync writes are acceptable.
**Warning signs:** Image paths appear on the NEXT prompt line instead of the current one.

### Pitfall 3: xterm Echo vs PTY Echo
**What goes wrong:** When the user types text, xterm.js echoes it locally AND the PTY may echo it back. If we inject file paths via `api.terminal.input`, they appear in the terminal output. If the prompt is very long, it may wrap awkwardly.
**Why it happens:** Claude Code CLI echoes its input prompt. Injected file paths will be visible in the terminal.
**How to avoid:** This is acceptable behavior - the user should see what was sent. But keep the injection minimal: just append file paths after a space, not complex formatting.
**Warning signs:** Double-echoed text or garbled output.

### Pitfall 4: Preview Bar Resize Not Triggering xterm Fit
**What goes wrong:** When the preview bar appears/disappears, the terminal viewport size changes but xterm doesn't know about it. This causes the last line(s) to be hidden behind the preview bar.
**Why it happens:** xterm.js only recalculates on explicit `fitAddon.fit()` calls or ResizeObserver events.
**How to avoid:** Call `fitAddon.fit()` after showing/hiding the preview bar. The terminal wrapper already has a `ResizeObserver` but it watches the wrapper, not internal children. May need an explicit fit call.
**Warning signs:** Terminal text clipped at the bottom when preview bar is visible.

### Pitfall 5: Clipboard API Async Nature
**What goes wrong:** `navigator.clipboard.read()` is async and requires focus. In some Electron configurations, the clipboard API may fail silently.
**Why it happens:** Clipboard API permission model in Chromium.
**How to avoid:** The `paste` DOM event's `clipboardData.items` is synchronous and always available during the paste event. Prefer the DOM event path over the async Clipboard API. The `setupPasteHandler` already intercepts the DOM paste event - extend it rather than relying on `navigator.clipboard.read()`.
**Warning signs:** Image paste works inconsistently, especially after alt-tabbing.

### Pitfall 6: Per-Terminal State Leaking Between Terminals
**What goes wrong:** If pending images are stored in a module-level variable (like `pendingImages` in ChatView.js), switching terminals shows the wrong images.
**Why it happens:** ChatView.js has one instance per project. TerminalManager manages multiple terminals.
**How to avoid:** Store pending images on the terminal data object (the same object tracked by `terminalsState`). Access via `getTerminal(id).pendingImages`. The preview bar DOM is already per-terminal (inside each `.terminal-wrapper`).
**Warning signs:** Pasting an image in one terminal shows preview in another.

## Code Examples

### Clipboard Image Detection (from ChatView.js:720-725)
```javascript
// Source: src/renderer/ui/components/ChatView.js lines 720-725
inputEl.addEventListener('paste', (e) => {
  const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'));
  if (items.length === 0) return;
  e.preventDefault();
  const files = items.map(i => i.getAsFile()).filter(Boolean);
  if (files.length) addImageFiles(files);
});
```

### Image Preview Rendering (from ChatView.js:681-699)
```javascript
// Source: src/renderer/ui/components/ChatView.js lines 681-699
function renderImagePreview() {
  if (pendingImages.length === 0) {
    imagePreview.style.display = 'none';
    imagePreview.innerHTML = '';
    return;
  }
  imagePreview.style.display = 'flex';
  imagePreview.innerHTML = pendingImages.map((img, i) => `
    <div class="chat-image-thumb" data-index="${i}">
      <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" />
      <button class="chat-image-remove" data-index="${i}" title="${t('common.remove')}">&times;</button>
    </div>
  `).join('');
  imagePreview.querySelectorAll('.chat-image-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(parseInt(btn.dataset.index));
    });
  });
}
```

### Terminal Input Flow (current, TerminalManager.js ~line 1747)
```javascript
// Source: src/renderer/ui/components/TerminalManager.js line 1747-1769
terminal.onData(data => {
  api.terminal.input({ id, data });
  const td = getTerminal(id);
  if (td?.project?.id) heartbeat(td.project.id, 'terminal');
  if (data === '\r' || data === '\n') {
    cancelScheduledReady(id);
    updateTerminalStatus(id, 'working');
    // ... title extraction, inputBuffer reset
  } else if (data === '\x7f' || data === '\b') {
    if (td) updateTerminal(id, { inputBuffer: td.inputBuffer.slice(0, -1) });
  } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
    if (td) updateTerminal(id, { inputBuffer: td.inputBuffer + data });
  }
});
```

### Temp File Write (using existing preload fs)
```javascript
// Source: preload.js exposes fs.writeFileSync, fs.mkdirSync, path.join, os.homedir
const { fs, path, os } = window.electron_nodeModules;
const tempDir = path.join(os.homedir(), '.claude-terminal', 'temp');

function saveBlobToTemp(base64Data, index) {
  fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `screenshot-${Date.now()}-${index}.png`);
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Clipboard API (`navigator.clipboard.read()`) | DOM paste event `clipboardData.items` | Always preferred in Electron | Synchronous access, no permission issues |
| IPC for file writes | Direct `fs.writeFileSync` via preload | Always available in this project | Simpler, synchronous, no round-trip |

## Open Questions

1. **Ctrl+V key handler bypass**
   - What we know: The `createTerminalKeyHandler` intercepts Ctrl+V and calls `performPaste()` directly, which only reads text. The DOM `paste` event handler also intercepts but `performPaste` is called there too.
   - What's unclear: Whether the DOM `paste` event fires at all when the keydown handler already calls `performPaste` with `e.preventDefault`. Need to verify the actual event flow.
   - Recommendation: Modify `performPaste` to accept an optional `clipboardEvent` parameter, or modify the keydown handler to check for images via `navigator.clipboard.read()` before falling back to text paste. Testing will confirm which approach is needed.

2. **File path injection strategy**
   - What we know: Claude Code CLI accepts file paths inline in the prompt. The user's typed text is in `inputBuffer`.
   - What's unclear: Whether to append paths after the user text (e.g., `"fix this bug /path/to/screenshot.png"`) or prepend them. Also unclear if paths with spaces need quoting.
   - Recommendation: Append paths after user text, space-separated. Windows paths with spaces should be quoted. Test with actual Claude Code CLI to confirm.

3. **Temp file cleanup timing**
   - What we know: Files go to `~/.claude-terminal/temp/`. Claude Code needs to read them during the session.
   - What's unclear: How long Claude Code takes to process file references. Cleanup too early = broken references.
   - Recommendation: Clean up on terminal exit (`terminal-kill` event), not on send. Also add a periodic cleanup (e.g., delete files older than 1 hour) in the temp directory on app startup.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 with jsdom |
| Config file | package.json jest section |
| Quick run command | `npm test -- --testPathPattern="terminal-image"` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMG-01 | Clipboard image detection in paste event | unit | `npm test -- --testPathPattern="terminal-image"` | No - Wave 0 |
| IMG-02 | Preview bar render/remove cycle | unit | `npm test -- --testPathPattern="terminal-image"` | No - Wave 0 |
| IMG-03 | Temp file save from base64 data | unit | `npm test -- --testPathPattern="terminal-image"` | No - Wave 0 |
| IMG-04 | Max 5 image enforcement | unit | `npm test -- --testPathPattern="terminal-image"` | No - Wave 0 |
| IMG-05 | Path injection into terminal input on Enter | unit | `npm test -- --testPathPattern="terminal-image"` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npm run build:renderer`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/features/terminal-image-paste.test.js` -- covers IMG-01 through IMG-05
- [ ] Mock setup for `window.electron_nodeModules.fs` (already in `tests/setup.js`)

## Sources

### Primary (HIGH confidence)
- `src/renderer/ui/components/ChatView.js` lines 507-725 -- image attachment system (paste, preview, remove, send)
- `src/renderer/ui/components/TerminalManager.js` -- paste handling (lines 514-573), terminal.onData (lines 1747-1769), DOM structure (lines 1572-1620)
- `src/main/ipc/terminal.ipc.js` -- terminal-input IPC handler
- `src/main/preload.js` -- fs.writeFileSync, mkdirSync exposed to renderer
- `styles/chat.css` lines 2767-2812 -- chat image preview CSS
- `styles/terminal.css` lines 1120-1149 -- terminal wrapper layout

### Secondary (MEDIUM confidence)
- [Claude Code Image Guide](https://smartscope.blog/en/generative-ai/claude/claude-code-image-guide/) -- confirms file paths work inline in prompts
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) -- CLI documentation

### Tertiary (LOW confidence)
- Ctrl+V keyboard handler vs paste event interaction in Electron/xterm.js -- needs runtime testing to confirm exact flow

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already exist in the project
- Architecture: HIGH -- clear DOM structure, clear paste interception points, clear input flow
- Pitfalls: HIGH -- identified from direct code reading, multiple paste handler paths documented

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- no external dependencies changing)
