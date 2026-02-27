# Phase 24: Shift-Return-Race-Condition - Research

**Researched:** 2026-02-27
**Domain:** Browser keyboard event handling, textarea multiline input, CSS line-height
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Shift+Return must always insert a newline in the chat input — never submit
- Return (without Shift) submits the message
- The bug is a race condition where Shift modifier state is lost, causing Return to fire instead
- Happens randomly but frequently — not tied to specific keystroke count or timing pattern
- When Shift+Return inserts a newline, the visual gap between lines is too large — should match normal line spacing (single-spaced), not double-spaced or padded
- Multiline paste "collapsing" is NOT a bug — Claude intentionally reformats pasted text
- This phase only targets the chat input, not the raw terminal (PTY)

### Claude's Discretion

- Root cause diagnosis approach (keydown event handling, modifier key tracking, etc.)
- Implementation technique for the fix
- Whether to debounce, use keydown vs keyup, or restructure the event handler

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

The chat input in `ChatView.js` uses a single `keydown` handler on the `<textarea class="chat-input">` element. The submit-vs-newline branch is at line 542:

```javascript
if (e.key === 'Enter' && !e.shiftKey) {
  e.preventDefault();
  handleSend();
}
```

When `!e.shiftKey` is true (i.e., `e.shiftKey === false`), the message is submitted. When `e.shiftKey` is true, the event falls through to the browser's default `textarea` behavior, which inserts a `\n` character and auto-resize is triggered by the `input` event handler. The race condition is that `e.shiftKey` can be `false` even though the user physically pressed Shift, because the keydown fires before the OS registers the Shift key modifier in the event object — particularly when Shift is pressed only slightly before Return in a fast keystroke sequence.

The standard fix for this class of problem is to **track the Shift key state independently** using `keydown`/`keyup` events on the parent wrapper (or window), rather than relying on `e.shiftKey` from the Enter keydown event. An alternative is to listen on `keyup` instead of `keydown` for the submit action, which gives the browser more time to settle modifier state — but this approach is less common for submit-on-enter patterns and can cause double-fire issues.

The excessive line gap when Shift+Return works correctly is a separate CSS issue. The `<textarea>` has `line-height: 1.5` in `chat.css` (line 2396), and when a newline is inserted, the auto-resize logic (`inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px'`) fires. The gap is likely caused by the textarea's `padding: 12px 16px` creating visual separation that appears larger than a normal single line gap, or the textarea's default row height plus padding producing a taller-than-expected new line. This is a CSS/padding issue, not a JavaScript issue.

**Primary recommendation:** Fix the race condition by tracking `shiftKey` state via a separate boolean flag updated in `keydown`/`keyup` listeners on `wrapperEl` (capture phase), then use that flag instead of `e.shiftKey` in the Enter handler. Fix the line gap by examining and correcting the `line-height` and `padding` on the textarea so that each newline adds exactly one line-height unit of height.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native DOM Events | N/A | `keydown`/`keyup` on `<textarea>` | No library needed — standard browser event API |
| CSS `line-height` | N/A | Control vertical spacing in textarea | Native CSS, no JS required |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No new dependencies needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tracking shiftKey in separate flag | Switch to `keyup` for submit | `keyup` resolves modifier race but feels sluggish and requires extra guard against double-fire |
| Tracking shiftKey in separate flag | `e.getModifierState('Shift')` | Same underlying issue — queried at keydown time, still subject to the same race |
| CSS line-height fix | JS-measured height calculation | CSS is simpler and more maintainable |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Existing Code Location

The relevant code lives entirely in two files:

```
src/renderer/ui/components/ChatView.js
  Lines 451-464   — input event handler (auto-resize)
  Lines 466-474   — wrapperEl keydown listener (capture phase, Ctrl+Arrow)
  Lines 476-546   — inputEl keydown listener (mention/slash dropdowns + Enter submit)

styles/chat.css
  Lines 2385-2398 — .chat-input textarea styles (includes line-height: 1.5, padding: 12px 16px)
```

### Pattern 1: Separate Modifier State Tracking

