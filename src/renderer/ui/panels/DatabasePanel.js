/**
 * DatabasePanel
 * Database connections management, schema viewer, query editor
 * + MCP auto-provisioning for Claude chat integration
 */

const { escapeHtml } = require('../../utils');
const { t } = require('../../i18n');

let ctx = null;

let panelState = {
  initialized: false,
  activeSubTab: 'connections', // 'connections' | 'schema' | 'query'
  expandedTables: new Set(),
  queryRunning: false
};

function init(context) {
  ctx = context;
}

// ==================== Main Entry ====================

async function loadPanel() {
  if (!panelState.initialized) {
    panelState.initialized = true;
    setupSubTabs();
    setupHeaderButtons();
  }

  // Load connections from disk on first visit
  const state = require('../../state');
  if (state.getDatabaseConnections().length === 0) {
    try {
      const connections = await ctx.api.database.loadConnections();
      if (connections && connections.length > 0) {
        state.setDatabaseConnections(connections);
      }
    } catch (e) { /* ignore */ }
  }

  renderContent();
}

// ==================== Sub-tab Setup ====================

function setupSubTabs() {
  document.querySelectorAll('.database-sub-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.database-sub-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panelState.activeSubTab = btn.dataset.subtab;
      renderContent();
    };
  });
}

function setupHeaderButtons() {
  const addBtn = document.getElementById('database-add-btn');
  if (addBtn) addBtn.onclick = () => showConnectionForm();

  const detectBtn = document.getElementById('database-detect-btn');
  if (detectBtn) detectBtn.onclick = () => runAutoDetect();
}

// ==================== Render Router ====================

function renderContent() {
  const container = document.getElementById('database-content');
  if (!container) return;

  switch (panelState.activeSubTab) {
    case 'connections': renderConnections(container); break;
    case 'schema': renderSchema(container); break;
    case 'query': renderQuery(container); break;
  }
}

// ==================== Connections Tab ====================

function renderConnections(container) {
  const state = require('../../state');
  const connections = state.getDatabaseConnections();
  const detected = state.getDetectedDatabases();

  if (connections.length === 0 && detected.length === 0) {
    container.innerHTML = `
      <div class="database-empty-state">
        <div class="database-empty-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm6 14c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23c1.61.78 3.72 1.23 6 1.23s4.39-.45 6-1.23V17zm0-5c0 .5-2.13 2-6 2s-6-1.5-6-2V9.77C7.61 10.55 9.72 11 12 11s4.39-.45 6-1.23V12zm-6-3c-3.87 0-6-1.5-6-2s2.13-2 6-2 6 1.5 6 2-2.13 2-6 2z"/>
          </svg>
        </div>
        <div class="database-empty-text">${t('database.noConnections')}</div>
        <div class="database-empty-hint">${t('database.noConnectionsHint')}</div>
      </div>`;
    return;
  }

  let html = '';

  // Detected databases
  if (detected.length > 0) {
    html += `<div class="database-section-label">${t('database.detectedDatabases', { count: detected.length })}</div>`;
    for (const d of detected) {
      html += buildDetectedCard(d);
    }
  }

  // Saved connections
  if (connections.length > 0) {
    if (detected.length > 0) {
      html += `<div class="database-section-label">${t('database.connections')}</div>`;
    }
    for (const conn of connections) {
      html += buildConnectionCard(conn, state.getConnectionStatus(conn.id));
    }
  }

  container.innerHTML = html;
  bindConnectionEvents(container);
}

