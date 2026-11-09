-- Durable replay + follow/retention storage

CREATE TABLE IF NOT EXISTS replay_sessions (
  room_id TEXT PRIMARY KEY,
  deck_id TEXT,
  slides JSONB NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  ended BOOLEAN NOT NULL DEFAULT FALSE,
  protected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

ALTER TABLE replay_sessions ADD COLUMN IF NOT EXISTS protected BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS replay_sessions_updated_idx ON replay_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  email TEXT NOT NULL,
  deck_id TEXT NOT NULL DEFAULT '',
  room_id TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  PRIMARY KEY (email, deck_id, room_id)
);

CREATE INDEX IF NOT EXISTS follows_created_idx ON follows(created_at DESC);
