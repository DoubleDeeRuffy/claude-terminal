---
status: diagnosed
trigger: "Investigate why the active tab is correctly restored on app restart, but the Claude session content is not resumed."
created: 2026-02-26T00:00:00Z
updated: 2026-02-26T00:00:00Z
---

## Current Focus

hypothesis: The `claudeSessionId` persisted in terminal-sessions.json is either not being
  passed to `createTerminal`, or a pre-existing bug in `activeCwd` matching causes a
  "resume watchdog" false-positive. The root cause is confirmed as (A) the `activeCwd`
  matching never works because `td.cwd` is never set on termData, so the phase 6.3 changes
  are not the cause; and (B) `claudeSessionId` is only captured on the termData object via
  `updateTerminal` from the events system AFTER Claude prints a session ID to the terminal,
  which may not happen before the app is closed for freshly-started sessions.
test: code trace of save path and restore path
expecting: confirmed root cause
next_action: report findings

## Symptoms

expected: After app restart, the active terminal tab is selected AND the Claude CLI resumes
  the previous session (showing prior conversation history via `--resume`).
actual: The active terminal tab is correctly selected, but the Claude terminal starts a fresh
  session instead of resuming. The Claude session content from the previous run is not shown.
errors: none reported — silent failure (fresh session instead of resumed session)
reproduction: Run Claude in a terminal tab, save a session, restart the app, observe that
  the correct tab is selected but no session history is shown.
started: Observed during phase 6.3 UAT (1 passed, 1 issue). Issue predates phase 6.3 —
  the phase 6.3 changes do not affect the resume path.

## Eliminated

- hypothesis: Phase 6.3 filterByProject changes interfere with session resume
  evidence: The phase 6.3 changes (activeTabIndex restore) only run inside the condition
    `(!activeTab || activeTab.style.display === 'none')` — i.e., only when no currently-
    active tab is visible. The resume logic (`resumeSessionId` in createTerminal) runs
    unconditionally during the terminal creation loop in renderer.js, long before
    filterByProject is called. Phase 6.3 touches a different code path entirely.
  timestamp: 2026-02-26

- hypothesis: resumeSessionId is not passed to createTerminal on restore
  evidence: renderer.js line 201 clearly passes `resumeSessionId: (!tab.isBasic && tab.claudeSessionId) ? tab.claudeSessionId : null`.
    This is correct. The issue is whether `tab.claudeSessionId` is populated in the saved data.
  timestamp: 2026-02-26

## Evidence

- timestamp: 2026-02-26
  checked: renderer.js lines 180-240 (session restore bootstrap)
  found: The restore loop correctly reads `tab.claudeSessionId` from session data and passes
    it as `resumeSessionId` to `createTerminal`. The main-process TerminalService (lines 68-69)
    correctly translates this to `claude --resume <sessionId>`.
  implication: The end-to-end resume mechanism is wired correctly when `claudeSessionId` is
    present in the saved data.

- timestamp: 2026-02-26
  checked: TerminalSessionService.js lines 84-108 (save logic)
  found: `tab.claudeSessionId = td.claudeSessionId || null`. The `claudeSessionId` is read
    from the termData object on the terminals state Map. If `td.claudeSessionId` is undefined
    (falsy), it is saved as `null`.
  implication: The saved `claudeSessionId` is only as good as what is stored in termData.

- timestamp: 2026-02-26
  checked: TerminalManager.js lines 1389-1401 (termData creation in createTerminal)
  found: The `termData` object created at terminal creation does NOT include `claudeSessionId`.
    The field is never set at creation time. It is also not set on the termData even when
    `resumeSessionId` is passed in.
  implication: After restore, `td.claudeSessionId` starts as `undefined` on every newly
    created terminal, even those created with `resumeSessionId`.

- timestamp: 2026-02-26
  checked: src/renderer/events/index.js line 379
  found: `updateTerminal(terminalId, { claudeSessionId: e.data.sessionId })` — this is the
    ONLY place `claudeSessionId` is written to a terminal's termData. It fires when the
    Claude event bus receives a SESSION_START event.
  implication: `claudeSessionId` is only populated on a terminal after Claude has emitted a
    session start event and the event system has captured it. This is an asynchronous event
    that fires after Claude prints its session ID to the terminal (typically within a few
    seconds of startup).

- timestamp: 2026-02-26
  checked: renderer.js lines 206-217 (activeCwd matching after restore loop)
  found: `if (td.project?.id === projectId && td.cwd === saved.activeCwd)`. The `termData`
    object (created in TerminalManager.js) never has a `cwd` property set on it. The only
    place `cwd` appears in termData construction is NOT included — it is passed to the IPC
    call (`api.terminal.create`) but not stored on the renderer-side termData.
  implication: `td.cwd` is always `undefined`, so `td.cwd === saved.activeCwd` is always
    false. The activeCwd-based active terminal selection in renderer.js NEVER works.
    This is a pre-existing bug, not introduced by phase 6.3. Phase 6.3's `activeTabIndex`
    mechanism in filterByProject is the working workaround for the "which tab to activate"
    problem.