**What:** Declare a boolean `shiftHeld = false` in the closure scope of the chat view factory function. Update it via `keydown`/`keyup` on `wrapperEl` in capture phase. Use `shiftHeld` (not `e.shiftKey`) in the Enter handler.

**When to use:** When `e.shiftKey` is unreliable due to modifier key timing — which is the diagnosed cause here.

**Example:**

```javascript
// Declare in the createChatView closure, after element references are set up
let shiftHeld = false;

// In the capture-phase wrapperEl listener (already exists at line 466)
// Add to that same listener — or add a new pair of keydown/keyup listeners:
wrapperEl.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') shiftHeld = true;
  // ... existing Ctrl+Arrow checks ...
}, true);

wrapperEl.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') shiftHeld = false;
}, true);

// Then in inputEl keydown, replace e.shiftKey with shiftHeld:
if (e.key === 'Enter' && !shiftHeld) {
  e.preventDefault();
  handleSend();
}
```

**Why this works:** The `keydown` for `Shift` always fires before `keydown` for `Enter` (the OS fires modifier keys first), so `shiftHeld` is set before the Enter handler reads it. This eliminates the timing window where `e.shiftKey` may be stale.

**Note on existing capture listener:** There is already a `wrapperEl` capture keydown listener (lines 466–474) for Ctrl+Arrow. The Shift tracking can be added to that same listener body, or as a separate pair of keydown/keyup listeners — both approaches work. Adding to the existing listener keeps the code compact.

### Pattern 2: CSS Line-Height Fix for Textarea

**What:** Ensure the textarea `line-height` produces a consistent per-line pixel height, and that `padding` does not create a double-gap illusion on the first newline.

**When to use:** When the visual gap on newline insertion is larger than a normal `line-height` would produce.

**Diagnosis:** The textarea currently has:
```css
.chat-input {
  padding: 12px 16px;
  line-height: 1.5;
}
```

With `font-size: var(--font-base)` (= `0.875rem` = `14px` at 16px root), `line-height: 1.5` = `21px` per line. The auto-resize sets `height = scrollHeight`. If the browser includes the padding in `scrollHeight` as full padding top + bottom per content block rather than just once, or if the textarea's internal rendering adds extra spacing between lines, the visual gap appears larger. The fix is typically to confirm `line-height` is appropriate and ensure there is no `margin`/`padding` on implicit `<br>` or newline rendering inside the textarea. Since textareas render plain text (not HTML), the issue is more likely that the `padding: 12px` top and bottom adds 24px total which gets reapplied proportionally each time height is recalculated. Verify by inspecting actual `scrollHeight` vs expected value in the browser.

**Example CSS investigation:**

The font-size is inherited from `.chat-input` (no explicit declaration seen — likely inherits from parent). If line-height or font-size is not explicitly set on `.chat-input`, it may be inheriting a larger value causing a 2x gap.

A concrete fix: ensure `.chat-input` has an explicit `font-size` matching the design (`13px` or `var(--font-sm)`) and `line-height: 1.4` or `1.5` explicitly, so the per-line height is predictable and consistent with a single-spaced visual.

### Anti-Patterns to Avoid

- **Reading `e.shiftKey` at keydown time for Enter:** This is the root cause of the race condition. Do not use `e.shiftKey` for Submit-guard logic — use a tracked boolean instead.
- **Using `keyup` for submit:** Triggers after key release — fine for some UX but creates a sluggish feel for chat send. Stick with `keydown` + modifier tracking.
- **Inserting `\n\n` for newlines:** Would explain double spacing. Verify the textarea native behavior inserts exactly one `\n`, not two.
- **Using `insertText` execCommand:** Deprecated and unreliable in Electron — use direct value manipulation or let textarea native insertion handle it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modifier key state | Custom keyboard hook system | Simple boolean + keydown/keyup | The OS guarantees modifier keys fire before character keys; a two-variable approach is sufficient |
| Line height calculation | JS-computed per-line pixel math | CSS `line-height` property | CSS engine already computes this correctly when values are explicit |

