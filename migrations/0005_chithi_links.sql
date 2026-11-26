CREATE TABLE f4t_chithi_targets (
  username TEXT PRIMARY KEY,
  profile_id TEXT,
  source TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  verified_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  last_sent_at INTEGER,
  last_quote TEXT,
  send_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX idx_f4t_chithi_targets_last_seen ON f4t_chithi_targets(last_seen_at DESC);
