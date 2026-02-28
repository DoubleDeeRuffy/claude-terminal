const { escapeHtml } = require('../../utils');
const WorkflowMarketplace = require('./WorkflowMarketplacePanel');
const { getAgents } = require('../../services/AgentService');
const { getSkills } = require('../../services/SkillService');
const { getGraphService, resetGraphService } = require('../../services/WorkflowGraphService');
const { LiteGraph } = require('litegraph.js');
const { projectsState } = require('../../state/projects.state');
const { schemaCache } = require('../../services/WorkflowSchemaCache');
const { showContextMenu } = require('../components/ContextMenu');
const { showConfirm } = require('../components/Modal');

let ctx = null;

const HOOK_TYPES = [
  { value: 'PreToolUse',        label: 'PreToolUse',        desc: 'Avant chaque outil' },
  { value: 'PostToolUse',       label: 'PostToolUse',       desc: 'Après chaque outil' },
  { value: 'PostToolUseFailure',label: 'PostToolUseFailure',desc: 'Après échec d\'un outil' },
  { value: 'Notification',      label: 'Notification',      desc: 'À chaque notification' },
  { value: 'UserPromptSubmit',  label: 'UserPromptSubmit',  desc: 'Soumission d\'un prompt' },
  { value: 'SessionStart',      label: 'SessionStart',      desc: 'Début de session' },
  { value: 'SessionEnd',        label: 'SessionEnd',        desc: 'Fin de session' },
  { value: 'Stop',              label: 'Stop',              desc: 'À l\'arrêt de Claude' },
  { value: 'SubagentStart',     label: 'SubagentStart',     desc: 'Lancement d\'un sous-agent' },
  { value: 'SubagentStop',      label: 'SubagentStop',      desc: 'Arrêt d\'un sous-agent' },
  { value: 'PreCompact',        label: 'PreCompact',        desc: 'Avant compaction mémoire' },
  { value: 'PermissionRequest', label: 'PermissionRequest', desc: 'Demande de permission' },
  { value: 'Setup',             label: 'Setup',             desc: 'Phase de setup' },
  { value: 'TeammateIdle',      label: 'TeammateIdle',      desc: 'Teammate inactif' },
  { value: 'TaskCompleted',     label: 'TaskCompleted',     desc: 'Tâche terminée' },
  { value: 'ConfigChange',     label: 'ConfigChange',     desc: 'Changement de config' },
  { value: 'WorktreeCreate',   label: 'WorktreeCreate',   desc: 'Création de worktree' },
  { value: 'WorktreeRemove',   label: 'WorktreeRemove',   desc: 'Suppression de worktree' },
];

// Output properties produced by each node type — used for autocomplete suggestions
const NODE_OUTPUTS = {
  claude:    ['output', 'success'],
  shell:     ['stdout', 'stderr', 'exitCode'],
  git:       ['output', 'success', 'action'],
  http:      ['status', 'ok', 'body'],
  file:      ['content', 'success', 'exists'],
  db:        ['rows', 'columns', 'rowCount', 'duration', 'firstRow'],
  condition: ['result', 'value'],
  wait:      ['waited', 'timedOut'],
  notify:    ['sent', 'message'],
  project:   ['success', 'action'],
  variable:  ['name', 'value', 'action'],
  log:       ['level', 'message', 'logged'],
  loop:      ['items', 'count'],
};

/**
 * Get autocomplete suggestions for variable references.
 * @param {Object} graph - LiteGraph graph instance
 * @param {number} currentNodeId - The node currently being edited
 * @param {string} filterText - Text typed after '$' to filter results
 * @returns {Array<{category: string, label: string, value: string, detail: string}>}
 */
function getAutocompleteSuggestions(graph, currentNodeId, filterText) {
  const suggestions = [];
  const filter = (filterText || '').toLowerCase();

  // Category 1: Context variables
  const ctxVars = [
    { value: '$ctx.project',  detail: 'Chemin du projet' },
    { value: '$ctx.branch',   detail: 'Branche Git active' },
    { value: '$ctx.date',     detail: 'Date du jour' },
    { value: '$ctx.trigger',  detail: 'Type de déclencheur' },
  ];
  for (const v of ctxVars) {
    if (v.value.toLowerCase().includes(filter)) {
      suggestions.push({ category: 'Contexte', label: v.value, value: v.value, detail: v.detail });
    }
  }

  // Category 2: Loop variables
  const loopVars = [
    { value: '$loop.item',  detail: 'Élément courant' },
    { value: '$loop.index', detail: 'Index (0-based)' },
    { value: '$loop.total', detail: 'Nombre total d\'items' },
  ];
  for (const v of loopVars) {
    if (v.value.toLowerCase().includes(filter)) {
      suggestions.push({ category: 'Loop', label: v.value, value: v.value, detail: v.detail });
    }
  }

  // Category 3: Node outputs
  if (graph && graph._nodes) {
    for (const node of graph._nodes) {
      if (node.id === currentNodeId) continue;
      const nodeType = (node.type || '').replace('workflow/', '');
      if (nodeType === 'trigger') continue;
      const outputs = NODE_OUTPUTS[nodeType];
      if (!outputs) continue;

      const nodeLabel = node.title || nodeType;
      const prefix = `$node_${node.id}`;

      for (const prop of outputs) {
        const full = `${prefix}.${prop}`;
        if (full.toLowerCase().includes(filter) || nodeLabel.toLowerCase().includes(filter)) {
          suggestions.push({
            category: 'Nodes',
            label: full,
            value: full,
            detail: `${nodeLabel} → ${prop}`,
          });
        }
      }
    }
  }

  // Category 4: Custom variables (from Variable nodes with action=set)
  if (graph && graph._nodes) {
    for (const node of graph._nodes) {
      const nodeType = (node.type || '').replace('workflow/', '');
      if (nodeType !== 'variable') continue;
      if (node.properties?.action !== 'set') continue;
      const varName = node.properties?.name;
      if (!varName) continue;
      const full = `$${varName}`;
      if (full.toLowerCase().includes(filter)) {
        suggestions.push({
          category: 'Variables',
          label: full,
          value: full,
          detail: `Variable custom`,
        });
      }
    }
  }

  return suggestions;
}

/**
 * Extract table name from a SQL query (FROM clause).
 */
function extractTableFromSQL(sql) {
  if (!sql) return null;
  const match = sql.match(/\bFROM\s+[`"']?(\w+(?:\.\w+)?)[`"']?/i);
  if (!match) return null;
  const name = match[1];
  return name.includes('.') ? name.split('.').pop() : name;
}

/**
 * BFS backward through graph links to find the nearest upstream DB node.
 */
function findUpstreamDbNode(graph, startNode) {
  if (!graph || !startNode) return null;
  const visited = new Set();
  const queue = [startNode];
  visited.add(startNode.id);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current.inputs) continue;

    for (const input of current.inputs) {
      if (!input.link) continue;
      const linkInfo = graph.links?.[input.link] || graph._links?.get?.(input.link);
      if (!linkInfo) continue;
      const originNode = graph.getNodeById(linkInfo.origin_id);
      if (!originNode || visited.has(originNode.id)) continue;
      visited.add(originNode.id);

      const originType = (originNode.type || '').replace('workflow/', '');
      if (originType === 'db') return originNode;
      queue.push(originNode);
    }
  }
  return null;
}

/**
 * Get deep autocomplete suggestions (async) — resolves DB column names from schema.
 * Called when user types second-level property like `$node_X.firstRow.` or `$loop.item.`
 */
async function getDeepAutocompleteSuggestions(graph, currentNodeId, filterText) {
  const suggestions = [];
  if (!graph || !filterText) return suggestions;

  // Match patterns like $node_X.firstRow. or $node_X.rows.
  const nodeMatch = filterText.match(/^\$node_(\d+)\.(firstRow|rows)\.(.*)?$/i);
  // Match patterns like $loop.item. or $item.
  const loopMatch = filterText.match(/^\$(loop\.item|item)\.(.*)?$/i);

  let dbNode = null;
  let columnFilter = '';

  if (nodeMatch) {
    const sourceNodeId = parseInt(nodeMatch[1], 10);
    columnFilter = (nodeMatch[3] || '').toLowerCase();
    const sourceNode = graph.getNodeById(sourceNodeId);
    if (sourceNode) {
      const sourceType = (sourceNode.type || '').replace('workflow/', '');
      if (sourceType === 'db') dbNode = sourceNode;
    }
  } else if (loopMatch) {
    columnFilter = (loopMatch[2] || '').toLowerCase();
    // Find the node being edited, then trace upstream to find a DB node
    const currentNode = graph.getNodeById(currentNodeId);
    if (currentNode) {
      dbNode = findUpstreamDbNode(graph, currentNode);
    }
  }

  if (!dbNode) return suggestions;

  // Extract connection and table from the DB node properties
  const connectionId = dbNode.properties?.connection;
  const sql = dbNode.properties?.query;
  const tableName = extractTableFromSQL(sql);

  if (!connectionId || !tableName) return suggestions;

  // Fetch schema (async, cached)
  await schemaCache.getSchema(connectionId);
  const columns = schemaCache.getColumnsForTable(connectionId, tableName);
  if (!columns || !columns.length) return suggestions;

  for (const col of columns) {
    const colName = col.name || col;
    const colType = col.type || '';
    if (columnFilter && !colName.toLowerCase().includes(columnFilter)) continue;

    const pkBadge = col.primaryKey ? ' 🔑' : '';
    suggestions.push({
      category: 'Colonnes DB',
      label: colName,
      value: filterText.substring(0, filterText.lastIndexOf('.') + 1) + colName,
      detail: `${colType}${pkBadge}`,
    });
  }

  return suggestions;
}

// ── Smart SQL textarea with autocomplete ─────────────────────────────────────

/**
 * Initialize the smart SQL textarea on a DB panel.
 * Adds: SQL autocomplete (tables/columns), template buttons, schema prefetch.
 */
async function initSmartSQL(container, node, graphService) {
  const connectionId = node.properties?.connection;
  const textarea = container.querySelector('.wf-sql-textarea');
  const templateBar = container.querySelector('.wf-sql-templates');
  if (!textarea) return;

  // Pass connection configs to schema cache for auto-connect
  if (_dbConnectionsCache) schemaCache.setConnectionConfigs(_dbConnectionsCache);

  // Autocomplete popup (shared with variable autocomplete but separate)
  let sqlPopup = container.querySelector('.wf-sql-ac-popup');
  if (!sqlPopup) {
    sqlPopup = document.createElement('div');
    sqlPopup.className = 'wf-sql-ac-popup';
    sqlPopup.style.display = 'none';
    container.appendChild(sqlPopup);
  }

  let acItems = [];
  let acIndex = 0;
  let acStart = -1; // cursor position where the current word starts

  function hideSqlAc() {
    sqlPopup.style.display = 'none';
    acItems = [];
    acIndex = 0;
  }

  function insertSqlAc(text) {
    if (acStart < 0) return;
    const before = textarea.value.substring(0, acStart);
    const after = textarea.value.substring(textarea.selectionStart);
    textarea.value = before + text + after;
    const newPos = acStart + text.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    hideSqlAc();
    textarea.focus();
  }

  function renderSqlAc(items, wordStart) {
    if (!items.length) { hideSqlAc(); return; }
    acItems = items;
    acIndex = 0;
    acStart = wordStart;

    sqlPopup.innerHTML = items.map((it, i) =>
      `<div class="wf-sql-ac-item${i === 0 ? ' active' : ''}" data-idx="${i}">
        <span class="wf-sql-ac-name">${escapeHtml(it.name)}</span>
        <span class="wf-sql-ac-type">${escapeHtml(it.type || '')}</span>
      </div>`
    ).join('');

    // Position below textarea at cursor
    const rect = textarea.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    sqlPopup.style.top = (rect.bottom - containerRect.top + 2) + 'px';
    sqlPopup.style.left = (rect.left - containerRect.left) + 'px';
    sqlPopup.style.width = rect.width + 'px';
    sqlPopup.style.display = 'block';

    sqlPopup.querySelectorAll('.wf-sql-ac-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertSqlAc(acItems[parseInt(el.dataset.idx, 10)].name);
      });
    });
  }

  // ── Prefetch schema ──
  let tables = []; // [{name, columns: [{name, type, primaryKey}]}]
  if (connectionId) {
    try {
      const fetched = await schemaCache.getSchema(connectionId);
      tables = fetched || [];
    } catch { /* silently fail */ }
  }

  // ── SQL Autocomplete logic ──
  textarea.addEventListener('input', () => {
    const val = textarea.value;
    const cursor = textarea.selectionStart;
    if (!tables.length) { hideSqlAc(); return; }

    // Find current word (before cursor)
    let wordStart = cursor;
    while (wordStart > 0 && /[\w.]/.test(val[wordStart - 1])) wordStart--;
    const word = val.substring(wordStart, cursor).toLowerCase();

    if (!word) { hideSqlAc(); return; }

    // Determine context: after FROM/INTO/UPDATE/JOIN → suggest tables
    // after table. or known table ref → suggest columns
    const beforeWord = val.substring(0, wordStart).replace(/\s+$/, '').toUpperCase();
    const lastKeyword = beforeWord.match(/(FROM|INTO|UPDATE|JOIN|TABLE)\s*$/i);
    const dotParts = word.split('.');

    let suggestions = [];

    if (dotParts.length === 2) {
      // tableName.col → suggest columns of that table
      const tableName = dotParts[0];
      const colFilter = dotParts[1];
      const table = tables.find(t => t.name.toLowerCase() === tableName);
      if (table?.columns) {
        suggestions = table.columns
          .filter(c => (c.name || '').toLowerCase().startsWith(colFilter))
          .map(c => ({ name: c.name, type: c.type + (c.primaryKey ? ' PK' : '') }));
      }
    } else if (lastKeyword) {
      // After FROM/INTO/UPDATE/JOIN → suggest table names
      suggestions = tables
        .filter(t => t.name.toLowerCase().startsWith(word))
        .map(t => ({ name: t.name, type: `${t.columns?.length || 0} cols` }));
    } else {
      // General context: suggest tables and SQL keywords if short
      suggestions = tables
        .filter(t => t.name.toLowerCase().startsWith(word))
        .map(t => ({ name: t.name, type: 'table' }));
      // Also suggest columns from all tables (deduplicated) if there's a match
      if (word.length >= 2) {
        const seen = new Set(suggestions.map(s => s.name));
        for (const table of tables) {
          for (const col of (table.columns || [])) {
            const colName = col.name || '';
            if (!seen.has(colName) && colName.toLowerCase().startsWith(word)) {
              seen.add(colName);
              suggestions.push({ name: colName, type: `${table.name}.${col.type || ''}` });
            }
          }
        }
      }
    }

    if (suggestions.length > 12) suggestions = suggestions.slice(0, 12);
    renderSqlAc(suggestions, wordStart);
  });

  textarea.addEventListener('keydown', (e) => {
    if (sqlPopup.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acIndex = Math.min(acIndex + 1, acItems.length - 1);
      sqlPopup.querySelectorAll('.wf-sql-ac-item').forEach((el, i) => el.classList.toggle('active', i === acIndex));
      sqlPopup.querySelector('.wf-sql-ac-item.active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acIndex = Math.max(acIndex - 1, 0);
      sqlPopup.querySelectorAll('.wf-sql-ac-item').forEach((el, i) => el.classList.toggle('active', i === acIndex));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (acItems.length) { e.preventDefault(); insertSqlAc(acItems[acIndex].name); }
    } else if (e.key === 'Escape') {
      e.preventDefault(); hideSqlAc();
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => hideSqlAc(), 150);
  });

  // ── Template buttons ──
  if (templateBar && tables.length) {
    templateBar.querySelectorAll('.wf-sql-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        const tpl = btn.dataset.tpl;
        const firstTable = tables[0]?.name || 'table_name';
        let sql = '';
        switch (tpl) {
          case 'select': sql = `SELECT * FROM ${firstTable}\nWHERE \nORDER BY \nLIMIT 100`; break;
          case 'insert': sql = `INSERT INTO ${firstTable} (col1, col2)\nVALUES ('val1', 'val2')`; break;
          case 'update': sql = `UPDATE ${firstTable}\nSET col1 = 'val1'\nWHERE id = `; break;
          case 'delete': sql = `DELETE FROM ${firstTable}\nWHERE id = `; break;
        }
        textarea.value = sql;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        // Position cursor after the first table name for easy editing
        const tablePos = sql.indexOf(firstTable) + firstTable.length;
        textarea.setSelectionRange(tablePos, tablePos);
      });
    });
  }
}