**Key insight:** The race condition is a browser/OS event timing issue with a well-known, simple fix (track modifier state independently). No complex libraries or abstractions needed.

---

## Common Pitfalls

### Pitfall 1: Modifier Key Not Reset on Window Blur

**What goes wrong:** If the user holds Shift, presses Enter, then releases Shift while the window is blurred (e.g., a notification steals focus), `keyup` for Shift never fires in the document, leaving `shiftHeld = true` permanently.

**Why it happens:** `keyup` events are not delivered to a document that lost focus after `keydown`.

**How to avoid:** Add a `blur` event listener on `window` (or `wrapperEl`) that resets `shiftHeld = false`. Or use `visibilitychange` to reset it.

**Warning signs:** After Alt+Tab away and back, Shift+Enter behavior is inverted (newline triggers when Shift is not held).

**Implementation:**
```javascript
window.addEventListener('blur', () => { shiftHeld = false; });
```

### Pitfall 2: Double Newline Insertion (\\n\\n instead of \\n)

**What goes wrong:** If the Enter handler partially intercepts the event but also lets the browser default fire, two newlines are inserted.

**Why it happens:** Missing `e.preventDefault()` when Shift is held — the Enter keydown falls through AND the browser inserts a native newline.

**How to avoid:** In the Enter branch for Shift: either call `e.preventDefault()` and manually insert the newline via `document.execCommand` or value-cursor manipulation, OR rely entirely on the browser native newline (current approach) and ensure `e.preventDefault()` is NOT called for the shiftHeld branch.

**The current code** correctly does NOT call `e.preventDefault()` when `e.shiftKey` is true — it simply falls through. This approach must be preserved: when `shiftHeld` is true, the handler should return early without preventDefault so the browser inserts the native single newline.

### Pitfall 3: Line Gap Caused by Padding Miscalculation in scrollHeight

**What goes wrong:** The auto-resize formula `inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px'` sets the height to `scrollHeight` which includes top+bottom padding. On second line, the gap looks double because padding is included in `scrollHeight` but was already baked into the prior height.

**Why it happens:** `scrollHeight` in a textarea includes padding. On initial state (1 row), the height formula produces `font-size * line-height + padding-top + padding-bottom`. When a newline is added, `scrollHeight` adds exactly one more `line-height` worth of pixels. This should be correct, but if the textarea height was reset to `auto` first (which the code does: `inputEl.style.height = 'auto'`), the browser re-measures from scratch, which is correct. The issue may be that the `rows="1"` attribute plus CSS `height: auto` creates an inconsistency on first newline.

**How to avoid:** Verify by logging `inputEl.scrollHeight` after the first newline and comparing to `line-height * font-size + padding-top + padding-bottom`. If the gap is exactly double `line-height`, it means the baseline single-line height is wrong (the textarea renders with 2 lines internally). If it is one extra `line-height`, the behavior is correct and the visual gap is a CSS aesthetic issue (line-height too large or padding too tall).

**Likely fix:** Reduce `line-height` from `1.5` to `1.4`, or reduce `padding-top`/`padding-bottom` from `12px` to `10px` or `8px`. Check visually.

### Pitfall 4: Scope of Fix (Chat Input Only)

**What goes wrong:** The PTY terminal (xterm.js) Shift+Enter handling in `TerminalManager.js` is already fixed (Quick Task 1, commit 4e50ac2). Do not touch that code.

**Why it happens:** Confusion about which component has the bug.

**How to avoid:** All Phase 24 changes are confined to `ChatView.js` and `styles/chat.css`. Do not modify `TerminalManager.js`.

---

## Code Examples

### Current Keydown Handler (ChatView.js lines 542-545)

```javascript
// Source: src/renderer/ui/components/ChatView.js
if (e.key === 'Enter' && !e.shiftKey) {   // ← race condition: e.shiftKey unreliable
  e.preventDefault();
  handleSend();
}
```

### Fixed Pattern: Tracked Modifier State

