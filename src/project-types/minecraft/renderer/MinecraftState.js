/**
 * Minecraft State Module
 * Manages Minecraft server state in the renderer
 */

const { State } = require('../../../renderer/state/State');

// Initial state
const initialState = {
  minecraftServers: new Map() // projectIndex -> { status, logs[], playerCount }
};

const minecraftState = new State(initialState);

/**
 * Get Minecraft server state
 * @param {number} projectIndex
 * @returns {Object}
 */
function getMinecraftServer(projectIndex) {
  return minecraftState.get().minecraftServers.get(projectIndex) || {
    status: 'stopped',
    logs: [],
    playerCount: 0
  };
}

/**
 * Set Minecraft server status
 * @param {number} projectIndex
 * @param {string} status - 'stopped' | 'starting' | 'running'
 */
function setMinecraftServerStatus(projectIndex, status) {
  const servers = minecraftState.get().minecraftServers;
  const current = servers.get(projectIndex) || { status: 'stopped', logs: [], playerCount: 0 };
  servers.set(projectIndex, { ...current, status });
  minecraftState.setProp('minecraftServers', servers);
}

/**
 * Set Minecraft player count
 * @param {number} projectIndex
 * @param {number} count
 */
function setMinecraftPlayerCount(projectIndex, count) {
  const servers = minecraftState.get().minecraftServers;
  const current = servers.get(projectIndex) || { status: 'stopped', logs: [], playerCount: 0 };
  servers.set(projectIndex, { ...current, playerCount: Math.max(0, count) });
  minecraftState.setProp('minecraftServers', servers);
}

/**
 * Add log data to Minecraft server
 * @param {number} projectIndex
 * @param {string} data
 */
function addMinecraftLog(projectIndex, data) {
  const servers = minecraftState.get().minecraftServers;
  const current = servers.get(projectIndex) || { status: 'stopped', logs: [], playerCount: 0 };
  const logs = [...current.logs, data];

  // Keep last 10000 characters
  let combinedLogs = logs.join('');
  if (combinedLogs.length > 10000) {
    combinedLogs = combinedLogs.slice(-10000);
  }

  servers.set(projectIndex, { ...current, logs: [combinedLogs] });
  minecraftState.setProp('minecraftServers', servers);
}

/**
 * Clear Minecraft server logs
 * @param {number} projectIndex
 */
function clearMinecraftLogs(projectIndex) {
  const servers = minecraftState.get().minecraftServers;
  const current = servers.get(projectIndex);
  if (current) {
    servers.set(projectIndex, { ...current, logs: [] });
    minecraftState.setProp('minecraftServers', servers);
  }
}

/**
 * Initialize Minecraft server tracking
 * @param {number} projectIndex
 */
function initMinecraftServer(projectIndex) {
  const servers = minecraftState.get().minecraftServers;
  if (!servers.has(projectIndex)) {
    servers.set(projectIndex, { status: 'stopped', logs: [], playerCount: 0 });
    minecraftState.setProp('minecraftServers', servers);
  }
}

/**
 * Remove Minecraft server tracking
 * @param {number} projectIndex
 */
function removeMinecraftServer(projectIndex) {
  const servers = minecraftState.get().minecraftServers;
  servers.delete(projectIndex);
  minecraftState.setProp('minecraftServers', servers);
}

module.exports = {
  minecraftState,
  getMinecraftServer,
  setMinecraftServerStatus,
  setMinecraftPlayerCount,
  addMinecraftLog,
  clearMinecraftLogs,
  initMinecraftServer,
  removeMinecraftServer
};