/**
 * Build loop preview info by tracing the upstream connection.
 * Returns { html, itemDesc } for display in the Loop panel.
 */
function getLoopPreview(loopNode, graphService) {
  const noPreview = { html: '', itemDesc: 'Valeur de l\'itération courante' };
  if (!graphService?.graph || !loopNode) return noPreview;

  const graph = graphService.graph;

  // Find what's connected to Loop's In slot (slot 0)
  const inSlot = loopNode.inputs?.[0];
  if (!inSlot?.link) return { html: '<div class="wf-loop-preview wf-loop-preview--empty"><span class="wf-loop-preview-icon">⚠</span> Aucun node connecté au port <strong>In</strong></div>', itemDesc: 'Valeur de l\'itération courante' };

  const linkInfo = graph.links?.[inSlot.link] || graph._links?.get?.(inSlot.link);
  if (!linkInfo) return noPreview;

  const sourceNode = graph.getNodeById(linkInfo.origin_id);
  if (!sourceNode) return noPreview;

  const sourceType = (sourceNode.type || '').replace('workflow/', '');
  const sourceName = sourceNode.title || sourceType;
  const sourceProps = sourceNode.properties || {};

  // Determine what the source produces
  let dataType = '';
  let dataDesc = '';
  let itemDesc = 'Valeur de l\'itération courante';
  let previewItems = [];

  if (sourceType === 'db') {
    const action = sourceProps.action || 'query';
    if (action === 'query') {
      const table = extractTableFromSQL(sourceProps.query);
      dataType = 'rows[]';
      dataDesc = table ? `Lignes de <code>${escapeHtml(table)}</code>` : 'Résultats de la requête SQL';
      itemDesc = table ? `Ligne de ${table} (objet avec colonnes)` : 'Ligne de résultat (objet)';
    } else if (action === 'tables') {
      dataType = 'string[]';
      dataDesc = 'Noms des tables de la base';
      itemDesc = 'Nom de table (string)';
    } else if (action === 'schema') {
      dataType = 'object[]';
      dataDesc = 'Tables avec leurs colonnes';
      itemDesc = 'Table (objet avec name, columns)';
    }
  } else if (sourceType === 'shell') {
    dataType = 'lines';
    dataDesc = 'Sortie du shell (stdout)';
    itemDesc = 'Ligne de sortie';
  } else if (sourceType === 'http') {
    dataType = 'array';
    dataDesc = 'Réponse HTTP (body)';
    itemDesc = 'Élément du tableau de réponse';
  } else if (sourceType === 'file') {
    dataType = 'lines';
    dataDesc = 'Contenu du fichier';
    itemDesc = 'Ligne du fichier';
  } else {
    dataType = 'auto';
    dataDesc = `Sortie de ${escapeHtml(sourceName)}`;
    itemDesc = 'Élément de la sortie';
  }

  // Check for last run output for actual preview
  const lastOutput = graphService.getNodeOutput(sourceNode.id);
  if (lastOutput) {
    // Extract array from output
    if (Array.isArray(lastOutput)) previewItems = lastOutput;
    else if (Array.isArray(lastOutput.rows)) previewItems = lastOutput.rows;
    else if (Array.isArray(lastOutput.tables)) previewItems = lastOutput.tables;
    else if (Array.isArray(lastOutput.items)) previewItems = lastOutput.items;
  }

  const countText = previewItems.length > 0 ? `<span class="wf-loop-preview-count">${previewItems.length} items</span>` : '';

  // Build preview items list (max 5)
  let previewHtml = '';
  if (previewItems.length > 0) {
    const shown = previewItems.slice(0, 5);
    previewHtml = `<div class="wf-loop-preview-list">${shown.map((item, i) => {
      const text = typeof item === 'string' ? item : (item?.name || JSON.stringify(item));
      return `<div class="wf-loop-preview-item"><span class="wf-loop-preview-idx">${i}</span><code>${escapeHtml(String(text).substring(0, 60))}</code></div>`;
    }).join('')}${previewItems.length > 5 ? `<div class="wf-loop-preview-more">… +${previewItems.length - 5} autres</div>` : ''}</div>`;
  }

  const html = `
    <div class="wf-loop-preview">
      <div class="wf-loop-preview-header">
        <span class="wf-loop-preview-source">${escapeHtml(sourceName)}</span>
        <span class="wf-loop-preview-type">${dataType}</span>
        ${countText}
      </div>
      <div class="wf-loop-preview-desc">${dataDesc}</div>
      ${previewHtml}
    </div>
  `;

  return { html, itemDesc };
}

const STEP_TYPES = [
  { type: 'trigger',   label: 'Trigger',   color: 'success',  icon: svgPlay(11),     desc: 'Déclencheur du workflow' },
  // ── Actions ──
  { type: 'claude',    label: 'Claude',    color: 'accent',   icon: svgClaude(),     desc: 'Prompt, Agent ou Skill',  category: 'action' },
  { type: 'shell',     label: 'Shell',     color: 'info',     icon: svgShell(),      desc: 'Commande bash',           category: 'action' },
  { type: 'git',       label: 'Git',       color: 'purple',   icon: svgGit(),        desc: 'Opération git',           category: 'action' },
  { type: 'http',      label: 'HTTP',      color: 'cyan',     icon: svgHttp(),       desc: 'Requête API',             category: 'action' },
  { type: 'notify',    label: 'Notify',    color: 'warning',  icon: svgNotify(),     desc: 'Notification',            category: 'action' },
  // ── Data ──
  { type: 'project',   label: 'Project',   color: 'pink',     icon: svgProject(),    desc: 'Cibler un projet',        category: 'data' },
  { type: 'file',      label: 'File',      color: 'lime',     icon: svgFile(),       desc: 'Opération fichier',       category: 'data' },
  { type: 'db',        label: 'Database',  color: 'orange',   icon: svgDb(),         desc: 'Requête base de données', category: 'data' },
  { type: 'variable',  label: 'Variable',  color: 'violet',   icon: svgVariable(),   desc: 'Lire/écrire une variable',category: 'data' },
  // ── Flow ──
  { type: 'condition', label: 'Condition', color: 'success',  icon: svgCond(),       desc: 'Branchement conditionnel',category: 'flow' },
  { type: 'loop',      label: 'Loop',      color: 'sky',      icon: svgLoop(),       desc: 'Itérer sur une liste',    category: 'flow' },
  { type: 'wait',      label: 'Wait',      color: 'muted',    icon: svgWait(),       desc: 'Temporisation',           category: 'flow' },
  { type: 'log',       label: 'Log',       color: 'slate',    icon: svgLog(),        desc: 'Écrire dans le log',      category: 'flow' },
];

const GIT_ACTIONS = [
  { value: 'pull',     label: 'Pull',     desc: 'Récupérer les changements distants' },
  { value: 'push',     label: 'Push',     desc: 'Pousser les commits locaux' },
  { value: 'commit',   label: 'Commit',   desc: 'Créer un commit', extra: [{ key: 'message', label: 'Message de commit', placeholder: 'feat: add new feature', mono: true }] },
  { value: 'checkout', label: 'Checkout', desc: 'Changer de branche', extra: [{ key: 'branch', label: 'Branche', placeholder: 'main / develop / feature/...', mono: true }] },
  { value: 'merge',    label: 'Merge',    desc: 'Fusionner une branche', extra: [{ key: 'branch', label: 'Branche source', placeholder: 'feature/my-branch', mono: true }] },
  { value: 'stash',    label: 'Stash',    desc: 'Mettre de côté les changements' },
  { value: 'stash-pop',label: 'Stash Pop',desc: 'Restaurer les changements mis de côté' },
  { value: 'reset',    label: 'Reset',    desc: 'Annuler les changements non commités' },
];

const WAIT_UNITS = [
  { value: 's', label: 'Secondes' },
  { value: 'm', label: 'Minutes' },
  { value: 'h', label: 'Heures' },
];

const CONDITION_VARS = [
  { value: '$ctx.branch',      label: 'Branche actuelle' },
  { value: '$ctx.exitCode',    label: 'Code de sortie' },
  { value: '$ctx.project',     label: 'Nom du projet' },
  { value: '$ctx.prevStatus',  label: 'Statut step précédent' },
  { value: '$env.',            label: 'Variable d\'env', extra: [{ key: 'envVar', label: 'Nom', placeholder: 'NODE_ENV', mono: true }] },
];

const CONDITION_OPS = [
  { value: '==', label: '==', group: 'compare' },
  { value: '!=', label: '!=', group: 'compare' },
  { value: '>',  label: '>',  group: 'compare' },
  { value: '<',  label: '<',  group: 'compare' },
  { value: '>=', label: '>=', group: 'compare' },
  { value: '<=', label: '<=', group: 'compare' },
  { value: 'contains',    label: 'contient',     group: 'text' },
  { value: 'starts_with', label: 'commence par', group: 'text' },
  { value: 'matches',     label: 'regex',        group: 'text' },
  { value: 'is_empty',     label: 'est vide',      group: 'unary' },
  { value: 'is_not_empty', label: 'n\'est pas vide', group: 'unary' },
];

function buildConditionPreview(variable, op, value, isUnary) {
  if (!variable) return '(aucune condition)';
  if (isUnary) return `${variable} ${op}`;
  return `${variable} ${op} ${value || '?'}`;
}

const STEP_FIELDS = {
  shell: [
    { key: 'command', label: 'Commande', placeholder: 'npm run build', mono: true },
  ],
  claude: [
    { key: 'mode', label: 'Mode', type: 'claude-mode-tabs' },
    { key: 'prompt', label: 'Prompt', type: 'variable-textarea', showIf: (s) => !s.mode || s.mode === 'prompt' },
    { key: 'agentId', label: 'Agent', type: 'agent-picker', showIf: (s) => s.mode === 'agent' },
    { key: 'skillId', label: 'Skill', type: 'skill-picker', showIf: (s) => s.mode === 'skill' },
    { key: 'prompt', label: 'Instructions additionnelles', placeholder: 'Contexte supplémentaire (optionnel)', textarea: true, showIf: (s) => s.mode === 'agent' || s.mode === 'skill' },
    { key: 'model', label: 'Modèle', type: 'model-select' },
    { key: 'effort', label: 'Effort', type: 'effort-select' },
    { key: 'outputSchema', label: 'Sortie structurée', type: 'structured-output' },
  ],
  agent: 'claude',
  git: [
    { key: 'action', label: 'Action', type: 'action-select', actions: GIT_ACTIONS },
  ],
  http: [
    { key: 'method', label: 'Méthode', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
    { key: 'url', label: 'URL', placeholder: 'https://api.example.com/endpoint', mono: true },
    { key: 'headers', label: 'Headers', placeholder: 'Content-Type: application/json', textarea: true, mono: true, showIf: (s) => ['POST', 'PUT', 'PATCH'].includes(s.method) },
    { key: 'body', label: 'Body', placeholder: '{ "key": "value" }', textarea: true, mono: true, showIf: (s) => ['POST', 'PUT', 'PATCH'].includes(s.method) },
  ],
  notify: [
    { key: 'title', label: 'Titre', placeholder: 'Build terminé' },
    { key: 'message', label: 'Message', placeholder: 'Le build $project est OK', textarea: true },
  ],
  wait: [
    { key: 'duration', label: 'Durée', type: 'duration-picker' },
  ],
  condition: [
    { key: 'condition', label: 'Condition', type: 'condition-builder' },
  ],
};

// Resolve step type with backward compat (agent → claude)
const STEP_TYPE_ALIASES = { agent: 'claude' };
const findStepType = (type) => {
  const resolved = STEP_TYPE_ALIASES[type] || type;
  return STEP_TYPES.find(x => x.type === resolved) || STEP_TYPES[0];
};

const TRIGGER_CONFIG = {
  cron: {
    label: 'Cron',
    desc: 'Planifié à heures fixes',
    icon: svgClock(),
    color: 'info',
    extra: 'cronPicker',
  },
  hook: {
    label: 'Hook Claude',
    desc: 'Réagit aux événements',
    icon: svgHook(),
    color: 'accent',
    extra: 'hookType',
  },
  on_workflow: {
    label: 'Après workflow',
    desc: 'Enchaîné à un autre',
    icon: svgChain(),
    color: 'purple',
    fields: [
      { id: 'triggerValue', label: 'Nom du workflow source', placeholder: 'Daily Code Review', mono: false },
    ],
  },
  manual: {
    label: 'Manuel',
    desc: 'Déclenché à la demande',
    icon: svgPlay(),
    color: 'success',
    fields: [],
  },
};

/* ─── Cron picker ──────────────────────────────────────────────────────────── */

const CRON_MODES = [
  { id: 'interval', label: 'Intervalle' },
  { id: 'daily',    label: 'Quotidien' },
  { id: 'weekly',   label: 'Hebdo' },
  { id: 'monthly',  label: 'Mensuel' },
  { id: 'custom',   label: 'Custom' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lundi' },    { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' }, { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' }, { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];

const INTERVAL_OPTIONS = [
  { value: 5,  label: '5 min' },   { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },  { value: 60, label: '1 heure' },
  { value: 120, label: '2 heures' }, { value: 180, label: '3 heures' },
  { value: 240, label: '4 heures' }, { value: 360, label: '6 heures' },
  { value: 480, label: '8 heures' }, { value: 720, label: '12 heures' },
];

function buildCronFromMode(mode, v) {
  switch (mode) {
    case 'interval': {
      const mins = v.interval || 15;
      if (mins >= 60) return `0 */${mins / 60} * * *`;
      return `*/${mins} * * * *`;
    }
    case 'daily':   return `${v.minute || 0} ${v.hour ?? 8} * * *`;
    case 'weekly':  return `${v.minute || 0} ${v.hour ?? 8} * * ${v.dow ?? 1}`;
    case 'monthly': return `${v.minute || 0} ${v.hour ?? 8} ${v.dom || 1} * *`;
    default: return v.raw || '* * * * *';
  }
}

function parseCronToMode(expr) {
  if (!expr || !expr.trim()) return { mode: 'daily', values: { hour: 8, minute: 0 } };
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { mode: 'custom', values: { raw: expr } };

  const [min, hour, dom, mon, dow] = parts;

  // Interval: */N * * * * or 0 */N * * *
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { mode: 'interval', values: { interval: parseInt(min.slice(2)) } };
  }
  if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    return { mode: 'interval', values: { interval: parseInt(hour.slice(2)) * 60 } };
  }

  // Weekly: N N * * N
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
    return { mode: 'weekly', values: { hour: +hour, minute: +min, dow: +dow } };
  }

  // Monthly: N N N * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return { mode: 'monthly', values: { hour: +hour, minute: +min, dom: +dom } };
  }

  // Daily: N N * * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return { mode: 'daily', values: { hour: +hour, minute: +min } };
  }

  return { mode: 'custom', values: { raw: expr } };
}

