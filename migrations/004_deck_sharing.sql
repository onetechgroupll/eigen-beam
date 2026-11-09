-- Deck sharing / account team-light

ALTER TABLE decks ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS team_id TEXT;

UPDATE decks
SET visibility = 'private'
WHERE visibility IS NULL OR visibility NOT IN ('private', 'link', 'team');

UPDATE decks
SET team_id = NULL
WHERE visibility <> 'team';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'decks_visibility_check'
      AND conrelid = 'decks'::regclass
  ) THEN
    ALTER TABLE decks
      ADD CONSTRAINT decks_visibility_check CHECK (visibility IN ('private', 'link', 'team'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS decks_team_visible_updated_idx ON decks(team_id, updated_at DESC) WHERE visibility = 'team';
CREATE INDEX IF NOT EXISTS decks_link_visible_updated_idx ON decks(updated_at DESC) WHERE visibility = 'link';
