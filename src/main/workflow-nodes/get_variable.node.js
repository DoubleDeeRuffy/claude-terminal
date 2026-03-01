'use strict';

module.exports = {
  type:     'workflow/get_variable',
  title:    'Get Variable',
  desc:     'Lire une variable (pure)',
  color:    'purple',
  width:    150,
  category: 'data',
  icon:     'variable',

  inputs:  [],
  outputs: [{ name: 'value', type: 'any' }],

  props: { name: '', varType: 'any' },

  fields: [
    { type: 'text',   key: 'name',    label: 'Nom',  placeholder: 'myVar', mono: true },
    { type: 'select', key: 'varType', label: 'Type', options: ['any', 'string', 'number', 'boolean', 'array', 'object'] },
  ],

  getTitle: (n) => n.properties.name || 'Get Variable',

  drawExtra: (ctx, n) => {
    const PIN_COLORS = {
      any:     '#888',
      string:  '#60a5fa',
      number:  '#34d399',
      boolean: '#a78bfa',
      array:   '#f59e0b',
      object:  '#fb923c',
    };
    const t  = n.properties.varType || 'any';
    const pc = PIN_COLORS[t] || PIN_COLORS.any;
    ctx.fillStyle   = pc;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, 3, n.size[1]);
    ctx.globalAlpha = 1;
  },

  // No run() — this is a pure data node resolved by the graph engine from vars
};
