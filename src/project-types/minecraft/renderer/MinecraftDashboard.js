/**
 * Minecraft Dashboard Module
 * Provides dashboard badge and quick stats for Minecraft projects
 */

const { t } = require('../../../renderer/i18n');

/**
 * Get dashboard type badge
 * @param {Object} project
 * @returns {Object|null} { text, cssClass }
 */
function getDashboardBadge(project) {
  return {
    text: t('dashboard.minecraftServer'),
    cssClass: 'minecraft'
  };
}

/**
 * Get dashboard quick stat HTML for Minecraft server status
 * @param {Object} ctx - { minecraftStatus, playerCount }
 * @returns {string} HTML
 */
function getDashboardStats(ctx) {
  const { minecraftStatus, playerCount } = ctx;
  const statusText = minecraftStatus === 'running' ? t('minecraft.running')
    : minecraftStatus === 'starting' ? t('minecraft.starting')
    : t('minecraft.stopped');

  const serverStat = `
    <div class="quick-stat ${minecraftStatus}">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>
      <span>${statusText}</span>
    </div>
  `;

  if (minecraftStatus !== 'running') return serverStat;

  const playerStat = `
    <div class="quick-stat">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      <span>${t('minecraft.players', { count: playerCount || 0 })}</span>
    </div>
  `;

  return serverStat + playerStat;
}

module.exports = {
  getDashboardBadge,
  getDashboardStats
};
