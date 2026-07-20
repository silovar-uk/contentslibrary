ALTER TABLE work_labels ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    wl.work_id,
    wl.label_id,
    ROW_NUMBER() OVER (
      PARTITION BY wl.work_id
      ORDER BY l.kind, l.normalized_name
    ) - 1 AS next_position
  FROM work_labels wl
  JOIN labels l ON l.id = wl.label_id
)
UPDATE work_labels
SET position = COALESCE((
  SELECT ranked.next_position
  FROM ranked
  WHERE ranked.work_id = work_labels.work_id
    AND ranked.label_id = work_labels.label_id
), 0);

CREATE INDEX IF NOT EXISTS idx_work_labels_work_position
ON work_labels(work_id, position);
