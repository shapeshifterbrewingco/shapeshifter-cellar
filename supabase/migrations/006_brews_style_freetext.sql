-- ============================================================
-- 006: Make brews.style free text (drop beer_styles FK)
-- ============================================================
-- The FK was too strict — custom styles and imported recipe styles
-- aren't guaranteed to be in beer_styles.

ALTER TABLE brews DROP CONSTRAINT IF EXISTS brews_style_fkey;
