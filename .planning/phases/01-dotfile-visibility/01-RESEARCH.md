# Phase 1: Dotfile Visibility - Research

**Researched:** 2026-02-24
**Domain:** File system filtering in Electron renderer — FileExplorer.js
**Confidence:** HIGH

## Summary

Phase 1 is a surgical two-line removal. The `FileExplorer.js` component filters out dotfiles (files/folders whose names start with `.`) in exactly two locations: `readDirectoryAsync` (used when expanding folders in the tree view) and `collectAllFiles` (used when indexing files for Ctrl+P search). Both locations share the same filter expression: `if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;`. Removing this condition from both locations satisfies FILE-01 and FILE-02 entirely.

There are no external libraries to install, no IPC changes, no state changes, and no CSS changes. The `IGNORE_PATTERNS` set at the top of the file already handles the entries that should remain hidden (`.DS_Store`, `.cache`, `.idea`, `.vscode`, etc.). After removing the dotfile filter, those patterns still apply — so truly junk dotfiles remain hidden while `.planning`, `.git`, `.claude`, `.github`, and similar project-relevant dotfolders become visible.

The STATE.md note "Dotfile filter exists in two separate functions in FileExplorer.js — Phase 1 plan must remove both in the same commit" is confirmed correct by code inspection. Both lines are at FileExplorer.js:233 and FileExplorer.js:370.

