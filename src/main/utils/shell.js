/**
 * Shell Utilities
 * Cross-platform shell detection for PTY spawning
 */

/**
 * Get the appropriate shell for the current platform
 * @returns {{ path: string, args: string[] }}
 */
function getShell() {
  if (process.platform === 'win32') {
    return { path: 'cmd.exe', args: [] };
  }
  // Prefer $SHELL env var (set by the user's login shell), fall back to known shells
  if (process.env.SHELL && require('fs').existsSync(process.env.SHELL)) {
    return { path: process.env.SHELL, args: [] };
  }
  for (const s of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (require('fs').existsSync(s)) return { path: s, args: [] };
  }
  return { path: '/bin/sh', args: [] };
}

/**
 * Get the shell prompt detection pattern
 * Used to detect when a shell is ready for input
 * @returns {string|RegExp}
 */
function getShellPromptPattern() {
  if (process.platform === 'win32') return '>';
  return /[$#%]\s*$/;
}

/**
 * Test if output matches the shell prompt pattern
 * @param {string} output
 * @returns {boolean}
 */
function matchesShellPrompt(output) {
  const pattern = getShellPromptPattern();
  if (typeof pattern === 'string') {
    return output.includes(pattern);
  }
  return pattern.test(output);
}

module.exports = { getShell, getShellPromptPattern, matchesShellPrompt };
