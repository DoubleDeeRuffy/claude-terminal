const { escapeHtml, escapeAttr } = require('./_registry');

module.exports = {
  type: 'variable-autocomplete',

  render(field, value, node) {
    return `<div class="wf-field-group" data-key="${escapeAttr(field.key)}">
  <label class="wf-field-label">${escapeHtml(field.label || field.key)}</label>
  <input type="text" class="wf-input wf-var-input" value="${escapeAttr(value || '')}"
         placeholder="{{variable}} ou valeur" data-key="${escapeAttr(field.key)}" />
  <div class="wf-var-suggestions" style="display:none"></div>
</div>`;
  },

  bind(container, field, node, onChange) {
    const input       = container.querySelector('.wf-var-input');
    const suggestions = container.querySelector('.wf-var-suggestions');

    if (!input) return;

    input.addEventListener('input', () => onChange(input.value));

    input.addEventListener('keyup', e => {
      // Placeholder for future autocomplete: show suggestions when {{ is typed
      if (!suggestions) return;
      const cursorPos = input.selectionStart;
      const textBefore = input.value.slice(0, cursorPos);
      const openBrace = textBefore.lastIndexOf('{{');

      if (openBrace !== -1 && !textBefore.includes('}}', openBrace)) {
        // User is typing inside {{ }}; autocomplete could be wired here
        // For now, we simply hide the suggestions panel
        suggestions.style.display = 'none';
      } else {
        suggestions.style.display = 'none';
      }
    });

    // Close suggestions when focus leaves the input
    input.addEventListener('blur', () => {
      if (suggestions) suggestions.style.display = 'none';
    });
  },
};