function buildConnectionCard(conn, status) {
  const state = require('../../state');
  const active = state.getActiveConnection() === conn.id;
  const projectName = conn.projectId ? getProjectName(conn.projectId) : '';

  return `
    <div class="database-card ${active ? 'selected' : ''}" data-id="${escapeHtml(conn.id)}">
      <div class="database-card-header">
        <div class="database-card-title-row">
          <span class="database-type-badge ${conn.type}">${escapeHtml(conn.type.toUpperCase())}</span>
          <span class="database-card-title">${escapeHtml(conn.name || conn.id)}</span>
          ${conn.mcpProvisioned ? `<span class="database-mcp-badge">${t('database.mcpProvisioned')}</span>` : ''}
        </div>
        <span class="database-status-badge ${status}">${t('database.' + status)}</span>
      </div>
      <div class="database-card-bottom">
        <div class="database-card-info">
          ${conn.type === 'sqlite' ? escapeHtml(conn.filePath || '') :
            conn.type === 'mongodb' ? escapeHtml(conn.connectionString ? conn.connectionString.replace(/\/\/[^@]+@/, '//***@') : `${conn.host}:${conn.port}`) :
            escapeHtml(`${conn.host || 'localhost'}:${conn.port || ''} / ${conn.database || ''}`)}
          ${projectName ? ` <span class="database-card-project">${escapeHtml(projectName)}</span>` : ''}
        </div>
        <div class="database-card-actions">
        ${status === 'connected' ?
          `<button class="btn-database" data-action="disconnect" data-id="${escapeHtml(conn.id)}" title="${t('database.disconnect')}">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0119 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.05.89-3.89 2.3-5.16L5.88 5.46A8.94 8.94 0 003 12a9 9 0 0018 0c0-2.74-1.23-5.19-3.17-6.83z"/></svg>
          </button>` :
          `<button class="btn-database primary" data-action="connect" data-id="${escapeHtml(conn.id)}" title="${t('database.connect')}">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
          </button>`}
        ${conn.mcpProvisioned ?
          `<button class="btn-database" data-action="deprovision" data-id="${escapeHtml(conn.id)}" title="${t('database.deprovisionMcp')}">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          </button>` :
          `<button class="btn-database" data-action="provision" data-id="${escapeHtml(conn.id)}" title="${t('database.provisionMcp')}">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v3H5z"/></svg>
          </button>`}
        <button class="btn-database" data-action="edit" data-id="${escapeHtml(conn.id)}" title="${t('database.editConnection')}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="btn-database danger" data-action="delete" data-id="${escapeHtml(conn.id)}" title="${t('database.deleteConnection')}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      </div>
    </div>`;
}

function buildDetectedCard(d) {
  return `
    <div class="database-card detected">
      <div class="database-card-header">
        <div class="database-card-title-row">
          <span class="database-type-badge ${d.type}">${escapeHtml(d.type.toUpperCase())}</span>
          <span class="database-card-title">${escapeHtml(d.name || d.type)}</span>
        </div>
        <span class="database-detected-source">${escapeHtml(d.detectedFrom || '')}</span>
      </div>
      <div class="database-card-info">
        ${d.type === 'sqlite' ? escapeHtml(d.filePath || '') :
          d.connectionString ? escapeHtml(d.connectionString.replace(/\/\/[^@]+@/, '//***@')) :
          escapeHtml(`${d.host || ''}:${d.port || ''} / ${d.database || ''}`)}
      </div>
      <div class="database-card-actions">
        <button class="btn-database primary" data-action="import-detected" data-detected='${escapeHtml(JSON.stringify(d))}' title="${t('database.import')}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          <span style="margin-left:4px;font-size:11px">${t('database.import')}</span>
        </button>
      </div>
    </div>`;
}

function bindConnectionEvents(container) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'connect': await connectDatabase(id); break;
        case 'disconnect': await disconnectDatabase(id); break;
        case 'edit': showConnectionForm(id); break;
        case 'delete': await deleteConnection(id); break;
        case 'provision': await provisionMcp(id); break;
        case 'deprovision': await deprovisionMcp(id); break;
        case 'import-detected': importDetected(btn.dataset.detected); break;
      }
    };
  });

  // Click card to select
  container.querySelectorAll('.database-card:not(.detected)').forEach(card => {
    card.onclick = () => {
      const state = require('../../state');
      state.setActiveConnection(card.dataset.id);
      renderContent();
    };
  });
}

