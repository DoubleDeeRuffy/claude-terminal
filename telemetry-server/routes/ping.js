const geoip = require('geoip-lite');
const { insertEvent, upsertUser } = require('../db/database');

function pingRoute(req, res) {
  try {
    // req.ip respects Express 'trust proxy' setting
    const ip = req.ip;
    const xff = req.headers['x-forwarded-for'];
    console.log(`[Ping] ip=${ip} xff=${xff} trust_proxy=${req.app.get('trust proxy')}`);
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