**Primary recommendation:** Remove the `name.startsWith('.')` guard from both `readDirectoryAsync` (line 233) and `collectAllFiles` (line 370) in a single edit. No other files need to change.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILE-01 | User can see dotfiles and dotfolders (.planning, .git, etc.) in file explorer tree | Remove filter in `readDirectoryAsync` — this function feeds the tree view |
| FILE-02 | User can find dotfiles via file search/indexer | Remove filter in `collectAllFiles` — this function feeds the Ctrl+P search index |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs.promises` | Built-in (Electron) | Async file system reads | Already used throughout FileExplorer.js — no change needed |

### Supporting

No supporting libraries need to be added or changed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Removing the filter entirely | Making dotfiles opt-in via settings toggle | REQUIREMENTS.md explicitly marks "Dotfile toggle setting" as Out of Scope. The user chose "show all". |

**Installation:** None required.

## Architecture Patterns

### Relevant Code Structure

```
src/renderer/ui/components/FileExplorer.js
├── IGNORE_PATTERNS (Set)          # Line 42-47: entries always hidden (.DS_Store, node_modules, etc.)
├── readDirectoryAsync(dirPath)    # Line 222: used by tree view (folder expand)
│   └── dotfile filter             # Line 233: THE FIRST FILTER TO REMOVE
├── collectAllFiles(dirPath, max)  # Line 360: used by search indexer
│   └── dotfile filter             # Line 370: THE SECOND FILTER TO REMOVE
└── performSearch()                # Line 389: calls collectAllFiles, feeds searchResults
```

### Pattern 1: IGNORE_PATTERNS continues to function as intended

**What:** The `IGNORE_PATTERNS` Set (line 42) runs before the dotfile filter in both functions. It already blocks `.DS_Store`, `.cache`, `.idea`, `.vscode`, `.git` (the git data folder), and other noisy entries. Removing the dotfile filter does NOT expose these — they are filtered by `IGNORE_PATTERNS.has(name)` earlier in the loop.

**Note:** `.git` is in `IGNORE_PATTERNS`. This means the `.git` folder itself will remain hidden after this change (blocked by `IGNORE_PATTERNS`, not by the dotfile filter). Only dotfiles/folders NOT in `IGNORE_PATTERNS` will become visible. For example: `.planning`, `.claude`, `.github`, `.gitignore`, `.env`, `.env.local` (wait — `.env.local` IS in IGNORE_PATTERNS). The two exceptions `.env` and `.gitignore` were previously hardcoded as allowed — after removal those exceptions become unnecessary (they simply pass through with everything else).

**When to use:** No change to this pattern — it runs unchanged.

### Pattern 2: The filter expressions are identical

Both filter lines have the identical expression:
```javascript
if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;
```

Both must be removed. Removing only one would create a split — dotfiles visible in tree but not in search (or vice versa).

### Anti-Patterns to Avoid

- **Removing only one location:** `readDirectoryAsync` feeds the tree; `collectAllFiles` feeds search. Both must change atomically or the behavior is split (FILE-01 passes, FILE-02 fails, or vice versa).
- **Modifying IGNORE_PATTERNS instead:** Do not remove `.git` from IGNORE_PATTERNS — the `.git` data directory contains thousands of object files that would flood the tree and search. `.git` should remain in IGNORE_PATTERNS.
- **Adding a settings flag:** Out of scope per REQUIREMENTS.md. Do not add a toggle.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dotfile visibility | Custom filter flag system | Simple line removal | A one-line delete is all that's needed; any abstraction adds complexity without benefit |

**Key insight:** The existing `IGNORE_PATTERNS` set already provides the right granularity — coarse "never show" blocklist. The dotfile filter was a blanket exclusion layered on top. Removing the blanket leaves only the intentional blocklist.

## Common Pitfalls

### Pitfall 1: Removing filter from only one function

**What goes wrong:** FILE-01 passes (tree shows dotfiles), FILE-02 fails (search doesn't find them), or vice versa.
**Why it happens:** Developer reads the task description "remove dotfile filter" and finds the first instance, stops.
**How to avoid:** The plan must explicitly name both line numbers and require both removed in one commit.
**Warning signs:** After the change, dotfiles appear in tree but are absent from search results (or the reverse).

### Pitfall 2: Removing .git from IGNORE_PATTERNS by mistake

**What goes wrong:** The `.git` folder expands in the tree and its entire object store (thousands of files) floods the file explorer.
**Why it happens:** Developer notices `.git` is in IGNORE_PATTERNS and thinks "but users want to see .git" — misunderstands the distinction between the .git folder's internal data and project dotfolders like `.github`.
**How to avoid:** Leave IGNORE_PATTERNS untouched. `.git` should stay blocked. `.github` and `.planning` are not in IGNORE_PATTERNS and will become visible after the filter removal.
**Warning signs:** Extremely slow tree expansion for any git repo after the change.

### Pitfall 3: `.env.local` becoming visible unexpectedly

**What goes wrong:** `.env.local` appears in the tree, surprising users with sensitive data exposed in the UI.
**Why it happens:** `.env.local` is already in `IGNORE_PATTERNS` — this is not actually a problem. Checking: line 46 of FileExplorer.js shows `.env.local` IS in `IGNORE_PATTERNS`. So it remains hidden.
**How to avoid:** Verify the IGNORE_PATTERNS set before and after — no change needed.
**Warning signs:** None expected; `.env.local` stays hidden via IGNORE_PATTERNS.

## Code Examples

### Current filter (lines 233 and 370 — to be removed)

```javascript
// Source: src/renderer/ui/components/FileExplorer.js lines 231-234 and 368-371
for (const name of names) {
  if (IGNORE_PATTERNS.has(name)) continue;
  if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;  // REMOVE THIS LINE
  // ...
}
```

### After removal

```javascript
for (const name of names) {
  if (IGNORE_PATTERNS.has(name)) continue;
  // dotfile filter removed — all non-ignored entries including dotfiles now pass through
  // ...
}
```

### IGNORE_PATTERNS (unchanged — for reference)

```javascript
// Source: src/renderer/ui/components/FileExplorer.js lines 42-47
const IGNORE_PATTERNS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'vendor', '.cache', '.idea', '.vscode',
  '.DS_Store', 'Thumbs.db', '.env.local', 'coverage',
  '.nuxt', '.output', '.turbo', '.parcel-cache'
]);
```

Dotfolders NOT in IGNORE_PATTERNS (will become visible after change):
- `.planning`
- `.claude`
- `.github`
- `.gitignore` (was already allowed by the exception in the old filter)
- `.env` (was already allowed by the exception in the old filter)
- `.husky`
- `.eslintrc`, `.prettierrc`, etc.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Blanket dotfile exclusion with two hardcoded exceptions (.env, .gitignore) | Remove blanket exclusion, rely on IGNORE_PATTERNS for specific blocklist | Phase 1 | Dotfolders like .planning, .claude, .github become visible |

**No deprecated patterns here** — this is a pure deletion from existing code.

## Open Questions

None. The change is fully understood and the code is fully read. Both filter locations are confirmed at lines 233 and 370.

## Validation Architecture

> `workflow.nyquist_validation` is not present in config.json (config only has `workflow.research`, `workflow.plan_check`, `workflow.verifier`, `workflow.auto_advance`). Nyquist validation is not enabled. Skipping this section.

## Sources

### Primary (HIGH confidence)

- Direct code inspection of `src/renderer/ui/components/FileExplorer.js` (full file read) — confirmed both filter locations at lines 233 and 370, confirmed IGNORE_PATTERNS contents, confirmed no other dotfile filtering exists in the file.
- `.planning/REQUIREMENTS.md` — FILE-01 and FILE-02 requirements confirmed.
- `.planning/STATE.md` — Confirmed "Dotfile filter exists in two separate functions" note.
- `.planning/ROADMAP.md` — Phase 1 plan description confirmed.

### Secondary (MEDIUM confidence)

None needed — this is entirely internal code inspection, no external libraries involved.

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, pure deletion
- Architecture: HIGH — code fully read, both filter locations confirmed by grep and line-by-line inspection
- Pitfalls: HIGH — derived from direct code inspection of IGNORE_PATTERNS and filter logic

**Research date:** 2026-02-24
**Valid until:** Stable indefinitely (no external dependencies, pure internal change)
