/**
 * Renderer Process Bootstrap
 * Entry point for the renderer process modules
 */

// Utils
const utils = require('./utils');

// State
const state = require('./state');

// Services
const services = require('./services');

// UI Components
const ui = require('./ui');

// Features
const features = require('./features');

// Internationalization
const i18n = require('./i18n');

// Event system
const events = require('./events');

/**
 * Initialize all renderer modules
 */
async function initialize() {
  // Tag platform on body for CSS targeting (macOS traffic lights, etc.)
  const platform = window.electron_nodeModules?.process?.platform || 'win32';
  document.body.classList.add(`platform-${platform}`);

  // Ensure directories exist
  utils.ensureDirectories();

  // Initialize state
  await state.initializeState();

  // Initialize i18n with saved language or auto-detect
  const savedLanguage = state.getSetting('language');
  i18n.initI18n(savedLanguage);

  // Initialize settings (applies accent color, etc.)
  await services.SettingsService.initializeSettings();

  // Terminal IPC listeners are handled by TerminalManager's centralized dispatcher

  services.McpService.registerMcpListeners(
    // onOutput callback
    (id, type, data) => {
      // MCP output received
    },
    // onExit callback
    (id, code) => {
      // MCP process exited
    }
  );

  // Register WebApp listeners
  const { registerWebAppListeners } = require('../project-types/webapp/renderer/WebAppRendererService');
  registerWebAppListeners(
    (projectIndex, data) => {},
    (projectIndex, code) => {
      // WebApp dev server stopped - re-render sidebar
    }
  );

  // API listeners are registered in renderer.js (same pattern as webapp)

  services.FivemService.registerFivemListeners(
    // onData callback
    (projectIndex, data) => {
      // FiveM output received
    },
    // onExit callback
    (projectIndex, code) => {
      // FiveM server stopped
    },
    // onError callback
    (projectIndex, error) => {
      // FiveM error detected - show debug button
      ui.TerminalManager.showTypeErrorOverlay(projectIndex, error);
    }
  );

  // Initialize Claude event bus and provider
  events.initClaudeEvents();

  // Show telemetry consent modal for existing users (one-time)
  showTelemetryConsentIfNeeded();

  // Load disk-cached dashboard data then refresh from APIs in background
  services.DashboardService.loadAllDiskCaches().then(() => {
    setTimeout(() => {
      services.DashboardService.preloadAllProjects();
    }, 500);
  }).catch(e => {
    console.error('Error loading disk caches:', e);
    // Still try to preload even if disk cache fails
    setTimeout(() => {
      services.DashboardService.preloadAllProjects();
    }, 500);
  });

}

/**
 * Show telemetry consent modal for existing users who haven't been asked yet.
 * Only shows once — sets telemetryConsentShown = true regardless of choice.
 */
function showTelemetryConsentIfNeeded() {
  const settings = state.getSettings();
  if (settings.telemetryConsentShown) return;

  // Delay slightly so the UI is fully rendered
  setTimeout(() => {
    const { t } = i18n;
    const { createModal, showModal, closeModal } = ui.Modal;

    const modal = createModal({
      id: 'telemetry-consent-modal',
      title: t('telemetry.consentTitle'),
      size: 'medium',
      content: `
        <div style="padding: 4px 0;">
          <p style="margin-bottom: 16px; line-height: 1.6; color: var(--text-secondary); font-size: 13px;">
            ${t('telemetry.consentDescription')}
          </p>
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <div style="flex:1; padding: 12px 14px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 10px;">
              <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; color: var(--accent);">
                ${t('telemetry.whatWeCollect')}
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); padding: 2px 0;">&#10003; ${t('telemetry.collect1')}</div>
              <div style="font-size: 12px; color: var(--text-secondary); padding: 2px 0;">&#10003; ${t('telemetry.collect2')}</div>
              <div style="font-size: 12px; color: var(--text-secondary); padding: 2px 0;">&#10003; ${t('telemetry.collect3')}</div>
            </div>
            <div style="flex:1; padding: 12px 14px; background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.2); border-radius: 10px;">
              <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; color: #22c55e;">
                ${t('telemetry.whatWeDoNotCollect')}
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); padding: 2px 0;">&#10007; ${t('telemetry.notCollect1')}</div>
              <div style="font-size: 12px; color: var(--text-secondary); padding: 2px 0;">&#10007; ${t('telemetry.notCollect2')}</div>
              <div style="font-size: 12px; color: var(--text-secondary); padding: 2px 0;">&#10007; ${t('telemetry.notCollect3')}</div>
            </div>
          </div>
          <p style="font-size: 12px; color: var(--text-muted);">
            ${t('telemetry.consentChangeSettings')}
          </p>
        </div>
      `,
      buttons: [
        {
          label: t('telemetry.consentDecline'),
          action: 'decline',
          onClick: (m) => {
            state.setSetting('telemetryConsentShown', true);
            closeModal(m);
          }
        },
        {
          label: t('telemetry.consentAccept'),
          action: 'accept',
          primary: true,
          onClick: (m) => {
            state.setSetting('telemetryEnabled', true);
            state.setSetting('telemetryConsentShown', true);
            closeModal(m);
          }
        }
      ]
    });

    showModal(modal);
  }, 2000);
}

// Export everything for use in renderer.js
module.exports = {
  // Utils
  utils,
  ...utils,

  // State
  state,
  ...state,

  // Services
  services,
  ...services,

  // UI
  ui,
  ...ui,

  // Features
  features,
  ...features,

  // i18n
  i18n,
  ...i18n,

  // Events
  events,
  ...events,

  // Initialize function
  initialize
};
