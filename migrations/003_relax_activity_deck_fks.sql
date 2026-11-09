-- Forward-compatibility hardening for mixed persistence modes.
--
-- Older 002 drafts had replay_sessions.deck_id REFERENCES decks(id), and 001 had
-- events.deck_id REFERENCES decks(id). Activity/replay persistence stores a live
-- room snapshot and must keep working even if a room's deck was created by a
-- non-Postgres deck backend or later deleted. Drop only FKs that cover deck_id;
-- keep the informational deck_id column itself.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND rel.relname = 'replay_sessions'
      AND att.attname = 'deck_id'
  LOOP
    EXECUTE format('ALTER TABLE replay_sessions DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND rel.relname = 'events'
      AND att.attname = 'deck_id'
  LOOP
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;
