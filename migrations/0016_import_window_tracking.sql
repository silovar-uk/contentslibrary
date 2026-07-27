-- Phase 1-C: track when the import window was first enabled so that
-- auto-extension (sliding window) can be capped at an absolute maximum,
-- instead of extending forever.
ALTER TABLE import_controls ADD COLUMN enabled_since TEXT;

-- Phase 1-E / 5-7: record which path (browser vs. CI) produced a batch,
-- so future discrepancies can be traced without cross-referencing
-- audit_events by hand.
ALTER TABLE import_batches ADD COLUMN origin TEXT NOT NULL DEFAULT 'browser';
