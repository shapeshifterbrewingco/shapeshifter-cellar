-- Dissolved oxygen is read across several cans, so it is recorded as a low and a high.
-- The existing columns are the low reading; these are the high. Null = a single reading.
alter table packaging_reports add column if not exists pack_do_ppb_high numeric, add column if not exists bbt_do_ppb_high numeric;