/** Build HTML for a custom dropdown (div-based, no native <select>) */
function wfDropdown(key, options, selectedValue) {
  const sel = options.find(o => String(o.value) === String(selectedValue)) || options[0];
  return `<div class="wf-cdrop" data-cv="${key}">
    <button class="wf-cdrop-btn" type="button">${escapeHtml(sel.label)}<svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <div class="wf-cdrop-list">${options.map(o =>
      `<div class="wf-cdrop-item ${String(o.value) === String(selectedValue) ? 'active' : ''}" data-val="${o.value}">${escapeHtml(o.label)}</div>`
    ).join('')}</div>
  </div>`;
}

/** Bind a wfDropdown by data-cv key inside a container. Calls onChange(value) on pick. */
function bindWfDropdown(container, key, onChange) {
  const drop = container.querySelector(`.wf-cdrop[data-cv="${key}"]`);
  if (!drop) return;
  const btn = drop.querySelector('.wf-cdrop-btn');
  const list = drop.querySelector('.wf-cdrop-list');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.wf-cdrop.open').forEach(d => { if (d !== drop) d.classList.remove('open'); });
    drop.classList.toggle('open');
    if (drop.classList.contains('open')) {
      const active = list.querySelector('.wf-cdrop-item.active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  });

  list.querySelectorAll('.wf-cdrop-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      drop.classList.remove('open');
      btn.firstChild.textContent = item.textContent;
      list.querySelectorAll('.wf-cdrop-item').forEach(it => it.classList.remove('active'));
      item.classList.add('active');
      onChange(item.dataset.val);
    });
  });

  // Close on outside click — auto-cleanup if element is detached from DOM
  const close = (e) => {
    if (!document.body.contains(drop)) { document.removeEventListener('click', close); return; }
    if (!drop.contains(e.target)) { drop.classList.remove('open'); document.removeEventListener('click', close); }
  };
  document.addEventListener('click', close);
}

/** Generate option arrays for the cron dropdowns */
function cronOpts() {
  return {
    hour: Array.from({ length: 24 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') })),
    minute: [0, 15, 30, 45].map(m => ({ value: m, label: String(m).padStart(2, '0') })),
    dow: DAYS_OF_WEEK,
    dom: Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}` })),
    interval: INTERVAL_OPTIONS,
  };
}

function drawCronPicker(container, draft) {
  const parsed = parseCronToMode(draft.triggerValue);
  let cronMode = parsed.mode;
  let cronValues = { ...parsed.values };
  const opts = cronOpts();
  let _prevCloseAll = null; // Track previous document listener for cleanup

  const render = () => {
    // Clean up previous document-level listener before re-render
    if (_prevCloseAll) {
      document.removeEventListener('click', _prevCloseAll);
      _prevCloseAll = null;
    }
    let phrase = '';
    switch (cronMode) {
      case 'interval':
        phrase = `<span class="wf-cron-label">Toutes les</span>${wfDropdown('interval', opts.interval, cronValues.interval || 15)}`;
        break;
      case 'daily':
        phrase = `<span class="wf-cron-label">Chaque jour à</span>${wfDropdown('hour', opts.hour, cronValues.hour ?? 8)}<span class="wf-cron-label">h</span>${wfDropdown('minute', opts.minute, cronValues.minute || 0)}`;
        break;
      case 'weekly':
        phrase = `<span class="wf-cron-label">Chaque</span>${wfDropdown('dow', opts.dow, cronValues.dow ?? 1)}<span class="wf-cron-label">à</span>${wfDropdown('hour', opts.hour, cronValues.hour ?? 8)}<span class="wf-cron-label">h</span>${wfDropdown('minute', opts.minute, cronValues.minute || 0)}`;
        break;
      case 'monthly':
        phrase = `<span class="wf-cron-label">Le</span>${wfDropdown('dom', opts.dom, cronValues.dom || 1)}<span class="wf-cron-label">de chaque mois à</span>${wfDropdown('hour', opts.hour, cronValues.hour ?? 8)}<span class="wf-cron-label">h</span>${wfDropdown('minute', opts.minute, cronValues.minute || 0)}`;
        break;
      case 'custom':
        phrase = `<input class="wf-input wf-input--mono" id="wf-cron-raw" placeholder="0 8 * * *" value="${escapeHtml(cronValues.raw || draft.triggerValue || '')}">`;
        break;
    }

    const cron = cronMode === 'custom' ? (cronValues.raw || draft.triggerValue || '') : buildCronFromMode(cronMode, cronValues);
    draft.triggerValue = cron;

    container.innerHTML = `
      <div class="wf-cron-modes">
        ${CRON_MODES.map(m => `<button class="wf-cron-mode ${cronMode === m.id ? 'active' : ''}" data-cm="${m.id}">${m.label}</button>`).join('')}
      </div>
      <div class="wf-cron-phrase">${phrase}</div>
      ${cron ? `<div class="wf-cron-preview"><code>${escapeHtml(cron)}</code></div>` : ''}
    `;

    // Bind mode buttons
    container.querySelectorAll('[data-cm]').forEach(btn => {
      btn.addEventListener('click', () => {
        cronMode = btn.dataset.cm;
        cronValues = { hour: cronValues.hour ?? 8, minute: cronValues.minute || 0, dow: cronValues.dow ?? 1, dom: cronValues.dom || 1, interval: cronValues.interval || 15 };
        render();
      });
    });

    // Bind custom dropdowns
    container.querySelectorAll('.wf-cdrop').forEach(drop => {
      const btn = drop.querySelector('.wf-cdrop-btn');
      const list = drop.querySelector('.wf-cdrop-list');
      const key = drop.dataset.cv;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other open dropdowns first
        container.querySelectorAll('.wf-cdrop.open').forEach(d => { if (d !== drop) d.classList.remove('open'); });
        drop.classList.toggle('open');
        // Scroll active item into view
        if (drop.classList.contains('open')) {
          const activeItem = list.querySelector('.wf-cdrop-item.active');
          if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
        }
      });

      list.querySelectorAll('.wf-cdrop-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = isNaN(+item.dataset.val) ? item.dataset.val : +item.dataset.val;
          cronValues[key] = val;
          drop.classList.remove('open');
          // Update button label
          btn.firstChild.textContent = item.textContent;
          // Mark active
          list.querySelectorAll('.wf-cdrop-item').forEach(it => it.classList.remove('active'));
          item.classList.add('active');
          // Update cron
          draft.triggerValue = buildCronFromMode(cronMode, cronValues);
          const prev = container.querySelector('.wf-cron-preview code');
          if (prev) prev.textContent = draft.triggerValue;
        });
      });
    });

    // Close dropdowns on outside click
    const closeAll = (e) => {
      if (!container.contains(e.target)) {
        container.querySelectorAll('.wf-cdrop.open').forEach(d => d.classList.remove('open'));
      }
    };
    _prevCloseAll = closeAll;
    document.addEventListener('click', closeAll);

    // Bind custom input
    const rawInput = container.querySelector('#wf-cron-raw');
    if (rawInput) {
      rawInput.addEventListener('input', () => {
        cronValues.raw = rawInput.value;
        draft.triggerValue = rawInput.value;
        const prev = container.querySelector('.wf-cron-preview code');
        if (prev) prev.textContent = rawInput.value;
      });
    }
  };

  render();
}

const state = {
  workflows: [],
  runs: [],
  activeTab: 'workflows',  // 'workflows' | 'runs' | 'hub'
};

function init(context) {
  ctx = context;
  WorkflowMarketplace.init(context);
}

async function load() {
  renderPanel();
  await refreshData();
  renderContent();
  registerLiveListeners();
}

const api = window.electron_api?.workflow;

/** Fetch workflows + recent runs from backend */
async function refreshData() {
  try {
    const [wfRes, runRes] = await Promise.all([
      api?.list(),
      api?.getRecentRuns(50),
    ]);
    if (wfRes?.success) state.workflows = wfRes.workflows;
    if (runRes?.success) state.runs = runRes.runs;
  } catch (e) {
    console.error('[WorkflowPanel] Failed to load data:', e);
  }
}

let listenersRegistered = false;
/** Register real-time event listeners for live run updates */
function registerLiveListeners() {
  if (listenersRegistered || !api) return;
  listenersRegistered = true;

  api.onRunStart(({ run }) => {
    state.runs.unshift(run);
    // Clear previous run outputs for fresh tooltip data
    try { getGraphService().clearRunOutputs(); } catch (_) {}
    renderContent();
  });

  api.onRunEnd(({ runId, status, duration }) => {
    const run = state.runs.find(r => r.id === runId);
    if (run) {
      run.status = status;
      run.duration = duration;
    }
    renderContent();
  });

  api.onStepUpdate(({ runId, stepId, status, output }) => {
    const run = state.runs.find(r => r.id === runId);
    if (run) {
      const step = run.steps?.find(s => s.id === stepId);
      if (step) {
        step.status = status;
        if (output) step.output = output;
      }
    }
    // Store step output for link tooltip preview
    if (output && status === 'success') {
      try {
        const graphService = getGraphService();
        if (graphService?.graph) {
          // Find the litegraph node matching this stepId
          for (const node of graphService.graph._nodes) {
            if (node.properties?.stepId === stepId || `node_${node.id}` === stepId) {
              graphService.setNodeOutput(node.id, output);
              break;
            }
          }
        }
      } catch (_) { /* ignore */ }
    }
    renderContent();
  });

  // MCP graph edit tools signal a reload after modifying definitions.json directly
  api.onListUpdated(({ workflows }) => {
    if (workflows) state.workflows = workflows;
    renderContent();
  });
}

/* ─── Panel shell ──────────────────────────────────────────────────────────── */

function renderPanel() {
  const el = document.getElementById('workflow-panel');
  if (!el) return;

  el.innerHTML = `
    <div class="wf-panel">
      <div class="wf-topbar">
        <div class="wf-topbar-tabs">
          <button class="wf-tab active" data-wftab="workflows">
            Workflows <span class="wf-badge">3</span>
          </button>
          <button class="wf-tab" data-wftab="runs">
            Historique <span class="wf-badge">4</span>
          </button>
          <button class="wf-tab" data-wftab="hub">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Hub
          </button>
        </div>
        <button class="wf-create-btn" id="wf-btn-new">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Nouveau
        </button>
      </div>
      <div class="wf-content" id="wf-content"></div>
    </div>
  `;

  el.querySelector('#wf-btn-new').addEventListener('click', () => openEditor());
  el.querySelectorAll('.wf-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      el.querySelectorAll('.wf-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.wftab;
      renderContent();
    });
  });
}

function renderContent() {
  const el = document.getElementById('wf-content');
  if (!el) return;
  // Update badge counts
  const panel = document.getElementById('workflow-panel');
  if (panel) {
    const badges = panel.querySelectorAll('.wf-badge');
    if (badges[0]) badges[0].textContent = state.workflows.length;
    if (badges[1]) badges[1].textContent = state.runs.length;
  }
  if (state.activeTab === 'workflows') renderWorkflowList(el);
  else if (state.activeTab === 'runs') renderRunHistory(el);
  else if (state.activeTab === 'hub') WorkflowMarketplace.render(el);
}

/* ─── Workflow list ────────────────────────────────────────────────────────── */

function renderWorkflowList(el) {
  if (!state.workflows.length) {
    el.innerHTML = `
      <div class="wf-empty">
        <div class="wf-empty-glyph">${svgWorkflow(36)}</div>
        <p class="wf-empty-title">Aucun workflow</p>
        <p class="wf-empty-sub">Automatisez vos tâches répétitives avec Claude</p>
        <button class="wf-create-btn" id="wf-empty-new">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Créer un workflow
        </button>
      </div>
    `;
    el.querySelector('#wf-empty-new').addEventListener('click', () => openEditor());
    return;
  }

  el.innerHTML = `<div class="wf-list">${state.workflows.map(wf => cardHtml(wf)).join('')}</div>`;

  el.querySelectorAll('.wf-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.wf-card-body').addEventListener('click', (e) => {
      // Don't trigger detail when clicking interactive elements
      if (e.target.closest('.wf-card-run') || e.target.closest('.wf-card-edit') || e.target.closest('.wf-switch') || e.target.closest('.wf-card-toggle')) return;
      openDetail(id);
    });
    card.querySelector('.wf-card-run')?.addEventListener('click', e => { e.stopPropagation(); triggerWorkflow(id); });
    card.querySelector('.wf-card-edit')?.addEventListener('click', e => { e.stopPropagation(); openEditor(id); });
    const toggle = card.querySelector('.wf-card-toggle');
    if (toggle) {
      toggle.addEventListener('change', e => { e.stopPropagation(); toggleWorkflow(id, e.target.checked); });
      toggle.closest('.wf-switch')?.addEventListener('click', e => e.stopPropagation());
    }

    // Right-click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wf = state.workflows.find(w => w.id === id);
      if (!wf) return;
      showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Modifier', icon: svgEdit(), onClick: () => openEditor(id) },
          { label: 'Lancer maintenant', icon: svgPlay(12), onClick: () => triggerWorkflow(id) },
          { label: 'Dupliquer', icon: svgCopy(), onClick: () => duplicateWorkflow(id) },
          { separator: true },
          { label: 'Supprimer', icon: svgTrash(), danger: true, onClick: () => confirmDeleteWorkflow(id, wf.name) },
        ],
      });
    });
  });
}

function cardHtml(wf) {
  const lastRun = state.runs.find(r => r.workflowId === wf.id);
  const cfg = TRIGGER_CONFIG[wf.trigger?.type] || TRIGGER_CONFIG.manual;
  const runCount = state.runs.filter(r => r.workflowId === wf.id).length;
  const successCount = state.runs.filter(r => r.workflowId === wf.id && r.status === 'success').length;

  return `
    <div class="wf-card ${wf.enabled ? '' : 'wf-card--off'}" data-id="${wf.id}">
      <div class="wf-card-accent wf-card-accent--${cfg.color}"></div>
      <div class="wf-card-body">
        <div class="wf-card-top">
          <div class="wf-card-title-row">
            <span class="wf-card-name">${escapeHtml(wf.name)}</span>
            ${!wf.enabled ? '<span class="wf-card-paused">PAUSED</span>' : ''}
          </div>
          <div class="wf-card-top-right">
            ${lastRun ? `<span class="wf-status-pill wf-status-pill--${lastRun.status}">${statusDot(lastRun.status)}${statusLabel(lastRun.status)}</span>` : ''}
            <label class="wf-switch"><input type="checkbox" class="wf-card-toggle" ${wf.enabled ? 'checked' : ''}><span class="wf-switch-track"></span></label>
          </div>
        </div>
        <div class="wf-card-pipeline">
          ${(wf.steps || []).map((s, i) => {
            const info = findStepType((s.type || '').split('.')[0]);
            const stepStatus = lastRun ? (lastRun.steps?.[i]?.status || '') : '';
            return `<div class="wf-pipe-step ${stepStatus ? 'wf-pipe-step--' + stepStatus : ''}" title="${escapeHtml(s.type || '')}">
              <span class="wf-chip wf-chip--${info.color}">${info.icon}</span>
              <span class="wf-pipe-label">${escapeHtml(info.label)}</span>
            </div>${i < wf.steps.length - 1 ? '<span class="wf-pipe-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>' : ''}`;
          }).join('')}
        </div>
        <div class="wf-card-footer">
          <span class="wf-trigger-tag wf-trigger-tag--${cfg.color}">
            ${cfg.icon}
            ${escapeHtml(cfg.label)}
            ${wf.trigger?.value ? `<code>${escapeHtml(wf.trigger.value)}</code>` : ''}
            ${wf.hookType ? `<code>${escapeHtml(wf.hookType)}</code>` : ''}
          </span>
          <div class="wf-card-stats">
            ${runCount > 0 ? `<span class="wf-card-stat">${svgRuns()} ${runCount} run${runCount > 1 ? 's' : ''}</span>` : ''}
            ${runCount > 0 ? `<span class="wf-card-stat wf-card-stat--rate">${Math.round(successCount / runCount * 100)}%</span>` : ''}
            ${lastRun ? `<span class="wf-card-stat">${svgClock(9)} ${fmtDuration(lastRun.duration)}</span>` : ''}
          </div>
          <button class="wf-card-edit" title="Modifier"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="wf-card-run" title="Lancer maintenant">${svgPlay(11)} <span>Run</span></button>
        </div>
      </div>
    </div>
  `;
}

/* ─── Run history ──────────────────────────────────────────────────────────── */

function renderRunHistory(el) {
  if (!state.runs.length) {
    el.innerHTML = `<div class="wf-empty"><p class="wf-empty-title">Aucun run</p><p class="wf-empty-sub">Les exécutions s'afficheront ici</p></div>`;
    return;
  }

  const INITIAL_LIMIT = 15;
  const showAll = el._showAllRuns || false;
  const runs = showAll ? state.runs : state.runs.slice(0, INITIAL_LIMIT);
  const hasMore = state.runs.length > INITIAL_LIMIT && !showAll;

  function buildRunRow(run) {
    const wf = state.workflows.find(w => w.id === run.workflowId);
    return `
      <div class="wf-run wf-run--${run.status}" data-run-id="${run.id}">
        <div class="wf-run-bar wf-run-bar--${run.status}"></div>
        <div class="wf-run-body">
          <div class="wf-run-header">
            <div class="wf-run-header-left">
              <span class="wf-run-name">${escapeHtml(wf?.name || 'Supprimé')}</span>
              <div class="wf-run-meta">
                <span class="wf-run-time">${svgClock(9)} ${fmtTime(run.startedAt)}</span>
                <span class="wf-run-duration">${svgTimer()} ${fmtDuration(run.duration)}</span>
              </div>
            </div>
            <div class="wf-run-header-right">
              <span class="wf-run-trigger-tag">${escapeHtml(run.trigger)}</span>
              <span class="wf-status-pill wf-status-pill--${run.status}">${statusDot(run.status)}${statusLabel(run.status)}</span>
            </div>
          </div>
          <div class="wf-run-pipeline">
            ${(run.steps || []).map((s, i) => {
              const sType = (s.type || s.name || '').split('.')[0];
              const info = findStepType(sType);
              return `<div class="wf-run-pipe-step wf-run-pipe-step--${s.status}">
                <span class="wf-run-pipe-icon wf-chip wf-chip--${info.color}">${info.icon}</span>
                <span class="wf-run-pipe-name">${escapeHtml(s.type || s.name || '')}</span>
                <span class="wf-run-pipe-status">${s.status === 'success' ? '✓' : s.status === 'failed' ? '✗' : s.status === 'skipped' ? '–' : '…'}</span>
              </div>${i < (run.steps || []).length - 1 ? '<div class="wf-run-pipe-connector"></div>' : ''}`;
            }).join('')}
          </div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    <div class="wf-runs-header">
      <span class="wf-runs-count">${state.runs.length} run${state.runs.length > 1 ? 's' : ''}</span>
      <button class="wf-runs-clear" id="wf-clear-runs" title="Effacer l'historique">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        Effacer
      </button>
    </div>
    <div class="wf-runs">
      ${runs.map(buildRunRow).join('')}
      ${hasMore ? `<div class="wf-runs-show-more" id="wf-show-more-runs">Afficher ${state.runs.length - INITIAL_LIMIT} runs de plus</div>` : ''}
    </div>
  `;

  // Clear all runs
  const clearBtn = el.querySelector('#wf-clear-runs');
  if (clearBtn) {
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirm({
        title: 'Effacer l\'historique',
        message: `Supprimer les ${state.runs.length} runs de l'historique ? Cette action est irréversible.`,
        confirmLabel: 'Effacer',
        danger: true,
      });
      if (!confirmed) return;
      await api?.clearAllRuns();
      state.runs = [];
      renderContent();
    });
  }

  // Bind click to open run detail
  el.querySelectorAll('.wf-run[data-run-id]').forEach(runEl => {
    runEl.addEventListener('click', () => {
      const run = state.runs.find(r => r.id === runEl.dataset.runId);
      if (run) renderRunDetail(el, run);
    });
  });

  // Show more button
  const showMoreBtn = el.querySelector('#wf-show-more-runs');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      el._showAllRuns = true;
      renderRunHistory(el);
    });
  }
}

