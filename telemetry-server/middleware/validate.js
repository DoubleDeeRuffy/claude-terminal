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

function validateBatchPayload(req, res, next) {
  const { uuid, app_version, platform, arch, events } = req.body || {};

  if (!uuid || !UUID_RE.test(uuid)) {
    return res.status(400).json({ error: 'Invalid uuid' });
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

  if (!Array.isArray(events) || events.length === 0 || events.length > 50) {
    return res.status(400).json({ error: 'Invalid events array (1-50 items)' });
  }

  for (const event of events) {
    if (!event.event_type || !config.ALLOWED_EVENT_TYPES.includes(event.event_type)) {
      return res.status(400).json({ error: `Invalid event_type: ${event.event_type}` });
    }
    if (event.metadata !== undefined) {
      if (typeof event.metadata !== 'object' || Array.isArray(event.metadata)) {
        return res.status(400).json({ error: 'Invalid metadata in event' });
      }
      const metaStr = JSON.stringify(event.metadata);
      if (metaStr.length > config.MAX_METADATA_SIZE) {
        return res.status(400).json({ error: 'Metadata too large in event' });
      }
    }
  }

  next();
}

module.exports = { validatePingPayload, validateBatchPayload };
