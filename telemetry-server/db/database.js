const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;

function initDatabase() {
  db = new Database(config.DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  const migrations = fs.readFileSync(path.join(__dirname, 'migrations.sql'), 'utf8');
  db.exec(migrations);

  console.log('[DB] Database initialized');
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function insertEvent(data) {
  const stmt = getDb().prepare(`
    INSERT INTO events (uuid, event_type, app_version, platform, arch, os_version, locale, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.uuid,
    data.event_type,
    data.app_version,
    data.platform,
    data.arch,
    data.os_version || null,
    data.locale || null,
    JSON.stringify(data.metadata || {})
  );
}

function upsertUser(data) {
  const stmt = getDb().prepare(`
    INSERT INTO unique_users (uuid, app_version, platform, arch, os_version)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (uuid)
    DO UPDATE SET
      last_seen = CURRENT_TIMESTAMP,
      app_version = excluded.app_version,
      platform = excluded.platform,
      arch = excluded.arch,
      os_version = excluded.os_version
  `);

  stmt.run(
    data.uuid,
    data.app_version,
    data.platform,
    data.arch,
    data.os_version || null
  );
}

function getStats() {
  const d = getDb();

  const totalUsers = d.prepare('SELECT COUNT(*) as count FROM unique_users').get();

  const active24h = d.prepare(`
    SELECT COUNT(*) as count FROM unique_users
    WHERE last_seen >= datetime('now', '-1 day')
  `).get();

  const active7d = d.prepare(`
    SELECT COUNT(*) as count FROM unique_users
    WHERE last_seen >= datetime('now', '-7 days')
  `).get();

  const active30d = d.prepare(`
    SELECT COUNT(*) as count FROM unique_users
    WHERE last_seen >= datetime('now', '-30 days')
  `).get();

  const platforms = d.prepare(`
    SELECT platform, COUNT(*) as count
    FROM unique_users
    GROUP BY platform
    ORDER BY count DESC
  `).all();

  const versions = d.prepare(`
    SELECT app_version, COUNT(*) as count
    FROM unique_users
    GROUP BY app_version
    ORDER BY count DESC
  `).all();

  const topEvents = d.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM events
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY event_type
    ORDER BY count DESC
    LIMIT 20
  `).all();

  const newUsersPerDay = d.prepare(`
    SELECT date(first_seen) as day, COUNT(*) as count
    FROM unique_users
    WHERE first_seen >= datetime('now', '-30 days')
    GROUP BY date(first_seen)
    ORDER BY day DESC
  `).all();

  const activeUsersPerDay = d.prepare(`
    SELECT date(last_seen) as day, COUNT(*) as count
    FROM unique_users
    WHERE last_seen >= datetime('now', '-30 days')
    GROUP BY date(last_seen)
    ORDER BY day DESC
  `).all();

  return {
    users: {
      total: totalUsers.count,
      active_24h: active24h.count,
      active_7d: active7d.count,
      active_30d: active30d.count
    },
    platforms,
    versions,
    top_events: topEvents,
    new_users_per_day: newUsersPerDay,
    active_users_per_day: activeUsersPerDay
  };
}

module.exports = { initDatabase, getDb, insertEvent, upsertUser, getStats };
