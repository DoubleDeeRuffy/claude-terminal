-- Events table: stores all telemetry events
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  arch TEXT NOT NULL,
  os_version TEXT,
  locale TEXT,
  metadata TEXT,
  country TEXT,
  city TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_events_uuid ON events(uuid);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_app_version ON events(app_version);

-- Unique users table: tracks first/last seen per UUID
CREATE TABLE IF NOT EXISTS unique_users (
  uuid TEXT PRIMARY KEY,
  first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  app_version TEXT,
  platform TEXT,
  arch TEXT,
  os_version TEXT,
  country TEXT,
  city TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_first_seen ON unique_users(first_seen);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON unique_users(last_seen);
CREATE INDEX IF NOT EXISTS idx_users_app_version ON unique_users(app_version);
CREATE INDEX IF NOT EXISTS idx_users_platform ON unique_users(platform);

-- Geo columns (added for location analytics)
-- ALTER TABLE is not idempotent in SQLite, handled in database.js migration logic
CREATE INDEX IF NOT EXISTS idx_events_country ON events(country);
CREATE INDEX IF NOT EXISTS idx_users_country ON unique_users(country);
