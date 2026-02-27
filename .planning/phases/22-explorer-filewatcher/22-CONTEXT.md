# Phase 22: Explorer-Filewatcher - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add file system watching to the integrated file explorer so it automatically reflects external changes (new files, deletions, renames) without requiring manual refresh. The explorer tree stays in sync with the actual filesystem at all times.

</domain>

<decisions>
## Implementation Decisions

### Watch scope
- Watch the entire project directory recursively — explorer always reflects reality, even for collapsed folders
- Watcher starts automatically when a project is opened, stops when project closes — no toggle or setting needed
- One active watcher at a time — stop old watcher on project switch, start new one for the active project
- Main process (Node.js) hosts the watcher, sends IPC events to renderer — follows existing IPC architecture pattern

### Technology
- Use chokidar for file watching — battle-tested, handles cross-platform edge cases, recursive watching, and deduplication out of the box

### Performance boundaries
- Auto-exclude heavy directories from watching — reuse existing IGNORE_PATTERNS from FileExplorer (node_modules, .git, __pycache__, bin/obj, etc.)
- Soft limit on watched paths (~10k) — show a notification warning if exceeded, suggesting the user close explorer or exclude folders

### Update behavior
- Debounced batch updates (~300-500ms) — collect changes and apply once to avoid UI thrashing during bulk operations (git checkout, npm install)
- Silent updates — no highlights, animations, or visual indicators when files change. Tree just reflects new state.
- Incremental patches — add/remove only changed items rather than re-reading entire directories. Faster, less I/O, preserves state naturally.
- Track all changes including collapsed folders — internal state is always current so expanding a folder shows reality immediately
- Deleted files silently disappear from tree — no special notification or handling
- Deleted expanded folders silently vanish with their children — consistent with silent update approach

### State preservation
- Expanded folders, scroll position, and selection remain intact during updates — incremental patches make this natural
- Builds on Phase 5/5.1 explorer state persistence patterns

### Claude's Discretion
- Exact debounce timing within 300-500ms range
- Chokidar configuration options (polling vs native, stabilityThreshold)
- IPC event format and batching strategy
- Soft limit threshold tuning
- How to handle rapid successive project switches during watcher startup/teardown

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key references:
- VS Code's file watcher behavior (recursive, silent, state-preserving) is a good UX model
- Must integrate with existing FileExplorer.js readDirectoryAsync/collectAllFiles patterns

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-explorer-filewatcher*
*Context gathered: 2026-02-27*
