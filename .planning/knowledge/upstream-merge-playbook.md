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

1. **Stash + merge + stash pop is unsafe** — if the merge touches files in your stash, you get conflicts or silent data loss
2. **Bulk `--theirs` is destructive** — it's only safe for files with zero local changes
3. **Always inventory WIP before merging** — the 2 minutes spent listing files saves hours of recovery
4. **Commit WIP, don't stash it** — commits participate in merge resolution, stashes don't
5. **Verify after merge, not just during** — grep for expected artifact counts in every WIP file
6. **Even "clean" merges destroy code** — if upstream rewrote a file you also modified (e.g., `renderer.js`, `TerminalManager.js`), git's 3-way merge may silently pick upstream's version and drop your additions — **no conflict markers, no warnings**
7. **Always `git diff <pre-merge> HEAD -- <file>` after merge** — check EVERY file you've modified locally. If the diff shows negative lines for your features, the merge ate them
8. **The reflog is your lifeline** — `git reflog` always has your pre-merge commit. You can restore any file from it with `git checkout <hash> -- <file>` even weeks later
9. **Selective restore + layer-back is the safest recovery** — restore your files from the pre-merge hash, then manually add new upstream features on top. Never hard-reset (loses upstream), never re-merge (repeats the problem)
