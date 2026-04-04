# 2026-04-04: Origin Reset & Cherry-Pick Recovery

## What happened

On **2026-04-03 at 14:23**, a `git pull --rebase origin main` brought in origin's code (`d95f0971` — "reset: terminal files to upstream/main"). This commit had **massive changes** to terminal-related files:

- `TerminalManager.js` — 1091 lines changed (stripped local improvements)
- `terminal.css` — 425 lines changed
- `TerminalService.js`, `TerminalSessionService.js`, `renderer.js`, `SettingsPanel.js` also modified
- Total: 8 files, 650 insertions / 1178 deletions

The rebase replayed local commits on top of origin's reset code. The resulting v1.1.2 build (2026-04-04 11:23) had a **project-click regression**: clicking a project in the sidebar no longer expanded it or loaded sessions/terminals. The v1.1.1 build (2026-04-03 08:13, built from pre-pull state `501b0221`) worked correctly.

## Root cause

Origin's `d95f0971` ("reset: terminal files to upstream/main for clean re-apply") was a WIP commit that reverted local terminal improvements back to upstream/main state. After rebase, local feature commits were replayed on a broken base, producing subtly broken code that compiled and passed tests but failed at runtime.

## Recovery steps

1. Created backup branch: `git branch backup/pre-reset HEAD` (at `778a721e`)
2. Reset main to pre-pull state: `git reset --hard 501b0221`
3. Applied phase 39 CSS fix manually (adapted for pre-pull codebase — different CSS structure)
4. Cherry-picked phase 38 code: `git cherry-pick fa68d1c3` (clean, no conflicts)
5. Restored GSD planning artifacts for phases 37-39: `git checkout backup/pre-reset -- .gsd/`
6. Bumped version to 1.1.2
7. Force-pushed to both remotes (origin + forgejo)

## Key commits

| Hash | Description |
|------|-------------|
| `501b0221` | Pre-pull HEAD = v1.1.1 build base |
| `db55878d` | Phase 39 fix (adapted: `top: 36px` + `z-index` approach instead of `flex: 1`) |
| `e1d18e02` | Phase 38 code (cherry-picked from `fa68d1c3`) |
| `45256f41` | GSD planning artifacts restored for phases 37-39 |
| `8fe6afa5` | Version bump to 1.1.2 |

## Backup branch

`backup/pre-reset` at `778a721e` — contains the old HEAD with all rebased commits including phase 37 WIP code. Available for reference but should NOT be merged back (contains the broken origin code).

## Lessons

- **Never pull from origin without checking what changed** — origin had WIP/reset commits that broke the codebase
- **The v1.1.1 exe timestamp (08:13) vs pull timestamp (14:23) on the same day** was the key to identifying the good state
- **`git reflog`** was essential to find the pre-pull commit after rebase rewrote history
- **Phase 39 CSS fix needed adaptation** — the pre-pull codebase had `.empty-state` with `position: absolute` (not flex-based), requiring a different fix approach (`top: 36px` + `z-index` layering)

## Current state (post-recovery)

- `main` = v1.1.1 base + phase 39 fix + phase 38 code + GSD docs
- Phase 37 code NOT yet cherry-picked (only planning artifacts)
- Phase 37/38 will go into v1.1.3 release via cherry-pick
