# Phase 37: Enhance Git Capabilities - Research

**Researched:** 2026-04-04
**Domain:** Git UI — commit graph modal, branch treeview, ahead/behind indicators
**Confidence:** HIGH

## Summary

This phase enhances three areas of the existing git tab: (1) a resizable commit graph modal accessible via a single button click, (2) a hierarchical branch treeview with Recent/Local/Remote sections and ahead/behind counts, and (3) arrow indicators on the current branch button showing push/pull status.

All three features build on **existing infrastructure**. The commit graph already has `computeGraphLanes`, `renderGraphSvg`, and `renderDecorations`. The branch tree already uses `buildBranchTree` with `/`-based folder splitting. The ahead/behind data is already fetched via `getAheadBehind()` and stored in the `aheadBehind` variable. The main work is: extracting the history rendering into a modal, adding resize+persistence, restructuring the branch list HTML, adding a new IPC for bulk ahead/behind, and adding arrow indicators to the branch display.

**Primary recommendation:** Extend, don't rewrite. The existing graph/lane code is solid. The modal system supports custom sizes but needs resize behavior added. A new `git for-each-ref` based IPC handler is needed for efficient bulk ahead/behind counts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Commit graph opens as a modal dialog, not a sub-tab
- D-02: Triggered by an icon button in the git sidebar header (next to branches section), always visible when git tab is active
- D-03: Modal default size: 30% window width x 50% window height, resizable by dragging edges/corners
- D-04: Modal width and height persisted in settings (via settingsState) so the user's preferred size survives restarts
- D-05: Visual style matches Rider's commit log — colored branch lanes, branch/tag decorations inline, commit hash + message + author + date on one row, search/filter bar at top (branch, user, date, paths filters)
- D-06: The existing computeGraphLanes / renderGraphSvg / renderDecorations code in GitTabService.js should be reused and enhanced, not rewritten from scratch
- D-07: Replace the current flat branch list in the git sidebar with a Rider-style hierarchical tree
- D-08: Tree structure: Recent branches section at top, then Local tree with folder hierarchy, then Remote tree
- D-09: Each branch shows: tracking remote inline, ahead/behind commit count (e.g. left-arrow 29)
- D-10: Search bar at top of branch tree for filtering branches by name
- D-11: Keep existing branch actions: checkout, merge, delete — accessed the same way (action buttons on hover or context menu)
- D-12: The current branch button in the git action bar shows arrow indicators matching Rider behavior: Green arrow (up) = local ahead, Blue arrow (down) = local behind, Both arrows = ahead AND behind
- D-13: Arrow indicators shown directly on the branch button, not just as badge text on push/pull buttons
- D-14: Ahead/behind commit counts also visible in the branch treeview next to each branch

### Claude's Discretion
- Exact SVG graph lane colors and rendering improvements
- Search/filter bar implementation details in the commit graph modal
- How to fetch ahead/behind counts for non-current branches (may need git for-each-ref or similar)
- Modal resize handle styling and drag implementation
- Branch tree folder detection algorithm (split on `/`)

### Deferred Ideas (OUT OF SCOPE)
- Commit detail and diff view improvements (side-by-side diff, file tree of changes) — separate phase later
</user_constraints>

## Standard Stack

### Core
No new libraries required. This phase uses only existing dependencies.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | ^28.0.0 | Already in project | Desktop framework |
| esbuild | ^0.27.2 | Already in project | Renderer bundling |

### Supporting
All rendering is vanilla JS (no framework). The project uses direct DOM manipulation with innerHTML templates and delegated event handlers. No new npm packages needed.

**Installation:** None required.

## Architecture Patterns

