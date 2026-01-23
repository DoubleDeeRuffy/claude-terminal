/**
 * Paths Utilities
 * Centralized path definitions for the application
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// Base directories
const homeDir = os.homedir();
const dataDir = path.join(homeDir, '.claude-terminal');
const claudeDir = path.join(homeDir, '.claude');

// Application data files
const projectsFile = path.join(dataDir, 'projects.json');
const settingsFile = path.join(dataDir, 'settings.json');
const legacyMcpsFile = path.join(dataDir, 'mcps.json');

// Claude configuration files
const claudeSettingsFile = path.join(claudeDir, 'settings.json');
const claudeConfigFile = path.join(homeDir, '.claude.json'); // Main Claude Code config with MCP servers
const skillsDir = path.join(claudeDir, 'skills');
const agentsDir = path.join(claudeDir, 'agents');

/**
 * Ensure all required directories exist
 */
function ensureDirectories() {
  [dataDir, skillsDir, agentsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Get the application assets directory
 * @returns {string}
 */
function getAssetsDir() {
  // In development: __dirname/../../../assets
  // In production: resources/assets
  const devPath = path.join(__dirname, '..', '..', '..', 'assets');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return path.join(process.resourcesPath, 'assets');
}

module.exports = {
  homeDir,
  dataDir,
  claudeDir,
  projectsFile,
  settingsFile,
  legacyMcpsFile,
  claudeSettingsFile,
  claudeConfigFile,
  skillsDir,
  agentsDir,
  ensureDirectories,
  getAssetsDir
};
