/**
 * TerminalSessionService
 * Persists and restores terminal sessions across app restarts.
 * Phase 04: Basic terminal tab persistence
 * Phase 06: Claude session ID capture + resume
 */

const { fs, path } = window.electron_nodeModules;

// Debounce timer for saves
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 2000;

/**
 * Get the session data file path.
 */
function getSessionFilePath() {
  const { dataDir } = require('../utils/paths');
  return path.join(dataDir, 'terminal-sessions.json');
}

/**
 * Load session data from disk.
 * @returns {Object|null} Session data or null if not available/disabled
 */
function loadSessionData() {
  try {
    const { getSetting } = require('../state/settings.state');
    if (!getSetting('restoreTerminalSessions')) return null;

    const filePath = getSessionFilePath();
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    // Validate structure
    if (!data || typeof data !== 'object' || !data.projects) return null;

    return data;
  } catch (e) {
    console.error('[TerminalSessionService] Error loading session data:', e);
    return null;
  }
}

/**
 * Save terminal sessions to disk (debounced).
 */
function saveTerminalSessions() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTerminalSessionsImmediate();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Save terminal sessions to disk immediately.
 */
function saveTerminalSessionsImmediate() {
  clearTimeout(saveTimer);
  try {
    const { getSetting } = require('../state/settings.state');
    if (!getSetting('restoreTerminalSessions')) return;

    const { terminalsState } = require('../state/terminals.state');
    const { projectsState } = require('../state/projects.state');

    const terminals = terminalsState.get().terminals;
    const activeTerminalId = terminalsState.get().activeTerminal;
    const projects = projectsState.get().projects;
    const selectedFilter = projectsState.get().selectedProjectFilter;

    // Group terminals by project
    const projectSessions = {};

    for (const [id, td] of terminals) {
      if (!td.project?.id) continue;

      const projectId = td.project.id;
      if (!projectSessions[projectId]) {
        projectSessions[projectId] = { tabs: [], activeCwd: null };
      }

      const tab = {
        cwd: td.cwd || td.project.path,
        isBasic: td.isBasic || false,
        mode: td.mode || 'terminal',
        claudeSessionId: td.claudeSessionId || null,
      };

      projectSessions[projectId].tabs.push(tab);

      // Track active terminal's cwd
      if (id === activeTerminalId) {
        projectSessions[projectId].activeCwd = tab.cwd;
      }
    }

    // Determine last opened project
    let lastOpenedProjectId = null;
    if (selectedFilter !== null && selectedFilter !== undefined && projects[selectedFilter]) {
      lastOpenedProjectId = projects[selectedFilter].id;
    }

    const sessionData = {
      version: 1,
      savedAt: new Date().toISOString(),
      lastOpenedProjectId,
      projects: projectSessions,
    };

    const filePath = getSessionFilePath();
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(sessionData, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.error('[TerminalSessionService] Error saving session data:', e);
  }
}

/**
 * Clear saved sessions for a specific project.
 * @param {string} projectId
 */
function clearProjectSessions(projectId) {
  try {
    const filePath = getSessionFilePath();
    if (!fs.existsSync(filePath)) return;

    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.projects && data.projects[projectId]) {
      delete data.projects[projectId];
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('[TerminalSessionService] Error clearing project sessions:', e);
  }
}

/**
 * Clear all session data (e.g., when feature is disabled).
 */
function clearAllSessions() {
  try {
    const filePath = getSessionFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('[TerminalSessionService] Error clearing all sessions:', e);
  }
}

module.exports = {
  loadSessionData,
  saveTerminalSessions,
  clearProjectSessions,
  clearAllSessions,
};
