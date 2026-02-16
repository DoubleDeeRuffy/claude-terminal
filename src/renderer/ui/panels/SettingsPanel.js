/**
 * SettingsPanel
 * Full settings tab: general, claude, github, themes, shortcuts
 * Extracted from renderer.js
 */

const { escapeHtml } = require('../../utils');
const { t, setLanguage, getCurrentLanguage, getAvailableLanguages } = require('../../i18n');

let ctx = null;

function init(context) {
  ctx = context;
}

function switchToSettingsTab(initialSubTab = 'general') {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('btn-settings').classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-settings').classList.add('active');
  ctx.TimeTrackingDashboard.cleanup();
  renderSettingsTab(initialSubTab);
}

async function renderSettingsTab(initialTab = 'general') {
  const container = document.getElementById('tab-settings');
  const settings = ctx.settingsState.get();

  let launchAtStartup = false;
  try {
    launchAtStartup = await ctx.api.app.getLaunchAtStartup();
  } catch (e) {
    console.error('Error getting launch at startup:', e);
  }

  let githubStatus = { authenticated: false };
  try {
    githubStatus = await ctx.api.github.authStatus();
  } catch (e) {
    console.error('Error getting GitHub status:', e);
  }

  const availableLanguages = getAvailableLanguages();
  const currentLang = getCurrentLanguage();

  container.innerHTML = `
    <div class="settings-inline-wrapper">
      <div class="settings-tabs">
        <button class="settings-tab ${initialTab === 'general' ? 'active' : ''}" data-tab="general">${t('settings.tabGeneral')}</button>
        <button class="settings-tab ${initialTab === 'claude' ? 'active' : ''}" data-tab="claude">${t('settings.tabClaude')}</button>
        <button class="settings-tab ${initialTab === 'github' ? 'active' : ''}" data-tab="github">${t('settings.tabGitHub')}</button>
        <button class="settings-tab ${initialTab === 'themes' ? 'active' : ''}" data-tab="themes">${t('settings.tabThemes')}</button>
        <button class="settings-tab ${initialTab === 'shortcuts' ? 'active' : ''}" data-tab="shortcuts">${t('settings.tabShortcuts')}</button>
        ${(() => {
          const registry = require('../../../project-types/registry');
          const dynamicTabs = registry.collectAllSettingsFields();
          let tabsHtml = '';
          dynamicTabs.forEach((tabData, tabId) => {
            tabsHtml += `<button class="settings-tab ${initialTab === tabId ? 'active' : ''}" data-tab="${tabId}">${tabData.label}</button>`;
          });
          return tabsHtml;
        })()}
      </div>
      <div class="settings-content">
        <!-- General Tab -->
        <div class="settings-panel ${initialTab === 'general' ? 'active' : ''}" data-panel="general">
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.appearance')}</div>
            <div class="settings-card">
              <div class="settings-row">
                <div class="settings-label">
                  <div>${t('settings.language')}</div>
                  <div class="settings-desc">${t('settings.languageDesc')}</div>
                </div>
                <div class="settings-dropdown" id="language-dropdown" data-value="${currentLang}">
                  <div class="settings-dropdown-trigger">
                    <span>${availableLanguages.find(l => l.code === currentLang)?.name || currentLang}</span>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                  </div>
                  <div class="settings-dropdown-menu">
                    ${availableLanguages.map(lang =>
                      `<div class="settings-dropdown-option ${currentLang === lang.code ? 'selected' : ''}" data-value="${lang.code}">
                        <span class="dropdown-check"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
                        ${lang.name}
                      </div>`
                    ).join('')}
                  </div>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-label">
                  <div>${t('settings.accentColor')}</div>
                  <div class="settings-desc">${t('settings.accentColorDesc')}</div>
                </div>
              </div>
              <div class="color-picker">
                ${['#d97706', '#dc2626', '#db2777', '#9333ea', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#65a30d'].map(c =>
                  `<button class="color-swatch ${settings.accentColor === c ? 'selected' : ''}" style="background:${c}" data-color="${c}"></button>`
                ).join('')}
                <div class="color-swatch-custom ${!['#d97706', '#dc2626', '#db2777', '#9333ea', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#65a30d'].includes(settings.accentColor) ? 'selected' : ''}" style="background:${!['#d97706', '#dc2626', '#db2777', '#9333ea', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#65a30d'].includes(settings.accentColor) ? settings.accentColor : 'var(--bg-tertiary)'}">
                  <input type="color" id="custom-color-input" value="${settings.accentColor}" title="${t('settings.accentColor')}">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-label">
                  <div>${t('settings.terminalTheme')}</div>
                  <div class="settings-desc">${t('settings.terminalThemeDesc')}</div>
                </div>
                <button type="button" class="btn-outline" id="btn-go-themes">
                  ${ctx.TERMINAL_THEMES[settings.terminalTheme || 'claude']?.name || 'Claude'}
                </button>
              </div>
            </div>
          </div>
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.system')}</div>
            <div class="settings-card">
            <div class="settings-toggle-row">
              <div class="settings-toggle-label">
                <div>${t('settings.launchAtStartup')}</div>
                <div class="settings-toggle-desc">${t('settings.launchAtStartupDesc')}</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="launch-at-startup-toggle" ${launchAtStartup ? 'checked' : ''}>
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
            <div class="settings-toggle-row">
              <div class="settings-toggle-label">
                <div>${t('settings.compactProjects')}</div>
                <div class="settings-toggle-desc">${t('settings.compactProjectsDesc')}</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="compact-projects-toggle" ${settings.compactProjects !== false ? 'checked' : ''}>
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
            <div class="settings-toggle-row">
              <div class="settings-toggle-label">
                <div>${t('settings.reduceMotion')}</div>
                <div class="settings-toggle-desc">${t('settings.reduceMotionDesc')}</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="reduce-motion-toggle" ${settings.reduceMotion ? 'checked' : ''}>
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
            <div class="settings-toggle-row">
              <div class="settings-toggle-label">
                <div>${t('settings.aiCommitMessages')}</div>
                <div class="settings-toggle-desc">${t('settings.aiCommitMessagesDesc')}</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="ai-commit-toggle" ${settings.aiCommitMessages !== false ? 'checked' : ''}>
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <div>${t('settings.closeWindow')}</div>
                <div class="settings-desc">${t('settings.closeWindowDesc')}</div>
              </div>
              <div class="settings-dropdown" id="close-action-dropdown" data-value="${settings.closeAction || 'ask'}">
                <div class="settings-dropdown-trigger">
                  <span>${{'ask':t('settings.closeOptionAsk'),'minimize':t('settings.closeOptionMinimize'),'quit':t('settings.closeOptionQuit')}[settings.closeAction || 'ask']}</span>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                </div>
                <div class="settings-dropdown-menu">
                  ${[{v:'ask',l:t('settings.closeOptionAsk')},{v:'minimize',l:t('settings.closeOptionMinimize')},{v:'quit',l:t('settings.closeOptionQuit')}].map(o =>
                    `<div class="settings-dropdown-option ${(settings.closeAction || 'ask') === o.v ? 'selected' : ''}" data-value="${o.v}">
                      <span class="dropdown-check"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
                      ${o.l}
                    </div>`
                  ).join('')}
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <div>${t('settings.checkForUpdates') || 'Mises a jour'}</div>
                <div class="settings-desc">${t('settings.checkForUpdatesDesc') || 'Verifier si une nouvelle version est disponible'}</div>
              </div>
              <button type="button" class="btn-outline" id="btn-check-updates">
                ${t('settings.checkForUpdatesBtn') || 'Verifier'}
              </button>
            </div>
            </div>
          </div>
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.quickActionPresets') || 'Quick Action Presets'}</div>
            <div class="settings-card">
            <div class="settings-desc" style="margin-bottom: 10px; padding: 8px 16px 0;">${t('settings.quickActionPresetsDesc') || 'Presets personnalises affiches dans la configuration des actions rapides'}</div>
            <div class="custom-presets-list" id="custom-presets-list">
              ${(settings.customPresets || []).map((p, i) => `
                <div class="custom-preset-item" data-index="${i}">
                  <span class="custom-preset-icon">${ctx.QuickActions.QUICK_ACTION_ICONS[p.icon] || ctx.QuickActions.QUICK_ACTION_ICONS.play}</span>
                  <span class="custom-preset-name">${escapeHtml(p.name)}</span>
                  <code class="custom-preset-cmd">${escapeHtml(p.command)}</code>
                  <button class="custom-preset-delete" data-index="${i}" title="${t('common.delete') || 'Supprimer'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              `).join('') || `<div class="custom-presets-empty">${t('settings.noCustomPresets') || 'Aucun preset personnalise'}</div>`}
            </div>
            <div class="custom-preset-add" id="custom-preset-add-area">
              <div class="custom-preset-add-row" id="custom-preset-form" style="display:none;">
                <input type="text" id="new-preset-name" placeholder="${t('quickActions.namePlaceholder') || 'Nom'}" class="settings-input-sm">
                <input type="text" id="new-preset-command" placeholder="${t('quickActions.commandPlaceholder') || 'Commande'}" class="settings-input-sm" style="flex:2;">
                <select id="new-preset-icon" class="settings-select-sm">
                  ${Object.keys(ctx.QuickActions.QUICK_ACTION_ICONS).map(icon => `<option value="${icon}">${icon}</option>`).join('')}
                </select>
                <button class="btn-accent-sm" id="btn-save-preset">${t('common.save') || 'OK'}</button>
                <button class="btn-ghost-sm" id="btn-cancel-preset">${t('common.cancel') || 'Annuler'}</button>
              </div>
              <button class="quick-action-add-btn" id="btn-add-preset" style="width:100%;">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                <span>${t('settings.addPreset') || 'Ajouter un preset'}</span>
              </button>
            </div>
            </div>
          </div>
        </div>
        <!-- Claude Tab -->
        <div class="settings-panel ${initialTab === 'claude' ? 'active' : ''}" data-panel="claude">
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.executionMode')}</div>
            <div class="settings-card">
            <div class="execution-mode-selector">
              <div class="execution-mode-card ${!settings.skipPermissions ? 'selected' : ''}" data-mode="safe">
                <div class="execution-mode-icon safe">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
                </div>
                <div class="execution-mode-content">
                  <div class="execution-mode-title">${t('settings.modeSafe')}</div>
                  <div class="execution-mode-desc">${t('settings.modeSafeDesc')}</div>
                </div>
                <div class="execution-mode-check"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
              </div>
              <div class="execution-mode-card ${settings.skipPermissions ? 'selected' : ''}" data-mode="dangerous">
                <div class="execution-mode-icon dangerous">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
                </div>
                <div class="execution-mode-content">
                  <div class="execution-mode-title">${t('settings.modeAutonomous')}</div>
                  <div class="execution-mode-desc">${t('settings.modeAutonomousDesc')}</div>
                  <div class="execution-mode-flag">--dangerously-skip-permissions</div>
                </div>
                <div class="execution-mode-check"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
              </div>
            </div>
            <div class="settings-warning" id="dangerous-warning" style="display: ${settings.skipPermissions ? 'flex' : 'none'};">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
              <span>${t('settings.modeAutonomousWarning')}</span>
            </div>
            </div>
          </div>
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.defaultTerminalMode')}</div>
            <div class="settings-card">
            <div class="execution-mode-selector">
              <div class="execution-mode-card terminal-mode-card ${(settings.defaultTerminalMode || 'terminal') === 'terminal' ? 'selected' : ''}" data-terminal-mode="terminal">
                <div class="execution-mode-icon neutral">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v12zm-2-1h-6v-2h6v2zM7.5 17l-1.41-1.41L8.67 13l-2.59-2.59L7.5 9l4 4-4 4z"/></svg>
                </div>
                <div class="execution-mode-content">
                  <div class="execution-mode-title">${t('settings.modeTerminal')}</div>
                  <div class="execution-mode-desc">${t('settings.modeTerminalDesc')}</div>
                </div>
                <div class="execution-mode-check"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
              </div>
              <div class="execution-mode-card terminal-mode-card ${settings.defaultTerminalMode === 'chat' ? 'selected' : ''}" data-terminal-mode="chat">
                <div class="execution-mode-icon neutral">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                </div>
                <div class="execution-mode-content">
                  <div class="execution-mode-title">${t('settings.modeChat')}</div>
                  <div class="execution-mode-desc">${t('settings.modeChatDesc')}</div>
                </div>
                <div class="execution-mode-check"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
              </div>
            </div>
            </div>
          </div>
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.hooks.title') || 'Smart Hooks'}</div>
            <div class="settings-card">
            <div class="settings-toggle-row">
              <div class="settings-toggle-label">
                <div>${t('settings.hooks.enable') || 'Enable Smart Hooks'}</div>
                <div class="settings-toggle-desc">${t('settings.hooks.description') || 'Real-time insights from Claude Code (time tracking, notifications, dashboard stats)'}</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="hooks-enabled-toggle" ${settings.hooksEnabled ? 'checked' : ''}>
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
            </div>
          </div>
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.advanced') || 'Advanced'}</div>
            <div class="settings-card">
            <div class="settings-toggle-row">
              <div class="settings-toggle-label">
                <div>${t('settings.enable1MContext') || '1M Token Context'}</div>
                <div class="settings-toggle-desc">${t('settings.enable1MContextDesc') || 'Enable 1 million token context window for Opus and Sonnet (beta)'}</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="enable-1m-context-toggle" ${settings.enable1MContext ? 'checked' : ''}>
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
            </div>
          </div>
        </div>
        <!-- GitHub Tab -->
        <div class="settings-panel ${initialTab === 'github' ? 'active' : ''}" data-panel="github">
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.githubAccount')}</div>
            <div class="settings-card">
            <div class="github-account-card" id="github-account-card">
              ${githubStatus.authenticated ? `
                <div class="github-account-connected">
                  <div class="github-account-info">
                    <img src="${githubStatus.avatar_url || ''}" alt="" class="github-avatar" onerror="this.style.display='none'">
                    <div class="github-account-details">
                      <div class="github-account-name">${githubStatus.name || githubStatus.login}</div>
                      <div class="github-account-login">@${githubStatus.login}</div>
                    </div>
                  </div>
                  <button type="button" class="btn-outline-danger btn-sm" id="btn-github-disconnect">${t('settings.githubDisconnect')}</button>
                </div>
              ` : `
                <div class="github-account-disconnected">
                  <div class="github-account-message">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    <div>
                      <div class="github-account-title">${t('settings.githubConnectTitle')}</div>
                      <div class="github-account-desc">${t('settings.githubConnectDesc')}</div>
                    </div>
                  </div>
                </div>
                <div class="github-token-form">
                  <div class="github-token-input-group">
                    <input type="password" id="github-token-input" class="github-token-input" placeholder="ghp_xxxxxxxxxxxx">
                    <button type="button" class="btn-github-connect" id="btn-github-connect">${t('settings.githubConnect')}</button>
                  </div>
                  <div class="github-token-help">
                    <a href="#" id="github-token-help-link">${t('settings.githubTokenHelp')}</a>
                  </div>
                </div>
              `}
            </div>
            <div class="github-device-flow-container" id="github-device-flow" style="display: none;"></div>
            </div>
          </div>
        </div>
        <!-- Themes Tab -->
        <div class="settings-panel ${initialTab === 'themes' ? 'active' : ''}" data-panel="themes">
          <div class="settings-group">
            <div class="settings-group-title">${t('settings.themesTitle')}</div>
            <div class="settings-desc" style="margin-bottom: 12px; color: var(--text-muted); font-size: 12px;">${t('settings.themesDesc')}</div>
            <div class="theme-grid" id="theme-grid">
              ${Object.entries(ctx.TERMINAL_THEMES).map(([id, theme]) => {
                const isSelected = settings.terminalTheme === id || (!settings.terminalTheme && id === 'claude');
                const colors = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan];
                return `<div class="theme-card ${isSelected ? 'selected' : ''}" data-theme-id="${id}">
                  <div class="theme-card-preview" style="background:${theme.background}">
                    <span class="theme-card-cursor" style="background:${theme.cursor}"></span>
                    <span class="theme-card-text" style="color:${theme.foreground}">~$&nbsp;</span>
                    <span class="theme-card-text" style="color:${theme.green}">node</span>
                  </div>
                  <div class="theme-card-colors">
                    ${colors.map(c => `<span class="theme-card-swatch" style="background:${c}"></span>`).join('')}
                  </div>
                  <div class="theme-card-name">${theme.name}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
        <!-- Shortcuts Tab -->
        <div class="settings-panel ${initialTab === 'shortcuts' ? 'active' : ''}" data-panel="shortcuts">
          ${ctx.ShortcutsManager.renderShortcutsPanel()}
        </div>
        ${(() => {
          const registry = require('../../../project-types/registry');
          const dynamicTabs = registry.collectAllSettingsFields();
          let panelsHtml = '';
          dynamicTabs.forEach((tabData, tabId) => {
            let sectionsHtml = '';
            tabData.sections.forEach((section) => {
              const sectionName = section.typeName.includes('.') ? t(section.typeName) || section.typeName : section.typeName;
              let fieldsHtml = '';
              for (const field of section.fields) {
                const fieldLabel = field.labelKey ? t(field.labelKey) || field.label : field.label;
                const fieldDesc = field.descKey ? t(field.descKey) || field.description : field.description;
                const currentValue = ctx.settingsState.get()[field.key];
                const value = currentValue !== undefined ? currentValue : field.default;
                if (field.type === 'toggle') {
                  fieldsHtml += `
                    <div class="settings-toggle-row">
                      <div class="settings-toggle-label">
                        <div>${fieldLabel}</div>
                        ${fieldDesc ? `<div class="settings-toggle-desc">${fieldDesc}</div>` : ''}
                      </div>
                      <label class="settings-toggle">
                        <input type="checkbox" class="dynamic-setting-toggle" data-setting-key="${field.key}" ${value ? 'checked' : ''}>
                        <span class="settings-toggle-slider"></span>
                      </label>
                    </div>`;
                }
              }
              sectionsHtml += `
                <div class="settings-group">
                  <div class="settings-group-title">${sectionName}</div>
                  <div class="settings-card">
                  ${fieldsHtml}
                  </div>
                </div>`;
            });
            panelsHtml += `
              <div class="settings-panel ${initialTab === tabId ? 'active' : ''}" data-panel="${tabId}">
                ${sectionsHtml}
              </div>`;
          });
          return panelsHtml;
        })()}
      </div>
    </div>
  `;

  // Tab switching
  container.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = () => {
      container.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector(`.settings-panel[data-panel="${tab.dataset.tab}"]`)?.classList.add('active');
    };
  });

  ctx.ShortcutsManager.setupShortcutsPanelHandlers();

  // Custom presets management
  const addPresetBtn = document.getElementById('btn-add-preset');
  const presetForm = document.getElementById('custom-preset-form');
  const cancelPresetBtn = document.getElementById('btn-cancel-preset');
  const savePresetBtn = document.getElementById('btn-save-preset');

  if (addPresetBtn) {
    addPresetBtn.onclick = () => {
      presetForm.style.display = 'flex';
      addPresetBtn.style.display = 'none';
      document.getElementById('new-preset-name').focus();
    };
  }

  if (cancelPresetBtn) {
    cancelPresetBtn.onclick = () => {
      presetForm.style.display = 'none';
      addPresetBtn.style.display = '';
    };
  }

  if (savePresetBtn) {
    savePresetBtn.onclick = () => {
      const name = document.getElementById('new-preset-name').value.trim();
      const command = document.getElementById('new-preset-command').value.trim();
      const icon = document.getElementById('new-preset-icon').value;
      if (!name || !command) return;

      const currentPresets = ctx.settingsState.get().customPresets || [];
      const updated = [...currentPresets, { name, command, icon }];
      ctx.settingsState.set({ ...ctx.settingsState.get(), customPresets: updated });
      ctx.saveSettings();
      renderSettingsTab('general');
    };
  }

  container.querySelectorAll('.custom-preset-delete').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index);
      const currentPresets = [...(ctx.settingsState.get().customPresets || [])];
      currentPresets.splice(idx, 1);
      ctx.settingsState.set({ ...ctx.settingsState.get(), customPresets: currentPresets });
      ctx.saveSettings();
      renderSettingsTab('general');
    };
  });

  container.querySelectorAll('.execution-mode-card:not(.terminal-mode-card)').forEach(card => {
    card.onclick = () => {
      container.querySelectorAll('.execution-mode-card:not(.terminal-mode-card)').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('dangerous-warning').style.display = card.dataset.mode === 'dangerous' ? 'flex' : 'none';
    };
  });

  container.querySelectorAll('.terminal-mode-card').forEach(card => {
    card.onclick = () => {
      container.querySelectorAll('.terminal-mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    };
  });

  container.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.onclick = () => {
      container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      container.querySelector('.color-swatch-custom')?.classList.remove('selected');
      swatch.classList.add('selected');
    };
  });

  const customColorInput = document.getElementById('custom-color-input');
  const customSwatch = container.querySelector('.color-swatch-custom');
  if (customColorInput && customSwatch) {
    customColorInput.oninput = (e) => {
      const color = e.target.value;
      customSwatch.style.background = color;
      container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      customSwatch.classList.add('selected');
    };
    customSwatch.onclick = (e) => {
      if (e.target === customColorInput) return;
      customColorInput.click();
    };
  }

  container.querySelectorAll('.theme-card').forEach(card => {
    card.onclick = () => {
      container.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const themeId = card.dataset.themeId;
      ctx.TerminalManager.updateAllTerminalsTheme(themeId);
      const btn = document.getElementById('btn-go-themes');
      if (btn) {
        const themeName = ctx.TERMINAL_THEMES[themeId]?.name || themeId;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg> ${themeName}`;
      }
    };
  });

  const btnGoThemes = document.getElementById('btn-go-themes');
  if (btnGoThemes) {
    btnGoThemes.onclick = () => {
      container.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      container.querySelector('.settings-tab[data-tab="themes"]')?.classList.add('active');
      container.querySelector('.settings-panel[data-panel="themes"]')?.classList.add('active');
    };
  }

  const btnCheckUpdates = document.getElementById('btn-check-updates');
  if (btnCheckUpdates) {
    btnCheckUpdates.onclick = async () => {
      const originalText = btnCheckUpdates.innerHTML;
      btnCheckUpdates.disabled = true;
      btnCheckUpdates.innerHTML = `<span class="btn-spinner"></span> ${t('settings.checking') || 'Verification...'}`;
      try {
        const result = await ctx.api.updates.checkForUpdates();
        if (result?.success && result.version) {
          btnCheckUpdates.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> v${result.version}`;
        } else {
          btnCheckUpdates.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> ${t('settings.upToDate') || 'A jour'}`;
        }
      } catch (e) {
        btnCheckUpdates.innerHTML = originalText;
      }
      setTimeout(() => {
        btnCheckUpdates.disabled = false;
        btnCheckUpdates.innerHTML = originalText;
      }, 5000);
    };
  }

  async function setupGitHubAuth() {
    const connectBtn = document.getElementById('btn-github-connect');
    const disconnectBtn = document.getElementById('btn-github-disconnect');
    const tokenInput = document.getElementById('github-token-input');
    const helpLink = document.getElementById('github-token-help-link');

    if (connectBtn && tokenInput) {
      connectBtn.onclick = async () => {
        const token = tokenInput.value.trim();
        if (!token) {
          tokenInput.focus();
          tokenInput.classList.add('error');
          setTimeout(() => tokenInput.classList.remove('error'), 1000);
          return;
        }

        connectBtn.disabled = true;
        connectBtn.innerHTML = '<span class="btn-spinner"></span>';

        try {
          const result = await ctx.api.github.setToken(token);
          if (result.success && result.authenticated) {
            renderSettingsTab('github');
          } else {
            tokenInput.classList.add('error');
            tokenInput.value = '';
            tokenInput.placeholder = 'Token invalide';
            setTimeout(() => {
              tokenInput.classList.remove('error');
              tokenInput.placeholder = 'ghp_xxxxxxxxxxxx';
            }, 2000);
            connectBtn.disabled = false;
            connectBtn.innerHTML = 'Connecter';
          }
        } catch (e) {
          connectBtn.disabled = false;
          connectBtn.innerHTML = 'Connecter';
        }
      };

      tokenInput.onkeydown = (e) => {
        if (e.key === 'Enter') connectBtn.click();
      };
    }

    if (helpLink) {
      helpLink.onclick = (e) => {
        e.preventDefault();
        ctx.api.github.openAuthUrl('https://github.com/settings/tokens/new?scopes=repo&description=Claude%20Terminal');
      };
    }

    if (disconnectBtn) {
      disconnectBtn.onclick = async () => {
        await ctx.api.github.logout();
        renderSettingsTab('github');
      };
    }
  }
  setupGitHubAuth();

  container.querySelectorAll('.settings-dropdown').forEach(dropdown => {
    const trigger = dropdown.querySelector('.settings-dropdown-trigger');
    const menu = dropdown.querySelector('.settings-dropdown-menu');
    trigger.onclick = (e) => {
      e.stopPropagation();
      container.querySelectorAll('.settings-dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });
      const wasOpen = dropdown.classList.contains('open');
      dropdown.classList.toggle('open');
      if (!wasOpen) {
        const rect = trigger.getBoundingClientRect();
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        menu.style.minWidth = rect.width + 'px';
      }
    };
    menu.querySelectorAll('.settings-dropdown-option').forEach(opt => {
      opt.onclick = (e) => {
        e.stopPropagation();
        const value = opt.dataset.value;
        dropdown.dataset.value = value;
        trigger.querySelector('span').textContent = opt.textContent.trim();
        menu.querySelectorAll('.settings-dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        dropdown.classList.remove('open');
        setTimeout(() => saveSettingsHandler(), 50);
      };
    });
  });
  const closeDropdowns = () => container.querySelectorAll('.settings-dropdown.open').forEach(d => d.classList.remove('open'));
  document.addEventListener('click', closeDropdowns);
  container.closest('.tab-content, .content-area, #settings-tab')?.addEventListener('scroll', closeDropdowns, { passive: true });

  const saveSettingsHandler = async () => {
    const selectedMode = container.querySelector('.execution-mode-card:not(.terminal-mode-card).selected');
    const selectedTerminalMode = container.querySelector('.terminal-mode-card.selected');
    const closeActionDropdown = document.getElementById('close-action-dropdown');
    const selectedThemeCard = container.querySelector('.theme-card.selected');
    const languageDropdown = document.getElementById('language-dropdown');
    const newTerminalTheme = selectedThemeCard?.dataset.themeId || 'claude';
    const newLanguage = languageDropdown?.dataset.value || getCurrentLanguage();

    let accentColor = settings.accentColor;
    const selectedSwatch = container.querySelector('.color-swatch.selected');
    const customSwatchSelected = container.querySelector('.color-swatch-custom.selected');
    if (selectedSwatch) {
      accentColor = selectedSwatch.dataset.color;
    } else if (customSwatchSelected) {
      accentColor = document.getElementById('custom-color-input')?.value || settings.accentColor;
    }

    const compactProjectsToggle = document.getElementById('compact-projects-toggle');
    const newCompactProjects = compactProjectsToggle ? compactProjectsToggle.checked : true;
    const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
    const newReduceMotion = reduceMotionToggle ? reduceMotionToggle.checked : false;
    const aiCommitToggle = document.getElementById('ai-commit-toggle');
    const newAiCommitMessages = aiCommitToggle ? aiCommitToggle.checked : true;
    const hooksToggle = document.getElementById('hooks-enabled-toggle');
    const newHooksEnabled = hooksToggle ? hooksToggle.checked : settings.hooksEnabled;
    const context1MToggle = document.getElementById('enable-1m-context-toggle');
    const newEnable1MContext = context1MToggle ? context1MToggle.checked : settings.enable1MContext || false;

    const newSettings = {
      editor: settings.editor || 'code',
      skipPermissions: selectedMode?.dataset.mode === 'dangerous',
      accentColor,
      closeAction: closeActionDropdown?.dataset.value || 'ask',
      terminalTheme: newTerminalTheme,
      language: newLanguage,
      compactProjects: newCompactProjects,
      reduceMotion: newReduceMotion,
      aiCommitMessages: newAiCommitMessages,
      defaultTerminalMode: selectedTerminalMode?.dataset.terminalMode || 'terminal',
      hooksEnabled: newHooksEnabled,
      enable1MContext: newEnable1MContext
    };

    container.querySelectorAll('.dynamic-setting-toggle').forEach(toggle => {
      newSettings[toggle.dataset.settingKey] = toggle.checked;
    });

    ctx.settingsState.set(newSettings);

    if (newLanguage !== getCurrentLanguage()) {
      ctx.saveSettingsImmediate();
      setLanguage(newLanguage);
      location.reload();
      return;
    }

    ctx.saveSettings();

    document.body.classList.toggle('compact-projects', newCompactProjects);
    document.body.classList.toggle('reduce-motion', newReduceMotion);
    ctx.applyAccentColor(newSettings.accentColor);

    if (newTerminalTheme !== settings.terminalTheme) {
      ctx.TerminalManager.updateAllTerminalsTheme(newTerminalTheme);
    }

    const launchAtStartupToggle = document.getElementById('launch-at-startup-toggle');
    if (launchAtStartupToggle) {
      try {
        await ctx.api.app.setLaunchAtStartup(launchAtStartupToggle.checked);
      } catch (e) {
        console.error('Error setting launch at startup:', e);
      }
    }

    if (newHooksEnabled !== settings.hooksEnabled) {
      try {
        if (newHooksEnabled) {
          await ctx.api.hooks.install();
        } else {
          await ctx.api.hooks.remove();
        }
      } catch (e) {
        console.error('Error toggling hooks:', e);
      }
      const { switchProvider } = require('../../../renderer/events');
      switchProvider(newHooksEnabled ? 'hooks' : 'scraping');
    }

    ctx.showToast({ type: 'info', title: t('settings.saved') || 'Settings saved', message: '' });
  };

  const autoSave = () => saveSettingsHandler();
  container.querySelectorAll('.settings-toggle input, .settings-select').forEach(el => {
    el.addEventListener('change', autoSave);
  });
  container.querySelectorAll('.execution-mode-card, .terminal-mode-card, .theme-card, .color-swatch').forEach(el => {
    el.addEventListener('click', () => setTimeout(autoSave, 50));
  });
}

module.exports = { init, switchToSettingsTab, renderSettingsTab };
