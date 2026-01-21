const { ipcRenderer } = require('electron');
const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ========== STATE ==========
const state = {
  projects: [],
  activeProject: null,
  terminals: new Map(),
  activeTerminal: null,
  skills: [],
  agents: [],
  notificationsEnabled: true
};

// ========== NOTIFICATIONS ==========
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showNotification(title, body, terminalId) {
  if (!state.notificationsEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // Don't notify if window is focused and terminal is active
  if (document.hasFocus() && state.activeTerminal === terminalId) return;

  const notification = new Notification(title, {
    body: body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23d97706"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>',
    silent: false
  });

  notification.onclick = () => {
    // Focus window and switch to terminal
    const { remote } = require('@electron/remote') || {};
    if (remote) {
      remote.getCurrentWindow().focus();
    } else {
      window.focus();
    }

    if (terminalId) {
      setActiveTerminal(terminalId);
      // Switch to Claude tab
      document.querySelector('[data-tab="claude"]').click();
    }
    notification.close();
  };

  // Auto close after 5 seconds
  setTimeout(() => notification.close(), 5000);
}

requestNotificationPermission();

// ========== PATHS ==========
const dataDir = path.join(os.homedir(), '.claude-terminal');
const projectsFile = path.join(dataDir, 'projects.json');
const claudeDir = path.join(os.homedir(), '.claude');
const skillsDir = path.join(claudeDir, 'skills');
const agentsDir = path.join(claudeDir, 'agents');

// Create directories
[dataDir, skillsDir, agentsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========== DATA ==========
function loadProjects() {
  try {
    if (fs.existsSync(projectsFile)) {
      state.projects = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
    }
  } catch (e) {
    state.projects = [];
  }
  renderProjects();
}

function saveProjects() {
  fs.writeFileSync(projectsFile, JSON.stringify(state.projects, null, 2));
}

function loadSkills() {
  state.skills = [];
  try {
    if (fs.existsSync(skillsDir)) {
      fs.readdirSync(skillsDir).forEach(item => {
        const itemPath = path.join(skillsDir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          const skillFile = path.join(itemPath, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            const content = fs.readFileSync(skillFile, 'utf8');
            const nameMatch = content.match(/^#\s+(.+)/m);
            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            state.skills.push({
              id: item,
              name: nameMatch ? nameMatch[1] : item,
              description: lines[0] || 'Aucune description',
              path: itemPath
            });
          }
        }
      });
    }
  } catch (e) {}
  renderSkills();
}

function loadAgents() {
  state.agents = [];
  try {
    if (fs.existsSync(agentsDir)) {
      fs.readdirSync(agentsDir).forEach(item => {
        const itemPath = path.join(agentsDir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          const agentFile = path.join(itemPath, 'AGENT.md');
          if (fs.existsSync(agentFile)) {
            const content = fs.readFileSync(agentFile, 'utf8');
            const nameMatch = content.match(/^#\s+(.+)/m);
            const descMatch = content.match(/description[:\s]+["']?([^"'\n]+)/i);
            state.agents.push({
              id: item,
              name: nameMatch ? nameMatch[1] : item,
              description: descMatch ? descMatch[1] : 'Aucune description',
              path: itemPath
            });
          }
        }
      });
    }
  } catch (e) {}
  renderAgents();
}

// ========== WINDOW CONTROLS ==========
document.getElementById('btn-minimize').onclick = () => ipcRenderer.send('window-minimize');
document.getElementById('btn-maximize').onclick = () => ipcRenderer.send('window-maximize');
document.getElementById('btn-close').onclick = () => ipcRenderer.send('window-close');

// ========== NOTIFICATIONS TOGGLE ==========
document.getElementById('btn-notifications').onclick = () => {
  state.notificationsEnabled = !state.notificationsEnabled;
  const btn = document.getElementById('btn-notifications');
  btn.classList.toggle('active', state.notificationsEnabled);

  // Request permission if enabling and not granted
  if (state.notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};

// ========== TAB NAVIGATION ==========
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.onclick = () => {
    const tabId = tab.dataset.tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    if (tabId === 'skills') loadSkills();
    if (tabId === 'agents') loadAgents();
    // Resize active terminal when switching back
    if (tabId === 'claude' && state.activeTerminal) {
      const termData = state.terminals.get(state.activeTerminal);
      if (termData) termData.fitAddon.fit();
    }
  };
});

// ========== PROJECTS ==========
function renderProjects() {
  const list = document.getElementById('projects-list');
  if (state.projects.length === 0) {
    list.innerHTML = `
      <div class="empty-state small">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>
        <p>Aucun projet</p>
        <p class="hint">Cliquez sur + pour ajouter</p>
      </div>`;
    return;
  }

  list.innerHTML = state.projects.map((p, i) => `
    <div class="project-item ${state.activeProject === i ? 'active' : ''}" data-index="${i}">
      <div class="project-info">
        <div class="project-name">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>
          <span>${p.name}</span>
        </div>
        <div class="project-path">${p.path}</div>
      </div>
      <div class="project-actions">
        <button class="btn-action btn-claude" data-index="${i}">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10z"/></svg>
          Claude
        </button>
        <button class="btn-action btn-folder" data-index="${i}">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7l2 2h5v12zm0-12h-5l-2-2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z"/></svg>
        </button>
        <button class="btn-action btn-delete" data-index="${i}">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.project-item').forEach(item => {
    item.onclick = (e) => {
      if (!e.target.closest('button')) {
        state.activeProject = parseInt(item.dataset.index);
        renderProjects();
      }
    };
  });

  list.querySelectorAll('.btn-claude').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      createTerminal(state.projects[parseInt(btn.dataset.index)]);
    };
  });

  list.querySelectorAll('.btn-folder').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      ipcRenderer.send('open-in-explorer', state.projects[parseInt(btn.dataset.index)].path);
    };
  });

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.index);
      if (confirm(`Supprimer "${state.projects[i].name}" ?`)) {
        state.projects.splice(i, 1);
        saveProjects();
        renderProjects();
      }
    };
  });
}

// ========== TERMINALS ==========
async function createTerminal(project) {
  const id = await ipcRenderer.invoke('terminal-create', { cwd: project.path, runClaude: true });

  const terminal = new Terminal({
    theme: {
      background: '#0d0d0d',
      foreground: '#e0e0e0',
      cursor: '#d97706',
      selection: 'rgba(217, 119, 6, 0.3)',
      black: '#1a1a1a',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#e0e0e0'
    },
    fontFamily: 'Cascadia Code, Consolas, monospace',
    fontSize: 14,
    cursorBlink: true
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  state.terminals.set(id, { terminal, fitAddon, project, name: project.name, status: 'ready' });

  // Create tab
  const tabsContainer = document.getElementById('terminals-tabs');
  const tab = document.createElement('div');
  tab.className = 'terminal-tab status-ready';
  tab.dataset.id = id;
  tab.innerHTML = `
    <span class="status-dot"></span>
    <span class="tab-name">${project.name}</span>
    <button class="tab-close">
      <svg viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
    </button>
  `;
  tabsContainer.appendChild(tab);

  // Create terminal container
  const container = document.getElementById('terminals-container');
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-wrapper';
  wrapper.dataset.id = id;
  container.appendChild(wrapper);

  // Hide empty state
  document.getElementById('empty-terminals').style.display = 'none';

  // Open terminal
  terminal.open(wrapper);
  setTimeout(() => fitAddon.fit(), 100);

  setActiveTerminal(id);

  // Status detection buffer
  let outputBuffer = '';
  let statusTimeout = null;

  // Strip ANSI escape codes
  const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');

  // Handle data from main process
  const dataHandler = (event, data) => {
    if (data.id === id) {
      terminal.write(data.data);

      // Detect status from output
      outputBuffer += data.data;
      // Keep buffer small
      if (outputBuffer.length > 2000) outputBuffer = outputBuffer.slice(-1000);

      // Clean buffer for pattern matching
      const cleanBuffer = stripAnsi(outputBuffer);
      const lastLines = cleanBuffer.split('\n').slice(-5).join('\n');

      // Detect if Claude is working (actively processing)
      const workingPatterns = [
        /thinking/i,
        /reading/i,
        /writing/i,
        /searching/i,
        /running/i,
        /executing/i,
        /analyzing/i,
        /\.{3,}\s*$/,
        /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/, // Spinner characters
      ];

      const isWorking = workingPatterns.some(p => p.test(lastLines));

      // Detect if Claude is waiting for input
      const waitingPatterns = [
        />\s*$/,
        /\?\s*$/,
        /\(y\/n\)/i,
        /\[Y\/n\]/i,
        /press enter/i,
        /waiting for input/i,
        /╰─+>\s*$/,
        /❯\s*$/,
      ];

      const isWaiting = waitingPatterns.some(p => p.test(lastLines));

      // Clear any pending status change
      if (statusTimeout) clearTimeout(statusTimeout);

      // Determine status with debounce to avoid flickering
      if (isWorking && !isWaiting) {
        updateTerminalStatus(id, 'working');
      } else if (isWaiting && !isWorking) {
        // Small delay before marking as ready to avoid false positives
        statusTimeout = setTimeout(() => {
          updateTerminalStatus(id, 'ready');
        }, 300);
      }
    }
  };
  ipcRenderer.on('terminal-data', dataHandler);

  // Handle exit
  const exitHandler = (event, data) => {
    if (data.id === id) closeTerminal(id);
  };
  ipcRenderer.on('terminal-exit', exitHandler);

  // Terminal input - when user types, Claude is working
  terminal.onData(data => {
    ipcRenderer.send('terminal-input', { id, data });
    if (data === '\r' || data === '\n') {
      updateTerminalStatus(id, 'working');
    }
  });

  // Resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    ipcRenderer.send('terminal-resize', { id, cols: terminal.cols, rows: terminal.rows });
  });
  resizeObserver.observe(wrapper);

  // Tab click - select terminal
  tab.onclick = (e) => {
    if (!e.target.closest('.tab-close') && !e.target.closest('.tab-name-input')) {
      setActiveTerminal(id);
    }
  };

  // Double-click on name to rename
  tab.querySelector('.tab-name').ondblclick = (e) => {
    e.stopPropagation();
    startRenameTab(id);
  };

  tab.querySelector('.tab-close').onclick = (e) => {
    e.stopPropagation();
    closeTerminal(id);
  };
}

function updateTerminalStatus(id, status) {
  const termData = state.terminals.get(id);
  if (termData && termData.status !== status) {
    const previousStatus = termData.status;
    termData.status = status;
    const tab = document.querySelector(`.terminal-tab[data-id="${id}"]`);
    if (tab) {
      tab.classList.remove('status-working', 'status-ready');
      tab.classList.add(`status-${status}`);
    }

    // Send notification when Claude becomes ready (was working)
    if (status === 'ready' && previousStatus === 'working') {
      showNotification(
        `✅ ${termData.name}`,
        'Claude attend votre réponse',
        id
      );
    }
  }
}

function startRenameTab(id) {
  const tab = document.querySelector(`.terminal-tab[data-id="${id}"]`);
  const nameSpan = tab.querySelector('.tab-name');
  const termData = state.terminals.get(id);
  const currentName = termData.name;

  // Create input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-name-input';
  input.value = currentName;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finishRename = () => {
    const newName = input.value.trim() || currentName;
    termData.name = newName;
    const newSpan = document.createElement('span');
    newSpan.className = 'tab-name';
    newSpan.textContent = newName;
    newSpan.ondblclick = (e) => {
      e.stopPropagation();
      startRenameTab(id);
    };
    input.replaceWith(newSpan);
  };

  input.onblur = finishRename;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  };
}

function setActiveTerminal(id) {
  state.activeTerminal = id;
  document.querySelectorAll('.terminal-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.id == id);
  });
  document.querySelectorAll('.terminal-wrapper').forEach(w => {
    w.classList.toggle('active', w.dataset.id == id);
  });
  const termData = state.terminals.get(id);
  if (termData) {
    termData.fitAddon.fit();
    termData.terminal.focus();
  }
}

function closeTerminal(id) {
  ipcRenderer.send('terminal-kill', { id });
  const termData = state.terminals.get(id);
  if (termData) termData.terminal.dispose();
  state.terminals.delete(id);

  document.querySelector(`.terminal-tab[data-id="${id}"]`)?.remove();
  document.querySelector(`.terminal-wrapper[data-id="${id}"]`)?.remove();

  if (state.terminals.size === 0) {
    document.getElementById('empty-terminals').style.display = 'flex';
    state.activeTerminal = null;
  } else {
    setActiveTerminal(state.terminals.keys().next().value);
  }
}

// ========== NEW PROJECT ==========
document.getElementById('btn-new-project').onclick = () => {
  showModal('Nouveau Projet', `
    <form id="form-project">
      <div class="form-group">
        <label>Nom du projet</label>
        <input type="text" id="inp-name" placeholder="Mon Projet" required>
      </div>
      <div class="form-group">
        <label>Chemin du projet</label>
        <div class="input-with-btn">
          <input type="text" id="inp-path" placeholder="C:\\chemin\\projet" required>
          <button type="button" class="btn-browse" id="btn-browse">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>
          </button>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-cancel" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn-primary">Creer</button>
      </div>
    </form>
  `);

  document.getElementById('btn-browse').onclick = async () => {
    const folder = await ipcRenderer.invoke('select-folder');
    if (folder) {
      document.getElementById('inp-path').value = folder;
      if (!document.getElementById('inp-name').value) {
        document.getElementById('inp-name').value = path.basename(folder);
      }
    }
  };

  document.getElementById('form-project').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('inp-name').value.trim();
    const projPath = document.getElementById('inp-path').value.trim();
    if (name && projPath) {
      state.projects.push({ name, path: projPath });
      saveProjects();
      renderProjects();
      closeModal();
    }
  };
};

// ========== SKILLS ==========
function renderSkills() {
  const list = document.getElementById('skills-list');
  if (state.skills.length === 0) {
    list.innerHTML = `
      <div class="empty-list">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        <h3>Aucun skill</h3>
        <p>Creez votre premier skill</p>
      </div>`;
    return;
  }

  list.innerHTML = state.skills.map(s => `
    <div class="list-card" data-id="${s.id}" data-path="${s.path.replace(/"/g, '&quot;')}">
      <div class="list-card-header">
        <div class="list-card-title">${s.name}</div>
        <div class="list-card-badge">Skill</div>
      </div>
      <div class="list-card-desc">${s.description}</div>
      <div class="list-card-footer">
        <button class="btn-sm btn-secondary btn-open">Ouvrir</button>
        <button class="btn-sm btn-delete btn-del">Suppr</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.list-card').forEach(card => {
    card.querySelector('.btn-open').onclick = () => ipcRenderer.send('open-in-explorer', card.dataset.path);
    card.querySelector('.btn-del').onclick = () => {
      if (confirm('Supprimer ce skill ?')) {
        fs.rmSync(card.dataset.path, { recursive: true, force: true });
        loadSkills();
      }
    };
  });
}

document.getElementById('btn-new-skill').onclick = () => {
  showModal('Nouveau Skill', `
    <form id="form-skill">
      <div class="form-group">
        <label>Nom (sans espaces)</label>
        <input type="text" id="inp-skill-name" placeholder="mon-skill" pattern="[a-z0-9-]+" required>
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="inp-skill-desc" rows="3"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-cancel" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn-primary">Creer</button>
      </div>
    </form>
  `);

  document.getElementById('form-skill').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('inp-skill-name').value.trim().toLowerCase();
    const desc = document.getElementById('inp-skill-desc').value.trim();
    if (name) {
      const skillPath = path.join(skillsDir, name);
      if (!fs.existsSync(skillPath)) {
        fs.mkdirSync(skillPath, { recursive: true });
        fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `# ${name}\n\n${desc || 'Description'}\n\n## Instructions\n\nAjoutez vos instructions ici.\n`);
        loadSkills();
        closeModal();
      } else {
        alert('Ce skill existe deja');
      }
    }
  };
};

