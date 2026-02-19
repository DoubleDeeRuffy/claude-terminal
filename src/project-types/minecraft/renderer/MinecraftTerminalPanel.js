/**
 * Minecraft Terminal Panel Module
 * Provides the console container for Minecraft server output
 */

/**
 * Get wrapper HTML for the Minecraft console view
 * @returns {string} HTML
 */
function getWrapperHtml() {
  return '<div class="minecraft-console-view" style="width:100%;height:100%;"></div>';
}

/**
 * Setup the panel after mount
 * @param {HTMLElement} wrapper
 * @param {string} terminalId
 * @param {number} projectIndex
 * @param {Object} project
 * @param {Object} deps
 */
function setupPanel(wrapper, terminalId, projectIndex, project, deps) {
  const termData = deps.getTerminal ? deps.getTerminal(terminalId) : null;
  if (termData) {
    setTimeout(() => termData.fitAddon.fit(), 50);
  }
}

module.exports = {
  getWrapperHtml,
  setupPanel
};
