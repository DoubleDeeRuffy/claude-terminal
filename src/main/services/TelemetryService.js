/**
 * TelemetryService
 * Anonymous usage tracking with opt-in consent.
 * Sends pings to the telemetry backend. Silent failure — never blocks the app.
 */

const https = require('https');
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');
const { settingsFile } = require('../utils/paths');

const TELEMETRY_URL = process.env.TELEMETRY_URL || 'https://telemetry.claudeterminal.dev';
const PING_PATH = '/api/v1/ping';
const TIMEOUT = 5000;

// Client-side rate limit: 1 ping per event_type per hour
const lastPingTimes = new Map();
const ONE_HOUR = 60 * 60 * 1000;

// ── Settings helpers ──

function loadSettings() {
  try {
    if (!fs.existsSync(settingsFile)) return null;
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    return null;
  }
}

function saveUuid(uuid) {
  try {
    const settings = loadSettings() || {};
    settings.telemetryUuid = uuid;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch {
    // silent
  }
}

// ── Core ──

function canSend(eventType) {
  const now = Date.now();
  const last = lastPingTimes.get(eventType);
  if (last && (now - last) < ONE_HOUR) return false;
  return true;
}

/**
 * Send a telemetry ping to the backend.
 * @param {string} eventType - e.g. "app:start", "features:terminal:create"
 * @param {Object} [metadata={}]
 */
function sendPing(eventType, metadata = {}) {
  try {
    const settings = loadSettings();
    if (!settings || !settings.telemetryEnabled) return;

    // Check category
    const category = eventType.split(':')[0];
    const categories = settings.telemetryCategories || { app: true, features: true, errors: true };
    if (!categories[category]) return;

    // Client rate limit
    if (!canSend(eventType)) return;

    // Ensure UUID
    let uuid = settings.telemetryUuid;
    if (!uuid) {
      uuid = randomUUID();
      saveUuid(uuid);
    }

    const payload = JSON.stringify({
      uuid,
      event_type: eventType,
      app_version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      os_version: `${os.type()} ${os.release()}`,
      locale: settings.language || app.getLocale() || 'en',
      metadata
    });

    const url = new URL(TELEMETRY_URL);

    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: PING_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': `ClaudeTerminal/${app.getVersion()}`
      },
      timeout: TIMEOUT
    }, (res) => {
      // Drain response
      res.resume();
      if (res.statusCode === 200 || res.statusCode === 201) {
        lastPingTimes.set(eventType, Date.now());
      }
    });

    req.on('error', () => {}); // silent
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  } catch {
    // silent — never block the app
  }
}

function sendStartupPing() {
  sendPing('app:start');
}

function sendQuitPing() {
  sendPing('app:quit');
}

function sendFeaturePing(feature, metadata = {}) {
  sendPing(`features:${feature}`, metadata);
}

function sendErrorPing(error) {
  sendPing('errors:uncaught', {
    message: error?.message || String(error),
    stack: error?.stack?.split('\n')[0] || ''
  });
}

function getStatus() {
  const settings = loadSettings();
  return {
    enabled: settings?.telemetryEnabled || false,
    uuid: settings?.telemetryUuid || null,
    categories: settings?.telemetryCategories || { app: true, features: true, errors: true }
  };
}

module.exports = {
  sendPing,
  sendStartupPing,
  sendQuitPing,
  sendFeaturePing,
  sendErrorPing,
  getStatus
};
