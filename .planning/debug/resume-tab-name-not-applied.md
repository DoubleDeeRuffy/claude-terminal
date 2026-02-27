---
status: investigating
trigger: "Investigate why resumed sessions with custom names still show 'Resume...' forever instead of the saved session name."
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:00:00Z
---

## Current Focus

hypothesis: resumeSession() never sets claudeSessionId on termData, so updateTerminalTabName() cannot persist AI-generated names to session-names.json, meaning getSessionCustomName() always returns '' and isRenamed is never true for OSC-renamed sessions
test: trace the claudeSessionId field from resumeSession → termData → updateTerminalTabName → setSessionCustomName
expecting: confirmed missing claudeSessionId in resumeSession termData
next_action: research complete — findings documented

## Symptoms

expected: Clicking a session card with a custom name (isRenamed=true, accent-colored title) should open a new terminal tab showing that saved name
actual: New terminal tab always shows "Resume..." and never changes to the saved name
errors: none — silent logic failure
reproduction: Have a session with a custom name (set via AI tab naming on a previous run). Open sessions panel, click that card. Observe tab name.
started: Phase 14.1 implementation

## Eliminated

- hypothesis: sessionMap is stale or missing the clicked session (closure issue)
  evidence: sessionMap is declared at line 2781 as a local const inside renderSessionsPanel, built from ALL processed sessions (including lazy-loaded ones). The click handler at 2824 correctly closes over this const. All sessions regardless of lazy/immediate rendering are included in flatSessions (lines 2779-2781).
  timestamp: 2026-02-27

- hypothesis: displayTitle is empty even when isRenamed is true
  evidence: isRenamed is set to true only when customName is truthy (line 2576), and displayTitle is set to customName in that same branch (line 2574). So isRenamed=true implies displayTitle is non-empty.
  timestamp: 2026-02-27

- hypothesis: Something downstream overwrites the tab name back to "Resume..." after initial creation
  evidence: handleClaudeTitleChange WOULD overwrite the tab name via updateTerminalTabName when an OSC title with taskName arrives, but the bug manifests as the tab STARTING as "Resume..." — meaning sessionName is null/falsy before resumeSession is even called. OSC overwriting is a secondary concern, not the primary bug.
  timestamp: 2026-02-27

## Evidence

- timestamp: 2026-02-27
  checked: preprocessSessions() at line 2559-2597
  found: isRenamed is set to true only when getSessionCustomName(session.sessionId) returns a non-empty string. getSessionCustomName reads from session-names.json via loadSessionNames(). If session-names.json has no entry for this sessionId, customName is '' (falsy), isRenamed stays false, and displayTitle falls through to summaryResult.text or promptResult.text.
  implication: The entire isRenamed=true path requires a prior save to session-names.json for that sessionId.

- timestamp: 2026-02-27
  checked: setSessionCustomName() call sites
  found: Three call sites:
    1. updateTerminalTabName() at line 1023-1025 — guarded by `if (termData.claudeSessionId && name)`. Only fires if termData has claudeSessionId set.
    2. startInlineRename() at line 2624 — fires when user manually renames via inline rename in sessions panel. This path WORKS correctly.
    3. ChatView onTabRename at line 3860-3861 — fires for chat-mode AI naming. WORKS for chat mode.
  implication: For terminal (PTY) mode, the only way a name gets into session-names.json is via path #1, which requires claudeSessionId on the termData.

- timestamp: 2026-02-27
  checked: resumeSession() termData construction at lines 2969-2978
  found: The termData object built in resumeSession does NOT include claudeSessionId:
    ```js
    const termData = {
      terminal,
      fitAddon,
      project,
      projectIndex,
      name: sessionName || t('terminals.resuming'),
      status: 'working',
      inputBuffer: '',
      isBasic: false
      // claudeSessionId is ABSENT
    };
    ```
    The sessionId IS passed to api.terminal.create (line 2937 resumeSessionId: sessionId), but is never stored on termData.
  implication: When the resumed PTY session outputs an OSC title change with a taskName, updateTerminalTabName() is called but the guard `if (termData.claudeSessionId && name)` at line 1023 is false, so setSessionCustomName() is never called, so the name is never saved to session-names.json.

