const config = require('../config');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d+\.\d+\.\d+/;

function validatePingPayload(req, res, next) {
  const { uuid, event_type, app_version, platform, arch } = req.body || {};

  if (!uuid || !UUID_RE.test(uuid)) {
    return res.status(400).json({ error: 'Invalid uuid' });
  }

  if (!event_type || !config.ALLOWED_EVENT_TYPES.includes(event_type)) {
    return res.status(400).json({ error: 'Invalid event_type' });
  }

  if (!app_version || !VERSION_RE.test(app_version)) {
    return res.status(400).json({ error: 'Invalid app_version' });
  }

  if (!platform || !config.ALLOWED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  if (!arch || typeof arch !== 'string') {
    return res.status(400).json({ error: 'Invalid arch' });
  }

  next();
}

module.exports = { validatePingPayload };
