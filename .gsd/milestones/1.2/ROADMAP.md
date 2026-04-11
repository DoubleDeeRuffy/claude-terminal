# Milestone 1.2 — Tab System Rewrite

**Status:** in progress (phase 1 done; phase 2 and phase 3 ready to execute)
**Started:** 2026-04-11
**Goal:** Fix the three recurring terminal-tab bugs at their root cause (rename wrong tab, wrong set of tabs on restore, wrong names on restore) by rebuilding the tab subsystem on a clean foundation. Along the way, shrink the codebase by deleting the integrated chat feature, the `@anthropic-ai/claude-agent-sdk` dependency, and the split-pane / PaneManager layout system — none of which are used by the fork owner.

## Execution Model

All three phases execute inside an isolated git worktree at
`C:/Users/uhgde/source/repos/claude-terminal-rewrite` (detached HEAD off
the phase-37 WIP commit `52d9d17a`). The main checkout at
`C:/Users/uhgde/source/repos/claude-terminal` is NOT touched during
milestone 1.2. When all three phases are green, the worktree is
merged back into the main checkout and pushed to the fork — no PRs to
upstream.

Each phase is committed separately so `git bisect` can isolate a
regression to the right phase.

## Phases

### Phase 1: Chat + Agent SDK Removal — GHOST (completed)

**Status:** completed in commit `d9395d6f` before this milestone directory was formalized.
**Goal:** Delete the integrated chat feature and the `@anthropic-ai/claude-agent-sdk` dependency. Rewire workflows / parallel tasks / AI tab rename to non-SDK paths (`claude -p` CLI for workflows, GitHub Models API for AI rename).
**Plans:** 1 plan (ghost — no execution needed).

Plans:
- [x] Plan 1A: Ghost — already completed in commit d9395d6f (see [1-CONTEXT.md](1-chat-sdk-removal-ghost/1-CONTEXT.md))

### Phase 2: Remove Split-Pane / PaneManager

**Status:** ready for execution.
**Goal:** Delete `PaneManager.js` and all split-pane code so phase 3 can rewrite the tab system on a single-bar foundation without having to preserve pane semantics.
**Depends on:** phase 1 ghost (commit `d9395d6f`).
**Plans:** 1 plan.

Plans:
- [ ] Plan 2A: Remove split-pane feature (see [2-01-PLAN.md](2-remove-split-pane/2-01-PLAN.md))

### Phase 3: Rewrite Tab System

**Status:** ready for execution.
**Goal:** Rebuild the tab subsystem with unified string IDs, single source of truth for per-project active tab, v3 persistence format with migration, and the rename / restore / active-tab fixes. Fixes the three canonical regressions.
**Depends on:** phase 2.
**Plans:** 1 plan.

Plans:
- [ ] Plan 3A: Tab system rewrite (see [3-01-PLAN.md](3-rewrite-tab-system/3-01-PLAN.md))

## Known Non-Goals

- No replacement split-pane feature. Tabs are tabs; nothing stacks.
- No remote chat feature. The remote PWA lost chat-related message
  types in phase 1.
- No changes to `TerminalService.js` (main process PTY service) or
  `terminal.ipc.js` — the ID-scheme translation happens in the renderer.
- No Claude Agent SDK. It leaves `package.json`. Workflows use
  `claude -p` via child_process; AI tab rename uses GitHub Models API.

## Merge-Back Plan

When phase 3 commits green, in the main checkout at
`C:/Users/uhgde/source/repos/claude-terminal`:

```bash
git fetch ../claude-terminal-rewrite
git merge --ff-only FETCH_HEAD   # or cherry-pick the three phase commits
git worktree remove ../claude-terminal-rewrite
git push origin main            # to the fork
```

No upstream PR. This work stays on `DoubleDeeRuffy/claude-terminal`.
