const geoip = require('geoip-lite');
const { insertEvent, upsertUser } = require('../db/database');

function getClientIp(req) {
  // Support reverse proxy (nginx/caddy) forwarding
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress;
}

function pingRoute(req, res) {
  try {
    // Resolve IP to country/city, then discard the IP entirely
    const ip = getClientIp(req);
    const geo = geoip.lookup(ip);
    const data = {
      ...req.body,
      country: geo?.country || null,
      city: geo?.city || null
    };

    insertEvent(data);
    upsertUser(data);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Ping] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = pingRoute;