### Recommended Changes Structure
```
src/renderer/services/GitTabService.js    # Extend: commit graph modal, branch tree, arrows
src/renderer/ui/components/Modal.js       # Extend: add resizable modal support
src/main/utils/git.js                     # Add: getBranchesWithAheadBehind()
src/main/ipc/git.ipc.js                   # Add: handler for branches-with-ahead-behind
src/main/preload.js                       # Add: expose new IPC method
src/renderer/state/settings.state.js      # Add: commitGraphWidth, commitGraphHeight defaults
styles/git.css                            # Add: graph modal, branch tree, arrow indicator styles
styles/modals.css                         # Add: resizable modal styles
index.html                                # Modify: add commit graph button to branches header
src/renderer/i18n/locales/en.json         # Add: new i18n keys
src/renderer/i18n/locales/fr.json         # Add: new i18n keys
```

### Pattern 1: Resizable Modal
**What:** The existing Modal.js uses fixed size classes (`modal-small`, `modal-medium`, `modal-large`). The commit graph modal needs a new pattern: percentage-based initial size with user-resizable edges/corners and persisted dimensions.

**How to implement:**
- Do NOT modify `createModal()` signature — it serves existing modals well
- Instead, create the modal DOM manually (same HTML structure as `createModal` but with custom sizing) or add an optional `customSize` parameter
- Add CSS `resize: both` or manual drag handles on the `.modal` element
- On resize end, persist width/height to `settingsState` via `setSetting('commitGraphWidth', width)` and `setSetting('commitGraphHeight', height)`
- On modal open, read from settings or use defaults (30% x 50%)

**Example (manual resize approach):**
```javascript
// After creating modal element:
const modalDialog = modal.querySelector('.modal');
modalDialog.style.width = getSetting('commitGraphWidth') || '30vw';
modalDialog.style.height = getSetting('commitGraphHeight') || '50vh';

// Add resize handles (8 edges/corners)
addResizeHandles(modalDialog, (newWidth, newHeight) => {
  setSetting('commitGraphWidth', newWidth + 'px');
  setSetting('commitGraphHeight', newHeight + 'px');
});
```

**Implementation detail:** CSS `resize: both; overflow: auto` on the `.modal` element is the simplest approach but offers limited control over handle styling. Manual drag handles give Rider-like UX with invisible resize zones on all 4 edges + 4 corners. Manual approach recommended — it's ~60 lines of mousedown/mousemove/mouseup code.

### Pattern 2: Bulk Ahead/Behind via git for-each-ref
**What:** D-09 and D-14 require ahead/behind counts for ALL branches, not just the current one. The existing `getAheadBehind()` does a fetch + rev-list for a single branch. Calling it N times would be too slow.

**How to implement:** Use `git for-each-ref` with a custom format that computes ahead/behind in a single command:
```bash
git for-each-ref --format='%(refname:short) %(upstream:short) %(upstream:track)' refs/heads/
```
Output example: `main origin/main [ahead 2, behind 3]` or `feat/x origin/feat/x [ahead 1]`

This gives tracking info for all local branches in one call. Parse the `[ahead N, behind M]` format.

**New function in `git.js`:**
```javascript
async function getBranchesWithTracking(projectPath) {
  const output = await execGit(projectPath, [
    'for-each-ref',
    '--format=%(refname:short)%1e%(upstream:short)%1e%(upstream:track)',
    'refs/heads/'
  ]);
  if (!output) return [];
  return output.split('\n').filter(l => l.trim()).map(line => {
    const [name, upstream, track] = line.split('\x1e');
    let ahead = 0, behind = 0;
    if (track) {
      const aheadMatch = track.match(/ahead (\d+)/);
      const behindMatch = track.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
    }
    return { name, upstream: upstream || null, ahead, behind };
  });
}
```

### Pattern 3: Branch Treeview with Recent Section
**What:** D-08 requires a "Recent" section at the top. Git tracks recent branch switches via the reflog.

**How to get recent branches:**
```bash
git reflog show --format='%gs' --date=relative | grep 'checkout: moving from' | head -5
```
Or more reliably:
```bash
git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads/ --count=5
```
The second approach gives the 5 most recently committed-to branches, which is a good proxy for "recent."

Alternatively, parse `git reflog` for checkout events:
```bash
git reflog --format='%gs' | grep -oP 'checkout: moving from \S+ to \K\S+' | head -10
```
This gives actual checkout history. Recommend the reflog approach since it matches what Rider shows (branches you actually switched to).

