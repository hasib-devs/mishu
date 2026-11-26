CREATE TABLE IF NOT EXISTS f4t_chithi_quote_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  quote TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_f4t_chithi_quote_history_sent
  ON f4t_chithi_quote_history(sent_at DESC);

-- Carry over quotes already sent before this table existed.
INSERT INTO f4t_chithi_quote_history (username, quote, sent_at)
SELECT username, last_quote, COALESCE(last_sent_at, 0)
FROM f4t_chithi_targets
WHERE last_quote IS NOT NULL;
