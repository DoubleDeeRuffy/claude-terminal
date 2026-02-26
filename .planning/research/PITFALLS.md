# Pitfalls Research

**Domain:** Electron terminal app — xterm.js keyboard shortcuts, clipboard integration, file explorer filtering
**Researched:** 2026-02-24
**Confidence:** HIGH (xterm.js internals verified via official GitHub issues; Electron clipboard behavior verified via official Electron issue tracker; codebase verified by direct inspection)

---

## Critical Pitfalls

### Pitfall 1: Ctrl+C Ambiguity — Copy vs. SIGINT

**What goes wrong:**
Intercepting Ctrl+C for "copy selected text" in `attachCustomKeyEventHandler` causes the handler to always return `false`, which suppresses the SIGINT signal (`\x03`) that Ctrl+C is supposed to send to the PTY when no text is selected. Users can no longer cancel running processes with Ctrl+C.

**Why it happens:**
Developers implement the intuitive check `if (e.ctrlKey && e.key === 'C') → copy` without gating on whether text is actually selected. xterm.js's own docs confirm: "ctrl+c and ctrl+v don't work [for clipboard] because they're needed for terminal operation." The codebase already uses Ctrl+Shift+C for copy — adding a plain Ctrl+C handler is an easy mistake to make when the requirement says "Ctrl+C to copy selected text."

**How to avoid:**
Do NOT add a plain Ctrl+C handler at all. The requirement is already satisfied by the existing `Ctrl+Shift+C` handler in `setupClipboardShortcuts()`. If the intent is conditional behaviour (copy when selection exists, SIGINT when not), implement it only inside `attachCustomKeyEventHandler` using:
```javascript
if (e.ctrlKey && !e.shiftKey && e.key === 'c' && e.type === 'keydown') {
  const selection = terminal.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection).catch(...);
    return false; // suppress xterm — don't send \x03
  }
  return true; // let xterm send \x03 (SIGINT)
}
```
But verify this is actually what the user wants before implementing. The existing Ctrl+Shift+C shortcut is the conventional terminal approach.

**Warning signs:**
- Users report `Ctrl+C` no longer cancels running commands
- `npm run`, `python script.py`, etc. cannot be interrupted
- Terminal appears to accept Ctrl+C keypress (no output) but process keeps running

**Phase to address:** Implementation phase — keyboard shortcut additions

---

### Pitfall 2: Ctrl+Arrow Word-Jump Conflicts with Existing Terminal-Switching Shortcut

**What goes wrong:**
The existing `createTerminalKeyHandler` already intercepts `Ctrl+ArrowLeft` and `Ctrl+ArrowRight` for tab/terminal switching (`callbacks.onSwitchTerminal`). Adding "word-jump" behaviour for Ctrl+Arrow would silently remove the ability to switch terminals — or vice versa, the new handler wins and word-jump never reaches the PTY.

**Why it happens:**
`attachCustomKeyEventHandler` receives events before xterm.js processes them. There are two handlers competing for the same keystroke: the existing tab-switching code (which returns `false` for Ctrl+Arrow) and any new word-jump code. The first `return false` wins — xterm never sees the event and the PTY never receives the escape sequence.

**How to avoid:**
Ctrl+Arrow cannot simultaneously mean "switch terminal tab" and "word-jump in PTY" — these are mutually exclusive. The correct resolution is either:
1. Move terminal-switching to a different shortcut (e.g., Ctrl+Shift+Arrow) and let Ctrl+Arrow send word-jump escape sequences to the PTY.
2. Keep Ctrl+Arrow for tab-switching and implement word-jump via a different key (e.g., Alt+Arrow, which xterm.js handles internally for most shells).

The escape sequences for word-jump that the PTY expects are: Left = `\x1b[1;5D`, Right = `\x1b[1;5C` (Linux/Windows) or `\x1bb`/`\x1bf` (macOS). These must be written directly via `api.terminal.input({ id, data: sequence })` — returning `true` from the handler alone does not guarantee the PTY receives the correct sequence; xterm.js's internal mapping may not match what PowerShell expects.

**Warning signs:**
- Ctrl+Arrow in terminal switches tabs instead of moving the cursor
- Word-jump works in one shell (bash) but not another (PowerShell)
- The shortcut works when only one terminal tab is open (no tab-switch possible) but breaks with multiple tabs

**Phase to address:** Implementation phase — before writing any Ctrl+Arrow code, resolve the conflict in the plan

---

### Pitfall 3: Global Module-Level Debounce Variables Break with Multiple Terminals

