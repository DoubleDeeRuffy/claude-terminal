/**
 * time-config field renderer
 * Renders the Time node configuration:
 * - Action select
 * - Project ID input (conditional: get_project / get_sessions)
 * - Date range inputs (conditional: get_sessions)
 * - Output hints block
 */
const { escapeHtml, escapeAttr } = require('./_registry');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderConditionals(action, props, nodeId) {
  const id = nodeId != null ? nodeId : 'X';
  const needsProject = action === 'get_project';
  const needsDates = action === 'get_sessions';

  const projectField = (needsProject || needsDates) ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">ID Projet${needsDates ? ' (optionnel)' : ''}</label>
  <span class="wf-field-hint">${needsDates ? 'Vide = sessions globales, sinon sessions d\'un projet' : 'Identifiant du projet (ou variable — ex: $item.id)'}</span>
  <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="projectId"
    value="${esc(props.projectId || '')}" placeholder="${needsDates ? '' : '$ctx.project'}" />
</div>` : '';

  const dateFields = needsDates ? `
<div class="wf-field-row">
  <div class="wf-step-edit-field wf-field-half">
    <label class="wf-step-edit-label">Date début</label>
    <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="startDate"
      type="date" value="${esc(props.startDate || '')}" />
  </div>
  <div class="wf-step-edit-field wf-field-half">
    <label class="wf-step-edit-label">Date fin</label>
    <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="endDate"
      type="date" value="${esc(props.endDate || '')}" />
  </div>
</div>` : '';

  // Output hints per action
  let outputItems = '';
  if (action === 'get_today') {
    outputItems = `
  <code>$node_${esc(String(id))}.today</code> <span>ms aujourd'hui</span>
  <code>$node_${esc(String(id))}.week</code> <span>ms cette semaine</span>
  <code>$node_${esc(String(id))}.month</code> <span>ms ce mois</span>
  <code>$node_${esc(String(id))}.projects</code> <span>projets actifs aujourd'hui</span>`;
  } else if (action === 'get_week') {
    outputItems = `
  <code>$node_${esc(String(id))}.total</code> <span>ms total semaine</span>
  <code>$node_${esc(String(id))}.days</code> <span>tableau des 7 jours [{date, ms, formatted}]</span>`;
  } else if (action === 'get_project') {
    outputItems = `
  <code>$node_${esc(String(id))}.today</code> <span>ms aujourd'hui</span>
  <code>$node_${esc(String(id))}.week</code> <span>ms cette semaine</span>
  <code>$node_${esc(String(id))}.total</code> <span>ms total</span>
  <code>$node_${esc(String(id))}.sessionCount</code> <span>nombre de sessions</span>`;
  } else if (action === 'get_all_projects') {
    outputItems = `
  <code>$node_${esc(String(id))}.projects</code> <span>tableau de tous les projets</span>
  <code>$node_${esc(String(id))}.count</code> <span>nombre de projets</span>`;
  } else if (action === 'get_sessions') {
    outputItems = `
  <code>$node_${esc(String(id))}.sessions</code> <span>tableau des sessions</span>
  <code>$node_${esc(String(id))}.count</code> <span>nombre de sessions</span>
  <code>$node_${esc(String(id))}.totalMs</code> <span>durée totale en ms</span>`;
  }

  const hintsBlock = `<div class="wf-db-output-hint wf-time-output-hints">
  <div class="wf-db-output-title">Sorties disponibles</div>
  <div class="wf-db-output-items">${outputItems}</div>
</div>`;

  return `${projectField}${dateFields}${hintsBlock}`;
}

module.exports = {
  type: 'time-config',

  render(field, value, node) {
    const props = node.properties || {};
    const action = props.action || 'get_today';

    return `<div class="wf-field-group" data-key="action">
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Action</label>
  <span class="wf-field-hint">Type de données à récupérer</span>
  <select class="wf-step-edit-input wf-node-prop wf-time-action-select" data-key="action">
    <option value="get_today"${action === 'get_today' ? ' selected' : ''}>Aujourd'hui — total global + projets actifs</option>
    <option value="get_week"${action === 'get_week' ? ' selected' : ''}>Cette semaine — détail par jour</option>
    <option value="get_project"${action === 'get_project' ? ' selected' : ''}>Projet — stats d'un projet spécifique</option>
    <option value="get_all_projects"${action === 'get_all_projects' ? ' selected' : ''}>Tous les projets — classés par temps aujourd'hui</option>
    <option value="get_sessions"${action === 'get_sessions' ? ' selected' : ''}>Sessions — liste brute (filtrable)</option>
  </select>
</div>
<div class="wf-time-conditional">
${renderConditionals(action, props, node.id)}
</div>
</div>`;
  },

  bind(container, field, node, onChange) {
    const actionSel = container.querySelector('.wf-time-action-select');
    if (!actionSel) return;

    actionSel.addEventListener('change', () => {
      const action = actionSel.value;
      node.properties.action = action;
      onChange(action);

      const condDiv = container.querySelector('.wf-time-conditional');
      if (condDiv) {
        condDiv.innerHTML = renderConditionals(action, node.properties || {}, node.id);

        // Bind new inputs
        condDiv.querySelectorAll('.wf-node-prop').forEach(el => {
          const key = el.dataset.key;
          if (!key) return;
          el.addEventListener('input', () => { node.properties[key] = el.value; });
          el.addEventListener('change', () => { node.properties[key] = el.value; });
        });
      }
    });
  },
};
