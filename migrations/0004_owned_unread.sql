PRAGMA foreign_keys = OFF;

CREATE TABLE works_v08 (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('book','manga','movie','anime','drama','other')),
  title TEXT NOT NULL,
  creator TEXT,
  release_year INTEGER,
  status TEXT NOT NULL CHECK (status IN ('want','owned_unread','active','completed','paused','dropped')),
  rating REAL CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5.0)),
  short_note TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  progress_current REAL,
  progress_total REAL,
  unit_label TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  search_text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  source_key TEXT,
  FOREIGN KEY(owner_id) REFERENCES members(id)
);

INSERT INTO works_v08 (
  id, owner_id, type, title, creator, release_year, status, rating, short_note,
  visibility, progress_current, progress_total, unit_label, metadata_json,
  search_text, version, created_at, updated_at, deleted_at, source_key
)
SELECT
  id, owner_id, type, title, creator, release_year, status, rating, short_note,
  visibility, progress_current, progress_total, unit_label, metadata_json,
  search_text, version, created_at, updated_at, deleted_at, source_key
FROM works;

DROP TABLE works;
ALTER TABLE works_v08 RENAME TO works;

CREATE INDEX IF NOT EXISTS idx_works_owner_updated
ON works(owner_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_works_owner_type_status
ON works(owner_id, type, status, deleted_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_works_owner_source_key
ON works(owner_id, source_key)
WHERE source_key IS NOT NULL AND deleted_at IS NULL;

PRAGMA foreign_keys = ON;
