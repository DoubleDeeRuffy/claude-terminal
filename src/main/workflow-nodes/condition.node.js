'use strict';

module.exports = {
  type:     'workflow/condition',
  title:    'Condition',
  desc:     'Branchement conditionnel',
  color:    'success',
  width:    220,
  category: 'flow',
  icon:     'condition',

  inputs:  [{ name: 'In', type: 'exec' }],
  outputs: [
    { name: 'TRUE',  type: 'exec' },
    { name: 'FALSE', type: 'exec' },
  ],

  props: { conditionMode: 'builder', variable: '', operator: '==', value: '', expression: '' },

  fields: [
    { type: 'select',   key: 'conditionMode', label: 'Mode',      options: ['builder', 'expression'] },
    { type: 'text',     key: 'variable',      label: 'Variable',  placeholder: '$myVar',
      showIf: (p) => !p.conditionMode || p.conditionMode === 'builder' },
    { type: 'select',   key: 'operator',      label: 'Opérateur',
      options: ['==', '!=', '>', '<', '>=', '<=', 'contains', 'starts_with', 'matches', 'is_empty', 'is_not_empty'],
      showIf: (p) => !p.conditionMode || p.conditionMode === 'builder' },
    { type: 'text',     key: 'value',         label: 'Valeur',    placeholder: 'expected',
      showIf: (p) => (!p.conditionMode || p.conditionMode === 'builder') &&
                     p.operator !== 'is_empty' && p.operator !== 'is_not_empty' },
    { type: 'textarea', key: 'expression',    label: 'Expression',
      placeholder: '$count > 0',
      showIf: (p) => p.conditionMode === 'expression' },
  ],

  drawExtra: (ctx, n) => {
    const FONT   = '"Inter","Segoe UI",sans-serif';
    const SLOT_H = 24;
    const roundRect = (ctx, x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };
    ctx.font = `700 8px ${FONT}`;
    ctx.fillStyle = 'rgba(74,222,128,.12)';
    roundRect(ctx, n.size[0] - 38, SLOT_H * 0 + 2, 26, 13, 3);
    ctx.fill();
    ctx.fillStyle = '#4ade80'; ctx.textAlign = 'center';
    ctx.fillText('TRUE', n.size[0] - 25, SLOT_H * 0 + 12);
    ctx.fillStyle = 'rgba(239,68,68,.12)';
    roundRect(ctx, n.size[0] - 43, SLOT_H * 1 + 2, 31, 13, 3);
    ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.textAlign = 'center';
    ctx.fillText('FALSE', n.size[0] - 27, SLOT_H * 1 + 12);
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

    const evalCondition = (condition, vars) => {
      if (!condition || condition.trim() === '') return true;
      const resolved = resolveVars(condition, vars);
      if (resolved === 'true')  return true;
      if (resolved === 'false') return false;

      const unaryMatch = resolved.match(/^(.+?)\s+(is_empty|is_not_empty)$/);
      if (unaryMatch) {
        const val = unaryMatch[1].trim();
        const isEmpty = val === '' || val === 'null' || val === 'undefined' || val === '[]' || val === '{}';
        return unaryMatch[2] === 'is_empty' ? isEmpty : !isEmpty;
      }

      const match = resolved.match(/^(.+?)\s*(==|!=|>=|<=|>|<|contains|starts_with|matches)\s+(.+)$/);
      if (!match) {
        const val = resolved.trim();
        if (val === '' || val === '0' || val === 'null' || val === 'undefined') return false;
        return true;
      }

      const [, leftRaw, op, rightRaw] = match;
      const left  = leftRaw.trim();
      const right = rightRaw.trim();
      const ln    = parseFloat(left);
      const rn    = parseFloat(right);
      const numeric = !isNaN(ln) && !isNaN(rn);

      switch (op) {
        case '==': return numeric ? ln === rn : left === right;
        case '!=': return numeric ? ln !== rn : left !== right;
        case '>':  return numeric && ln > rn;
        case '<':  return numeric && ln < rn;
        case '>=': return numeric && ln >= rn;
        case '<=': return numeric && ln <= rn;
        case 'contains':    return left.includes(right);
        case 'starts_with': return left.startsWith(right);
        case 'matches': {
          try { return new RegExp(right).test(left); } catch { return false; }
        }
      }
      return false;
    };

    let expression = config.expression;
    if (!expression && config.variable) {
      const variable = config.variable || '';
      const operator = config.operator || '==';
      const isUnary  = operator === 'is_empty' || operator === 'is_not_empty';
      const value    = config.value ?? '';
      expression = isUnary ? `${variable} ${operator}` : `${variable} ${operator} ${value}`;
    }

    const result = evalCondition(resolveVars(expression || 'true', vars), vars);
    return { result, value: result };
  },
};