/* ─── Run Detail View ──────────────────────────────────────────────────── */

function renderRunDetail(el, run) {
  const wf = state.workflows.find(w => w.id === run.workflowId);
  const steps = run.steps || [];

  el.innerHTML = `
    <div class="wf-run-detail">
      <div class="wf-run-detail-header">
        <button class="wf-run-detail-back" id="wf-run-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="wf-run-detail-info">
          <span class="wf-run-detail-name">${escapeHtml(wf?.name || 'Workflow supprimé')}</span>
          <div class="wf-run-detail-meta">
            ${svgClock(9)} ${fmtTime(run.startedAt)}
            <span style="margin:0 6px;opacity:.3">·</span>
            ${svgTimer()} ${fmtDuration(run.duration)}
            <span style="margin:0 6px;opacity:.3">·</span>
            <span class="wf-run-trigger-tag" style="font-size:10px">${escapeHtml(run.trigger)}</span>
          </div>
        </div>
        <span class="wf-status-pill wf-status-pill--${run.status}">${statusDot(run.status)}${statusLabel(run.status)}</span>
      </div>
      <div class="wf-run-detail-steps">
        ${steps.map((step, i) => {
          const sType = (step.type || step.name || '').split('.')[0];
          const info = findStepType(sType);
          const hasOutput = step.output != null;
          return `
            <div class="wf-run-step wf-run-step--${step.status}" data-step-idx="${i}">
              <div class="wf-run-step-header">
                <span class="wf-run-step-icon wf-chip wf-chip--${info.color}">${info.icon}</span>
                <span class="wf-run-step-name">${escapeHtml(step.id || step.type || '')}</span>
                <span class="wf-run-step-type">${escapeHtml(sType)}</span>
                <span class="wf-run-step-dur">${fmtDuration(step.duration)}</span>
                <span class="wf-run-step-status-icon">${step.status === 'success' ? '✓' : step.status === 'failed' ? '✗' : step.status === 'skipped' ? '–' : '…'}</span>
                ${hasOutput ? '<svg class="wf-run-step-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
              </div>
              ${hasOutput ? `<div class="wf-run-step-output" style="display:none"><pre class="wf-run-step-pre">${escapeHtml(formatStepOutput(step.output))}</pre></div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Back button
  el.querySelector('#wf-run-back').addEventListener('click', () => renderContent());

  // Toggle step outputs
  el.querySelectorAll('.wf-run-step').forEach(stepEl => {
    const header = stepEl.querySelector('.wf-run-step-header');
    const output = stepEl.querySelector('.wf-run-step-output');
    if (!output) return;
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const visible = output.style.display !== 'none';
      output.style.display = visible ? 'none' : 'block';
      stepEl.classList.toggle('expanded', !visible);
    });
  });
}

function formatStepOutput(output) {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/* ─── Node Graph Editor ─────────────────────────────────────────────────── */

// Cache for DB connections (loaded from disk via IPC, independent of Database panel state)
let _dbConnectionsCache = null;
async function loadDbConnections() {
  try {
    _dbConnectionsCache = await window.electron_api.database.loadConnections() || [];
  } catch { _dbConnectionsCache = []; }
}

function openEditor(workflowId = null) {
  const wf = workflowId ? state.workflows.find(w => w.id === workflowId) : null;
  const editorDraft = {
    name: wf?.name || '',
    scope: wf?.scope || 'current',
    concurrency: wf?.concurrency || 'skip',
    dirty: false,
  };

  // ── Render editor into the panel ──
  const panel = document.getElementById('workflow-panel');
  if (!panel) return;

  // Pre-load DB connections from disk (async, used by DB node properties)
  loadDbConnections();

  const graphService = getGraphService();

  // Store previous panel content for restore
  const prevContent = panel.innerHTML;
  const nodeTypes = STEP_TYPES.filter(st => st.type !== 'trigger');

  // ── Build editor HTML ──
  panel.innerHTML = `
    <div class="wf-editor">
      <div class="wf-editor-toolbar">
        <button class="wf-editor-back" id="wf-ed-back"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg> Retour</button>
        <div class="wf-editor-toolbar-sep"></div>
        <input class="wf-editor-name wf-input" id="wf-ed-name" value="${escapeHtml(editorDraft.name)}" placeholder="Nom du workflow…" />
        <span class="wf-editor-dirty" id="wf-ed-dirty" style="display:none" title="Modifications non sauvegardées"></span>
        <div class="wf-editor-toolbar-sep"></div>
        <div class="wf-editor-zoom">
          <button id="wf-ed-zoom-out" title="Zoom out">−</button>
          <span id="wf-ed-zoom-label">100%</span>
          <button id="wf-ed-zoom-in" title="Zoom in">+</button>
          <button id="wf-ed-zoom-reset" title="Reset to 100%">1:1</button>
          <button id="wf-ed-zoom-fit" title="Fit all nodes">Fit</button>
        </div>
        <div class="wf-editor-toolbar-sep"></div>
        <button class="wf-editor-btn wf-editor-btn--run" id="wf-ed-run">${svgPlay(10)} Run</button>
        <button class="wf-editor-btn wf-editor-btn--primary" id="wf-ed-save"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save</button>
      </div>
      <div class="wf-editor-body">
        <div class="wf-editor-palette" id="wf-ed-palette">
          ${[
            { key: 'action', title: 'Actions' },
            { key: 'data',   title: 'Données' },
            { key: 'flow',   title: 'Contrôle' },
          ].map(cat => {
            const items = nodeTypes.filter(st => st.category === cat.key);
            if (!items.length) return '';
            return `<div class="wf-palette-title">${cat.title}</div>` +
              items.map(st => `
                <div class="wf-palette-item" data-node-type="workflow/${st.type}" data-color="${st.color}" data-tooltip="${st.label}" title="${st.label} — ${st.desc}">
                  <span class="wf-palette-icon wf-chip wf-chip--${st.color}">${st.icon}</span>
                </div>
              `).join('');
          }).join('')}
        </div>
        <div class="wf-editor-canvas-wrap" id="wf-ed-canvas-wrap">
          <canvas id="wf-litegraph-canvas"></canvas>
        </div>
        <div class="wf-editor-properties" id="wf-ed-properties">
          <div class="wf-props-empty">
            <div class="wf-props-empty-icon-wrap">
              <svg class="wf-props-empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
            </div>
            <div class="wf-props-empty-title">Propriétés</div>
            <p class="wf-props-empty-text">Sélectionnez un node pour<br>configurer ses paramètres</p>
          </div>
        </div>
      </div>
      <div class="wf-editor-statusbar">
        <span class="wf-sb-section" id="wf-ed-nodecount"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> 0 nodes</span>
        <span class="wf-sb-sep"></span>
        <span class="wf-sb-section wf-sb-name" id="wf-ed-sb-name">${escapeHtml(editorDraft.name) || 'Sans titre'}</span>
        <span class="wf-sb-section wf-sb-dirty" id="wf-ed-sb-dirty" style="display:none">Modifié</span>
        <span class="wf-sb-spacer"></span>
        <span class="wf-sb-section" id="wf-ed-zoom-pct">100%</span>
      </div>
    </div>
  `;

  // ── Init LiteGraph canvas ──
  const canvasWrap = panel.querySelector('#wf-ed-canvas-wrap');
  const canvasEl = panel.querySelector('#wf-litegraph-canvas');
  canvasEl.width = canvasWrap.offsetWidth;
  canvasEl.height = canvasWrap.offsetHeight;

  graphService.init(canvasEl);

  // Load or create empty
  if (wf) {
    graphService.loadFromWorkflow(wf);
  } else {
    graphService.createEmpty();
  }

  // ── Status bar updates ──
  const updateStatusBar = () => {
    const count = graphService.getNodeCount();
    const countEl = panel.querySelector('#wf-ed-nodecount');
    const zoomEl = panel.querySelector('#wf-ed-zoom-pct');
    const zoomLabel = panel.querySelector('#wf-ed-zoom-label');
    const sbName = panel.querySelector('#wf-ed-sb-name');
    const sbDirty = panel.querySelector('#wf-ed-sb-dirty');
    const toolbarDirty = panel.querySelector('#wf-ed-dirty');
    if (countEl) countEl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> ${count} node${count !== 1 ? 's' : ''}`;
    const pct = Math.round(graphService.getZoom() * 100);
    if (zoomEl) zoomEl.textContent = `${pct}%`;
    if (zoomLabel) zoomLabel.textContent = `${pct}%`;
    if (sbName) sbName.textContent = editorDraft.name || 'Sans titre';
    if (sbDirty) sbDirty.style.display = editorDraft.dirty ? '' : 'none';
    if (toolbarDirty) toolbarDirty.style.display = editorDraft.dirty ? '' : 'none';
  };
  updateStatusBar();

  // ── Resize observer ──
  const resizeObs = new ResizeObserver(() => {
    if (canvasWrap && canvasEl) {
      graphService.resize(canvasWrap.offsetWidth, canvasWrap.offsetHeight);
      updateStatusBar();
    }
  });
  resizeObs.observe(canvasWrap);

  // ── Properties panel rendering ──
  const renderProperties = (node) => {
    const propsEl = panel.querySelector('#wf-ed-properties');
    if (!propsEl) return;

    if (!node) {
      // Show workflow options when no node selected
      propsEl.innerHTML = `
        <div class="wf-props-section">
          <div class="wf-props-header wf-props-header--workflow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <div class="wf-props-header-text">
              <div class="wf-props-title">Configuration</div>
              <div class="wf-props-subtitle">Options globales du workflow</div>
            </div>
          </div>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgScope()} Scope d'exécution</label>
            <span class="wf-field-hint">Sur quels projets ce workflow peut s'exécuter</span>
            <select class="wf-step-edit-input wf-props-input" data-prop="scope">
              <option value="current" ${editorDraft.scope === 'current' ? 'selected' : ''}>Projet courant uniquement</option>
              <option value="specific" ${editorDraft.scope === 'specific' ? 'selected' : ''}>Projet spécifique</option>
              <option value="all" ${editorDraft.scope === 'all' ? 'selected' : ''}>Tous les projets</option>
            </select>
          </div>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgConc()} Concurrence</label>
            <span class="wf-field-hint">Comportement si le workflow est déjà en cours</span>
            <select class="wf-step-edit-input wf-props-input" data-prop="concurrency">
              <option value="skip" ${editorDraft.concurrency === 'skip' ? 'selected' : ''}>Skip (ignorer si en cours)</option>
              <option value="queue" ${editorDraft.concurrency === 'queue' ? 'selected' : ''}>Queue (file d'attente)</option>
              <option value="parallel" ${editorDraft.concurrency === 'parallel' ? 'selected' : ''}>Parallel (instances multiples)</option>
            </select>
          </div>
        </div>
      `;
      // Upgrade native selects to custom dropdowns
      upgradeSelectsToDropdowns(propsEl);
      // Bind workflow option inputs
      propsEl.querySelectorAll('.wf-props-input').forEach(input => {
        input.addEventListener('change', () => {
          editorDraft[input.dataset.prop] = input.value;
          editorDraft.dirty = true;
        });
      });
      return;
    }

    // Show node properties
    const nodeType = node.type.replace('workflow/', '');
    const typeInfo = findStepType(nodeType) || { label: nodeType, color: 'muted', icon: '' };
    const props = node.properties || {};

    let fieldsHtml = '';

    // Trigger node properties
    if (nodeType === 'trigger') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgTriggerType()} Déclencheur</label>
          <span class="wf-field-hint">Comment ce workflow démarre</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="triggerType">
            <option value="manual" ${props.triggerType === 'manual' ? 'selected' : ''}>Manuel (bouton play)</option>
            <option value="cron" ${props.triggerType === 'cron' ? 'selected' : ''}>Planifié (cron)</option>
            <option value="hook" ${props.triggerType === 'hook' ? 'selected' : ''}>Hook Claude</option>
            <option value="on_workflow" ${props.triggerType === 'on_workflow' ? 'selected' : ''}>Après un workflow</option>
          </select>
        </div>
        ${props.triggerType === 'cron' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgClock()} Expression cron</label>
          <span class="wf-field-hint">min heure jour mois jour-semaine</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="triggerValue" value="${escapeHtml(props.triggerValue || '')}" placeholder="*/5 * * * *" />
        </div>` : ''}
        ${props.triggerType === 'hook' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgHook()} Type de hook</label>
          <span class="wf-field-hint">Événement Claude qui déclenche le workflow</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="hookType">
            ${HOOK_TYPES.map(h => `<option value="${h.value}" ${props.hookType === h.value ? 'selected' : ''}>${h.label} — ${h.desc}</option>`).join('')}
          </select>
        </div>` : ''}
        ${props.triggerType === 'on_workflow' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgLink()} Workflow source</label>
          <span class="wf-field-hint">Nom du workflow à surveiller</span>
          <input class="wf-step-edit-input wf-node-prop" data-key="triggerValue" value="${escapeHtml(props.triggerValue || '')}" placeholder="deploy-production" />
        </div>` : ''}
      `;
    }
    // Claude node properties
    else if (nodeType === 'claude') {
      const mode = props.mode || 'prompt';
      const agents = getAgents() || [];
      const skills = (getSkills() || []).filter(s => s.userInvocable !== false);
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgMode()} Mode d'exécution</label>
          <div class="wf-claude-mode-tabs">
            <button class="wf-claude-mode-tab ${mode === 'prompt' ? 'active' : ''}" data-mode="prompt">
              ${svgPrompt(16)}
              <span class="wf-claude-mode-tab-label">Prompt</span>
            </button>
            <button class="wf-claude-mode-tab ${mode === 'agent' ? 'active' : ''}" data-mode="agent">
              ${svgAgent()}
              <span class="wf-claude-mode-tab-label">Agent</span>
            </button>
            <button class="wf-claude-mode-tab ${mode === 'skill' ? 'active' : ''}" data-mode="skill">
              ${svgSkill(16)}
              <span class="wf-claude-mode-tab-label">Skill</span>
            </button>
          </div>
        </div>
        ${mode === 'prompt' || !mode ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgPrompt(10)} Prompt</label>
          <span class="wf-field-hint">Instructions envoyées à Claude</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="5" placeholder="Analyse ce fichier et résume les changements...">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        ${mode === 'agent' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgAgent(10)} Agent</label>
          <span class="wf-field-hint">Worker autonome avec contexte isolé</span>
          <div class="wf-agent-grid">
            ${agents.length ? agents.map(a => `
              <div class="wf-agent-card ${props.agentId === a.id ? 'active' : ''}" data-agent-id="${a.id}">
                <span class="wf-agent-card-icon">${svgAgent(14)}</span>
                <div class="wf-agent-card-text">
                  <span class="wf-agent-card-name">${escapeHtml(a.name)}</span>
                  ${a.description ? `<span class="wf-agent-card-desc">${escapeHtml(a.description)}</span>` : ''}
                </div>
                <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            `).join('') : '<div class="wf-agent-empty"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>Aucun agent dans ~/.claude/agents/</div>'}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgPrompt(10)} Instructions</label>
          <span class="wf-field-hint">Contexte additionnel pour l'agent</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2" placeholder="Focus on performance issues...">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        ${mode === 'skill' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgSkill(10)} Skill</label>
          <span class="wf-field-hint">Commande spécialisée à invoquer</span>
          <div class="wf-agent-grid">
            ${skills.length ? skills.map(s => `
              <div class="wf-agent-card ${props.skillId === s.id ? 'active' : ''}" data-skill-id="${s.id}">
                <span class="wf-agent-card-icon">${svgSkill(14)}</span>
                <div class="wf-agent-card-text">
                  <span class="wf-agent-card-name">${escapeHtml(s.name)}</span>
                  ${s.description ? `<span class="wf-agent-card-desc">${escapeHtml(s.description)}</span>` : ''}
                </div>
                <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            `).join('') : '<div class="wf-agent-empty"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>Aucun skill dans ~/.claude/skills/</div>'}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgPrompt(10)} Arguments</label>
          <span class="wf-field-hint">Texte passé au skill comme argument</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2" placeholder="Arguments optionnels...">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        <div class="wf-field-row">
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">Modèle</label>
            <select class="wf-step-edit-input wf-node-prop" data-key="model">
              <option value="" ${!props.model ? 'selected' : ''}>Auto</option>
              <option value="sonnet" ${props.model === 'sonnet' ? 'selected' : ''}>Sonnet</option>
              <option value="opus" ${props.model === 'opus' ? 'selected' : ''}>Opus</option>
              <option value="haiku" ${props.model === 'haiku' ? 'selected' : ''}>Haiku</option>
            </select>
          </div>
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">Effort</label>
            <select class="wf-step-edit-input wf-node-prop" data-key="effort">
              <option value="" ${!props.effort ? 'selected' : ''}>Auto</option>
              <option value="low" ${props.effort === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${props.effort === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${props.effort === 'high' ? 'selected' : ''}>High</option>
            </select>
          </div>
        </div>
      `;
    }
    // Shell node
    else if (nodeType === 'shell') {
      const allProjects = projectsState.get().projects || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgProject()} Exécuter dans</label>
          <span class="wf-field-hint">Répertoire de travail de la commande</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="projectId">
            <option value="" ${!props.projectId ? 'selected' : ''}>Projet courant (contexte workflow)</option>
            ${allProjects.map(p => `<option value="${p.id}" ${props.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgShell()} Commande</label>
          <span class="wf-field-hint">Commande bash exécutée dans un terminal</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="command" rows="3" placeholder="npm run build && npm test">${escapeHtml(props.command || '')}</textarea>
        </div>
      `;
    }
    // Git node
    else if (nodeType === 'git') {
      const allProjects = projectsState.get().projects || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgProject()} Projet cible</label>
          <span class="wf-field-hint">Dépôt git sur lequel opérer</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="projectId">
            <option value="" ${!props.projectId ? 'selected' : ''}>Projet courant (contexte workflow)</option>
            ${allProjects.map(p => `<option value="${p.id}" ${props.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgGit()} Action</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            ${GIT_ACTIONS.map(a => `<option value="${a.value}" ${props.action === a.value ? 'selected' : ''}>${a.label} — ${a.desc}</option>`).join('')}
          </select>
        </div>
        ${props.action === 'commit' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Message de commit</label>
          <span class="wf-field-hint">Convention: type(scope): description</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="message" value="${escapeHtml(props.message || '')}" placeholder="feat(auth): add password reset" />
        </div>` : ''}
        ${props.action === 'checkout' || props.action === 'merge' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgBranch()} Branche</label>
          <span class="wf-field-hint">Nom de la branche git</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="branch" value="${escapeHtml(props.branch || '')}" placeholder="feature/my-branch" />
        </div>` : ''}
      `;
    }
    // HTTP node
    else if (nodeType === 'http') {
      fieldsHtml = `
        <div class="wf-field-row">
          <div class="wf-step-edit-field" style="width:100px;flex-shrink:0">
            <label class="wf-step-edit-label">Méthode</label>
            <select class="wf-step-edit-input wf-node-prop" data-key="method">
              ${['GET','POST','PUT','PATCH','DELETE'].map(m => `<option value="${m}" ${props.method === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="wf-step-edit-field" style="flex:1">
            <label class="wf-step-edit-label">URL</label>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="url" value="${escapeHtml(props.url || '')}" placeholder="https://api.example.com/v1/users" />
          </div>
        </div>
        ${['POST','PUT','PATCH'].includes(props.method) ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Headers</label>
          <span class="wf-field-hint">Objet JSON des en-têtes HTTP</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="headers" rows="2" placeholder='{"Authorization": "Bearer $token"}'>${escapeHtml(props.headers || '')}</textarea>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Body</label>
          <span class="wf-field-hint">Corps de la requête (JSON)</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="body" rows="3" placeholder='{"name": "John", "email": "john@example.com"}'>${escapeHtml(props.body || '')}</textarea>
        </div>` : ''}
      `;
    }
    // Notify node
    else if (nodeType === 'notify') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgNotify()} Titre</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="title" value="${escapeHtml(props.title || '')}" placeholder="Build terminé" />
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Message</label>
          <span class="wf-field-hint">Variables : $ctx.project, $ctx.branch, $node_X.output</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="message" rows="3" placeholder="Le build de $ctx.project est terminé avec succès.">${escapeHtml(props.message || '')}</textarea>
        </div>
      `;
    }
    // Wait node
    else if (nodeType === 'wait') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgWait()} Durée</label>
          <span class="wf-field-hint">Formats: 5s, 2m, 1h, 500ms</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="duration" value="${escapeHtml(props.duration || '5s')}" placeholder="5s" />
        </div>
      `;
    }
    // Condition node
    else if (nodeType === 'condition') {
      const condMode = props._condMode || 'builder';
      const currentOp = props.operator || '==';
      const isUnary = currentOp === 'is_empty' || currentOp === 'is_not_empty';
      const compareOps = CONDITION_OPS.filter(o => o.group === 'compare');
      const textOps = CONDITION_OPS.filter(o => o.group === 'text');
      const unaryOps = CONDITION_OPS.filter(o => o.group === 'unary');
      fieldsHtml = `
        <div class="wf-cond-mode-toggle">
          <button class="wf-cond-mode-btn ${condMode === 'builder' ? 'active' : ''}" data-cond-mode="builder">Builder</button>
          <button class="wf-cond-mode-btn ${condMode === 'expression' ? 'active' : ''}" data-cond-mode="expression">Expression</button>
        </div>
        <div class="wf-cond-builder" ${condMode === 'expression' ? 'style="display:none"' : ''}>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgVariable()} Variable</label>
            <span class="wf-field-hint">$variable ou valeur libre — Autocomplete avec $</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="variable" value="${escapeHtml(props.variable || '')}" placeholder="$ctx.branch" />
          </div>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">Opérateur</label>
            <div class="wf-cond-ops">
              <div class="wf-cond-ops-group">
                ${compareOps.map(o => `<button class="wf-cond-op-btn ${currentOp === o.value ? 'active' : ''}" data-op="${o.value}" title="${o.label}">${o.value}</button>`).join('')}
              </div>
              <div class="wf-cond-ops-group">
                ${textOps.map(o => `<button class="wf-cond-op-btn ${currentOp === o.value ? 'active' : ''}" data-op="${o.value}" title="${o.label}">${o.label}</button>`).join('')}
              </div>
              <div class="wf-cond-ops-group">
                ${unaryOps.map(o => `<button class="wf-cond-op-btn wf-cond-op-unary ${currentOp === o.value ? 'active' : ''}" data-op="${o.value}" title="${o.label}">${o.label}</button>`).join('')}
              </div>
            </div>
          </div>
          <div class="wf-step-edit-field wf-cond-value-field" ${isUnary ? 'style="display:none"' : ''}>
            <label class="wf-step-edit-label">Valeur</label>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="value" value="${escapeHtml(props.value || '')}" placeholder="main" />
          </div>
          <div class="wf-cond-preview">
            <code class="wf-cond-preview-code">${escapeHtml(buildConditionPreview(props.variable, currentOp, props.value, isUnary))}</code>
          </div>
        </div>
        <div class="wf-cond-expression" ${condMode === 'builder' ? 'style="display:none"' : ''}>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgVariable()} Expression</label>
            <span class="wf-field-hint">Expression libre — ex: $node_1.rows.length > 0</span>
            <textarea class="wf-step-edit-input wf-node-prop wf-field-mono wf-cond-expr-input" data-key="expression" rows="2" placeholder="$node_1.exitCode == 0">${escapeHtml(props.expression || '')}</textarea>
          </div>
        </div>
      `;
    }
    // Project node
    else if (nodeType === 'project') {
      const allProjects = projectsState.get().projects || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgProject()} Projet</label>
          <span class="wf-field-hint">Projet cible de cette opération</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="projectId">
            <option value="">-- Choisir un projet --</option>
            ${allProjects.map(p => `<option value="${p.id}" ${props.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <span class="wf-field-hint">Opération à effectuer sur le projet</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="set_context" ${props.action === 'set_context' ? 'selected' : ''}>Définir comme contexte actif</option>
            <option value="open" ${props.action === 'open' ? 'selected' : ''}>Ouvrir dans l'éditeur</option>
            <option value="build" ${props.action === 'build' ? 'selected' : ''}>Lancer le build</option>
            <option value="install" ${props.action === 'install' ? 'selected' : ''}>Installer les dépendances</option>
            <option value="test" ${props.action === 'test' ? 'selected' : ''}>Exécuter les tests</option>
          </select>
        </div>
      `;
    }
    // File node
    else if (nodeType === 'file') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="read" ${props.action === 'read' ? 'selected' : ''}>Lire le fichier</option>
            <option value="write" ${props.action === 'write' ? 'selected' : ''}>Écrire (remplacer)</option>
            <option value="append" ${props.action === 'append' ? 'selected' : ''}>Ajouter à la fin</option>
            <option value="copy" ${props.action === 'copy' ? 'selected' : ''}>Copier</option>
            <option value="delete" ${props.action === 'delete' ? 'selected' : ''}>Supprimer</option>
            <option value="exists" ${props.action === 'exists' ? 'selected' : ''}>Vérifier existence</option>
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgFile()} Chemin</label>
          <span class="wf-field-hint">Chemin relatif ou absolu du fichier</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="path" value="${escapeHtml(props.path || '')}" placeholder="./src/index.js" />
        </div>
        ${props.action === 'copy' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgFile()} Destination</label>
          <span class="wf-field-hint">Chemin cible pour la copie</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="destination" value="${escapeHtml(props.destination || '')}" placeholder="./backup/index.js.bak" />
        </div>` : ''}
        ${props.action === 'write' || props.action === 'append' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Contenu</label>
          <span class="wf-field-hint">Texte ou données à écrire dans le fichier</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="content" rows="4" placeholder="console.log('Hello world');">${escapeHtml(props.content || '')}</textarea>
        </div>` : ''}
      `;
    }
    // DB node
    else if (nodeType === 'db') {
      const dbConns = _dbConnectionsCache || [];
      const dbAction = props.action || 'query';
      const selectedConn = dbConns.find(c => c.id === props.connection);
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgDb()} Connexion</label>
          <span class="wf-field-hint">Base de données configurée dans l'app</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="connection">
            <option value="">-- Choisir une connexion --</option>
            ${dbConns.map(c => `<option value="${c.id}" ${props.connection === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${c.type || 'sql'})</option>`).join('')}
          </select>
          ${!dbConns.length ? '<span class="wf-field-hint" style="color:rgba(251,191,36,.6)">Aucune connexion — onglet Database</span>' : ''}
          ${selectedConn ? `<span class="wf-field-hint" style="color:rgba(251,191,36,.5)">${selectedConn.type || 'sql'}${selectedConn.host ? ' — ' + escapeHtml(selectedConn.host) : ''}${selectedConn.database ? '/' + escapeHtml(selectedConn.database) : ''}</span>` : ''}
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <span class="wf-field-hint">Type d'opération sur la base</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="query" ${dbAction === 'query' ? 'selected' : ''}>Query — Exécuter une requête SQL</option>
            <option value="schema" ${dbAction === 'schema' ? 'selected' : ''}>Schema — Lister les tables et colonnes</option>
            <option value="tables" ${dbAction === 'tables' ? 'selected' : ''}>Tables — Lister les noms de tables</option>
          </select>
        </div>
        ${dbAction === 'query' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Requête SQL</label>
          <div class="wf-sql-templates">
            <button class="wf-sql-tpl" data-tpl="select">SELECT</button>
            <button class="wf-sql-tpl" data-tpl="insert">INSERT</button>
            <button class="wf-sql-tpl" data-tpl="update">UPDATE</button>
            <button class="wf-sql-tpl" data-tpl="delete">DELETE</button>
          </div>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono wf-sql-textarea" data-key="query" rows="5" placeholder="SELECT * FROM users WHERE active = 1" spellcheck="false">${escapeHtml(props.query || '')}</textarea>
          <span class="wf-field-hint">Autocomplete : tables et colonnes en tapant. Variables : $ctx, $node_X, $loop</span>
        </div>
        <div class="wf-field-row">
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">${svgCond()} Limite</label>
            <span class="wf-field-hint">Max de lignes retournées</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="limit" type="number" min="1" max="10000" value="${escapeHtml(String(props.limit || 100))}" placeholder="100" />
          </div>
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">${svgVariable()} Variable de sortie</label>
            <span class="wf-field-hint">Nom pour accéder au résultat</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="outputVar" value="${escapeHtml(props.outputVar || '')}" placeholder="dbResult" />
          </div>
        </div>` : ''}
        <div class="wf-db-output-hint">
          <div class="wf-db-output-title">${svgTriggerType()} Sortie disponible ${props.outputVar ? `<code style="margin-left:4px;font-size:10px">$${escapeHtml(props.outputVar)}</code>` : ''}</div>
          ${dbAction === 'query' ? `
          <div class="wf-db-output-items">
            <code>$node_${node.id}.rows</code> <span>tableau des résultats</span>
            <code>$node_${node.id}.columns</code> <span>noms des colonnes</span>
            <code>$node_${node.id}.rowCount</code> <span>nombre de lignes</span>
            <code>$node_${node.id}.duration</code> <span>temps d'exécution (ms)</span>
            <code>$node_${node.id}.firstRow</code> <span>première ligne (objet)</span>
          </div>` : dbAction === 'schema' ? `
          <div class="wf-db-output-items">
            <code>$node_${node.id}.tables</code> <span>liste des tables avec colonnes</span>
            <code>$node_${node.id}.tableCount</code> <span>nombre de tables</span>
          </div>` : `
          <div class="wf-db-output-items">
            <code>$node_${node.id}.tables</code> <span>liste des noms de tables</span>
            <code>$node_${node.id}.tableCount</code> <span>nombre de tables</span>
          </div>`}
        </div>
      `;
    }
    // Loop node
    else if (nodeType === 'loop') {
      // Detect upstream source for preview
      const loopPreview = getLoopPreview(node, graphService);
      const loopMode = props.mode || 'sequential';

      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgLoop()} Source d'itération</label>
          <span class="wf-field-hint">D'où viennent les items à parcourir</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="source">
            <option value="auto" ${(!props.source || props.source === 'auto' || props.source === 'previous_output') ? 'selected' : ''}>Automatique (depuis node connecté)</option>
            <option value="projects" ${props.source === 'projects' ? 'selected' : ''}>Tous les projets enregistrés</option>
            <option value="files" ${props.source === 'files' ? 'selected' : ''}>Fichiers (pattern glob)</option>
            <option value="custom" ${props.source === 'custom' ? 'selected' : ''}>Liste personnalisée</option>
          </select>
        </div>
        ${props.source === 'files' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgFile()} Pattern glob</label>
          <span class="wf-field-hint">Expression pour trouver les fichiers</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="filter" value="${escapeHtml(props.filter || '')}" placeholder="src/**/*.test.js" />
        </div>` : ''}
        ${props.source === 'custom' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Items</label>
          <span class="wf-field-hint">Un item par ligne, ou variable $node_X.rows</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="filter" rows="4" placeholder="api-service\nweb-app\nworker">${escapeHtml(props.filter || '')}</textarea>
        </div>` : ''}
        ${loopPreview.html}
        <div class="wf-loop-options">
          <div class="wf-loop-opt">
            <span class="wf-loop-opt-label">Mode</span>
            <div class="wf-loop-mode-tabs">
              <button class="wf-loop-mode-tab ${loopMode === 'sequential' ? 'active' : ''}" data-mode="sequential" title="Un par un dans l'ordre">Séq.</button>
              <button class="wf-loop-mode-tab ${loopMode === 'parallel' ? 'active' : ''}" data-mode="parallel" title="Tous en parallèle">Par.</button>
            </div>
          </div>
          <div class="wf-loop-opt">
            <span class="wf-loop-opt-label">Limite</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono wf-loop-max-input" data-key="maxIterations" type="number" min="1" max="10000" value="${escapeHtml(String(props.maxIterations || ''))}" placeholder="∞" />
          </div>
        </div>
        <div class="wf-loop-usage-hint">
          <div class="wf-loop-usage-title">${svgTriggerType()} Variables dans Each</div>
          <div class="wf-loop-usage-items">
            <code>$item</code> <span>${escapeHtml(loopPreview.itemDesc)}</span>
            <code>$loop.index</code> <span>Index courant (0, 1, 2…)</span>
            <code>$loop.total</code> <span>Nombre total d'items</span>
          </div>
          <div class="wf-loop-usage-tip">Connectez un node au port <strong>Each</strong> pour traiter chaque item</div>
        </div>
      `;
    }
    // Variable node
    else if (nodeType === 'variable') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="set" ${props.action === 'set' ? 'selected' : ''}>Définir une valeur</option>
            <option value="get" ${props.action === 'get' ? 'selected' : ''}>Lire la valeur</option>
            <option value="increment" ${props.action === 'increment' ? 'selected' : ''}>Incrémenter (+n)</option>
            <option value="append" ${props.action === 'append' ? 'selected' : ''}>Ajouter à la liste</option>
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgVariable()} Nom</label>
          <span class="wf-field-hint">Identifiant unique de la variable</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="name" value="${escapeHtml(props.name || '')}" placeholder="buildCount" />
        </div>
        ${props.action !== 'get' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Valeur</label>
          <span class="wf-field-hint">${props.action === 'increment' ? 'Incrément (nombre)' : 'Valeur à assigner'}</span>
          <input class="wf-step-edit-input wf-node-prop ${props.action === 'increment' ? 'wf-field-mono' : ''}" data-key="value" value="${escapeHtml(props.value || '')}" placeholder="${props.action === 'increment' ? '1' : 'production'}" ${props.action === 'increment' ? 'type="number"' : ''} />
        </div>` : ''}
      `;
    }
    // Log node
    else if (nodeType === 'log') {
      const logLevel = props.level || 'info';
      const LOG_LEVELS = [
        { value: 'debug', label: 'Debug',   icon: '🔍', color: 'var(--text-muted)' },
        { value: 'info',  label: 'Info',    icon: 'ℹ',  color: '#60a5fa' },
        { value: 'warn',  label: 'Warn',    icon: '⚠',  color: '#fbbf24' },
        { value: 'error', label: 'Error',   icon: '✕',  color: '#f87171' },
      ];
      const LOG_TEMPLATES = [
        { label: 'Status',   value: '[$ctx.project] Step $loop.index completed' },
        { label: 'Result',   value: 'Output: $node_1.stdout' },
        { label: 'Timing',   value: 'Done at $ctx.date' },
      ];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgLog()} Niveau</label>
          <div class="wf-log-level-tabs">
            ${LOG_LEVELS.map(l => `
              <button class="wf-log-level-tab ${logLevel === l.value ? 'active' : ''}" data-level="${l.value}" style="${logLevel === l.value ? `--tab-color:${l.color}` : ''}">
                <span class="wf-log-level-icon">${l.icon}</span>
                ${l.label}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Message</label>
          <div class="wf-log-tpl-bar">
            ${LOG_TEMPLATES.map(t => `<button class="wf-log-tpl" data-tpl="${escapeHtml(t.value)}" title="${escapeHtml(t.value)}">${t.label}</button>`).join('')}
          </div>
          <textarea class="wf-step-edit-input wf-node-prop wf-log-textarea" data-key="message" rows="3" placeholder="Build finished for $ctx.project">${escapeHtml(props.message || '')}</textarea>
          <div class="wf-log-preview" data-level="${logLevel}">
            <span class="wf-log-preview-badge">${LOG_LEVELS.find(l => l.value === logLevel)?.icon || 'ℹ'}</span>
            <span class="wf-log-preview-text">${escapeHtml(props.message || 'Aperçu du message...')}</span>
          </div>
        </div>
      `;
    }

    const customTitle = node.properties._customTitle || '';
    const nodeStepId = `node_${node.id}`;
    propsEl.innerHTML = `
      <div class="wf-props-section" data-node-color="${typeInfo.color}">
        <div class="wf-props-header">
          <span class="wf-chip wf-chip--${typeInfo.color}">${typeInfo.icon}</span>
          <div class="wf-props-header-text">
            <div class="wf-props-title">${typeInfo.label}</div>
            <div class="wf-props-subtitle">${typeInfo.desc}</div>
          </div>
          <span class="wf-props-badge wf-props-badge--${typeInfo.color}">${nodeType.toUpperCase()}</span>
        </div>
        ${nodeType !== 'trigger' ? `<div class="wf-node-id-badge"><code>$${nodeStepId}</code> <span>ID de ce node pour les variables</span></div>` : ''}
        ${nodeType !== 'trigger' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Nom personnalisé</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="_customTitle" value="${escapeHtml(customTitle)}" placeholder="${typeInfo.label}" />
        </div>` : ''}
        ${fieldsHtml}
        ${nodeType !== 'trigger' ? `
        <div class="wf-props-divider"></div>
        <button class="wf-props-delete" id="wf-props-delete-node">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          Supprimer ce node
        </button>` : ''}
      </div>
    `;

    // Upgrade native selects to custom dropdowns
    upgradeSelectsToDropdowns(propsEl);

    // ── Bind property inputs ──
    propsEl.querySelectorAll('.wf-node-prop').forEach(input => {
      const handler = () => {
        const key = input.dataset.key;
        const val = input.value;
        node.properties[key] = val;
        editorDraft.dirty = true;
        // Update widget display in node
        if (node.widgets) {
          const w = node.widgets.find(w => w.name === key || w.name.toLowerCase() === key.toLowerCase());
          if (w) w.value = val;
        }
        graphService.canvas.setDirty(true, true);
        // Invalidate schema cache when DB connection changes
        if (key === 'connection') {
          schemaCache.invalidate(val);
        }
        // Re-render properties if field affects visibility (trigger type, method, action, mode, connection)
        if (['triggerType', 'method', 'action', 'mode', 'connection'].includes(key)) {
          renderProperties(node);
        }
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });

    // ── Autocomplete for $variable references ──
    setupAutocomplete(propsEl, node, graphService);

    // ── Initialize Smart SQL for DB nodes ──
    if (nodeType === 'db') {
      initSmartSQL(propsEl, node, graphService).catch(e => console.warn('[SmartSQL] init error:', e));
    }

    // Claude mode tabs
    propsEl.querySelectorAll('.wf-claude-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        node.properties.mode = tab.dataset.mode;
        // Update widget
        if (node.widgets) {
          const w = node.widgets.find(w => w.name === 'Mode');
          if (w) w.value = tab.dataset.mode;
        }
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
        renderProperties(node);
      });
    });

    // Agent card selection
    propsEl.querySelectorAll('.wf-agent-card[data-agent-id]').forEach(card => {
      card.addEventListener('click', () => {
        node.properties.agentId = card.dataset.agentId;
        editorDraft.dirty = true;
        propsEl.querySelectorAll('.wf-agent-card[data-agent-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Skill card selection
    propsEl.querySelectorAll('.wf-agent-card[data-skill-id]').forEach(card => {
      card.addEventListener('click', () => {
        node.properties.skillId = card.dataset.skillId;
        editorDraft.dirty = true;
        propsEl.querySelectorAll('.wf-agent-card[data-skill-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Loop mode tabs (sequential/parallel)
    propsEl.querySelectorAll('.wf-loop-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        node.properties.mode = tab.dataset.mode;
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
        renderProperties(node);
      });
    });

    // Log level tabs
    propsEl.querySelectorAll('.wf-log-level-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        node.properties.level = tab.dataset.level;
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
        renderProperties(node);
      });
    });

    // Log template buttons
    propsEl.querySelectorAll('.wf-log-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        const textarea = propsEl.querySelector('.wf-log-textarea');
        if (textarea) {
          const start = textarea.selectionStart || textarea.value.length;
          const before = textarea.value.substring(0, start);
          const after = textarea.value.substring(textarea.selectionEnd || start);
          textarea.value = before + btn.dataset.tpl + after;
          node.properties.message = textarea.value;
          editorDraft.dirty = true;
          textarea.focus();
          // Update preview
          const preview = propsEl.querySelector('.wf-log-preview-text');
          if (preview) preview.textContent = textarea.value || 'Aperçu du message...';
        }
      });
    });

    // Log message live preview
    const logTextarea = propsEl.querySelector('.wf-log-textarea');
    if (logTextarea) {
      logTextarea.addEventListener('input', () => {
        const preview = propsEl.querySelector('.wf-log-preview-text');
        if (preview) preview.textContent = logTextarea.value || 'Aperçu du message...';
      });
    }

    // Condition mode toggle (Builder / Expression)
    propsEl.querySelectorAll('.wf-cond-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.condMode;
        node.properties._condMode = mode;
        editorDraft.dirty = true;
        const builderEl = propsEl.querySelector('.wf-cond-builder');
        const exprEl = propsEl.querySelector('.wf-cond-expression');
        if (builderEl && exprEl) {
          builderEl.style.display = mode === 'builder' ? '' : 'none';
          exprEl.style.display = mode === 'expression' ? '' : 'none';
        }
        propsEl.querySelectorAll('.wf-cond-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
        // When switching to expression, sync builder → expression
        if (mode === 'expression' && !node.properties.expression) {
          const isUnary = (node.properties.operator || '==') === 'is_empty' || (node.properties.operator || '==') === 'is_not_empty';
          node.properties.expression = buildConditionPreview(node.properties.variable || '', node.properties.operator || '==', node.properties.value || '', isUnary);
          const exprInput = propsEl.querySelector('.wf-cond-expr-input');
          if (exprInput) exprInput.value = node.properties.expression;
        }
      });
    });

    // Condition operator buttons
    propsEl.querySelectorAll('.wf-cond-op-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const op = btn.dataset.op;
        node.properties.operator = op;
        editorDraft.dirty = true;
        // Toggle active state
        propsEl.querySelectorAll('.wf-cond-op-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Show/hide value field based on unary
        const isUnary = op === 'is_empty' || op === 'is_not_empty';
        const valField = propsEl.querySelector('.wf-cond-value-field');
        if (valField) valField.style.display = isUnary ? 'none' : '';
        // Update preview
        const preview = propsEl.querySelector('.wf-cond-preview-code');
        if (preview) preview.textContent = buildConditionPreview(node.properties.variable || '', op, node.properties.value || '', isUnary);
        // Update widget
        if (node.widgets) {
          const w = node.widgets.find(w => w.name === 'operator' || w.name === 'Operator');
          if (w) w.value = op;
        }
        graphService.canvas.setDirty(true, true);
      });
    });

    // Condition live preview update on variable/value change
    const condVarInput = propsEl.querySelector('.wf-cond-builder [data-key="variable"]');
    const condValInput = propsEl.querySelector('.wf-cond-builder [data-key="value"]');
    const condPreview = propsEl.querySelector('.wf-cond-preview-code');
    if (condPreview) {
      const updateCondPreview = () => {
        const v = condVarInput?.value || '';
        const op = node.properties.operator || '==';
        const val = condValInput?.value || '';
        const isUnary = op === 'is_empty' || op === 'is_not_empty';
        condPreview.textContent = buildConditionPreview(v, op, val, isUnary);
      };
      if (condVarInput) condVarInput.addEventListener('input', updateCondPreview);
      if (condValInput) condValInput.addEventListener('input', updateCondPreview);
    }

    // Delete node button
    const deleteBtn = propsEl.querySelector('#wf-props-delete-node');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        graphService.graph.remove(node);
        editorDraft.dirty = true;
        renderProperties(null);
        updateStatusBar();
        graphService.canvas.setDirty(true, true);
      });
    }

    // Custom title update (sync to node title)
    const titleInput = propsEl.querySelector('[data-key="_customTitle"]');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        node.properties._customTitle = titleInput.value;
        node.title = titleInput.value || typeInfo.label;
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
      });
    }
  };

  // ── Graph events ──
  graphService.onNodeSelected = (node) => {
    renderProperties(node);
    updateStatusBar();
  };

  graphService.onNodeDeselected = () => {
    renderProperties(null);
  };

  graphService.onGraphChanged = () => {
    editorDraft.dirty = true;
    updateStatusBar();
  };

  // ── Auto-loop suggestion ──
  graphService.onArrayToSingleConnection = (link, sourceNode, targetNode) => {
    // Remove any existing suggestion popup
    const old = panel.querySelector('.wf-loop-suggest');
    if (old) old.remove();

    // Position popup at the midpoint of the link (converted from graph coords to screen)
    const canvas = graphService.canvas;
    const originPos = sourceNode.getConnectionPos(false, link.origin_slot);
    const targetPos = targetNode.getConnectionPos(true, link.target_slot);
    const mx = (originPos[0] + targetPos[0]) / 2;
    const my = (originPos[1] + targetPos[1]) / 2;
    const screenPos = canvas.ds.convertOffsetToCanvas([mx, my]);
    const canvasRect = graphService.canvasElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    const popup = document.createElement('div');
    popup.className = 'wf-loop-suggest';
    popup.style.left = (canvasRect.left - panelRect.left + screenPos[0]) + 'px';
    popup.style.top = (canvasRect.top - panelRect.top + screenPos[1] + 10) + 'px';
    popup.innerHTML = `
      <div class="wf-loop-suggest-text">Ce lien transporte un tableau. Insérer un Loop ?</div>
      <div class="wf-loop-suggest-actions">
        <button class="wf-loop-suggest-btn wf-loop-suggest-btn--yes">Insérer Loop</button>
        <button class="wf-loop-suggest-btn wf-loop-suggest-btn--no">Ignorer</button>
      </div>
    `;
    panel.appendChild(popup);

    // Auto-dismiss after 6s
    const autoDismiss = setTimeout(() => popup.remove(), 6000);

    popup.querySelector('.wf-loop-suggest-btn--no').addEventListener('click', () => {
      clearTimeout(autoDismiss);
      popup.remove();
    });

    popup.querySelector('.wf-loop-suggest-btn--yes').addEventListener('click', () => {
      clearTimeout(autoDismiss);
      popup.remove();
      insertLoopBetween(graphService, link, sourceNode, targetNode);
      editorDraft.dirty = true;
      updateStatusBar();
    });
  };

  // ── Toolbar events ──
  // Back
  panel.querySelector('#wf-ed-back').addEventListener('click', () => {
    resizeObs.disconnect();
    resetGraphService();
    renderPanel();
    renderContent();
  });

  // Name input
  panel.querySelector('#wf-ed-name').addEventListener('input', (e) => {
    editorDraft.name = e.target.value;
    editorDraft.dirty = true;
  });

  // Zoom
  panel.querySelector('#wf-ed-zoom-in').addEventListener('click', () => {
    graphService.setZoom(graphService.getZoom() * 1.2);
    updateStatusBar();
  });
  panel.querySelector('#wf-ed-zoom-out').addEventListener('click', () => {
    graphService.setZoom(graphService.getZoom() / 1.2);
    updateStatusBar();
  });
  panel.querySelector('#wf-ed-zoom-reset')?.addEventListener('click', () => {
    graphService.setZoom(1);
    updateStatusBar();
  });
  panel.querySelector('#wf-ed-zoom-fit').addEventListener('click', () => {
    graphService.zoomToFit();
    updateStatusBar();
  });

  // Save
  panel.querySelector('#wf-ed-save').addEventListener('click', async () => {
    const data = graphService.serializeToWorkflow();
    if (!data) return;
    const workflow = {
      ...(workflowId ? { id: workflowId } : {}),
      name: editorDraft.name,
      enabled: wf?.enabled ?? true,
      trigger: data.trigger,
      ...(data.trigger.type === 'hook' ? { hookType: data.hookType } : {}),
      scope: editorDraft.scope,
      concurrency: editorDraft.concurrency,
      graph: data.graph,
      steps: data.steps,
    };
    const res = await api.save(workflow);
    if (res?.success) {
      editorDraft.dirty = false;
      updateStatusBar();
      await refreshData();
      // Update workflowId if new
      if (!workflowId && res.id) {
        workflowId = res.id;
      }
    }
  });

  // Run
  panel.querySelector('#wf-ed-run').addEventListener('click', () => {
    if (workflowId) triggerWorkflow(workflowId);
  });

  // ── Palette clicks ──
  panel.querySelectorAll('.wf-palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const typeName = item.dataset.nodeType;
      // Add node at center of current viewport
      const canvas = graphService.canvas;
      const cx = (-canvas.ds.offset[0] + canvasWrap.offsetWidth / 2) / canvas.ds.scale;
      const cy = (-canvas.ds.offset[1] + canvasWrap.offsetHeight / 2) / canvas.ds.scale;
      graphService.addNode(typeName, [cx - 90, cy - 30]);
    });
  });

  // ── Keyboard shortcuts in editor ──
  const editorKeyHandler = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Only delete if not focused on an input
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        graphService.deleteSelected();
      }
    }
  };
  document.addEventListener('keydown', editorKeyHandler);

  // Cleanup keyboard handler when leaving editor
  const origBack = panel.querySelector('#wf-ed-back');
  if (origBack) {
    const origHandler = origBack.onclick;
    origBack.addEventListener('click', () => {
      document.removeEventListener('keydown', editorKeyHandler);
    }, { once: true });
  }

} // end openEditor