**What goes wrong:**
`lastPasteTime` and `lastArrowTime` are declared at module scope in `TerminalManager.js` (lines 75–80). When two or more terminals are open, a paste in terminal A sets `lastPasteTime`; if the user immediately switches to terminal B and pastes, the debounce fires and the paste is silently dropped.

**Why it happens:**
The debounce guards were added to prevent double-paste (xterm.js + Electron sometimes fire the paste event twice for the same gesture). They work correctly with a single terminal but create cross-terminal interference because state is shared. The existing code at lines 480–485 and 500–505 shares a single `lastPasteTime` counter across all terminal instances.

**How to avoid:**
When modifying or adding paste/clipboard handlers, keep per-terminal debounce state in the terminal's data object (stored in the terminals Map), not in module-level variables. Example:
```javascript
// In createTerminal() or addTerminal():
termData.lastPasteTime = 0;
termData.lastArrowTime = 0;

// In the handler closure:
const now = Date.now();
if (now - termData.lastPasteTime < PASTE_DEBOUNCE_MS) return;
termData.lastPasteTime = now;
```
This is a latent bug. Any new handlers added for this milestone should NOT use the module-level debounce variables.

**Warning signs:**
- Paste works in the first terminal but is silently dropped in a second terminal opened immediately after
- Switching terminals and pasting within 500ms fails
- Bug is intermittent and disappears when only one terminal tab is open

**Phase to address:** Implementation phase — apply to any new clipboard handlers

---

### Pitfall 4: navigator.clipboard Fails Silently When Document is Not Focused

**What goes wrong:**
`navigator.clipboard.readText()` and `writeText()` throw `DOMException: Document is not focused` or `DOMException: NotAllowedError` when called while the Electron window does not have focus. The existing fallback `api.app.clipboardRead()` (IPC to main process) only runs if the Promise rejects — but Electron's Chromium sometimes resolves the Promise with an empty string instead of rejecting, silently pasting nothing.

**Why it happens:**
The Web Clipboard API requires document focus. In Electron, the window can lose focus to OS dialogs, other apps, or the DevTools panel while a right-click context menu is open. Right-click paste is particularly vulnerable: the contextmenu event fires during a moment when focus state is transitional.

