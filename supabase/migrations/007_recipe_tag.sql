-- ============================================================
-- 007: Add tag to recipes
-- ============================================================

ALTER TABLE recipes
  ADD COLUMN tag text CHECK (tag IN ('core', 'seasonal', 'limited', 'collaboration'));
