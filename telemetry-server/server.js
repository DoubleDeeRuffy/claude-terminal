const express = require('express');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./db/database');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const { validatePingPayload } = require('./middleware/validate');
const pingRoute = require('./routes/ping');
const statsRoute = require('./routes/stats');

const app = express();

// Parse JSON with size limit
app.use(express.json({ limit: '10kb' }));

// Rate limiting
app.use(rateLimitMiddleware);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Telemetry ping
app.post('/api/v1/ping', validatePingPayload, pingRoute);

// Admin stats
app.get('/api/v1/stats', statsRoute);

// Admin dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[Server] Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
try {
  initDatabase();
  app.listen(config.PORT, config.HOST, () => {
    console.log(`[Server] Telemetry server listening on ${config.HOST}:${config.PORT}`);
  });
} catch (err) {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
}
