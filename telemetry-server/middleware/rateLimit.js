const config = require('../config');

// Per-UUID rate limit: Map<"uuid:event_type", timestamp>
const lastSeen = new Map();

// Per-IP global rate limit: Map<ip, { count, windowStart }>
const ipCounts = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function rateLimitMiddleware(req, res, next) {
  if (req.path !== '/api/v1/ping') return next();

  const { uuid, event_type } = req.body || {};
  if (!uuid || !event_type) return next();

  const now = Date.now();

  // 1. Global IP rate limit (prevents UUID flooding)
  const ip = getClientIp(req);
  const ipEntry = ipCounts.get(ip);
  if (ipEntry && (now - ipEntry.windowStart) < config.RATE_LIMIT.windowMs) {
    if (ipEntry.count >= config.RATE_LIMIT.maxPerIp) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retry_after: Math.ceil((config.RATE_LIMIT.windowMs - (now - ipEntry.windowStart)) / 1000)
      });
    }
    ipEntry.count++;
  } else {
    ipCounts.set(ip, { count: 1, windowStart: now });
  }

  // 2. Per-UUID-per-event dedup
  const key = `${uuid}:${event_type}`;
  const last = lastSeen.get(key);
  if (last && (now - last) < config.RATE_LIMIT.windowMs) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retry_after: Math.ceil((config.RATE_LIMIT.windowMs - (now - last)) / 1000)
    });
  }

  // 3. Enforce max map size to prevent memory exhaustion
  if (lastSeen.size >= config.RATE_LIMIT.maxMapSize) {
    cleanup(now);
  }

  lastSeen.set(key, now);
  next();
}

function cleanup(now) {
  for (const [key, ts] of lastSeen.entries()) {
    if ((now - ts) > config.RATE_LIMIT.windowMs) {
      lastSeen.delete(key);
    }
  }
  for (const [ip, entry] of ipCounts.entries()) {
    if ((now - entry.windowStart) > config.RATE_LIMIT.windowMs) {
      ipCounts.delete(ip);
    }
  }
}

// Periodic cleanup every 10 minutes
setInterval(() => cleanup(Date.now()), 10 * 60 * 1000);

module.exports = { rateLimitMiddleware };
