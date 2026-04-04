# Phase 38: Post Screenshots into Terminal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 38-i-want-to-be-able-to-post-screenshots-into-a-claude-terminal
**Areas discussed:** Scope clarification, Screenshot capture method, Target destination, Image delivery mechanism, UX when pasting, Multiple images

---

## Scope Clarification

| Option | Description | Selected |
|--------|-------------|----------|
| Chat not working | Existing chat image support broken or not discoverable | |
| Terminal/CLI mode | Send images into the terminal tab, not chat | ✓ |
| Built-in capture | Built-in screenshot capture tool | |

**User's choice:** Terminal/CLI mode — "i dont use chat mode! just strg+v a screenshot for claude to e.g. show a error message screenshot or a ui screenshot"
**Notes:** User exclusively uses terminal mode, not the chat tab.

---

## Screenshot Capture Method

| Option | Description | Selected |
|--------|-------------|----------|
| System clipboard | Win+Shift+S then Ctrl+V (Recommended) | ✓ |
| Built-in capture | Button triggers screen region selector | |
| Window capture | Auto-capture terminal output as image | |

**User's choice:** System clipboard only
**Notes:** None

---

## Target Destination

| Option | Description | Selected |
|--------|-------------|----------|
| Chat tab only | Already works, needs UX improvements | |
| Terminal input | Attach images to CLI prompts (Recommended) | ✓ |
| Both | Different flows for each | |

**User's choice:** Terminal input only
**Notes:** None

---

## Image Delivery Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Temp file + auto-reference | Save to temp file, inject path into prompt (Recommended) | ✓ |
| Agent SDK bridge | Route through Agent SDK instead of PTY | |
| Base64 injection | Encode as special marker for CLI parsing | |

**User's choice:** Temp file + auto-reference
**Notes:** None

---

## UX When Pasting

| Option | Description | Selected |
|--------|-------------|----------|
| Inline preview bar | Thumbnail strip above terminal input (Recommended) | ✓ |
| Toast notification | Brief "Image attached" toast, no preview | |
| Overlay preview | Modal preview with confirm/cancel | |

**User's choice:** Inline preview bar
**Notes:** None

---

## Multiple Images

| Option | Description | Selected |
|--------|-------------|----------|
| Single only | One Ctrl+V replaces previous | |
| Stack up to 5 | Accumulate until sent, same as chat (Recommended) | ✓ |
| Unlimited | No cap | |

**User's choice:** Stack up to 5
**Notes:** None

---

## Claude's Discretion

- Temp file cleanup strategy
- Exact preview bar positioning relative to terminal
- How file path reference is injected into CLI input

## Deferred Ideas

None