**New function in `git.js`:**
```javascript
async function getRecentBranches(projectPath, limit = 5) {
  const output = await execGit(projectPath, [
    'reflog', '--format=%gs', '-n', '100'
  ]);
  if (!output) return [];
  const seen = new Set();
  const recent = [];
  for (const line of output.split('\n')) {
    const match = line.match(/checkout: moving from \S+ to (\S+)/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      recent.push(match[1]);
      if (recent.length >= limit) break;
    }
  }
  return recent;
}
```

### Pattern 4: Current Branch Arrow Indicators
**What:** The `renderQuickActions()` function at line 333 renders the branch display. Currently it shows a checkmark or "no remote" text. This needs to change to colored arrows.

**Current code (line 360-364):**
```javascript
<div class="git-branch-display">
  <svg ...branch icon...></svg>
  <span>${escapeHtml(currentBranch || 'HEAD')}</span>
  ${aheadBehind?.hasRemote ? `<span class="git-sync-status">...</span>` : '<span class="git-no-remote">no remote</span>'}
</div>
```

**New code pattern:**
```javascript
<div class="git-branch-display">
  <svg ...branch icon...></svg>
  <span>${escapeHtml(currentBranch || 'HEAD')}</span>
  ${aheadBehind?.hasRemote ? buildArrowIndicators(aheadBehind) : '<span class="git-no-remote">no remote</span>'}
</div>
```
Where `buildArrowIndicators()` returns green up-arrow span when ahead > 0 and blue down-arrow span when behind > 0.

### Anti-Patterns to Avoid
- **Re-implementing the lane algorithm:** D-06 explicitly says reuse `computeGraphLanes`. Only enhance styling/colors, do not rewrite the algorithm.
- **Calling getAheadBehind() per branch:** This would fire N git fetch + rev-list commands. Use bulk `git for-each-ref` instead.
- **Storing modal size in localStorage:** The project uses `settingsState` for all persistence. Do not use a separate storage mechanism.
- **Adding a new sub-tab for the graph:** D-01 explicitly says modal, not sub-tab. The history sub-tab can remain as-is for users who prefer it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal overlay/focus-trap/ESC | Custom overlay logic | Extend existing `Modal.js` createModal pattern | Already handles focus trap, ESC, backdrop click, cleanup |
| Branch tree hierarchy | Custom tree parsing | Extend existing `buildBranchTree()` | Already splits on `/` and builds nested nodes |
| SVG graph rendering | New canvas/graph library | Existing `computeGraphLanes` + `renderGraphSvg` | Already handles lane assignment, merge curves, S-curves |

## Common Pitfalls

### Pitfall 1: Modal Resize Persisting Invalid Sizes
**What goes wrong:** User resizes modal to very small or very large, or window gets resized making saved dimensions invalid.
**Why it happens:** Pixel values from a large monitor don't work on a small one.
**How to avoid:** Store percentages (vw/vh) not pixels. Add min-width/min-height constraints. Clamp to viewport on open.
**Warning signs:** Modal appears off-screen or squished after switching monitors.

### Pitfall 2: Bulk Ahead/Behind Performance
**What goes wrong:** Calling `git for-each-ref` with tracking info is fast locally but can be slow if the repo has many branches and remote refs are stale.
**Why it happens:** `%(upstream:track)` computes rev-list counts internally for each branch.
**How to avoid:** Use `skipFetch: true` for the initial load (use local data). Only do a real fetch when the user explicitly clicks "Fetch." Cache the result and only refresh on pull/push/fetch/checkout events.
**Warning signs:** Branch list takes > 1 second to render.

### Pitfall 3: Existing History Sub-Tab Conflict
**What goes wrong:** The commit graph modal duplicates functionality of the existing "History" sub-tab, causing confusion.
**Why it happens:** Both show commit history with graph lanes.
**How to avoid:** The modal is the quick-access version (one click from sidebar). The sub-tab remains for inline use. Don't remove the sub-tab. The modal can reuse the same data cache (`historyData`).
**Warning signs:** Users confused about two ways to see commit history.

