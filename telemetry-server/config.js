module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  DB_PATH: process.env.DB_PATH || './telemetry.db',
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'change-me-in-production',

  RATE_LIMIT: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxPerEvent: 1              // 1 event per UUID per event_type per window
  },

  ALLOWED_PLATFORMS: ['win32', 'darwin', 'linux'],

  ALLOWED_EVENT_TYPES: [
    'app:start',
    'app:quit',
    'features:terminal:create',
    'features:chat:message',
    'features:git:pull',
    'features:git:push',
    'features:git:commit',
    'features:mcp:start',
    'features:mcp:stop',
    'features:remote:connect',
    'features:skill:install',
    'features:plugin:install',
    'errors:uncaught'
  ]
};
