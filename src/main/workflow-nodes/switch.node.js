'use strict';

module.exports = {
  type:     'workflow/switch',
  title:    'Switch',
  desc:     'Brancher sur plusieurs valeurs',
  color:    'pink',
  width:    220,
  category: 'flow',
  icon:     'switch',

  inputs:  [{ name: 'In', type: 'exec' }],
  // Outputs rebuilt dynamically via rebuildOutputs()
  outputs: [{ name: 'default', type: 'exec' }],

  props: { variable: '', cases: 'case1,case2,case3' },

  fields: [
    { type: 'text', key: 'variable', label: 'Variable', placeholder: '$myVar', mono: true },
    { type: 'text', key: 'cases',    label: 'Cases',    placeholder: 'case1,case2,case3', mono: true },
  ],

  badge: (n) => (n.properties.variable || '$var').slice(0, 14),

  dynamic: 'switch',

  rebuildOutputs(engine, node) {
    // Clear existing links from outputs
    for (const out of node.outputs) {
      for (const lid of [...(out.links || [])]) {
        if (engine._removeLink) engine._removeLink(lid);
      }
    }
    node.outputs = [];
    const cases = (node.properties.cases || '').split(',').map(c => c.trim()).filter(Boolean);
    for (const c of cases) node.outputs.push({ name: c, type: 'exec', links: [] });
    node.outputs.push({ name: 'default', type: 'exec', links: [] });
  },

  run(config, vars) {
    const resolveVars = (value, vars) => {
      if (typeof value !== 'string') return value;
      const singleMatch = value.match(/^\$([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)$/);
      if (singleMatch) {
        const parts = singleMatch[1].split('.');
        let cur = vars instanceof Map ? vars.get(parts[0]) : vars[parts[0]];
        for (let i = 1; i < parts.length && cur != null; i++) cur = cur[parts[i]];
        if (cur != null) return typeof cur === 'string' ? cur.replace(/[\r\n]+$/, '') : cur;
      }
      return value.replace(/\$([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/g, (match, key) => {
        const parts = key.split('.');
        let cur = vars instanceof Map ? vars.get(parts[0]) : vars[parts[0]];
        for (let i = 1; i < parts.length && cur != null; i++) cur = cur[parts[i]];
        return cur != null ? String(cur).replace(/[\r\n]+$/, '') : match;
      });
    };

    const value  = resolveVars(config.variable || '', vars);
    const cases  = (config.cases || '').split(',').map(c => c.trim()).filter(Boolean);
    const idx    = cases.findIndex(c => String(value) === String(c));
    // idx = matched case slot, cases.length = default slot
    const matchedSlot = idx >= 0 ? idx : cases.length;
    return { value, matchedCase: idx >= 0 ? cases[idx] : 'default', matchedSlot, success: true };
  },
};
