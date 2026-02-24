/**
 * TerminalSessionService
 * Persists terminal tab state to disk so sessions can be restored after app restart.
 * Only regular terminal tabs (mode === 'terminal') are serialized.
 */

const { fs, path } = window.electron_nodeModules;
const { dataDir } = require('../utils/paths');

const sessionsFile = path.join(dataDir, 'terminal-sessions.json');
const tmpSessionsFile = sessionsFile + '.tmp';

const DEFAULT_DATA = { lastOpenedProjectId: null, projects: {} };

// ── Debounce timer ──
let saveDebounceTimer = null;

// ── Internal helpers ──

/**
 * Perform atomic write of session data.
 * Writes to a .tmp file first, then renames — crash-resilient.
 * @param {Object} data
 */
function writeSessionsFile(data) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(tmpSessionsFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpSessionsFile, sessionsFile);
  } catch (e) {
    console.error('[TerminalSessionService] Failed to write sessions file:', e);
  }
}

// ── Public API ──

/**
 * Load persisted session data from disk.
 * Returns default structure if file is missing or corrupt.
 * @returns {{ lastOpenedProjectId: string|null, projects: Object }}
 */
function loadSessionData() {
  try {
    if (!fs.existsSync(sessionsFile)) {
      return { ...DEFAULT_DATA, projects: {} };
    }
    const raw = fs.readFileSync(sessionsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      lastOpenedProjectId: parsed.lastOpenedProjectId || null,
      projects: parsed.projects || {}
    };
  } catch (e) {
    console.error('[TerminalSessionService] Failed to load sessions file, using defaults:', e);
    return { ...DEFAULT_DATA, projects: {} };
  }
}

/**
 * Debounced (300ms) save of all current terminal tab state.
 * Only serializes tabs where mode === 'terminal' and project.id exists.
 * Called after every createTerminal / closeTerminal.
 */
function saveTerminalSessions() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(saveTerminalSessionsImmediate, 300);
}

/**
 * Performs the actual write — called by the debounced wrapper above.
 */
function saveTerminalSessionsImmediate() {
  try {
    const { terminalsState } = require('../state/terminals.state');
    const { projectsState } = require('../state/projects.state');

    const state = terminalsState.get();
    const { terminals, activeTerminal } = state;

    const projectsMap = {};

    terminals.forEach((termData) => {
      if (termData.mode !== 'terminal') return;
      if (!termData.project || !termData.project.id) return;

      const projectId = termData.project.id;
      const cwd = termData.cwd || termData.project.path;
      const isBasic = termData.isBasic === true;

      if (!projectsMap[projectId]) {
        projectsMap[projectId] = { tabs: [], activeCwd: null };
      }

      projectsMap[projectId].tabs.push({ cwd, isBasic });
    });

    // Set activeCwd for each project based on the currently active terminal
    if (activeTerminal !== null) {
      const activeTermData = terminals.get(activeTerminal);
      if (activeTermData && activeTermData.mode === 'terminal' && activeTermData.project?.id) {
        const pid = activeTermData.project.id;
        if (projectsMap[pid]) {
          projectsMap[pid].activeCwd = activeTermData.cwd || activeTermData.project.path;
        }
      }
    }

    const projectsStateData = projectsState.get();
    const idx = projectsStateData.selectedProjectFilter;
    const currentProject = (idx !== null && idx !== undefined) ? projectsStateData.projects[idx] : null;
    const lastOpenedProjectId = currentProject ? currentProject.id : null;

    const data = {
      lastOpenedProjectId,
      projects: projectsMap
    };

    writeSessionsFile(data);
  } catch (e) {
    console.error('[TerminalSessionService] saveTerminalSessionsImmediate failed:', e);
  }
}

/**
 * Remove all saved session data for a specific project.
 * Writes immediately (no debounce — deletion is infrequent).
 * @param {string} projectId
 */
function clearProjectSessions(projectId) {
  const data = loadSessionData();
  if (data.projects[projectId]) {
    delete data.projects[projectId];
    writeSessionsFile(data);
  }
}

/**
 * Trigger a debounced save that will capture the latest lastOpenedProjectId.
 * @param {string} projectId
 */
function updateLastOpenedProject(projectId) { // eslint-disable-line no-unused-vars
  saveTerminalSessions();
}

module.exports = {
  loadSessionData,
  saveTerminalSessions,
  saveTerminalSessionsImmediate,
  clearProjectSessions,
  updateLastOpenedProject
};
