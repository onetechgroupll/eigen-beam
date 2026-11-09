-- eigen.beam Foundation persistence
-- Run with: bun run db:migrate (requires DATABASE_URL)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  slides JSONB NOT NULL,
  clone_of TEXT REFERENCES decks(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS decks_owner_updated_idx ON decks(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS deck_assets (
  id TEXT PRIMARY KEY,
  deck_id TEXT REFERENCES decks(id) ON DELETE CASCADE,
  bucket_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS deck_assets_deck_idx ON deck_assets(deck_id);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  deck_id TEXT REFERENCES decks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  slide INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_room_created_idx ON events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_type_created_idx ON events(type, created_at DESC);
