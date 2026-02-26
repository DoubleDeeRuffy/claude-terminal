/**
 * ShortcutsManager Panel
 * Keyboard shortcuts configuration and capture UI
 * Extracted from renderer.js
 */

const { t } = require('../../i18n');
const {
  initKeyboardShortcuts,
  registerShortcut,
  clearAllShortcuts,
  getKeyFromEvent,
  normalizeKey
} = require('../../features/KeyboardShortcuts');

let ctx = null;

const ID_TO_ENABLED_KEY = {
  ctrlC: 'shortcutCtrlCEnabled',
  ctrlV: 'shortcutCtrlVEnabled',
  ctrlArrow: 'shortcutCtrlArrowEnabled',
  ctrlTab: 'shortcutCtrlTabEnabled',
  rightClickPaste: 'shortcutRightClickPasteEnabled',
  rightClickCopyPaste: 'shortcutRightClickCopyPasteEnabled',
};

const ID_TO_KEY_KEY = {
  ctrlC: 'shortcutCtrlCKey',
  ctrlV: 'shortcutCtrlVKey',
};

const TERMINAL_SHORTCUTS = {
  ctrlC:              { key: 'Ctrl+C',          labelKey: 'shortcuts.termCtrlC',              enabledByDefault: true,  rebindable: true  },
  ctrlV:              { key: 'Ctrl+V',          labelKey: 'shortcuts.termCtrlV',              enabledByDefault: true,  rebindable: true  },
  ctrlArrow:          { key: 'Ctrl+Left/Right', labelKey: 'shortcuts.termCtrlArrow',          enabledByDefault: true,  rebindable: false },
  ctrlTab:            { key: 'Ctrl+Tab',        labelKey: 'shortcuts.termCtrlTab',            enabledByDefault: true,  rebindable: false },
  rightClickPaste:    { key: 'RightClick',      labelKey: 'shortcuts.termRightClickPaste',    enabledByDefault: true,  rebindable: false },
  rightClickCopyPaste:{ key: 'RightClick',      labelKey: 'shortcuts.termRightClickCopyPaste',enabledByDefault: false, rebindable: false }
};

const DEFAULT_SHORTCUTS = {
  openSettings: { key: 'Ctrl+,', labelKey: 'shortcuts.openSettings' },
  closeTerminal: { key: 'Ctrl+W', labelKey: 'shortcuts.closeTerminal' },
  showSessionsPanel: { key: 'Ctrl+Shift+E', labelKey: 'shortcuts.sessionsPanel' },
  openQuickPicker: { key: 'Ctrl+Shift+P', labelKey: 'shortcuts.quickPicker' },
  newProject: { key: 'Ctrl+N', labelKey: 'shortcuts.newProject' },
  newTerminal: { key: 'Ctrl+T', labelKey: 'shortcuts.newTerminal' },
  toggleFileExplorer: { key: 'Ctrl+E', labelKey: 'shortcuts.toggleFileExplorer' }
};

let shortcutCaptureState = {
  active: false,
  shortcutId: null,
  overlay: null
};

function init(context) {
  ctx = context;
}

function getShortcutLabel(id) {
  const shortcut = DEFAULT_SHORTCUTS[id];
  return shortcut ? t(shortcut.labelKey) : id;
}

function getShortcutKey(id) {
  const customShortcuts = ctx.settingsState.get().shortcuts || {};
  return customShortcuts[id] || DEFAULT_SHORTCUTS[id]?.key || '';
}

function getTerminalShortcutLabel(id) {
  const entry = TERMINAL_SHORTCUTS[id];
  return entry ? t(entry.labelKey) : id;
}

