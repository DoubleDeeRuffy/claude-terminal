'use strict';

module.exports = {
  type:     'workflow/webhook',
  title:    'Webhook',
  desc:     'Envoie un message à un webhook Slack / Discord / Teams',
  color:    'purple',
  width:    220,
  category: 'actions',
  icon:     'webhook',

  inputs: [
    { name: 'In', type: 'exec' },
  ],
  outputs: [
    { name: 'Done',       type: 'exec' },
    { name: 'Error',      type: 'exec' },
    { name: 'statusCode', type: 'number' },
    { name: 'body',       type: 'string' },
  ],

  props: {
    url: '',
    text: '',
    username: '',
    icon: '',
  },

  fields: [
    {
      type: 'text',
      key: 'url',
      label: 'URL du webhook',
      mono: true,
      placeholder: 'https://hooks.slack.com/services/...',
    },
    {
      type: 'textarea',
      key: 'text',
      label: 'Message',
      rows: 3,
      placeholder: 'Le build de $ctx.project est terminé ✅',
      hint: 'Supporte les variables $ctx, $node_X, $loop',
    },
    {
      type: 'text',
      key: 'username',
      label: 'Nom d\'affichage (optionnel)',
      placeholder: 'Claude Terminal',
    },
    {
      type: 'text',
      key: 'icon',
      label: 'Emoji icône (optionnel)',
      placeholder: ':robot_face:',
    },
  ],

  badge: () => '🔗',

  async run(config, vars, signal) {
    const https = require('https');
    const http  = require('http');
    const url   = config.url;
    if (!url) throw new Error('URL du webhook manquante');

    // Résolution basique des variables $xxx
    function resolve(str) {
      if (!str || typeof str !== 'string') return str;
      return str.replace(/\$(\w+(?:\.\w+)*)/g, (_, path) => {
        const parts = path.split('.');
        let val = vars;
        for (const p of parts) {
          if (val == null) return _;
          val = val[p];
        }
        return val != null ? String(val) : _;
      });
    }

    const payload = {
      text: resolve(config.text) || 'Notification de Claude Terminal',
    };
    if (config.username) payload.username = config.username;
    if (config.icon)     payload.icon_emoji = config.icon;

    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Aborted'));

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on('error', reject);
      if (signal) signal.addEventListener('abort', () => req.destroy(new Error('Aborted')));
      req.write(body);
      req.end();
    });
  },
};
