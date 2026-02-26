const config = require('../config');

// In-memory store: Map<"uuid:event_type", timestamp>
const lastSeen = new Map();

function rateLimitMiddleware(req, res, next) {
  if (req.path !== '/api/v1/ping') return next();

  const { uuid, event_type } = req.body || {};
  if (!uuid || !event_type) return next(); // validation middleware handles this

  const key = `${uuid}:${event_type}`;
  const now = Date.now();
  const last = lastSeen.get(key);

  if (last && (now - last) < config.RATE_LIMIT.windowMs) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retry_after: Math.ceil((config.RATE_LIMIT.windowMs - (now - last)) / 1000)
    });
  }

  lastSeen.set(key, now);
  next();
}

// Cleanup expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of lastSeen.entries()) {
    if ((now - ts) > config.RATE_LIMIT.windowMs) {
      lastSeen.delete(key);
    }
  }
}, 60 * 60 * 1000);

module.exports = { rateLimitMiddleware };
