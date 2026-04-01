---
status: resolved
trigger: "Investigate race condition in scroll-to-bottom feature for restored terminal tabs"
created: 2026-02-26T00:00:00Z
updated: 2026-02-26T00:00:00Z
---

## Current Focus

hypothesis: confirmed — 200ms fires before PTY data is flushed to xterm buffer; loading→ready hook fires before PTY replay finishes
test: traced full data flow from PTY spawn to xterm render
expecting: N/A — root cause confirmed
next_action: implement event-driven fix

## Symptoms

expected: Restored terminal tabs scroll to the bottom of their session history after app restart
actual: Scroll fires before terminal content has fully loaded — race condition; only intermittently scrolls to bottom
errors: none (silent failure)
reproduction: restart app with active terminal sessions that have meaningful session history
started: introduced with phase 6.2 scroll-to-bottom implementation

## Eliminated

- hypothesis: xterm FitAddon.fit() causes the scroll to be lost
  evidence: fit() is called with setTimeout(100) inside createTerminal and also via ResizeObserver; scroll fires after fit at 200ms; fit is not wiping the scroll position, data simply isn't written yet
  timestamp: 2026-02-26

- hypothesis: scrollToBottom() in updateTerminalStatus (loading→ready) fires at correct time
  evidence: traced that loading→ready transition is driven by Claude OSC title change (✳ marker), which Claude CLI emits BEFORE all session replay data has been flushed through the adaptive batching pipeline
  timestamp: 2026-02-26

## Evidence

- timestamp: 2026-02-26
  checked: TerminalService.js — PTY output batching (lines 104-121)
  found: adaptive batch delay: 32ms if buffer > 10000 chars, 4ms if > 100ms since last flush, else 16ms; crucially, the batcher only schedules ONE flush per batch — while a flush is in-flight, new data accumulates and a NEW timer is NOT started until the current one fires. So large session replays emit many sequential IPC events separated by 4–32ms each.
  implication: a session with 500KB of history will take many hundreds of milliseconds to finish flushing to the renderer, not just 16ms × 1.

- timestamp: 2026-02-26
  checked: terminal.ipc.js → TerminalService.create() — how session restore starts
  found: PTY is spawned with claude --resume SESSION_ID; node-pty immediately begins emitting data; the onData handler batches and sends IPC events with adaptive delay; the main process does NOT know when replay is complete and sends no "replay done" signal.
  implication: there is zero end-of-replay signalling from main to renderer.

- timestamp: 2026-02-26
  checked: renderer.js lines 228-236 — the 200ms setTimeout scroll
  found: setTimeout(200) fires 200ms after the for-loop over saved.tabs finishes. Each createTerminal() is awaited, so the loop itself is serial. However, createTerminal() returns as soon as the PTY spawn IPC resolves (before any PTY data arrives). So 200ms starts counting from PTY creation, not from when data has been written to the xterm buffer.
  implication: for a session with any meaningful history (Claude conversation > a few KB), PTY replay will still be streaming when the 200ms timer fires.

- timestamp: 2026-02-26
  checked: TerminalManager.js lines 1062-1073 — scrollToBottom in updateTerminalStatus (loading→ready)
  found: loading→ready transition fires when Claude's OSC title changes to ✳ (the "ready" marker). Claude CLI emits this ✳ title as soon as it has re-rendered its prompt UI — but this happens BEFORE the PTY output buffer has been fully flushed to the renderer. The OSC title change arrives over PTY data (same channel), but it arrives as soon as Claude renders the prompt, while prior scrollback content (the replayed session history above the prompt) may still be batched in the adaptive batcher.
  implication: the loading→ready hook fires too early for the same root cause — it is driven by the OSC title that arrives in the PTY stream, but earlier batches from that same stream may not have been delivered yet due to the adaptive batching timing.

- timestamp: 2026-02-26
  checked: TerminalService.js — non-Windows claude resume (lines 131-145)
  found: on non-Windows, an additional 500ms delay exists before even sending the claude --resume command (setTimeout 500ms before ptyProcess.write). So the entire PTY session replay starts 500ms LATER than the 200ms scroll timer begins, making the race condition guaranteed on non-Windows (scroll fires 300ms before Claude even starts).
  implication: on macOS/Linux the bug is 100% reproducible.

## Resolution

