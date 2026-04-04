# Phase 38: Post Screenshots into Terminal (CLI Mode) - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Add clipboard image paste support to the **terminal tab** (CLI mode). When a user presses Ctrl+V and the clipboard contains an image (not text), intercept it, show a preview, and deliver the image to the Claude CLI session via a temp file reference. This brings the chat tab's image attachment capability to the terminal workflow.

</domain>

<decisions>
## Implementation Decisions

### Scope Clarification
- **D-01:** This is for terminal/CLI mode only. The user does not use chat mode. The chat tab already has full image support — this phase brings equivalent functionality to the terminal tab.

### Screenshot Capture Method
- **D-02:** System clipboard only (Win+Shift+S → Ctrl+V). No built-in screen capture tool. The OS clipboard is the source.

### Target Destination
- **D-03:** Terminal input only. Images are attached to the current terminal session's Claude CLI prompt.

### Image Delivery Mechanism
- **D-04:** Temp file + auto-reference. Save clipboard image to a temp file (e.g., `~/.claude-terminal/temp/screenshot-{timestamp}.png`), then auto-inject the file path into the prompt so Claude Code CLI can read the image. The temp file approach avoids PTY/xterm.js limitations with binary data.

### UX When Pasting
- **D-05:** Inline preview bar above the terminal input area. Show a small thumbnail strip (similar to chat's `chat-image-preview`). User types their prompt text normally, then sends both together. The preview bar appears when images are pending and disappears after sending.

### Multiple Images
- **D-06:** Stack up to 5 images before sending, same as chat mode. Each Ctrl+V adds to the stack. Each thumbnail has a remove button.

### Claude's Discretion
- Temp file cleanup strategy (on send, on session end, or periodic)
- Exact preview bar positioning relative to terminal
- How the file path reference is injected into the CLI input (could be appended to the prompt line, or passed as a CLI flag if supported)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Image Implementation (Chat Tab)
- `src/renderer/ui/components/ChatView.js` lines 507-725 — Full image attachment system (addImageFiles, renderImagePreview, removeImage, paste handler, drag-drop handler). Reuse patterns and UI approach.
- `src/renderer/ui/components/ChatView.js` lines 438-444 — Image preview HTML and attach button markup
- `styles/chat.css` — Image preview and thumbnail CSS (look for `.chat-image-preview`, `.chat-image-thumb`, `.chat-image-remove`)

### Terminal System
- `src/renderer/ui/components/TerminalManager.js` — Terminal tab rendering and xterm.js management
- `src/main/services/TerminalService.js` — PTY management, input handling
- `src/main/ipc/terminal.ipc.js` — Terminal IPC handlers (create, input, resize, kill)

### Preload Bridge
- `src/main/preload.js` — IPC bridge, may need new methods for clipboard image detection and temp file operations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Chat image preview system** (`ChatView.js:507-725`): `addImageFiles()`, `renderImagePreview()`, `removeImage()` — pattern can be adapted for terminal context
- **CSS for image thumbnails**: `.chat-image-preview`, `.chat-image-thumb`, `.chat-image-remove` styles in `chat.css` — can be generalized or duplicated for terminal
- **Clipboard paste handler** (`ChatView.js:720-725`): Already detects image items in clipboard — same detection logic applies
- **File system access**: `window.electron_nodeModules.fs` available in renderer for temp file writes

### Established Patterns
- **xterm.js paste handling**: Terminal currently intercepts paste for text only. Image paste needs to be intercepted before xterm gets it.
- **IPC pattern**: Renderer detects clipboard image → IPC to main process to save temp file → returns file path → renderer injects path into terminal input
- **Preview UI**: Chat uses a `div.chat-image-preview` with flex layout for thumbnails — terminal needs equivalent positioned above the terminal viewport

### Integration Points
- **TerminalManager.js**: Needs paste event interception on the xterm container
- **TerminalService.js** (main): May need a new IPC handler for saving clipboard images to temp files
- **terminal.ipc.js**: New handler like `terminal-save-clipboard-image`
- **styles/terminal.css**: New styles for terminal image preview bar

</code_context>

<specifics>
## Specific Ideas

- The user takes screenshots with Win+Shift+S (Windows Snipping Tool), then Ctrl+V into the terminal — this is the primary workflow
- Preview bar should feel like chat's image preview but positioned for terminal context
- Image file paths in the prompt allow Claude Code CLI to process them natively (Claude Code supports image file references)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 38-i-want-to-be-able-to-post-screenshots-into-a-claude-terminal*
*Context gathered: 2026-04-04*
