# Phase 37: Enhance Git Capabilities - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve the existing git tab to match Rider's git UX quality: a rich commit graph modal, hierarchical branch treeview with ahead/behind indicators, and current-branch button with push/pull arrow status.

</domain>

<decisions>
## Implementation Decisions

### Commit graph modal
- **D-01:** Commit graph opens as a **modal dialog**, not a sub-tab — user explicitly doesn't want to navigate through 5 clicks to see commit history
- **D-02:** Triggered by an **icon button in the git sidebar header** (next to branches section), always visible when git tab is active
- **D-03:** Modal default size: **30% window width × 50% window height**, resizable by dragging edges/corners
- **D-04:** Modal width and height **persisted in settings** (via `settingsState`) so the user's preferred size survives restarts
- **D-05:** Visual style matches Rider's commit log — colored branch lanes, branch/tag decorations inline, commit hash + message + author + date on one row, search/filter bar at top (branch, user, date, paths filters)
- **D-06:** The existing `computeGraphLanes` / `renderGraphSvg` / `renderDecorations` code in `GitTabService.js` should be reused and enhanced, not rewritten from scratch

### Branch treeview
- **D-07:** **Replace the current flat branch list** in the git sidebar with a Rider-style hierarchical tree
- **D-08:** Tree structure: Recent branches section at top, then Local tree with folder hierarchy (e.g. `feat/` folder groups feature branches), then Remote tree
- **D-09:** Each branch shows: tracking remote inline (e.g. `origin/master` next to local `master`), ahead/behind **commit count** (e.g. `← 29`)
- **D-10:** Search bar at top of branch tree for filtering branches by name
- **D-11:** Keep existing branch actions: checkout, merge, delete — accessed the same way (action buttons on hover or context menu)

### Current branch button arrows
- **D-12:** The current branch button in the git action bar shows **arrow indicators** matching Rider behavior:
  - Green arrow (↑) = local ahead, commits can be pushed
  - Blue arrow (↓) = local behind, remote has new commits
  - Both arrows = ahead AND behind
- **D-13:** Arrow indicators shown **directly on the branch button**, not just as badge text on push/pull buttons
- **D-14:** Ahead/behind commit counts also visible in the branch treeview next to each branch

### Claude's Discretion
- Exact SVG graph lane colors and rendering improvements
- Search/filter bar implementation details in the commit graph modal
- How to fetch ahead/behind counts for non-current branches (may need `git for-each-ref` or similar)
- Modal resize handle styling and drag implementation
- Branch tree folder detection algorithm (split on `/`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing git implementation
- `src/renderer/services/GitTabService.js` — Main git tab service with all sub-tabs, commit graph rendering (`computeGraphLanes`, `renderGraphSvg`, `renderDecorations`), branch tree (`buildBranchTree`, `renderBranchTreeNode`, `renderBranches`), ahead/behind tracking
- `src/main/ipc/git.ipc.js` — 38 IPC handlers for all git operations
- `src/main/utils/git.js` — Git utility functions (`getGitInfoFull`, `getBranches`, `getCommitHistory`, `getBranchOrphanCommitCount`, etc.)
- `src/renderer/ui/panels/GitChangesPanel.js` — Changes panel (staging, commit)

### UI patterns
- `src/renderer/ui/components/Modal.js` — Existing modal component (small/medium/large sizes, ESC/overlay close)
- `src/renderer/state/settings.state.js` — Settings persistence (for modal size storage)
- `styles/git.css` — Git panel styles (2871 lines)
- `styles/modals.css` — Modal dialog styles

### Reference screenshots
- `.gsd/files/rider-commit-graph.png` — Target commit graph UX (Rider)
- `.gsd/files/claude-terminal-commit-graph.png` — Current commit graph (to improve)
- `.gsd/files/rider-branch-modal1.png` — Target branch treeview UX (Rider)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeGraphLanes(commits)` at GitTabService.js:1161 — Already computes lane assignments for commit graph SVG rendering
- `renderGraphSvg(row, maxLanes, isFirst, isLast)` at GitTabService.js:1257 — SVG lane rendering, can be enhanced for better colors/styling
- `renderDecorations(decorationsRaw)` at GitTabService.js:1325 — Branch/tag decoration badges
- `buildBranchTree(branches)` at GitTabService.js:372 — Already builds hierarchical tree from branch names (splits on `/`)
- `renderBranchTreeNode(node, type, depth)` at GitTabService.js:391 — Recursive tree renderer with collapsible folders
- `Modal.js` — `createModal()` / `showModal()` / `closeModal()` for modal dialogs
- `aheadBehind` state in GitTabService.js — Already tracks ahead/behind for current branch

### Established Patterns
- Git data flows: IPC handler → `git.js` utility → preload bridge → renderer service
- State persistence: `settingsState.set(key, value)` with debounced save
- Modal pattern: `createModal({ title, content, size })` with CSS classes for sizing
- Sub-tab rendering: `renderSubTabContent()` switch on `currentSubTab`

### Integration Points
- Git sidebar in `index.html` lines 607-634 — branches list, worktrees, stashes sections
- Git action bar with pull/push/fetch buttons — where branch button with arrows lives
- `buildHistoryToolbar()` at GitTabService.js:1348 — filter toolbar for history view
- Settings state for persisting modal dimensions

</code_context>

<specifics>
## Specific Ideas

- "I want it like Rider" — the commit graph should match Rider's git log view with colored lanes, inline decorations, and one-row-per-commit layout
- Commit graph modal must be accessible without tab navigation — single click from git sidebar
- Branch treeview should show `← 29` style ahead/behind counts like Rider does
- Current branch button arrows: green for pushable, blue for behind — exact Rider behavior
- Modal starts at 30% × 50% but is resizable and remembers size

</specifics>

<deferred>
## Deferred Ideas

- Commit detail & diff view improvements (side-by-side diff, file tree of changes) — separate phase later

</deferred>

---

*Phase: 37-enhance-git-capabilities-commit-graph-branch-visualization-unpushed-file-tracking*
*Context gathered: 2026-04-04*