// ==================== Schema Tab ====================

function renderSchema(container) {
  const state = require('../../state');
  const activeId = state.getActiveConnection();

  if (!activeId || state.getConnectionStatus(activeId) !== 'connected') {
    container.innerHTML = `<div class="database-empty-state"><div class="database-empty-text">${t('database.noActiveConnection')}</div></div>`;
    return;
  }

  const schema = state.getDatabaseSchema(activeId);
  if (!schema) {
    loadSchema(activeId);
    container.innerHTML = `<div class="database-empty-state"><div class="database-empty-text">${t('database.detecting')}</div></div>`;
    return;
  }

  const conn = state.getDatabaseConnection(activeId);
  const isMonogo = conn && conn.type === 'mongodb';
  const tableLabel = isMonogo ? t('database.collections') : t('database.tables');
  const columnLabel = isMonogo ? t('database.fields') : t('database.columns');

  if (!schema.tables || schema.tables.length === 0) {
    container.innerHTML = `<div class="database-empty-state"><div class="database-empty-text">${t('database.noTables')}</div></div>`;
    return;
  }

  let html = `<div class="database-schema-tree">`;
  html += `<div class="database-schema-header">${tableLabel} (${schema.tables.length})</div>`;

  for (const table of schema.tables) {
    const expanded = panelState.expandedTables.has(table.name);
    html += `
      <div class="database-schema-table ${expanded ? 'expanded' : ''}" data-table="${escapeHtml(table.name)}">
        <div class="database-schema-table-header">
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" class="database-schema-chevron">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
          <span class="database-schema-table-name">${escapeHtml(table.name)}</span>
          <span class="database-schema-table-count">${table.columns.length} ${columnLabel.toLowerCase()}</span>
        </div>
        ${expanded ? buildColumnsHtml(table.columns) : ''}
      </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;

  // Bind expand/collapse
  container.querySelectorAll('.database-schema-table-header').forEach(header => {
    header.onclick = () => {
      const tableName = header.parentElement.dataset.table;
      if (panelState.expandedTables.has(tableName)) {
        panelState.expandedTables.delete(tableName);
      } else {
        panelState.expandedTables.add(tableName);
      }
      renderContent();
    };
  });
}

function buildColumnsHtml(columns) {
  let html = '<div class="database-schema-columns">';
  for (const col of columns) {
    html += `
      <div class="database-schema-column">
        ${col.primaryKey ? '<span class="pk-icon" title="Primary Key">PK</span>' : '<span class="pk-spacer"></span>'}
        <span class="col-name">${escapeHtml(col.name)}</span>
        <span class="col-type">${escapeHtml(col.type)}</span>
        ${col.nullable ? '<span class="col-nullable">NULL</span>' : ''}
      </div>`;
  }
  html += '</div>';
  return html;
}

async function loadSchema(id) {
  const state = require('../../state');
  const result = await ctx.api.database.getSchema({ id });
  if (result.success) {
    state.setDatabaseSchema(id, { tables: result.tables });
    if (panelState.activeSubTab === 'schema') renderContent();
  }
}

// ==================== Query Tab ====================

function renderQuery(container) {
  const state = require('../../state');
  const activeId = state.getActiveConnection();

  if (!activeId || state.getConnectionStatus(activeId) !== 'connected') {
    container.innerHTML = `<div class="database-empty-state"><div class="database-empty-text">${t('database.noActiveConnection')}</div></div>`;
    return;
  }

  const conn = state.getDatabaseConnection(activeId);
  const isMongo = conn && conn.type === 'mongodb';
  const placeholder = isMongo ? t('database.mongoPlaceholder') : t('database.queryPlaceholder');
  const currentQuery = state.getCurrentQuery();
  const queryResult = state.getQueryResult(activeId);

  let html = `
    <div class="database-query-section">
      <textarea class="database-query-editor" id="database-query-input" placeholder="${escapeHtml(placeholder)}">${escapeHtml(currentQuery)}</textarea>
      <div class="database-query-toolbar">
        <button class="btn-sm btn-accent" id="database-run-btn" ${panelState.queryRunning ? 'disabled' : ''}>
          ${panelState.queryRunning ? t('database.connecting') : t('database.runQuery')}
        </button>
        <span class="database-query-hint">${t('database.runQueryShortcut')}</span>
      </div>
    </div>`;

  if (queryResult) {
    if (queryResult.error) {
      html += `<div class="database-message error">${escapeHtml(queryResult.error)}</div>`;
    } else {
      html += `<div class="database-results-status">${t('database.querySuccess', { count: queryResult.rowCount || 0, duration: queryResult.duration || 0 })}</div>`;
      html += buildResultsTable(queryResult);
    }
  }

  container.innerHTML = html;

  // Bind events
  const runBtn = document.getElementById('database-run-btn');
  if (runBtn) runBtn.onclick = () => runQuery();

  const input = document.getElementById('database-query-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        runQuery();
      }
    });
    input.addEventListener('input', () => {
      state.setCurrentQuery(input.value);
    });
  }
}

function buildResultsTable(result) {
  if (!result.columns || result.columns.length === 0 || !result.rows || result.rows.length === 0) {
    return '';
  }

  let html = `<div class="database-results-wrapper"><table class="database-results-table"><thead><tr>`;
  for (const col of result.columns) {
    html += `<th>${escapeHtml(String(col))}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const row of result.rows) {
    html += '<tr>';
    for (const col of result.columns) {
      const val = row[col];
      const display = val === null ? '<span class="null-value">NULL</span>' : escapeHtml(String(val));
      html += `<td>${display}</td>`;
    }
    html += '</tr>';
  }

  html += `</tbody></table></div>`;
  return html;
}

