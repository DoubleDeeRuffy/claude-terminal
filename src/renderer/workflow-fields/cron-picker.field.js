const { escapeHtml, escapeAttr } = require('./_registry');

const PRESETS = [
  { label: 'Chaque minute',       value: '* * * * *' },
  { label: 'Toutes les heures',   value: '0 * * * *' },
  { label: 'Chaque jour à minuit', value: '0 0 * * *' },
  { label: 'Chaque lundi',        value: '0 0 * * 1' },
];

module.exports = {
  type: 'cron-picker',

  render(field, value, node) {
    const presetHtml = PRESETS.map(p =>
      `<button type="button" class="wf-cron-preset" data-value="${escapeAttr(p.value)}">${escapeHtml(p.label)}</button>`
    ).join('');

    return `<div class="wf-field-group" data-key="${escapeAttr(field.key)}">
  <label class="wf-field-label">${escapeHtml(field.label || 'Planning')}</label>
  <input type="text" class="wf-input wf-cron-input" value="${escapeAttr(value || '')}"
         placeholder="* * * * *" data-key="${escapeAttr(field.key)}" />
  <div class="wf-cron-presets">${presetHtml}</div>
  <span class="wf-cron-desc"></span>
</div>`;
  },

  bind(container, field, node, onChange) {
    const input = container.querySelector('.wf-cron-input');
    const desc  = container.querySelector('.wf-cron-desc');

    function updateDesc(val) {
      if (!desc) return;
      if (!val) {
        desc.textContent = '';
        return;
      }
      // Match against known presets for a human-readable label
      const preset = PRESETS.find(p => p.value === val.trim());
      desc.textContent = preset ? preset.label : val;
    }

    if (input) {
      input.addEventListener('input', () => {
        updateDesc(input.value);
        onChange(input.value);
      });
      updateDesc(input.value);
    }

    container.querySelectorAll('.wf-cron-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        if (input) input.value = btn.dataset.value;
        updateDesc(btn.dataset.value);
        onChange(btn.dataset.value);
      });
    });
  },
};
