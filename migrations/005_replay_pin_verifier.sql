-- Keep PIN-protected replays unlockable after the in-memory room is gone.
-- The raw PIN is never persisted; this column stores an HMAC verifier.

ALTER TABLE replay_sessions ADD COLUMN IF NOT EXISTS pin_verifier TEXT;
