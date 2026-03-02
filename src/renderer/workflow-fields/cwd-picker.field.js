/**
 * cwd-picker field renderer
 * Renders a project select + optional custom path input for shell/git/claude nodes.
 * key should be 'projectId'; the companion 'cwd' property is handled automatically.
 */
const { escapeHtml, escapeAttr } = require('./_registry');

module.exports = {
  type: 'cwd-picker',

  render(field, value, node) {
    const projects =
      (typeof window !== 'undefined' && window._projectsState?.get?.()?.projects) || [];

    const props = node.properties || {};
    const isCustom =
      props.projectId === '__custom__' ||
      (!!props.cwd && !props.projectId);
    const selectedId = isCustom ? '__custom__' : (props.projectId || '');

    const optionsList = projects
      .map(p => `<option value="${escapeAttr(p.id)}"${selectedId === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
      .join('');

    const customInput = (selectedId === '__custom__') ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Chemin de travail</label>
  <span class="wf-field-hint">Chemin absolu ou variable — ex: $item.path</span>
  <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="cwd"
    value="${escapeAttr(props.cwd || '')}"
    placeholder="$item.path ou E:\\MonProjet" />
</div>` : '';

    return `<div class="wf-field-group" data-key="${escapeAttr(field.key)}">
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">${escapeHtml(field.label || 'Exécuter dans')}</label>
  <span class="wf-field-hint">${escapeHtml(field.hint || 'Répertoire de travail')}</span>
  <select class="wf-step-edit-input wf-cwd-select" data-key="projectId">
    <option value=""${!selectedId ? ' selected' : ''}>Projet courant (contexte workflow)</option>
    ${optionsList}
    <option value="__custom__"${selectedId === '__custom__' ? ' selected' : ''}>Chemin personnalisé…</option>
  </select>
</div>
${customInput}
</div>`;
  },

  bind(container, field, node, onChange) {
    const sel = container.querySelector('.wf-cwd-select');
    if (!sel) return;

    sel.addEventListener('change', () => {
      const val = sel.value;
      node.properties.projectId = val;
      onChange(val);

      // Re-render the custom path input inline without a full panel re-render
      let customDiv = container.querySelector('[data-key="cwd"]')?.closest('.wf-step-edit-field');
      if (val === '__custom__') {
        if (!customDiv) {
          const div = document.createElement('div');
          div.className = 'wf-step-edit-field';
          div.innerHTML = `<label class="wf-step-edit-label">Chemin de travail</label>
<span class="wf-field-hint">Chemin absolu ou variable — ex: $item.path</span>
<input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="cwd"
  value=""
  placeholder="$item.path ou E:\\MonProjet" />`;
          container.appendChild(div);

          const inp = div.querySelector('[data-key="cwd"]');
          if (inp) {
            inp.addEventListener('input', () => {
              node.properties.cwd = inp.value;
            });
          }
        }
      } else {
        if (customDiv) customDiv.remove();
      }
    });

    // Bind the custom cwd input if already present
    const cwdInput = container.querySelector('[data-key="cwd"]');
    if (cwdInput) {
      cwdInput.addEventListener('input', () => {
        node.properties.cwd = cwdInput.value;
      });
    }
  },
};
