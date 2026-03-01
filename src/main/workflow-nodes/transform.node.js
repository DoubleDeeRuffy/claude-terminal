'use strict';

module.exports = {
  type:     'workflow/transform',
  title:    'Transform',
  desc:     'Transformer des données',
  color:    'teal',
  width:    230,
  category: 'data',
  icon:     'transform',

  inputs:  [{ name: 'In', type: 'exec' }, { name: 'input', type: 'any' }],
  outputs: [
    { name: 'Done',   type: 'exec'   },
    { name: 'Error',  type: 'exec'   },
    { name: 'result', type: 'any'    },
    { name: 'count',  type: 'number' },
  ],

  props: { operation: 'map', input: '', expression: '', outputVar: '' },

  fields: [
    { type: 'select', key: 'operation', label: 'Opération',
      options: ['map', 'filter', 'reduce', 'find', 'pluck', 'count', 'sort', 'unique', 'flatten', 'json_parse', 'json_stringify'] },
    { type: 'text',   key: 'input',     label: 'Input',      placeholder: '$myArray', mono: true },
    { type: 'text',   key: 'expression',label: 'Expression', placeholder: 'item.name', mono: true },
    { type: 'text',   key: 'outputVar', label: 'Output var', placeholder: 'result', mono: true },
  ],

  badge: (n) => (n.properties.operation || 'map').toUpperCase(),

  run(config, vars) {
    const resolveVars = (value, vars) => {
      if (typeof value !== 'string') return value;
      // Fast path: single variable reference — return raw value
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

    const operation = config.operation || 'map';
    const inputRaw  = config.input ? resolveVars(config.input, vars) : null;
    const expr      = config.expression ? resolveVars(config.expression, vars) : '';

    if (operation === 'json_parse') {
      try {
        const parsed = JSON.parse(typeof inputRaw === 'string' ? inputRaw : JSON.stringify(inputRaw));
        return { result: parsed, count: Array.isArray(parsed) ? parsed.length : 1, success: true };
      } catch (e) {
        throw new Error(`json_parse failed: ${e.message}`);
      }
    }

    if (operation === 'json_stringify') {
      return { result: JSON.stringify(inputRaw, null, 2), success: true };
    }

    const input = Array.isArray(inputRaw) ? inputRaw : (inputRaw != null ? [inputRaw] : []);

    const makeFn = (body) => {
      try {
        // eslint-disable-next-line no-new-func
        return new Function('item', 'index', `"use strict"; return (${body});`);
      } catch {
        throw new Error(`Invalid expression: ${body}`);
      }
    };

    let result;
    switch (operation) {
      case 'map':
        result = input.map((item, index) => expr ? makeFn(expr)(item, index) : item);
        break;
      case 'filter':
        result = input.filter((item, index) => expr ? makeFn(expr)(item, index) : true);
        break;
      case 'find':
        result = expr ? input.find((item, index) => makeFn(expr)(item, index)) : input[0];
        break;
      case 'reduce': {
        // eslint-disable-next-line no-new-func
        const reduceFn = expr ? new Function('acc', 'item', 'index', `"use strict"; return (${expr});`) : (acc, item) => acc + item;
        result = input.reduce(reduceFn, 0);
        break;
      }
      case 'pluck':
        result = input.map(item => {
          if (!expr) return item;
          return expr.split('.').reduce((o, k) => (o != null ? o[k] : undefined), item);
        });
        break;
      case 'count':
        result = expr ? input.filter((item, index) => makeFn(expr)(item, index)).length : input.length;
        break;
      case 'sort':
        result = [...input].sort((a, b) => {
          if (!expr) return 0;
          const va = expr.split('.').reduce((o, k) => (o != null ? o[k] : undefined), a);
          const vb = expr.split('.').reduce((o, k) => (o != null ? o[k] : undefined), b);
          return va < vb ? -1 : va > vb ? 1 : 0;
        });
        break;
      case 'unique':
        if (expr) {
          const seen = new Set();
          result = input.filter(item => {
            const key = expr.split('.').reduce((o, k) => (o != null ? o[k] : undefined), item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        } else {
          result = [...new Set(input)];
        }
        break;
      case 'flatten':
        result = input.flat(expr ? parseInt(expr, 10) || 1 : 1);
        break;
      default:
        throw new Error(`Unknown transform operation: ${operation}`);
    }

    return {
      result,
      count: Array.isArray(result) ? result.length : 1,
      success: true,
    };
  },
};
