const config = require('../config');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d+\.\d+\.\d+/;

function validatePingPayload(req, res, next) {
  const { uuid, event_type, app_version, platform, arch, metadata } = req.body || {};

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

  if (!arch || !config.ALLOWED_ARCHS.includes(arch)) {
    return res.status(400).json({ error: 'Invalid arch' });
  }

  // Validate metadata size if present
  if (metadata !== undefined) {
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      return res.status(400).json({ error: 'Invalid metadata' });
    }
    const metaStr = JSON.stringify(metadata);
    if (metaStr.length > config.MAX_METADATA_SIZE) {
      return res.status(400).json({ error: 'Metadata too large' });
    }
  }

  next();
}

module.exports = { validatePingPayload };
