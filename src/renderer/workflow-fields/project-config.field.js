/**
 * project-config field renderer
 * Renders the Project node configuration:
 * - Action select
 * - Project select (conditional: when action !== 'list')
 * - Info hint (when action === 'list')
 */
const { escapeHtml, escapeAttr } = require('./_registry');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderProjectSection(action, props) {
  if (action === 'list') {
    return `<div class="wf-step-edit-field">
  <span class="wf-field-hint">Retourne un array de tous les projets Claude Terminal. Connectez la sortie au slot Items d'un node Loop pour itérer.</span>
</div>`;
  }
  const projects =
    (typeof window !== 'undefined' && window._projectsState?.get?.()?.projects) || [];
  const optionsList = projects
    .map(p => `<option value="${esc(p.id)}"${props.projectId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`)
    .join('');
  return `<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Projet</label>
  <span class="wf-field-hint">Projet cible de cette opération</span>
  <select class="wf-step-edit-input wf-node-prop wf-project-select" data-key="projectId">
    <option value="">-- Choisir un projet --</option>
    ${optionsList}
  </select>
</div>`;
}

module.exports = {
  type: 'project-config',

  render(field, value, node) {
    const props = node.properties || {};
    const action = props.action || 'list';

    return `<div class="wf-field-group" data-key="action">
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Action</label>
  <span class="wf-field-hint">Opération à effectuer</span>
  <select class="wf-step-edit-input wf-node-prop wf-project-action-select" data-key="action">
    <option value="list"${action === 'list' ? ' selected' : ''}>Lister tous les projets</option>
    <option value="set_context"${action === 'set_context' ? ' selected' : ''}>Définir comme contexte actif</option>
    <option value="open"${action === 'open' ? ' selected' : ''}>Ouvrir dans l'éditeur</option>
    <option value="build"${action === 'build' ? ' selected' : ''}>Lancer le build</option>
    <option value="install"${action === 'install' ? ' selected' : ''}>Installer les dépendances</option>
    <option value="test"${action === 'test' ? ' selected' : ''}>Exécuter les tests</option>
  </select>
</div>
<div class="wf-project-conditional">
${renderProjectSection(action, props)}
</div>
</div>`;
  },

  bind(container, field, node, onChange) {
    const actionSel = container.querySelector('.wf-project-action-select');
    if (!actionSel) return;

    actionSel.addEventListener('change', () => {
      const action = actionSel.value;
      node.properties.action = action;
      onChange(action);

      const condDiv = container.querySelector('.wf-project-conditional');
      if (condDiv) {
        condDiv.innerHTML = renderProjectSection(action, node.properties || {});

        // Bind project select if present
        const projSel = condDiv.querySelector('.wf-project-select');
        if (projSel) {
          projSel.addEventListener('change', () => { node.properties.projectId = projSel.value; });
        }
      }
    });

    // Bind initial project select
    const projSel = container.querySelector('.wf-project-select');
    if (projSel) {
      projSel.addEventListener('change', () => { node.properties.projectId = projSel.value; });
    }
  },
};