### Pitfall 4: Branch Search Filtering DOM
**What goes wrong:** Filtering branches by search text with innerHTML re-render causes scroll position loss and event listener re-attachment.
**Why it happens:** Full re-render on each keystroke.
**How to avoid:** Use CSS `display: none` to hide non-matching items rather than rebuilding the DOM. Or use `visibility`-based approach. Alternatively, debounce the input (200ms) and batch re-render.
**Warning signs:** Typing in search feels laggy, tree collapses on each keystroke.

### Pitfall 5: Concurrent Data Loading Race
**What goes wrong:** `getBranchesWithTracking()` and `getRecentBranches()` are async. If user switches projects mid-load, stale data from old project renders in new project context.
**Why it happens:** No cancellation mechanism for pending git commands.
**How to avoid:** Check `selectedProjectId` after each await. If it changed, discard results. This pattern is already used elsewhere in GitTabService.js.
**Warning signs:** Branch list shows branches from wrong project.

## Code Examples

### Existing Graph Colors (GitTabService.js:1135)
```javascript
const GRAPH_COLORS = [
  '#06b6d4', // cyan
  '#22c55e', // green
  '#a855f7', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#f97316', // orange
  '#8b5cf6', // violet
];
const LANE_W = 14;
const ROW_H = 34;
const MAX_LANES = 8;
```

### Existing Branch Tree Builder (GitTabService.js:372)
```javascript
function buildBranchTree(branches) {
  const tree = { _branches: [] };
  for (const branch of branches) {
    const parts = branch.split('/');
    if (parts.length === 1) {
      tree._branches.push(branch);
    } else {
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const prefix = parts[i];
        if (!node[prefix]) node[prefix] = { _branches: [] };
        node = node[prefix];
      }
      node._branches.push(branch);
    }
  }
  return tree;
}
```

### Existing Ahead/Behind (git.js:176)
```javascript
async function getAheadBehind(projectPath, branch, skipFetch = false) {
  if (!skipFetch) {
    await execGit(projectPath, 'fetch --quiet', 3000).catch(() => {});
  }
  const upstream = await execGit(projectPath, `rev-parse --abbrev-ref ${branch}@{upstream}`);
  if (!upstream) {
    const remoteUrl = await execGit(projectPath, 'remote get-url origin');
    if (remoteUrl) return { ahead: 0, behind: 0, remote: null, hasRemote: true, notTracking: true };
    return { ahead: 0, behind: 0, remote: null, hasRemote: false };
  }
  const counts = await execGit(projectPath, `rev-list --left-right --count ${branch}...${upstream}`);
  if (!counts) return { ahead: 0, behind: 0, remote: upstream, hasRemote: true };
  const [ahead, behind] = counts.split('\t').map(n => parseInt(n, 10) || 0);
  return { ahead, behind, remote: upstream, hasRemote: true };
}
```

### Settings Persistence Pattern (settings.state.js)
```javascript
// Add new defaults to defaultSettings object:
commitGraphWidth: null,   // null = use default 30vw
commitGraphHeight: null,  // null = use default 50vh

// Usage in renderer:
const { getSetting, setSetting } = require('../state/settings.state');
const width = getSetting('commitGraphWidth') || '30vw';
setSetting('commitGraphWidth', '45vw');  // auto-debounced save
```

### Modal Creation Pattern (Modal.js)
```javascript
const modal = createModal({
  id: 'commit-graph-modal',
  title: t('gitTab.commitGraph'),
  content: '<div id="graph-modal-content"></div>',
  buttons: [],  // No footer buttons for graph modal
  size: 'large',
  onClose: () => { /* cleanup */ }
});
showModal(modal);
```

### Commit History Data Format (git.js:919)
Each commit object from `getCommitHistory()`:
```javascript
{
  fullHash: 'abc123...',
  hash: 'abc123',
  message: 'feat: something',
  author: 'Name',
  email: 'email@example.com',
  date: '2 hours ago',
  isoDate: '2026-04-04T10:00:00+02:00',
  parents: ['def456...'],  // array of parent full hashes
  decorations: 'HEAD -> main, origin/main, tag: v1.0'
}
```

