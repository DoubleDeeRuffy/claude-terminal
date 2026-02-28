# PR Playbook

How to create, update, and maintain PRs for claude-terminal.

## Setup

- **Upstream:** `Sterll/claude-terminal` (base repo)
- **Fork:** `DoubleDeeRuffy/claude-terminal` (our working fork)
- **Base branch:** `origin/main`
- **PR command:** `gh pr create --repo Sterll/claude-terminal --head DoubleDeeRuffy:BRANCH`

## Creating a PR

### 1. Prepare the Branch

```bash
git stash --include-untracked          # Save WIP on current branch
git fetch upstream
git checkout -b feat/phase-XX-slug upstream/main
```

### 2. Apply Changes

**Simple case (clean commits):** Cherry-pick from fork's main:

```bash
git cherry-pick <commit-hash>...
```

**Interleaved case (multiple phases share commits):** Use a subagent to surgically apply only the target phase's changes. Provide the agent with:

- Every file modified by the phase (from SUMMARY files)
- Every function/constant/setting/i18n key added
- What belongs to THIS phase vs other phases
- Prerequisites from earlier phases that the code depends on

The agent reads `git show upstream/main:PATH` and `git show main:PATH` for each file, then applies only the phase-specific edits.

### 3. Squash to Single Commit

If multiple commits exist, squash:

```bash
git reset --soft upstream/main
git commit -m "$(cat <<'EOF'
feat(scope): short description

2-3 line explanation of what it does and key decisions.

- Bullet per major component
- EN/FR i18n support

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### 4. Verify Before Pushing

```bash
npm test                    # Tests pass
npm run build:renderer      # Renderer builds
```

Grep for expected artifacts:

```bash
grep -c "functionName" src/file.js        # expected: N
grep -c "settingKey" src/state/file.js     # expected: 1
grep -c "i18nKey" src/renderer/i18n/locales/en.json  # expected: N
```

### 5. Push and Create PR

```bash
git push -u origin feat/phase-XX-slug

gh pr create --repo Sterll/claude-terminal --base main \
  --head DoubleDeeRuffy:feat/phase-XX-slug \
  --title "feat(scope): short description" \
  --body "$(cat <<'EOF'
## Summary
- Adds [feature] with [key detail]
- New setting in Settings > [location], defaults to [value]
- EN/FR i18n support

## Files Changed (N)
| File | Change |
|------|--------|
| `src/renderer/...` | What was added/changed |

## Test plan
- [ ] Setting appears in correct location with correct default
- [ ] Core feature works as expected
- [ ] Edge case / guard behavior
- [ ] Toggle off disables feature

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 6. Restore Working Branch

```bash
git checkout main
git stash pop
```

## Updating an Existing PR Branch

When a PR branch falls behind `upstream/main` or has conflicts:

```bash
git fetch upstream
git checkout feat/branch-name
git rebase upstream/main
```

Resolve conflicts using local `main` (which has the correct merged code):

```bash
git checkout main -- path/to/conflicted/file
git add <files> && git rebase --continue
```

Drop unwanted commits (e.g., `.planning/` chore):

```bash
git rebase --onto upstream/main <unwanted-commit-hash> feat/branch-name
```

Force push safely:

```bash
git push --force-with-lease origin feat/branch-name
```

**Key:** Always `--force-with-lease`, never `--force`. Local `main` stays untouched.

## After Upstream Merges

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
git branch -d feat/phase-XX-slug           # local cleanup
git push origin --delete feat/phase-XX-slug # remote cleanup
```

## Maintainer Preferences (Sterll)

Follow these to avoid review round-trips:

- **Flat settings only** — no nested objects in `settings.json`. Use `shortcutCtrlCEnabled: true`, not `terminalShortcuts: { ctrlC: { enabled: true } }`
- **`before-input-event` must intercept Ctrl+Arrow** — Windows Snap prevention must be preserved
- **IPC toggle pattern** — flag variable + `set[Setting]Enabled` IPC handler + startup sync. Reference: `setCtrlTabEnabled`
- **No duplicate helpers** — check `main` for existing utilities before adding new ones
- **Rebase on latest `upstream/main`** before submitting — clean merge expected, no conflicts
- **Keep scope focused** — one feature per PR, no unrelated cleanup

## Pitfalls

- **Don't forget prerequisites:** If phase code calls a function from an earlier phase, include it (note as prerequisite in commit)
- **Don't include other phase changes:** Settings, i18n keys, UI toggles from other phases must NOT be in the diff
- **Stash before switching:** Working branch likely has untracked files that conflict with `upstream/main`
- **Always verify artifact counts before pushing**
- **Run `npm test` and `npm run build:renderer`** — PRs that fail CI waste maintainer time
