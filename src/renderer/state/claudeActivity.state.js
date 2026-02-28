/**
 * Claude Activity State Module
 * Tracks whether Claude is actively working in each terminal.
 * Runtime only — no persistence, no sessions saved.
 */

// Per-terminal activity: Map<terminalId, { lastActivity: number }>
const activityMap = new Map();

const CLAUDE_IDLE_TIMEOUT = 15 * 1000; // 15 seconds fixed
const THROTTLE_MS = 1000; // 1 second throttle per terminal

/**
 * Record Claude activity for a terminal (output, hooks, streaming).
 * @param {number} terminalId
 */
function claudeHeartbeat(terminalId) {
  if (terminalId == null) return;
  const now = Date.now();
  const existing = activityMap.get(terminalId);
  if (existing && now - existing.lastActivity < THROTTLE_MS) return;
  activityMap.set(terminalId, { lastActivity: now });
}

/**
 * Check if Claude is actively working in a terminal.
 * @param {number} terminalId
 * @returns {boolean}
 */
function isClaudeActive(terminalId) {
  const entry = activityMap.get(terminalId);
  if (!entry) return false;
  return Date.now() - entry.lastActivity < CLAUDE_IDLE_TIMEOUT;
}

/**
 * Remove terminal from tracking (on terminal close).
 * @param {number} terminalId
 */
function removeClaudeTerminal(terminalId) {
  activityMap.delete(terminalId);
}

/**
 * Get full activity state for debugging/UI.
 * @returns {Map}
 */
function getClaudeActivityState() {
  return activityMap;
}

module.exports = {
  claudeHeartbeat,
  isClaudeActive,
  removeClaudeTerminal,
  getClaudeActivityState
};
