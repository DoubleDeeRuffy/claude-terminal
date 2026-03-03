# Upstream Merge Playbook

How to safely merge `upstream/main` into fork's `main` without losing WIP features.

## The Problem

When merging upstream, conflicted files resolved with `--theirs` discard ALL local changes in those files — including uncommitted WIP that was stashed. The stash pop then can't restore what was overwritten by the merge commit. This silently drops features.

**Example of what went wrong (2026-02-28):**
- 9 files conflicted during `git merge upstream/main`
- All resolved with `git checkout --theirs` (take upstream version)
- WIP changes in `en.json`, `fr.json`, and `SettingsPanel.js` were permanently lost
- `settings.state.js` and `TerminalManager.js` survived only because the stash pop re-applied them

## Safe Merge Procedure (Revised 2026-03-03)

### 1. Tag the Pre-Merge State

Always create a recoverable tag before any merge work:

```bash
git tag v<version>-pre-merge HEAD   # e.g., v0.9.8-pre-merge
```

This is better than stashes or reflog hunting — the tag is permanent and explicit.

### 2. Commit All WIP (Not Stash)

Stashes are fragile during merges. Commit instead:

```bash
git status                          # List all modified/untracked files
git diff --stat                     # See what's changed
git add <specific-files>
git commit -m "wip: <describe changes>"
```

This makes your WIP part of the git history, so it participates in merge as "ours" side.

### 3. Dry-Run First (Assess Conflict Scope)

Before committing to the merge, preview what you're getting into:

```bash
git fetch upstream
# Use a temporary worktree to avoid touching your working tree:
git worktree add --detach .claude/worktrees/merge-test HEAD
cd .claude/worktrees/merge-test
git merge --no-commit upstream/main
# Count conflicts per file:
for f in $(git diff --name-only --diff-filter=U); do
  count=$(grep -c "^<<<<<<< HEAD" "$f" 2>/dev/null || echo 0)
  echo "$count conflicts in $f"
done
# Inspect specific conflicts:
grep -n "^<<<<<<< HEAD\|^=======\|^>>>>>>>" <file>
# Clean up:
cd -
git worktree remove .claude/worktrees/merge-test --force
```

### 4. Merge with `--no-commit`

```bash
git merge --no-commit upstream/main
```

Using `--no-commit` lets you resolve everything and verify before finalizing.

### 5. Resolve Conflicts — Delegate to a Subagent

For large merges (10+ conflicts), spawn a general-purpose Agent to resolve all conflicts in parallel. The principle for fork merges: **keep BOTH sides** — local features and upstream fixes are additive.

For each conflicted file, the agent should:
1. Read conflict markers
2. Understand what each side added
3. Keep both sides merged together
4. Verify zero conflict markers remain after resolution

### 6. Fix Post-Merge Build Errors

Common issues after merging both sides:
- **Duplicate variable declarations** — both sides declared the same `const` (e.g., `tabActivationHistory`)
- **Duplicate JSON keys** — both sides added keys to the same section (e.g., `"tabs"` appearing twice in i18n files)
- **Duplicate imports** — both sides added the same module import

Always run `npm run build:renderer` before committing — esbuild catches these instantly.

### 7. Verify and Commit

```bash
npm run build:renderer   # Must succeed (catches dupes, missing refs)
npm test                 # All tests must pass
git add -A
git commit -m "merge upstream/main (vX.Y.Z) into local main"
```

## Quick Reference: Decision Tree

```
Pre-merge:
  ├── Tag current HEAD (v<X>-pre-merge)
  ├── Commit all WIP (not stash)
  └── Dry-run in worktree to assess scope

Merge:
  ├── git merge --no-commit upstream/main
  ├── Resolve conflicts (keep both sides)
  ├── Fix build errors (duplicate decls, JSON keys)
  └── npm run build:renderer + npm test → commit
```

## Files Commonly at Risk

These files are modified by almost every feature phase and will frequently conflict:

| File | Why |
|------|-----|
| `src/renderer/state/settings.state.js` | New settings added by every feature |
| `src/renderer/ui/panels/SettingsPanel.js` | UI toggles for new settings |
| `src/renderer/i18n/locales/en.json` | i18n keys for every feature |
| `src/renderer/i18n/locales/fr.json` | Same |
| `src/renderer/ui/components/TerminalManager.js` | Keyboard shortcuts, terminal features |
| `renderer.js` | Module imports for new features |
| `src/main/preload.js` | IPC bridge for new handlers |
| `package.json` / `package-lock.json` | Dependency changes |

## Recovery Procedure (If Merge Already Destroyed Work)

If the merge already happened and you discover your features are gone:

### 1. Find Your Pre-Merge Commit

```bash
git reflog --oneline -20
# Look for the last commit BEFORE "commit (merge): Merge remote-tracking branch..."
# That commit hash is your safe restore point (e.g., 48411527)
```

### 2. Identify Which Files Lost Your Code

```bash
# Compare your pre-merge state to current HEAD — stat shows what changed
git diff <pre-merge-hash> HEAD -- src/ renderer.js index.html styles/ --stat

# Large negative numbers (e.g., -308 lines) = YOUR code was removed
# Large positive numbers = upstream additions (may be fine)
```

### 3. Restore Your Files Selectively

