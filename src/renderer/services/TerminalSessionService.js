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

// When true, saveTerminalSessionsImmediate preserves existing explorer state from disk
// instead of overwriting with live getState() — used during terminal restore loop on cold start
let _skipExplorerCapture = false;

function setSkipExplorerCapture(value) {
  _skipExplorerCapture = value;
}

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

    // Group terminals by project, using DOM tab order (reflects drag-and-drop reordering)
    const projectSessions = {};
    // Iterate all panes in order to capture full tab sequence
    const PaneManager = require('../ui/components/PaneManager');
    const paneOrder = PaneManager.getPaneOrder();
    const allTabElements = [];
    for (const paneId of paneOrder) {
      const tabsEl = PaneManager.getTabsContainer(paneId);
      if (tabsEl) {
        allTabElements.push(...tabsEl.querySelectorAll('.terminal-tab'));
      }
    }
    const orderedIds = Array.from(allTabElements).map(el => el.dataset.id);

    for (const id of orderedIds) {
      const td = terminals.get(id) || terminals.get(Number(id));
      if (!td || !td.project?.id) continue;
      // Skip project-type consoles (fivem, webapp, api, etc.) — they can't be restored properly
      if (td.type && td.type !== 'terminal') continue;

      const projectId = td.project.id;
      if (!projectSessions[projectId]) {
        projectSessions[projectId] = { tabs: [], activeCwd: null, activeTabIndex: null };
      }

      let tab;
      if (td.type === 'file') {
        tab = {
          type: 'file',
          filePath: td.filePath,
          name: td.name || null,
        };
      } else {
        tab = {
          cwd: td.cwd || td.project.path,
          isBasic: td.isBasic || false,
          mode: td.mode || 'terminal',
          claudeSessionId: td.claudeSessionId || null,
          name: td.name || null,
          ...(td.cliTool ? { cliTool: td.cliTool } : {}),
        };
      }

      projectSessions[projectId].tabs.push(tab);

      // Track active tab index (works for both terminal and file tabs)
      if (id === activeTerminalId) {
        projectSessions[projectId].activeTabIndex = projectSessions[projectId].tabs.length - 1;
        // Keep activeCwd for backward compat with terminal tabs
        if (td.type !== 'file') {
          projectSessions[projectId].activeCwd = tab.cwd;
        }
      }
    }

    // Add pane layout information per project (multi-pane only)
    if (paneOrder.length > 1) {
      for (const [projectId, session] of Object.entries(projectSessions)) {
        const paneDataArr = [];
        let globalTabIdx = 0;

        for (const pId of paneOrder) {
          const tabsEl = PaneManager.getTabsContainer(pId);
          if (!tabsEl) continue;

          const paneTabIndices = [];
          let paneActiveTabIndex = null;
          const paneActiveTab = PaneManager.getPaneActiveTab(pId);

          tabsEl.querySelectorAll('.terminal-tab').forEach(tabEl => {
            const termId = tabEl.dataset.id;
            const td = terminals.get(termId) || terminals.get(Number(termId));
            if (!td || td.project?.id !== projectId) return;

            // NOTE: Do NOT skip tabs with display:none — those are just filter-hidden
            // and must still be saved. Skipping them would cause data loss on restore.

            paneTabIndices.push(globalTabIdx);
            if (String(termId) === String(paneActiveTab)) {
              paneActiveTabIndex = paneTabIndices.length - 1;
            }
            globalTabIdx++;
          });

          if (paneTabIndices.length > 0) {
            paneDataArr.push({
              tabIndices: paneTabIndices,
              activeTabIndex: paneActiveTabIndex ?? 0
            });
          }
        }

        if (paneDataArr.length > 1) {
          session.paneLayout = {
            count: paneDataArr.length,
            activePane: PaneManager.getActivePaneIndex(),
            panes: paneDataArr
          };
        }
        // If only 1 pane has tabs for this project, omit paneLayout (backward compat)
      }
    }

    // Merge existing explorer state from disk (preserve state for projects not currently active)
    const existingData = loadSessionData();
    for (const [pid, existing] of Object.entries((existingData && existingData.projects) || {})) {
      if (existing.explorer) {
        if (!projectSessions[pid]) {
          projectSessions[pid] = { tabs: [], activeCwd: null };
        }
        projectSessions[pid].explorer = existing.explorer;
      }
    }

    // Override current project's explorer state with live data
    const currentProject = (selectedFilter !== null && selectedFilter !== undefined && projects[selectedFilter])
      ? projects[selectedFilter] : null;

    if (currentProject && !_skipExplorerCapture) {
      if (!projectSessions[currentProject.id]) {
        projectSessions[currentProject.id] = { tabs: [], activeCwd: null };
      }
      try {
        const FileExplorer = require('../ui/components/FileExplorer');
        projectSessions[currentProject.id].explorer = FileExplorer.getState();
      } catch (e) {
        // FileExplorer not initialized yet — skip
      }
    }

    // Determine last opened project
    const lastOpenedProjectId = currentProject ? currentProject.id : null;

    const sessionData = {
      version: 2,
      savedAt: new Date().toISOString(),
      lastOpenedProjectId,
      projects: projectSessions,
    };

    const filePath = getSessionFilePath();
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(sessionData, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);

    // Write debug dump alongside save (dev mode only)
    if (window.electron_api?.lifecycle?.isDev) {
      _dumpSessionDebugFromData(sessionData, projects);
    }
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