// Legacy: removed old wizard code. The old openBuilder function has been replaced
// by the node graph editor above.
/* ─── Detail ───────────────────────────────────────────────────────────────── */

function openDetail(id) {
  const wf = state.workflows.find(w => w.id === id);
  if (!wf) return;
  const runs = state.runs.filter(r => r.workflowId === id);
  const cfg = TRIGGER_CONFIG[wf.trigger?.type] || TRIGGER_CONFIG.manual;

  const overlay = document.createElement('div');
  overlay.className = 'wf-overlay';
  overlay.innerHTML = `
    <div class="wf-modal wf-modal--detail">
      <div class="wf-modal-hd">
        <div class="wf-modal-hd-left">
          <span class="wf-detail-dot ${runs[0]?.status || ''}"></span>
          <span class="wf-modal-title">${escapeHtml(wf.name)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="wf-btn-primary wf-btn-sm" id="wf-run-now">${svgPlay()} Lancer</button>
          <button class="wf-btn-ghost wf-btn-sm" id="wf-edit">Modifier</button>
          <button class="wf-modal-x" id="wf-det-close">${svgX(12)}</button>
        </div>
      </div>
      <div class="wf-modal-bd wf-detail-bd">
        <div class="wf-detail-meta">
          <div class="wf-detail-meta-item">
            <span class="wf-detail-meta-icon wf-chip wf-chip--${cfg.color}">${cfg.icon}</span>
            <div>
              <div class="wf-detail-meta-label">Trigger</div>
              <div class="wf-detail-meta-val">${cfg.label}${wf.trigger?.value ? ` · <code>${escapeHtml(wf.trigger.value)}</code>` : ''}${wf.hookType ? ` · <code>${escapeHtml(wf.hookType)}</code>` : ''}</div>
            </div>
          </div>
          <div class="wf-detail-meta-item">
            <span class="wf-detail-meta-icon wf-chip wf-chip--muted">${svgScope()}</span>
            <div>
              <div class="wf-detail-meta-label">Scope</div>
              <div class="wf-detail-meta-val">${escapeHtml(wf.scope || 'current')}</div>
            </div>
          </div>
          <div class="wf-detail-meta-item">
            <span class="wf-detail-meta-icon wf-chip wf-chip--muted">${svgConc()}</span>
            <div>
              <div class="wf-detail-meta-label">Concurrence</div>
              <div class="wf-detail-meta-val">${escapeHtml(wf.concurrency || 'skip')}</div>
            </div>
          </div>
        </div>

        <div class="wf-detail-section">
          <div class="wf-detail-sec-title">Séquence</div>
          <div class="wf-detail-steps">
            ${(wf.steps || []).map((s, i) => {
              const info = findStepType((s.type || '').split('.')[0]);
              return `
                <div class="wf-det-step">
                  <span class="wf-det-step-n">${i + 1}</span>
                  <span class="wf-chip wf-chip--${info.color}">${info.icon}</span>
                  <span class="wf-det-step-type">${escapeHtml(s.type || '')}</span>
                  <span class="wf-det-step-id">\$${escapeHtml(s.id || '')}</span>
                  ${s.condition ? `<span class="wf-det-step-cond">if</span>` : ''}
                </div>
                ${i < wf.steps.length - 1 ? '<div class="wf-det-connector"></div>' : ''}
              `;
            }).join('')}
          </div>
        </div>

        ${runs.length ? `
          <div class="wf-detail-section">
            <div class="wf-detail-sec-title">Derniers runs</div>
            ${runs.slice(0, 3).map(run => `
              <div class="wf-run wf-run--sm">
                <div class="wf-run-bar wf-run-bar--${run.status}"></div>
                <div class="wf-run-body">
                  <div class="wf-run-top">
                    <span class="wf-status-pill wf-status-pill--${run.status}">${statusLabel(run.status)}</span>
                    <span class="wf-run-meta-inline">${svgClock()} ${fmtTime(run.startedAt)} · ${svgTimer()} ${fmtDuration(run.duration)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#wf-det-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#wf-edit').addEventListener('click', () => { overlay.remove(); openEditor(id); });
  overlay.querySelector('#wf-run-now').addEventListener('click', () => { triggerWorkflow(id); overlay.remove(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ─── Actions ──────────────────────────────────────────────────────────────── */

async function saveWorkflow(draft, existingId) {
  if (!api) return;
  const workflow = {
    ...(existingId ? { id: existingId } : {}),
    name: draft.name,
    enabled: true,
    trigger: {
      type: draft.trigger,
      value: draft.triggerValue || '',
    },
    ...(draft.trigger === 'hook' ? { hookType: draft.hookType } : {}),
    scope: draft.scope,
    concurrency: draft.concurrency,
    steps: draft.steps,
  };
  const res = await api.save(workflow);
  if (res?.success) {
    await refreshData();
    renderContent();
  }
}

async function triggerWorkflow(id) {
  if (!api) return;
  await api.trigger(id);
  // Live listener will update UI when run starts
}

async function toggleWorkflow(id, enabled) {
  if (!api) return;
  const res = await api.enable(id, enabled);
  if (res?.success) {
    const wf = state.workflows.find(w => w.id === id);
    if (wf) wf.enabled = enabled;
  }
}

async function confirmDeleteWorkflow(id, name) {
  if (!api) return;
  // Simple confirmation via a small modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'wf-confirm-overlay';
  overlay.innerHTML = `
    <div class="wf-confirm-box">
      <div class="wf-confirm-title">${svgTrash(16)} Supprimer le workflow</div>
      <div class="wf-confirm-text">Supprimer <strong>${escapeHtml(name || 'ce workflow')}</strong> ? Cette action est irréversible.</div>
      <div class="wf-confirm-actions">
        <button class="wf-confirm-btn wf-confirm-btn--cancel">Annuler</button>
        <button class="wf-confirm-btn wf-confirm-btn--delete">Supprimer</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.wf-confirm-btn--cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('.wf-confirm-btn--delete').addEventListener('click', async () => {
    overlay.remove();
    const res = await api.delete(id);
    if (res?.success) {
      state.workflows = state.workflows.filter(w => w.id !== id);
      renderContent();
    }
  });
}

async function duplicateWorkflow(id) {
  if (!api) return;
  const wf = state.workflows.find(w => w.id === id);
  if (!wf) return;
  const copy = {
    name: wf.name + ' (copie)',
    enabled: false,
    trigger: { ...wf.trigger },
    scope: wf.scope,
    concurrency: wf.concurrency,
    steps: JSON.parse(JSON.stringify(wf.steps || [])),
  };
  const res = await api.save(copy);
  if (res?.success) {
    await refreshData();
    renderContent();
  }
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/** Format ISO date to relative/short string */
function fmtTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return `Hier ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    if (diffD < 7) return `Il y a ${diffD}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch { return String(iso); }
}

/** Format duration (seconds number or string) */
function fmtDuration(val) {
  if (val == null) return '…';
  const s = typeof val === 'number' ? val : parseInt(val);
  if (isNaN(s)) return String(val);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function statusDot(s) {
  return `<span class="wf-dot wf-dot--${s}"></span>`;
}

function statusLabel(s) {
  return { success: 'Succès', failed: 'Échec', running: 'En cours', pending: 'En attente' }[s] || s;
}

/* ─── SVG icons ─────────────────────────────────────────────────────────────── */

function svgWorkflow(s = 14) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M5 9v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M12 12v3"/></svg>`; }
function svgAgent(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>`; }
function svgShell() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`; }
function svgGit() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`; }
function svgHttp() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`; }
function svgNotify() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`; }
function svgWait() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function svgCond() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function svgClock(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function svgTimer() { return `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function svgHook(s = 13) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function svgChain(s = 13) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`; }
function svgPlay(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`; }
function svgX(s = 12) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`; }
function svgScope() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`; }
function svgConc() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>`; }
function svgEmpty() { return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M5 9v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M12 12v3"/></svg>`; }
function svgRuns() { return `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>`; }
function svgClaude(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7v1a7 7 0 0 0 14 0V9a7 7 0 0 0-7-7z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M8 18v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2"/></svg>`; }
function svgPrompt(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`; }
function svgSkill(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`; }
function svgProject(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`; }
function svgFile(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`; }
function svgDb(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`; }
function svgLoop(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`; }
function svgVariable(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>`; }
function svgLog(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`; }
function svgTriggerType(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`; }
function svgLink(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`; }
function svgMode(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`; }
function svgEdit(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`; }
function svgBranch(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`; }
function svgCode(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`; }
function svgTrash(s = 12) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`; }
function svgCopy(s = 12) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`; }

