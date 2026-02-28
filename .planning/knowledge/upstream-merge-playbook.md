# Upstream Merge Playbook

How to safely merge `upstream/main` into fork's `main` without losing WIP features.

## The Problem

When merging upstream, conflicted files resolved with `--theirs` discard ALL local changes in those files — including uncommitted WIP that was stashed. The stash pop then can't restore what was overwritten by the merge commit. This silently drops features.

**Example of what went wrong (2026-02-28):**
- 9 files conflicted during `git merge upstream/main`
- All resolved with `git checkout --theirs` (take upstream version)
- WIP changes in `en.json`, `fr.json`, and `SettingsPanel.js` were permanently lost
- `settings.state.js` and `TerminalManager.js` survived only because the stash pop re-applied them

## Safe Merge Procedure

### 1. Inventory WIP Changes BEFORE Anything Else

```bash
git status                          # List all modified/untracked files
git diff --stat                     # See what's changed (unstaged)
git diff --cached --stat            # See what's staged
```

**Write down every file with WIP changes.** This is the checklist you'll verify against at the end.

### 2. Create a WIP Snapshot Commit (Not a Stash)

Stashes are fragile during merges. Commit instead:

```bash
git add -A
git commit -m "WIP: snapshot before upstream merge"
```

This makes your WIP part of the git history, so it survives the merge as "ours" side.

### 3. Fetch and Start the Merge

```bash
git fetch upstream
git merge upstream/main
```

### 4. Resolve Conflicts File-by-File (NEVER Bulk `--theirs`)

For each conflicted file, check if it has WIP changes:

```bash
git diff HEAD~1 -- <conflicted-file>   # Did WIP commit touch this file?
```

- **File has NO WIP changes:** Safe to take theirs:
  ```bash
  git checkout --theirs <file>
  ```

- **File HAS WIP changes:** Must manually merge:
  ```bash
  # Open the file, resolve conflict markers keeping both sides
  # Or use a merge tool:
  git mergetool <file>
  ```

**Rule: NEVER use `git checkout --theirs` on a file that has your WIP changes.**

### 5. Verify WIP Survived

For every file from the Step 1 inventory, confirm changes are present:

```bash
# For each WIP file:
git diff HEAD~1 -- <file>   # Should show your WIP additions
grep -c "yourFunctionName" <file>
grep -c "yourSettingKey" <file>
grep -c "yourI18nKey" <file>
```

### 6. Complete the Merge

```bash
git add <all-resolved-files>
git commit --no-edit              # Merge commit
```

### 7. Optionally Undo the WIP Snapshot

If you want to keep WIP uncommitted (as it was before):

```bash
git reset --soft HEAD~2           # Undo merge + WIP commits, keep changes staged
git stash                         # Stash the WIP
git merge upstream/main           # Redo merge (now no WIP conflicts)
git stash pop                     # Reapply WIP
```

Or just leave the WIP commit — it's on your fork's `main`, not going to upstream.

### 8. Protect Local-Only Files

Before merging, back up files that should NEVER be overwritten by upstream:

```bash
# These are local-only, not in upstream:
cp CLAUDE.md /tmp/CLAUDE.md.bak
cp -r .planning /tmp/.planning.bak
cp -r .claude /tmp/.claude.bak
cp *.cmd /tmp/cmd.bak/
```

Restore after merge:

```bash
cp /tmp/CLAUDE.md.bak CLAUDE.md
cp -r /tmp/.planning.bak/* .planning/
cp -r /tmp/.claude.bak/* .claude/
cp /tmp/cmd.bak/*.cmd .
```

## Quick Reference: Decision Tree

```
For each conflicted file:
  ├── Has WIP changes?
  │   ├── YES → Manual merge (keep both sides)
  │   └── NO  → git checkout --theirs <file>
  │
  After merge:
  ├── For each file in WIP inventory:
  │   ├── grep for expected artifacts
  │   └── If missing → STOP, recover from WIP commit or stash
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

## Lessons Learned

1. **Stash + merge + stash pop is unsafe** — if the merge touches files in your stash, you get conflicts or silent data loss
2. **Bulk `--theirs` is destructive** — it's only safe for files with zero local changes
3. **Always inventory WIP before merging** — the 2 minutes spent listing files saves hours of recovery
4. **Commit WIP, don't stash it** — commits participate in merge resolution, stashes don't
5. **Verify after merge, not just during** — grep for expected artifact counts in every WIP file