async function runQuery() {
  const state = require('../../state');
  const activeId = state.getActiveConnection();
  if (!activeId) return;

  const input = document.getElementById('database-query-input');
  const sql = input ? input.value.trim() : state.getCurrentQuery().trim();
  if (!sql) return;

  panelState.queryRunning = true;
  renderContent();

  try {
    const result = await ctx.api.database.executeQuery({ id: activeId, sql, limit: 100 });
    state.setQueryResult(activeId, result);
  } catch (e) {
    state.setQueryResult(activeId, { error: e.message });
  }

  panelState.queryRunning = false;
  renderContent();
}

// ==================== Actions ====================

async function connectDatabase(id) {
  const state = require('../../state');
  const conn = state.getDatabaseConnection(id);
  if (!conn) return;

  state.setConnectionStatus(id, 'connecting');
  renderContent();

  // Retrieve password from keychain if needed
  let config = { ...conn };
  if (conn.type !== 'sqlite') {
    const cred = await ctx.api.database.getCredential({ id });
    if (cred.success && cred.password) {
      config.password = cred.password;
    }
  }

  const result = await ctx.api.database.connect({ id, config });
  state.setConnectionStatus(id, result.success ? 'connected' : 'error');
  state.setActiveConnection(id);

  if (result.success) {
    ctx.showToast({ type: 'success', title: t('database.connectionSuccess') });
    // Preload schema
    loadSchema(id);
  } else {
    ctx.showToast({ type: 'error', title: t('database.connectionFailed', { error: result.error }) });
  }

  renderContent();
}

async function disconnectDatabase(id) {
  const state = require('../../state');
  await ctx.api.database.disconnect({ id });
  state.setConnectionStatus(id, 'disconnected');
  state.setDatabaseSchema(id, null);
  renderContent();
}

