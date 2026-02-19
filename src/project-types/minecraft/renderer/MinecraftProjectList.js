/**
 * Minecraft ProjectList Module
 * Provides sidebar buttons, icons, status indicators for Minecraft projects
 */

const { t } = require('../../../renderer/i18n');

/**
 * Get primary action buttons for the sidebar
 * @param {Object} ctx - { project, projectIndex, minecraftStatus, isRunning, isStarting }
 * @returns {string} HTML
 */
function getSidebarButtons(ctx) {
  const { project, isRunning, isStarting } = ctx;
  if (isRunning || isStarting) {
    return `
      <button class="btn-action-icon btn-minecraft-console" data-project-id="${project.id}" title="${t('minecraft.serverConsole')}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10z"/></svg>
      </button>
      <button class="btn-action-primary btn-minecraft-stop" data-project-id="${project.id}" title="${t('minecraft.stopServer')}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
      </button>`;
  }
  return `
    <button class="btn-action-primary btn-minecraft-start" data-project-id="${project.id}" title="${t('minecraft.startServer')}">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>`;
}

/**
 * Get project icon SVG for Minecraft
 * @param {Object} ctx - { project, projectColor }
 * @returns {string} HTML
 */
function getProjectIcon(ctx) {
  const { projectColor } = ctx;
  const iconColorStyle = projectColor ? `style="color: ${projectColor}"` : '';
  return `<svg viewBox="0 0 24 24" fill="currentColor" class="minecraft-icon" ${iconColorStyle}><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>`;
}

/**
 * Get status indicator dot
 * @param {Object} ctx - { minecraftStatus }
 * @returns {string} HTML
 */
function getStatusIndicator(ctx) {
  const { minecraftStatus } = ctx;
  const statusText = minecraftStatus === 'stopped' ? t('minecraft.stopped')
    : minecraftStatus === 'starting' ? t('minecraft.starting')
    : t('minecraft.running');
  return `<span class="minecraft-status-dot ${minecraftStatus}" title="${statusText}"></span>`;
}

/**
 * Get CSS class for project item
 * @returns {string}
 */
function getProjectItemClass() {
  return 'minecraft-project';
}

/**
 * Get additional menu items for the more-actions menu
 * @param {Object} ctx - { project }
 * @returns {string} HTML
 */
function getMenuItems(ctx) {
  return '';
}

/**
 * Get dashboard project icon
 * @returns {string} SVG HTML
 */
function getDashboardIcon() {
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>';
}

/**
 * Bind sidebar event handlers for Minecraft buttons
 * @param {HTMLElement} list - The project list container
 * @param {Object} cbs - { onStartMinecraft, onStopMinecraft, onOpenMinecraftConsole }
 */
function bindSidebarEvents(list, cbs) {
  list.querySelectorAll('.btn-minecraft-start').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (cbs.onStartMinecraft) cbs.onStartMinecraft(btn.dataset.projectId);
    };
  });
  list.querySelectorAll('.btn-minecraft-stop').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (cbs.onStopMinecraft) cbs.onStopMinecraft(btn.dataset.projectId);
    };
  });
  list.querySelectorAll('.btn-minecraft-console').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (cbs.onOpenMinecraftConsole) cbs.onOpenMinecraftConsole(btn.dataset.projectId);
    };
  });
}

module.exports = {
  getSidebarButtons,
  getProjectIcon,
  getStatusIndicator,
  getProjectItemClass,
  getMenuItems,
  getDashboardIcon,
  bindSidebarEvents
};
