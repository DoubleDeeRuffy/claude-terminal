/**
 * subworkflow-picker field renderer
 * Renders the Subworkflow node configuration:
 * - Workflow select (from _workflowsListCache)
 * - Input vars textarea
 * - Wait for completion select
 */
const { escapeHtml, escapeAttr } = require('./_registry');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  type: 'subworkflow-picker',

  render(field, value, node) {
    const props = node.properties || {};
    const workflows =
      (typeof window !== 'undefined' && window._workflowsListCache) || [];

    const optionsList = workflows
      .filter(w => w.id !== (props._workflowId || ''))
      .map(w => `<option value="${esc(w.id)}"${props.workflow === w.id ? ' selected' : ''}>${esc(w.name)}</option>`)
      .join('');

    const waitValue = String(props.waitForCompletion !== false && props.waitForCompletion !== 'false');

    return `<div class="wf-field-group" data-key="workflow">
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Workflow</label>
  <span class="wf-field-hint">Workflow à exécuter comme sous-processus</span>
  <select class="wf-step-edit-input wf-node-prop" data-key="workflow">
    <option value="">-- Choisir un workflow --</option>
    ${optionsList}
  </select>
</div>
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Variables d'entrée</label>
  <span class="wf-field-hint">JSON des variables à passer (optionnel)</span>
  <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="inputVars"
    rows="3" placeholder='{"key": "$node_1.output"}'>${esc(props.inputVars || '')}</textarea>
</div>
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Attendre la fin</label>
  <span class="wf-field-hint">Bloquer l'exécution jusqu'à la fin du sous-workflow</span>
  <select class="wf-step-edit-input wf-node-prop" data-key="waitForCompletion">
    <option value="true"${waitValue === 'true' ? ' selected' : ''}>Oui — attendre la fin</option>
    <option value="false"${waitValue === 'false' ? ' selected' : ''}>Non — lancer en arrière-plan</option>
  </select>
</div>
</div>`;
  },

  bind(container, field, node, onChange) {
    // Standard wf-node-prop binding is handled by WorkflowPanel.
    // No extra custom binding needed for this field.
  },
};