// ========== AGENTS ==========
function renderAgents() {
  const list = document.getElementById('agents-list');
  if (state.agents.length === 0) {
    list.innerHTML = `
      <div class="empty-list">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8 17.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM9.5 8c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5S9.5 9.38 9.5 8zm6.5 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <h3>Aucun agent</h3>
        <p>Creez votre premier agent</p>
      </div>`;
    return;
  }

  list.innerHTML = state.agents.map(a => `
    <div class="list-card" data-id="${a.id}" data-path="${a.path.replace(/"/g, '&quot;')}">
      <div class="list-card-header">
        <div class="list-card-title">${a.name}</div>
        <div class="list-card-badge agent">Agent</div>
      </div>
      <div class="list-card-desc">${a.description}</div>
      <div class="list-card-footer">
        <button class="btn-sm btn-secondary btn-open">Ouvrir</button>
        <button class="btn-sm btn-delete btn-del">Suppr</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.list-card').forEach(card => {
    card.querySelector('.btn-open').onclick = () => ipcRenderer.send('open-in-explorer', card.dataset.path);
    card.querySelector('.btn-del').onclick = () => {
      if (confirm('Supprimer cet agent ?')) {
        fs.rmSync(card.dataset.path, { recursive: true, force: true });
        loadAgents();
      }
    };
  });
}

document.getElementById('btn-new-agent').onclick = () => {
  showModal('Nouvel Agent', `
    <form id="form-agent">
      <div class="form-group">
        <label>Nom (sans espaces)</label>
        <input type="text" id="inp-agent-name" placeholder="mon-agent" pattern="[a-z0-9-]+" required>
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="inp-agent-desc" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label>Outils (separes par virgules)</label>
        <input type="text" id="inp-agent-tools" placeholder="Read, Grep, Glob">
      </div>
      <div class="form-actions">
        <button type="button" class="btn-cancel" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn-primary">Creer</button>
      </div>
    </form>
  `);

  document.getElementById('form-agent').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('inp-agent-name').value.trim().toLowerCase();
    const desc = document.getElementById('inp-agent-desc').value.trim();
    const tools = document.getElementById('inp-agent-tools').value.trim() || 'Read, Grep, Glob';
    if (name) {
      const agentPath = path.join(agentsDir, name);
      if (!fs.existsSync(agentPath)) {
        fs.mkdirSync(agentPath, { recursive: true });
        fs.writeFileSync(path.join(agentPath, 'AGENT.md'), `# ${name}\n\ndescription: "${desc || "Agent personnalise"}"\ntools: [${tools}]\n\n## Instructions\n\nAjoutez vos instructions ici.\n`);
        loadAgents();
        closeModal();
      } else {
        alert('Cet agent existe deja');
      }
    }
  };
};

