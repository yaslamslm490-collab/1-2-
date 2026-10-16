CREATE TABLE IF NOT EXISTS owner_sessions (
  session_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_sessions_expiry_idx
  ON owner_sessions(expires_at);

CREATE TABLE IF NOT EXISTS owner_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);
