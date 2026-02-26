/**
 * .NET / C# Project Type
 * Dashboard badge and stats for .NET projects (ASP.NET, Blazor, Console, etc.)
 */

const { createType } = require('../base-type');

const DOTNET_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.5 14.5v-9l7 4.5-7 4.5zM6.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/></svg>';

module.exports = createType({
  id: 'dotnet',
  nameKey: 'newProject.types.dotnet',
  descKey: 'newProject.types.dotnetDesc',
  category: 'general',
  icon: DOTNET_SVG,

  // Main process (no main-process code needed)
  mainModule: () => null,

  initialize: () => {},
  cleanup: () => {},

  // ProjectList (sidebar)
  getProjectIcon: () => {
    return require('./renderer/DotNetDashboard').getProjectIcon();
  },

  getDashboardIcon: () => {
    return require('./renderer/DotNetDashboard').getProjectIcon();
  },

  // Dashboard
  getDashboardBadge: (project) => {
    return require('./renderer/DotNetDashboard').getDashboardBadge(project);
  },

  getDashboardStats: (ctx) => {
    return require('./renderer/DotNetDashboard').getDashboardStats(ctx);
  },

  // Assets
  getStyles: () => `
/* ========== .NET Project Type Styles ========== */
.dashboard-project-type.dotnet { background: rgba(81,43,212,0.15); color: #7c6af7; }
.project-type-icon.dotnet svg, .wizard-type-badge-icon.dotnet svg { color: #7c6af7; }
.project-item.dotnet-project .project-name svg { color: #7c6af7; width: 14px; height: 14px; margin-right: 6px; flex-shrink: 0; }
.dotnet-stat { display: flex; align-items: center; gap: 6px; font-size: var(--font-xs); }
`,

  getTranslations: () => {
    try {
      return {
        en: require('./i18n/en.json'),
        fr: require('./i18n/fr.json')
      };
    } catch (e) {
      return null;
    }
  },

  getPreloadBridge: () => null
});