```javascript
// Source: established browser event pattern
let shiftHeld = false;

// In capture-phase listener on wrapperEl (already exists at line 466):
wrapperEl.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') shiftHeld = true;
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    // ... existing Ctrl+Arrow checks unchanged ...
  }
}, true);

wrapperEl.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') shiftHeld = false;
}, true);

// Reset on blur to prevent sticky-shift after focus loss:
window.addEventListener('blur', () => { shiftHeld = false; });

// In inputEl keydown handler, replace e.shiftKey with shiftHeld:
if (e.key === 'Enter' && !shiftHeld) {
  e.preventDefault();
  handleSend();
}
// When shiftHeld is true: fall through to browser default (native textarea newline)
```

### Current Auto-Resize (ChatView.js lines 453-455)

```javascript
// Source: src/renderer/ui/components/ChatView.js
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
  // ...
});
```

This logic is correct. The line gap issue is a CSS aesthetic problem, not a JS logic problem.

### Current Textarea CSS (styles/chat.css lines 2385-2398)

```css
/* Source: styles/chat.css */
.chat-input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 12px 16px;
  color: var(--text-primary);
  /* ... */
  max-height: 200px;
  line-height: 1.5;
  outline: none;
}
```

If the line gap is too large, reducing `line-height` to `1.4` or `padding` to `10px 16px` are the first levers to try.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Using `e.shiftKey` directly in Enter handler | Track `shiftHeld` with keydown/keyup | Phase 24 (this fix) | Eliminates race condition |
| Browser-native Shift+Enter newline (reliable) | Same (preserved) | — | No change needed |

**Background on Quick Task 1:** The PTY terminal's Shift+Enter was fixed in Quick Task 1 (2026-02-24) by intercepting in xterm.js's `attachCustomKeyEventHandler`. The **chat textarea** is a different code path — it uses a native HTML `<textarea>` element, not xterm.js. The chat's Shift+Enter was noted in the Quick Task 1 plan as "already working" via native browser behavior. The Phase 24 bug is that this "already working" behavior is actually intermittent because of the modifier key race.

---

## Open Questions

1. **Exact visual gap magnitude**
   - What we know: The gap is visually larger than single-spaced; user reports it as "excessive"
   - What's unclear: Whether the gap is exactly 2x line-height (double-newline bug) or 1.5x (CSS aesthetic), or some other value
   - Recommendation: The planner should include a CSS tweak task and verify visually. If `line-height: 1.5` produces acceptable spacing on the single-line textarea, try `1.4`. If padding is the culprit, try `padding: 10px 16px`. Test by typing Shift+Enter and observing whether the new line matches the visual spacing of a paragraph text in the chat bubbles (`line-height: 1.5` on `.chat-msg`).

2. **Whether shiftHeld needs to be reset on `visibilitychange` vs `blur`**
   - What we know: `window.blur` fires when the app loses OS focus
   - What's unclear: In Electron, focus events may behave differently than in a browser — test that `blur` fires reliably when clicking outside
   - Recommendation: Use `window.addEventListener('blur', ...)` as the reset mechanism; this is standard and well-tested in Electron.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection of `src/renderer/ui/components/ChatView.js` — lines 451–546 (keydown handler, Enter submit logic, auto-resize)
- Direct code inspection of `styles/chat.css` — lines 2385–2408 (.chat-input styles)
- Direct code inspection of `.planning/quick/1-add-support-for-shift-return-multiline-i/1-SUMMARY.md` — confirms PTY terminal fix is separate, chat was noted as "already working" (but intermittently, per Phase 24 bug)
- Browser spec: modifier key events always fire in order — Shift keydown fires before character key keydown (HIGH confidence, established DOM event specification behavior)

### Secondary (MEDIUM confidence)

- Known pattern: `e.shiftKey` race condition in fast typing — documented in web development community; modifier state tracking is the standard fix

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure DOM events, no library needed, code fully inspected
- Architecture: HIGH — exact file/line locations identified, fix pattern is well-known
- Pitfalls: HIGH for race condition fix; MEDIUM for CSS gap (exact pixel values need visual verification)

**Research date:** 2026-02-27
**Valid until:** Stable (no external dependencies; pure DOM + CSS fix)
