CREATE TABLE f4t_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scraped_at TEXT NOT NULL,
  total_rooms INTEGER NOT NULL,
  total_participants INTEGER NOT NULL,
  UNIQUE(scraped_at)
);

CREATE TABLE f4t_rooms (
  snapshot_id INTEGER NOT NULL REFERENCES f4t_snapshots(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  topic TEXT,
  language TEXT NOT NULL,
  second_language TEXT,
  level TEXT,
  max_people INTEGER,
  current_people INTEGER NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0,
  no_mic INTEGER NOT NULL DEFAULT 0,
  room_url TEXT,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_verified INTEGER NOT NULL DEFAULT 0,
  owner_avatar TEXT,
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (snapshot_id, room_id)
);

CREATE TABLE f4t_participants (
  snapshot_id INTEGER NOT NULL REFERENCES f4t_snapshots(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  followers INTEGER,
  following INTEGER,
  friends INTEGER,
  supporter INTEGER,
  bio TEXT,
  PRIMARY KEY (snapshot_id, room_id, user_id)
);

CREATE TABLE f4t_daily_stats (
  day TEXT NOT NULL,
  language TEXT NOT NULL,
  avg_rooms INTEGER NOT NULL,
  peak_rooms INTEGER NOT NULL,
  peak_participants INTEGER NOT NULL,
  peak_hour INTEGER,
  unique_owners INTEGER NOT NULL,
  PRIMARY KEY (day, language)
);

CREATE INDEX idx_f4t_rooms_lang ON f4t_rooms(snapshot_id, language);
CREATE INDEX idx_f4t_rooms_owner ON f4t_rooms(owner_id);
CREATE INDEX idx_f4t_snapshots_scraped ON f4t_snapshots(scraped_at);