### index.html Branches Section (line 607-614)
The button for the commit graph modal should be added to the branches header:
```html
<div class="git-sidebar-section git-sidebar-branches">
  <div class="git-sidebar-header">
    <h3 data-i18n="git.branches">Branches</h3>
    <!-- ADD: commit graph button here -->
    <button class="btn-icon btn-small" id="git-btn-commit-graph" title="Commit Graph">
      <svg><!-- graph icon --></svg>
    </button>
    <button class="btn-icon btn-small" id="git-btn-new-branch" ...>
    </button>
  </div>
  <div class="git-branches-list" id="git-branches-list"></div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat branch list | Hierarchical tree (already exists via `buildBranchTree`) | Already in codebase | Just needs UI restructuring (Recent/Local/Remote sections) |
| Graph in sub-tab only | Graph also accessible via modal | This phase | One-click access per D-01 |
| No ahead/behind in branch list | Bulk ahead/behind via for-each-ref | This phase | Shows tracking status for all branches |

## Open Questions

1. **Recent branches via reflog vs committerdate**
   - What we know: Both approaches work. Reflog gives actual checkout history, committerdate gives most recently modified.
   - What's unclear: Rider uses checkout history (reflog-based). Reflog can be empty on fresh clones.
   - Recommendation: Use reflog with fallback to committerdate sort. This matches D-08's intent.

2. **Commit graph modal data loading**
   - What we know: `historyData` is loaded when the history sub-tab is active. The modal may open before history is loaded.
   - What's unclear: Should the modal share the cache or load independently?
   - Recommendation: Load independently on modal open (call `api.git.commitHistory` with `allBranches: true`). Cache in a separate `graphModalData` variable. This keeps the sub-tab and modal decoupled.

3. **Remote branch ahead/behind**
   - What we know: `git for-each-ref` only gives tracking info for local branches with upstream set.
   - What's unclear: D-09 says "each branch" — does this include remote branches?
   - Recommendation: Show ahead/behind only for local branches (where tracking info exists). Remote branches don't have upstream tracking by definition. This matches Rider's behavior in the screenshot.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with jsdom |
| Config file | package.json jest config |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-03 | Modal opens at 30% x 50%, resizable | manual-only | N/A | N/A |
| D-04 | Modal size persisted in settings | unit | `npm test -- --testPathPattern=settings` | Partial (settings tests exist) |
| D-06 | Reuses computeGraphLanes | manual-only | N/A | N/A |
| D-08 | Branch tree: Recent/Local/Remote | manual-only | N/A | N/A |
| D-12 | Arrow indicators on branch button | manual-only | N/A | N/A |

Note: Most features are visual/interactive and require manual verification. The main testable units are the data-fetching functions in `git.js` (new `getBranchesWithTracking`, `getRecentBranches`) and settings persistence.

### Wave 0 Gaps
- None critical. Existing test infrastructure covers settings state. New git utility functions should be tested but are simple parsing functions.

## Sources

### Primary (HIGH confidence)
- Project source code: `src/renderer/services/GitTabService.js` — full graph/branch/decoration implementation
- Project source code: `src/main/utils/git.js` — all git operations including `getAheadBehind`, `getBranches`, `getCommitHistory`
- Project source code: `src/renderer/ui/components/Modal.js` — modal system (createModal, showModal, closeModal)
- Project source code: `src/renderer/state/settings.state.js` — settings persistence pattern
- Reference screenshots: Rider commit graph, current claude-terminal graph, Rider branch modal

### Secondary (MEDIUM confidence)
- Git documentation for `git for-each-ref --format='%(upstream:track)'` — well-documented git feature for bulk tracking info

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing code
- Architecture: HIGH - clear patterns from existing codebase, screenshots show exact target
- Pitfalls: HIGH - identified from code analysis and practical git experience

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase, no external dependency changes)
