ALTER TABLE notes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE notes SET sort_order = rowid * 10 WHERE sort_order = 0;
CREATE INDEX IF NOT EXISTS idx_notes_work_sort ON notes(work_id, sort_order, created_at);

ALTER TABLE experiences ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