/**
 * Replace native <select> elements with custom styled dropdowns.
 * Each select is hidden and wrapped by a .wf-dropdown that syncs value back.
 */
function upgradeSelectsToDropdowns(container) {
  container.querySelectorAll('select.wf-step-edit-input, select.wf-node-prop').forEach(sel => {
    if (sel.dataset.upgraded) return;
    sel.dataset.upgraded = '1';
    sel.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'wf-dropdown';
    sel.parentNode.insertBefore(wrapper, sel.nextSibling);

    // Build trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'wf-dropdown-trigger';
    wrapper.appendChild(trigger);

    // Build menu
    const menu = document.createElement('div');
    menu.className = 'wf-dropdown-menu';
    wrapper.appendChild(menu);

    const chevron = `<svg class="wf-dropdown-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    function buildOptions() {
      const selected = sel.value;
      const selectedOpt = sel.options[sel.selectedIndex];
      trigger.innerHTML = `<span class="wf-dropdown-text">${selectedOpt ? escapeHtml(selectedOpt.textContent) : ''}</span>${chevron}`;
      if (!selected && selectedOpt && selectedOpt.value === '') {
        trigger.classList.add('wf-dropdown-placeholder');
      } else {
        trigger.classList.remove('wf-dropdown-placeholder');
      }

      menu.innerHTML = '';
      Array.from(sel.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'wf-dropdown-item' + (opt.value === selected ? ' active' : '');
        item.dataset.value = opt.value;
        item.innerHTML = `<span>${escapeHtml(opt.textContent)}</span>${opt.value === selected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          closeMenu();
          buildOptions();
        });
        menu.appendChild(item);
      });
    }

    function openMenu() {
      if (wrapper.classList.contains('open')) { closeMenu(); return; }
      // Close any other open dropdowns
      document.querySelectorAll('.wf-dropdown.open').forEach(d => d.classList.remove('open'));
      wrapper.classList.add('open');
      // Scroll active item into view
      const activeItem = menu.querySelector('.wf-dropdown-item.active');
      if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    }

    function closeMenu() {
      wrapper.classList.remove('open');
    }

    trigger.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });

    // Close on outside click
    const outsideHandler = (e) => {
      if (!wrapper.contains(e.target)) closeMenu();
    };
    document.addEventListener('click', outsideHandler, true);

    // Close on escape
    const escHandler = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', escHandler, true);

    // Cleanup document listeners when dropdown is removed from DOM
    const cleanupObs = new MutationObserver(() => {
      if (!wrapper.isConnected) {
        document.removeEventListener('click', outsideHandler, true);
        document.removeEventListener('keydown', escHandler, true);
        cleanupObs.disconnect();
      }
    });
    cleanupObs.observe(wrapper.parentNode || document.body, { childList: true, subtree: true });

    buildOptions();
  });
}

