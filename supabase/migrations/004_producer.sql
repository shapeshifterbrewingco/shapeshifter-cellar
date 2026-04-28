-- ============================================================
-- 004: Add producer/manufacturer field to ingredient prices
-- ============================================================

-- Producer is who makes the ingredient (e.g. Weyermann, NZ Hops, Yakima Chief).
-- Supplier is who you buy it from (e.g. Bintani, Cryer Malt).
-- The same variety can come from multiple producers via the same supplier.

ALTER TABLE ingredient_prices ADD COLUMN producer text NOT NULL DEFAULT '';

-- Widen the unique constraint to allow same supplier + different producer
ALTER TABLE ingredient_prices DROP CONSTRAINT ingredient_prices_ingredient_id_supplier_key;

ALTER TABLE ingredient_prices ADD CONSTRAINT ingredient_prices_ingredient_id_supplier_producer_key
  UNIQUE (ingredient_id, supplier, producer);