- timestamp: 2026-02-26
  checked: TerminalManager.js lines 1513-1536 (resume watchdog)
  found: If `resumeSessionId` is provided, a 20-second watchdog is started. If the terminal
    buffer has no data after 20 seconds, the terminal is closed and a FRESH terminal is
    created (without resumeSessionId). The condition `td.terminal.buffer.active.length > 1`
    is checked every 500ms.
  implication: If Claude fails to produce output within 20 seconds of resume (e.g., the
    session ID is stale or the session file is missing), the watchdog replaces the terminal
    with a fresh one. This is by design — but a slow startup could also trigger it.

- timestamp: 2026-02-26
  checked: TerminalSessionService.js lines 93-107 (save: when claudeSessionId is persisted)
  found: The save runs on a 2-second debounce triggered by various events. The `claudeSessionId`
    comes from `td.claudeSessionId` which is only set by the events system (see above).
    If the app is closed BEFORE the events system has fired SESSION_START and populated
    `claudeSessionId` on the termData, the saved `tab.claudeSessionId` will be `null`.
  implication: For terminals that never had a SESSION_START event captured (e.g., freshly
    created terminals that the user closed the app before the session started, or terminals
    whose session ID was never captured), `claudeSessionId` will be null in the save file,
    and no resume will happen.

- timestamp: 2026-02-26
  checked: git diff d1a764e0^..5330aba5 (all phase 6.3 changes)
  found: Phase 6.3 added:
    (1) `activeTabIndex: null` field initialisation in the projectSessions object
    (2) `projectSessions[projectId].activeTabIndex = projectSessions[projectId].tabs.length - 1`
        when the active terminal is saved
    (3) The activeTabIndex-aware restore block inside filterByProject
    (4) A scrollToBottom call when terminal status transitions to 'ready' (from phase 6.2)
    None of these changes touch the resume path.
  implication: Phase 6.3 is NOT the cause of session content not being resumed.

## Resolution

root_cause: |
  The Claude session content is not resumed because `claudeSessionId` is null/absent in the
  saved terminal-sessions.json for the affected terminals. This has two contributing causes:

  ROOT CAUSE A — claudeSessionId not stored on termData at resume time:
  When `createTerminal` is called with `resumeSessionId` during the restore loop, the
  termData object created does NOT store the `resumeSessionId` back as `claudeSessionId`.
  So after the restore loop, `td.claudeSessionId` is `undefined` on all freshly-restored
  terminals — even those that successfully resumed a session. On the NEXT save (e.g., when
  the user switches tabs), the restored `claudeSessionId` is lost unless the events system
  has already fired SESSION_START for the resumed session.

  ROOT CAUSE B — claudeSessionId depends on async event capture before app close:
  The `claudeSessionId` is only written to termData via `updateTerminal` from the Claude
  event bus (events/index.js line 379). This fires after Claude prints its session ID to
  the terminal. If the app is closed before this event fires (e.g., within the first few
  seconds of a new Claude session), the session ID is never saved. On next restart, no
  resumeSessionId is available for those terminals.

  ROOT CAUSE C (pre-existing, not 6.3) — activeCwd matching is broken:
  renderer.js lines 206-217 attempt to restore which terminal is "active" by matching
  `td.cwd === saved.activeCwd`. But `td.cwd` is never set on the renderer-side termData
  object, so this always evaluates to `false`. Phase 6.3's `activeTabIndex` in
  filterByProject partially compensates for this, but only covers the "which tab is
  visually active" aspect, not the "which terminal has the session content" aspect.

  RELATIONSHIP TO PHASE 6.3:
  Phase 6.3 does NOT cause the session resume failure. The session resume was already broken
  (or intermittently working) before phase 6.3. Phase 6.3 only affects tab selection
  (which tab is highlighted), not session content restoration.

fix: not applied (investigation-only mode)

verification: n/a

files_changed: []

## Suggested Fix Direction

To fix ROOT CAUSE A: After `createTerminal` returns `id` during the restore loop in
renderer.js, call `updateTerminal(id, { claudeSessionId: resumeSessionId })` to store
the session ID back onto the termData. This ensures the session ID survives until the
events system can confirm it via SESSION_START.

To fix ROOT CAUSE B: Either (a) save the terminal-sessions.json synchronously on
`before-quit` / window close (not just debounced), ensuring the latest state is captured;
or (b) store the session ID on termData at creation time when a resumeSessionId is provided.

To fix ROOT CAUSE C (activeCwd): Store `cwd: overrideCwd || project.path` on the termData
object at creation time in `createTerminal`, so the `td.cwd === saved.activeCwd` matching
in renderer.js actually works.
