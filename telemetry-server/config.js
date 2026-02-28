const crypto = require('crypto');

// Require ADMIN_TOKEN in production, generate random one for dev
const adminToken = process.env.ADMIN_TOKEN;
if (!adminToken && process.env.NODE_ENV === 'production') {
  console.error('[Config] ADMIN_TOKEN environment variable is required in production');
  process.exit(1);
}

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  DB_PATH: process.env.DB_PATH || './telemetry.db',
  ADMIN_TOKEN: adminToken || crypto.randomBytes(32).toString('hex'),
  TRUST_PROXY: process.env.TRUST_PROXY || false, // Set to 'true' or '1' behind nginx/caddy

  RATE_LIMIT: {
    windowMs: 60 * 1000,       // 1 minute
    maxPerEvent: 1,            // 1 event per UUID per event_type per window
    maxPerIp: 120,             // Max pings per IP per window (prevents UUID flooding)
    maxMapSize: 50000          // Max entries in rate limit map before forced cleanup
  },

  ALLOWED_PLATFORMS: ['win32', 'darwin', 'linux'],
  ALLOWED_ARCHS: ['x64', 'arm64', 'ia32', 'arm'],
  MAX_METADATA_SIZE: 1024, // Max metadata JSON string length

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
    'features:worktree:create',
    'features:hooks:install',
    'features:cloud:connect',
    'errors:uncaught'
  ]
};