// ── Auto-loop insertion ───────────────────────────────────────────────────────
function insertLoopBetween(graphService, link, sourceNode, targetNode) {
  const graph = graphService.graph;
  if (!graph) return;

  // Calculate position: midpoint between source and target
  const originPos = sourceNode.getConnectionPos(false, link.origin_slot);
  const targetPos = targetNode.getConnectionPos(true, link.target_slot);
  const mx = (originPos[0] + targetPos[0]) / 2;
  const my = (originPos[1] + targetPos[1]) / 2;

  // Remove the existing link
  graph.removeLink(link.id);

  // Create a Loop node at the midpoint
  const loopNode = LiteGraph.createNode('workflow/loop');
  if (!loopNode) return;
  loopNode.pos = [mx - 70, my - 30];
  loopNode.properties = loopNode.properties || {};
  loopNode.properties.source = 'auto';
  graph.add(loopNode);

  // Connect: source.slot → loop.In (slot 0), then loop.Each (output 0) → target.slot
  sourceNode.connect(link.origin_slot, loopNode, 0);  // source → loop In
  loopNode.connect(0, targetNode, link.target_slot);   // loop Each → target

  graphService.canvas.setDirty(true, true);
}

// ── Autocomplete for $variable references ────────────────────────────────────
function setupAutocomplete(container, node, graphService) {
  // Only wire up text inputs and textareas that accept variables
  const fields = container.querySelectorAll('input.wf-node-prop[type="text"], input.wf-node-prop:not([type]), textarea.wf-node-prop, input.wf-field-mono, textarea.wf-field-mono');
  if (!fields.length) return;

  // Shared popup element (reuse across fields)
  let popup = container.querySelector('.wf-autocomplete-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.className = 'wf-autocomplete-popup';
    popup.style.display = 'none';
    container.appendChild(popup);
  }

  let activeField = null;
  let activeIndex = 0;
  let currentSuggestions = [];
  let dollarPos = -1;

  function hidePopup() {
    popup.style.display = 'none';
    activeField = null;
    currentSuggestions = [];
    activeIndex = 0;
  }

  function insertSuggestion(value) {
    if (!activeField || dollarPos < 0) return;
    const field = activeField;
    const before = field.value.substring(0, dollarPos);
    const after = field.value.substring(field.selectionStart);
    field.value = before + value + after;
    const newPos = dollarPos + value.length;
    field.setSelectionRange(newPos, newPos);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    hidePopup();
    field.focus();
  }

  function renderPopup(suggestions, anchorField) {
    if (!suggestions.length) { hidePopup(); return; }
    currentSuggestions = suggestions;
    activeIndex = 0;

    // Group by category
    const groups = {};
    for (const s of suggestions) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }

    let html = '';
    for (const [cat, items] of Object.entries(groups)) {
      html += `<div class="wf-ac-category">${escapeHtml(cat)}</div>`;
      for (const item of items) {
        const idx = suggestions.indexOf(item);
        html += `<div class="wf-ac-item${idx === 0 ? ' active' : ''}" data-idx="${idx}">
          <span class="wf-ac-label">${escapeHtml(item.label)}</span>
          <span class="wf-ac-detail">${escapeHtml(item.detail)}</span>
        </div>`;
      }
    }
    popup.innerHTML = html;

    // Position below the field
    const rect = anchorField.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    popup.style.top = (rect.bottom - containerRect.top + 2) + 'px';
    popup.style.left = (rect.left - containerRect.left) + 'px';
    popup.style.width = rect.width + 'px';
    popup.style.display = 'block';

    // Click handlers on items
    popup.querySelectorAll('.wf-ac-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx, 10);
        insertSuggestion(currentSuggestions[idx].value);
      });
    });
  }

  function updateActiveItem() {
    popup.querySelectorAll('.wf-ac-item').forEach((el, i) => {
      el.classList.toggle('active', i === activeIndex);
    });
    // Scroll into view
    const activeEl = popup.querySelector('.wf-ac-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  let deepFetchId = 0; // debounce async deep suggestions

  // ── Variable Picker button {x} ──
  fields.forEach(field => {
    // Skip selects, checkboxes, number-only inputs
    if (field.tagName === 'SELECT' || field.type === 'number' || field.type === 'checkbox') return;
    const wrapper = field.parentElement;
    if (!wrapper || wrapper.querySelector('.wf-var-picker-btn')) return;
    wrapper.style.position = 'relative';
    const btn = document.createElement('button');
    btn.className = 'wf-var-picker-btn';
    btn.type = 'button';
    btn.textContent = '{x}';
    btn.title = 'Insérer une variable';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showVariablePicker(field, node, graphService, container);
    });
    wrapper.appendChild(btn);
  });

  fields.forEach(field => {
    field.addEventListener('input', async () => {
      const val = field.value;
      const cursor = field.selectionStart;

      // Find the $ before cursor
      let dPos = -1;
      for (let i = cursor - 1; i >= 0; i--) {
        const ch = val[i];
        if (ch === '$') { dPos = i; break; }
        if (!/[\w.]/.test(ch)) break;
      }

      if (dPos < 0) { hidePopup(); return; }

      dollarPos = dPos;
      activeField = field;
      const filterText = val.substring(dPos, cursor);

      const graph = graphService?.graph;

      // Check if this is a deep property access (has 2+ dots: $node_X.firstRow.col)
      const dotCount = (filterText.match(/\./g) || []).length;
      if (dotCount >= 2) {
        // Async deep suggestions (DB columns)
        const fetchId = ++deepFetchId;
        const deepSuggestions = await getDeepAutocompleteSuggestions(graph, node?.id, filterText);
        if (fetchId !== deepFetchId) return; // stale request
        if (deepSuggestions.length > 0) {
          renderPopup(deepSuggestions, field);
          return;
        }
      }

      // Standard suggestions
      const suggestions = getAutocompleteSuggestions(graph, node?.id, filterText);
      renderPopup(suggestions, field);
    });

    field.addEventListener('keydown', (e) => {
      if (popup.style.display === 'none') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, currentSuggestions.length - 1);
        updateActiveItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActiveItem();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (currentSuggestions.length > 0) {
          e.preventDefault();
          insertSuggestion(currentSuggestions[activeIndex].value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hidePopup();
      }
    });

    field.addEventListener('blur', () => {
      // Small delay to allow mousedown on popup items
      setTimeout(() => {
        if (popup.style.display !== 'none') hidePopup();
      }, 150);
    });
  });
}

