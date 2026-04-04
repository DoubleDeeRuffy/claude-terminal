/**
 * Git IPC Handlers
 * Handles git-related IPC communication
 */

const { ipcMain } = require('electron');
const { execGit, getGitInfo, getGitInfoFull, getGitStatusQuick, getGitStatusDetailed, gitPull, gitPush, gitPushBranch, gitMerge, gitMergeAbort, gitMergeContinue, getMergeConflicts, isMergeInProgress, gitClone, gitStageFiles, gitCommit, getProjectStats, getBranches, getBranchesWithTracking, getRecentBranches, getCurrentBranch, checkoutBranch, createBranch, deleteBranch, getCommitHistory, getFileDiff, getCommitDetail, cherryPick, revertCommit, gitUnstageFiles, stashApply, stashDrop, gitStashSave, getWorktrees, createWorktree, removeWorktree, lockWorktree, unlockWorktree, pruneWorktrees, detectWorktree, diffWorktreeBranches, diffWorktreeBranchesWithStats, deleteRemoteBranch, gitFetch, renameBranch, gitRebase, gitRebaseAbort, gitRebaseContinue, getFileHistory, getCommitFileDiffs, getCommitFileDiff, gitBlame, getTags, createTag, deleteTag, pushTag, pushAllTags, getRemotes, resolveConflict, getBranchOrphanCommitCount, gitDiscardFiles, stashPop, stashShow, gitAmendCommit, isRebaseInProgress, gitReset, searchCommitHistory, addRemote, removeRemote } = require('../utils/git');
const { generateCommitMessage, generateSessionRecap } = require('../utils/commitMessageGenerator');
const GitHubAuthService = require('../services/GitHubAuthService');
const { sendFeaturePing } = require('../services/TelemetryService');

// Input validators
const isValidCommitHash = (h) => typeof h === 'string' && /^[a-f0-9]{4,64}$/i.test(h);
const isValidBranchName = (b) => typeof b === 'string' && b.length > 0 && b.length < 256 && !/[^a-zA-Z0-9._\-\/]/.test(b) && !b.includes('..');
const isValidStashRef = (r) => typeof r === 'string' && /^stash@\{\d+\}$/.test(r);

/**
 * Register git IPC handlers
 */
