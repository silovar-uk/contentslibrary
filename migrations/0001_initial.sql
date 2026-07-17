PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  access_subject TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','suspended','blocked','removed')),
  suspended_until TEXT,
  blocked_at TEXT,
  blocked_by TEXT,
  blocked_reason TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  last_login_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member','viewer')),
  token_hash TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(email, used_at)
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email, expires_at, used_at);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('book','manga','movie','anime','drama','other')),
  title TEXT NOT NULL,
  creator TEXT,
  release_year INTEGER,
  status TEXT NOT NULL CHECK (status IN ('want','active','completed','paused','dropped')),
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
  FOREIGN KEY(owner_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_works_owner_updated ON works(owner_id, deleted_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_owner_type_status ON works(owner_id, type, status, deleted_at);

CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  rating REAL CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5.0)),
  progress_current REAL,
  progress_total REAL,
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
  UNIQUE(work_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_experiences_work ON experiences(work_id, sequence DESC);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  experience_id TEXT,
  note_type TEXT NOT NULL CHECK (note_type IN ('quick','summary','impression','quote','idea','connection','progress')),
  content TEXT NOT NULL,
  position TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY(experience_id) REFERENCES experiences(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_work_updated ON notes(work_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('genre','theme','tag')),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES members(id),
  UNIQUE(owner_id, kind, normalized_name)
);

CREATE TABLE IF NOT EXISTS work_labels (
  work_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  PRIMARY KEY(work_id, label_id),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY(label_id) REFERENCES labels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_work_labels_label ON work_labels(label_id, work_id);

CREATE TABLE IF NOT EXISTS work_relations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  source_work_id TEXT NOT NULL,
  target_work_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('same_theme','opposite','adaptation','association','series')),
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES members(id),
  FOREIGN KEY(source_work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY(target_work_id) REFERENCES works(id) ON DELETE CASCADE,
  CHECK(source_work_id <> target_work_id),
  UNIQUE(source_work_id, target_work_id, relation_type)
);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE(owner_id, name)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  target_id TEXT,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('critical','high','medium','info')),
  result TEXT,
  country TEXT,
  ip_mask TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  resolved_status TEXT NOT NULL DEFAULT 'open' CHECK (resolved_status IN ('open','confirmed','false_positive','resolved')),
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_open ON security_events(resolved_status, risk, created_at DESC);