async function deleteConnection(id) {
  if (!confirm(t('database.deleteConfirm'))) return;

  const state = require('../../state');
  const conn = state.getDatabaseConnection(id);

  // Disconnect if connected
  if (state.getConnectionStatus(id) === 'connected') {
    await ctx.api.database.disconnect({ id });
  }

  // Deprovision MCP if active
  if (conn && conn.mcpProvisioned && conn.projectId) {
    const project = getProject(conn.projectId);
    if (project) {
      await ctx.api.database.deprovisionMcp({ projectPath: project.path, mcpName: conn.mcpName });
    }
  }

  // Delete credential
  await ctx.api.database.setCredential({ id, password: '' }).catch(() => {});

  state.removeDatabaseConnection(id);
  await saveConnections();
  renderContent();
}

async function provisionMcp(id) {
  const state = require('../../state');
  const conn = state.getDatabaseConnection(id);
  if (!conn) return;

  // Need a project path
  const projectPath = conn.projectId ? getProject(conn.projectId)?.path : null;
  if (!projectPath) {
    ctx.showToast({ type: 'error', title: 'Link to a project first' });
    return;
  }

  // Get password for MCP env
  let config = { ...conn };
  if (conn.type !== 'sqlite') {
    const cred = await ctx.api.database.getCredential({ id });
    if (cred.success && cred.password) config.password = cred.password;
  }

  const result = await ctx.api.database.provisionMcp({ projectPath, config });
  if (result.success) {
    state.updateDatabaseConnection(id, { mcpProvisioned: true, mcpName: result.mcpName });
    await saveConnections();
    ctx.showToast({ type: 'success', title: t('database.mcpEnabled') });
  } else {
    ctx.showToast({ type: 'error', title: result.error });
  }

  renderContent();
}

async function deprovisionMcp(id) {
  const state = require('../../state');
  const conn = state.getDatabaseConnection(id);
  if (!conn || !conn.mcpName) return;

  const projectPath = conn.projectId ? getProject(conn.projectId)?.path : null;
  if (projectPath) {
    await ctx.api.database.deprovisionMcp({ projectPath, mcpName: conn.mcpName });
  }

  state.updateDatabaseConnection(id, { mcpProvisioned: false, mcpName: null });
  await saveConnections();
  ctx.showToast({ type: 'info', title: t('database.mcpDisabled') });
  renderContent();
}

async function runAutoDetect() {
  const state = require('../../state');
  const projects = state.projectsState ? state.projectsState.get().projects : ctx.projectsState.get().projects;
  const openedId = projects.length > 0 ? (state.projectsState || ctx.projectsState).get().openedProjectId : null;
  const project = openedId ? projects.find(p => p.id === openedId) : projects[0];

  if (!project || !project.path) {
    ctx.showToast({ type: 'warning', title: t('database.noDetected') });
    return;
  }

  ctx.showToast({ type: 'info', title: t('database.detecting') });
  const detected = await ctx.api.database.detect({ projectPath: project.path });

  if (detected && detected.length > 0) {
    // Tag detected with project id
    const tagged = detected.map(d => ({ ...d, projectId: project.id }));
    state.setDetectedDatabases(tagged);
    ctx.showToast({ type: 'success', title: t('database.detectedDatabases', { count: detected.length }) });
  } else {
    state.setDetectedDatabases([]);
    ctx.showToast({ type: 'info', title: t('database.noDetected') });
  }

  renderContent();
}

function importDetected(jsonStr) {
  try {
    const d = JSON.parse(jsonStr);
    showConnectionForm(null, d);
  } catch (e) { /* ignore */ }
}

// ==================== Connection Form ====================

