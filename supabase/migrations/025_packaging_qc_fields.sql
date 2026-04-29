-- Packaging report QC readings + stock distribution (linked to packaging_splits per brew)
alter table packaging_splits
  add column if not exists best_before_date        date,
  add column if not exists bbt_temp_c              numeric(5,2),
  add column if not exists bbt_co2_vol             numeric(5,2),
  add column if not exists bbt_do_ppb              numeric(6,2),
  add column if not exists can_co2_vol             numeric(5,2),
  add column if not exists can_do_ppb              numeric(6,2),
  add column if not exists unders_sor              text,
  -- stock distribution: kegs and cartons going to each destination
  add column if not exists stock_venue_kegs        integer,
  add column if not exists stock_venue_cartons     integer,
  add column if not exists stock_options_kegs      integer,
  add column if not exists stock_options_cartons   integer,
  add column if not exists stock_sales_kegs        integer,
  add column if not exists stock_sales_cartons     integer;
