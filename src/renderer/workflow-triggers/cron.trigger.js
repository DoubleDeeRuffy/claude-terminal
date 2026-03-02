'use strict';

module.exports = {
  type: 'cron',
  label: 'Planifié (cron)',
  fields: [
    {
      type: 'cron-picker',
      key: 'triggerValue',
      label: 'Planning',
      placeholder: '*/5 * * * *',
      hint: 'Format cron : min heure jour mois jour-semaine',
    },
  ],
};