**DO NOT hard-reset** — that would lose new upstream features. Instead, checkout your files:

```bash
# Restore your versions of files where YOUR code was overwritten
git checkout <pre-merge-hash> -- \
  src/renderer/ui/components/TerminalManager.js \
  src/renderer/ui/components/ChatView.js \
  src/renderer/state/settings.state.js \
  src/renderer/ui/panels/SettingsPanel.js \
  src/renderer/services/TerminalSessionService.js \
  src/main/ipc/explorer.ipc.js \
  styles/settings.css \
  styles/terminal.css \
  <...any other files that lost your work>
```

### 4. Layer Back Upstream Additions

After restoring, the NEW upstream features are gone from those files. Re-add them:

- **New imports** (e.g., `CloudPanel`) — add to import lines
- **New IPC bridge methods** (e.g., `cloud.*`) — add to existing namespace in `preload.js`
- **New i18n keys** — merge into JSON without removing your keys:
  ```js
  // Script to merge upstream i18n keys
  const upstream = JSON.parse(execSync('git show <merge-hash>:path/to/en.json'));
  const local = JSON.parse(readFileSync('path/to/en.json'));
  local.cloud = upstream.cloud; // Add new namespace
  writeFileSync('path/to/en.json', JSON.stringify(local, null, 2));
  ```
- **New function blocks** — copy from `git show <merge-hash>:renderer.js` and insert into restored file
- **New HTML elements** — add Cloud tab, CSS links, CSP updates to `index.html`

### 5. Verify

```bash
npm run build:renderer   # Must succeed
npm test                 # All tests must pass
# grep for YOUR features to confirm they're back:
grep -c "performPaste\|tabActivationHistory\|slashRenameTimestamps" src/renderer/ui/components/TerminalManager.js
grep -c "scheduleScrollAfterRestore\|setSkipExplorerCapture" renderer.js
```

## What the Merge Silently Destroys (2026-02-28 Incident #2)

The upstream merge brought **Cloud features, updated Telemetry, Workflow graph** — all new code. But the 3-way merge resolution silently **removed** all of the following local features because upstream had diverged versions of the same files:

| Feature | File | Lines Lost | Symptom |
|---------|------|-----------|---------|
| Right-click copy/paste | TerminalManager.js | ~50 | Ctrl+Shift+C/V and context menu stop working |
| Tab activation history | TerminalManager.js | ~30 | Closing tab goes to wrong tab |
| Slash-command rename protection | TerminalManager.js | ~20 | OSC title overwrites /slash names |
| Per-project active tab | TerminalManager.js | ~40 | Switching projects loses active tab |
| Session restore (name/mode/scroll) | renderer.js | ~40 | Restored tabs lose names and don't scroll |
| Projects panel width | renderer.js + settings.state.js | ~10 | Panel width resets on restart |
| Settings toggles (4 settings) | SettingsPanel.js | ~80 | aiTabNaming, autoScroll, naturalSort, idleTimeout toggles gone |
| Settings CSS | settings.css | ~193 | Settings panel styling broken |
| Explorer file watcher | explorer.ipc.js + preload.js | ~50 | File explorer stops auto-refreshing |
| i18n keys (26 per locale) | en.json, fr.json | ~52 | Missing translation strings |

**Total: ~560 lines of working features silently dropped.**

The dangerous part: the merge commit succeeds, tests pass, the app launches — but features are just *gone*. You only discover it when you try to use them.

## Lessons Learned

### From the 2026-02-28 incident (silent data loss)
1. **Stash + merge + stash pop is unsafe** — if the merge touches files in your stash, you get conflicts or silent data loss
2. **Bulk `--theirs` is destructive** — it's only safe for files with zero local changes
3. **Even "clean" merges destroy code** — if upstream rewrote a file you also modified, git's 3-way merge may silently pick upstream's version and drop your additions — **no conflict markers, no warnings**
4. **The reflog is your lifeline** — `git reflog` always has your pre-merge commit. You can restore any file from it with `git checkout <hash> -- <file>` even weeks later

### From the 2026-03-03 merge (successful, 18 conflicts / 55 hunks)
5. **Tag before merge, not just commit** — `git tag v<X>-pre-merge HEAD` is more reliable than reflog diving. Explicit, named, permanent.
6. **Dry-run in a worktree first** — `git worktree add --detach` + `git merge --no-commit` lets you count conflicts and inspect them without touching your working tree. Invaluable for deciding whether to merge or cherry-pick.
7. **Delegate large conflict resolution to a subagent** — 55 conflict hunks across 18 files is tedious but mechanical. An Agent with "keep both sides" instructions resolves them faster and more reliably than manual editing.
8. **Build catches what eyes miss** — after resolving all markers, `npm run build:renderer` instantly found duplicate `const` declarations and duplicate JSON keys that the merge resolution introduced. Always build before committing.
9. **Don't manually copy upstream fixes — just merge** — manually porting individual fixes creates double work: you apply them now, then git tries to re-apply them on the next merge causing new conflicts. A proper merge does 90% automatically.
10. **Most fork conflicts are "keep both sides"** — when local and upstream are additive (features + bug fixes, not contradictory rewrites), nearly every conflict resolves to keeping both `<<<` and `>>>` content.
