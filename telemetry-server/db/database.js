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

  // Add geo columns to existing tables (ALTER TABLE is not idempotent in SQLite)
  const addColumn = (table, column, type) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (_) { /* column already exists */ }
  };
  addColumn('events', 'country', 'TEXT');
  addColumn('events', 'city', 'TEXT');
  addColumn('unique_users', 'country', 'TEXT');
  addColumn('unique_users', 'city', 'TEXT');

  console.log('[DB] Database initialized');
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function insertEvent(data) {
  const stmt = getDb().prepare(`
    INSERT INTO events (uuid, event_type, app_version, platform, arch, os_version, locale, metadata, country, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.uuid,
    data.event_type,
    data.app_version,
    data.platform,
    data.arch,
    data.os_version || null,
    data.locale || null,
    JSON.stringify(data.metadata || {}),
    data.country || null,
    data.city || null
  );
}

function upsertUser(data) {
  const stmt = getDb().prepare(`
    INSERT INTO unique_users (uuid, app_version, platform, arch, os_version, country, city)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (uuid)
    DO UPDATE SET
      last_seen = CURRENT_TIMESTAMP,
      app_version = excluded.app_version,
      platform = excluded.platform,
      arch = excluded.arch,
      os_version = excluded.os_version,
      country = excluded.country,
      city = excluded.city
  `);

  stmt.run(
    data.uuid,
    data.app_version,
    data.platform,
    data.arch,
    data.os_version || null,
    data.country || null,
    data.city || null
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

  const countries = d.prepare(`
    SELECT country, COUNT(*) as count
    FROM unique_users
    WHERE country IS NOT NULL
    GROUP BY country
    ORDER BY count DESC
  `).all();

  const cities = d.prepare(`
    SELECT city, country, COUNT(*) as count
    FROM unique_users
    WHERE city IS NOT NULL
    GROUP BY city, country
    ORDER BY count DESC
    LIMIT 30
  `).all();

  // Feature trends: daily event counts per feature (last 14 days)
  const featureTrends = d.prepare(`
    SELECT date(created_at) as day, event_type, COUNT(*) as count
    FROM events
    WHERE created_at >= datetime('now', '-14 days')
      AND event_type LIKE 'features:%'
    GROUP BY date(created_at), event_type
    ORDER BY day ASC, count DESC
  `).all();

  // Session duration: average from app:quit metadata (last 7 days)
  const sessionDurations = d.prepare(`
    SELECT json_extract(metadata, '$.session_duration_min') as duration_min
    FROM events
    WHERE event_type = 'app:quit'
      AND created_at >= datetime('now', '-7 days')
      AND json_extract(metadata, '$.session_duration_min') IS NOT NULL
  `).all();

  const durations = sessionDurations.map(r => r.duration_min).filter(d => typeof d === 'number');
  const avgSessionMin = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const medianSessionMin = durations.length > 0 ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)] : 0;

  // Cohort: first_seen_version distribution (from app:start metadata)
  const cohorts = d.prepare(`
    SELECT json_extract(metadata, '$.first_seen_version') as cohort_version, COUNT(DISTINCT uuid) as count
    FROM events
    WHERE event_type = 'app:start'
      AND json_extract(metadata, '$.first_seen_version') IS NOT NULL
    GROUP BY cohort_version
    ORDER BY count DESC
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
    countries,
    cities,
    top_events: topEvents,
    new_users_per_day: newUsersPerDay,
    active_users_per_day: activeUsersPerDay,
    feature_trends: featureTrends,
    session_duration: {
      avg_min: avgSessionMin,
      median_min: medianSessionMin,
      sample_size: durations.length
    },
    cohorts
  };
}

module.exports = { initDatabase, getDb, insertEvent, upsertUser, getStats };
