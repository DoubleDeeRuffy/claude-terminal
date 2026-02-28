const geoip = require('geoip-lite');
const { insertEvent, upsertUser } = require('../db/database');

function batchRoute(req, res) {
  try {
    const { uuid, app_version, platform, arch, os_version, locale, first_seen_version, events } = req.body;

    const geo = geoip.lookup(req.ip);
    const baseData = {
      uuid,
      app_version,
      platform,
      arch,
      os_version,
      locale,
      first_seen_version,
      country: geo?.country || null,
      city: geo?.city || null
    };

    for (const event of events) {
      insertEvent({
        ...baseData,
        event_type: event.event_type,
        metadata: event.metadata || {}
      });
    }

    upsertUser(baseData);
    res.status(200).json({ success: true, processed: events.length });
  } catch (err) {
    console.error('[Batch] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = batchRoute;