root_cause: |
  The 200ms setTimeout in renderer.js starts counting from PTY creation (IPC round-trip ack), not
  from when PTY data has been fully written into the xterm.js buffer. Two separate races exist:

  Race 1 — renderer.js setTimeout(200):
    Timeline:
      T+0ms:   createTerminal() resolves (PTY spawned, IPC ack returned)
      T+0ms:   200ms timer starts
      T+0..500ms: On non-Windows, Claude hasn't even been launched yet (+500ms write delay)
      T+0..N ms: PTY onData fires continuously; adaptive batcher sends IPC events every 4–32ms per batch
      T+200ms: scrollToBottom() fires — xterm buffer is at most ~200ms of replayed data (roughly 6–12 IPC flushes of 10k chars = ~60–120KB max)
      T+200..N ms: remainder of session history continues arriving

    For any session with > ~100KB of history (any real Claude conversation), 200ms is insufficient.
    The delay needed scales linearly with session history size with no upper bound.

  Race 2 — updateTerminalStatus loading→ready scrollToBottom:
    The ✳ OSC title change is emitted by Claude CLI once it renders its prompt. This title arrives
    in the PTY data stream, but it is a SEPARATE IPC batch from the earlier scrollback content.
    The adaptive batcher sends batches independently. The ✳ OSC batch (tiny, < 100 bytes) arrives
    and is processed almost immediately after Claude renders, but earlier large batches containing
    thousands of lines of session history may still be queued or in-flight IPC messages that have
    not yet been written to xterm.js. The scroll fires synchronously in the onTitleChange handler,
    before the pending terminal.write() calls in the data handlers execute.

  Underlying architectural gap: There is no "replay complete" signal. The main process never
  notifies the renderer that PTY output has stopped. The renderer cannot distinguish between
  "Claude is waiting for input" (normal ready state) and "Claude just finished replaying history
  and is waiting for input" (resume complete) from the OSC title alone.

fix: |
  Recommended fix: idle-silence detection on a per-terminal basis specifically for the post-restore
  scroll. Use xterm's onRender + a silence timer:

  Option A (RECOMMENDED) — PTY silence detection with xterm.onRender:
    After restoring each terminal, attach a one-shot scroll trigger that waits for PTY data to
    go silent for a fixed period (e.g., 300ms of no new terminal-data IPC events) before scrolling.
    Use lastTerminalData map (already exists in TerminalManager) to detect silence.

    Implementation sketch in renderer.js restore loop (replace the setTimeout(200) block):
    ```js
    // After all tabs are restored, schedule per-terminal silence-based scroll
    const SCROLL_SILENCE_MS = 300; // 300ms no new data = replay done
    const SCROLL_MAX_WAIT_MS = 10000; // give up and scroll after 10s regardless
    const terminals = terminalsState.get().terminals;
    terminals.forEach((td, id) => {
      if (!td.terminal || typeof td.terminal.scrollToBottom !== 'function') return;
      const startTime = Date.now();
      let lastCheck = Date.now();
      const poll = setInterval(() => {
        const lastData = lastTerminalData.get(id); // already tracked per terminal
        const silentFor = lastData ? Date.now() - lastData : Date.now() - startTime;
        const timedOut = Date.now() - startTime >= SCROLL_MAX_WAIT_MS;
        if (silentFor >= SCROLL_SILENCE_MS || timedOut) {
          clearInterval(poll);
          td.terminal.scrollToBottom();
        }
      }, 50);
    });
    ```

    BUT: lastTerminalData is module-private to TerminalManager.js. It would need to be exposed
    via a getter, OR the scroll scheduling could move into TerminalManager itself and be triggered
    by the restore caller.

  Option B — xterm onRender idle detection:
    xterm.js exposes terminal.onRender which fires after each render frame. Use it to detect
    when rendering has been idle (no new writes) for N frames/ms:
    ```js
    function scrollAfterIdle(terminal, idleMs = 300, maxWaitMs = 10000) {
      return new Promise(resolve => {
        let timer = null;
        const start = Date.now();
        const reset = () => {
          clearTimeout(timer);
          timer = setTimeout(() => { terminal.scrollToBottom(); resolve(); }, idleMs);
        };
        const disposable = terminal.onRender(() => {
          if (Date.now() - start > maxWaitMs) { disposable.dispose(); terminal.scrollToBottom(); resolve(); return; }
          reset();
        });
        reset(); // start the initial timer in case no renders occur
      });
    }
    ```
    This is more xterm-native but onRender fires for EVERY frame including cursor blinks,
    so the idle detection must be robust.

  Option C — expose lastTerminalData from TerminalManager + push responsibility there:
    Add a new exported function to TerminalManager:
      `scheduleScrollAfterRestore(id)` — internally polls lastTerminalData for silence,
      then scrolls. Called from renderer.js restore loop instead of the raw setTimeout.
    This keeps implementation details inside TerminalManager and avoids exposing internal state.

  Fix for Race 2 (updateTerminalStatus loading→ready):
    The scroll in updateTerminalStatus (line 1069-1073) is a secondary fix that can be kept
    as a fallback, but it fires too early for the same reason. A simple improvement: defer it
    by one microtask tick so pending terminal.write() calls in the same event loop iteration
    complete first. However, since data arrives across multiple IPC event loop ticks, even a
    Promise.resolve() deferral is not sufficient. The correct fix here is to use the same
    silence-detection approach: do NOT scroll immediately in updateTerminalStatus; instead
    schedule a 300ms silence check. This is safe because loading→ready also only fires once
    per restore, triggered by the ✳ OSC title.

    Alternative for Race 2: remove the scrollToBottom from updateTerminalStatus entirely and
    rely solely on Option A/B/C above, which covers all terminals including those that reach
    ready state before the 10s max-wait expires.

verification: pending — fix not yet applied
files_changed: []
