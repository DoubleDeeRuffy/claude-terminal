---
status: resolved
trigger: "After resuming a Claude session and doing /clear, the NEW session ID is not saved. On next restart, the OLD session ID is resumed."
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T14:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - see Resolution
test: N/A
expecting: N/A
next_action: implement fix

## Symptoms

expected: After /clear creates a new Claude session, the new session ID should be persisted so that on next app restart, the NEW session is resumed.
actual: The old (pre-/clear) session ID remains in `termData.claudeSessionId` and gets saved to `terminal-sessions.json`. On restart, the old session is resumed.
errors: No errors - silent data staleness
reproduction: 1) Resume a Claude session (terminal or chat mode). 2) Send /clear. 3) Work in the new session. 4) Close and reopen the app. 5) Observe: old session is resumed instead of the new one.
started: Since Phase 6.4 added claudeSessionId persistence. The /clear flow was never handled.

## Eliminated

(none - root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-27
  checked: Where claudeSessionId is set on termData
  found: |
    THREE places set it:
    1. `TerminalManager.js:3010` - terminal-mode resume: sets `claudeSessionId: sessionId` in termData literal
    2. `TerminalManager.js:1491` - chat-mode createTerminal: sets via spread `...(resumeSessionId ? { claudeSessionId: resumeSessionId } : {})`
    3. `events/index.js:379` - hooks SESSION_START: `updateTerminal(terminalId, { claudeSessionId: e.data.sessionId })`
  implication: Only #3 updates claudeSessionId AFTER initial creation. #1 and #2 are set-once-at-creation.

- timestamp: 2026-02-27
  checked: Whether hooks SESSION_START fires for chat-mode tabs
  found: |
    The wireSessionIdCapture handler at events/index.js:372-382 filters on `e.source !== 'hooks'`.
    Chat-mode tabs use the Agent SDK directly (not Claude CLI in a PTY), so they do NOT produce
    hooks events. The SESSION_START event from hooks only fires for terminal-mode tabs running
    Claude CLI.
  implication: Chat-mode tabs have NO mechanism to update claudeSessionId after /clear.

- timestamp: 2026-02-27
  checked: Whether terminal-mode tabs update claudeSessionId after /clear
  found: |
    Terminal-mode tabs run Claude CLI in a PTY. When /clear is issued, Claude CLI internally
    starts a new session and fires a SessionStart hook with the new session_id. The hooks
    provider (HooksProvider.js:103-108) emits SESSION_START with the new sessionId, and
    wireSessionIdCapture (events/index.js:372-382) updates termData.claudeSessionId and
    triggers saveTerminalSessionsImmediate().
  implication: Terminal-mode tabs DO correctly update after /clear (IF hooks are enabled).
    But if hooks are disabled (scraping provider), even terminal-mode tabs won't update,
    because ScrapingProvider emits SESSION_START with `sessionId: null` (line 48).

- timestamp: 2026-02-27
  checked: ChatView.js handling of session_id from SDK messages
  found: |
    ChatView.js line 3047: `if (msg.session_id) sdkSessionId = msg.session_id;`
    This captures the real SDK session UUID in a LOCAL variable `sdkSessionId`.
    This variable is used for fork operations (line 3014) but is NEVER written back
    to termData.claudeSessionId. There is no callback or event that propagates this
    to the terminal state.
  implication: Even though ChatView knows the new session ID, it never tells the persistence layer.

- timestamp: 2026-02-27
  checked: TerminalSessionService.js persistence
  found: |
    Line 97: `claudeSessionId: td.claudeSessionId || null`
    It reads from termData.claudeSessionId which is stale after /clear in chat mode.
  implication: Stale ID is faithfully persisted to disk.

## Resolution

root_cause: |
  **Two distinct gaps, both related to /clear not updating termData.claudeSessionId:**

  ### Gap 1: Chat-mode tabs (primary gap)
  Chat-mode tabs use the Agent SDK directly. When /clear is issued:
  1. The SDK processes /clear and starts a new internal session
  2. New messages carry a new `session_id` field
  3. `ChatView.js` captures this in local var `sdkSessionId` (line 3047)
  4. BUT `sdkSessionId` is never written back to `termData.claudeSessionId`
  5. `onSessionStart` callback (line 1491) only fires on FIRST session creation (`if (!sessionId)`)
  6. Result: `termData.claudeSessionId` retains the old/original session ID

  **Code path:**
  - `/clear` -> `sendMessage()` (ChatView line 1525) -> SDK processes internally
  - SDK emits messages with new `session_id` -> ChatView line 3047 updates local `sdkSessionId`
  - MISSING: no code writes `sdkSessionId` back to `updateTerminal(terminalId, { claudeSessionId: sdkSessionId })`
  - On save: `TerminalSessionService.js:97` reads stale `td.claudeSessionId`

  ### Gap 2: Terminal-mode tabs without hooks (secondary gap)
  When hooks are disabled (scraping provider fallback):
  - ScrapingProvider emits SESSION_START with `sessionId: null` (line 48)
  - wireSessionIdCapture (events/index.js:374) checks `if (!e.data?.sessionId) return;` -> returns early
  - Result: even terminal-mode /clear doesn't update claudeSessionId without hooks

  ### Gap 3: createChatTerminal doesn't set claudeSessionId on initial creation
  `createChatTerminal()` (TerminalManager.js:3843-3855) creates termData WITHOUT `claudeSessionId`.
  It's only set if `resumeSessionId` is passed via the spread at line 1491. For fresh chat sessions,
  `termData.claudeSessionId` starts as `undefined` and is never set even for the FIRST session,
  because `onSessionStart` at line 3896 only sets the local `_chatSessionId`, not `termData.claudeSessionId`.

fix: |
  **Fix for Gap 1 + Gap 3 (chat-mode):**
  In `ChatView.js`, when `sdkSessionId` changes (line 3047), emit a callback or directly
  update termData. The cleanest approach:

  Option A (callback): Add an `onSessionIdChange` callback option to `createChatView()`.
  In `TerminalManager.js:createChatTerminal()`, pass a callback that does:
  ```js
  onSessionIdChange: (newSdkSessionId) => {
    updateTerminal(id, { claudeSessionId: newSdkSessionId });
    TerminalSessionService.saveTerminalSessions(); // debounced save
  }
  ```
  In `ChatView.js` line 3047, after setting `sdkSessionId`, call the callback:
  ```js
  if (msg.session_id && msg.session_id !== sdkSessionId) {
    sdkSessionId = msg.session_id;
    if (onSessionIdChange) onSessionIdChange(sdkSessionId);
  }
  ```

  Option B (direct): In ChatView's message handler (line 3047), when `session_id` changes,
  directly call `updateTerminal(terminalId, { claudeSessionId: msg.session_id })` since
  `terminalId` is already available in ChatView's closure.

  **Option B is simpler** since `terminalId` and `updateTerminal` are already accessible:
  ```js
  // Line 3047 in ChatView.js - replace:
  if (msg.session_id) sdkSessionId = msg.session_id;
  // With:
  if (msg.session_id && msg.session_id !== sdkSessionId) {
    sdkSessionId = msg.session_id;
    if (terminalId) {
      const { updateTerminal } = require('../../state/terminals.state');
      updateTerminal(terminalId, { claudeSessionId: msg.session_id });
      const TerminalSessionService = require('../../services/TerminalSessionService');
      TerminalSessionService.saveTerminalSessions();
    }
  }
  ```

  **Fix for Gap 2 (terminal-mode without hooks):**
  Lower priority - hooks should be enabled for full functionality.
  Could add session ID scraping from terminal output, but that's fragile.

verification: pending
files_changed: []
