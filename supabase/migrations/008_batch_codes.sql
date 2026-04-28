-- ============================================================
-- 008: Batch codes on brews
-- ============================================================

ALTER TABLE brews ADD COLUMN batch_code text;

-- Unique but nullable (older brews won't have one)
CREATE UNIQUE INDEX brews_batch_code_idx ON brews(batch_code) WHERE batch_code IS NOT NULL;
