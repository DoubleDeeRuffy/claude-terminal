/**
 * db-config field renderer
 * Renders the DB node configuration:
 * - Connection select (from _dbConnectionsCache)
 * - Action select (query / schema / tables)
 * - SQL textarea with template buttons (when action === 'query')
 * - Limit + output var row (when action === 'query')
 * - Output hints block
 */
const { escapeHtml, escapeAttr } = require('./_registry');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SQL_TEMPLATES = {
  select: 'SELECT * FROM table_name\nLIMIT 100',
  insert: 'INSERT INTO table_name (col1, col2)\nVALUES (\'value1\', \'value2\')',
  update: 'UPDATE table_name\nSET col1 = \'value\'\nWHERE id = 1',
  delete: 'DELETE FROM table_name\nWHERE id = 1',
};

function renderOutputHints(action, nodeId) {
  const id = nodeId != null ? nodeId : 'X';
  if (action === 'query') {
    return `<div class="wf-db-output-hint">
  <div class="wf-db-output-title">Sorties disponibles</div>
  <div class="wf-db-output-items">
    <code>$node_${esc(String(id))}.rows</code> <span>tableau des résultats</span>
    <code>$node_${esc(String(id))}.columns</code> <span>noms des colonnes</span>
    <code>$node_${esc(String(id))}.rowCount</code> <span>nombre de lignes</span>
    <code>$node_${esc(String(id))}.duration</code> <span>temps d'exécution (ms)</span>
    <code>$node_${esc(String(id))}.firstRow</code> <span>première ligne (objet)</span>
  </div>
</div>`;
  }
  return `<div class="wf-db-output-hint">
  <div class="wf-db-output-title">Sorties disponibles</div>
  <div class="wf-db-output-items">
    <code>$node_${esc(String(id))}.tables</code> <span>liste des tables</span>
    <code>$node_${esc(String(id))}.tableCount</code> <span>nombre de tables</span>
  </div>
</div>`;
}

