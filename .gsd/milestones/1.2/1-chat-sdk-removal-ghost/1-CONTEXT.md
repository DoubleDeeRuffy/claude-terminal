# Phase 1: Chat + Agent SDK Removal (GHOST — already completed)

**Status:** GHOST — code landed in commit `d9395d6f` before this milestone was formalized.
**Part of:** Tab System Rewrite (phases 1→3)

> **This phase is a documentation stub.** The actual work was completed in
> a single commit against a detached-HEAD worktree at
> `C:/Users/uhgde/source/repos/claude-terminal-rewrite`. Nothing remains
> to execute. The executor of milestone 1.2 should skip this phase and
> start at phase 2.

<domain>
## Phase Boundary

Delete the integrated chat feature and the `@anthropic-ai/claude-agent-sdk`
dependency so the upcoming tab-system rewrite doesn't have to carry
chat-mode branching through it. Rewire anything that was reaching through
`ChatService` (workflows, parallel tasks, AI rename) to non-SDK paths.

**Why this is phase 1 of 3:** TerminalManager has chat branching
scattered through `createTerminal`, `setActiveTerminal`, `closeTerminal`,
the context menu, the resume flow, and the markdown renderer's CSS class
names. Stripping those first frees phase 2 (split-pane removal) from
having to also understand chat, and frees phase 3 (the clean tab-system
rewrite) from having to preserve either dimension.
</domain>

<decisions>
## Decisions Locked In (from the planning conversation)

- **No Agent SDK.** `@anthropic-ai/claude-agent-sdk` leaves `package.json`.
- **Workflows survive via `claude -p` CLI.** `runSinglePrompt` becomes a
  thin wrapper around `child_process.execFile('claude', ['-p', ...,
  '--output-format', 'stream-json', '--verbose'])`. No PTY. No SDK.
  `effort` and `skills` parameters are silently dropped (no CLI
  equivalent). Callers change one symbol, not their args.
- **AI Rename via GitHub Models API.** New `tabNameGenerator.js` mirrors
  `commitMessageGenerator.js` — same `gpt-4o-mini` model, same keytar
  token lookup.
- **Control Tower panel kept, chat branches stripped.** Panel stays for
  terminal-type agent monitoring.
- **`session-names.json` kept** as a secondary writer (still needed by
  Claude's resume-dialog / lightbulb per the resume-dialogs knowledge note).
- **Markdown viewer CSS classes renamed** `chat-code-block` →
  `md-code-block`, `chat-inline-code` → `md-inline-code`,
  `chat-table-wrapper` → `md-table-wrapper`, etc., with styles migrated
  from `chat.css` into a new section of `terminal.css`.
</decisions>

<code_context>
## Outcome (for future phases / readers)

**Landed in:** `C:/Users/uhgde/source/repos/claude-terminal-rewrite`
(detached worktree off `main`), commit **`d9395d6f`** —
"phase 1: remove chat feature + agent sdk, rewire workflows to claude -p".

**Net diff:** 33 files changed, +620 / −11,501 lines.

**New files:**
- `src/main/services/ClaudeCliPromptService.js` — CLI wrapper
  (`runSinglePrompt(opts)` API-compatible with the old SDK version).
- `src/main/utils/tabNameGenerator.js` — GitHub Models tab-name generator.
- `src/main/ipc/claudePrompt.ipc.js` — exposes `tab-name-generate` handler.

**Deleted files:**
- `src/main/services/ChatService.js`
- `src/main/ipc/chat.ipc.js`
- `src/renderer/ui/components/ChatView.js`
- `src/renderer/ui/components/ClaudeMdSuggestionModal.js`
- `styles/chat.css`
- `tests/services/ChatService.test.js`

**Renamed / rewired:**
- `TerminalManager.js` — `createChatTerminal`, `switchTerminalMode`,
  `updateChatTerminalStatus`, `findChatTab`, mode toggle button, all
  `mode === 'chat'` branches, `createChatView` require, AI rename IPC
  call (`api.chat.generateTabName` → `api.tabName.generate`).
- `ControlTowerPanel.js` — rewritten; chat agent type and permission
  handling gone; tracks only terminal-type agents.
- `RemoteServer.js` — `_ensureChatBridge`, `_teardownChatBridge`,
  `_cleanupStaleBuffers`, all `case 'chat:*'` handlers, chat event
  buffering, `chatModel` / `effortLevel` fields in `hello` / `request:init`
  all removed. `broadcastSessionStarted` / `broadcastTabRenamed` kept as
  thin pass-throughs so the IPC and tests remain stable.
- `WorkflowPanel.js` — AI Workflow Builder chat panel (`#wf-ai-panel`,
  `#wf-ed-ai` button, `WORKFLOW_SYSTEM_PROMPT` block, `createChatView`
  wiring) deleted. Workflow editor core (LiteGraph, palette, execution)
  unchanged.
- `SettingsPanel.js` — `defaultTerminalMode`, `showTabModeToggle`,
  `autoClaudeMdUpdate` UI + save-handler references removed.
- `settings.state.js` — `defaultTerminalMode`, `chatModel`, `effortLevel`,
  `autoClaudeMdUpdate`, `showTabModeToggle` settings deleted.
- `events/index.js` — chat event source filtering and chat session-recap
  branch removed.
- `WorkflowService.js`, `WorkflowRunner.js`, `ParallelTaskService.js`,
  `workflow-nodes/claude.node.js`, `services/index.js`, `ipc/index.js`,
  `preload.js` — all `chatService` references renamed to
  `claudeCliPromptService`.
- `package.json` — `@anthropic-ai/claude-agent-sdk` dependency deleted.
- `en.json`, `fr.json`, `es.json` — entire `chat.*` key tree deleted plus
  `settings.modeChat*`, `settings.defaultTerminalMode`,
  `settings.showTabModeToggle*`, `settings.autoClaudeMdUpdate*`.

**Verification gates (passed at commit time):**
- `npm run build:renderer` — clean bundle
- `npm test` — 450 / 450 passed across 16 suites

**Known non-regressions (deliberate scope calls):**
- Markdown viewer code blocks / tables keep their exact visual styling
  via renamed `md-*` classes in `terminal.css`.
- `session-names.json` continues to be written on rename (resume dialog
  dependency) but is no longer the authoritative source for tab restore.
- `onUserMessage: createListener('remote:user-message')` survives in
  `preload.js` — harmless dead bridge, nothing listens to it anymore.
</code_context>

---

*Phase: 1-chat-sdk-removal-ghost*
*Status: completed in commit d9395d6f before this milestone directory existed*
