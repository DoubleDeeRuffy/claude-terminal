'use strict';

module.exports = {
  type:     'workflow/variable',
  title:    'Set Variable',
  desc:     'Lire/écrire une variable',
  color:    'purple',
  width:    200,
  category: 'data',
  icon:     'variable',

  inputs:  [{ name: 'In', type: 'exec' }, { name: 'value', type: 'any' }],
  outputs: [{ name: 'Done', type: 'exec' }, { name: 'value', type: 'any' }],

  props: { action: 'set', name: '', value: '' },

  fields: [
    { type: 'select', key: 'action', label: 'Action', options: ['set', 'get', 'increment', 'append'] },
    { type: 'text',   key: 'name',   label: 'Nom',    placeholder: 'myVar', mono: true },
    { type: 'text',   key: 'value',  label: 'Valeur', placeholder: 'hello or $other',
      showIf: (p) => p.action === 'set' || p.action === 'append' },
  ],

  badge: (n) => (n.properties.action || 'set').toUpperCase(),
  getTitle: (n) => {
    const a  = n.properties.action || 'set';
    const nm = n.properties.name;
    if (a === 'get')       return nm ? `Get ${nm}`    : 'Get Variable';
    if (a === 'set')       return nm ? `Set ${nm}`    : 'Set Variable';
    if (a === 'increment') return nm ? `++ ${nm}`     : 'Increment';
    if (a === 'append')    return nm ? `Append ${nm}` : 'Append';
    return 'Variable';
  },
  drawExtra: (ctx, n) => {
    const MONO = '"Cascadia Code","Fira Code",monospace';
    if (n.properties.name) {
      ctx.fillStyle = '#555';
      ctx.font = `10px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText('$' + n.properties.name, 10, n.size[1] - 6);
    }
  },

  dynamic: 'variable',

  rebuildOutputs(engine, node) {
    const action = node.properties.action || 'set';

    // Clear all existing links
    for (const inp of node.inputs) {
      if (inp.link != null && engine._removeLink) engine._removeLink(inp.link);
    }
    for (const out of node.outputs) {
      for (const lid of [...(out.links || [])]) {
        if (engine._removeLink) engine._removeLink(lid);
      }
    }

    if (action === 'get') {
      // Pure node: no exec pins, just data output
      node.inputs  = [];
      node.outputs = [{ name: 'value', type: 'any', links: [] }];
    } else if (action === 'set' || action === 'append') {
      // Exec + data input for the value + data output
      node.inputs  = [
        { name: 'In',    type: 'exec', link: null },
        { name: 'value', type: 'any',  link: null },
      ];
      node.outputs = [
        { name: 'Done',  type: 'exec', links: [] },
        { name: 'value', type: 'any',  links: [] },
      ];
    } else {
      // increment: exec only, no data input needed
      node.inputs  = [{ name: 'In', type: 'exec', link: null }];
      node.outputs = [
        { name: 'Done',  type: 'exec', links: [] },
        { name: 'value', type: 'any',  links: [] },
      ];
    }
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

    const action = config.action || 'set';
    const name   = config.name   || '';
    if (!name) throw new Error('Variable node: no name specified');

    const currentValue = vars instanceof Map ? vars.get(name) : vars?.[name];

    switch (action) {
      case 'set': {
        const raw   = config.value != null ? config.value : '';
        const value = resolveVars(raw, vars);
        if (vars instanceof Map) vars.set(name, value);
        return { name, value, action: 'set' };
      }
      case 'get': {
        return { name, value: currentValue ?? null, action: 'get' };
      }
      case 'increment': {
        const increment = parseFloat(config.value) || 1;
        const newValue  = (parseFloat(currentValue) || 0) + increment;
        if (vars instanceof Map) vars.set(name, newValue);
        return { name, value: newValue, action: 'increment' };
      }
      case 'append': {
        const rawA  = config.value != null ? config.value : '';
        const value = resolveVars(rawA, vars);
        const arr   = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
        arr.push(value);
        if (vars instanceof Map) vars.set(name, arr);
        return { name, value: arr, action: 'append' };
      }
      default:
        throw new Error(`Variable node: unknown action "${action}"`);
    }
  },
};