There is also a documented Electron issue (#23328) where `navigator.clipboard.readText()` triggers a permission request with `permission: "unknown"` — fixed in modern Electron but relevant if the version is ever downgraded.

**How to avoid:**
For the right-click paste handler: skip `navigator.clipboard` entirely and go directly to the IPC fallback `api.app.clipboardRead()`. The main process has unconditional clipboard access via Electron's `clipboard` module.

For Ctrl+Shift+V paste: keep the try/catch pattern but also check for empty string from the resolved promise:
```javascript
navigator.clipboard.readText()
  .then(text => {
    if (text) sendPaste(text);
    else return api.app.clipboardRead(); // empty = likely focus issue
  })
  .then(text => { if (text) sendPaste(text); })
  .catch(() => api.app.clipboardRead().then(sendPaste));
```

**Warning signs:**
- Right-click paste produces no output (no error in console either)
- Ctrl+V paste works only when the window has visible focus
- Paste works in DevTools console but not in the terminal UI

**Phase to address:** Implementation phase — right-click paste handler

---

### Pitfall 5: Dotfile Filter Exists in Two Separate Code Paths — Removing Only One Breaks Search

**What goes wrong:**
The dotfile filter (`name.startsWith('.')` check) exists in two independent functions in `FileExplorer.js`:
- Line 233: `readDirectoryAsync()` — controls tree view
- Line 370: `collectAllFiles()` — controls the search/file-picker

Removing the filter from only `readDirectoryAsync()` makes dotfiles visible in the tree but invisible to search (Ctrl+P file search). Users will be confused when they can see `.planning/` in the tree but cannot find files inside it through search.

**Why it happens:**
The two code paths are not co-located. A developer scanning for "where is the filter" finds line 233 and fixes it, does not notice line 370 is a separate recursive walker for search indexing.

**How to avoid:**
Search for ALL occurrences of `startsWith('.')` in `FileExplorer.js` before making any change. Both lines 233 and 370 must be updated together. Also verify `IGNORE_PATTERNS` (line 43) — this Set contains `.git` which suppresses the `.git` directory by name match before the dot-prefix check is even reached. This is intentional and should be preserved.

**Warning signs:**
- Dotfiles appear in the file tree but not in Ctrl+P / file search results
- `.planning` directory is visible but searching for `PITFALLS.md` returns no result

**Phase to address:** Implementation phase — dotfile filter removal (check both lines before committing)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Adding new clipboard handler without removing old `setupPasteHandler` | Faster implementation | Double-paste fires twice — both handlers run, sending duplicate text to PTY | Never — audit all existing clipboard handlers before adding new ones |
| Using module-level `lastPasteTime` for new handlers | No refactor needed | Silent paste drops across terminals | Never — use per-terminal state from the start |
| Skip right-click context menu UI and just auto-paste on right-click | One less UI element | Breaks user expectation if they right-click to copy rather than paste; no way to distinguish intent | Acceptable as first pass; aligns with xterm convention |
| Removing ALL dotfile/hidden-file entries from `IGNORE_PATTERNS` | Simple, complete | `node_modules/.bin` dotfiles, `__pycache__/.gitkeep`, etc. now visible — pollutes tree | Never — `IGNORE_PATTERNS` and dotfile filter serve different purposes. Keep the Set, only remove the `startsWith('.')` guard |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| xterm.js `attachCustomKeyEventHandler` | Assuming `return true` passes the keystroke through and xterm.js sends the right escape sequence to the PTY | `return true` only means xterm.js runs its own handler — it may still not send the sequence your shell expects. For word-jump, you must explicitly call `api.terminal.input({ id, data: '\x1b[1;5D' })` and return `false` |
| xterm.js `getSelection()` | Assuming empty string means no selection | Pre-v2.8.0 bug (fixed): `hasSelection()` could return true for empty selection. In v6 this is fixed, but always use `terminal.getSelection().length > 0` rather than truthy check |
| Electron `clipboard` module (main process) | Accessing from renderer directly | `clipboard` in the renderer process requires `contextIsolation: false` AND `nodeIntegration` or preload exposure. This app already exposes `api.app.clipboardRead/clipboardWrite` via preload — use those |
| xterm.js `contextmenu` event | Calling `e.preventDefault()` to suppress the browser context menu | xterm.js registers its own `contextmenu` listener on the canvas. Adding another listener on the wrapper div and calling `preventDefault()` may conflict. Listen on the canvas element itself, or use `{ capture: true }` on the wrapper |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Showing dotfiles increases `readDirectoryAsync` result count in large repos | File tree becomes slow; `.git/objects` contains thousands of files | `IGNORE_PATTERNS` already blocks `.git` by name — this prevents the worst case. But dotfolders like `.tox/`, `.pytest_cache/` with many files will now appear. The `MAX_DISPLAY_ENTRIES = 500` cap protects against UI freeze | Repos with many dotfolders containing large numbers of files (Python projects with venv, Rust projects with `.cargo`) |
| Right-click paste triggers `contextmenu` which re-renders the terminal's helper textarea position | Jank during paste in WebGL-rendered terminal | Do not modify DOM layout in the contextmenu handler path; write to PTY only | Visible on low-end hardware with WebGL addon active |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using `navigator.clipboard.readText()` without fallback in a keyboard handler | Silently fails in focus-loss scenarios; user confused | Always implement IPC fallback via `api.app.clipboardRead()` |
| Exposing clipboard read to untrusted content running inside the terminal | If a malicious program writes terminal escape sequences that trigger the paste shortcut, clipboard contents could be sent to the PTY | The existing `PASTE_DEBOUNCE_MS = 500` guard and requiring a real keydown event (not synthesized) mitigates this; do not weaken the debounce |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Right-click showing a context menu with "Paste" item instead of auto-pasting | Extra click required; inconsistent with most terminal emulators (VS Code, Windows Terminal right-click = auto-paste) | Right-click should auto-paste from clipboard without showing a menu, matching Windows Terminal behaviour |
| Word-jump on Ctrl+Arrow vs. tab-switching — silently choosing one | User discovers their expected shortcut does nothing, assumes the app is broken | Surface the conflict in the plan and document the chosen resolution in a code comment |
| "New Terminal" button placement — added to wrong DOM location | Button appears in wrong visual position, styled incorrectly, or not visible when terminal panel is in chat mode | Inspect `index.html` line 277 (`filter-project-name` span) and the CSS for `.tabs-header` before choosing the insertion point; test with project types that override the terminal panel (FiveM, WebApp) |
| Dotfiles revealed include `.env` files (passwords, API keys) in the tree | Security-sensitive content now visible; user may accidentally share screenshot | The existing code already has `name !== '.env'` exception — verify this exception is preserved in BOTH filter locations (lines 233 AND 370) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Ctrl+Arrow word-jump:** Verify in PowerShell (not just bash). PowerShell uses different readline bindings. Test `Ctrl+ArrowLeft` at a prompt with multi-word text — cursor should jump a word, not the whole line.
- [ ] **Ctrl+C copy:** Verify Ctrl+C with NO selection still sends SIGINT (`\x03`) and cancels a running `ping` or `sleep` command.
- [ ] **Right-click paste:** Verify that right-clicking when clipboard is empty does not crash or produce error output in the PTY.
- [ ] **Dotfile visibility — search:** After removing the filter, open file search (Ctrl+P) and search for a file inside `.planning/` — confirm it appears in results.
- [ ] **Dotfile visibility — tree:** Confirm `.git` does NOT appear (still blocked by `IGNORE_PATTERNS`), while `.planning` DOES appear.
- [ ] **New terminal button:** Verify the button is visible in all project types (general, FiveM, WebApp, Python, etc.) — project-type panels can replace the standard terminal UI.
- [ ] **Multi-terminal clipboard:** Open two terminal tabs. Paste in tab 1, switch immediately to tab 2, paste again within 500ms — verify second paste is NOT dropped.
- [ ] **Both clipboard handlers active:** Verify `setupClipboardShortcuts` and `setupPasteHandler` are not both handling the same shortcut for the new key combinations — check for double-input being sent to PTY.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Ctrl+C permanently suppresses SIGINT | MEDIUM | Remove the handler or add the `terminal.getSelection()` guard; rebuild renderer (`npm run build:renderer`) |
| Ctrl+Arrow word-jump removes tab-switching | LOW | Restore tab-switch handler in `createTerminalKeyHandler` |
| Dotfile filter removed from tree but not from search | LOW | Add the fix to `collectAllFiles()` at line 370; rebuild renderer |
| Module-level debounce state causing cross-terminal paste drops | MEDIUM | Migrate `lastPasteTime` to per-terminal Map entry; audit all 6 call sites of paste handlers |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Ctrl+C / SIGINT conflict | Implementation — before writing any Ctrl+C handler | Run `ping 127.0.0.1 -n 100` in terminal, press Ctrl+C — process must terminate |
| Ctrl+Arrow conflict with tab-switching | Planning — resolve shortcut conflict in PLAN.md before coding | Both word-jump and tab-switch must work; document chosen resolution |
| Module-level debounce cross-terminal interference | Implementation — when wiring up any paste handler | Open 2 terminals, paste in both within 500ms — both pastes must succeed |
| navigator.clipboard focus failure | Implementation — right-click paste handler | Right-click paste while window briefly unfocused (click outside app then right-click) — text must appear |
| Dotfile filter in two code paths | Implementation — grep before editing | After change: `.planning/PITFALLS.md` must appear in both file tree AND Ctrl+P search |
| New terminal button visible in all project types | Implementation — test with FiveM/WebApp project | Create FiveM project, open it — New Terminal button must be visible |

---

## Sources

- [xterm.js Browser Copy/Paste support documentation · Issue #2478](https://github.com/xtermjs/xterm.js/issues/2478) — confirmed: copy/paste is embedder responsibility; Ctrl+C and Ctrl+V are reserved for terminal operation
- [xterm.js Remove alt -> ctrl+arrow hack · Issue #4538](https://github.com/xtermjs/xterm.js/issues/4538) — word-jump escape sequences: `\x1b[1;5D` (left), `\x1b[1;5C` (right); embedder must handle
- [xterm.js Custom keybindings story · Issue #487](https://github.com/xtermjs/xterm.js/issues/487) — word-jump escape sequences for Windows/Linux vs macOS
- [xterm.js Terminal.hasSelection does not return false for empty string · Issue #724](https://github.com/xtermjs/xterm.js/issues/724) — fixed in v2.8.0; use `getSelection().length > 0`
- [xterm.js CustomKeyEventHandler does not override default keybindings · Issue #3880](https://github.com/xtermjs/xterm.js/issues/3880) — confirmed working in Chrome; Firefox-specific issues only
- [Electron navigator.clipboard permission "unknown" · Issue #23328](https://github.com/electron/electron/issues/23328) — fixed in modern Electron; use IPC fallback for robustness
- [xterm.js Right-click paste does not work · Issue #202](https://github.com/xtermjs/xterm.js/issues/202) — auto-paste on right-click is conventional terminal behaviour
- Direct codebase inspection: `src/renderer/ui/components/TerminalManager.js` lines 75–80 (module-level debounce), lines 529–610 (key handler), lines 459–494 (clipboard shortcuts); `src/renderer/ui/components/FileExplorer.js` lines 233 and 370 (both dotfile filter locations), line 43 (IGNORE_PATTERNS)

---

*Pitfalls research for: Electron terminal app — xterm.js hotkeys, clipboard, file explorer dotfile visibility*
*Researched: 2026-02-24*
