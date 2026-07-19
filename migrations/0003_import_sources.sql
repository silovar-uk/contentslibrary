ALTER TABLE works ADD COLUMN source_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_works_owner_source_key
ON works(owner_id, source_key)
WHERE source_key IS NOT NULL;