function showConnectionForm(editId, prefill) {
  const state = require('../../state');
  const existing = editId ? state.getDatabaseConnection(editId) : null;
  const data = existing || prefill || {};

  const projects = (state.projectsState || ctx.projectsState).get().projects || [];

  const html = `
    <div class="database-form">
      <div class="database-form-row">
        <div class="database-form-group database-form-grow">
          <label class="database-form-label">${t('database.name')}</label>
          <input type="text" class="database-form-input" id="db-form-name" value="${escapeHtml(data.name || '')}" placeholder="My Database">
        </div>
        <div class="database-form-group">
          <label class="database-form-label">${t('database.type')}</label>
          <select class="database-form-select" id="db-form-type">
            <option value="sqlite" ${data.type === 'sqlite' ? 'selected' : ''}>SQLite</option>
            <option value="mysql" ${data.type === 'mysql' ? 'selected' : ''}>MySQL</option>
            <option value="postgresql" ${data.type === 'postgresql' ? 'selected' : ''}>PostgreSQL</option>
            <option value="mongodb" ${data.type === 'mongodb' ? 'selected' : ''}>MongoDB</option>
          </select>
        </div>
      </div>
      <div id="db-form-fields"></div>
      <div class="database-form-group">
        <label class="database-form-label">${t('database.linkToProject')}</label>
        <select class="database-form-select" id="db-form-project">
          <option value="">${t('database.noProject')}</option>
          ${projects.map(p => `<option value="${escapeHtml(p.id)}" ${data.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name || p.path)}</option>`).join('')}
        </select>
      </div>
      <div class="database-form-test-section">
        <button class="database-form-test-btn" id="db-form-test">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          ${t('database.testConnection')}
        </button>
        <div class="database-form-test-result" id="db-form-test-result"></div>
      </div>
    </div>`;

  const footer = `
    <button class="btn-secondary" id="db-form-cancel">${t('database.cancel')}</button>
    <button class="btn-primary" id="db-form-save">${t('database.save')}</button>`;

  ctx.showModal(editId ? t('database.editConnection') : t('database.addConnection'), html, footer);

  // Setup type-dependent fields
  const typeSelect = document.getElementById('db-form-type');
  const updateFields = () => renderFormFields(data, typeSelect.value);
  typeSelect.onchange = () => updateFields();
  updateFields();

  // Test button
  document.getElementById('db-form-test').onclick = async () => {
    const config = collectFormData();
    const testBtn = document.getElementById('db-form-test');
    const resultEl = document.getElementById('db-form-test-result');
    testBtn.disabled = true;
    testBtn.classList.add('testing');
    resultEl.textContent = t('database.testing');
    resultEl.className = 'database-form-test-result';

    const result = await ctx.api.database.testConnection(config);
    testBtn.disabled = false;
    testBtn.classList.remove('testing');
    if (result.success) {
      resultEl.textContent = t('database.connectionSuccess');
      resultEl.className = 'database-form-test-result success';
    } else {
      resultEl.textContent = t('database.connectionFailed', { error: result.error });
      resultEl.className = 'database-form-test-result error';
    }
  };

  // Save
  document.getElementById('db-form-save').onclick = async () => {
    const config = collectFormData();
    if (!config.name) config.name = `${config.type} - ${config.database || config.filePath || 'default'}`;

    const id = editId || `db-${Date.now()}`;
    const password = config.password;
    delete config.password;

    if (editId) {
      state.updateDatabaseConnection(editId, config);
    } else {
      state.addDatabaseConnection({ ...config, id });
    }

    // Store password
    if (password) {
      await ctx.api.database.setCredential({ id, password });
    }

    await saveConnections();
    ctx.closeModal();
    renderContent();
  };

  // Cancel
  document.getElementById('db-form-cancel').onclick = () => ctx.closeModal();
}