- timestamp: 2026-02-27
  checked: createTerminal() termData construction at line 1460
  found: createTerminal DOES set claudeSessionId correctly:
    `...(resumeSessionId ? { claudeSessionId: resumeSessionId } : {})`
    This is the path used for app-restart session restore (renderer.js line 196-203). So sessions restored on restart DO have claudeSessionId and DO propagate AI tab names to session-names.json.
  implication: The bug is specific to the manual resume path (click in sessions panel → resumeSession()). The app-restart restore path via createTerminal() works correctly.

- timestamp: 2026-02-27
  checked: The complete isRenamed=false → "Resume..." chain
  found: Full causation chain:
    1. User resumes a session via resumeSession() (click in sessions panel)
    2. resumeSession termData has no claudeSessionId
    3. Claude's PTY outputs OSC title → handleClaudeTitleChange → updateTerminalTabName
    4. updateTerminalTabName checks `termData.claudeSessionId` → undefined → skips setSessionCustomName
    5. session-names.json never gets an entry for this sessionId
    6. Next time renderSessionsPanel runs, getSessionCustomName returns ''
    7. isRenamed stays false, displayTitle comes from AI summary/prompt text (not custom name)
    8. Click handler: `session?.isRenamed` is false → sessionName = null
    9. resumeSession receives name: null → tab shows "Resume..."
  implication: This is the complete root cause.

- timestamp: 2026-02-27
  checked: shouldSkipOscRename() guard at line 357-366
  found: Only skips OSC rename if aiTabNaming is false OR tabRenameOnSlashCommand setting is on AND name starts with '/'. Does not protect custom names.
  implication: Even if claudeSessionId were fixed, OSC title changes WOULD overwrite the restored custom name once Claude starts working. This is a secondary issue but affects the "name persists across resume" UX.

## Resolution

root_cause: |
  resumeSession() (line 2924) constructs termData without claudeSessionId (line 2969-2978).

  Because claudeSessionId is absent, updateTerminalTabName() (line 1023) never calls setSessionCustomName(), so AI-generated tab names from resumed PTY sessions are never written to session-names.json.

  When the sessions panel next renders, getSessionCustomName() returns '' for these sessionIds, making isRenamed=false and displayTitle fall back to the AI summary text.

  The click handler at line 2858 guards on session?.isRenamed, so sessionName is null, and resumeSession() shows "Resume..." instead of the saved name.

  Additionally, even if the name WERE saved (e.g., via manual inline rename), resumeSession() would show the correct name initially but then overwrite it when the PTY emits an OSC title change (handleClaudeTitleChange → updateTerminalTabName), because there is no isRenamed guard in updateTerminalTabName analogous to the shouldSkipOscRename check that guards slash-command names.

fix: |
  PRIMARY FIX: Add claudeSessionId: sessionId to termData in resumeSession() at line 2969.

  Change:
    const termData = {
      terminal,
      fitAddon,
      project,
      projectIndex,
      name: sessionName || t('terminals.resuming'),
      status: 'working',
      inputBuffer: '',
      isBasic: false
    };

  To:
    const termData = {
      terminal,
      fitAddon,
      project,
      projectIndex,
      name: sessionName || t('terminals.resuming'),
      status: 'working',
      inputBuffer: '',
      isBasic: false,
      claudeSessionId: sessionId
    };

  This makes resumeSession() behave like createTerminal() with resumeSessionId, ensuring AI tab names are persisted to session-names.json.

  SECONDARY ISSUE (OSC overwrite of custom name): When a session has isRenamed=true (manual rename or custom name from session-names.json), and the user resumes it, the OSC title from Claude will call updateTerminalTabName() and overwrite the custom name. Consider adding a guard in handleClaudeTitleChange or updateTerminalTabName to skip the rename if the session was manually renamed. This is analogous to the existing shouldSkipOscRename slash-command protection.

verification: not yet applied
files_changed: []