function getTerminalShortcutKey(id) {
  const flatKeyProp = ID_TO_KEY_KEY[id];
  if (flatKeyProp) {
    const stored = ctx.settingsState.get()[flatKeyProp];
    // stored is a bare letter like 'C' for default, or a full key like 'Ctrl+X' when rebound
    if (stored && stored !== TERMINAL_SHORTCUTS[id]?.key?.replace('Ctrl+', '')) {
      return stored; // rebound — return the full stored key
    }
  }
  return TERMINAL_SHORTCUTS[id]?.key || '';
}

function checkShortcutConflict(key, excludeId) {
  const normalizedKey = normalizeKey(key);
  for (const [id] of Object.entries(DEFAULT_SHORTCUTS)) {
    if (id === excludeId) continue;
    const currentKey = getShortcutKey(id);
    if (normalizeKey(currentKey) === normalizedKey) {
      return { id, label: getShortcutLabel(id) };
    }
  }
  // Also check terminal shortcuts that are rebindable (ctrlC, ctrlV)
  for (const [id, entry] of Object.entries(TERMINAL_SHORTCUTS)) {
    if (id === excludeId) continue;
    if (!entry.rebindable) continue;
    const currentKey = getTerminalShortcutKey(id);
    if (normalizeKey(currentKey) === normalizedKey) {
      return { id, label: getTerminalShortcutLabel(id) };
    }
  }
  return null;
}

function applyShortcut(id, key) {
  const customShortcuts = ctx.settingsState.get().shortcuts || {};
  if (normalizeKey(key) === normalizeKey(DEFAULT_SHORTCUTS[id]?.key || '')) {
    delete customShortcuts[id];
  } else {
    customShortcuts[id] = key;
  }
  ctx.settingsState.setProp('shortcuts', customShortcuts);
  ctx.saveSettings();
  registerAllShortcuts();
}

function resetShortcut(id) {
  const customShortcuts = ctx.settingsState.get().shortcuts || {};
  delete customShortcuts[id];
  ctx.settingsState.setProp('shortcuts', customShortcuts);
  ctx.saveSettings();
  registerAllShortcuts();
}

function resetAllShortcuts() {
  ctx.settingsState.setProp('shortcuts', {});
  ctx.saveSettings();
  registerAllShortcuts();
}