function renderFormFields(data, type) {
  const container = document.getElementById('db-form-fields');
  if (!container) return;

  if (type === 'sqlite') {
    container.innerHTML = `
      <div class="database-form-group">
        <label class="database-form-label">${t('database.filePath')}</label>
        <div class="database-form-input-row">
          <input type="text" class="database-form-input database-form-grow" id="db-form-filepath" value="${escapeHtml(data.filePath || '')}" placeholder="/path/to/database.db">
          <button class="database-form-browse-btn" id="db-form-browse">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            ${t('database.browse')}
          </button>
        </div>
      </div>`;
    const browseBtn = document.getElementById('db-form-browse');
    if (browseBtn) {
      browseBtn.onclick = async () => {
        const result = await ctx.api.dialog.openFile({ filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }] });
        if (result) document.getElementById('db-form-filepath').value = result;
      };
    }
  } else if (type === 'mongodb') {
    container.innerHTML = `
      <div class="database-form-group">
        <label class="database-form-label">${t('database.connectionString')}</label>
        <input type="text" class="database-form-input" id="db-form-connstring" value="${escapeHtml(data.connectionString || '')}" placeholder="mongodb://localhost:27017/mydb">
      </div>
      <div class="database-form-group">
        <label class="database-form-label">${t('database.databaseName')}</label>
        <input type="text" class="database-form-input" id="db-form-database" value="${escapeHtml(data.database || '')}" placeholder="mydb">
      </div>`;
  } else {
    // MySQL / PostgreSQL
    const defaultPort = type === 'mysql' ? '3306' : '5432';
    container.innerHTML = `
      <div class="database-form-row">
        <div class="database-form-group database-form-grow-2">
          <label class="database-form-label">${t('database.host')}</label>
          <input type="text" class="database-form-input" id="db-form-host" value="${escapeHtml(data.host || 'localhost')}" placeholder="localhost">
        </div>
        <div class="database-form-group database-form-grow">
          <label class="database-form-label">${t('database.port')}</label>
          <input type="number" class="database-form-input" id="db-form-port" value="${escapeHtml(String(data.port || defaultPort))}" placeholder="${defaultPort}">
        </div>
      </div>
      <div class="database-form-group">
        <label class="database-form-label">${t('database.databaseName')}</label>
        <input type="text" class="database-form-input" id="db-form-database" value="${escapeHtml(data.database || '')}" placeholder="mydb">
      </div>
      <div class="database-form-row">
        <div class="database-form-group database-form-grow">
          <label class="database-form-label">${t('database.username')}</label>
          <input type="text" class="database-form-input" id="db-form-username" value="${escapeHtml(data.username || '')}" placeholder="user">
        </div>
        <div class="database-form-group database-form-grow">
          <label class="database-form-label">${t('database.password')}</label>
          <input type="password" class="database-form-input" id="db-form-password" value="" placeholder="********">
        </div>
      </div>`;
  }
}

function collectFormData() {
  const type = document.getElementById('db-form-type').value;
  const name = document.getElementById('db-form-name').value.trim();
  const projectId = document.getElementById('db-form-project').value || null;

  const config = { type, name, projectId };

  if (type === 'sqlite') {
    config.filePath = document.getElementById('db-form-filepath')?.value.trim() || '';
  } else if (type === 'mongodb') {
    config.connectionString = document.getElementById('db-form-connstring')?.value.trim() || '';
    config.database = document.getElementById('db-form-database')?.value.trim() || '';
  } else {
    config.host = document.getElementById('db-form-host')?.value.trim() || 'localhost';
    config.port = parseInt(document.getElementById('db-form-port')?.value) || (type === 'mysql' ? 3306 : 5432);
    config.database = document.getElementById('db-form-database')?.value.trim() || '';
    config.username = document.getElementById('db-form-username')?.value.trim() || '';
    config.password = document.getElementById('db-form-password')?.value || '';
  }

  return config;
}

// ==================== Helpers ====================

async function saveConnections() {
  const state = require('../../state');
  const connections = state.getDatabaseConnections();
  await ctx.api.database.saveConnections({ connections });
}

function getProject(id) {
  const state = require('../../state');
  const projects = (state.projectsState || ctx.projectsState).get().projects || [];
  return projects.find(p => p.id === id);
}

function getProjectName(id) {
  const project = getProject(id);
  return project ? (project.name || ctx.path.basename(project.path)) : '';
}

module.exports = { init, loadPanel };