module.exports = {
  type: 'db-config',

  render(field, value, node) {
    const props = node.properties || {};
    const dbConns = (typeof window !== 'undefined' && window._dbConnectionsCache) || [];
    const dbAction = props.action || 'query';
    const selectedConn = dbConns.find(c => c.id === props.connection);

    const connOptions = dbConns
      .map(c => `<option value="${esc(c.id)}"${props.connection === c.id ? ' selected' : ''}>${esc(c.name)} (${esc(c.type || 'sql')})</option>`)
      .join('');

    const connHint = !dbConns.length
      ? '<span class="wf-field-hint" style="color:rgba(251,191,36,.6)">Aucune connexion — onglet Database</span>'
      : (selectedConn
          ? `<span class="wf-field-hint" style="color:rgba(251,191,36,.5)">${esc(selectedConn.type || 'sql')}${selectedConn.host ? ' — ' + esc(selectedConn.host) : ''}${selectedConn.database ? '/' + esc(selectedConn.database) : ''}</span>`
          : '');

    const querySection = dbAction === 'query' ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Requête SQL</label>
  <div class="wf-sql-templates">
    <button class="wf-sql-tpl" data-tpl="select">SELECT</button>
    <button class="wf-sql-tpl" data-tpl="insert">INSERT</button>
    <button class="wf-sql-tpl" data-tpl="update">UPDATE</button>
    <button class="wf-sql-tpl" data-tpl="delete">DELETE</button>
  </div>
  <textarea class="wf-step-edit-input wf-node-prop wf-field-mono wf-sql-textarea" data-key="query"
    rows="5" spellcheck="false"
    placeholder="SELECT * FROM users WHERE active = 1">${esc(props.query || '')}</textarea>
  <span class="wf-field-hint">Variables : $ctx, $node_X, $loop</span>
</div>
<div class="wf-field-row">
  <div class="wf-step-edit-field wf-field-half">
    <label class="wf-step-edit-label">Limite</label>
    <span class="wf-field-hint">Max de lignes retournées</span>
    <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="limit" type="number"
      min="1" max="10000" value="${esc(String(props.limit || 100))}" placeholder="100" />
  </div>
  <div class="wf-step-edit-field wf-field-half">
    <label class="wf-step-edit-label">Variable de sortie</label>
    <span class="wf-field-hint">Nom pour accéder au résultat</span>
    <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="outputVar"
      value="${esc(props.outputVar || '')}" placeholder="dbResult" />
  </div>
</div>` : '';

    return `<div class="wf-field-group" data-key="connection">
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Connexion</label>
  <span class="wf-field-hint">Base de données configurée dans l'app</span>
  <select class="wf-step-edit-input wf-node-prop wf-db-conn-select" data-key="connection">
    <option value="">-- Choisir une connexion --</option>
    ${connOptions}
  </select>
  ${connHint}
</div>
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Action</label>
  <span class="wf-field-hint">Type d'opération sur la base</span>
  <select class="wf-step-edit-input wf-node-prop wf-db-action-select" data-key="action">
    <option value="query"${dbAction === 'query' ? ' selected' : ''}>Query — Exécuter une requête SQL</option>
    <option value="schema"${dbAction === 'schema' ? ' selected' : ''}>Schema — Lister les tables et colonnes</option>
    <option value="tables"${dbAction === 'tables' ? ' selected' : ''}>Tables — Lister les noms de tables</option>
  </select>
</div>
<div class="wf-db-query-section">
${querySection}
</div>
${renderOutputHints(dbAction, node.id)}
</div>`;
  },

  bind(container, field, node, onChange) {
    // SQL template buttons
    container.querySelectorAll('.wf-sql-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        const ta = container.querySelector('[data-key="query"]');
        if (ta) {
          const tpl = SQL_TEMPLATES[btn.dataset.tpl] || '';
          ta.value = tpl;
          node.properties.query = tpl;
        }
      });
    });

    // Action select → toggle query section + update output hints
    const actionSel = container.querySelector('.wf-db-action-select');
    if (actionSel) {
      actionSel.addEventListener('change', () => {
        const action = actionSel.value;
        node.properties.action = action;
        onChange(action);

        const qSection = container.querySelector('.wf-db-query-section');
        if (qSection) {
          function e(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
          const props = node.properties || {};
          qSection.innerHTML = action === 'query' ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Requête SQL</label>
  <div class="wf-sql-templates">
    <button class="wf-sql-tpl" data-tpl="select">SELECT</button>
    <button class="wf-sql-tpl" data-tpl="insert">INSERT</button>
    <button class="wf-sql-tpl" data-tpl="update">UPDATE</button>
    <button class="wf-sql-tpl" data-tpl="delete">DELETE</button>
  </div>
  <textarea class="wf-step-edit-input wf-node-prop wf-field-mono wf-sql-textarea" data-key="query"
    rows="5" spellcheck="false"
    placeholder="SELECT * FROM users WHERE active = 1">${e(props.query || '')}</textarea>
  <span class="wf-field-hint">Variables : $ctx, $node_X, $loop</span>
</div>
<div class="wf-field-row">
  <div class="wf-step-edit-field wf-field-half">
    <label class="wf-step-edit-label">Limite</label>
    <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="limit" type="number"
      min="1" max="10000" value="${e(String(props.limit || 100))}" placeholder="100" />
  </div>
  <div class="wf-step-edit-field wf-field-half">
    <label class="wf-step-edit-label">Variable de sortie</label>
    <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="outputVar"
      value="${e(props.outputVar || '')}" placeholder="dbResult" />
  </div>
</div>` : '';

          // Re-bind SQL template buttons
          qSection.querySelectorAll('.wf-sql-tpl').forEach(b => {
            b.addEventListener('click', () => {
              const ta = qSection.querySelector('[data-key="query"]');
              if (ta) {
                const tpl = SQL_TEMPLATES[b.dataset.tpl] || '';
                ta.value = tpl;
                node.properties.query = tpl;
              }
            });
          });
          qSection.querySelectorAll('.wf-node-prop').forEach(el => {
            const key = el.dataset.key;
            if (!key) return;
            const evt = el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'number' ? 'input' : 'change';
            el.addEventListener(evt, () => { node.properties[key] = el.type === 'number' ? Number(el.value) : el.value; });
          });
        }

        // Update output hints
        const hintsEl = container.querySelector('.wf-db-output-hint');
        if (hintsEl) {
          hintsEl.outerHTML = renderOutputHints(action, node.id);
        }
      });
    }
  },
};