function registerGitHandlers() {
  // Get git info for dashboard (basic)
  ipcMain.handle('git-info', async (event, projectPath) => {
    try {
      return await getGitInfo(projectPath);
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Get full git info for dashboard (comprehensive)
  ipcMain.handle('git-info-full', async (event, projectPath) => {
    try {
      return await getGitInfoFull(projectPath);
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Get project statistics (lines of code, etc.)
  ipcMain.handle('project-stats', async (event, projectPath) => {
    try {
      return await getProjectStats(projectPath);
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Git pull
  ipcMain.handle('git-pull', async (event, { projectPath }) => {
    try {
      sendFeaturePing('git:pull');
      return await gitPull(projectPath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git push
  ipcMain.handle('git-push', async (event, { projectPath }) => {
    try {
      sendFeaturePing('git:push');
      return await gitPush(projectPath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git push a specific branch to origin
  ipcMain.handle('git-push-branch', async (event, { projectPath, branch }) => {
    try {
      sendFeaturePing('git:push');
      return await gitPushBranch(projectPath, branch);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git status (quick check)
  ipcMain.handle('git-status-quick', async (event, { projectPath }) => {
    try {
      return await getGitStatusQuick(projectPath);
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Get list of branches
  ipcMain.handle('git-branches', async (event, { projectPath }) => {
    try {
      return await getBranches(projectPath, { skipFetch: false });
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Get all branches with upstream tracking info and ahead/behind counts
  ipcMain.handle('git-branches-with-tracking', async (event, { projectPath }) => {
    try {
      return await getBranchesWithTracking(projectPath);
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Get recently checked-out branches from reflog
  ipcMain.handle('git-recent-branches', async (event, { projectPath, limit }) => {
    try {
      return await getRecentBranches(projectPath, limit);
    } catch (err) {
      return [];
    }
  });

  // Get current branch
  ipcMain.handle('git-current-branch', async (event, { projectPath }) => {
    try {
      return await getCurrentBranch(projectPath);
    } catch (err) {
      return null;
    }
  });

  // Checkout branch
  ipcMain.handle('git-checkout', async (event, { projectPath, branch }) => {
    if (!isValidBranchName(branch)) return { success: false, error: 'Invalid branch name' };
    try {
      return await checkoutBranch(projectPath, branch);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git merge
  ipcMain.handle('git-merge', async (event, { projectPath, branch }) => {
    if (!isValidBranchName(branch)) return { success: false, error: 'Invalid branch name' };
    try {
      return await gitMerge(projectPath, branch);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git merge abort
  ipcMain.handle('git-merge-abort', async (event, { projectPath }) => {
    try {
      return await gitMergeAbort(projectPath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git merge continue
  ipcMain.handle('git-merge-continue', async (event, { projectPath }) => {
    try {
      return await gitMergeContinue(projectPath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get merge conflicts
  ipcMain.handle('git-merge-conflicts', async (event, { projectPath }) => {
    try {
      return await getMergeConflicts(projectPath);
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Check if merge in progress
  ipcMain.handle('git-merge-in-progress', async (event, { projectPath }) => {
    try {
      return await isMergeInProgress(projectPath);
    } catch (err) {
      return false;
    }
  });

  // Resolve a merge conflict with ours/theirs strategy
  ipcMain.handle('git-resolve-conflict', async (event, { projectPath, filePath, strategy }) => {
    if (!filePath || typeof filePath !== 'string') return { success: false, error: 'Invalid file path' };
    if (strategy !== 'ours' && strategy !== 'theirs') return { success: false, error: 'Invalid strategy' };
    try {
      return await resolveConflict(projectPath, filePath, strategy);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get orphan commit count for a branch
  ipcMain.handle('git-branch-orphan-commits', async (event, { projectPath, branch }) => {
    if (!isValidBranchName(branch)) return 0;
    try {
      return await getBranchOrphanCommitCount(projectPath, branch);
    } catch (err) {
      return 0;
    }
  });

  // Git clone (auto-uses GitHub token if available)
  ipcMain.handle('git-clone', async (event, { repoUrl, targetPath }) => {
    // Validate URL scheme to prevent file:// or other dangerous protocols
    if (!repoUrl || typeof repoUrl !== 'string') return { success: false, error: 'Invalid repository URL' };
    const allowed = /^(https?:\/\/|git@[\w.-]+:)/i;
    if (!allowed.test(repoUrl.trim())) return { success: false, error: 'Only https:// and git@ URLs are allowed' };
    try {
      // Get GitHub token if available
      const token = await GitHubAuthService.getTokenForGit();
      return await gitClone(repoUrl, targetPath, { token });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git status detailed (for changes panel)
  ipcMain.handle('git-status-detailed', async (event, { projectPath }) => {
    try {
      return await getGitStatusDetailed(projectPath);
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Stage specific files
  ipcMain.handle('git-stage-files', async (event, { projectPath, files }) => {
    try {
      return await gitStageFiles(projectPath, files);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Create commit
  ipcMain.handle('git-commit', async (event, { projectPath, message }) => {
    try {
      sendFeaturePing('git:commit');
      return await gitCommit(projectPath, message);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Create a new branch
  ipcMain.handle('git-create-branch', async (event, { projectPath, branch }) => {
    if (!isValidBranchName(branch)) return { success: false, error: 'Invalid branch name' };
    try {
      return await createBranch(projectPath, branch);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Delete a branch
  ipcMain.handle('git-delete-branch', async (event, { projectPath, branch, force }) => {
    if (!isValidBranchName(branch)) return { success: false, error: 'Invalid branch name' };
    try {
      return await deleteBranch(projectPath, branch, force);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get paginated commit history
  ipcMain.handle('git-commit-history', async (event, { projectPath, skip, limit, branch, allBranches }) => {
    try {
      return await getCommitHistory(projectPath, { skip, limit, branch, allBranches });
    } catch (err) {
      return { error: true, message: err.message };
    }
  });

  // Get file diff
  ipcMain.handle('git-file-diff', async (event, { projectPath, filePath, staged }) => {
    try {
      return await getFileDiff(projectPath, filePath, staged);
    } catch (err) {
      return null;
    }
  });

  // Get commit detail
  ipcMain.handle('git-commit-detail', async (event, { projectPath, commitHash }) => {
    if (!isValidCommitHash(commitHash)) return '';
    try {
      return await getCommitDetail(projectPath, commitHash);
    } catch (err) {
      return '';
    }
  });

  // Cherry-pick a commit
  ipcMain.handle('git-cherry-pick', async (event, { projectPath, commitHash }) => {
    if (!isValidCommitHash(commitHash)) return { success: false, error: 'Invalid commit hash' };
    try {
      return await cherryPick(projectPath, commitHash);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Revert a commit
  ipcMain.handle('git-revert', async (event, { projectPath, commitHash }) => {
    if (!isValidCommitHash(commitHash)) return { success: false, error: 'Invalid commit hash' };
    try {
      return await revertCommit(projectPath, commitHash);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Unstage files
  ipcMain.handle('git-unstage-files', async (event, { projectPath, files }) => {
    try {
      return await gitUnstageFiles(projectPath, files);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Apply stash
  ipcMain.handle('git-stash-apply', async (event, { projectPath, stashRef }) => {
    if (!isValidStashRef(stashRef)) return { success: false, error: 'Invalid stash reference' };
    try {
      return await stashApply(projectPath, stashRef);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Drop stash
  ipcMain.handle('git-stash-drop', async (event, { projectPath, stashRef }) => {
    if (!isValidStashRef(stashRef)) return { success: false, error: 'Invalid stash reference' };
    try {
      return await stashDrop(projectPath, stashRef);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Save stash
  ipcMain.handle('git-stash-save', async (event, { projectPath, message }) => {
    try {
      return await gitStashSave(projectPath, message);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Generate commit message from file statuses and diff
  ipcMain.handle('git-generate-commit-message', async (event, { projectPath, files, useAi }) => {
    try {
      const path = require('path');
      const fs = require('fs');

      // Build diff context for each file based on its status
      const diffParts = [];

      const trackedFiles = files.filter(f => f.status !== '?');
      const untrackedFiles = files.filter(f => f.status === '?');

      // Tracked files: git diff HEAD
      if (trackedFiles.length > 0) {
        const diff = await execGit(projectPath, ['diff', 'HEAD', '--', ...trackedFiles.map(f => f.path)], 15000);
        if (diff) diffParts.push(diff);
      }

      // Untracked files: read first lines of each to give context
      for (const f of untrackedFiles) {
        try {
          const fullPath = path.join(projectPath, f.path);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            diffParts.push(`--- New directory: ${f.path}/`);
          } else if (stat.size > 500000) {
            diffParts.push(`--- New file: ${f.path} (${(stat.size / 1024).toFixed(0)}KB, binary or large)`);
          } else {
            const content = fs.readFileSync(fullPath, 'utf8').slice(0, 3000);
            diffParts.push(`--- New file: ${f.path}\n+++ ${f.path}\n${content.split('\n').map(l => '+' + l).join('\n')}`);
          }
        } catch (_) {
          diffParts.push(`--- New file: ${f.path}`);
        }
      }

      const diffContent = diffParts.join('\n\n');
      const githubToken = useAi !== false ? await GitHubAuthService.getToken() : null;
      const result = await generateCommitMessage(files, diffContent, githubToken);
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Generate session recap via GitHub Models API
  ipcMain.handle('git-generate-session-recap', async (_event, context) => {
    try {
      const githubToken = await GitHubAuthService.getToken();
      return await generateSessionRecap(context, githubToken);
    } catch (e) {
      return { summary: null, source: 'error' };
    }
  });

  // ========== NEW GIT OPERATIONS ==========

  // Delete remote branch
  ipcMain.handle('git-delete-remote-branch', async (event, { projectPath, branch, remote }) => {
    if (!isValidBranchName(branch)) return { success: false, error: 'Invalid branch name' };
    try {
      const result = await deleteRemoteBranch(projectPath, branch, remote);
      return { success: !!result, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Git fetch
  ipcMain.handle('git-fetch', async (event, { projectPath, remote }) => {
    try {
      const result = await gitFetch(projectPath, remote);
      return { success: true, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Rename branch
  ipcMain.handle('git-rename-branch', async (event, { projectPath, oldName, newName }) => {
    if (!isValidBranchName(oldName) || !isValidBranchName(newName)) return { success: false, error: 'Invalid branch name' };
    try {
      const result = await renameBranch(projectPath, oldName, newName);
      return { success: !!result !== false, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Rebase
  ipcMain.handle('git-rebase', async (event, { projectPath, branch }) => {
    if (!isValidBranchName(branch)) return { success: false, error: 'Invalid branch name' };
    try {
      const result = await gitRebase(projectPath, branch);
      return { success: result !== null, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Rebase abort
  ipcMain.handle('git-rebase-abort', async (event, { projectPath }) => {
    try {
      const result = await gitRebaseAbort(projectPath);
      return { success: result !== null, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Rebase continue
  ipcMain.handle('git-rebase-continue', async (event, { projectPath }) => {
    try {
      const result = await gitRebaseContinue(projectPath);
      return { success: result !== null, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // File history
  ipcMain.handle('git-file-history', async (event, { projectPath, filePath, skip, limit }) => {
    try {
      return await getFileHistory(projectPath, filePath, { skip, limit });
    } catch (err) {
      return [];
    }
  });

  // Commit file diffs (list of changed files with stats)
  ipcMain.handle('git-commit-file-diffs', async (event, { projectPath, commitHash }) => {
    if (!isValidCommitHash(commitHash)) return [];
    try {
      return await getCommitFileDiffs(projectPath, commitHash);
    } catch (err) {
      return [];
    }
  });

  // Commit file diff (single file diff within a commit)
  ipcMain.handle('git-commit-file-diff', async (event, { projectPath, commitHash, filePath }) => {
    if (!isValidCommitHash(commitHash)) return '';
    try {
      return await getCommitFileDiff(projectPath, commitHash, filePath);
    } catch (err) {
      return '';
    }
  });

  // Git blame
  ipcMain.handle('git-blame', async (event, { projectPath, filePath }) => {
    if (!filePath || typeof filePath !== 'string') return [];
    try {
      return await gitBlame(projectPath, filePath);
    } catch (err) {
      return [];
    }
  });

  // Tag list
  ipcMain.handle('git-tag-list', async (event, { projectPath }) => {
    try {
      return await getTags(projectPath);
    } catch (err) {
      return [];
    }
  });

  // Create tag
  ipcMain.handle('git-tag-create', async (event, { projectPath, name, message, commitHash }) => {
    if (!name || typeof name !== 'string') return { success: false, error: 'Invalid tag name' };
    try {
      const result = await createTag(projectPath, name, message, commitHash);
      return { success: result !== null, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Delete tag
  ipcMain.handle('git-tag-delete', async (event, { projectPath, name }) => {
    if (!name || typeof name !== 'string') return { success: false, error: 'Invalid tag name' };
    try {
      const result = await deleteTag(projectPath, name);
      return { success: result !== null, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Push tag
  ipcMain.handle('git-tag-push', async (event, { projectPath, name, remote }) => {
    if (!name || typeof name !== 'string') return { success: false, error: 'Invalid tag name' };
    try {
      const result = await pushTag(projectPath, name, remote);
      return { success: result !== null, output: result || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get remotes
  ipcMain.handle('git-remotes', async (event, { projectPath }) => {
    try {
      return await getRemotes(projectPath);
    } catch (err) {
      return [];
    }
  });

  // Discard file changes
  ipcMain.handle('git-discard-files', async (event, { projectPath, files }) => {
    try {
      return await gitDiscardFiles(projectPath, files);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Stash pop
  ipcMain.handle('git-stash-pop', async (event, { projectPath, stashRef }) => {
    if (!isValidStashRef(stashRef)) return { success: false, error: 'Invalid stash reference' };
    try {
      return await stashPop(projectPath, stashRef);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Stash show (preview)
  ipcMain.handle('git-stash-show', async (event, { projectPath, stashRef }) => {
    if (!isValidStashRef(stashRef)) return '';
    try {
      return await stashShow(projectPath, stashRef);
    } catch (err) {
      return '';
    }
  });

  // Amend commit
  ipcMain.handle('git-commit-amend', async (event, { projectPath, message }) => {
    try {
      sendFeaturePing('git:commit');
      return await gitAmendCommit(projectPath, message);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Check if rebase in progress
  ipcMain.handle('git-rebase-in-progress', async (event, { projectPath }) => {
    try {
      return await isRebaseInProgress(projectPath);
    } catch (err) {
      return false;
    }
  });

  // Git reset
  ipcMain.handle('git-reset', async (event, { projectPath, mode, target }) => {
    try {
      return await gitReset(projectPath, mode, target);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Search commit history
  ipcMain.handle('git-search-history', async (event, { projectPath, grep, pickaxe, skip, limit, branch, allBranches }) => {
    try {
      return await searchCommitHistory(projectPath, { grep, pickaxe, skip, limit, branch, allBranches });
    } catch (err) {
      return [];
    }
  });

  // Add remote
  ipcMain.handle('git-remote-add', async (event, { projectPath, name, url }) => {
    if (!name || !url) return { success: false, error: 'Name and URL required' };
    try {
      return await addRemote(projectPath, name, url);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Remove remote
  ipcMain.handle('git-remote-remove', async (event, { projectPath, name }) => {
    if (!name) return { success: false, error: 'Remote name required' };
    try {
      return await removeRemote(projectPath, name);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========== WORKTREES ==========

  // List worktrees
  ipcMain.handle('git-worktree-list', async (event, { projectPath }) => {
    try {
      const worktrees = await getWorktrees(projectPath);
      return { success: true, worktrees };
    } catch (err) {
      return { success: false, error: err.message, worktrees: [] };
    }
  });

  // Create worktree
  ipcMain.handle('git-worktree-create', async (event, { projectPath, worktreePath, branch, newBranch, startPoint }) => {
    try {
      sendFeaturePing('worktree:create');
      return await createWorktree(projectPath, worktreePath, { branch, newBranch, startPoint });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Remove worktree
  ipcMain.handle('git-worktree-remove', async (event, { projectPath, worktreePath, force }) => {
    try {
      return await removeWorktree(projectPath, worktreePath, force);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Lock worktree
  ipcMain.handle('git-worktree-lock', async (event, { projectPath, worktreePath, reason }) => {
    try {
      return await lockWorktree(projectPath, worktreePath, reason);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Unlock worktree
  ipcMain.handle('git-worktree-unlock', async (event, { projectPath, worktreePath }) => {
    try {
      return await unlockWorktree(projectPath, worktreePath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Prune stale worktrees
  ipcMain.handle('git-worktree-prune', async (event, { projectPath }) => {
    try {
      return await pruneWorktrees(projectPath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Detect if path is a worktree
  ipcMain.handle('git-worktree-detect', async (event, { projectPath }) => {
    try {
      return await detectWorktree(projectPath);
    } catch (err) {
      return { isWorktree: false };
    }
  });

  // Diff between worktree branches
  ipcMain.handle('git-worktree-diff', async (event, { projectPath, branch1, branch2, filePath }) => {
    try {
      const diff = await diffWorktreeBranches(projectPath, branch1, branch2, filePath);
      return { success: true, diff };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Diff stats (file list with status, additions, deletions) between worktree branches
  ipcMain.handle('git-worktree-diff-stats', async (event, { projectPath, branch1, branch2 }) => {
    try {
      const files = await diffWorktreeBranchesWithStats(projectPath, branch1, branch2);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerGitHandlers };
