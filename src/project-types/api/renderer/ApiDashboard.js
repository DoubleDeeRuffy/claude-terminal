/**
 * API Dashboard hooks
 * Badge and stats for the dashboard
 */

const { getApiServer } = require('./ApiState');

function getDashboardBadge(project) {
  return {
    text: 'API',
    cssClass: 'api'
  };
}

function getDashboardStats(ctx) {
  const { projectIndex, t } = ctx;
  if (projectIndex === undefined || projectIndex === null) return '';

  const server = getApiServer(projectIndex);
  const status = server.status;

  if (status === 'stopped') return '';

  const safePort = server.port ? parseInt(server.port, 10) : null;
  const safeStatus = ['running', 'starting', 'stopped'].includes(status) ? status : 'stopped';
  const statusLabel = safeStatus === 'running'
    ? (safePort ? `<span class="api-url-link">localhost:${safePort}</span>` : t('api.running'))
    : t('api.starting');

  return `
    <div class="dashboard-quick-stat api-stat">
      <span class="api-status-dot ${safeStatus}"></span>
      <span>${t('api.server')}: ${statusLabel}</span>
    </div>
  `;
}

module.exports = { getDashboardBadge, getDashboardStats };
