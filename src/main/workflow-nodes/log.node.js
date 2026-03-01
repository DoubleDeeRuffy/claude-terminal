'use strict';

module.exports = {
  type:     'workflow/log',
  title:    'Log',
  desc:     'Écrire dans le log',
  color:    'slate',
  width:    200,
  category: 'flow',
  icon:     'log',

  inputs:  [{ name: 'In', type: 'exec' }, { name: 'message', type: 'string' }],
  outputs: [{ name: 'Done', type: 'exec' }],

  props: { level: 'info', message: '' },

  fields: [
    { type: 'select',   key: 'level',   label: 'Niveau', options: ['debug', 'info', 'warn', 'error'] },
    { type: 'textarea', key: 'message', label: 'Message', placeholder: 'Log $variable here' },
  ],

  badge: (n) => (n.properties.level || 'info').toUpperCase(),
  badgeColor: (n) => ({ debug: '#94a3b8', info: '#60a5fa', warn: '#fbbf24', error: '#ef4444' }[n.properties.level]),

  run(config, vars, signal, ctx) {
    const resolveVars = (value, vars) => {
      if (typeof value !== 'string') return value;
      return value.replace(/\$([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/g, (match, key) => {
        const parts = key.split('.');
        let cur = vars instanceof Map ? vars.get(parts[0]) : vars[parts[0]];
        for (let i = 1; i < parts.length && cur != null; i++) cur = cur[parts[i]];
        return cur != null ? String(cur).replace(/[\r\n]+$/, '') : match;
      });
    };

    const level   = config.level   || 'info';
    const message = resolveVars(config.message || '', vars);

    if (ctx?.sendFn) ctx.sendFn('workflow-log', { level, message, timestamp: Date.now() });

    return { level, message, logged: true };
  },
};