// ========== MODAL ==========
function showModal(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal-overlay').classList.add('active');
  setTimeout(() => document.querySelector('#modal-body input')?.focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

document.getElementById('modal-close').onclick = closeModal;
document.getElementById('modal-overlay').onclick = (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
};
document.onkeydown = (e) => {
  if (e.key === 'Escape') closeModal();
};

// Ctrl + Arrow shortcuts (capture phase to work even when terminal has focus)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    // Ctrl + Up/Down: switch projects
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (state.projects.length === 0) return;

      let newIndex;
      if (state.activeProject === null) {
        newIndex = e.key === 'ArrowDown' ? 0 : state.projects.length - 1;
      } else {
        if (e.key === 'ArrowDown') {
          newIndex = (state.activeProject + 1) % state.projects.length;
        } else {
          newIndex = (state.activeProject - 1 + state.projects.length) % state.projects.length;
        }
      }
      state.activeProject = newIndex;
      renderProjects();

      // Scroll to selected project
      const projectItem = document.querySelector(`.project-item[data-index="${newIndex}"]`);
      if (projectItem) projectItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Ctrl + Left/Right: switch terminals
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const terminalIds = Array.from(state.terminals.keys());
      if (terminalIds.length === 0) return;

      const currentIndex = terminalIds.indexOf(state.activeTerminal);
      let newIndex;

      if (currentIndex === -1) {
        newIndex = e.key === 'ArrowRight' ? 0 : terminalIds.length - 1;
      } else {
        if (e.key === 'ArrowRight') {
          newIndex = (currentIndex + 1) % terminalIds.length;
        } else {
          newIndex = (currentIndex - 1 + terminalIds.length) % terminalIds.length;
        }
      }

      setActiveTerminal(terminalIds[newIndex]);

      // Make sure we're on the Claude tab
      document.querySelector('[data-tab="claude"]').click();
    }
  }
}, true); // true = capture phase

window.closeModal = closeModal;

// ========== INIT ==========
loadProjects();
loadSkills();
loadAgents();