// ── Variable Picker popup ─────────────────────────────────────────────────────
let activeVarPicker = null;

function showVariablePicker(anchorField, node, graphService, panelContainer) {
  // Close existing picker
  hideVariablePicker();

  const graph = graphService?.graph;
  const suggestions = getAutocompleteSuggestions(graph, node?.id, '$');

  if (!suggestions.length) return;

  // Group by category
  const groups = {};
  for (const s of suggestions) {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  }

  // Build picker DOM
  const picker = document.createElement('div');
  picker.className = 'wf-var-picker';

  // Search input
  const searchWrap = document.createElement('div');
  searchWrap.className = 'wf-var-picker-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Rechercher une variable...';
  searchWrap.appendChild(searchInput);
  picker.appendChild(searchWrap);

  // Categories container
  const catsEl = document.createElement('div');
  catsEl.className = 'wf-var-picker-categories';

  function renderItems(filter) {
    catsEl.innerHTML = '';
    const f = (filter || '').toLowerCase();
    let anyVisible = false;
    for (const [cat, items] of Object.entries(groups)) {
      const filtered = f ? items.filter(i => i.label.toLowerCase().includes(f) || i.detail.toLowerCase().includes(f)) : items;
      if (!filtered.length) continue;
      anyVisible = true;
      const catTitle = document.createElement('div');
      catTitle.className = 'wf-var-picker-cat-title';
      catTitle.textContent = cat;
      catsEl.appendChild(catTitle);
      for (const item of filtered) {
        const row = document.createElement('div');
        row.className = 'wf-var-picker-item';
        row.innerHTML = `<code>${escapeHtml(item.label)}</code><span>${escapeHtml(item.detail)}</span>`;
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          insertVariableAtCursor(anchorField, item.value);
          hideVariablePicker();
        });
        catsEl.appendChild(row);
      }
    }
    if (!anyVisible) {
      catsEl.innerHTML = '<div class="wf-var-picker-empty">Aucune variable trouvée</div>';
    }
  }

  renderItems('');
  picker.appendChild(catsEl);

  // Position
  const rect = anchorField.getBoundingClientRect();
  const containerRect = panelContainer.getBoundingClientRect();
  picker.style.top = (rect.bottom - containerRect.top + 4) + 'px';
  picker.style.left = (rect.left - containerRect.left) + 'px';

  panelContainer.appendChild(picker);
  activeVarPicker = picker;
  searchInput.focus();

  // Search filter
  searchInput.addEventListener('input', () => renderItems(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideVariablePicker(); anchorField.focus(); }
  });

  // Close on click outside
  const closeHandler = (e) => {
    if (!picker.contains(e.target) && e.target !== anchorField && !e.target.classList.contains('wf-var-picker-btn')) {
      hideVariablePicker();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
  picker._closeHandler = closeHandler;
}

function hideVariablePicker() {
  if (activeVarPicker) {
    if (activeVarPicker._closeHandler) document.removeEventListener('mousedown', activeVarPicker._closeHandler);
    activeVarPicker.remove();
    activeVarPicker = null;
  }
}

function insertVariableAtCursor(field, variable) {
  const start = field.selectionStart || 0;
  const end = field.selectionEnd || 0;
  const before = field.value.substring(0, start);
  const after = field.value.substring(end);
  field.value = before + variable + after;
  const newPos = start + variable.length;
  field.setSelectionRange(newPos, newPos);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
}

module.exports = { init, load };
