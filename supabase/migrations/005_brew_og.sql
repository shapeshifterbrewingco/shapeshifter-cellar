-- ============================================================
-- 005: Add original gravity to brews
-- ============================================================

-- Store OG on the brew so we can calculate attenuation and ABV
-- without having to join back to the recipe every time.
-- Pre-filled from recipe.target_og_plato when assigning a brew.

ALTER TABLE brews ADD COLUMN og_plato numeric(5,2);
