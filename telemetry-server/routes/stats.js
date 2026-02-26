const config = require('../config');
const { getStats } = require('../db/database');

function statsRoute(req, res) {
  const token = req.headers['authorization']?.replace('Bearer ', '');

  if (!token || token !== config.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    console.error('[Stats] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = statsRoute;