function formatKeyForDisplay(key) {
  if (!key) return '';
  return key.split('+').map(part => {
    const p = part.trim();
    if (p.toLowerCase() === 'ctrl') return 'Ctrl';
    if (p.toLowerCase() === 'alt') return 'Alt';
    if (p.toLowerCase() === 'shift') return 'Shift';
    if (p.toLowerCase() === 'meta') return 'Win';
    if (p.toLowerCase() === 'tab') return 'Tab';
    if (p.toLowerCase() === 'escape') return 'Esc';
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' + ');
}

function startShortcutCapture(id) {
  shortcutCaptureState.active = true;
  shortcutCaptureState.shortcutId = id;

  const overlay = document.createElement('div');
  overlay.className = 'shortcut-capture-overlay';
  overlay.innerHTML = `
    <div class="shortcut-capture-box">
      <div class="shortcut-capture-title">${t('shortcuts.pressKeys')}</div>
      <div class="shortcut-capture-preview">${t('shortcuts.waiting')}</div>
      <div class="shortcut-capture-hint">${t('shortcuts.pressEscapeToCancel')}</div>
      <div class="shortcut-capture-conflict" style="display: none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  shortcutCaptureState.overlay = overlay;

  const handleKeydown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const key = getKeyFromEvent(e);
    const preview = overlay.querySelector('.shortcut-capture-preview');
    const conflictDiv = overlay.querySelector('.shortcut-capture-conflict');

    if (e.key === 'Escape') {
      endShortcutCapture();
      return;
    }

    const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
    const isFunctionKey = /^f\d+$/i.test(e.key);

    if (!hasModifier && !isFunctionKey) {
      preview.textContent = formatKeyForDisplay(key);
      conflictDiv.style.display = 'block';
      conflictDiv.textContent = t('shortcuts.modifierRequired');
      conflictDiv.className = 'shortcut-capture-conflict warning';
      return;
    }

    if (['ctrl', 'alt', 'shift', 'meta', 'control'].includes(e.key.toLowerCase())) {
      preview.textContent = formatKeyForDisplay(key) + '...';
      return;
    }

    preview.textContent = formatKeyForDisplay(key);

    const conflict = checkShortcutConflict(key, id);
    if (conflict) {
      conflictDiv.style.display = 'block';
      conflictDiv.textContent = t('shortcuts.conflictWith', { label: conflict.label });
      conflictDiv.className = 'shortcut-capture-conflict error';
      return;
    }

    conflictDiv.style.display = 'none';
    endShortcutCapture();
    applyShortcut(id, key);

    const btn = document.querySelector(`[data-shortcut-id="${id}"] .shortcut-key-btn`);
    if (btn) {
      btn.textContent = formatKeyForDisplay(key);
    }
  };

  document.addEventListener('keydown', handleKeydown, true);
  shortcutCaptureState.keydownHandler = handleKeydown;
}

function endShortcutCapture() {
  if (shortcutCaptureState.overlay) {
    shortcutCaptureState.overlay.remove();
  }
  if (shortcutCaptureState.keydownHandler) {
    document.removeEventListener('keydown', shortcutCaptureState.keydownHandler, true);
  }
  shortcutCaptureState = { active: false, shortcutId: null, overlay: null };
}

function renderShortcutsPanel() {
  const customShortcuts = ctx.settingsState.get().shortcuts || {};

  let html = `
    <div class="settings-group">
      <div class="settings-group-title">${t('shortcuts.title')}</div>
      <div class="settings-card">
      <div class="shortcuts-list">
  `;

  for (const [id] of Object.entries(DEFAULT_SHORTCUTS)) {
    const currentKey = getShortcutKey(id);
    const isCustom = customShortcuts[id] !== undefined;

    html += `
      <div class="shortcut-row" data-shortcut-id="${id}">
        <div class="shortcut-label">${getShortcutLabel(id)}</div>
        <div class="shortcut-controls">
          <button type="button" class="shortcut-key-btn ${isCustom ? 'custom' : ''}" title="${t('shortcuts.clickToEdit')}">
            ${formatKeyForDisplay(currentKey)}
          </button>
          ${isCustom ? `<button type="button" class="shortcut-reset-btn" title="${t('shortcuts.reset')}">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>` : ''}
        </div>
      </div>
    `;
  }

  html += `
      </div>
      <div class="shortcuts-actions">
        <button type="button" class="btn-reset-shortcuts" id="btn-reset-all-shortcuts">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          ${t('shortcuts.resetAll')}
        </button>
      </div>
      </div>
    </div>
  `;

  // Terminal Shortcuts section
  html += `
    <div class="settings-group">
      <div class="settings-group-title">${t('shortcuts.terminalShortcuts')}</div>
      <div class="settings-card">
      <div class="shortcuts-list">
  `;

  for (const [id, entry] of Object.entries(TERMINAL_SHORTCUTS)) {
    const enabledFlatKey = ID_TO_ENABLED_KEY[id];
    const storedEnabled = enabledFlatKey !== undefined ? ctx.settingsState.get()[enabledFlatKey] : undefined;
    const isEnabled = storedEnabled !== undefined ? storedEnabled !== false : entry.enabledByDefault;
    const currentKey = getTerminalShortcutKey(id) || entry.key;
    const keyFlatKey = ID_TO_KEY_KEY[id];
    const isCustomKey = keyFlatKey !== undefined && ctx.settingsState.get()[keyFlatKey] && ctx.settingsState.get()[keyFlatKey] !== 'C' && ctx.settingsState.get()[keyFlatKey] !== 'V';

    html += `
      <div class="shortcut-row terminal-shortcut-row" data-terminal-shortcut-id="${id}">
        <div class="shortcut-label">${t(entry.labelKey)}</div>
        <div class="shortcut-controls">
          ${entry.rebindable
            ? `<button type="button" class="shortcut-key-btn terminal-rebind-btn ${isCustomKey ? 'custom' : ''}" title="${t('shortcuts.clickToEdit')}">
                ${formatKeyForDisplay(currentKey)}
              </button>`
            : `<span class="shortcut-key-static">${formatKeyForDisplay(currentKey)}</span>`
          }
          <label class="toggle-option" title="${isEnabled ? t('shortcuts.termShortcutEnabled') : t('shortcuts.termShortcutDisabled')}">
            <input type="checkbox" class="terminal-shortcut-checkbox" data-id="${id}" ${isEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  }

  html += `
      </div>
      </div>
    </div>
  `;

  return html;
}

function startTerminalShortcutCapture(id) {
  const overlay = document.createElement('div');
  overlay.className = 'shortcut-capture-overlay';
  overlay.innerHTML = `
    <div class="shortcut-capture-box">
      <div class="shortcut-capture-title">${t('shortcuts.pressKeys')}</div>
      <div class="shortcut-capture-preview">${t('shortcuts.waiting')}</div>
      <div class="shortcut-capture-hint">${t('shortcuts.pressEscapeToCancel')}</div>
      <div class="shortcut-capture-conflict" style="display: none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const handleKeydown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const key = getKeyFromEvent(e);
    const preview = overlay.querySelector('.shortcut-capture-preview');
    const conflictDiv = overlay.querySelector('.shortcut-capture-conflict');

    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handleKeydown, true);
      return;
    }

    const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
    const isFunctionKey = /^f\d+$/i.test(e.key);

    if (!hasModifier && !isFunctionKey) {
      preview.textContent = formatKeyForDisplay(key);
      conflictDiv.style.display = 'block';
      conflictDiv.textContent = t('shortcuts.modifierRequired');
      conflictDiv.className = 'shortcut-capture-conflict warning';
      return;
    }

    if (['ctrl', 'alt', 'shift', 'meta', 'control'].includes(e.key.toLowerCase())) {
      preview.textContent = formatKeyForDisplay(key) + '...';
      return;
    }

    preview.textContent = formatKeyForDisplay(key);

    const conflict = checkShortcutConflict(key, id);
    if (conflict) {
      conflictDiv.style.display = 'block';
      conflictDiv.textContent = t('shortcuts.conflictWith', { label: conflict.label });
      conflictDiv.className = 'shortcut-capture-conflict error';
      return;
    }

    conflictDiv.style.display = 'none';
    overlay.remove();
    document.removeEventListener('keydown', handleKeydown, true);

    // Apply the rebound key to terminal shortcut settings
    const keyFlatKey = ID_TO_KEY_KEY[id];
    if (keyFlatKey) {
      ctx.settingsState.setProp(keyFlatKey, key);
      ctx.saveSettings();
    }

    // Update the button display
    const btn = document.querySelector(`.terminal-shortcut-row[data-terminal-shortcut-id="${id}"] .terminal-rebind-btn`);
    if (btn) {
      btn.textContent = formatKeyForDisplay(key);
      btn.classList.add('custom');
    }
  };

  document.addEventListener('keydown', handleKeydown, true);
}

function setupShortcutsPanelHandlers() {
  // Global shortcut rebind buttons (existing)
  document.querySelectorAll('.shortcut-row:not(.terminal-shortcut-row) .shortcut-key-btn').forEach(btn => {
    btn.onclick = (e) => {
      const row = e.target.closest('.shortcut-row');
      const id = row.dataset.shortcutId;
      startShortcutCapture(id);
    };
  });

  document.querySelectorAll('.shortcut-reset-btn').forEach(btn => {
    btn.onclick = (e) => {
      const row = e.target.closest('.shortcut-row');
      const id = row.dataset.shortcutId;
      resetShortcut(id);
      const panel = document.querySelector('[data-panel="shortcuts"]');
      if (panel) {
        panel.innerHTML = renderShortcutsPanel();
        setupShortcutsPanelHandlers();
      }
    };
  });

  const resetAllBtn = document.getElementById('btn-reset-all-shortcuts');
  if (resetAllBtn) {
    resetAllBtn.onclick = () => {
      resetAllShortcuts();
      const panel = document.querySelector('[data-panel="shortcuts"]');
      if (panel) {
        panel.innerHTML = renderShortcutsPanel();
        setupShortcutsPanelHandlers();
      }
    };
  }

  // Terminal shortcut rebind buttons
  document.querySelectorAll('.terminal-rebind-btn').forEach(btn => {
    btn.onclick = (e) => {
      const row = e.target.closest('.terminal-shortcut-row');
      const id = row.dataset.terminalShortcutId;
      startTerminalShortcutCapture(id);
    };
  });

  // Terminal shortcut enable/disable toggles
  document.querySelectorAll('.terminal-shortcut-checkbox').forEach(checkbox => {
    checkbox.onchange = (e) => {
      const id = e.target.dataset.id;
      const enabled = e.target.checked;
      const flatKey = ID_TO_ENABLED_KEY[id];
      if (flatKey) {
        ctx.settingsState.setProp(flatKey, enabled);
        ctx.saveSettings();
      }
      // Update toggle title
      const label = e.target.closest('.toggle-option');
      if (label) {
        label.title = enabled ? t('shortcuts.termShortcutEnabled') : t('shortcuts.termShortcutDisabled');
      }
    };
  });
}

function registerAllShortcuts() {
  clearAllShortcuts();
  initKeyboardShortcuts();

  registerShortcut(getShortcutKey('openSettings'), () => ctx.switchToSettingsTab(), { global: true });

  registerShortcut(getShortcutKey('closeTerminal'), () => {
    const currentId = ctx.terminalsState.get().activeTerminal;
    if (currentId) {
      ctx.TerminalManager.closeTerminal(currentId);
    }
  }, { global: true });

  registerShortcut(getShortcutKey('showSessionsPanel'), () => {
    const selectedFilter = ctx.projectsState.get().selectedProjectFilter;
    const projects = ctx.projectsState.get().projects;
    if (selectedFilter !== null && projects[selectedFilter]) {
      ctx.showSessionsModal(projects[selectedFilter]);
    } else if (projects.length > 0) {
      ctx.setSelectedProjectFilter(0);
      ctx.ProjectList.render();
      ctx.showSessionsModal(projects[0]);
    }
  }, { global: true });

  registerShortcut(getShortcutKey('openQuickPicker'), () => {
    ctx.openQuickPicker(document.body, (project) => {
      const projectIndex = ctx.getProjectIndex(project.id);
      ctx.setSelectedProjectFilter(projectIndex);
      ctx.ProjectList.render();
      ctx.TerminalManager.filterByProject(projectIndex);
      ctx.createTerminalForProject(project);
    });
  }, { global: true });

  registerShortcut(getShortcutKey('newProject'), () => {
    document.getElementById('btn-new-project').click();
  }, { global: true });

  registerShortcut(getShortcutKey('newTerminal'), () => {
    const selectedFilter = ctx.projectsState.get().selectedProjectFilter;
    const projects = ctx.projectsState.get().projects;
    if (selectedFilter !== null && projects[selectedFilter]) {
      ctx.createTerminalForProject(projects[selectedFilter]);
    }
  }, { global: true });

  registerShortcut(getShortcutKey('toggleFileExplorer'), () => {
    ctx.FileExplorer.toggle();
  }, { global: true });
}

module.exports = {
  init,
  renderShortcutsPanel,
  setupShortcutsPanelHandlers,
  registerAllShortcuts,
  getShortcutKey,
  formatKeyForDisplay,
  TERMINAL_SHORTCUTS
};
