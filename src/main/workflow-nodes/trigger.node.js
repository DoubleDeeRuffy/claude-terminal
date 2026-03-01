'use strict';

module.exports = {
  type:      'workflow/trigger',
  title:     'Trigger',
  desc:      'Point de départ',
  color:     'success',
  width:     200,
  category:  'actions',
  icon:      'play',
  removable: false,

  inputs:  [],
  outputs: [{ name: 'Start', type: 'exec' }],

  props: { triggerType: 'manual', triggerValue: '', hookType: 'PostToolUse' },

  fields: [
    { type: 'select', key: 'triggerType', label: 'Type',
      options: ['manual', 'cron', 'hook', 'on_workflow'] },
    { type: 'text',   key: 'triggerValue', label: 'Valeur', placeholder: '0 9 * * 1-5',
      showIf: (p) => p.triggerType === 'cron' || p.triggerType === 'on_workflow' },
    { type: 'select', key: 'hookType', label: 'Hook type',
      options: ['PostToolUse', 'PreToolUse', 'Stop', 'SubagentStop', 'PreCompact', 'Notification'],
      showIf: (p) => p.triggerType === 'hook' },
  ],

  badge: (n) => (n.properties.triggerType || 'manual').toUpperCase(),

  // No run() — trigger nodes are the starting point, not executed as steps
};
