const { insertEvent, upsertUser } = require('../db/database');

function pingRoute(req, res) {
  try {
    insertEvent(req.body);
    upsertUser(req.body);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Ping] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = pingRoute;
