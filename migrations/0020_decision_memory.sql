CREATE TABLE IF NOT EXISTS decision_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  client_key TEXT NOT NULL,
  work_id TEXT,
  title_snapshot TEXT NOT NULL,
  creator_snapshot TEXT,
  slot TEXT NOT NULL CHECK (slot IN ('priority','remember','wildcard')),
  reason TEXT,
  scope TEXT NOT NULL DEFAULT 'next',
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE SET NULL,
  UNIQUE(owner_id, client_key)
);

CREATE INDEX IF NOT EXISTS idx_decision_events_owner_decided
  ON decision_events(owner_id, decided_at DESC);