/**
 * Write a debug markdown file from in-memory session data + projects array.
 * Called inline after every save (dev mode only) so it always reflects the exact data written.
 */
function _dumpSessionDebugFromData(data, projects) {
  try {
    if (!data || !data.projects) return;

    const lines = [`# Session Debug Dump`, `> ${data.savedAt}`, ''];

    for (const [projectId, session] of Object.entries(data.projects)) {
      const project = Array.isArray(projects)
        ? projects.find(p => p.id === projectId)
        : projects[projectId];
      const projectName = (project && project.name) || projectId;

      lines.push(`## ${projectName}`);
      lines.push('');

      const tabs = session.tabs || [];
      const layout = session.paneLayout;

      if (layout && layout.panes && layout.panes.length > 1) {
        // Multi-pane: build columns
        const panes = layout.panes;
        const headers = panes.map((_, i) => `Pane ${i + 1}${i === layout.activePane ? ' *' : ''}`);
        const nameRows = panes.map(p => p.tabIndices.map(idx => tabs[idx]?.name || `Tab ${idx}`).join(' | '));
        const idRows = panes.map(p => p.tabIndices.map(idx => {
          const t = tabs[idx];
          return t?.claudeSessionId ? t.claudeSessionId.slice(0, 8) : (t?.type === 'file' ? 'file' : '—');
        }).join(' | '));

        const colWidths = panes.map((_, i) => Math.max(headers[i].length, nameRows[i].length, idRows[i].length));
        const pad = (str, w) => str + ' '.repeat(Math.max(0, w - str.length));
        lines.push('```');
        lines.push(colWidths.map((w, i) => pad(headers[i], w)).join('   '));
        lines.push(colWidths.map(w => '-'.repeat(w)).join('   '));
        lines.push(colWidths.map((w, i) => pad(nameRows[i], w)).join('   '));
        lines.push(colWidths.map((w, i) => pad(idRows[i], w)).join('   '));
        lines.push('```');
      } else {
        // Single pane
        lines.push('```');
        lines.push('Pane 1');
        lines.push('-'.repeat(40));
        lines.push(tabs.map(t => t.name || 'unnamed').join(' | '));
        lines.push(tabs.map(t => t.claudeSessionId ? t.claudeSessionId.slice(0, 8) : (t.type === 'file' ? 'file' : '—')).join(' | '));
        lines.push('```');
      }
      lines.push('');
    }

    const { dataDir } = require('../utils/paths');
    const outPath = path.join(dataDir, 'session-debug.md');
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  } catch (e) {
    console.error('[TerminalSessionService] Error writing debug dump:', e);
  }
}

module.exports = {
  loadSessionData,
  saveTerminalSessions,
  saveTerminalSessionsImmediate,
  clearProjectSessions,
  clearAllSessions,
  setSkipExplorerCapture,
};
