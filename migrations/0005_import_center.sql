PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS import_controls (
  owner_id TEXT PRIMARY KEY,
  enabled_until TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_filename TEXT,
  content_hash TEXT NOT NULL,
  expected_works INTEGER NOT NULL DEFAULT 0 CHECK (expected_works >= 0),
  expected_notes INTEGER NOT NULL DEFAULT 0 CHECK (expected_notes >= 0),
  staged_works INTEGER NOT NULL DEFAULT 0 CHECK (staged_works >= 0),
  staged_notes INTEGER NOT NULL DEFAULT 0 CHECK (staged_notes >= 0),
  insert_count INTEGER NOT NULL DEFAULT 0 CHECK (insert_count >= 0),
  merge_count INTEGER NOT NULL DEFAULT 0 CHECK (merge_count >= 0),
  skip_count INTEGER NOT NULL DEFAULT 0 CHECK (skip_count >= 0),
  conflict_count INTEGER NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  applied_works INTEGER NOT NULL DEFAULT 0 CHECK (applied_works >= 0),
  applied_notes INTEGER NOT NULL DEFAULT 0 CHECK (applied_notes >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','uploading','review','validated','committing','committed','failed','rolled_back')),
  error_message TEXT,
  created_at TEXT NOT NULL,
  validated_at TEXT,
  committed_at TEXT,
  rolled_back_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE(owner_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_import_batches_owner_updated
ON import_batches(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS import_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  source_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('book','manga','movie','anime','drama','other')),
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  creator TEXT,
  status TEXT NOT NULL CHECK (status IN ('want','owned_unread','active','completed','paused','dropped')),
  rating REAL CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5.0)),
  short_note TEXT,
  progress_current REAL,
  progress_total REAL,
  unit_label TEXT,
  labels_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_created_at TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'pending' CHECK (action IN ('pending','insert','merge','skip','conflict','applied','rolled_back')),
  existing_work_id TEXT,
  applied_work_id TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(existing_work_id) REFERENCES works(id) ON DELETE SET NULL,
  FOREIGN KEY(applied_work_id) REFERENCES works(id) ON DELETE SET NULL,
  UNIQUE(batch_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_import_items_batch_action
ON import_items(batch_id, action, ordinal);
CREATE INDEX IF NOT EXISTS idx_import_items_batch_source
ON import_items(batch_id, source_key);
CREATE INDEX IF NOT EXISTS idx_import_items_batch_title
ON import_items(batch_id, type, normalized_title);

CREATE TABLE IF NOT EXISTS import_notes (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  note_type TEXT NOT NULL CHECK (note_type IN ('quick','summary','impression','quote','idea','connection','progress')),
  content TEXT NOT NULL,
  position TEXT,
  source_created_at TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'pending' CHECK (action IN ('pending','insert','skip','applied','rolled_back')),
  applied_note_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES import_items(id) ON DELETE CASCADE,
  FOREIGN KEY(applied_note_id) REFERENCES notes(id) ON DELETE SET NULL,
  UNIQUE(item_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_import_notes_batch_action
ON import_notes(batch_id, action, item_id, ordinal);

CREATE TABLE IF NOT EXISTS import_conflicts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  item_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES import_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_import_conflicts_batch
ON import_conflicts(batch_id, created_at, id);

CREATE TABLE IF NOT EXISTS import_applied_changes (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  item_id TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('work','note','work_label')),
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('insert')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES import_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_import_changes_batch_reverse
ON import_applied_changes(batch_id, reversed_at, created_at DESC);
